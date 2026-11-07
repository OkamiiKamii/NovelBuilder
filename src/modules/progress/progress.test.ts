import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { countWords } from '@/modules/manuscript/metrics';
import { createManuscriptService, registerManuscript, type ManuscriptService, type ProjectManuscript } from '@/modules/manuscript/service';
import { createProjectService, type ProjectService } from '@/modules/projects/service';
import { computeProgress } from './analytics';
import { createProgressService, registerProgress, SESSION_GAP, type ProgressService } from './service';
import { addDays, dayKey, daysBetween, weekStart } from './time';

let n = 0;
let db: NovelDB;
let projects: ProjectService;
let manuscript: ManuscriptService;
let progress: ProgressService;

/** Wednesday 14 October 2026, 10:00 local time. */
const NOW = new Date(2026, 9, 14, 10, 0).getTime();
const at = (dayOffset: number, hour = 10, minute = 0) => new Date(2026, 9, 14 + dayOffset, hour, minute).getTime();
const clock = (time: number) => vi.spyOn(Date, 'now').mockImplementation(() => time);
const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : undefined }] });
const lorem = (count: number) => Array.from({ length: count }, (_, i) => `w${i}`).join(' ');

async function write(m: ProjectManuscript, id: string, wordCount: number, time: number) {
  clock(time);
  const text = lorem(wordCount);
  await m.saveDoc(id, doc(text), { words: countWords(text), characters: text.length });
}

beforeEach(() => {
  db = new NovelDB(`progress-${++n}`);
  const registry = createProjectRegistry();
  projects = createProjectService(db, registry);
  registerProgress(registry);
  progress = createProgressService(db);
  registerManuscript(registry);
  manuscript = createManuscriptService(db, projects.contentChanged, progress.recordWriting);
});
afterEach(() => vi.restoreAllMocks());

describe('calendar', () => {
  it('uses local days and Monday-first weeks', () => {
    expect(dayKey(NOW)).toBe('2026-10-14');
    expect(dayKey(new Date(2026, 9, 14, 23, 59))).toBe('2026-10-14');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(weekStart('2026-10-14')).toBe('2026-10-12');
    expect(weekStart('2026-10-12')).toBe('2026-10-12');
    expect(weekStart('2026-10-18')).toBe('2026-10-12'); // Sunday belongs to the week that began Monday
    expect(daysBetween('2026-10-14', '2026-12-01')).toBe(48);
  });
});

describe('session log', () => {
  it('logs each save into sessions split by pauses and by day', async () => {
    const p = await projects.create({ title: 'P' });
    const m = manuscript.forProject(p.id);
    const a = await m.create('chapter');
    const b = await m.create('chapter');

    await write(m, a.id, 100, at(0, 9, 0));
    await write(m, a.id, 250, at(0, 9, 10));
    await write(m, b.id, 40, at(0, 9, 20)); // another chapter, same sitting
    await write(m, a.id, 300, at(0, 9, 20) + SESSION_GAP + 1); // after a break: new session
    await write(m, a.id, 320, at(1, 0, 5)); // next day: new session

    const sessions = (await progress.forProject(p.id).sessions()).sort((x, y) => x.startedAt - y.startedAt);
    expect(sessions.map((s) => [s.day, s.netWords, s.saves])).toEqual([
      ['2026-10-14', 290, 3],
      ['2026-10-14', 50, 1],
      ['2026-10-15', 20, 1],
    ]);
    expect(sessions[0].lastActiveAt - sessions[0].startedAt).toBe(20 * 60_000);
    expect(sessions.reduce((sum, s) => sum + s.netWords, 0)).toBe((await projects.getStats(p.id)).wordCount);
  });

  it('counts cutting and rewording as writing time, with words going down', async () => {
    const p = await projects.create({ title: 'P' });
    const m = manuscript.forProject(p.id);
    const a = await m.create('chapter');
    await write(m, a.id, 500, at(-1));
    await write(m, a.id, 380, at(0, 9, 0)); // trimmed 120
    await write(m, a.id, 380, at(0, 9, 5)); // reworded, same length
    await write(m, a.id, 400, at(0, 9, 9));

    const today = (await progress.forProject(p.id).sessions()).find((s) => s.day === '2026-10-14')!;
    expect(today).toMatchObject({ netWords: -100, added: 20, removed: 120, saves: 3 });
    const report = computeProgress({ targetWordCount: null, nodes: await m.list(), sessions: await progress.forProject(p.id).sessions(), goals: [], now: at(0, 12) });
    expect(report.today).toMatchObject({ net: -100, added: 20, removed: 120, sessions: 1, minutes: 9 });
    expect(report.currentRun).toBe(2); // an editing day keeps the run going
  });

  it('a failed save logs nothing; restoring a version is not logged as writing', async () => {
    const p = await projects.create({ title: 'P' });
    const m = manuscript.forProject(p.id);
    const a = await m.create('chapter');
    await write(m, a.id, 100, at(0, 9));
    await m.saveVersion(a.id, 'v');
    await write(m, a.id, 150, at(0, 9, 1));

    vi.spyOn(db.projectStats, 'put').mockRejectedValueOnce(new Error('disk full'));
    await expect(write(m, a.id, 999, at(0, 9, 2))).rejects.toThrow('disk full');
    await m.restoreRevision(a.id, (await m.revisions(a.id)).find((r) => r.label === 'v')!.id);

    const [session] = await progress.forProject(p.id).sessions();
    expect(session).toMatchObject({ netWords: 150, saves: 2 });
  });
});

