import { beforeEach, describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { createCanonService, registerCanon } from '@/modules/canon/service';
import { createCodexService, registerCodex } from '@/modules/codex/service';
import { createContinuityService, registerContinuity } from '@/modules/continuity/service';
import { createManuscriptService, registerManuscript } from '@/modules/manuscript/service';
import type { StoryNode } from '@/modules/manuscript/types';
import { createPlotService, registerPlot } from '@/modules/plot/service';
import { createProgressionService, registerProgression } from '@/modules/progression/service';
import { createProjectService } from '@/modules/projects/service';
import { createRelationshipService, registerRelationships } from '@/modules/relationships/service';
import { createTimelineService, registerTimeline } from '@/modules/timeline/service';
import type { Consequence } from './analyze';
import { createConsequenceService } from './service';

let n = 0;
function setup() {
  const db = new NovelDB(`consequences-${++n}`);
  const registry = createProjectRegistry();
  const projects = createProjectService(db, registry);
  registerManuscript(registry);
  registerCodex(registry);
  registerRelationships(registry);
  registerTimeline(registry);
  registerPlot(registry);
  registerCanon(registry);
  registerContinuity(registry);
  registerProgression(registry);
  const changed = projects.contentChanged;
  return {
    db, projects, manuscript: createManuscriptService(db, changed), codex: createCodexService(db, changed), relationships: createRelationshipService(db, changed), timeline: createTimelineService(db, changed),
    plot: createPlotService(db, changed), canon: createCanonService(db, changed), continuity: createContinuityService(db, changed), progression: createProgressionService(db, changed), consequences: createConsequenceService(db),
  };
}
let app: ReturnType<typeof setup>;
beforeEach(() => {
  app = setup();
});

type Inline = string | { link: string; text: string };
const doc = (...paragraphs: Inline[][]) => ({
  type: 'doc',
  content: paragraphs.map((parts) => ({ type: 'paragraph', content: parts.map((p) => (typeof p === 'string' ? { type: 'text', text: p } : { type: 'text', text: p.text, marks: [{ type: 'entityLink', attrs: { entryId: p.link } }] })) })),
});

/**
 * Chapter 25: Alex joins the Hero Association. Around it: the HQ he gains
 * access to, the badge he is given, an ally made, a thread set in motion,
 * and chapters afterwards that lean on all of it.
 */
async function world() {
  const { projects, manuscript, codex, relationships, timeline, plot, canon, continuity, progression } = app;
  const p = await projects.create({ title: 'Heroes' });
  const m = manuscript.forProject(p.id);
  const c = codex.forProject(p.id);
  const [alex, marcus, vera] = [await c.create('character', 'Alex'), await c.create('character', 'Marcus'), await c.create('character', 'Vera')];
  const [hq, docks] = [await c.create('location', 'Association HQ'), await c.create('location', 'The Docks')];
  const [badge, guild] = [await c.create('item', 'Silver Badge'), await c.create('faction', 'Hero Association')];
  const chapters = new Map<number, StoryNode>();
  const write = async (number: number, ...paragraphs: Inline[][]) => {
    const chapter = chapters.get(number) ?? (await m.create('chapter', null, `Chapter ${number}`));
    chapters.set(number, chapter);
    await m.saveDoc(chapter.id, doc(...paragraphs), { words: 5, characters: 20 });
    return chapter;
  };
  await write(20, ['Alex trained alone at The Docks.']);
  await write(25, ['The offer came at dawn.'], [{ link: alex.id, text: 'Alex' }, ' signed, and Marcus handed him the Silver Badge at Association HQ.']);
  await write(26, ['Rain all day. Nobody came.']);
  await write(30, ['Vera watched the harbour.']);
  await write(32, ['The first report arrived.'], ['Alex met Marcus on the roof to talk about the demons.']);
  await write(40, ['He showed the Silver Badge at the gate of Association HQ.']);
  const at = (number: number) => chapters.get(number)!.id;

  // Records tied to chapter 25
  const investigation = await plot.forProject(p.id).create('Demon Investigation');
  await plot.forProject(p.id).update(investigation.id, { status: 'active', characterIds: [alex.id] });
  const joined = await plot.forProject(p.id).addBeat(investigation.id, { title: 'Alex is recruited', nodeId: at(25) });
  await plot.forProject(p.id).addBeat(investigation.id, { title: 'First demon report', nodeId: at(32) });
  const romance = await plot.forProject(p.id).create('Harbour Romance');
  await plot.forProject(p.id).update(romance.id, { status: 'active', characterIds: [marcus.id, vera.id] });
  await plot.forProject(p.id).addBeat(romance.id, { title: 'A glance', nodeId: at(30) });
  const resolved = await plot.forProject(p.id).create('Old Debt');
  await plot.forProject(p.id).update(resolved.id, { status: 'resolved', characterIds: [alex.id] });
  await plot.forProject(p.id).addBeat(resolved.id, { title: 'Paid', nodeId: at(40) });
  const unrelated = await plot.forProject(p.id).create('Lighthouse Mystery');
  await plot.forProject(p.id).update(unrelated.id, { status: 'active', characterIds: [vera.id] });
  await plot.forProject(p.id).addBeat(unrelated.id, { title: 'A light', nodeId: at(30) });

  const bond = await relationships.forProject(p.id).create(alex.id, marcus.id, 'friends');
  const [first] = (await relationships.forProject(p.id).get(bond.id))!.stages;
  await relationships.forProject(p.id).updateStage(bond.id, first.id, { startNodeId: at(25), title: 'Partners', event: 'paired by the Association' });
  await relationships.forProject(p.id).addStage(bond.id, at(40));
  const latest = (await relationships.forProject(p.id).get(bond.id))!.stages.at(-1)!;
  await relationships.forProject(p.id).updateStage(bond.id, latest.id, { title: 'Sworn brothers' });

  const before = await progression.forProject(p.id).create(alex.id, { nodeId: at(20), label: 'Unaffiliated' });
  const after = await progression.forProject(p.id).create(alex.id, { nodeId: at(25), label: 'Recruit' });
  await progression.forProject(p.id).update(after.id, (s) => ({ gear: [{ id: '', name: 'Silver Badge', kind: 'Key item', entryId: badge.id, note: '' }], status: { ...s.status, reputation: 'Hero Association: member' } }));
  await progression.forProject(p.id).create(alex.id, { nodeId: at(40), label: 'Veteran' });

  await continuity.forProject(p.id).createRule('possession', { entryId: badge.id, state: 'held', holderId: alex.id, fromNodeId: at(25) });
  await continuity.forProject(p.id).createRule('status', { entryId: marcus.id, state: 'deceased', fromNodeId: at(40) });

  const access = await canon.forProject(p.id).create({ subject: 'HQ access', statement: 'Only badge holders may enter Association HQ', status: 'canon', entryIds: [hq.id] });
  await canon.forProject(p.id).addSource(access.id, { type: 'chapter', refId: at(25) });
  const origin = await canon.forProject(p.id).create({ subject: 'Alex’s origin', statement: 'Alex grew up on the docks', status: 'canon', entryIds: [alex.id] });
  await canon.forProject(p.id).addSource(origin.id, { type: 'chapter', refId: at(20) });
  await canon.forProject(p.id).create({ subject: 'Tides', statement: 'Two a day', status: 'canon', entryIds: [docks.id] });

  const ceremony = await timeline.forProject(p.id).create('The Induction');
  await timeline.forProject(p.id).update(ceremony.id, { nodeIds: [at(25)], characters: [{ id: alex.id, age: null }], locationId: hq.id, entryIds: [guild.id] });
  const raid = await timeline.forProject(p.id).create('The Harbour Raid');
  await timeline.forProject(p.id).update(raid.id, { nodeIds: [at(40)], characters: [{ id: alex.id, age: null }], afterId: ceremony.id });
  const feast = await timeline.forProject(p.id).create('The Feast');
  await timeline.forProject(p.id).update(feast.id, { nodeIds: [at(30)], characters: [{ id: vera.id, age: null }] });

  const run = (subject: Parameters<typeof app.consequences.forProject>[0] extends string ? Parameters<ReturnType<typeof app.consequences.forProject>['analyze']>[0] : never, options?: { include?: string[]; exclude?: string[] }) => app.consequences.forProject(p.id).analyze(subject, options);
  return { p, m, alex, marcus, vera, hq, docks, badge, guild, at, investigation, joined, bond, before, after, ceremony, raid, run };
}

const lines = (items: Consequence[]) => items.map((c) => c.message);
const kinds = (items: Consequence[]) => items.map((c) => c.kind).sort();

describe('analysing a chapter', () => {
  it('lists as established only what is recorded at that exact point', async () => {
    const { at, run } = await world();
    const report = await run({ type: 'node', nodeId: at(25) });
    expect(report.title).toBe('Chapter 25');
    expect(lines(report.established)).toEqual([
      'The thread “Demon Investigation” has its development “Alex is recruited” recorded in Chapter 25.',
      'Alex and Marcus become “Partners” starting in Chapter 25 (paired by the Association).',
      'Alex’s state “Recruit” is logged at Chapter 25: receives Silver Badge; now “Hero Association: member”.',
      'Silver Badge is tracked as held by Alex from Chapter 25.',
      'The canon fact “HQ access: Only badge holders may enter Association HQ” cites Chapter 25 as its only source.',
      'The event “The Induction” is told in Chapter 25.',
      'Association HQ first appears in Chapter 25, and is named in 1 later chapter or scene.',
      'Marcus first appears in Chapter 25, and is named in 1 later chapter or scene.',
      'Silver Badge first appears in Chapter 25, and is named in 1 later chapter or scene.',
    ]);
    expect(report.established.every((c) => c.tier === 'established' && c.basis)).toBe(true);
    // Alex was already in chapter 20: not a first appearance.
    expect(lines(report.established).some((l) => l.startsWith('Alex first appears'))).toBe(false);
  });

  it('lists as potential what comes later and involves the same people, places and threads', async () => {
    const { at, run } = await world();
    const report = await run({ type: 'node', nodeId: at(25) });
    expect(lines(report.potential)).toEqual([
      'Chapter 32 involves Alex and Marcus and may need to account for the change.',
      'Chapter 40 involves Association HQ and Silver Badge and may need to account for the change.',
      'The open thread “Harbour Romance” involves Marcus and develops in Chapter 30; it could be affected.',
      'The thread “Demon Investigation” continues in Chapter 32; that development may lack what set it in motion.',
      'Alex and Marcus become “Sworn brothers” in Chapter 40; that turn may rest on what happens here.',
      'Alex has 1 later snapshot (Chapter 40) that carry forward from this point and may need revisiting.',
      'A tracked rule about Marcus takes effect in Chapter 40; it may assume what happens here.',
      'The canon fact “Alex’s origin: Alex grew up on the docks” is about Alex; check that it still holds.',
      'The event “The Harbour Raid”, told in Chapter 40, involves Alex and might play out differently.',
    ]);
    // Every one of them is worded as a possibility.
    expect(report.potential.every((c) => c.tier === 'potential' && /\b(may|could|might|check)\b/.test(c.message))).toBe(true);
    // Chapters that involve none of them, earlier chapters, finished threads and unrelated ones are left out.
    const all = lines([...report.established, ...report.potential]).join('\n');
    for (const absent of ['Chapter 26', 'Chapter 20 involves', 'Old Debt', 'Lighthouse Mystery', 'The Feast', 'Tides']) expect(all).not.toContain(absent);
  });

  it('points at the line where a later chapter picks the matter up', async () => {
    const { at, run } = await world();
    const report = await run({ type: 'node', nodeId: at(25) });
    const [ch32, ch40] = report.potential.filter((c) => c.kind === 'appearance');
    expect(ch32).toMatchObject({ target: { type: 'node', nodeId: at(32), block: 1, term: 'Alex' }, excerpt: 'Alex met Marcus on the roof to talk about the demons.', match: 'Alex' });
    expect(ch40.target).toMatchObject({ nodeId: at(40), block: 0, term: 'Silver Badge' });
    expect(report.established.find((c) => c.kind === 'character-state')!.target).toMatchObject({ type: 'snapshot' });
  });

  it('sums up what is affected', async () => {
    const { at, run } = await world();
    const report = await run({ type: 'node', nodeId: at(25) });
    expect(report.summaryLine).toBe('2 Characters, 1 Location, 1 Lore Entry, 2 Plot Threads, 2 Chapters, 1 Relationship, 2 Events, 2 Canon Facts');
    expect(report.seeds.map((s) => s.name)).toEqual(['Alex', 'Association HQ', 'Marcus', 'Silver Badge']);
    expect(report.downstream).toBe(4);
  });

  it('lets the author say who else the change touches, or who it does not', async () => {
    const { at, run, vera, marcus, guild } = await world();
    const wider = await run({ type: 'node', nodeId: at(25) }, { include: [vera.id, guild.id], exclude: [marcus.id] });
    expect(wider.seeds.map((s) => s.name)).toEqual(['Alex', 'Association HQ', 'Hero Association', 'Silver Badge', 'Vera']);
    expect(wider.suggested.map((s) => s.name)).toEqual(['Alex', 'Association HQ', 'Marcus', 'Silver Badge']);
    const potential = lines(wider.potential);
    expect(potential).toContain('Chapter 30 involves Vera and may need to account for the change.');
    expect(potential).toContain('The open thread “Lighthouse Mystery” involves Vera and develops in Chapter 30; it could be affected.');
    expect(potential).toContain('Chapter 32 involves Alex and may need to account for the change.');
    expect(potential.some((l) => l.includes('tracked rule about Marcus'))).toBe(false);
    // What is recorded at the chapter does not depend on who the author adds.
    expect(lines(wider.established).filter((l) => !l.includes('first appears'))).toEqual(lines((await run({ type: 'node', nodeId: at(25) })).established).filter((l) => !l.includes('first appears')));
  });

  it('covers every chapter inside a volume, and says so when nothing depends on a chapter', async () => {
    const { m, at, run } = await world();
    const quiet = await run({ type: 'node', nodeId: at(26) });
    expect([quiet.established, quiet.potential, quiet.summaryLine]).toEqual([[], [], 'Nothing recorded depends on this']);
    const volume = await m.create('volume', null, 'Book Two');
    await m.move(volume.id, null, at(25));
    await m.move(at(25), volume.id);
    await m.move(at(26), volume.id);
    const report = await run({ type: 'node', nodeId: volume.id });
    expect([report.title, report.anchorIds.length]).toEqual(['Book Two', 2]);
    expect(kinds(report.established)).toEqual(kinds((await run({ type: 'node', nodeId: at(25) })).established));
    expect((await run({ type: 'node', nodeId: 'nope' })).found).toBe(false);
  });
});

describe('analysing an event or a development', () => {
  it('follows an event to where it is told, what is dated from it, and who was there', async () => {
    const { at, run, ceremony } = await world();
    const report = await run({ type: 'event', eventId: ceremony.id });
    expect(report.title).toBe('the event “The Induction”');
    expect(report.seeds.map((s) => s.name)).toEqual(['Alex', 'Association HQ', 'Hero Association']);
    expect(lines(report.established)).toContain('Chapter 25 is where this event is told.');
    expect(lines(report.established)).toContain('The event “The Harbour Raid” is set to come after this one.');
    expect(lines(report.potential)).toContain('Chapter 40 involves Association HQ and may need to account for the change.');
    expect(report.potential.every((c) => c.nodeId !== at(25) && c.nodeId !== at(20))).toBe(true);
  });

  it('follows a thread\'s development to the steps that come after it', async () => {
    const { run, investigation, joined } = await world();
    const report = await run({ type: 'beat', threadId: investigation.id, beatId: joined.id });
    expect(report.title).toBe('“Alex is recruited” in the thread “Demon Investigation”');
    expect(lines(report.established)).toContain('“First demon report” in Chapter 32 is the thread’s next recorded step after this one.');
    expect(report.seeds.map((s) => s.name)).toEqual(['Alex']);
    expect(lines(report.potential)).toContain('Chapter 32 involves Alex and may need to account for the change.');
    expect((await run({ type: 'beat', threadId: investigation.id, beatId: 'nope' })).found).toBe(false);
  });
});

describe('analytical boundaries', () => {
  it('reads only: nothing in the project changes, however often it is run', async () => {
    const { at, run, ceremony, investigation, joined, vera } = await world();
    const dump = async () => JSON.stringify(await Promise.all(app.db.tables.map((table) => table.toArray())));
    const before = await dump();
    for (let i = 0; i < 2; i++) {
      await run({ type: 'node', nodeId: at(25) }, { include: [vera.id] });
      await run({ type: 'event', eventId: ceremony.id });
      await run({ type: 'beat', threadId: investigation.id, beatId: joined.id });
    }
    expect(await dump()).toBe(before);
  });

  it('never files a possibility as established, or a record as a possibility', async () => {
    const { at, run } = await world();
    const report = await run({ type: 'node', nodeId: at(25) });
    const keys = (items: Consequence[]) => new Set(items.map((c) => c.key));
    expect([...keys(report.established)].filter((k) => keys(report.potential).has(k))).toEqual([]);
    // Established items all rest on a record at chapter 25 itself; potential ones never point at it.
    expect(report.established.every((c) => /Chapter 25|first appears in Chapter 25/.test(c.message))).toBe(true);
    expect(report.potential.every((c) => c.nodeId !== at(25))).toBe(true);
    expect(new Set(report.established.map((c) => c.key)).size).toBe(report.established.length);
  });

  it('stays inside its project', async () => {
    const { at } = await world();
    const other = await app.projects.create({ title: 'Other' });
    const report = await app.consequences.forProject(other.id).analyze({ type: 'node', nodeId: at(25) });
    expect([report.found, report.established, report.potential]).toEqual([false, [], []]);
  });
});
