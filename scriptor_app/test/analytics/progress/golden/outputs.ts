// Scriptor's outputs for the Progress page, keyed and shaped as golden/dump.dart writes the Flutter app's: for every
// novel, read at noon on October 25, 2026, with its own log and goals and with made-up ones, the progress report, the
// journal and what the page says and draws; a script of goal changes; and `misc`.

import { computeJournal, type Journal, type Milestone, writingSessionOf } from '../../../../src/domain/desk/dayBook';
import { GoalChanges } from '../../../../src/domain/analytics/goalChanges';
import {
  addDays,
  clockTime,
  computeProgress,
  dayKeyOf,
  daysBetween,
  Goal,
  longDay,
  mediumDay,
  monthOf,
  parseDay,
  type ProgressReport,
  shortDay,
  type TrendPoint,
  weekdayDay,
  weekStart,
  WritingSession,
} from '../../../../src/domain/analytics/progress';
import {
  compactNumber,
  deadlineScopes,
  deadlineText,
  deadlineWhen,
  describeDay,
  duration,
  healthLine,
  journalHero,
  lengthOf,
  lengthSentence,
  manuscriptTargetLine,
  periodTiles,
  recentSessions,
  scopeLabel,
  sealOf,
  shelfSpines,
  signed,
  statusRows,
  summaryLine,
  taskLine,
  tasksCount,
  tasksInOrder,
  trendView,
  typedTarget,
  yearDayAt,
  yearGrid,
  yearLabel,
  yearStep,
  yearTable,
  yearWritten,
} from '../../../../src/domain/analytics/screens/progressPage';
import { type JsonMap } from '../../../../src/domain/json';
import { Novel } from '../../../../src/domain/records/novel';
import { StoryNode } from '../../../../src/domain/records/storyNode';
import { type NovelSnapshot } from '../../../../src/domain/snapshot/novelSnapshot';

/** Noon on October 25, 2026: the day the page is read on. */
export const now = new Date(2026, 9, 25, 12).getTime();

const trendJson = (p: TrendPoint) => ({ key: p.key, label: p.label, net: p.net, current: p.current });

function progressJson(p: ProgressReport): JsonMap {
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
    daily: p.daily === null ? null : { goal: p.daily.goal.raw, words: p.daily.words, target: p.daily.target, percent: p.daily.percent },
    weekly: p.weekly === null ? null : { goal: p.weekly.goal.raw, words: p.weekly.words, target: p.weekly.target, percent: p.weekly.percent },
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

function journalJson(j: Journal): JsonMap {
  return {
    today: j.today,
    days: [...j.days.values()].map((d) => ({ day: d.day, net: d.net, sessions: d.sessions })),
    currentRun: j.currentRun,
    bestRun: j.bestRun,
    pacePerDay: j.pacePerDay,
    finishDay: j.finishDay,
    milestones: j.milestones.map((m: Milestone) => ({ label: m.label, kind: m.kind, reached: m.reached, toGo: m.toGo })),
  };
}

function year(j: Journal, width: number): unknown {
  const step = yearStep(width);
  const g = yearGrid(j, step);
  return {
    step,
    cell: g.cell,
    width: g.width,
    height: g.height,
    cells: g.cells.map((c) => [c.day, c.x, c.y, c.level, c.today]),
    months: g.months,
    weekdays: g.weekdays,
    label: yearLabel(j),
    table: yearTable(j),
    said: yearWritten(j).slice(0, 40).map((d) => describeDay(j, d)),
    today: describeDay(j, j.today),
    at: (
      [
        [31, 19],
        [100, 40],
        [500, 100],
        [0, 0],
        [1200, 300],
        [900, 150],
      ] as const
    ).map(([x, y]) => yearDayAt(j, x, y, step)),
  };
}

/** The made-up writing log of dump.dart, the same on both sides. */
function madeUpLog(projectId: string): JsonMap[] {
  const today = dayKeyOf(now);
  const out: JsonMap[] = [];
  for (let i = 0; i < 400; i++) {
    const day = addDays(today, -i);
    if (i > 12 && (i * 7) % 5 === 0) continue;
    if (i === 0) continue;
    const added = (i * 137) % 900;
    const removed = i % 9 === 0 ? (i * 31) % 400 : 0;
    const d = parseDay(day);
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 6 + (i % 13), (i * 17) % 60).getTime();
    out.push({
      id: `s${i}`,
      projectId,
      day,
      startedAt: start,
      lastActiveAt: start + ((i * 523) % 7200) * 1000,
      netWords: added - removed,
      added,
      removed,
    });
    if (i % 4 === 1) {
      out.push({
        id: `t${i}`,
        projectId,
        day,
        startedAt: start + 3 * 3600000,
        lastActiveAt: start + 3 * 3600000 + 25 * 60000,
        netWords: -(i % 50),
        added: 0,
        removed: i % 50,
      });
    }
  }
  return out;
}