describe('analytics', () => {
  async function history() {
    const p = await projects.create({ title: 'P', targetWordCount: 50_000 });
    const m = manuscript.forProject(p.id);
    const volume = await m.create('volume');
    const c1 = await m.create('chapter', volume.id);
    const c2 = await m.create('chapter', volume.id);
    const c3 = await m.create('chapter');
    const s1 = await m.create('scene', c2.id);
    const s2 = await m.create('scene', c2.id);
    // Monday 5 Oct … Wednesday 14 Oct
    await write(m, c1.id, 1000, at(-40)); // early September
    await write(m, c1.id, 3000, at(-9)); // Mon 5 Oct  +2000
    await write(m, s1.id, 1500, at(-7)); // Wed 7 Oct  +1500
    await write(m, s2.id, 500, at(-2)); // Mon 12 Oct +500
    await write(m, s2.id, 1200, at(-1)); // Tue 13 Oct +700
    await write(m, c3.id, 250, at(0, 8)); // today +250
    await write(m, c3.id, 450, at(0, 9, 30)); // today, second session +200
    await m.update(c1.id, { status: 'final' });
    await m.update(s1.id, { status: 'draft-complete' });
    await m.update(c2.id, { status: 'drafting' });
    vi.restoreAllMocks();
    return { p, m, volume, c1, c2, c3, s1, s2 };
  }
  const report = async (projectId: string, goals = false) =>
    computeProgress({
      targetWordCount: (await projects.get(projectId))!.targetWordCount,
      nodes: await manuscript.forProject(projectId).list(),
      sessions: await progress.forProject(projectId).sessions(),
      goals: goals ? await progress.forProject(projectId).goals() : [],
      now: NOW,
    });

  it('computes today, this week and this month from the session log', async () => {
    const { p } = await history();
    const r = await report(p.id);
    expect(r.today).toMatchObject({ net: 450, sessions: 2, activeDays: 1 });
    expect(r.week).toMatchObject({ net: 1650, sessions: 4, activeDays: 3 }); // Mon 12 – Wed 14
    expect(r.month).toMatchObject({ net: 5150, sessions: 6, activeDays: 5 }); // October only
    expect(r.today.net + 0).toBe(r.days.at(-1)!.net);
  });

  it('reports manuscript and structural progress', async () => {
    const { p } = await history();
    const r = await report(p.id);
    expect(r).toMatchObject({
      totalWords: 6150,
      targetWords: 50_000,
      percent: 12,
      chapters: { total: 3, completed: 1 },
      scenes: { total: 2, completed: 1 },
      averageChapterWords: 2050, // (3000 + 2700 + 450) / 3, scenes rolled into their chapter
      sessionCount: 7,
      averageWordsPerSession: 879,
    });
    expect(r.statusCounts).toMatchObject({ idea: 2, drafting: 1, 'draft-complete': 1, final: 1, published: 0 });
  });

  it('counts days written without penalising days off', async () => {
    const { p } = await history();
    const r = await report(p.id);
    expect(r.currentRun).toBe(3); // Mon, Tue, Wed
    expect(r.daysWrittenLast30).toBe(5);
    expect(r.lastWritingDay).toBe('2026-10-14');

    // Tomorrow morning, before writing: yesterday's run still stands.
    const tomorrow = computeProgress({ targetWordCount: null, nodes: [], sessions: await progress.forProject(p.id).sessions(), goals: [], now: at(1, 7) });
    expect(tomorrow.currentRun).toBe(3);
    expect(tomorrow.today.net).toBe(0);
    // After two days away the run is simply 0; nothing else changes.
    const later = computeProgress({ targetWordCount: null, nodes: [], sessions: await progress.forProject(p.id).sessions(), goals: [], now: at(3) });
    expect(later.currentRun).toBe(0);
    expect(later.lastWritingDay).toBe('2026-10-14');
    expect(later.daysWrittenLast30).toBe(5);
  });

  it('builds the daily and weekly trends', async () => {
    const { p } = await history();
    const r = await report(p.id);
    expect(r.days).toHaveLength(14);
    expect(r.days.filter((d) => d.net).map((d) => [d.key, d.net])).toEqual([['2026-10-05', 2000], ['2026-10-07', 1500], ['2026-10-12', 500], ['2026-10-13', 700], ['2026-10-14', 450]]);
    expect(r.days.at(-1)).toMatchObject({ key: '2026-10-14', current: true });
    expect(r.weeks).toHaveLength(8);
    expect(r.weeks.slice(-2).map((w) => [w.key, w.net, w.current])).toEqual([['2026-10-05', 3500, false], ['2026-10-12', 1650, true]]);
    expect(r.weeks.find((w) => w.key === '2026-08-31')!.net).toBe(1000);
  });

  it('measures word targets and deadlines, including one for part of the book', async () => {
    const { p, volume } = await history();
    const g = progress.forProject(p.id);
    await g.setTarget('daily', 1000);
    await g.setTarget('weekly', 5000);
    await g.addGoal('deadline', { title: 'Finish Volume 1', dueDate: '2026-12-01', targetWords: 30_000, nodeId: volume.id });
    await g.addGoal('deadline', { title: 'First draft', dueDate: '2026-10-20', targetWords: 6000 });
    await g.addGoal('deadline', { title: 'Beta readers', dueDate: '2026-10-10' });

    const r = await report(p.id, true);
    expect(r.daily).toMatchObject({ words: 450, target: 1000, percent: 45 });
    expect(r.weekly).toMatchObject({ words: 1650, target: 5000, percent: 33 });
    expect(r.deadlines.map((d) => [d.goal.title, d.scope, d.words, d.percent, d.daysLeft, d.perDay, d.reached])).toEqual([
      ['Beta readers', null, 6150, null, -4, null, false],
      ['First draft', null, 6150, 100, 6, null, true],
      ['Finish Volume 1', 'Volume 1', 5700, 19, 48, 507, false],
    ]);
  });
});

