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
import { stateAt } from '@/modules/progression/state';
import { createProgressService, registerProgress } from '@/modules/progress/service';
import { createProjectService } from '@/modules/projects/service';
import { createRelationshipService, registerRelationships } from '@/modules/relationships/service';
import { SYSTEM_PRESETS } from '@/modules/systems/presets';
import { createSystemsService, registerSystems } from '@/modules/systems/service';
import { createTimelineService, registerTimeline } from '@/modules/timeline/service';
import { createBranchingService } from './service';
import { buildFamilies, flattenFamily } from './tree';

let n = 0;
function setup() {
  const db = new NovelDB(`branching-${++n}`);
  const registry = createProjectRegistry();
  const projects = createProjectService(db, registry);
  registerProgress(registry);
  registerManuscript(registry);
  registerCodex(registry);
  registerRelationships(registry);
  registerTimeline(registry);
  registerPlot(registry);
  registerCanon(registry);
  registerContinuity(registry);
  registerSystems(registry);
  registerProgression(registry);
  const progress = createProgressService(db);
  const manuscript = createManuscriptService(db, projects.contentChanged, progress.recordWriting);
  const changed = projects.contentChanged;
  return {
    db, projects, manuscript, codex: createCodexService(db, changed), relationships: createRelationshipService(db, changed), timeline: createTimelineService(db, changed), plot: createPlotService(db, changed),
    canon: createCanonService(db, changed), continuity: createContinuityService(db, changed), systems: createSystemsService(db, changed), progression: createProgressionService(db, changed),
    branching: createBranchingService(db, projects, manuscript),
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
const textOf = (value: unknown): string => JSON.stringify(value).match(/"text":"([^"]*)"/g)?.map((m) => m.slice(8, -1)).join('') ?? '';
/** Everything a project owns, in a form that can be compared before and after. */
async function dump(projectId: string): Promise<string> {
  const { db } = app;
  const tables = db.tables.filter((t) => t.schema.indexes.some((i) => i.name === 'projectId') && !['searchBlocks', 'searchState', 'projectStats'].includes(t.name));
  const rows = await Promise.all(tables.map(async (t) => [t.name, (await t.where('projectId').equals(projectId).toArray()).sort((a, b) => String(a.id).localeCompare(String(b.id)))]));
  return JSON.stringify(rows);
}

/** A novel of six chapters with something from every module spread along it. */
async function world() {
  const { projects, manuscript, codex, relationships, timeline, plot, canon, continuity, systems, progression } = app;
  const p = await projects.create({ title: 'Ashfall' });
  const m = manuscript.forProject(p.id);
  const c = codex.forProject(p.id);
  const alex = await c.create('character', 'Alex');
  const mira = await c.create('character', 'Mira');
  const bren = await c.create('character', 'Bren');
  const blade = await c.create('item', 'Sunblade');
  const chapters: StoryNode[] = [];
  for (let i = 1; i <= 6; i++) {
    const chapter = await m.create('chapter', null, `Chapter ${i}`);
    await m.saveDoc(chapter.id, doc([`Text of chapter ${i}. `, { link: alex.id, text: 'Alex' }, ' walks on.']), { words: 7, characters: 30 });
    chapters.push((await m.list()).find((x) => x.id === chapter.id)!);
  }
  const at = (chapter: number) => chapters[chapter - 1].id;

  const bond = await relationships.forProject(p.id).create(alex.id, mira.id, 'friends');
  await relationships.forProject(p.id).addStage(bond.id, at(5));
  const feud = await relationships.forProject(p.id).create(mira.id, bren.id, 'friends');
  const [onlyStage] = (await relationships.forProject(p.id).get(feud.id))!.stages;
  await relationships.forProject(p.id).updateStage(feud.id, onlyStage.id, { startNodeId: at(4) });

  const thread = await plot.forProject(p.id).create('The Missing Prince');
  await plot.forProject(p.id).update(thread.id, { status: 'active', targetNodeId: at(6), characterIds: [alex.id] });
  for (const chapter of [1, 3, 5]) await plot.forProject(p.id).addBeat(thread.id, { title: `Beat ${chapter}`, nodeId: at(chapter) });

  const fact = await canon.forProject(p.id).create({ subject: 'Founding', statement: '500 years ago', status: 'canon', entryIds: [alex.id] });
  await canon.forProject(p.id).addSource(fact.id, { type: 'chapter', refId: at(2) });
  await canon.forProject(p.id).addSource(fact.id, { type: 'chapter', refId: at(5) });
  await canon.forProject(p.id).addSource(fact.id, { type: 'entry', refId: alex.id });

  await continuity.forProject(p.id).createRule('status', { entryId: mira.id, state: 'deceased', fromNodeId: at(5) });
  await continuity.forProject(p.id).createRule('possession', { entryId: blade.id, state: 'lost', fromNodeId: at(2), untilNodeId: at(4) });

  const event = await timeline.forProject(p.id).create('The Siege');
  await timeline.forProject(p.id).update(event.id, { nodeIds: [at(2), at(6)] });

  const game = await systems.forProject(p.id).create(SYSTEM_PRESETS[0].content);
  await systems.forProject(p.id).addSheet(game.id, alex.id);
  const level = game.tracks[0].id;
  for (const [chapter, value] of [[1, 2], [3, 30], [5, 60]] as const) {
    const snapshot = await progression.forProject(p.id).create(alex.id, { nodeId: at(chapter), label: `Level ${value}` });
    await progression.forProject(p.id).update(snapshot.id, (s) => ({ systems: { ...s.systems, [game.id]: { ...s.systems[game.id], progress: { [level]: value } } }, gear: chapter >= 3 ? [{ id: '', name: 'Sunblade', kind: 'Weapon', entryId: blade.id, note: '' }] : [] }));
  }
  return { p, m, c, alex, mira, blade, chapters, at, thread, fact, game, level };
}

describe('forking a timeline', () => {
  it('inherits the manuscript and every module\'s state as they stood at the fork point', async () => {
    const { p, at, alex, level } = await world();
    const { db, branching, manuscript, codex, relationships, plot, canon, continuity, timeline, systems, progression } = app;
    const branch = await branching.fork(p.id, at(3), { name: 'Villain Victory', status: 'non-canon', note: 'What if Mira lost?' });
    expect(branch).toMatchObject({ title: 'Villain Victory' });
    expect(branch.id).not.toBe(p.id);

    // Manuscript: chapters 1 to 3, with their text.
    const nodes = await manuscript.forProject(branch.id).list();
    expect(nodes.map((x) => x.title).sort()).toEqual(['Chapter 1', 'Chapter 2', 'Chapter 3']);
    const third = nodes.find((x) => x.title === 'Chapter 3')!;
    expect(textOf(await manuscript.forProject(branch.id).loadDoc(third.id))).toBe('Text of chapter 3. Alex walks on.');
    expect((await db.projectStats.get(branch.id))!.wordCount).toBe(21);

    // Worldbuilding: the whole codex, and links in the text point at the branch's own entries.
    const entries = await codex.forProject(branch.id).list();
    const alexHere = entries.find((e) => e.name === 'Alex')!;
    expect(entries.map((e) => e.name).sort()).toEqual(['Alex', 'Bren', 'Mira', 'Sunblade']);
    expect(alexHere.id).not.toBe(alex.id);
    expect(JSON.stringify(await manuscript.forProject(branch.id).loadDoc(third.id))).toContain(alexHere.id);

    // Relationships as they stood: the later stage has not happened; a bond that only begins later does not exist.
    const relations = await relationships.forProject(branch.id).list();
    expect(relations.map((r) => r.stages.length)).toEqual([1]);

    // Plot threads with the developments reached so far.
    const [thread] = await plot.forProject(branch.id).list();
    expect([thread.status, thread.beats.map((b) => b.title), thread.targetNodeId, thread.characterIds]).toEqual(['active', ['Beat 1', 'Beat 3'], null, [alexHere.id]]);

    // Canon, with its history; the source in a chapter that is not here is left behind.
    const [fact] = await canon.forProject(branch.id).list();
    expect([fact.statement, fact.status, fact.sources.map((s) => s.type), fact.history.length]).toEqual(['500 years ago', 'canon', ['chapter', 'entry'], 1]);

    // Tracked rules: Mira's death in chapter 5 has not happened; the blade is lost and has not been found again.
    const rules = await continuity.forProject(branch.id).rules();
    expect(rules.map((r) => [r.kind, r.untilNodeId])).toEqual([['possession', null]]);

    // The world's own chronology is whole; it just no longer points at chapters that are not here.
    const [event] = await timeline.forProject(branch.id).list();
    expect([event.name, event.nodeIds.length]).toEqual(['The Siege', 1]);

    // Character state: Alex is level 30, with the blade; the level-60 snapshot belongs to the parent's future.
    const snapshots = await progression.forProject(branch.id).list();
    const [system] = await systems.forProject(branch.id).list();
    const now = stateAt(snapshots, nodes, alexHere.id, null)!;
    expect([snapshots.length, now.label, now.gear.map((g) => g.name)]).toEqual([2, 'Level 30', ['Sunblade']]);
    expect(Object.values(now.systems[system.id].progress)).toEqual([30]);
    expect(Object.keys(now.systems[system.id].progress)).toEqual([level]);
    expect((await systems.forProject(branch.id).sheets()).length).toBe(1);
  });

  it('can fork after a scene, at the end of a volume, or before the story begins', async () => {
    const { p, m, at, chapters } = await world();
    const { branching, manuscript, codex, progression } = app;
    const volume = await m.create('volume', null, 'Book One');
    await m.move(volume.id, null, chapters[0].id);
    for (const chapter of [1, 2]) await m.move(at(chapter), volume.id);
    const scene = await m.create('scene', at(4), 'The duel');
    const titles = async (projectId: string) => (await manuscript.forProject(projectId).list()).map((x) => x.title).sort();

    expect(await titles((await branching.fork(p.id, volume.id)).id)).toEqual(['Book One', 'Chapter 1', 'Chapter 2']);
    expect(await titles((await branching.fork(p.id, scene.id)).id)).toEqual(['Book One', 'Chapter 1', 'Chapter 2', 'Chapter 3', 'Chapter 4', 'The duel']);
    expect(await titles((await branching.fork(p.id, at(4))).id)).toEqual(['Book One', 'Chapter 1', 'Chapter 2', 'Chapter 3', 'Chapter 4', 'The duel']);
    const blank = await branching.fork(p.id, null, { name: 'From nothing' });
    expect(await titles(blank.id)).toEqual([]);
    expect([(await codex.forProject(blank.id).list()).length, (await progression.forProject(blank.id).list()).length]).toEqual([4, 0]);
    await expect(branching.fork(p.id, 'nope')).rejects.toThrow('not in this project');
    await expect(branching.fork('nope', null)).rejects.toThrow('does not exist');
  });

  it('never changes the parent by forking', async () => {
    const { p, at } = await world();
    const before = await dump(p.id);
    await app.branching.fork(p.id, at(3));
    await app.branching.fork(p.id, at(1), { status: 'abandoned' });
    expect(await dump(p.id)).toBe(before);
  });
});

describe('zero cross-contamination', () => {
  it('lets a timeline change in every way without the parent, or a sibling, changing at all', async () => {
    const { p, at } = await world();
    const { branching, manuscript, codex, plot, canon, continuity, progression, relationships, systems } = app;
    const a = await branching.fork(p.id, at(3), { name: 'A' });
    const b = await branching.fork(p.id, at(3), { name: 'B' });
    const [parentBefore, siblingBefore] = [await dump(p.id), await dump(b.id)];

    const m = manuscript.forProject(a.id);
    const nodes = await m.list();
    const third = nodes.find((x) => x.title === 'Chapter 3')!;
    await m.saveDoc(third.id, doc(['Everything is different now.']), { words: 4, characters: 28 });
    await m.update(third.id, { title: 'The Turn' });
    await m.remove(nodes.find((x) => x.title === 'Chapter 1')!.id);
    const fresh = await m.create('chapter', null, 'A new ending');
    await m.saveDoc(fresh.id, doc(['The villain wins.']), { words: 3, characters: 17 });
    const [alexHere] = (await codex.forProject(a.id).list()).filter((e) => e.name === 'Alex');
    await codex.forProject(a.id).update(alexHere.id, { name: 'Alexander the Fallen', description: 'Changed.' });
    await codex.forProject(a.id).create('character', 'A stranger');
    const [thread] = await plot.forProject(a.id).list();
    await plot.forProject(a.id).update(thread.id, { status: 'abandoned' });
    const [fact] = await canon.forProject(a.id).list();
    await canon.forProject(a.id).revise(fact.id, { statement: '9 years ago', reason: 'This world is young' });
    await continuity.forProject(a.id).createRule('status', { entryId: alexHere.id, state: 'deceased', fromNodeId: third.id });
    const snapshot = await progression.forProject(a.id).create(alexHere.id, { nodeId: fresh.id, label: 'Broken' });
    await progression.forProject(a.id).update(snapshot.id, () => ({ gear: [] }));
    for (const relation of await relationships.forProject(a.id).list()) await relationships.forProject(a.id).remove(relation.id);
    const [system] = await systems.forProject(a.id).list();
    await systems.forProject(a.id).update(system.id, () => ({ name: 'The Broken System', variables: [] }));

    expect(await dump(p.id)).toBe(parentBefore);
    expect(await dump(b.id)).toBe(siblingBefore);
    // …and the timeline really did change.
    expect((await m.list()).map((x) => x.title).sort()).toEqual(['A new ending', 'Chapter 2', 'The Turn']);
  });

  it('lets the parent move on without the timeline changing', async () => {
    const { p, m, at, alex } = await world();
    const branch = await app.branching.fork(p.id, at(3));
    const before = await dump(branch.id);
    await m.saveDoc(at(2), doc(['Rewritten in the main story.']), { words: 5, characters: 27 });
    await m.remove(at(1));
    await app.codex.forProject(p.id).update(alex.id, { name: 'Alexios' });
    const [thread] = await app.plot.forProject(p.id).list();
    await app.plot.forProject(p.id).remove(thread.id);
    expect(await dump(branch.id)).toBe(before);
  });

  it('refuses to reach into another timeline through any service', async () => {
    const { p, at } = await world();
    const branch = await app.branching.fork(p.id, at(3));
    const theirs = (await app.manuscript.forProject(branch.id).list())[0];
    await expect(app.manuscript.forProject(p.id).saveDoc(theirs.id, doc(['x']), { words: 1, characters: 1 })).rejects.toThrow();
    await expect(app.manuscript.forProject(p.id).update(theirs.id, { title: 'x' })).rejects.toThrow();
    await expect(app.manuscript.forProject(branch.id).update(at(1), { title: 'x' })).rejects.toThrow();
  });
});

describe('the tree of timelines', () => {
  it('shows parents and children, with each timeline\'s status and where it forked', async () => {
    const { p, at } = await world();
    const { branching, projects } = app;
    const a = await branching.fork(p.id, at(3), { name: 'Alternative Timeline A', status: 'alternate' });
    const b = await branching.fork(p.id, at(3), { name: 'Alternative Timeline B' });
    const nodeInA = (await app.manuscript.forProject(a.id).list()).find((x) => x.title === 'Chapter 2')!;
    const deep = await branching.fork(a.id, nodeInA.id, { name: 'A, darker', status: 'abandoned' });
    const other = await projects.create({ title: 'Another novel' });

    const tree = await branching.family(deep.id);
    expect(flattenFamily(tree).map((x) => `${'  '.repeat(x.depth)}${x.title} [${x.status}] ${x.forkLabel}`.trimEnd())).toEqual([
      'Ashfall [main]', '  Alternative Timeline A [alternate] Chapter 3', '    A, darker [abandoned] Chapter 2', '  Alternative Timeline B [experimental] Chapter 3',
    ]);
    expect((await branching.families()).map((f) => f.title).sort()).toEqual(['Another novel', 'Ashfall']);
    expect((await branching.family(other.id)).children).toEqual([]);

    // A timeline whose parent is deleted moves up to the nearest ancestor; with none left, it stands alone.
    await branching.remove(a.id);
    expect(flattenFamily(await branching.family(p.id)).map((x) => `${x.depth} ${x.title}`)).toEqual(['0 Ashfall', '1 Alternative Timeline B', '1 A, darker']);
    await projects.remove(p.id);
    expect((await branching.families()).map((f) => f.title).sort()).toEqual(['A, darker', 'Alternative Timeline B', 'Another novel']);
    expect(buildFamilies([{ id: b.id, title: 'B' }], [])).toMatchObject([{ status: 'main', parentId: null }]);
  });

  it('classifies timelines, and keeps exactly one main canon when one is promoted', async () => {
    const { p, at } = await world();
    const { branching } = app;
    const a = await branching.fork(p.id, at(3), { name: 'A', status: 'main' });
    const b = await branching.fork(p.id, at(2), { name: 'B', status: 'non-canon' });
    const statuses = async () => Object.fromEntries(flattenFamily(await branching.family(p.id)).map((x) => [x.title, x.status]));
    // A fork is never born as main canon.
    expect(await statuses()).toEqual({ Ashfall: 'main', A: 'experimental', B: 'non-canon' });
    for (const status of ['alternate', 'non-canon', 'experimental', 'abandoned'] as const) {
      await branching.setStatus(a.id, status);
      expect((await statuses()).A).toBe(status);
    }
    await expect(branching.setStatus(a.id, 'main')).rejects.toThrow('Promote');
    await branching.setNote(a.id, 'The one where the tower falls');

    const before = [await dump(p.id), await dump(a.id), await dump(b.id)];
    await branching.promote(a.id);
    expect(await statuses()).toEqual({ Ashfall: 'alternate', A: 'main', B: 'non-canon' });
    await branching.promote(b.id);
    expect(await statuses()).toEqual({ Ashfall: 'alternate', A: 'alternate', B: 'main' });
    // Promotion moves labels, never text or data.
    expect([await dump(p.id), await dump(a.id), await dump(b.id)]).toEqual(before);
    expect((await branching.family(a.id)).children[0].note).toBe('The one where the tower falls');
  });
});

describe('comparing and merging, only when asked', () => {
  it('says which chapters a timeline has changed or added', async () => {
    const { p, at } = await world();
    const { branching, manuscript } = app;
    const branch = await branching.fork(p.id, at(3));
    const m = manuscript.forProject(branch.id);
    const third = (await m.list()).find((x) => x.title === 'Chapter 3')!;
    expect((await branching.divergence(branch.id)).map((d) => d.state)).toEqual(['same', 'same', 'same']);
    await m.saveDoc(third.id, doc(['Rewritten.']), { words: 1, characters: 10 });
    const fresh = await m.create('chapter', null, 'Chapter 4, otherwise');
    expect((await branching.divergence(branch.id)).map((d) => `${d.title}: ${d.state} (${d.parentTitle})`)).toEqual(['Chapter 1: same (Chapter 1)', 'Chapter 2: same (Chapter 2)', 'Chapter 3: changed (Chapter 3)', 'Chapter 4, otherwise: new (null)']);
    expect(fresh.projectId).toBe(branch.id);
    await expect(branching.divergence(p.id)).rejects.toThrow('no parent');
  });

  it('copies one chapter into the parent, keeping what it replaces, and touches nothing else', async () => {
    const { p, m: parent, at, alex } = await world();
    const { branching, manuscript, db } = app;
    const branch = await branching.fork(p.id, at(3), { name: 'Trial' });
    const m = manuscript.forProject(branch.id);
    const third = (await m.list()).find((x) => x.title === 'Chapter 3')!;
    const alexHere = (await app.codex.forProject(branch.id).list()).find((e) => e.name === 'Alex')!;
    await m.saveDoc(third.id, doc(['A better chapter three, with ', { link: alexHere.id, text: 'Alex' }, '.']), { words: 6, characters: 33 });
    const fresh = await m.create('chapter', null, 'The lost chapter');
    await m.saveDoc(fresh.id, doc(['Found again.']), { words: 2, characters: 12 });

    const branchBefore = JSON.stringify([await db.chapters.where('projectId').equals(branch.id).toArray(), await db.chapterContents.where('projectId').equals(branch.id).toArray()]);
    const others = async () => JSON.stringify(await Promise.all([1, 2, 4, 5, 6].map((chapter) => parent.loadDoc(at(chapter)))));
    const othersBefore = await others();

    expect(await branching.mergeChapter(branch.id, third.id)).toEqual({ mode: 'replaced', nodeId: at(3), title: 'Chapter 3' });
    const merged = await parent.loadDoc(at(3));
    expect(textOf(merged)).toBe('A better chapter three, with Alex.');
    // The link now points at the parent's Alex, not the branch's.
    expect(JSON.stringify(merged)).toContain(alex.id);
    expect(JSON.stringify(merged)).not.toContain(alexHere.id);
    const history = await parent.revisions(at(3));
    expect(history.some((r) => r.label === 'Before merging from “Trial”')).toBe(true);

    const added = await branching.mergeChapter(branch.id, fresh.id);
    expect(added).toMatchObject({ mode: 'added', title: 'The lost chapter' });
    expect(textOf(await parent.loadDoc(added.nodeId))).toBe('Found again.');
    expect((await parent.list()).length).toBe(7);
    // Merging the same chapter again updates the one it made, rather than adding another.
    await m.saveDoc(fresh.id, doc(['Found again, and better.']), { words: 4, characters: 24 });
    expect(await branching.mergeChapter(branch.id, fresh.id)).toMatchObject({ mode: 'replaced', nodeId: added.nodeId });
    expect((await parent.list()).length).toBe(7);

    expect(await others()).toBe(othersBefore);
    const stillBranch = JSON.parse(JSON.stringify([await db.chapters.where('projectId').equals(branch.id).toArray(), await db.chapterContents.where('projectId').equals(branch.id).toArray()]));
    expect(textOf(stillBranch[1])).toContain('A better chapter three');
    expect(JSON.parse(branchBefore)[0].length).toBe(stillBranch[0].length);
    expect((await branching.divergence(branch.id)).map((d) => d.state)).toEqual(['same', 'same', 'same', 'same']);

    await expect(branching.mergeChapter(branch.id, at(1))).rejects.toThrow('of this timeline');
    await expect(branching.mergeChapter(p.id, at(1))).rejects.toThrow('no parent');
  });
});
