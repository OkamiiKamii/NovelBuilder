import { beforeEach, describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { createCodexService, registerCodex, type CodexService } from '@/modules/codex/service';
import { createManuscriptService, registerManuscript, type ManuscriptService } from '@/modules/manuscript/service';
import type { StoryNode } from '@/modules/manuscript/types';
import { createProjectService, type ProjectService } from '@/modules/projects/service';
import { beatPlace, diagnose } from './diagnostics';
import { createPlotService, registerPlot, type PlotService } from './service';
import { categoryName, type ThreadStatus } from './types';

let n = 0;
let db: NovelDB;
let projects: ProjectService;
let manuscript: ManuscriptService;
let codex: CodexService;
let plot: PlotService;

beforeEach(() => {
  db = new NovelDB(`plot-${++n}`);
  const registry = createProjectRegistry();
  projects = createProjectService(db, registry);
  registerManuscript(registry);
  registerCodex(registry);
  registerPlot(registry);
  manuscript = createManuscriptService(db, projects.contentChanged);
  codex = createCodexService(db, projects.contentChanged);
  plot = createPlotService(db, projects.contentChanged);
});

/** A project with `count` chapters, the first `written` of which have words. */
async function world(count = 40, written = 0) {
  const p = await projects.create({ title: 'P' });
  const m = manuscript.forProject(p.id);
  const c = codex.forProject(p.id);
  const t = plot.forProject(p.id);
  const chapters: StoryNode[] = [];
  for (let i = 0; i < count; i++) chapters.push(await m.create('chapter', null, `Chapter ${i + 1}`));
  const write = async (upTo: number) => {
    for (let i = 0; i < count; i++) await db.chapters.update(chapters[i].id, { wordCount: i < upTo ? 100 : 0 });
  };
  await write(written);
  const mira = await c.create('character', 'Mira');
  const palace = await c.create('location', 'The Palace');
  const guild = await c.create('faction', 'Ash Guild');
  /** A thread with developments in the given chapters (1-based). */
  const thread = async (title: string, status: ThreadStatus, at: number[] = []) => {
    const created = await t.create(title);
    await t.update(created.id, { status });
    for (const chapter of at) await t.addBeat(created.id, { title: `Beat in ${chapter}`, nodeId: chapters[chapter - 1].id });
    return (await t.get(created.id))!;
  };
  const report = async (quietAfter?: number) => diagnose(await t.list(), await m.list(), quietAfter);
  const issuesOf = async (title: string, quietAfter?: number) => (await report(quietAfter)).reports.find((r) => r.thread.title === title)!.issues.map((i) => i.kind);
  return { p, m, c, t, chapters, write, mira, palace, guild, thread, report, issuesOf };
}

describe('plot threads', () => {
  it('creates a thread with every field the author can set', async () => {
    const { t, mira, palace, guild, chapters } = await world(3);
    const created = await t.create('  The Missing Prince ');
    expect(created).toMatchObject({ title: 'The Missing Prince', status: 'planned', category: 'subplot', beats: [], muted: false });

    await t.update(created.id, {
      premise: 'Where did the prince go?', category: 'mystery', status: 'active', characterIds: [mira.id, guild.id, 'nope', mira.id], locationIds: [palace.id, mira.id],
      targetNodeId: chapters[2].id, targetNote: 'the finale', notes: 'n', muted: true,
    });
    expect(await t.get(created.id)).toMatchObject({
      premise: 'Where did the prince go?', category: 'mystery', status: 'active', characterIds: [mira.id], locationIds: [palace.id], targetNodeId: chapters[2].id, targetNote: 'the finale', notes: 'n', muted: true,
    });

    // Values that are not real choices are ignored rather than stored.
    await t.update(created.id, { status: 'done' as ThreadStatus, category: 'x' as 'main', title: '   ', targetNodeId: 'nope' });
    expect(await t.get(created.id)).toMatchObject({ status: 'active', category: 'mystery', title: 'Untitled thread', targetNodeId: null });
  });

  it('names a custom category in the author\'s words', async () => {
    const { t } = await world(1);
    const created = await t.create('Prophecy');
    await t.update(created.id, { category: 'custom' });
    expect(categoryName((await t.get(created.id))!)).toBe('Custom');
    await t.update(created.id, { customCategory: ' Prophecy ' });
    expect(categoryName((await t.get(created.id))!)).toBe('Prophecy');
    await t.update(created.id, { category: 'villain' });
    expect(categoryName((await t.get(created.id))!)).toBe('Villain Storyline');
  });

  it('records developments against chapters and shows them in reading order', async () => {
    const { t, m, chapters, report } = await world(40);
    const prince = await t.create('The Missing Prince');
    await t.addBeat(prince.id, { title: 'Prince returns', nodeId: chapters[34].id });
    await t.addBeat(prince.id, { title: 'Disappearance', nodeId: chapters[2].id });
    await t.addBeat(prince.id, { title: 'Organization linked', nodeId: chapters[17].id });
    await t.addBeat(prince.id, { title: 'Symbol discovered', nodeId: chapters[9].id });
    await t.addBeat(prince.id, { title: 'Somewhere later' });
    const track = async () => (await report()).reports[0].beats.map((b) => `${beatPlace(b)}: ${b.beat.title}`);
    expect(await track()).toEqual(['Ch 3: Disappearance', 'Ch 10: Symbol discovered', 'Ch 18: Organization linked', 'Ch 35: Prince returns', 'Not placed: Somewhere later']);

    // Developments follow their chapter when the manuscript is reordered: they are tied to its id, not its number.
    await m.move(chapters[34].id, null, chapters[0].id);
    expect((await track()).slice(0, 2)).toEqual(['Ch 1: Prince returns', 'Ch 4: Disappearance']);

    // A scene counts as the chapter it sits in.
    const scene = await m.create('scene', chapters[9].id, 'The cellar');
    const beats = (await t.get(prince.id))!.beats;
    await t.updateBeat(prince.id, beats[4].id, { nodeId: scene.id, title: 'In the cellar', note: 'a note' });
    expect(await track()).toContain('Ch 11: In the cellar');
    expect((await t.get(prince.id))!.beats[4]).toMatchObject({ nodeId: scene.id, title: 'In the cellar', note: 'a note' });

    await t.removeBeat(prince.id, beats[0].id);
    expect((await t.get(prince.id))!.beats.map((b) => b.title)).toEqual(['Disappearance', 'Organization linked', 'Symbol discovered', 'In the cellar']);
  });

  it('only places developments in chapters and scenes of the same project', async () => {
    const { t, m, chapters } = await world(2);
    const arc = await m.create('arc', null, 'Arc');
    const created = await t.create('T');
    expect((await t.addBeat(created.id, { title: 'a', nodeId: arc.id })).nodeId).toBeNull();
    expect((await t.addBeat(created.id, { title: 'b', nodeId: 'nope' })).nodeId).toBeNull();
    expect((await t.addBeat(created.id, { title: 'c', nodeId: chapters[1].id })).nodeId).toBe(chapters[1].id);
    expect((await t.addBeat(created.id, { title: '  ' })).title).toBe('New development');
  });

  it('keeps quick edits in a row from overwriting one another', async () => {
    const { t, mira, palace, chapters } = await world(3);
    const created = await t.create('T');
    await Promise.all([
      t.update(created.id, (stored) => ({ characterIds: [...stored.characterIds, mira.id] })),
      t.update(created.id, { locationIds: [palace.id] }),
      t.addBeat(created.id, { title: 'one', nodeId: chapters[0].id }),
      t.addBeat(created.id, { title: 'two', nodeId: chapters[1].id }),
      t.update(created.id, { status: 'active' }),
    ]);
    const stored = (await t.get(created.id))!;
    expect(stored).toMatchObject({ characterIds: [mira.id], locationIds: [palace.id], status: 'active' });
    expect(stored.beats.map((b) => b.title).sort()).toEqual(['one', 'two']);
  });
});

describe('continuity diagnostics', () => {
  it('flags an active thread once it has been quiet for the chosen number of chapters', async () => {
    const { thread, write, issuesOf, report } = await world(40, 29);
    await thread('Prince', 'active', [3, 10]);
    // Chapter 29 is 19 chapters after the last development.
    expect(await issuesOf('Prince')).toEqual([]);
    await write(30);
    expect(await issuesOf('Prince')).toEqual(['quiet']);
    const { reports, frontier, chapterCount } = await report();
    expect([frontier, chapterCount, reports[0].quietFor]).toEqual([30, 40, 20]);
    expect(reports[0].issues[0].message).toBe('Active, with no development recorded for 20 chapters: the last was “Beat in 10” in chapter 10, and the manuscript has reached chapter 30.');

    // The author chooses how long is too long.
    expect(await issuesOf('Prince', 30)).toEqual([]);
    // Looked at more strictly, the seven chapters between its two developments count as a gap too.
    expect(await issuesOf('Prince', 5)).toEqual(['quiet', 'gap']);
  });

  it('measures against chapters that are written, not ones that are only planned', async () => {
    const { thread, write, issuesOf, m, chapters } = await world(40, 0);
    await thread('Prince', 'active', [3]);
    expect(await issuesOf('Prince')).toEqual([]);
    await write(10);
    expect(await issuesOf('Prince')).toEqual([]);
    // Words in a scene count for the chapter the scene is in.
    const scene = await m.create('scene', chapters[24].id, 'Late scene');
    await db.chapters.update(scene.id, { wordCount: 50 });
    expect(await issuesOf('Prince')).toEqual(['quiet']);
  });

  it('does not flag threads the author has paused, resolved, abandoned or retconned', async () => {
    const { thread, issuesOf } = await world(60, 30);
    for (const status of ['paused', 'resolved', 'abandoned', 'retconned'] as const) await thread(status, status, [3]);
    for (const status of ['paused', 'resolved', 'abandoned', 'retconned']) expect(await issuesOf(status)).toEqual([]);
  });

  it('mentions a pause only after twice as long', async () => {
    const { thread, write, issuesOf } = await world(60, 42);
    await thread('Romance', 'paused', [3]);
    expect(await issuesOf('Romance')).toEqual([]);
    await write(43);
    expect(await issuesOf('Romance')).toEqual(['paused']);
  });

  it('notes a development planned ahead without calling the thread quiet', async () => {
    const { thread, issuesOf } = await world(40, 10);
    // Last development reached is chapter 8; the next is planned for chapter 35.
    await thread('Prince', 'active', [3, 8, 35]);
    expect(await issuesOf('Prince')).toEqual(['gap']);
    expect(await issuesOf('Prince', 30)).toEqual([]);
  });

  it('notes active threads with nothing recorded, and planned ones already under way', async () => {
    const { thread, issuesOf, write } = await world(10, 0);
    await thread('Empty', 'active');
    await thread('Started', 'planned', [2]);
    await thread('Later', 'planned', [9]);
    expect([await issuesOf('Empty'), await issuesOf('Started')]).toEqual([[], []]);
    await write(4);
    expect([await issuesOf('Empty'), await issuesOf('Started'), await issuesOf('Later')]).toEqual([['no-beats'], ['planned-underway'], []]);
  });

  it('notes a thread still open after the place it was meant to resolve', async () => {
    const { t, m, thread, chapters, write, issuesOf, report } = await world(12, 6);
    const arc = await m.create('arc', null, 'The Siege Arc');
    await m.move(arc.id, null, chapters[6].id);
    for (const i of [3, 4, 5]) await m.move(chapters[i].id, arc.id);
    const open = await thread('Feud', 'active', [5]);
    const closed = await thread('Duel', 'resolved', [5]);
    for (const x of [open, closed]) await t.update(x.id, { targetNodeId: arc.id });
    // The arc holds chapters 4 to 6; the manuscript is still inside it.
    expect(await issuesOf('Feud')).toEqual([]);
    await write(9);
    expect([await issuesOf('Feud'), await issuesOf('Duel')]).toEqual([['overdue'], []]);
    expect((await report()).reports.find((r) => r.thread.title === 'Feud')!.issues[0].message).toBe('Meant to resolve by “The Siege Arc”; the manuscript is 3 chapters past it and the thread is still Active.');
  });

  it('keeps a development whose chapter was deleted, and says so', async () => {
    const { t, m, thread, chapters, report } = await world(5, 5);
    const prince = await thread('Prince', 'resolved', [2, 4]);
    await m.remove(chapters[1].id);
    const stored = (await t.get(prince.id))!;
    expect(stored.beats.map((b) => b.nodeId)).toEqual([chapters[1].id, chapters[3].id]);
    const [mine] = (await report()).reports;
    expect(mine.beats.map((b) => `${beatPlace(b)}: ${b.beat.title}`)).toEqual(['Ch 3: Beat in 4', 'Chapter removed: Beat in 2']);
    expect(mine.issues.map((i) => i.message)).toEqual(['1 development points at a chapter or scene that is no longer in the manuscript.']);
    // Editing another development leaves the orphaned one exactly as it was.
    await t.updateBeat(prince.id, stored.beats[1].id, { title: 'Renamed' });
    expect((await t.get(prince.id))!.beats[0]).toEqual(stored.beats[0]);
  });

  it('stays silent about a thread the author has muted', async () => {
    const { t, thread, report } = await world(40, 40);
    const prince = await thread('Prince', 'active', [3]);
    await t.update(prince.id, { muted: true });
    const [mine] = (await report()).reports;
    expect([mine.issues, mine.silenced, mine.quietFor]).toEqual([[], 1, 37]);
  });

  it('never changes a thread, a chapter or anything else it looks at', async () => {
    const { t, m, thread, chapters, write } = await world(50, 0);
    await thread('Quiet', 'active', [1]);
    await thread('Paused', 'paused', [1]);
    await thread('Planned', 'planned', [2]);
    const late = await thread('Late', 'active', [1, 30]);
    await t.update(late.id, { targetNodeId: chapters[4].id });
    await m.remove(chapters[49].id);
    await write(49);
    const dump = async () => JSON.stringify(await Promise.all(db.tables.map((table) => table.toArray())));
    const before = await dump();
    const threads = await t.list();
    const nodes = await m.list();
    const frozen = JSON.stringify([threads, nodes]);
    const { reports } = diagnose(threads, nodes);
    expect(reports.flatMap((r) => r.issues).length).toBeGreaterThanOrEqual(5);
    expect(JSON.stringify([threads, nodes])).toBe(frozen);
    expect(await dump()).toBe(before);
    expect((await t.list()).map((x) => `${x.title}:${x.status}`).sort()).toEqual(['Late:active', 'Paused:paused', 'Planned:planned', 'Quiet:active']);
  });
});

describe('plot threads and projects', () => {
  it('keeps threads inside their project, and carries them through copies and backups', async () => {
    const { p, t, mira, palace, chapters, thread } = await world(4, 4);
    const prince = await thread('Prince', 'active', [1, 3]);
    await t.update(prince.id, { characterIds: [mira.id], locationIds: [palace.id], targetNodeId: chapters[3].id, category: 'mystery' });

    const other = plot.forProject((await projects.create({ title: 'Other' })).id);
    expect(await other.list()).toEqual([]);
    expect(await other.get(prince.id)).toBeUndefined();
    await expect(other.update(prince.id, { title: 'x' })).rejects.toThrow('not found');
    await expect(other.addBeat(prince.id, { title: 'x' })).rejects.toThrow('not found');
    await expect(other.remove(prince.id)).rejects.toThrow('not found');
    const theirs = await other.create('Theirs');
    await other.update(theirs.id, { characterIds: [mira.id], locationIds: [palace.id], targetNodeId: chapters[0].id });
    expect((await other.addBeat(theirs.id, { title: 'b', nodeId: chapters[0].id })).nodeId).toBeNull();
    expect(await other.get(theirs.id)).toMatchObject({ characterIds: [], locationIds: [], targetNodeId: null });

    for (const projectId of [(await projects.duplicate(p.id)).id, (await projects.importSnapshot(JSON.parse(JSON.stringify(await projects.exportSnapshot(p.id, { everything: true }))))).id]) {
      const [copy] = await plot.forProject(projectId).list();
      const entries = await codex.forProject(projectId).list();
      const nodes = await manuscript.forProject(projectId).list();
      expect(copy.id).not.toBe(prince.id);
      expect(copy).toMatchObject({ title: 'Prince', status: 'active', category: 'mystery' });
      expect(entries.find((e) => e.id === copy.characterIds[0])?.name).toBe('Mira');
      expect(entries.find((e) => e.id === copy.locationIds[0])?.name).toBe('The Palace');
      expect(nodes.find((x) => x.id === copy.targetNodeId)?.title).toBe('Chapter 4');
      expect(copy.beats.map((b) => nodes.find((x) => x.id === b.nodeId)?.title)).toEqual(['Chapter 1', 'Chapter 3']);
      expect(diagnose([copy], nodes).reports[0].beats.map(beatPlace)).toEqual(['Ch 1', 'Ch 3']);
    }
    // The original still points at its own chapters.
    expect((await t.get(prince.id))!.beats.map((b) => b.nodeId)).toEqual([chapters[0].id, chapters[2].id]);
    await projects.remove(p.id);
    expect(await t.list()).toEqual([]);
    expect(await other.list()).toHaveLength(1);
  });
});