function madeUpGoals(projectId: string, nodes: readonly StoryNode[]): JsonMap[] {
  const today = dayKeyOf(now);
  const part = nodes.find((n) => n.kind !== 'scene') ?? null;
  const g = (
    id: string,
    kind: string,
    o: { title?: string; target?: number; due?: string; nodeId?: string | null; category?: string; done?: boolean; doneAt?: number; created?: number } = {},
  ): JsonMap => ({
    id,
    projectId,
    kind,
    title: o.title ?? '',
    targetWords: o.target ?? null,
    dueDate: o.due ?? null,
    nodeId: o.nodeId ?? null,
    category: o.category ?? null,
    done: o.done ?? false,
    doneAt: o.doneAt ?? null,
    createdAt: o.created ?? 0,
    updatedAt: o.created ?? 0,
  });
  return [
    g('gd', 'daily', { target: 300 }),
    g('gw', 'weekly', { target: 2500 }),
    g('d1', 'deadline', { title: 'Draft', target: 90000, due: addDays(today, 40), created: 3 }),
    g('d2', 'deadline', { title: 'Today', due: today, created: 4 }),
    g('d3', 'deadline', { title: 'Late', target: 50, due: addDays(today, -6), created: 5 }),
    g('d4', 'deadline', { title: 'Part', target: 2000, due: addDays(today, 9), nodeId: part?.id ?? null, created: 6 }),
    g('d5', 'deadline', { title: 'Gone part', target: 10, due: addDays(today, 2), nodeId: 'nowhere', created: 7 }),
    g('t1', 'task', { title: 'Map', category: 'worldbuilding', due: addDays(today, 3), created: 9 }),
    g('t2', 'task', { title: 'Outline', category: 'planning', done: true, doneAt: now - 86400000 * 2, created: 8 }),
    g('t3', 'task', { title: 'Fix', category: 'nonsense', created: 2 }),
    g('t4', 'task', { title: 'Edit', category: 'editing', due: 'not a date', created: 10 }),
  ];
}

function page(s: NovelSnapshot, sessions: WritingSession[], goals: Goal[]): unknown {
  const novel = new Novel(s.project);
  const nodes = s.rows('chapters').map((r) => new StoryNode(r));
  const report = computeProgress({ targetWordCount: novel.targetWordCount, nodes, sessions, goals, now });
  const journal = computeJournal({
    sessions: sessions.map((x) => writingSessionOf(x.raw)),
    totalWords: report.totalWords,
    targetWords: report.targetWords,
    chapters: report.chapters,
    now,
  });
  const trend = trendView(report.weeks);
  return {
    report: progressJson(report),
    journal: journalJson(journal),
    health: healthLine(report),
    hero: journalHero(journal, report),
    shelf: { sentence: lengthSentence(report.totalWords), spines: shelfSpines(report.totalWords) },
    year: [year(journal, 390), year(journal, 1400)],
    seals: journal.milestones.map(sealOf),
    tiles: periodTiles(report),
    summary: summaryLine(report),
    trend: {
      empty: trend.empty,
      bars: trend.bars.map((b) => ({ key: b.key, short: b.short, value: b.value, current: b.current, label: b.label, said: b.said, top: b.top })),
      rows: trend.rows,
    },
    statuses: statusRows(report).map((r) => ({ key: r.key, label: r.label, count: r.count, share: r.share })),
    targetLine: manuscriptTargetLine(novel.targetWordCount, novel.deadline),
    deadlines: report.deadlines.map((d) => ({ title: d.goal.title, when: deadlineWhen(d), text: deadlineText(d) })),
    tasks: tasksInOrder(goals).map((t) => ({ title: t.title, line: taskLine(t) })),
    tasksCount: tasksCount(report),
    recent: recentSessions(sessions),
    scopes: deadlineScopes(nodes).map(scopeLabel),
  };
}

