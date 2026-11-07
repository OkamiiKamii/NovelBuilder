import { buildTree, flatten, isDocument, subtreeIds } from '@/modules/manuscript/tree';
import { NODE_STATUSES, type NodeStatus, type StoryNode } from '@/modules/manuscript/types';
import { addDays, dayKey, daysBetween, monthOf, parseDay, weekStart } from './time';
import type { Goal, WritingSession } from './types';

/** From "Draft Complete" onward a chapter or scene counts as completed. */
export const COMPLETED: readonly NodeStatus[] = ['draft-complete', 'revising', 'final', 'published'];

export interface PeriodTotals {
  net: number;
  added: number;
  removed: number;
  sessions: number;
  minutes: number;
  /** Days in the period with any writing or editing. */
  activeDays: number;
}

export interface TrendPoint {
  key: string;
  label: string;
  net: number;
  current: boolean;
}

export interface TargetProgress {
  goal: Goal;
  words: number;
  target: number;
  percent: number;
}

export interface DeadlineProgress {
  goal: Goal;
  /** What the deadline covers: a node's title, or null for the whole manuscript. */
  scope: string | null;
  words: number;
  target: number | null;
  percent: number | null;
  daysLeft: number;
  /** Words per day that would reach the target on time; null when there is no target, no time left, or it is reached. */
  perDay: number | null;
  reached: boolean;
}

export interface ProgressReport {
  totalWords: number;
  targetWords: number | null;
  percent: number | null;
  today: PeriodTotals;
  week: PeriodTotals;
  month: PeriodTotals;
  chapters: { total: number; completed: number };
  scenes: { total: number; completed: number };
  averageChapterWords: number;
  statusCounts: Record<NodeStatus, number>;
  sessionCount: number;
  averageWordsPerSession: number;
  totalMinutes: number;
  /** Consecutive days with writing, ending today or yesterday. */
  currentRun: number;
  daysWrittenLast30: number;
  lastWritingDay: string | null;
  days: TrendPoint[];
  weeks: TrendPoint[];
  daily: TargetProgress | null;
  weekly: TargetProgress | null;
  deadlines: DeadlineProgress[];
  tasks: { total: number; done: number };
}

export const sessionMinutes = (session: WritingSession): number => Math.max(1, Math.round((session.lastActiveAt - session.startedAt) / 60_000));

function totals(sessions: WritingSession[]): PeriodTotals {
  return {
    net: sessions.reduce((n, s) => n + s.netWords, 0),
    added: sessions.reduce((n, s) => n + s.added, 0),
    removed: sessions.reduce((n, s) => n + s.removed, 0),
    sessions: sessions.length,
    minutes: sessions.reduce((n, s) => n + sessionMinutes(s), 0),
    activeDays: new Set(sessions.map((s) => s.day)).size,
  };
}

const short = (key: string) => parseDay(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const percentOf = (value: number, target: number) => Math.max(0, Math.min(100, Math.round((value / target) * 100)));

interface Input {
  targetWordCount: number | null;
  nodes: StoryNode[];
  sessions: WritingSession[];
  goals: Goal[];
  now?: number;
}

/**
 * Turns the manuscript, the session log and the goals into everything the
 * dashboard shows. It only describes; nothing here judges. A day without
 * writing is simply a day without an entry.
 */
export function computeProgress({ targetWordCount, nodes, sessions, goals, now = Date.now() }: Input): ProgressReport {
  const today = dayKey(now);
  const thisWeek = weekStart(today);
  const tree = flatten(buildTree(nodes));
  const totalWords = nodes.reduce((n, node) => n + node.wordCount, 0);
  const chapters = tree.filter((t) => t.node.kind === 'chapter');
  const scenes = nodes.filter((n) => n.kind === 'scene');
  const written = chapters.filter((t) => t.totalWords > 0);

  const statusCounts = Object.fromEntries(NODE_STATUSES.map((s) => [s, 0])) as Record<NodeStatus, number>;
  for (const node of nodes) if (isDocument(node.kind)) statusCounts[node.status]++;

  const byDay = new Map<string, number>();
  for (const session of sessions) byDay.set(session.day, (byDay.get(session.day) ?? 0) + session.netWords);

  let currentRun = 0;
  for (let day = byDay.has(today) ? today : addDays(today, -1); byDay.has(day); day = addDays(day, -1)) currentRun++;
  const lastWritingDay = [...byDay.keys()].sort().at(-1) ?? null;

  const days: TrendPoint[] = Array.from({ length: 14 }, (_, i) => {
    const key = addDays(today, i - 13);
    return { key, label: short(key), net: byDay.get(key) ?? 0, current: key === today };
  });
  const weeks: TrendPoint[] = Array.from({ length: 8 }, (_, i) => {
    const key = addDays(thisWeek, (i - 7) * 7);
    const net = sessions.filter((s) => weekStart(s.day) === key).reduce((n, s) => n + s.netWords, 0);
    return { key, label: short(key), net, current: key === thisWeek };
  });

  const todayTotals = totals(sessions.filter((s) => s.day === today));
  const weekTotals = totals(sessions.filter((s) => weekStart(s.day) === thisWeek));
  const target = (kind: 'daily' | 'weekly', words: number) => {
    const goal = goals.find((g) => g.kind === kind && g.targetWords);
    return goal ? { goal, words, target: goal.targetWords!, percent: percentOf(words, goal.targetWords!) } : null;
  };

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const deadlines = goals
    .filter((g) => g.kind === 'deadline' && g.dueDate)
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
    .map((goal): DeadlineProgress => {
      const scopeNode = goal.nodeId ? byId.get(goal.nodeId) : undefined;
      const words = scopeNode ? subtreeIds(nodes, scopeNode.id).reduce((n, id) => n + (byId.get(id)?.wordCount ?? 0), 0) : totalWords;
      const daysLeft = daysBetween(today, goal.dueDate!);
      const reached = goal.targetWords !== null && words >= goal.targetWords;
      return {
        goal,
        scope: scopeNode?.title ?? null,
        words,
        target: goal.targetWords,
        percent: goal.targetWords ? percentOf(words, goal.targetWords) : null,
        daysLeft,
        perDay: goal.targetWords && !reached && daysLeft > 0 ? Math.ceil((goal.targetWords - words) / daysLeft) : null,
        reached,
      };
    });

  const tasks = goals.filter((g) => g.kind === 'task');
  const all = totals(sessions);

  return {
    totalWords,
    targetWords: targetWordCount,
    percent: targetWordCount ? percentOf(totalWords, targetWordCount) : null,
    today: todayTotals,
    week: weekTotals,
    month: totals(sessions.filter((s) => monthOf(s.day) === monthOf(today))),
    chapters: { total: chapters.length, completed: chapters.filter((t) => COMPLETED.includes(t.node.status)).length },
    scenes: { total: scenes.length, completed: scenes.filter((n) => COMPLETED.includes(n.status)).length },
    averageChapterWords: written.length ? Math.round(written.reduce((n, t) => n + t.totalWords, 0) / written.length) : 0,
    statusCounts,
    sessionCount: sessions.length,
    averageWordsPerSession: sessions.length ? Math.round(all.net / sessions.length) : 0,
    totalMinutes: all.minutes,
    currentRun,
    daysWrittenLast30: [...byDay.keys()].filter((day) => daysBetween(day, today) >= 0 && daysBetween(day, today) < 30).length,
    lastWritingDay,
    days,
    weeks,
    daily: target('daily', todayTotals.net),
    weekly: target('weekly', weekTotals.net),
    deadlines,
    tasks: { total: tasks.length, done: tasks.filter((t) => t.done).length },
  };
}
