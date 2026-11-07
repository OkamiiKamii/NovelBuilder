import { describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { createCodexService, registerCodex } from '@/modules/codex/service';
import { eventRecords } from '@/modules/model/events';
import { loadModel } from '@/modules/model/model';
import { createProjectService } from '@/modules/projects/service';
import { compareTimelines, comparisonSummary, historyEvents, originWords, staleChanges, withHistory } from './histories';
import { createHistoryService, registerHistories } from './historyService';
import { createTimelineService, registerTimeline } from './service';
import type { EventDate } from './types';

const year = (y: number, month: number | null = null): EventDate => ({ precision: 'exact', year: y, month, day: null, hour: null, minute: null });

async function novel() {
  const db = new NovelDB(`histories-${crypto.randomUUID()}`);
  const registry = createProjectRegistry();
  const projects = createProjectService(db, registry);
  registerCodex(registry);
  registerTimeline(registry);
  registerHistories(registry);
  const p = await projects.create({ title: 'The Siege' });
  const t = createTimelineService(db, projects.contentChanged).forProject(p.id);
  const c = createCodexService(db, projects.contentChanged).forProject(p.id);
  const h = createHistoryService(db, projects.contentChanged).forProject(p.id);
  const keep = await c.create('location', 'The Keep');
  const docks = await c.create('location', 'The Docks');
  const mira = await c.create('character', 'Mira');
  const add = async (name: string, when: EventDate, more: Parameters<typeof t.update>[1] = {}) => {
    const e = await t.create(name);
    await t.update(e.id, { when, ...more });
    return e.id;
  };
  const founding = await add('The founding', year(1));
  const siege = await add('The siege', year(10), { locationId: keep.id, characters: [{ id: mira.id, age: null }] });
  const fall = await add('The fall of the Keep', year(11));
  const exile = await add('Exile', { precision: 'relative', anchorId: siege, amount: 2, unit: 'years', direction: 'after' });
  const crowning = await add('The crowning', year(20));
  const mainRows = async () => (await db.timelineEvents.where('projectId').equals(p.id).sortBy('id')).map((e) => JSON.stringify(e));
  const events = async () => new Map((await db.timelineEvents.where('projectId').equals(p.id).toArray()).map((e) => [e.id, e]));
  const all = async () => new Map((await h.list()).map((x) => [x.id, x]));
  return { db, p, projects, t, h, keep, docks, mira, ids: { founding, siege, fall, exile, crowning }, mainRows, events, all };
}

describe('alternate histories, kept apart from the main timeline', () => {
  it('hold only their differences, and leave every main-timeline record exactly as it was', async () => {
    const s = await novel();
    const before = await s.mainRows();
    const branch = await s.h.create({ name: 'If the Keep held', kind: 'hypothetical', status: 'non-canon', originEventId: s.ids.siege });
    // The form sends every field; those the same as the main timeline (an unchanged name, an event that was never 'still going on') are not kept.
    await s.h.changeEvent(branch.id, s.ids.siege, { when: year(12), locationId: s.docks.id, name: 'The siege', ongoing: false, description: '' });
    await s.h.removeEvent(branch.id, s.ids.fall);
    const parley = await s.h.addEvent(branch.id, 'The parley');
    await s.h.updateAdded(branch.id, parley.id, { when: year(13), locationId: s.keep.id });

    expect(await s.mainRows()).toEqual(before);
    const stored = (await s.h.get(branch.id))!;
    // Only what differs: the unchanged name was dropped; no other event is in the history at all.
    expect(stored.changed).toEqual({ [s.ids.siege]: { when: year(12), locationId: s.docks.id } });
    expect(stored.removed).toEqual([s.ids.fall]);
    expect(stored.added.map((e) => e.name)).toEqual(['The parley']);
    // The main timeline and every view of it have none of it.
    const model = (await loadModel(s.db, s.p.id))!;
    expect(eventRecords(model).map((e) => e.title).sort()).toEqual(['Exile', 'The crowning', 'The fall of the Keep', 'The founding', 'The siege']);
    expect(model.events.get(s.ids.siege)!.when).toEqual(year(10));
  });

  it('read unchanged events through from the base, so a later edit there shows in the history too', async () => {
    const s = await novel();
    const branch = await s.h.create({ name: 'Changed future', kind: 'changed-future' });
    await s.h.changeEvent(branch.id, s.ids.crowning, { when: year(25) });
    await s.t.update(s.ids.founding, { name: 'The first founding' });
    const main = await s.events();
    const events = historyEvents(main, await s.all(), branch.id);
    expect(events.get(s.ids.founding)!.name).toBe('The first founding');
    expect(events.get(s.ids.crowning)!.when).toEqual(year(25));
    // The unchanged records are the main timeline's own objects, not copies; the changed one is a new reading of its record.
    expect(events.get(s.ids.founding)).toBe(main.get(s.ids.founding));
    expect(events.get(s.ids.crowning)).not.toBe(main.get(s.ids.crowning));
    expect(main.get(s.ids.crowning)!.when).toEqual(year(20));
  });

  it('can branch from another history, which keeps its own changes and inherits the rest', async () => {
    const s = await novel();
    const first = await s.h.create({ name: 'If the Keep held' });
    await s.h.removeEvent(first.id, s.ids.fall);
    const second = await s.h.create({ name: 'And then the crown', baseId: first.id, originEventId: s.ids.crowning });
    await s.h.changeEvent(second.id, s.ids.crowning, { name: 'Mira is crowned' });
    const events = historyEvents(await s.events(), await s.all(), second.id);
    expect([events.has(s.ids.fall), events.get(s.ids.crowning)!.name]).toEqual([false, 'Mira is crowned']);
    // The first history is untouched by the second.
    expect(historyEvents(await s.events(), await s.all(), first.id).get(s.ids.crowning)!.name).toBe('The crowning');
    expect(originWords((await s.h.get(second.id))!, historyEvents(await s.events(), await s.all(), first.id), await s.all())).toBe('Branches from “If the Keep held” at “The crowning” (Year 20).');
    // Deleting the first leaves the second based on the main timeline, with its own change kept.
    await s.h.remove(first.id);
    const kept = (await s.h.get(second.id))!;
    expect([kept.baseId, Object.keys(kept.changed)]).toEqual([null, [s.ids.crowning]]);
  });

  it('point out changes to events the base no longer has, and never apply them', async () => {
    const s = await novel();
    const branch = await s.h.create({ name: 'Gone' });
    await s.h.changeEvent(branch.id, s.ids.fall, { name: 'A softer fall' });
    await s.t.remove(s.ids.fall);
    expect(staleChanges(await s.events(), await s.all(), (await s.h.get(branch.id))!)).toEqual([s.ids.fall]);
    expect(historyEvents(await s.events(), await s.all(), branch.id).has(s.ids.fall)).toBe(false);
    await s.h.forgetStale(branch.id);
    expect((await s.h.get(branch.id))!.changed).toEqual({});
  });

  it('refuse what they cannot hold: unknown places and people are dropped, and changes need a base event', async () => {
    const s = await novel();
    const branch = await s.h.create({ name: 'Odd', originEventId: 'nope', baseId: 'nope' });
    expect([branch.baseId, branch.originEventId, branch.status, branch.kind]).toEqual([null, null, 'experimental', 'hypothetical']);
    await s.h.changeEvent(branch.id, s.ids.siege, { locationId: s.mira.id, characters: [{ id: s.keep.id, age: 3 }] });
    expect((await s.h.get(branch.id))!.changed[s.ids.siege]).toEqual({ locationId: null, characters: [] });
    await expect(s.h.changeEvent(branch.id, 'no-such-event', { name: 'x' })).rejects.toThrow('not in the timeline this history branches from');
  });

  it('travel with the novel: copied with new ids that still point at the copy’s own records, and deleted with it', async () => {
    const s = await novel();
    const branch = await s.h.create({ name: 'If the Keep held', originEventId: s.ids.siege });
    await s.h.changeEvent(branch.id, s.ids.siege, { locationId: s.docks.id });
    const copy = await s.projects.duplicate(s.p.id);
    const [copied] = await s.db.alternateHistories.where('projectId').equals(copy.id).toArray();
    const copyEvents = new Map((await s.db.timelineEvents.where('projectId').equals(copy.id).toArray()).map((e) => [e.id, e]));
    const copyPlaces = (await s.db.loreEntries.where('projectId').equals(copy.id).toArray()).filter((e) => e.category === 'location');
    expect(copyEvents.get(copied.originEventId!)!.name).toBe('The siege');
    expect(copyPlaces.find((e) => e.id === Object.values(copied.changed)[0].locationId)!.name).toBe('The Docks');
    await s.projects.remove(s.p.id);
    expect(await s.db.alternateHistories.where('projectId').equals(s.p.id).count()).toBe(0);
  });
});

describe('comparing timelines', () => {
  it('says event by event what differs between the main timeline and a history, including what moved with a change', async () => {
    const s = await novel();
    const branch = await s.h.create({ name: 'If the Keep held' });
    await s.h.changeEvent(branch.id, s.ids.siege, { when: year(12), locationId: s.docks.id });
    await s.h.removeEvent(branch.id, s.ids.fall);
    const parley = await s.h.addEvent(branch.id, 'The parley');
    await s.h.updateAdded(branch.id, parley.id, { when: year(13) });
    const main = await s.events();
    const stamp = (await s.h.get(branch.id))!.updatedAt;
    const rows = await s.mainRows();
    const diffs = compareTimelines(main, historyEvents(main, await s.all(), branch.id));
    expect(diffs.map((d) => [(d.a ?? d.b)!.name, d.difference, d.fields.join(', '), d.direction])).toEqual([
      ['The founding', 'same', '', null],
      ['The siege', 'changed', 'date, place', null],
      ['The fall of the Keep', 'only-a', '', null],
      // Exile is dated two years after the siege, so it moves with it though nobody changed it.
      ['Exile', 'moved', '', 'later'],
      ['The parley', 'only-b', '', null],
      ['The crowning', 'same', '', null],
    ]);
    expect(comparisonSummary(diffs, 'The main timeline', '“If the Keep held”')).toBe('4 events differ: 1 changed, 1 moved by a change they depend on, 1 only in “If the Keep held”, 1 only in The main timeline.');
    // Comparing wrote nothing anywhere.
    expect([(await s.h.get(branch.id))!.updatedAt, await s.mainRows()]).toEqual([stamp, rows]);
  });

  it('compares two histories with each other, and a timeline with itself as the same', async () => {
    const s = await novel();
    const a = await s.h.create({ name: 'A' });
    const b = await s.h.create({ name: 'B' });
    await s.h.changeEvent(a.id, s.ids.crowning, { name: 'Mira is crowned' });
    await s.h.changeEvent(b.id, s.ids.crowning, { name: 'Orrin is crowned' });
    await s.h.removeEvent(b.id, s.ids.founding);
    const main = await s.events();
    const all = await s.all();
    const diffs = compareTimelines(historyEvents(main, all, a.id), historyEvents(main, all, b.id));
    expect(diffs.filter((d) => d.difference !== 'same').map((d) => [d.difference, d.a?.name ?? null, d.b?.name ?? null])).toEqual([
      ['only-a', 'The founding', null],
      ['changed', 'Mira is crowned', 'Orrin is crowned'],
    ]);
    expect(comparisonSummary(compareTimelines(main, main), 'The main timeline', 'The main timeline')).toBe('The main timeline and The main timeline have the same events.');
  });

  it('a history can stand in for the timeline in every view, without touching the novel', async () => {
    const s = await novel();
    const branch = await s.h.create({ name: 'If the Keep held' });
    await s.h.changeEvent(branch.id, s.ids.siege, { locationId: s.docks.id });
    const model = (await loadModel(s.db, s.p.id))!;
    const seen = withHistory(model, await s.all(), branch.id);
    expect(eventRecords(seen).find((e) => e.id === s.ids.siege)!.location).toEqual({ type: 'entry', id: s.docks.id });
    expect(eventRecords(model).find((e) => e.id === s.ids.siege)!.location).toEqual({ type: 'entry', id: s.keep.id });
    expect(withHistory(model, await s.all(), null)).toBe(model);
  });
});
