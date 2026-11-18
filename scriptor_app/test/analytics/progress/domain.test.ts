// Writing progress, as the Flutter app's tests check it: the progress report against the original app's own golden
// (flutter_app/test/shared/domain/analytics_test.dart's progress part), goals as goal_changes_test.dart keeps them,
// the shelf of lengths (length_shelf_test.dart), and the logic of progress_screens_test.dart's Progress page on its
// novel (Ash Road), run as the changes and words the page makes.

import { join } from 'node:path';

import { computeJournal, writingSessionOf } from '../../../src/domain/desk/dayBook';
import { GoalChanges, GoalService } from '../../../src/domain/analytics/goalChanges';
import {
  addDays,
  computeProgress,
  dayKeyOf,
  daysBetween,
  Goal,
  mediumDay,
  parseDay,
  type ProgressReport,
  type TrendPoint,
  weekStart,
  WritingSession,
} from '../../../src/domain/analytics/progress';
import {
  deadlineText,
  deadlineWhen,
  describeDay,
  healthLine,
  journalHero,
  lengthOf,
  lengthSentence,
  periodTiles,
  sealOf,
  yearDayAt,
  yearLabel,
  yearMonths,
  yearLabels,
  yearStep,
} from '../../../src/domain/analytics/screens/progressPage';
import { type JsonMap } from '../../../src/domain/json';
import { intOrNull } from '../../../src/domain/records/jsonRecord';
import { StoryNode } from '../../../src/domain/records/storyNode';
import { NovelSnapshot } from '../../../src/domain/snapshot/novelSnapshot';
import { flutterFixturesDir, readJson } from '../../fixtures';
import { expectJson } from '../../timeline/compare';

// ---------------------------------------------------------------------------------------------- the original golden

/** Noon on October 25, 2026: the day the reports are read on. */
const now = new Date(2026, 9, 25, 12).getTime();
const trendJson = (p: TrendPoint) => ({ key: p.key, label: p.label, net: p.net, current: p.current });

function progressJson(p: ProgressReport): JsonMap {
  const target = (t: ProgressReport['daily']) => (t === null ? null : { goal: t.goal.raw, words: t.words, target: t.target, percent: t.percent });
  return {
    totalWords: p.totalWords,
    targetWords: p.targetWords,
    percent: p.percent,
    today: p.today.toJson(),
    week: p.week.toJson(),
    month: p.month.toJson(),
    chapters: p.chapters,
    scenes: p.scenes,
    averageChapterWords: p.averageChapterWords,
    statusCounts: Object.fromEntries(p.statusCounts),
    sessionCount: p.sessionCount,
    averageWordsPerSession: p.averageWordsPerSession,
    totalMinutes: p.totalMinutes,
    currentRun: p.currentRun,
    daysWrittenLast30: p.daysWrittenLast30,
    lastWritingDay: p.lastWritingDay,
    days: p.days.map(trendJson),
    weeks: p.weeks.map(trendJson),
    daily: target(p.daily),
    weekly: target(p.weekly),
    deadlines: p.deadlines.map((d) => ({
      goal: d.goal.raw,
      scope: d.scope,
      words: d.words,
      target: d.target,
      percent: d.percent,
      daysLeft: d.daysLeft,
      perDay: d.perDay,
      reached: d.reached,
    })),
    tasks: p.tasks,
  };
}

describe('the progress report agrees with the original', () => {
  const golden = readJson(join(flutterFixturesDir, 'golden', 'analytics.golden.json')) as Record<string, JsonMap>;
  for (const name of ['qa-sample', 'made-in-the-app', 'analytics']) {
    test(`${name}: the progress report agrees`, () => {
      const s = NovelSnapshot.fromJson(readJson(join(flutterFixturesDir, `${name}.novel.json`)) as JsonMap);
      const p = computeProgress({
        targetWordCount: intOrNull(s.project['targetWordCount']),
        nodes: s.rows('chapters').map((r) => new StoryNode(r)),
        sessions: s.rows('writingSessions').map((r) => new WritingSession(r)),
        goals: s.rows('goals').map((r) => new Goal(r)),
        now,
      });
      expectJson(progressJson(p), golden[name]['progress'], `${name}.progress`);
    });
  }
});

// ------------------------------------------------------------------------------------------------- goal_changes_test

function fresh(): GoalChanges {
  let n = 0;
  return new GoalChanges(
    NovelSnapshot.fromJson({
      format: 'novel-builder/project',
      version: 4,
      exportedAt: 0,
      project: { id: 'p', title: 'Goals' },
      collections: { writingSessions: [{ id: 'w', projectId: 'p', day: '2026-10-24', netWords: 10 }] },
    }),
    { now: 1000, createId: () => `g${n++}` },
  );
}

const refused = (run: () => unknown) => {
  try {
    run();
  } catch (e) {
    return (e as Error).name === 'ChangeRefused';
  }
  return false;
};

