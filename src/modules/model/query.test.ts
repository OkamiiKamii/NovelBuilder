import { describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { createCodexService, registerCodex } from '@/modules/codex/service';
import { createConnectionService } from '@/modules/connections/service';
import { createManuscriptService, registerManuscript } from '@/modules/manuscript/service';
import type { StoryNode } from '@/modules/manuscript/types';
import { createPlotService, registerPlot } from '@/modules/plot/service';
import { createProjectService } from '@/modules/projects/service';
import { createTimelineService, registerTimeline } from '@/modules/timeline/service';
import type { EventDate, TimelineEvent } from '@/modules/timeline/types';
import { buildModel, loadModel } from './model';
import { combine, select, selectConnections, type Filter } from './query';

const exact = (year: number, month: number | null = null): EventDate => ({ precision: 'exact', year, month, day: null, hour: null, minute: null });
const date = (when: EventDate) => ({ kind: 'date' as const, when });
let n = 0;

/** A small story: three chapters, two characters, a keep, a faction, a thread, and events dated, vague and undated. */
async function story() {
  const db = new NovelDB(`query-${++n}`);
  const registry = createProjectRegistry();
  const projects = createProjectService(db, registry);
  registerManuscript(registry);
  registerCodex(registry);
  registerTimeline(registry);
  registerPlot(registry);
  const p = await projects.create({ title: 'Ashfall' });
  const ms = createManuscriptService(db, projects.contentChanged).forProject(p.id);
  const codex = createCodexService(db, projects.contentChanged).forProject(p.id);
  const timeline = createTimelineService(db, projects.contentChanged).forProject(p.id);
  const plot = createPlotService(db, projects.contentChanged).forProject(p.id);
  const connections = createConnectionService(db, projects.contentChanged).forProject(p.id);
  const [one, two, three] = [await ms.create('chapter', null, 'One'), await ms.create('chapter', null, 'Two'), await ms.create('chapter', null, 'Three')];
  const mira = await codex.create('character', 'Mira');
  const orrin = await codex.create('character', 'Orrin');
  const keep = await codex.create('location', 'The Keep');
  const wardens = await codex.create('faction', 'The Wardens');
  await connections.create({ from: { type: 'entry', id: mira.id }, to: { type: 'entry', id: wardens.id }, type: 'member-of', validity: { from: date(exact(5)), until: null } });
  await connections.create({ from: { type: 'entry', id: orrin.id }, to: { type: 'entry', id: wardens.id }, type: 'member-of', validity: { from: date({ precision: 'unknown' }), until: null } });
  const heir = await plot.create('The heir');
  const event = async (name: string, changes: Parameters<typeof timeline.update>[1]) => {
    const e = await timeline.create(name);
    await timeline.update(e.id, changes);
    return e;
  };
  const siege = await event('The siege', { when: exact(10, 6), locationId: keep.id, characters: [{ id: mira.id, age: 19 }], nodeIds: [two.id], threadIds: [heir.id] });
  const fall = await event('The fall', { when: exact(15), characters: [{ id: orrin.id, age: null }], nodeIds: [three.id], canon: 'non-canon' });
  const rumour = await event('A rumour', {});
  const omen = await event('An omen', { when: exact(10), nodeIds: [one.id], status: 'idea' });
  return { db, p, one, two, three, mira, orrin, keep, wardens, heir, siege, fall, rumour, omen, model: async () => (await loadModel(db, p.id))! };
}

const names = (result: { items: { label: string }[] }) => result.items.map((i) => i.label);

describe('combined filters', () => {
  it('narrows with every field, and widens within one', async () => {
    const s = await story();
    const model = await s.model();
    expect(names(select(model, { types: ['event'], characters: [s.mira.id] }))).toEqual(['The siege']);
    expect(names(select(model, { types: ['event'], characters: [s.mira.id, s.orrin.id] }))).toEqual(['The fall', 'The siege']);
    expect(names(select(model, { types: ['event'], characters: [s.mira.id, s.orrin.id], locations: [s.keep.id] }))).toEqual(['The siege']);
    expect(names(select(model, { types: ['event'], threads: [s.heir.id], chapters: { from: s.two.id, to: s.three.id } }))).toEqual(['The siege']);
    expect(names(select(model, { types: ['event'], canon: ['non-canon'] }))).toEqual(['The fall']);
    expect(names(select(model, { types: ['event'], status: ['idea'] }))).toEqual(['An omen']);
    expect(names(select(model, { types: ['entry'], categories: ['character'], text: 'MI' }))).toEqual(['Mira']);
    // A faction filter finds what is directly connected to the faction, and the faction itself.
    expect(names(select(model, { factions: [s.wardens.id] }))).toEqual(['Mira', 'Orrin', 'The Wardens']);
  });

  it('gives the same answer, in the same order, whichever order the filters are written in', async () => {
    const s = await story();
    const model = await s.model();
    const a: Filter = { types: ['event'], characters: [s.mira.id, s.orrin.id], chapters: { from: s.one.id } };
    const b: Filter = { chapters: { from: s.one.id }, characters: [s.orrin.id, s.mira.id], types: ['event'] };
    expect(select(model, a)).toEqual(select(model, b));
    expect(select(model, a)).toEqual(select(model, a));
    expect(combine({ characters: [s.mira.id, s.orrin.id], types: ['event'] }, { characters: [s.orrin.id], text: 'fall' })).toEqual({ characters: [s.orrin.id], types: ['event'], text: 'fall' });
  });
});

describe('records the filter cannot decide about', () => {
  it('says why, instead of leaving them out without a word', async () => {
    const s = await story();
    const model = await s.model();
    const inYears = select(model, { types: ['event'], time: { from: date(exact(9)), until: date(exact(12)) } });
    expect(names(inYears)).toEqual(['An omen', 'The siege']);
    expect(inYears.undecided).toEqual([{ filter: 'time', reason: 'no date that can be worked out', refs: [{ type: 'event', id: s.rumour.id }] }]);
    expect(inYears.considered).toBe(4);

    const told = select(model, { types: ['event'], chapters: { from: s.one.id, to: s.two.id } });
    expect(names(told)).toEqual(['An omen', 'The siege']);
    expect(told.undecided.map((u) => [u.reason, u.refs.map((r) => r.id)])).toEqual([['not told in any chapter', [s.rumour.id]]]);

    // Asked of everything, a time range says which kinds of record it cannot place.
    const everything = select(model, { time: { from: date(exact(14)) } });
    expect(names(everything)).toEqual(['The fall']);
    expect(everything.undecided.map((u) => [u.reason, u.refs.length])).toEqual([['no date that can be worked out', 1], ['no place in story time (only events have one)', 3 + 4 + 1]]);
  });

  it('does not guess where a date and a range are too broad to compare', async () => {
    const s = await story();
    // "An omen" is some time in Year 10; the range starts in June of Year 10.
    const result = select(await s.model(), { types: ['event'], time: { from: date(exact(10, 6)), until: date(exact(11)) } });
    expect(names(result)).toEqual(['The siege']);
    expect(result.undecided.map((u) => [u.reason, u.refs.map((r) => r.id)])).toEqual([['date too broad to tell against the range', [s.omen.id]], ['no date that can be worked out', [s.rumour.id]]]);
  });

  it('answers with nothing, and no reasons, when nothing matches', async () => {
    const s = await story();
    const model = await s.model();
    expect(select(model, { characters: ['nobody'] })).toEqual({ items: [], undecided: [], considered: model.nodes.size + model.entries.size + model.events.size + model.threads.size });
    expect(select(model, { types: ['event'], text: 'dragon' }).items).toEqual([]);
    expect(select(model, { types: ['event'], characters: [s.mira.id], canon: ['non-canon'] }).items).toEqual([]);
  });

  it('copes with records missing the lists and fields added over time', () => {
    const node = (id: string, order: number): StoryNode => ({ id, projectId: 'p', parentId: null, kind: 'chapter', title: id, order, summary: '', notes: '', status: 'idea', wordCount: 0, charCount: 0, createdAt: 0, updatedAt: 0 });
    const model = buildModel({
      project: { id: 'p' } as never, nodes: [node('c1', 0)], plans: [], schemas: [], links: [], relations: [], systems: [], sheets: [],
      entries: [{ id: 'e1', projectId: 'p', category: 'character', name: 'Mira' } as never],
      events: [{ id: 'v1', projectId: 'p', name: 'Old event', when: { precision: 'unknown' } } as never],
      threads: [{ id: 't1', projectId: 'p', title: 'Old thread', status: 'active' } as never],
    });
    const result = select(model, { chapters: { from: 'c1' }, canon: ['canon'] });
    expect(names(result)).toEqual([]);
    expect(result.undecided.map((u) => `${u.filter}: ${u.reason}`)).toEqual([
      'canon: no canon status of its own',
      'chapters: no development placed in a chapter',
      'chapters: not linked to any chapter',
      'chapters: not told in any chapter',
    ]);
    // The old event reads as canon, so canon alone is decided for it.
    expect(names(select(model, { types: ['event'], canon: ['canon'] }))).toEqual(['Old event']);
  });
});

describe('connections', () => {
  it('finds connections by kind, end and time, and says when time cannot tell', async () => {
    const s = await story();
    const model = await s.model();
    const members = selectConnections(model, { types: ['member-of'], time: { from: date(exact(8)), until: date(exact(9)) } });
    expect(members.items.map((c) => c.from.id)).toEqual([s.mira.id]);
    expect(members.undecided.map((u) => [u.reason, u.connections.map((c) => c.from.id)])).toEqual([['when it holds cannot be compared with the range', [s.orrin.id]]]);
    expect(selectConnections(model, { types: ['member-of'], time: { until: date(exact(3)) } }).items).toEqual([]);
    expect(selectConnections(model, { kinds: ['participant'], involving: [s.siege.id] }).items.map((c) => c.from.id)).toEqual([s.mira.id]);
    expect(selectConnections(model, { kinds: ['participant'], canon: ['canon'] }).undecided[0].reason).toBe('no canon status of its own');
  });
});

describe('large stories', () => {
  it('filters 5,000 events, 1,000 entries and 10,000 connections quickly, the same way every time', () => {
    const N = 5000;
    const nodes = Array.from({ length: 200 }, (_, i): StoryNode => ({ id: `c${i}`, projectId: 'p', parentId: null, kind: 'chapter', title: `Chapter ${i}`, order: i, summary: '', notes: '', status: 'idea', wordCount: 0, charCount: 0, mentions: [`e${i}`], createdAt: 0, updatedAt: 0 }));
    const entries = Array.from({ length: 1000 }, (_, i) => ({ id: `e${i}`, projectId: 'p', category: i % 10 === 0 ? 'location' : 'character', name: `Entry ${i}`, summary: '', description: '', image: null, notes: '', tags: [], fields: [], createdAt: 0, updatedAt: 0 }));
    const events = Array.from({ length: N }, (_, i): TimelineEvent => ({
      id: `v${i}`, projectId: 'p', name: `Event ${i}`, description: '', when: i % 7 === 0 ? { precision: 'unknown' } : exact(i % 300), duration: null, importance: 'minor',
      locationId: `e${(i % 100) * 10}`, characters: [{ id: `e${(i % 999) + 1}`, age: null }], entryIds: [], nodeIds: [`c${i % 200}`], afterId: null, createdAt: i, updatedAt: i,
    }));
    const links = Array.from({ length: 10000 }, (_, i) => ({ id: `l${i}`, projectId: 'p', fromId: `e${i % 1000}`, toId: `e${(i * 7 + 3) % 1000}`, fromLabel: '', toLabel: '', createdAt: 0 }));
    const model = buildModel({ project: { id: 'p' } as never, nodes, plans: [], entries, schemas: [], links, relations: [], events, threads: [], systems: [], sheets: [] });
    const filter: Filter = { types: ['event'], characters: ['e5', 'e6', 'e7'], locations: ['e50', 'e60'], time: { from: date(exact(10)), until: date(exact(200)) } };
    select(model, { types: ['event'] }); // builds the connection index once
    const start = performance.now();
    const result = select(model, filter);
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(300);
    expect(result.considered).toBe(N);
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.every((i) => i.ref.type === 'event')).toBe(true);
    expect(result.undecided.every((u) => u.reason === 'no date that can be worked out')).toBe(true);
    expect(select(model, filter)).toEqual(result);
  });
});