function script(s: NovelSnapshot): unknown {
  let n = 0;
  const c = new GoalChanges(s, { now, createId: () => `g${n++}` });
  const out: unknown[] = [];
  const step = (name: string, run: () => void) => {
    try {
      run();
      out.push({ step: name, goals: c.goals.map((g) => g.raw) });
    } catch (e) {
      if ((e as Error).name !== 'ChangeRefused') throw e;
      out.push({ step: name, refused: (e as Error).message });
    }
  };
  const part = s.rows('chapters').map((r) => new StoryNode(r)).find((x) => x.kind !== 'scene')?.id ?? '';
  step('daily 500.4', () => c.setTarget('daily', '500.4'));
  step('daily 750', () => c.setTarget('daily', 750));
  step('weekly lots', () => c.setTarget('weekly', 'lots'));
  step('weekly 3000', () => c.setTarget('weekly', ' 3000 '));
  step('daily 0', () => c.setTarget('daily', 0));
  step('weekly -5', () => c.setTarget('weekly', -5));
  step('weekly 2.6', () => c.setTarget('weekly', 2.6));
  step('deadline blank', () => c.addGoal('deadline', { title: ' ', dueDate: '2026-12-31' }));
  step('deadline bad date', () => c.addGoal('deadline', { title: 'Draft', dueDate: '31/12/2026' }));
  step('task blank', () => c.addGoal('task', { title: '' }));
  step('kind', () => c.addGoal('daily', { title: 'x' }));
  step('deadline', () => c.addGoal('deadline', { title: ' Draft ', dueDate: '2026-12-31', targetWords: '0', nodeId: part }));
  step('task', () => c.addGoal('task', { title: 'Map', category: 'sailing', nodeId: 'c1', dueDate: '' }));
  step('task 2', () => c.addGoal('task', { title: 'Edit', category: 'editing', dueDate: '2026-11-02' }));
  const ids = c.goals.map((g) => g.id);
  if (ids.length >= 3) {
    const d = ids[ids.length - 3];
    const t = ids[ids.length - 2];
    step('update deadline', () => c.updateGoal(d, { title: '', dueDate: '', targetWords: 2000, nodeId: '' }));
    step('update task', () => c.updateGoal(t, { title: 'Map the river', category: 'worldbuilding', dueDate: '2026-11-09' }));
    step('task kind kept', () => c.updateGoal(t, { category: 'bogus' }));
    step('done', () => c.setDone(t, true));
    step('undone', () => c.setDone(t, false));
    step('remove', () => c.removeGoal(d));
    step('remove again', () => c.removeGoal(d));
    step('done gone', () => c.setDone(d, true));
  }
  return out;
}

export function novel(s: NovelSnapshot): Record<string, unknown> {
  const own = page(
    s,
    s.rows('writingSessions').map((r) => new WritingSession(r)),
    s.rows('goals').map((r) => new Goal(r)),
  );
  const nodes = s.rows('chapters').map((r) => new StoryNode(r));
  const made = page(
    s,
    madeUpLog(s.projectId).map((r) => new WritingSession(r)),
    madeUpGoals(s.projectId, nodes).map((r) => new Goal(r)),
  );
  return { own, made, script: script(s) };
}

export function misc(): unknown {
  const counts = [0, 1, 24, 124, 125, 126, 249, 250, 251, 999, 1000, 1001, 4250, 7499, 7500, 17499, 17500, 39999, 40000, 80000, 99999, 100000, 120000, 250000];
  return {
    lengths: counts.map((w) => ({ words: w, at: [lengthOf(w).index, lengthOf(w).through], sentence: lengthSentence(w) })),
    compact: [0, 7, -7, 999, 1000, 1049, 1050, 1250, 9999, 10000, 15400, -1250, -25000].map(compactNumber),
    signed: [0, 5, -5, 1234, -1234567].map(signed),
    duration: [1, 59, 60, 61, 125, 600].map(duration),
    typed: ['', ' 500 ', '0', '-3', '+7', '12a', '0500'].map((t) => {
      const n = typedTarget(t);
      return n === null ? null : `${n}`;
    }),
    days: ['2026-10-25', '2026-01-01', '2024-02-29', '2026-03-29', '2026-11-01'].map((d) => [
      mediumDay(d),
      longDay(d),
      weekdayDay(d),
      shortDay(d),
      weekStart(d),
      monthOf(d),
      daysBetween('2026-10-25', d),
    ]),
    clock: [0, 1, 9, 11, 12, 13, 23].map((h) => clockTime(new Date(2026, 9, 25, h, 5).getTime())),
  };
}