describe('goals, as the original keeps them', () => {
  test('a word target is set, changed in place, and removed by a blank or zero', () => {
    const c = fresh();
    c.setTarget('daily', '500.4');
    expect(c.goals.map((g) => [g.kind, g.targetWords])).toEqual([['daily', 500]]);
    c.setTarget('daily', 750);
    expect(c.goals.map((g) => [g.id, g.targetWords])).toEqual([['g0', 750]]);
    c.setTarget('weekly', 'lots');
    expect(c.goals).toHaveLength(1);
    c.setTarget('daily', 0);
    expect(c.goals).toHaveLength(0);
    expect(c.rows('writingSessions')).toHaveLength(1);
  });

  test('a deadline needs a name and a date; a task gets a kind', () => {
    const c = fresh();
    expect(refused(() => c.addGoal('deadline', { title: ' ', dueDate: '2026-12-31' }))).toBe(true);
    expect(refused(() => c.addGoal('deadline', { title: 'Draft', dueDate: '31/12/2026' }))).toBe(true);
    expect(refused(() => c.addGoal('task', { title: '' }))).toBe(true);
    const d = c.addGoal('deadline', { title: ' Draft ', dueDate: '2026-12-31', targetWords: '0', nodeId: '' });
    expect([d.title, d.dueDate, d.targetWords, d.nodeId, d.raw['category']]).toEqual(['Draft', '2026-12-31', null, null, null]);
    const t = c.addGoal('task', { title: 'Map', category: 'sailing', nodeId: 'c1', dueDate: '' });
    expect([t.raw['category'], t.nodeId, t.dueDate]).toEqual(['other', null, null]);
  });

  test('a change keeps the name and date when they are left blank; checking off is recorded and undone', () => {
    const c = fresh();
    const d = c.addGoal('deadline', { title: 'Draft', dueDate: '2026-12-31' });
    c.updateGoal(d.id, { title: '', dueDate: '', targetWords: 2000, nodeId: 'c2' });
    const after = c.goals[0];
    expect([after.title, after.dueDate, after.targetWords, after.nodeId]).toEqual(['Draft', '2026-12-31', 2000, 'c2']);
    c.setDone(d.id, true);
    expect([c.goals[0].done, c.goals[0].raw['doneAt']]).toEqual([true, 1000]);
    c.setDone(d.id, false);
    expect([c.goals[0].done, c.goals[0].raw['doneAt']]).toEqual([false, null]);
    c.removeGoal(d.id);
    expect(c.goals).toHaveLength(0);
    expect(refused(() => c.removeGoal(d.id))).toBe(true);
  });
});

// ------------------------------------------------------------------------------------------------- length_shelf_test

test('the length of fiction a word count is, and the words to the next', () => {
  expect(lengthOf(0)).toEqual({ index: 0, through: 0 });
  expect(lengthOf(999).index).toBe(0);
  expect(lengthOf(1000)).toEqual({ index: 1, through: 0 });
  expect(lengthOf(4250)).toEqual({ index: 1, through: 0.5 });
  expect(lengthOf(40000).index).toBe(4);
  expect(lengthOf(250000)).toEqual({ index: 5, through: 1 });
  expect(lengthSentence(0)).toBe('No pages yet, the length of flash fiction. 1,000 more words and it is the length of a short story.');
  expect(lengthSentence(24).startsWith('Less than a manuscript page')).toBe(true);
  expect(lengthSentence(999).endsWith('1 more word and it is the length of a short story.')).toBe(true);
  expect(lengthSentence(80000)).toBe('About 320 manuscript pages, the length of a novel. 20,000 more words and it is the length of a long novel.');
  expect(lengthSentence(120000).endsWith('the length of a long novel. Long enough for any shelf.')).toBe(true);
  // Ash Road's 5,000 words, as the Progress page's shelf says them.
  expect(lengthSentence(5000)).toMatch(/the length of a short story\. .* novelette\.$/);
});

// ---------------------------------------------------------------------------------------- progress_screens_test (logic)

/** Ash Road: a target of 10,000; three chapters (the second with a scene); a log of today and yesterday. */
function ashRoad(today: string) {
  const node = (id: string, title: string, order: number, words: number, kind = 'chapter', parent: string | null = null): JsonMap => ({
    id,
    projectId: 'n',
    parentId: parent,
    kind,
    title,
    order,
    status: 'drafting',
    wordCount: words,
    createdAt: order,
    updatedAt: 0,
  });
  const session = (id: string, day: string, added: number): JsonMap => {
    const d = parseDay(day);
    return {
      id,
      projectId: 'n',
      day,
      startedAt: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9).getTime(),
      lastActiveAt: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 40).getTime(),
      netWords: added,
      added,
      removed: 0,
      saves: 2,
    };
  };
  return {
    nodes: [
      node('c1', 'The Call', 0, 1200),
      node('c2', 'Crossing', 1, 0),
      node('s2', 'At the river', 2, 800, 'scene', 'c2'),
      node('c3', 'Ashes', 3, 3000),
    ].map((r) => new StoryNode(r)),
    sessions: [session('w1', addDays(today, -1), 900), session('w2', today, 350)].map((r) => new WritingSession(r)),
  };
}

