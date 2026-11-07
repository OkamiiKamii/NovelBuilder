import { describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { createCodexService, registerCodex } from '@/modules/codex/service';
import { createConnectionService, InvalidConnectionError } from '@/modules/connections/service';
import { createManuscriptService, registerManuscript } from '@/modules/manuscript/service';
import { createProjectService } from '@/modules/projects/service';
import { storyOrder } from '@/modules/relationships/timeline';
import type { CharacterRelation, RelationStage } from '@/modules/relationships/types';
import { createTimelineService, registerTimeline } from '@/modules/timeline/service';
import type { EventDate, TimelineEvent } from '@/modules/timeline/types';
import { deriveConnections } from './connections';
import { loadModel } from './model';
import { validateConnection } from './validate';
import { historyOf, overlaps, ruleValidity, snapshotValidities, spanOfDate, stageValidities, statesAt, timeContext, validAt, type Anchor, type TimeContext, type Validity } from './validity';

const exact = (year: number, month: number | null = null, day: number | null = null): EventDate => ({ precision: 'exact', year, month, day, hour: null, minute: null });
const around = (year: number, season: 'spring' | 'summer' | 'autumn' | 'winter' | null = null, month: number | null = null): EventDate => ({ precision: 'approximate', year, month, season });
const date = (when: EventDate): Anchor => ({ kind: 'date', when });
const UNKNOWN: EventDate = { precision: 'unknown' };

const event = (id: string, when: EventDate, duration: TimelineEvent['duration'] = null): TimelineEvent => ({ id, projectId: 'p', name: id, description: '', when, duration, importance: 'minor', locationId: null, characters: [], entryIds: [], nodeIds: [], afterId: null, createdAt: 0, updatedAt: 0 });

/** Chapters c1…c5 in reading order, and a few events. */
const context: TimeContext = {
  position: new Map(['c1', 'c2', 'c3', 'c4', 'c5'].map((id, i) => [id, i])),
  events: new Map([
    ['siege', event('siege', exact(10, 6, 1), { amount: 3, unit: 'days' })],
    ['coronation', event('coronation', exact(12))],
    ['fall', event('fall', { precision: 'relative', anchorId: 'siege', amount: 2, unit: 'years', direction: 'after' })],
    ['undated', event('undated', UNKNOWN)],
  ]),
};
const at = (anchor: Anchor, validity: Validity) => validAt(validity, anchor, context);

describe('points in the story, as precise as the story is', () => {
  it('takes a date to cover as much time as it says, and no more', () => {
    const span = (when: EventDate) => spanOfDate(when, context)!;
    expect(span(exact(10, 6, 1)).hi - span(exact(10, 6, 1)).lo + 1).toBe(1440);
    expect(span(exact(10, 6)).hi - span(exact(10, 6)).lo + 1).toBe(525_600 / 12);
    expect(span(exact(10)).hi - span(exact(10)).lo + 1).toBe(525_600);
    expect(span(around(10, 'summer')).hi - span(around(10, 'summer')).lo + 1).toBe(525_600 / 4);
    expect(span({ precision: 'exact', year: 10, month: 6, day: 1, hour: 20, minute: 30 })).toEqual({ lo: span(exact(10, 6, 1)).lo + 20 * 60 + 30, hi: span(exact(10, 6, 1)).lo + 20 * 60 + 30 });
    // Two years after a three-day siege is a three-day stretch two years on.
    expect(span({ precision: 'relative', anchorId: 'siege', amount: 2, unit: 'years', direction: 'after' })).toEqual({ lo: span(exact(12, 6, 1)).lo, hi: span(exact(12, 6, 1)).lo + 3 * 1440 - 1 });
    expect(spanOfDate(UNKNOWN, context)).toBeNull();
    expect(spanOfDate({ precision: 'relative', anchorId: 'undated', amount: 1, unit: 'days', direction: 'after' }, context)).toBeNull();
    expect(spanOfDate({ precision: 'relative', anchorId: 'gone', amount: 1, unit: 'days', direction: 'after' }, context)).toBeNull();
    expect(span(exact(-500)).lo).toBeLessThan(span(exact(0)).lo);
  });
});

describe('transitions', () => {
  const before: Validity = { from: null, until: { kind: 'event', eventId: 'siege' } };
  const after: Validity = { from: { kind: 'event', eventId: 'siege' }, until: null };

  it('hands over at the moment of change: one holds before it, the other from it', () => {
    expect([at(date(exact(9)), before), at(date(exact(9)), after)]).toEqual([true, false]);
    expect([at(date(exact(11)), before), at(date(exact(11)), after)]).toEqual([false, true]);
    expect([at({ kind: 'event', eventId: 'coronation' }, before), at({ kind: 'event', eventId: 'coronation' }, after)]).toEqual([false, true]);
    // During the three-day siege itself, which of the two holds is not settled by the dates.
    expect([at(date(exact(10, 6, 2)), before), at(date(exact(10, 6, 2)), after)]).toEqual(['unknown', 'unknown']);
  });

  it('works the same way in reading order, from a chapter on and until a later one', () => {
    const fromThree: Validity = { from: { kind: 'node', nodeId: 'c3' }, until: { kind: 'node', nodeId: 'c5' } };
    expect(['c2', 'c3', 'c4', 'c5'].map((c) => at({ kind: 'node', nodeId: c }, fromThree))).toEqual([false, true, true, false]);
  });

  it('answers “unknown” where only a guess could answer: across axes, unknown dates, a change somewhere inside the time asked about', () => {
    const fromThree: Validity = { from: { kind: 'node', nodeId: 'c3' }, until: null };
    // Chapter 3 is a place in the reading; Year 11 is a time in the story. A flashback can be either side of it.
    expect(at(date(exact(11)), fromThree)).toBe('unknown');
    expect(at({ kind: 'node', nodeId: 'c4' }, after)).toBe('unknown');
    expect(at(date(exact(11)), { from: date(UNKNOWN), until: null })).toBe('unknown');
    expect(at({ kind: 'event', eventId: 'undated' }, after)).toBe('unknown');
    expect(at({ kind: 'node', nodeId: 'deleted' }, fromThree)).toBe('unknown');
    // "Some time in Year 10" against a change in the summer of Year 10.
    expect(at(date(exact(10)), { from: date(around(10, 'summer')), until: null })).toBe('unknown');
    expect(at(date(exact(10, 9)), { from: date(around(10, 'summer')), until: null })).toBe(true);
  });

  it('holds from the start and stays open when no ends are given', () => {
    expect(at(date(exact(-9999)), { from: null, until: null })).toBe(true);
    expect(at({ kind: 'node', nodeId: 'c5' }, { from: { kind: 'node', nodeId: 'c1' }, until: null })).toBe(true);
  });
});

describe('overlapping intervals', () => {
  it('tells overlapping, touching and separate stretches apart, and says when it cannot tell', () => {
    const years = (a: number, b: number | null): Validity => ({ from: date(exact(a)), until: b === null ? null : date(exact(b)) });
    expect(overlaps(years(10, 15), years(12, 20), context)).toBe(true);
    expect(overlaps(years(10, 12), years(12, 20), context)).toBe(false);
    expect(overlaps(years(10, 11), years(13, null), context)).toBe(false);
    expect(overlaps(years(10, null), years(30, null), context)).toBe(true);
    expect(overlaps({ from: null, until: null }, years(1, 2), context)).toBe(true);
    // Ending "in Year 12" and starting "in the summer of Year 12": it depends on which month.
    expect(overlaps({ from: date(exact(10)), until: date(exact(12)) }, { from: date(around(12, 'summer')), until: null }, context)).toBe('unknown');
    expect(overlaps({ from: null, until: date(UNKNOWN) }, years(5, 6), context)).toBe('unknown');
    expect(overlaps({ from: { kind: 'node', nodeId: 'c1' }, until: { kind: 'node', nodeId: 'c3' } }, { from: { kind: 'node', nodeId: 'c3' }, until: null }, context)).toBe(false);
  });
});

describe('history', () => {
  it('lists every state in the order it began, keeping those it cannot place, and finds the ones that hold at a point', () => {
    const states = [
      { name: 'unknown start', validity: { from: date(UNKNOWN), until: null } },
      { name: 'Year 12', validity: { from: date(exact(12)), until: null } },
      { name: 'chapter 2', validity: { from: { kind: 'node', nodeId: 'c2' }, until: null } },
      { name: 'always', validity: { from: null, until: date(exact(5)) } },
      { name: 'Year 3', validity: { from: date(exact(3)), until: date(exact(12)) } },
    ] satisfies { name: string; validity: Validity }[];
    expect(historyOf(states, (s) => s.validity, context).map((s) => s.name)).toEqual(['always', 'Year 3', 'Year 12', 'chapter 2', 'unknown start']);
    expect(statesAt(states, (s) => s.validity, date(exact(8)), context).map((s) => [s.state.name, s.holds])).toEqual([['Year 3', true], ['chapter 2', 'unknown'], ['unknown start', 'unknown']]);
  });

  it('reads what already changes over the story as validities, without changing anything stored', () => {
    const order = storyOrder(['c1', 'c2', 'c3', 'c4', 'c5'].map((id, i) => ({ id, projectId: 'p', parentId: null, kind: 'chapter' as const, title: id, order: i, summary: '', notes: '', status: 'idea' as const, wordCount: 0, charCount: 0, createdAt: 0, updatedAt: 0 })));
    const stage = (id: string, startNodeId: string | null): RelationStage => ({ id, startNodeId, preset: 'friends', category: 'social', label: id, fromRole: '', toRole: '', directional: false, title: '', affinity: 'neutral', event: '', notes: '' });
    const relation: CharacterRelation = { id: 'r', projectId: 'p', fromId: 'a', toId: 'b', stages: [stage('enemies', 'c4'), stage('friends', null)], createdAt: 0, updatedAt: 0 };
    const stages = stageValidities(relation, order);
    expect(stages.map((s) => [s.stage.id, s.validity])).toEqual([
      ['friends', { from: null, until: { kind: 'node', nodeId: 'c4' } }],
      ['enemies', { from: { kind: 'node', nodeId: 'c4' }, until: null }],
    ]);
    const ctx = { position: order.position, events: new Map() };
    expect(stages.map((s) => validAt(s.validity, { kind: 'node', nodeId: 'c3' }, ctx))).toEqual([true, false]);
    expect(ruleValidity({ fromNodeId: 'c2', untilNodeId: null })).toEqual({ from: { kind: 'node', nodeId: 'c2' }, until: null });
    const snap = (id: string, nodeId: string | null) => ({ id, nodeId, createdAt: 0 }) as never;
    expect(snapshotValidities([snap('later', 'c5'), snap('start', null), snap('mid', 'c2')], order).map((s) => [s.snapshot.id, validAt(s.validity, { kind: 'node', nodeId: 'c3' }, ctx)])).toEqual([['start', false], ['mid', true], ['later', false]]);
  });
});

describe('stored on connections', () => {
  let n = 0;
  async function world() {
    const db = new NovelDB(`validity-${++n}`);
    const registry = createProjectRegistry();
    const projects = createProjectService(db, registry);
    registerManuscript(registry);
    registerCodex(registry);
    registerTimeline(registry);
    const p = await projects.create({ title: 'Ashfall' });
    const codex = createCodexService(db, projects.contentChanged).forProject(p.id);
    const timeline = createTimelineService(db, projects.contentChanged).forProject(p.id);
    const siege = await timeline.create('The siege');
    await timeline.update(siege.id, { when: exact(10, 6, 1) });
    return {
      db, projects, p, codex, timeline, siege,
      ms: createManuscriptService(db, projects.contentChanged).forProject(p.id),
      connections: createConnectionService(db, projects.contentChanged).forProject(p.id),
      mira: await codex.create('character', 'Mira'),
      orrin: await codex.create('character', 'Orrin'),
      blade: await codex.create('item', 'Ashblade'),
      wardens: await codex.create('faction', 'The Wardens'),
    };
  }
  const entry = (x: { id: string }) => ({ type: 'entry' as const, id: x.id });

  it('records a change of owner as two states, keeping the first, and answers who held it when', async () => {
    const w = await world();
    const first = await w.connections.create({ from: entry(w.mira), to: entry(w.blade), type: 'owns' });
    const second = await w.connections.change(first.id, { kind: 'event', eventId: w.siege.id }, { from: entry(w.orrin), label: 'Took' });
    const rows = await w.connections.list();
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === first.id)).toMatchObject({ fromId: w.mira.id, validity: { from: null, until: { kind: 'event', eventId: w.siege.id } } });
    expect(second).toMatchObject({ fromId: w.orrin.id, toId: w.blade.id, type: 'owns', fromLabel: 'Took', validity: { from: { kind: 'event', eventId: w.siege.id }, until: null } });

    const model = (await loadModel(w.db, w.p.id))!;
    const ctx = timeContext(model);
    const owners = (when: Anchor) => statesAt(rows, (r) => r.validity ?? { from: null, until: null }, when, ctx).map((s) => [model.entries.get(s.state.fromId)!.name, s.holds]);
    expect(owners(date(exact(9)))).toEqual([['Mira', true]]);
    expect(owners(date(exact(11)))).toEqual([['Orrin', true]]);
    expect(historyOf(rows, (r) => r.validity!, ctx).map((r) => model.entries.get(r.fromId)!.name)).toEqual(['Mira', 'Orrin']);
  });

  it('ends a membership without deleting it, and keeps a later return as its own state', async () => {
    const w = await world();
    const first = await w.connections.create({ from: entry(w.mira), to: entry(w.wardens), type: 'member-of', validity: { from: date(around(5)), until: null } });
    await w.connections.end(first.id, date(exact(8)));
    const back = await w.connections.create({ from: entry(w.mira), to: entry(w.wardens), type: 'member-of', validity: { from: date(exact(12)), until: null } });
    const rows = new Map((await w.connections.list()).map((r) => [r.id, r]));
    expect(rows.size).toBe(2);
    const ctx = timeContext((await loadModel(w.db, w.p.id))!);
    const member = (year: number) => [first.id, back.id].map((id) => validAt(rows.get(id)!.validity!, date(exact(year)), ctx));
    expect([member(6), member(9), member(13)]).toEqual([[true, false], [false, false], [false, true]]);
  });

  it('refuses points that are not in the project or are not dates', async () => {
    const w = await world();
    const other = await world();
    const make = (validity: Validity) => w.connections.create({ from: entry(w.mira), to: entry(w.wardens), type: 'member-of', validity });
    await expect(make({ from: { kind: 'event', eventId: other.siege.id }, until: null })).rejects.toThrow('When it starts: that event is not in this project.');
    await expect(make({ from: null, until: { kind: 'node', nodeId: 'nowhere' } })).rejects.toThrow('When it stops: that chapter or scene is not in this project.');
    await expect(make({ from: date({ precision: 'someday' } as never), until: null })).rejects.toBeInstanceOf(InvalidConnectionError);
    await expect(make({ from: date({ precision: 'relative', anchorId: 'gone', amount: 1, unit: 'days', direction: 'after' }), until: null })).rejects.toThrow('the event the date counts from is not in this project');
    // Unknown and open ends are allowed: the story need not say.
    await make({ from: date(UNKNOWN), until: null });
  });

  it('reports a point whose event was deleted, and carries points into a copy of the project', async () => {
    const w = await world();
    const chapter = await w.ms.create('chapter', null, 'One');
    await w.connections.create({ from: entry(w.mira), to: entry(w.wardens), type: 'member-of', validity: { from: { kind: 'node', nodeId: chapter.id }, until: { kind: 'event', eventId: w.siege.id } } });
    const copy = await w.projects.duplicate(w.p.id);
    const copied = (await loadModel(w.db, copy.id))!;
    const [link] = deriveConnections(copied).connections.filter((c) => c.kind === 'link');
    const [newChapter] = copied.nodes.values();
    const [newSiege] = copied.events.values();
    expect(link.validity).toEqual({ from: { kind: 'node', nodeId: newChapter.id }, until: { kind: 'event', eventId: newSiege.id } });
    expect(validateConnection(copied, link)).toEqual([]);

    await w.timeline.remove(w.siege.id);
    const model = (await loadModel(w.db, w.p.id))!;
    const [after] = deriveConnections(model).connections.filter((c) => c.kind === 'link');
    expect(validateConnection(model, after)).toEqual([`when it holds: ${w.siege.id} does not exist`]);
    expect(validAt(after.validity!, { kind: 'node', nodeId: chapter.id }, timeContext(model))).toBe('unknown');
  });
});
