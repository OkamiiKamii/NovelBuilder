import { beforeEach, describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { createManuscriptService, registerManuscript, type ProjectManuscript } from '@/modules/manuscript/service';
import { loadModel } from '@/modules/model/model';
import { createProjectService, type ProjectService } from '@/modules/projects/service';
import { createTimelineService, registerTimeline } from '@/modules/timeline/service';
import { barOf, labelDistribution, lengthBars, lengthFacts, partBands, placeMarkers, usedLabels } from './pacing';
import { createStructureService, registerStructure } from './service';
import { cleanLabels, labelOrder } from './types';

let n = 0;
let db: NovelDB;
let projects: ProjectService;
let m: ProjectManuscript;
let pid: string;
let structure: ReturnType<ReturnType<typeof createStructureService>['forProject']>;
let timeline: ReturnType<ReturnType<typeof createTimelineService>['forProject']>;

beforeEach(async () => {
  db = new NovelDB(`structure-${++n}`);
  const registry = createProjectRegistry();
  projects = createProjectService(db, registry);
  registerManuscript(registry);
  registerTimeline(registry);
  registerStructure(registry);
  const p = await projects.create({ title: 'Structure' });
  pid = p.id;
  m = createManuscriptService(db, projects.contentChanged).forProject(p.id);
  structure = createStructureService(db, projects.contentChanged).forProject(p.id);
  timeline = createTimelineService(db, projects.contentChanged).forProject(p.id);
});

const model = async () => (await loadModel(db, pid))!;
const words = (id: string, count: number) => db.chapters.update(id, { wordCount: count });

/**
 * Act I › Ch 1 "Arrival" (1,000 words; action), Ch 2 "The inn" (scenes: "Talk" 300 dialogue + romance, "Quiet" 0 words)
 * Act II › Ch 3 "Ambush" (2,000; action)
 * Ch 4 "Epilogue" (no words yet, no label)
 */
async function book() {
  const [act1, act2] = [await m.create('act', null, 'Act I'), await m.create('act', null, 'Act II')];
  const [c1, c2] = [await m.create('chapter', act1.id, 'Arrival'), await m.create('chapter', act1.id, 'The inn')];
  const c3 = await m.create('chapter', act2.id, 'Ambush');
  const c4 = await m.create('chapter', null, 'Epilogue');
  const [talk, quiet] = [await m.create('scene', c2.id, 'Talk'), await m.create('scene', c2.id, 'Quiet')];
  await words(c1.id, 1000);
  await words(talk.id, 300);
  await words(c3.id, 2000);
  await m.updatePlan(c1.id, { labels: ['Action'] });
  await m.updatePlan(talk.id, { labels: ['Dialogue', 'Romance'] });
  await m.updatePlan(quiet.id, { labels: ['Quiet moment'] });
  await m.updatePlan(c3.id, { labels: ['action '] });
  return { act1, act2, c1, c2, c3, c4, talk, quiet };
}

describe('labels are the author’s own', () => {
  it('are trimmed and kept once each, whatever their capitals; the suggestions sort first', () => {
    expect(cleanLabels(['  Action ', 'action', 'Mystery   clue', 42, '', 'x'.repeat(60)])).toEqual(['Action', 'Mystery clue', 'x'.repeat(40)]);
    expect(labelOrder(['Heist', 'Quiet moment', 'Action', 'Banter'])).toEqual(['Action', 'Quiet moment', 'Banter', 'Heist']);
  });

  it('one of the author’s own, written with different capitals in different places, is one label, spelled as it first is in reading order', async () => {
    const [a, b] = [await m.create('chapter', null, 'One'), await m.create('chapter', null, 'Two')];
    await m.updatePlan(a.id, { labels: ['Heist'] });
    await m.updatePlan(b.id, { labels: ['heist'] });
    const mdl = await model();
    expect(usedLabels(mdl)).toEqual(['Heist']);
    expect(lengthBars(mdl, { grain: 'chapters', partId: null }).map((x) => x.labels)).toEqual([['Heist'], ['Heist']]);
  });

  it('are saved on chapter and scene plans and on events, through their own services', async () => {
    const b = await book();
    // 'action ' matches a suggestion: it is saved as the suggestion is spelled.
    expect((await m.getPlan(b.c3.id)).labels).toEqual(['Action']);
    const event = await timeline.create('The ambush');
    await timeline.update(event.id, { labels: ['Mystery clue', 'mystery CLUE'] });
    expect((await db.timelineEvents.get(event.id))!.labels).toEqual(['Mystery clue']);
    expect(usedLabels(await model())).toEqual(['Action', 'Dialogue', 'Romance', 'Mystery clue', 'Quiet moment']);
  });
});

describe('the length chart', () => {
  it('by chapter: each chapter’s words with its scenes’, its labels, and the act it is in', async () => {
    const b = await book();
    const mdl = await model();
    const bars = lengthBars(mdl, { grain: 'chapters', partId: null });
    expect(bars.map((x) => [x.label, x.words, x.labels.join('+'), x.partId])).toEqual([
      ['Ch 1: Arrival', 1000, 'Action', b.act1.id],
      ['Ch 2: The inn', 300, 'Dialogue+Romance+Quiet moment', b.act1.id],
      ['Ch 3: Ambush', 2000, 'Action', b.act2.id],
      ['Ch 4: Epilogue', 0, '', null],
    ]);
    expect(partBands(bars, mdl)).toEqual([{ partId: b.act1.id, title: 'Act I', kind: 'act', from: 0, to: 1 }, { partId: b.act2.id, title: 'Act II', kind: 'act', from: 2, to: 2 }]);
  });

  it('by scene: each scene, and a chapter with no scenes as itself', async () => {
    await book();
    const bars = lengthBars(await model(), { grain: 'scenes', partId: null });
    expect(bars.map((x) => [x.label, x.words])).toEqual([['Ch 1: Arrival', 1000], ['Ch 2, scene: Talk', 300], ['Ch 2, scene: Quiet', 0], ['Ch 3: Ambush', 2000], ['Ch 4: Epilogue', 0]]);
  });

  it('filtered to one act', async () => {
    const b = await book();
    expect(lengthBars(await model(), { grain: 'chapters', partId: b.act2.id }).map((x) => x.label)).toEqual(['Ch 3: Ambush']);
  });

  it('facts, not verdicts: an unwritten chapter is counted as unwritten, not as short', async () => {
    await book();
    const facts = lengthFacts(lengthBars(await model(), { grain: 'chapters', partId: null }));
    expect({ ...facts, longest: facts.longest?.label, shortest: facts.shortest?.label }).toEqual({ count: 4, total: 3300, average: 1100, median: 1000, longest: 'Ch 3: Ambush', shortest: 'Ch 2: The inn', empty: 1, labelled: 3 });
  });
});

describe('empty and incomplete manuscripts', () => {
  it('no chapters: no bars, no facts to state', async () => {
    const mdl = await model();
    const bars = lengthBars(mdl, { grain: 'chapters', partId: null });
    expect(bars).toEqual([]);
    expect(lengthFacts(bars)).toEqual({ count: 0, total: 0, average: 0, median: 0, longest: null, shortest: null, empty: 0, labelled: 0 });
    expect(partBands(bars, mdl)).toEqual([]);
    expect(labelDistribution(bars, mdl, 'chapters')).toEqual({ labels: [], cells: [], totals: [], unlabelled: 0 });
  });

  it('chapters with no words and no labels: every chapter is a bar of 0, all unlabelled', async () => {
    await m.create('chapter', null, 'One');
    await m.create('chapter', null, 'Two');
    const mdl = await model();
    const bars = lengthBars(mdl, { grain: 'scenes', partId: null });
    expect(bars.map((x) => x.words)).toEqual([0, 0]);
    expect(lengthFacts(bars)).toMatchObject({ count: 2, total: 0, average: 0, median: 0, longest: null, shortest: null, empty: 2, labelled: 0 });
    expect(labelDistribution(bars, mdl, 'scenes')).toMatchObject({ labels: [], totals: [], unlabelled: 0 });
  });

  it('an act with no chapters, and a plan saved before labels existed, read as nothing recorded', async () => {
    await m.create('act', null, 'Act III');
    const c = await m.create('chapter', null, 'One');
    await db.chapterPlans.put({ id: c.id, projectId: pid, objective: 'x', beats: [], entityIds: [], conflict: '', emotionalArc: '', dialogue: '', foreshadowing: '', reveals: '', openQuestions: '', ending: '', updatedAt: 0 });
    const mdl = await model();
    const bars = lengthBars(mdl, { grain: 'chapters', partId: null });
    expect(bars.map((x) => [x.label, x.labels])).toEqual([['Ch 1: One', []]]);
    expect(partBands(bars, mdl)).toEqual([]);
  });
});

describe('words by label', () => {
  it('a scene with two labels counts toward both; unlabelled words are counted apart', async () => {
    const b = await book();
    const mdl = await model();
    const bars = lengthBars(mdl, { grain: 'chapters', partId: null });
    const dist = labelDistribution(bars, mdl, 'chapters');
    expect(dist.labels).toEqual(['Action', 'Dialogue', 'Romance', 'Quiet moment']);
    expect(dist.totals).toEqual([{ label: 'Action', words: 3000, bars: 2 }, { label: 'Dialogue', words: 300, bars: 1 }, { label: 'Romance', words: 300, bars: 1 }, { label: 'Quiet moment', words: 0, bars: 1 }]);
    expect(Object.fromEntries(dist.cells[1].words)).toEqual({ Dialogue: 300, Romance: 300, 'Quiet moment': 0 });
    // The Inn's own (empty) text and the Epilogue have no labels.
    expect(dist.unlabelled).toBe(0);
    await words(b.c4.id, 500);
    expect(labelDistribution(lengthBars(await model(), { grain: 'chapters', partId: null }), await model(), 'chapters').unlabelled).toBe(500);
  });
});

describe('structural markers', () => {
  it('are the author’s: any kind, placed at a chapter or scene, an event, both or neither', async () => {
    const b = await book();
    const event = await timeline.create('The ambush');
    await timeline.update(event.id, { nodeIds: [b.c3.id] });
    await structure.save(null, { kind: ' Turning   point ', title: 'The road turns', nodeId: b.talk.id });
    await structure.save(null, { kind: 'Climax', eventId: event.id });
    await structure.save(null, { kind: 'The prophecy is spoken' });
    await expect(structure.save(null, { kind: '  ' })).rejects.toThrow('Say what kind of marker it is.');
    await expect(structure.save(null, { kind: 'Climax', nodeId: b.act1.id })).rejects.toThrow('That chapter or scene is not in this novel.');
    await expect(structure.save(null, { kind: 'Climax', eventId: 'nowhere' })).rejects.toThrow('That event is not in this novel.');
    const mdl = await model();
    const placed = placeMarkers(await structure.list(), mdl);
    expect(placed.map((p) => [p.marker.kind, p.via, p.nodeId === null ? null : mdl.nodes.get(p.nodeId)!.title])).toEqual([['Turning point', 'node', 'Talk'], ['Climax', 'event', 'Ambush'], ['The prophecy is spoken', null, null]]);
    const bars = lengthBars(mdl, { grain: 'chapters', partId: null });
    expect(placed.map((p) => barOf(p, bars, mdl))).toEqual([1, 2, -1]);
    // A marker on a chapter that has since been deleted is kept, and says so.
    await m.remove(b.c2.id);
    const after = placeMarkers(await structure.list(), await model());
    expect(after.find((p) => p.marker.kind === 'Turning point')).toMatchObject({ nodeId: null, missing: true });
  });

  it('change, and go, one at a time; and travel with a copy of the novel', async () => {
    const b = await book();
    const marker = await structure.save(null, { kind: 'Midpoint', nodeId: b.c2.id });
    await structure.save(marker.id, { title: 'Halfway', note: 'Everything changes' });
    expect((await structure.list())[0]).toMatchObject({ kind: 'Midpoint', title: 'Halfway', note: 'Everything changes', nodeId: b.c2.id });
    const copy = await projects.duplicate(pid);
    const theirs = await createStructureService(db, projects.contentChanged).forProject(copy.id).list();
    const chapter = (await db.chapters.where('projectId').equals(copy.id).toArray()).find((c) => c.title === 'The inn')!;
    expect(theirs.map((x) => [x.kind, x.nodeId])).toEqual([['Midpoint', chapter.id]]);
    await structure.remove(marker.id);
    expect(await structure.list()).toEqual([]);
    expect(await createStructureService(db, projects.contentChanged).forProject(copy.id).list()).toHaveLength(1);
  });

  it('charting changes nothing', async () => {
    const b = await book();
    await structure.save(null, { kind: 'Climax', nodeId: b.c3.id });
    const before = JSON.stringify([await db.chapters.toArray(), await db.chapterPlans.toArray(), await db.structureMarkers.toArray()]);
    const mdl = await model();
    const bars = lengthBars(mdl, { grain: 'scenes', partId: null });
    lengthFacts(bars);
    labelDistribution(bars, mdl, 'scenes');
    placeMarkers(await structure.list(), mdl);
    expect(JSON.stringify([await db.chapters.toArray(), await db.chapterPlans.toArray(), await db.structureMarkers.toArray()])).toBe(before);
  });
});
