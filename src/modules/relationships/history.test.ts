import { describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { createCodexService, registerCodex } from '@/modules/codex/service';
import { createManuscriptService, registerManuscript } from '@/modules/manuscript/service';
import { createProjectService } from '@/modules/projects/service';
import { createTimelineService, registerTimeline } from '@/modules/timeline/service';
import type { EventDate } from '@/modules/timeline/types';
import { createRelationshipService, registerRelationships } from './service';
import { sortedStages, stageAt, stageDifferences, storyOrder, timelineOf } from './timeline';

const year = (y: number): EventDate => ({ precision: 'exact', year: y, month: null, day: null, hour: null, minute: null });

async function novel() {
  const db = new NovelDB(`relation-history-${crypto.randomUUID()}`);
  const registry = createProjectRegistry();
  const projects = createProjectService(db, registry);
  registerManuscript(registry);
  registerCodex(registry);
  registerTimeline(registry);
  registerRelationships(registry);
  const p = await projects.create({ title: 'Oaths' });
  const m = createManuscriptService(db, projects.contentChanged).forProject(p.id);
  const c = createCodexService(db, projects.contentChanged).forProject(p.id);
  const t = createTimelineService(db, projects.contentChanged).forProject(p.id);
  const r = createRelationshipService(db, projects.contentChanged).forProject(p.id);
  const ch = [];
  for (let i = 0; i < 6; i++) ch.push(await m.create('chapter'));
  const [mira, bren] = await Promise.all(['Mira', 'Bren'].map((name) => c.create('character', name)));
  const betrayal = await t.create('The betrayal');
  await t.update(betrayal.id, { when: year(15) });
  const order = async () => storyOrder(await m.list());
  return { db, p, projects, m, r, t, ch, mira, bren, betrayal, order };
}

describe('a relationship’s history', () => {
  it('changing how it stands now never erases how it stood before', async () => {
    const s = await novel();
    const relation = await s.r.create(s.mira.id, s.bren.id, 'friends');
    await s.r.updateStage(relation.id, relation.stages[0].id, { affinity: 'trusting', title: 'Childhood friends' });
    const first = structuredClone((await s.r.get(relation.id))!.stages[0]);

    await s.r.recordChange(relation.id, { nodeId: s.ch[2].id }, { preset: 'rivals', affinity: 'reluctant', title: 'The tournament' });
    const second = structuredClone((await s.r.get(relation.id))!.stages[1]);
    await s.r.recordChange(relation.id, { unknown: true }, { preset: 'enemies', affinity: 'hostile', storyAt: { kind: 'event', eventId: s.betrayal.id }, causeEventId: s.betrayal.id });
    await s.r.recordChange(relation.id, { nodeId: s.ch[5].id }, { preset: 'allies', affinity: 'neutral' });

    const stages = (await s.r.get(relation.id))!.stages;
    expect(stages).toHaveLength(4);
    // The earlier states are exactly as they were recorded.
    expect(stages[0]).toEqual(first);
    expect(stages[1]).toEqual(second);
    expect(stages.map((x) => [x.label, x.affinity])).toEqual([['Friends', 'trusting'], ['Rivals', 'reluctant'], ['Enemies', 'hostile'], ['Allies', 'neutral']]);
    // And each can be read back at its point in the book.
    const order = await s.order();
    expect([stageAt((await s.r.get(relation.id))!, s.ch[0].id, order)!.label, stageAt((await s.r.get(relation.id))!, s.ch[3].id, order)!.label, stageAt((await s.r.get(relation.id))!, null, order)!.label]).toEqual(['Friends', 'Rivals', 'Allies']);
  });

  it('a correction changes only the stage corrected', async () => {
    const s = await novel();
    const relation = await s.r.create(s.mira.id, s.bren.id, 'friends');
    await s.r.recordChange(relation.id, { nodeId: s.ch[2].id }, { preset: 'rivals' });
    const before = structuredClone((await s.r.get(relation.id))!.stages);
    await s.r.updateStage(relation.id, before[1].id, { title: 'Over the crown' });
    const after = (await s.r.get(relation.id))!.stages;
    expect(after[0]).toEqual(before[0]);
    expect(after[1]).toEqual({ ...before[1], title: 'Over the crown' });
  });

  it('says what each change changed', async () => {
    const s = await novel();
    await s.r.trackAttribute('trust');
    const relation = await s.r.create(s.mira.id, s.bren.id, 'friends');
    await s.r.updateStage(relation.id, relation.stages[0].id, { affinity: 'trusting', attributes: { trust: { from: 9 } } });
    await s.r.recordChange(relation.id, { nodeId: s.ch[3].id }, { preset: 'enemies', affinity: 'hostile', attributes: { trust: { from: 1, to: 0 } }, title: 'After the betrayal' });
    const [a, b] = (await s.r.get(relation.id))!.stages;
    expect(stageDifferences(null, a, { from: 'Mira', to: 'Bren' })).toEqual([]);
    expect(stageDifferences(a, b, { from: 'Mira', to: 'Bren' }, [{ key: 'trust', label: 'Trust' }])).toEqual(['type: Friends → Enemies', 'feeling: Trusting → Hostile', 'Mira’s trust toward Bren: 9 → 1', 'Bren’s trust toward Mira: not said → 0', 'now called “After the betrayal”']);
  });
});

describe('when a change happens', () => {
  it('can be at an event or on a date in story time, as rough as the author knows it, apart from where the reader meets it', async () => {
    const s = await novel();
    const relation = await s.r.create(s.mira.id, s.bren.id, 'friends');
    const stage = relation.stages[0].id;
    await s.r.updateStage(relation.id, stage, { storyAt: { kind: 'event', eventId: s.betrayal.id } });
    expect((await s.r.get(relation.id))!.stages[0].storyAt).toEqual({ kind: 'event', eventId: s.betrayal.id });
    await s.r.updateStage(relation.id, stage, { storyAt: { kind: 'date', when: { precision: 'approximate', year: 14, month: null, season: 'summer' } } });
    expect((await s.r.get(relation.id))!.stages[0].storyAt).toEqual({ kind: 'date', when: { precision: 'approximate', year: 14, month: null, season: 'summer' } });
    // Relative to an event, kept; relative to one that is not there, its anchor is dropped, not guessed.
    await s.r.updateStage(relation.id, stage, { storyAt: { kind: 'date', when: { precision: 'relative', anchorId: 'gone', amount: 2, unit: 'years', direction: 'after' } } });
    expect((await s.r.get(relation.id))!.stages[0].storyAt).toMatchObject({ kind: 'date', when: { anchorId: null } });
    await s.r.updateStage(relation.id, stage, { storyAt: null });
    expect((await s.r.get(relation.id))!.stages[0].storyAt).toBeNull();
    await expect(s.r.updateStage(relation.id, stage, { storyAt: { kind: 'event', eventId: 'nope' } })).rejects.toThrow('That event is not in this novel’s timeline.');
    // Story time never moves the stage in the book's order.
    expect((await s.r.get(relation.id))!.stages[0].startNodeId).toBeNull();
  });

  it('a change whose chapter is not said keeps its place after the stage before it, is not assumed at any chapter, and can be moved', async () => {
    const s = await novel();
    const relation = await s.r.create(s.mira.id, s.bren.id, 'friends');
    await s.r.recordChange(relation.id, { nodeId: s.ch[1].id }, { preset: 'rivals' });
    const unknown = await s.r.recordChange(relation.id, { unknown: true }, { preset: 'enemies' });
    await s.r.recordChange(relation.id, { nodeId: s.ch[4].id }, { preset: 'allies' });
    const order = await s.order();
    const stored = (await s.r.get(relation.id))!;
    expect(sortedStages(stored, order).map((x) => x.label)).toEqual(['Friends', 'Rivals', 'Enemies', 'Allies']);
    expect(timelineOf(stored, order).map((x) => x.range)).toEqual(['Chapter 1', 'From chapter 2', 'Stage 3, chapter not said', 'Chapters 5+']);
    // At chapter 3 it is Rivals as far as anyone has said: the Enemies stage is not assumed to have begun.
    expect(stageAt(stored, s.ch[2].id, order)!.label).toBe('Rivals');
    await s.r.moveStage(relation.id, unknown.id, -1);
    expect(sortedStages((await s.r.get(relation.id))!, order).map((x) => x.label)).toEqual(['Friends', 'Enemies', 'Rivals', 'Allies']);
    // A stage at a chapter keeps its place: moving is for the ones not placed.
    await s.r.moveStage(relation.id, relation.stages[0].id, 1);
    expect((await s.r.get(relation.id))!.stages[0].label).toBe('Friends');
    // Giving it a chapter makes it known.
    await s.r.updateStage(relation.id, unknown.id, { startNodeId: s.ch[3].id });
    expect((await s.r.get(relation.id))!.stages.find((x) => x.id === unknown.id)).toMatchObject({ startNodeId: s.ch[3].id });
    expect((await s.r.get(relation.id))!.stages.find((x) => x.id === unknown.id)!.startUnknown).toBeUndefined();
  });
});

describe('what brought a change about', () => {
  it('is only what the author names, never worked out from when it happened', async () => {
    const s = await novel();
    const relation = await s.r.create(s.mira.id, s.bren.id, 'friends');
    const changed = await s.r.recordChange(relation.id, { nodeId: s.ch[3].id }, { preset: 'enemies', storyAt: { kind: 'event', eventId: s.betrayal.id } });
    // Dated at the betrayal, but nobody said the betrayal caused it: no cause, no origin text.
    expect([changed.causeEventId ?? null, changed.causeNodeId ?? null, changed.event]).toEqual([null, null, '']);
    await s.r.updateStage(relation.id, changed.id, { causeEventId: s.betrayal.id, causeNodeId: s.ch[3].id, event: 'She learned who sold the gate.' });
    expect((await s.r.get(relation.id))!.stages[1]).toMatchObject({ causeEventId: s.betrayal.id, causeNodeId: s.ch[3].id, event: 'She learned who sold the gate.' });
    await expect(s.r.updateStage(relation.id, changed.id, { causeEventId: 'nope' })).rejects.toThrow('not in this novel’s timeline');
    await expect(s.r.updateStage(relation.id, changed.id, { causeNodeId: 'nope' })).rejects.toThrow('That chapter or scene is not in this novel.');
  });

  it('travels with a copy of the novel, pointing at the copy’s own event and chapter', async () => {
    const s = await novel();
    const relation = await s.r.create(s.mira.id, s.bren.id, 'friends');
    await s.r.recordChange(relation.id, { nodeId: s.ch[3].id }, { preset: 'enemies', storyAt: { kind: 'event', eventId: s.betrayal.id }, causeEventId: s.betrayal.id, causeNodeId: s.ch[3].id });
    const copy = await s.projects.duplicate(s.p.id);
    const [copied] = await createRelationshipService(s.db, s.projects.contentChanged).forProject(copy.id).list();
    const stage = copied.stages[1];
    const event = await s.db.timelineEvents.get(stage.causeEventId!);
    const node = await s.db.chapters.get(stage.causeNodeId!);
    expect([event?.projectId, event?.name, node?.projectId, stage.storyAt]).toEqual([copy.id, 'The betrayal', copy.id, { kind: 'event', eventId: stage.causeEventId }]);
  });
});
