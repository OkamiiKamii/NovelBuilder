import { describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { createBranchingService } from '@/modules/branching/service';
import { createCodexService, registerCodex } from '@/modules/codex/service';
import { createManuscriptService, registerManuscript } from '@/modules/manuscript/service';
import { createPlotService, registerPlot } from '@/modules/plot/service';
import { createProjectService } from '@/modules/projects/service';
import { createTimelineService, registerTimeline } from '@/modules/timeline/service';
import type { EventDate, TimelineEvent } from '@/modules/timeline/types';
import { deriveConnections } from './connections';
import { eventRecord, eventRecords, eventShape, validateEvent } from './events';
import { loadModel } from './model';
import { spanOfEvent, timeContext } from './validity';

const exact = (year: number, month: number | null = null, day: number | null = null): EventDate => ({ precision: 'exact', year, month, day, hour: null, minute: null });
let n = 0;

async function world() {
  const db = new NovelDB(`events-${++n}`);
  const registry = createProjectRegistry();
  const projects = createProjectService(db, registry);
  registerManuscript(registry);
  registerCodex(registry);
  registerTimeline(registry);
  registerPlot(registry);
  const manuscript = createManuscriptService(db, projects.contentChanged);
  const p = await projects.create({ title: 'Ashfall' });
  const codex = createCodexService(db, projects.contentChanged).forProject(p.id);
  return {
    db, projects, manuscript, p, codex,
    ms: manuscript.forProject(p.id),
    timeline: createTimelineService(db, projects.contentChanged).forProject(p.id),
    plot: createPlotService(db, projects.contentChanged).forProject(p.id),
    model: async (id = p.id) => (await loadModel(db, id))!,
  };
}

describe('the event record', () => {
  it('starts with nothing the author did not give it', async () => {
    const w = await world();
    const made = await w.timeline.create();
    expect(made).toMatchObject({ name: 'New event', description: '', when: { precision: 'unknown' }, duration: null, characters: [], entryIds: [], nodeIds: [], locationId: null, afterId: null });
    expect(['end', 'ongoing', 'threadIds', 'status', 'canon', 'reveals'].filter((k) => k in made)).toEqual([]);
    expect(eventRecord(await w.model(), made.id)).toMatchObject({ shape: 'instant', label: 'Undated', span: null, status: 'confirmed', canon: 'canon', told: [], threads: [], branch: { status: 'main', label: 'Main Canon' } });
  });

  it('reads an event stored before these fields existed with plain defaults', async () => {
    const w = await world();
    const old: TimelineEvent = { id: 'old', projectId: w.p.id, name: 'The founding', description: '', when: exact(1), duration: null, importance: 'major', locationId: null, characters: [], entryIds: [], nodeIds: [], afterId: null, createdAt: 1, updatedAt: 1 };
    await w.db.timelineEvents.add(old);
    const model = await w.model();
    expect(eventRecord(model, 'old')).toMatchObject({ title: 'The founding', shape: 'instant', status: 'confirmed', canon: 'canon', significance: 'major', end: null, threads: [] });
    expect(validateEvent(model, old)).toEqual([]);
    expect(await w.db.timelineEvents.get('old')).toEqual(old);
  });

  it('keeps when it happened apart from where the reader meets it: a flashback is early in one and late in the other', async () => {
    const w = await world();
    const one = await w.ms.create('chapter', null, 'One');
    const two = await w.ms.create('chapter', null, 'Two');
    const three = await w.ms.create('chapter', null, 'Three');
    const childhood = await w.timeline.create('Childhood fire');
    const siege = await w.timeline.create('The siege');
    await w.timeline.update(childhood.id, { when: exact(1), nodeIds: [three.id, one.id], reveals: [{ nodeId: three.id, role: 'flashback' }, { nodeId: one.id, role: 'foreshadowed' }] });
    await w.timeline.update(siege.id, { when: exact(20), nodeIds: [one.id, two.id] });
    const model = await w.model();
    const fire = eventRecord(model, childhood.id)!;
    expect(fire.told.map((t) => [t.ref.id, t.role])).toEqual([[one.id, 'foreshadowed'], [three.id, 'flashback']]);
    expect(eventRecord(model, siege.id)!.told.map((t) => t.role)).toEqual(['told', 'told']);
    // Story time puts the fire first; reading order meets it last, in chapter three.
    const byTime = eventRecords(model).sort((a, b) => a.span!.lo - b.span!.lo).map((e) => e.title);
    expect(byTime).toEqual(['Childhood fire', 'The siege']);
    expect(Math.max(...fire.told.map((t) => t.position!))).toBeGreaterThan(Math.max(...eventRecord(model, siege.id)!.told.map((t) => t.position!)));
    // Reordering chapters moves where it is told and nothing else.
    await w.ms.nudge(three.id, -1);
    await w.ms.nudge(three.id, -1);
    const after = eventRecord(await w.model(), childhood.id)!;
    expect(after.told.map((t) => t.ref.id)).toEqual([three.id, one.id]);
    expect(after.start).toEqual(exact(1));
    expect(deriveConnections(await w.model()).connections.filter((c) => c.kind === 'told-in' && c.from.id === childhood.id).map((c) => c.label).sort()).toEqual(['Flashback in', 'Foreshadowed in']);
  });
});

describe('instants, stretches and things still going on', () => {
  it('says how long an event lasts one way at a time', async () => {
    const w = await world();
    const war = await w.timeline.create('The long war');
    const last = async () => (await w.timeline.get(war.id))!;
    await w.timeline.update(war.id, { when: exact(10), duration: { amount: 5, unit: 'years' } });
    expect([eventShape(await last()), (await last()).duration]).toEqual(['span', { amount: 5, unit: 'years' }]);
    await w.timeline.update(war.id, { end: exact(18) });
    expect(await last()).toMatchObject({ duration: null, end: exact(18), ongoing: false });
    await w.timeline.update(war.id, { ongoing: true });
    expect(await last()).toMatchObject({ duration: null, end: null, ongoing: true });
    await w.timeline.update(war.id, { duration: { amount: 2, unit: 'days' } });
    expect(await last()).toMatchObject({ duration: { amount: 2, unit: 'days' }, end: null, ongoing: false });
    await w.timeline.update(war.id, { duration: null });
    expect(eventShape(await last())).toBe('instant');
  });

  it('places each shape in story time, with no end where none is known', async () => {
    const w = await world();
    const make = async (name: string, changes: Parameters<typeof w.timeline.update>[1]) => {
      const e = await w.timeline.create(name);
      await w.timeline.update(e.id, changes);
      return e.id;
    };
    const ids = {
      instant: await make('Coronation', { when: { precision: 'exact', year: 12, month: 3, day: 4, hour: 9, minute: 0 } }),
      span: await make('Journey', { when: exact(12, 3, 4), end: exact(12, 3, 9) }),
      ongoing: await make('Curse', { when: exact(5), ongoing: true }),
      unknownEnd: await make('Exile', { when: exact(7), end: { precision: 'unknown' } }),
    };
    const model = await w.model();
    const span = (id: string) => spanOfEvent(id, timeContext(model))!;
    expect(span(ids.instant).hi).toBe(span(ids.instant).lo);
    expect(span(ids.span).hi - span(ids.span).lo + 1).toBe(6 * 1440);
    expect([span(ids.ongoing).hi, span(ids.unknownEnd).hi]).toEqual([Infinity, Infinity]);
    expect(eventRecord(model, ids.span)!.label).toBe('Year 12, March 4 to Year 12, March 9');
    expect(eventRecord(model, ids.ongoing)).toMatchObject({ shape: 'ongoing', label: 'Year 5, still going on' });
  });
});

describe('validation', () => {
  it('cleans what is stored: threads, status, canon and reveals that do not fit are not kept', async () => {
    const w = await world();
    const other = await world();
    const thread = await w.plot.create('The heir');
    const foreign = await other.plot.create('Not here');
    const one = await w.ms.create('chapter', null, 'One');
    const two = await w.ms.create('chapter', null, 'Two');
    const e = await w.timeline.create('The siege');
    await w.timeline.update(e.id, {
      threadIds: [thread.id, foreign.id, 'nope'], status: 'maybe' as never, canon: 'probably' as never, nodeIds: [one.id, two.id],
      reveals: [{ nodeId: one.id, role: 'flashback' }, { nodeId: one.id, role: 'mentioned' }, { nodeId: two.id, role: 'told' }, { nodeId: 'elsewhere', role: 'revealed' }, { nodeId: two.id, role: 'dreamt' as never }],
    });
    expect(await w.timeline.get(e.id)).toMatchObject({ threadIds: [thread.id], status: 'confirmed', canon: 'canon', reveals: [{ nodeId: one.id, role: 'flashback' }] });
    // Taking a chapter away takes its reveal with it.
    await w.timeline.update(e.id, { nodeIds: [two.id] });
    expect((await w.timeline.get(e.id))!.reveals).toEqual([]);
    await w.timeline.update(e.id, { status: 'idea', canon: 'non-canon', end: { precision: 'relative', anchorId: other.p.id, amount: 1, unit: 'days', direction: 'after' } });
    expect(await w.timeline.get(e.id)).toMatchObject({ status: 'idea', canon: 'non-canon', end: { precision: 'relative', anchorId: null } });
  });

  it('reports what contradicts itself or points at what is gone, and changes nothing', async () => {
    const w = await world();
    const keep = await w.codex.create('location', 'The Keep');
    const e = await w.timeline.create('The siege');
    await w.timeline.update(e.id, { when: exact(10), end: exact(8), locationId: keep.id });
    await w.codex.remove(keep.id);
    const stored = (await w.timeline.get(e.id))!;
    expect(validateEvent(await w.model(), stored)).toEqual(['it ends before it starts', `the place ${keep.id} no longer exists`]);
    // Imported or older data can say how long it lasts twice; it is reported, not resolved.
    const twice = { ...stored, end: exact(11), duration: { amount: 1, unit: 'days' as const }, reveals: [{ nodeId: 'x', role: 'flashback' as const }] };
    expect(validateEvent(await w.model(), twice)).toEqual(['its length is given more than one way: an end date and a duration', 'it is marked as flashback in a chapter it is not told in', `the place ${keep.id} no longer exists`]);
    expect(validateEvent(await w.model(), { ...stored, name: undefined as never })).toEqual(['name is missing or not a string']);
    expect(await w.timeline.get(e.id)).toEqual(stored);
  });
});

describe('threads, copies and branches', () => {
  it('lets an event leave a thread that is deleted, and keeps everything else', async () => {
    const w = await world();
    const heir = await w.plot.create('The heir');
    const war = await w.plot.create('The war');
    const e = await w.timeline.create('The siege');
    await w.timeline.update(e.id, { threadIds: [heir.id, war.id], when: exact(10) });
    expect(deriveConnections(await w.model()).connections.filter((c) => c.kind === 'in-thread').length).toBe(2);
    await w.plot.remove(heir.id);
    expect(await w.timeline.get(e.id)).toMatchObject({ threadIds: [war.id], when: exact(10), name: 'The siege' });
  });

  it('carries threads, reveals and end dates into a copy, and names the branch a fork is', async () => {
    const w = await world();
    const one = await w.ms.create('chapter', null, 'One');
    const two = await w.ms.create('chapter', null, 'Two');
    const thread = await w.plot.create('The heir');
    const siege = await w.timeline.create('The siege');
    const fall = await w.timeline.create('The fall');
    await w.timeline.update(siege.id, { when: exact(10) });
    await w.timeline.update(fall.id, { when: exact(11), end: { precision: 'relative', anchorId: siege.id, amount: 2, unit: 'years', direction: 'after' }, threadIds: [thread.id], nodeIds: [one.id, two.id], reveals: [{ nodeId: two.id, role: 'flashback' }] });

    const copy = await w.projects.duplicate(w.p.id);
    const model = await w.model(copy.id);
    const copied = [...model.events.values()].find((e) => e.name === 'The fall')!;
    const newSiege = [...model.events.values()].find((e) => e.name === 'The siege')!;
    const newTwo = [...model.nodes.values()].find((n) => n.title === 'Two')!;
    expect(copied).toMatchObject({ threadIds: [[...model.threads.keys()][0]], end: { anchorId: newSiege.id }, reveals: [{ nodeId: newTwo.id, role: 'flashback' }] });
    expect(validateEvent(model, copied)).toEqual([]);

    // A timeline forked after chapter one keeps the event, told only where that timeline has the chapter.
    const forked = await createBranchingService(w.db, w.projects, w.manuscript).fork(w.p.id, one.id, { status: 'alternate' });
    const alternate = await w.model(forked.id);
    const fallThere = eventRecord(alternate, [...alternate.events.values()].find((e) => e.name === 'The fall')!.id)!;
    expect(fallThere.told.map((t) => t.role)).toEqual(['told']);
    expect(fallThere.branch).toEqual({ status: 'alternate', label: 'Alternate Canon' });
    expect(eventRecord(await w.model(), fall.id)!.branch.status).toBe('main');
  });
});