function read(nowMs: number, goals: Goal[]) {
  const today = dayKeyOf(nowMs);
  const { nodes, sessions } = ashRoad(today);
  const report = computeProgress({ targetWordCount: 10000, nodes, sessions, goals, now: nowMs });
  const journal = computeJournal({
    sessions: sessions.map((s) => writingSessionOf(s.raw)),
    totalWords: report.totalWords,
    targetWords: report.targetWords,
    chapters: report.chapters,
    now: nowMs,
  });
  return { today, report, journal };
}

describe('the Progress page, on Ash Road', () => {
  for (const [label, nowMs] of [
    ['a Wednesday', new Date(2026, 9, 21, 15).getTime()],
    ['a Monday', new Date(2026, 9, 19, 15).getTime()],
    ['the first of a month', new Date(2026, 10, 1, 15).getTime()],
  ] as const) {
    test(`the writing log is described, and a daily target set (${label})`, () => {
      const { today, report, journal } = read(nowMs, []);
      expect(healthLine(report)).toContain('5,000 / 10,000 words • 50% complete');
      const tiles = periodTiles(report);
      expect(tiles[0].value).toBe('+350');
      // Today's session alone; on a Monday yesterday's falls in last week, and on the first of a month in last month.
      const monday = weekStart(addDays(today, -1)) !== weekStart(today);
      const firstOfMonth = new Date(nowMs).getDate() === 1;
      expect(tiles.filter((t) => t.detail === 'words in 1 session')).toHaveLength(1 + (monday ? 1 : 0) + (firstOfMonth ? 1 : 0));
      const hero = journalHero(journal, report);
      expect(hero.run.semantics).toBe('2 days in a row. Best: 2 days.');
      expect(yearLabel(journal)).toBe('A year of writing: 2 days written');
      const seals = journal.milestones.map(sealOf).map((s) => s.semantics);
      expect(seals).toContain('1,000 words, reached');
      expect(seals).toContain('Your target: 10,000, not yet: 5,000 words to go');
      expect(describeDay(journal, today)).toContain('+350 words in 1 session');
      expect(hero.ahead.label).toBe('Finished around');
      // Pressing yesterday's square says what was written that day.
      const step = yearStep(1400);
      const yesterday = addDays(today, -1);
      const col = 52 - Math.trunc(daysBetween(weekStart(yesterday), weekStart(today)) / 7);
      const row = (parseDay(yesterday).getDay() + 6) % 7;
      const day = yearDayAt(journal, yearLabels + col * step + step / 2 - 1.5, yearMonths + row * step + step / 2, step);
      expect(day).toBe(yesterday);
      expect(describeDay(journal, day!)).toContain('+900 words in 1 session');
      // A daily target of 500.
      const c = new GoalChanges(
        NovelSnapshot.fromJson({ format: 'novel-builder/project', version: 4, exportedAt: 0, project: { id: 'n', title: 'Ash Road' }, collections: {} }),
        { now: nowMs, createId: () => 'g' },
      );
      c.setTarget('daily', '500');
      expect(periodTiles(read(nowMs, c.goals).report)[0].meter?.caption).toBe('70% of 500');
      c.setTarget('daily', '');
      expect(c.goals).toHaveLength(0);
    });
  }

  test('a deadline over a part: its date, its part and the words a day that get there', () => {
    const nowMs = new Date(2026, 9, 21, 15).getTime();
    const today = dayKeyOf(nowMs);
    const due = addDays(today, 10);
    const goal = new Goal({ id: 'd', projectId: 'n', kind: 'deadline', title: 'Crossing done', dueDate: due, targetWords: 1800, nodeId: 'c2' });
    const d = read(nowMs, [goal]).report.deadlines[0];
    expect(deadlineWhen(d)).toBe(`${mediumDay(due)} · Crossing`);
    expect(deadlineText(d)).toBe('800 / 1,800 words · 10 days to go · about 100 a day gets there');
  });

  test('goals are saved through the service, the writing log untouched', () => {
    const rows = new Map<string, JsonMap[]>([['writingSessions', [{ id: 'w', projectId: 'n', day: '2026-10-24', netWords: 5 }]]]);
    let saved: NovelSnapshot | null = null;
    const store = {
      loadPart: (id: string, collections: Iterable<string>) =>
        NovelSnapshot.fromJson({
          format: 'novel-builder/project',
          version: 4,
          exportedAt: 0,
          project: { id, title: 'Ash Road' },
          collections: Object.fromEntries([...collections].map((c) => [c, rows.get(c) ?? []])),
        }),
      saveChanges: (_before: NovelSnapshot, after: NovelSnapshot) => {
        saved = after;
      },
    } as unknown as ConstructorParameters<typeof GoalService>[0];
    const service = new GoalService(store, { clock: () => 5, createId: () => 'g1' });
    service.change('n', (c) => c.addGoal('task', { title: 'Map the river', category: 'worldbuilding' }));
    const after = saved as unknown as NovelSnapshot;
    expect(after.rows('goals').map((g) => [g['kind'], g['title'], g['category'], g['dueDate']])).toEqual([['task', 'Map the river', 'worldbuilding', null]]);
    expect(after.rows('writingSessions')).toHaveLength(0);
  });
});