describe('goals and tasks', () => {
  it('sets, changes and clears the daily and weekly targets', async () => {
    const p = await projects.create({ title: 'P' });
    const g = progress.forProject(p.id);
    await g.setTarget('daily', 1000);
    await g.setTarget('daily', 750.4);
    await g.setTarget('weekly', 4000);
    expect((await g.goals()).map((x) => [x.kind, x.targetWords]).sort()).toEqual([['daily', 750], ['weekly', 4000]]);
    await g.setTarget('daily', 0);
    await g.setTarget('weekly', null);
    expect(await g.goals()).toEqual([]);
  });

  it('creates, edits, checks off and deletes non-word-count tasks', async () => {
    const p = await projects.create({ title: 'P' });
    const g = progress.forProject(p.id);
    const lore = await g.addGoal('task', { title: ' Complete magic system lore ', category: 'worldbuilding' });
    const outline = await g.addGoal('task', { title: 'Outline Chapters 20–30', category: 'planning', dueDate: '2026-11-01' });
    await g.addGoal('task', { title: 'Revise Volume 1', category: 'nonsense' as never });
    await expect(g.addGoal('task', { title: '   ' })).rejects.toThrow('name');
    await expect(g.addGoal('deadline', { title: 'No date' })).rejects.toThrow('date');

    await g.setDone(lore.id, true);
    await g.updateGoal(outline.id, { title: 'Outline Chapters 20–35', category: 'editing' });
    await g.updateGoal(outline.id, { title: '  ' }); // blank title: keeps the old one

    const goals = await g.goals();
    expect(goals.find((x) => x.id === lore.id)).toMatchObject({ title: 'Complete magic system lore', category: 'worldbuilding', done: true, targetWords: null });
    expect(goals.find((x) => x.id === lore.id)!.doneAt).toBeGreaterThan(0);
    expect(goals.find((x) => x.id === outline.id)).toMatchObject({ title: 'Outline Chapters 20–35', category: 'editing', dueDate: '2026-11-01', done: false });
    expect(goals.find((x) => x.title === 'Revise Volume 1')!.category).toBe('other');
    expect(computeProgress({ targetWordCount: null, nodes: [], sessions: [], goals, now: NOW }).tasks).toEqual({ total: 3, done: 1 });

    await g.setDone(lore.id, false);
    expect((await g.goals()).find((x) => x.id === lore.id)).toMatchObject({ done: false, doneAt: null });
    await g.removeGoal(outline.id);
    expect(await g.goals()).toHaveLength(2);
  });

  it('is private to its project and travels with it', async () => {
    const p = await projects.create({ title: 'P' });
    const m = manuscript.forProject(p.id);
    const volume = await m.create('volume');
    const chapter = await m.create('chapter', volume.id);
    await write(m, chapter.id, 100, at(0));
    vi.restoreAllMocks();
    const g = progress.forProject(p.id);
    const task = await g.addGoal('task', { title: 'Task' });
    await g.addGoal('deadline', { title: 'Volume due', dueDate: '2026-12-01', targetWords: 1000, nodeId: volume.id });

    const other = progress.forProject((await projects.create({ title: 'Other' })).id);
    expect(await other.goals()).toEqual([]);
    expect(await other.sessions()).toEqual([]);
    await expect(other.setDone(task.id, true)).rejects.toThrow('not found');
    await expect(other.updateGoal(task.id, { title: 'x' })).rejects.toThrow('not found');
    await expect(other.removeGoal(task.id)).rejects.toThrow('not found');

    const copy = await projects.duplicate(p.id);
    const copiedVolume = (await manuscript.forProject(copy.id).list()).find((x) => x.kind === 'volume')!;
    const copiedGoals = await progress.forProject(copy.id).goals();
    expect(copiedGoals.map((x) => x.title).sort()).toEqual(['Task', 'Volume due']);
    expect(copiedGoals.find((x) => x.kind === 'deadline')!.nodeId).toBe(copiedVolume.id); // re-pointed at the copy
    expect(await progress.forProject(copy.id).sessions()).toHaveLength(1);

    const file = JSON.parse(JSON.stringify(await projects.exportSnapshot(p.id)));
    expect(file.collections.writingSessions).toHaveLength(1);
    expect(file.collections.goals).toHaveLength(2);

    await projects.remove(p.id);
    expect(await g.goals()).toEqual([]);
    expect(await g.sessions()).toEqual([]);
    expect(await progress.forProject(copy.id).goals()).toHaveLength(2);
  });
});
