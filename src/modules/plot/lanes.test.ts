import { beforeEach, describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { createManuscriptService, registerManuscript, type ProjectManuscript } from '@/modules/manuscript/service';
import type { StoryNode } from '@/modules/manuscript/types';
import { loadModel } from '@/modules/model/model';
import { createProjectService, type ProjectService } from '@/modules/projects/service';
import { createTimelineService, registerTimeline } from '@/modules/timeline/service';
import { chapterOf, endsOf, gapWords, placesOf, threadLanes, threadsByNode } from './lanes';
import { createPlotService, registerPlot, type ProjectPlot } from './service';
import { STATUS_LABELS, roleOf, statusName } from './types';

let n = 0;
let db: NovelDB;
let projects: ProjectService;
let m: ProjectManuscript;
let t: ProjectPlot;
let pid: string;
let timeline: ReturnType<ReturnType<typeof createTimelineService>['forProject']>;

beforeEach(async () => {
  db = new NovelDB(`lanes-${++n}`);
  const registry = createProjectRegistry();
  projects = createProjectService(db, registry);
  registerManuscript(registry);
  registerPlot(registry);
  registerTimeline(registry);
  const p = await projects.create({ title: 'Lanes' });
  pid = p.id;
  m = createManuscriptService(db, projects.contentChanged).forProject(p.id);
  t = createPlotService(db, projects.contentChanged).forProject(p.id);
  timeline = createTimelineService(db, projects.contentChanged).forProject(p.id);
});

const model = async () => (await loadModel(db, pid))!;

/**
 * Ten chapters; chapter 3 has two scenes.
 *  The heist   introduced Ch 1, develops in Ch 3's second scene, crosses the romance in Ch 5, resolved Ch 9; one beat not placed
 *  Romance     appears in Ch 3's first scene (nothing more said), an event told in Ch 5
 *  Prophecy    nothing recorded
 */
async function book() {
  const chapters: StoryNode[] = [];
  for (let i = 1; i <= 10; i++) chapters.push(await m.create('chapter', null, `Chapter ${i}`));
  const [s1, s2] = [await m.create('scene', chapters[2].id, 'The tavern'), await m.create('scene', chapters[2].id, 'The vault')];
  const [heist, romance, prophecy] = [await t.create('The heist'), await t.create('Romance'), await t.create('Prophecy')];
  await t.addBeat(heist.id, { title: 'The job is offered', nodeId: chapters[0].id, role: 'introduction' });
  await t.addBeat(heist.id, { title: 'Casing the vault', nodeId: s2.id });
  await t.addBeat(heist.id, { title: 'Mira joins the crew', nodeId: chapters[4].id, role: 'intersection', withThreadIds: [romance.id] });
  await t.addBeat(heist.id, { title: 'The vault is empty', nodeId: chapters[8].id, role: 'resolution' });
  await t.addBeat(heist.id, { title: 'A double-cross, somewhere' });
  await t.addBeat(romance.id, { nodeId: s1.id, role: 'appears' });
  const event = await timeline.create('The kiss');
  await timeline.update(event.id, { nodeIds: [chapters[4].id], threadIds: [romance.id] });
  return { chapters, s1, s2, heist: (await t.get(heist.id))!, romance: (await t.get(romance.id))!, prophecy, event };
}

describe('lanes are read from what the author recorded', () => {
  it('each thread across the chapters: its beats where they are, scenes counted in their chapter, events where they are told', async () => {
    const b = await book();
    const lanes = threadLanes(await model());
    expect(lanes.chapters.map((c) => c.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(lanes.lanes.map((l) => l.thread.title)).toEqual(['Prophecy', 'Romance', 'The heist']);
    const heist = lanes.lanes[2];
    expect(heist.cells.map((c) => c.role)).toEqual(['introduction', null, 'development', null, 'intersection', null, null, null, 'resolution', null]);
    expect(heist.cells[2].places.map((p) => p.nodeId)).toEqual([b.s2.id]);
    expect([heist.first, heist.last]).toEqual([0, 8]);
    const romance = lanes.lanes[1];
    expect(romance.cells.map((c, i) => (c.places.length ? `${i + 1}:${c.role ?? 'event'}` : null)).filter(Boolean)).toEqual(['3:appears', '5:event']);
    expect(romance.cells[4].eventIds).toEqual([b.event.id]);
  });

  it('gaps: only between recorded chapters, and said as facts', async () => {
    await book();
    const lanes = threadLanes(await model());
    const heist = lanes.lanes[2];
    expect(heist.gaps).toEqual([{ from: 1, to: 1, chapters: 1 }, { from: 3, to: 3, chapters: 1 }, { from: 5, to: 7, chapters: 3 }]);
    expect(heist.gaps.map((g) => gapWords(lanes, g))).toEqual(['Nothing recorded in Ch 2 (1 chapter)', 'Nothing recorded in Ch 4 (1 chapter)', 'Nothing recorded in Ch 6–8 (3 chapters)']);
    // Nothing before the first record, or after the last, is called a gap; a thread with nothing recorded has none.
    expect(lanes.lanes[1].gaps).toEqual([{ from: 3, to: 3, chapters: 1 }]);
    expect(lanes.lanes[0]).toMatchObject({ first: null, last: null, gaps: [], crossings: [], unplaced: [], untold: [] });
  });

  it('introduction, intersections and resolution as the author recorded them; missing ones are said to be missing, not made up', async () => {
    const b = await book();
    const lanes = threadLanes(await model());
    expect(endsOf(lanes.lanes[2], lanes)).toEqual({ introduced: 'Ch 1', resolved: 'Ch 9' });
    expect(endsOf(lanes.lanes[1], lanes)).toEqual({ introduced: 'not recorded', resolved: 'not recorded' });
    expect(lanes.lanes[2].crossings).toEqual([{ beatId: b.heist.beats[2].id, column: 4, otherId: b.romance.id }]);
    expect(lanes.lanes[2].unplaced.map((x) => x.title)).toEqual(['A double-cross, somewhere']);
    // The lanes add nothing: every mark is a beat or an event the author recorded.
    const marks = lanes.lanes.flatMap((l) => l.cells.flatMap((c) => [...c.beats.map((x) => x.id), ...c.eventIds]));
    expect(marks.sort()).toEqual([...b.heist.beats.slice(0, 4).map((x) => x.id), ...b.romance.beats.map((x) => x.id), b.event.id].sort());
    expect((await t.list()).flatMap((x) => x.beats).length).toBe(6);
  });

  it('a beat stored before roles is a development; an event told nowhere is listed apart', async () => {
    const b = await book();
    expect(roleOf({})).toBe('development');
    const lone = await timeline.create('An omen');
    await timeline.update(lone.id, { threadIds: [b.romance.id] });
    expect(threadLanes(await model(), [b.romance.id]).lanes[0].untold).toEqual([lone.id]);
  });

  it('where each chapter or scene sits, and which threads are recorded at each, for the scene board', async () => {
    const b = await book();
    const mdl = await model();
    expect([chapterOf(b.s1.id, mdl), chapterOf(b.chapters[0].id, mdl), chapterOf('gone', mdl)]).toEqual([b.chapters[2].id, b.chapters[0].id, null]);
    expect(placesOf(b.heist, mdl).map((p) => p.nodeId)).toEqual([b.chapters[0].id, b.s2.id, b.chapters[4].id, b.chapters[8].id]);
    const at = threadsByNode(mdl);
    expect(at.get(b.chapters[4].id)!.map((h) => [h.thread.title, h.roles, h.events])).toEqual([['Romance', [], 1], ['The heist', ['intersection'], 0]]);
    expect(at.get(b.s1.id)!.map((h) => [h.thread.title, h.roles, h.plainIds.length])).toEqual([['Romance', ['appears'], 1]]);
    expect(at.has(b.chapters[1].id)).toBe(false);
  });

  it('forty threads across sixty chapters are laid out at once', async () => {
    const chapters = Array.from({ length: 60 }, (_, i) => ({ id: `c${i}`, projectId: 'p', parentId: null, kind: 'chapter', title: `C${i}`, order: i, summary: '', notes: '', status: 'idea', wordCount: 0, charCount: 0, createdAt: 0, updatedAt: 0 }) as StoryNode);
    const threads = Array.from({ length: 40 }, (_, i) => ({ id: `t${i}`, projectId: 'p', title: `T${i}`, premise: '', category: 'subplot', customCategory: '', status: 'active', characterIds: [], locationIds: [], targetNodeId: null, targetNote: '', notes: '', muted: false, createdAt: 0, updatedAt: 0, beats: Array.from({ length: 12 }, (_, j) => ({ id: `t${i}b${j}`, nodeId: `c${(i + j * 5) % 60}`, title: 'x', note: '', createdAt: 0 })) }));
    const { buildModel } = await import('@/modules/model/model');
    const mdl = buildModel({ project: { id: 'p' } as never, nodes: chapters, plans: [], entries: [], schemas: [], links: [], relations: [], events: [], threads: threads as never, systems: [], sheets: [] });
    const started = performance.now();
    const lanes = threadLanes(mdl);
    expect(performance.now() - started).toBeLessThan(500);
    expect(lanes.lanes.length * lanes.chapters.length).toBe(2400);
  });
});

describe('statuses and associations', () => {
  it('a custom status carries the author’s own name; built-in ones keep theirs', async () => {
    const thread = await t.create('Exile');
    await t.update(thread.id, { status: 'custom', customStatus: '  Dormant until book two  ' });
    const stored = (await t.get(thread.id))!;
    expect([stored.status, statusName(stored)]).toEqual(['custom', 'Dormant until book two']);
    expect(statusName({ status: 'custom', customStatus: ' ' })).toBe(STATUS_LABELS.custom);
    expect(statusName({ status: 'paused' })).toBe('Paused');
    await t.update(thread.id, { status: 'nonsense' as never });
    expect((await t.get(thread.id))!.status).toBe('custom');
  });

  it('a scene can be in several threads; only appearing needs no title, and none is made up', async () => {
    const b = await book();
    const appears = await t.addBeat(b.prophecy.id, { nodeId: b.s1.id, role: 'appears' });
    expect([appears.title, appears.role]).toEqual(['', 'appears']);
    expect(threadsByNode(await model()).get(b.s1.id)!.map((h) => h.thread.title)).toEqual(['Prophecy', 'Romance']);
    // Roles and crossings are checked: a thread cannot cross itself, or a thread of another novel.
    const other = await projects.create({ title: 'Elsewhere' });
    const theirs = await createPlotService(db, projects.contentChanged).forProject(other.id).create('Theirs');
    const beat = await t.addBeat(b.prophecy.id, { title: 'Two prophecies meet', role: 'intersection', withThreadIds: [b.prophecy.id, b.heist.id, theirs.id, 'nothing'] });
    expect(beat.withThreadIds).toEqual([b.heist.id]);
    await t.updateBeat(b.prophecy.id, beat.id, { role: 'bogus' as never, withThreadIds: [b.romance.id] });
    expect((await t.get(b.prophecy.id))!.beats.find((x) => x.id === beat.id)).toMatchObject({ role: 'intersection', withThreadIds: [b.romance.id] });
  });

  it('deleting a thread takes it out of other threads’ intersections, and nothing else', async () => {
    const b = await book();
    await t.remove(b.romance.id);
    const heist = (await t.get(b.heist.id))!;
    expect(heist.beats.map((x) => [x.title, x.role ?? null, x.withThreadIds ?? null])).toEqual([
      ['The job is offered', 'introduction', null],
      ['Casing the vault', null, null],
      ['Mira joins the crew', 'intersection', []],
      ['The vault is empty', 'resolution', null],
      ['A double-cross, somewhere', null, null],
    ]);
  });

  it('a copy of the novel points its intersections at its own threads', async () => {
    const b = await book();
    const copy = await projects.duplicate(pid);
    const theirs = await createPlotService(db, projects.contentChanged).forProject(copy.id).list();
    const heist = theirs.find((x) => x.title === 'The heist')!;
    const romance = theirs.find((x) => x.title === 'Romance')!;
    expect(romance.id).not.toBe(b.romance.id);
    expect(heist.beats.find((x) => x.role === 'intersection')!.withThreadIds).toEqual([romance.id]);
  });
});
