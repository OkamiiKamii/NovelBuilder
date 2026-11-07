import { beforeEach, describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { createCodexService, registerCodex, type CodexService } from '@/modules/codex/service';
import { createManuscriptService, registerManuscript, type ManuscriptService } from '@/modules/manuscript/service';
import { createProjectService, type ProjectService } from '@/modules/projects/service';
import { lifePath, lifeSummary } from './ages';
import { formatDate, formatDuration, resolveChronology } from './chronology';
import { createTimelineService, normalizeDate, registerTimeline, type TimelineService } from './service';
import type { EventDate } from './types';

let n = 0;
let db: NovelDB;
let projects: ProjectService;
let manuscript: ManuscriptService;
let codex: CodexService;
let timeline: TimelineService;

beforeEach(() => {
  db = new NovelDB(`timeline-${++n}`);
  const registry = createProjectRegistry();
  projects = createProjectService(db, registry);
  registerManuscript(registry);
  registerCodex(registry);
  registerTimeline(registry);
  manuscript = createManuscriptService(db, projects.contentChanged);
  codex = createCodexService(db, projects.contentChanged);
  timeline = createTimelineService(db, projects.contentChanged);
});

async function world() {
  const p = await projects.create({ title: 'P' });
  const m = manuscript.forProject(p.id);
  const c = codex.forProject(p.id);
  const t = timeline.forProject(p.id);
  const ch1 = await m.create('chapter');
  const ch2 = await m.create('chapter');
  const ch3 = await m.create('chapter');
  const mira = await c.create('character', 'Mira');
  const bren = await c.create('character', 'Bren');
  const academy = await c.create('location', 'The Academy');
  const guild = await c.create('faction', 'Ash Guild');
  const add = async (name: string, when: EventDate, more: Parameters<typeof t.update>[1] = {}) => {
    const event = await t.create(name);
    await t.update(event.id, { when, ...more });
    return (await t.get(event.id))!;
  };
  return { p, m, c, t, ch1, ch2, ch3, mira, bren, academy, guild, add };
}
const names = async (t: ReturnType<TimelineService['forProject']>) => resolveChronology(await t.list()).map((x) => x.event.name);
const exact = (year: number, month: number | null = null, day: number | null = null, hour: number | null = null, minute: number | null = null): EventDate => ({ precision: 'exact', year, month, day, hour, minute });

describe('dates at every precision', () => {
  it('formats exact, approximate, relative and undated dates', () => {
    expect(formatDate(exact(1026, 10, 14, 20, 30))).toBe('Year 1026, October 14 — 8:30 PM');
    expect(formatDate(exact(1026, 10, 14))).toBe('Year 1026, October 14');
    expect(formatDate(exact(1026))).toBe('Year 1026');
    expect(formatDate(exact(-40, 1, 1, 0, 5))).toBe('Year -40, January 1 — 12:05 AM');
    expect(formatDate({ precision: 'approximate', year: 1026, month: 10, season: null })).toBe('October 1026');
    expect(formatDate({ precision: 'approximate', year: 10, month: null, season: 'summer' })).toBe('Summer of Year 10');
    expect(formatDate({ precision: 'approximate', year: 10, month: null, season: null })).toBe('Around Year 10');
    expect(formatDate({ precision: 'relative', anchorId: 'x', amount: 20, unit: 'years', direction: 'before' }, () => 'Chapter 1 opens')).toBe('About 20 years before Chapter 1 opens');
    expect(formatDate({ precision: 'relative', anchorId: 'x', amount: 1, unit: 'days', direction: 'after' }, () => 'the Siege')).toBe('About 1 day after the Siege');
    expect(formatDate({ precision: 'unknown' })).toBe('Undated');
    expect(formatDuration({ amount: 3, unit: 'days' })).toBe('3 days');
  });

  it('accepts only valid dates, dropping detail that makes no sense', () => {
    expect(normalizeDate({ precision: 'exact', year: '1026', month: 13, day: 5, hour: 3 })).toEqual({ precision: 'exact', year: 1026, month: null, day: null, hour: null, minute: null });
    expect(normalizeDate({ precision: 'exact', year: 1026, month: 2, day: 40 })).toEqual({ precision: 'exact', year: 1026, month: 2, day: null, hour: null, minute: null });
    expect(normalizeDate({ precision: 'exact', year: 1026, month: 2, day: 3, hour: 9 })).toEqual({ precision: 'exact', year: 1026, month: 2, day: 3, hour: 9, minute: 0 });
    expect(normalizeDate({ precision: 'exact', year: '' })).toEqual({ precision: 'unknown' });
    expect(normalizeDate({ precision: 'approximate', year: 10, month: 6, season: 'summer' })).toEqual({ precision: 'approximate', year: 10, month: 6, season: null });
    expect(normalizeDate({ precision: 'relative', amount: -5, unit: 'fortnights', direction: 'sideways' })).toEqual({ precision: 'relative', anchorId: null, amount: 5, unit: 'years', direction: 'before' });
    expect(normalizeDate(null)).toEqual({ precision: 'unknown' });
  });
});

describe('chronological order', () => {
  it('orders events by when they happen, whatever order they were created in', async () => {
    const { t, add } = await world();
    const siege = await add('The Siege', exact(1026, 10, 14, 20, 30));
    await add('Coronation', { precision: 'approximate', year: 1026, month: null, season: 'summer' });
    await add('Founding of the Guild', exact(980));
    await add('Dawn assault', exact(1026, 10, 14, 5, 0));
    await add('The Burning', { precision: 'relative', anchorId: siege.id, amount: 20, unit: 'years', direction: 'before' });
    await add('Aftermath', { precision: 'relative', anchorId: siege.id, amount: 2, unit: 'days', direction: 'after' });
    await add('October muster', { precision: 'approximate', year: 1026, month: 10, season: null });

    expect(await names(t)).toEqual(['Founding of the Guild', 'The Burning', 'Coronation', 'October muster', 'Dawn assault', 'The Siege', 'Aftermath']);
    const burning = resolveChronology(await t.list()).find((x) => x.event.name === 'The Burning')!;
    expect(burning).toMatchObject({ year: 1006, label: 'About 20 years before The Siege', issues: [] });
  });

  it('places undated events by what they come after, and keeps the rest at the end', async () => {
    const { t, add } = await world();
    const a = await add('A', exact(100));
    const c = await add('C', exact(300));
    const undated = await add('B (undated, after A)', { precision: 'unknown' }, { afterId: a.id });
    await add('B2 (undated, after B)', { precision: 'unknown' }, { afterId: undated.id });
    await add('Loose thread', { precision: 'unknown' });
    const tieFirst = await add('Same day, second', exact(300), { afterId: c.id });
    expect(tieFirst.afterId).toBe(c.id);

    expect(await names(t)).toEqual(['A', 'B (undated, after A)', 'B2 (undated, after B)', 'C', 'Same day, second', 'Loose thread']);
    expect(resolveChronology(await t.list()).at(-1)).toMatchObject({ value: null, year: null, label: 'Undated' });
    expect(resolveChronology(await t.list()).map((x) => x.anchored)).toEqual([true, true, true, true, true, false]);
  });

  it('reports contradictions instead of hiding them', async () => {
    const { t, add } = await world();
    const later = await add('Later', exact(500));
    const earlier = await add('Earlier but "after" Later', exact(400), { afterId: later.id });
    const r1 = await add('R1', { precision: 'unknown' });
    const r2 = await add('R2', { precision: 'relative', anchorId: r1.id, amount: 1, unit: 'years', direction: 'after' });
    await t.update(r1.id, { when: { precision: 'relative', anchorId: r2.id, amount: 1, unit: 'years', direction: 'after' } });
    const orphan = await add('Orphan', { precision: 'relative', anchorId: later.id, amount: 3, unit: 'days', direction: 'after' }, { afterId: later.id });
    const pending = await add('Pending', { precision: 'relative', anchorId: (await add('No date', { precision: 'unknown' })).id, amount: 1, unit: 'days', direction: 'after' });

    let issues = Object.fromEntries(resolveChronology(await t.list()).map((x) => [x.event.id, x.issues]));
    expect(issues[earlier.id]).toEqual(['It is dated before “Later”, which it is set to follow.']);
    expect([...issues[r1.id], ...issues[r2.id]].some((text) => text.includes('depends on itself'))).toBe(true);
    expect(issues[pending.id]).toEqual(['Its date is relative to “No date”, which has no date yet.']);
    expect(issues[orphan.id]).toEqual([]);

    await t.remove(later.id);
    issues = Object.fromEntries(resolveChronology(await t.list()).map((x) => [x.event.id, x.issues]));
    expect(issues[orphan.id]).toEqual(['Its date is relative to an event that no longer exists.', 'It is set to follow an event that no longer exists.']);
    expect((await t.get(orphan.id))!.name).toBe('Orphan'); // kept, flagged
  });
});

describe('event details and links', () => {
  it('stores every field and accepts only valid links', async () => {
    const { p, t, mira, bren, academy, guild, ch1, ch2, add } = await world();
    const stranger = await codex.forProject((await projects.create({ title: 'Other' })).id).create('character', 'Stranger');
    const first = await add('First', exact(1));
    const event = await t.create('  The Trial ');
    await t.update(event.id, {
      description: 'Line one.\n  Indented.',
      when: exact(1026, 3, 2),
      duration: { amount: 3, unit: 'days' },
      importance: 'climax',
      locationId: academy.id,
      characters: [{ id: mira.id, age: 17 }, { id: bren.id, age: null }, { id: guild.id, age: 3 }, { id: stranger.id, age: 9 }, { id: mira.id, age: 99 }],
      entryIds: [guild.id, guild.id, 'ghost', stranger.id],
      nodeIds: [ch2.id, ch1.id, 'ghost'],
      afterId: first.id,
    });
    const saved = (await t.get(event.id))!;
    expect(saved).toMatchObject({
      name: 'The Trial', description: 'Line one.\n  Indented.', duration: { amount: 3, unit: 'days' }, importance: 'climax', locationId: academy.id,
      characters: [{ id: mira.id, age: 17 }, { id: bren.id, age: null }], entryIds: [guild.id], nodeIds: [ch2.id, ch1.id], afterId: first.id,
    });

    await t.update(event.id, { locationId: mira.id, afterId: event.id, importance: 'huge' as never, duration: { amount: 0, unit: 'days' } });
    expect(await t.get(event.id)).toMatchObject({ locationId: null, afterId: null, importance: 'climax', duration: null }); // a character is not a place; an event cannot follow itself
    db.close();
    expect(await new NovelDB(db.name).timelineEvents.get(event.id)).toEqual(await new NovelDB(db.name).timelineEvents.get(event.id));
    expect((await new NovelDB(db.name).timelineEvents.get(event.id))!.characters).toEqual(saved.characters);
    expect(p.id).toBe(saved.projectId);
  });

  it('quick edits in a row build on each other instead of overwriting', async () => {
    const { t, mira, bren, ch1, ch2 } = await world();
    const event = await t.create('Rapid');
    // Fired together, as a fast typist would, each based on what is stored when it runs.
    await Promise.all([
      t.update(event.id, () => ({ when: exact(1) })),
      t.update(event.id, (e) => ({ when: e.when.precision === 'exact' ? { ...e.when, year: 1026 } : e.when })),
      t.update(event.id, (e) => ({ when: e.when.precision === 'exact' ? { ...e.when, month: 10 } : e.when })),
      t.update(event.id, (e) => ({ characters: [...e.characters, { id: mira.id, age: null }] })),
      t.update(event.id, (e) => ({ characters: [...e.characters, { id: bren.id, age: 30 }] })),
      t.update(event.id, (e) => ({ nodeIds: [...e.nodeIds, ch1.id] })),
      t.update(event.id, (e) => ({ nodeIds: [...e.nodeIds, ch2.id] })),
    ]);
    expect(await t.get(event.id)).toMatchObject({ when: exact(1026, 10), characters: [{ id: mira.id, age: null }, { id: bren.id, age: 30 }], nodeIds: [ch1.id, ch2.id] });
  });

  it('CHRONOLOGY IS INDEPENDENT: reordering, moving or deleting chapters never changes an event\'s time', async () => {
    const { t, m, ch1, ch2, ch3, add } = await world();
    await add('Flashback (told in chapter 3)', exact(990), { nodeIds: [ch3.id] });
    await add('Story opens (chapter 1)', exact(1026, 1, 1), { nodeIds: [ch1.id] });
    await add('Climax (chapter 2)', exact(1026, 6, 1), { nodeIds: [ch2.id] });
    const before = JSON.stringify((await t.list()).sort((a, b) => a.id.localeCompare(b.id)));
    const orderBefore = await names(t);

    await m.move(ch3.id, null, ch1.id); // the flashback is now told first
    await m.nudge(ch2.id, -1);
    const volume = await m.create('volume');
    await m.move(ch1.id, volume.id);
    await m.update(ch2.id, { title: 'Renamed' });
    await m.saveDoc(ch2.id, { type: 'doc', content: [] }, { words: 0, characters: 0 });

    expect(JSON.stringify((await t.list()).sort((a, b) => a.id.localeCompare(b.id)))).toBe(before);
    expect(await names(t)).toEqual(orderBefore);
    expect(orderBefore).toEqual(['Flashback (told in chapter 3)', 'Story opens (chapter 1)', 'Climax (chapter 2)']);

    // Deleting a chapter leaves the event and its date in place; the dead link is dropped at the next edit.
    await m.remove(ch3.id);
    const flashback = (await t.list()).find((e) => e.name.startsWith('Flashback'))!;
    expect(flashback.when).toEqual(exact(990));
    await t.update(flashback.id, { nodeIds: flashback.nodeIds });
    expect((await t.get(flashback.id))!.nodeIds).toEqual([]);
  });

  it('creating and editing events never touches the manuscript or the codex', async () => {
    const { t, m, c, ch1, mira, academy, add } = await world();
    await m.saveDoc(ch1.id, { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Prose.' }] }] }, { words: 1, characters: 6 });
    const snapshot = async () => JSON.stringify([await db.chapters.toArray(), await db.chapterContents.toArray(), await db.loreEntries.toArray(), await db.loreLinks.toArray()]);
    const before = await snapshot();
    const event = await add('Event', exact(5), { nodeIds: [ch1.id], characters: [{ id: mira.id, age: 4 }], locationId: academy.id });
    await t.update(event.id, { name: 'Renamed', when: exact(6) });
    await t.remove(event.id);
    expect(await snapshot()).toBe(before);
    expect((await m.list()).map((x) => x.order).sort()).toEqual([0, 1, 2]);
    expect((await c.list()).length).toBe(4);
  });
});

describe('character life paths', () => {
  async function life() {
    const s = await world();
    const born = await s.add('Mira is born', exact(1000, 3, 1), { characters: [{ id: s.mira.id, age: 0 }] });
    await s.add('Parents disappear', exact(1008, 9, 1), { characters: [{ id: s.mira.id, age: null }] });
    await s.add('Enters the academy', { precision: 'approximate', year: 1012, month: null, season: 'autumn' }, { characters: [{ id: s.mira.id, age: null }, { id: s.bren.id, age: 14 }], locationId: s.academy.id });
    await s.add('Awakens her ability', { precision: 'relative', anchorId: born.id, amount: 17, unit: 'years', direction: 'after' }, { characters: [{ id: s.mira.id, age: null }], importance: 'climax' });
    await s.add('Guild war', exact(1015), { characters: [{ id: s.bren.id, age: null }] });
    return s;
  }

  it('builds a character\'s life in order, with ages counted from their birth', async () => {
    const s = await life();
    const steps = lifePath(resolveChronology(await s.t.list()), s.mira.id);
    expect(lifeSummary(steps)).toBe('Age 0: Mira is born → Age 8: Parents disappear → Age 12: Enters the academy → Age 17: Awakens her ability');
    expect(steps.map((x) => x.stated)).toEqual([true, false, false, false]);
    expect(steps.every((x) => x.issue === null)).toBe(true);
  });

  it('counts from any stated age when there is no birth event', async () => {
    const s = await life();
    // Fourteen in the autumn of 1012 puts his birth between autumn 997 and autumn 998, so in 'Year 1015' he is 16, 17 or 18: no closer is known (Prompt 21).
    expect(lifeSummary(lifePath(resolveChronology(await s.t.list()), s.bren.id))).toBe('Age 14: Enters the academy → Age 16–18: Guild war');
    const orrin = await s.c.create('character', 'Orrin');
    await s.add('Orrin arrives', exact(1010), { characters: [{ id: orrin.id, age: null }] });
    expect(lifeSummary(lifePath(resolveChronology(await s.t.list()), orrin.id))).toBe('Orrin arrives'); // no age known: none invented
  });

  it('flags a stated age that contradicts the dates', async () => {
    const s = await life();
    await s.add('Graduation', exact(1016, 6, 1), { characters: [{ id: s.mira.id, age: 22 }] });
    const steps = lifePath(resolveChronology(await s.t.list()), s.mira.id);
    const graduation = steps.find((x) => x.placed.event.name === 'Graduation')!;
    expect(graduation).toMatchObject({ age: 22, stated: true });
    expect(graduation.issue).toBe('Stated as age 22, but the dates make it 16 (counting from their birth, “Mira is born”).');
    // The two disagree, so each is pointed out against the other; neither is changed.
    expect(steps.filter((x) => x.issue).map((x) => x.placed.event.name)).toEqual(['Mira is born', 'Graduation']);
  });

  it('updates when a character is removed from the codex', async () => {
    const s = await life();
    await s.c.remove(s.bren.id);
    const academy = (await s.t.list()).find((e) => e.name === 'Enters the academy')!;
    expect(academy.characters.map((x) => x.id)).toContain(s.bren.id); // the stale id is harmless…
    await s.t.update(academy.id, { characters: academy.characters });
    expect((await s.t.get(academy.id))!.characters).toEqual([{ id: s.mira.id, age: null }]); // …and is dropped at the next edit
    expect(lifeSummary(lifePath(resolveChronology(await s.t.list()), s.mira.id))).toContain('Age 12: Enters the academy');
  });
});

describe('isolation and portability', () => {
  it("is private to its project; copies and backups re-point every link", async () => {
    const { p, t, mira, academy, guild, ch1, add } = await world();
    const siege = await add('Siege', exact(1026), { characters: [{ id: mira.id, age: 26 }], locationId: academy.id, entryIds: [guild.id], nodeIds: [ch1.id] });
    await add('Before', { precision: 'relative', anchorId: siege.id, amount: 1, unit: 'years', direction: 'before' });
    await add('After', { precision: 'unknown' }, { afterId: siege.id });

    const other = timeline.forProject((await projects.create({ title: 'Other' })).id);
    expect(await other.list()).toEqual([]);
    expect(await other.get(siege.id)).toBeUndefined();
    await expect(other.update(siege.id, { name: 'x' })).rejects.toThrow('not found');
    await expect(other.remove(siege.id)).rejects.toThrow('not found');
    const theirs = await other.create('Theirs');
    await other.update(theirs.id, { afterId: siege.id, characters: [{ id: mira.id, age: 1 }], nodeIds: [ch1.id], when: { precision: 'relative', anchorId: siege.id, amount: 1, unit: 'days', direction: 'after' } });
    expect(await other.get(theirs.id)).toMatchObject({ afterId: null, characters: [], nodeIds: [], when: { anchorId: null } });

    for (const projectId of [(await projects.duplicate(p.id)).id, (await projects.importSnapshot(JSON.parse(JSON.stringify(await projects.exportSnapshot(p.id, { everything: true }))))).id]) {
      const events = await timeline.forProject(projectId).list();
      const entries = await codex.forProject(projectId).list();
      const nodes = await manuscript.forProject(projectId).list();
      const copy = events.find((e) => e.name === 'Siege')!;
      expect(copy.id).not.toBe(siege.id);
      expect(entries.find((e) => e.id === copy.characters[0].id)?.name).toBe('Mira');
      expect(copy.characters[0].age).toBe(26);
      expect(entries.find((e) => e.id === copy.locationId)?.name).toBe('The Academy');
      expect(entries.find((e) => e.id === copy.entryIds[0])?.name).toBe('Ash Guild');
      expect(nodes.some((x) => x.id === copy.nodeIds[0])).toBe(true);
      expect(events.find((e) => e.name === 'After')!.afterId).toBe(copy.id);
      expect(events.find((e) => e.name === 'Before')!.when).toMatchObject({ anchorId: copy.id });
      expect(resolveChronology(events).map((x) => x.event.name)).toEqual(['Before', 'Siege', 'After']);
    }
    await projects.remove(p.id);
    expect(await t.list()).toEqual([]);
  });
});
