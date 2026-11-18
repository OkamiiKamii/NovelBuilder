// WRITING PROGRESS (as in the original app): the manuscript, the session log and the goals, described. It only
// describes; nothing here judges. A day without writing is simply a day without an entry. A port of
// flutter_app/lib/shared/domain/analytics/progress.dart. The local days themselves (dayOf, addDays, weekStart…) were
// ported with the day book (../desk/dayBook.ts) and are re-exported from here.

import { addDays, dayKeyOf, dayOf, parseDay, shortDay, weekStart } from '../desk/dayBook';
import { grouped } from '../desk/format';
import { type JsonMap, idOrNull, numOrNull, str, strOrNull } from '../json';
import { subtreeIds } from '../model/storyOrder';
import { buildTree, flattenTree } from '../plot/board';
import { intOrNull, JsonRecord } from '../records/jsonRecord';
import { type NodeStatus, type StoryNode, isDocument, nodeStatuses } from '../records/storyNode';

export { addDays, dayKeyOf, dayOf, grouped, parseDay, shortDay, weekStart };

// ---------------------------------------------------------------------------------------------------- days

const pad = (n: number) => String(n).padStart(2, '0');

export function monthOf(key: string): string {
  return key.substring(0, 7);
}

/** Whole days from one day to another (negative when `to` is earlier), counted on the calendar. */
export function daysBetween(from: string, to: string): number {
  const a = parseDay(from);
  const b = parseDay(to);
  const hours = (Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 3600000;
  // Dart: Duration.inHours (truncated) / 24, rounded half away from zero.
  const d = Math.trunc(hours) / 24;
  return Math.sign(d) * Math.round(Math.abs(d));
}

const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const longMonths = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "October 25, 2026". */
export function longDay(key: string): string {
  const d = parseDay(key);
  return `${longMonths[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** "Oct 25, 2026", as the original's pages write a date. */
export function mediumDay(key: string): string {
  const d = parseDay(key);
  return `${shortMonths[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** "Sat, Oct 24". */
export function weekdayDay(key: string): string {
  return `${weekdays[(parseDay(key).getDay() + 6) % 7]}, ${shortDay(key)}`;
}

/** "9:05 AM", the time of a moment in the author's day. */
export function clockTime(millis: number): string {
  const t = new Date(Math.trunc(millis));
  const h = t.getHours() % 12 === 0 ? 12 : t.getHours() % 12;
  return `${h}:${pad(t.getMinutes())} ${t.getHours() < 12 ? 'AM' : 'PM'}`;
}

// ---------------------------------------------------------------------------------------------------- records

export class WritingSession extends JsonRecord {
  get id(): string {
    return str(this.raw['id']);
  }
  get day(): string {
    return str(this.raw['day']);
  }
  get startedAt(): number {
    return numOrNull(this.raw['startedAt']) ?? 0;
  }
  get lastActiveAt(): number {
    return numOrNull(this.raw['lastActiveAt']) ?? 0;
  }
  get netWords(): number {
    return intOrNull(this.raw['netWords']) ?? 0;
  }
  get added(): number {
    return intOrNull(this.raw['added']) ?? 0;
  }
  get removed(): number {
    return intOrNull(this.raw['removed']) ?? 0;
  }
}

export class Goal extends JsonRecord {
  get id(): string {
    return str(this.raw['id']);
  }
  /** `daily`, `weekly`, `deadline` or `task`. */
  get kind(): string {
    return str(this.raw['kind']);
  }
  get title(): string {
    return str(this.raw['title']);
  }
  get targetWords(): number | null {
    return intOrNull(this.raw['targetWords']);
  }
  get dueDate(): string | null {
    return strOrNull(this.raw['dueDate']);
  }
  get nodeId(): string | null {
    return idOrNull(this.raw['nodeId']);
  }
  get done(): boolean {
    return this.raw['done'] === true;
  }
}

/** From "Draft Complete" onward a chapter or scene counts as completed. */
export const completedStatuses: readonly NodeStatus[] = ['draft-complete', 'revising', 'final', 'published'];

export class PeriodTotals {
  constructor(
    readonly net: number,
    readonly added: number,
    readonly removed: number,
    readonly sessions: number,
    readonly minutes: number,
    /** Days in the period with any writing or editing. */
    readonly activeDays: number,
  ) {}

  toJson(): JsonMap {
    return {
      net: this.net,
      added: this.added,
      removed: this.removed,
      sessions: this.sessions,
      minutes: this.minutes,
      activeDays: this.activeDays,
    };
  }
}

export type TrendPoint = { key: string; label: string; net: number; current: boolean };

/** Dart's `(n + 0.5).floor()`: JavaScript's round, as the original rounds. */
const jsRound = (n: number) => Math.floor(n + 0.5);

export function sessionMinutes(s: WritingSession): number {
  const m = jsRound((s.lastActiveAt - s.startedAt) / 60000);
  return m < 1 ? 1 : m;
}

function totalsOf(list: Iterable<WritingSession>): PeriodTotals {
  const sessions = [...list];
  return new PeriodTotals(
    sessions.reduce((n, s) => n + s.netWords, 0),
    sessions.reduce((n, s) => n + s.added, 0),
    sessions.reduce((n, s) => n + s.removed, 0),
    sessions.length,
    sessions.reduce((n, s) => n + sessionMinutes(s), 0),
    new Set(sessions.map((s) => s.day)).size,
  );
}

const percentOf = (value: number, target: number) => Math.min(100, Math.max(0, jsRound((value / target) * 100)));

export type TargetRow = { goal: Goal; words: number; target: number; percent: number };

export type DeadlineRow = {
  goal: Goal;
  scope: string | null;
  words: number;
  target: number | null;
  percent: number | null;
  daysLeft: number;
  perDay: number | null;
  reached: boolean;
};

export type ProgressReport = {
  totalWords: number;
  targetWords: number | null;
  percent: number | null;
  today: PeriodTotals;
  week: PeriodTotals;
  month: PeriodTotals;
  chapters: { total: number; completed: number };
  scenes: { total: number; completed: number };
  averageChapterWords: number;
  /** Every status, in the pipeline's order, with how many chapters and scenes stand at it. */
  statusCounts: Map<NodeStatus, number>;
  sessionCount: number;
  averageWordsPerSession: number;
  totalMinutes: number;
  /** Consecutive days with writing, ending today or yesterday. */
  currentRun: number;
  daysWrittenLast30: number;
  lastWritingDay: string | null;
  days: TrendPoint[];
  weeks: TrendPoint[];
  daily: TargetRow | null;
  weekly: TargetRow | null;
  deadlines: DeadlineRow[];
  tasks: { total: number; done: number };
};

/** Every log entry is a run of days at most this long (a counted walk back, never an endless one). */
const longestRun = 1000000;

export function computeProgress({
  targetWordCount,
  nodes,
  sessions,
  goals,
  now,
}: {
  targetWordCount: number | null;
  nodes: readonly StoryNode[];
  sessions: readonly WritingSession[];
  goals: readonly Goal[];
  now: number;
}): ProgressReport {
  const today = dayKeyOf(now);
  const thisWeek = weekStart(today);
  const tree = flattenTree(buildTree(nodes));
  const totalWords = nodes.reduce((n, node) => n + node.wordCount, 0);
  const chapters = tree.filter((t) => t.node.kind === 'chapter');
  const scenes = nodes.filter((n) => n.kind === 'scene');
  const written = chapters.filter((t) => t.totalWords > 0);
  const statusCounts = new Map<NodeStatus, number>(nodeStatuses.map((s) => [s.key, 0]));
  for (const node of nodes) if (isDocument(node.kind)) statusCounts.set(node.status, statusCounts.get(node.status)! + 1);
  const byDay = new Map<string, number>();
  for (const s of sessions) byDay.set(s.day, (byDay.get(s.day) ?? 0) + s.netWords);
  let currentRun = 0;
  for (let day = byDay.has(today) ? today : addDays(today, -1), i = 0; i < longestRun && byDay.has(day); day = addDays(day, -1), i++) {
    currentRun++;
  }
  const writingDays = [...byDay.keys()].sort();
  const days: TrendPoint[] = [];
  for (let i = 0; i < 14; i++) {
    const key = addDays(today, i - 13);
    days.push({ key, label: shortDay(key), net: byDay.get(key) ?? 0, current: key === today });
  }
  // Each day's week, worked out once: a calendar date is slow to make, and the log has a session or more a day.
  const weeksOf = new Map<string, string>();
  const weekOf = (s: WritingSession) => {
    let w = weeksOf.get(s.day);
    if (w === undefined) weeksOf.set(s.day, (w = weekStart(s.day)));
    return w;
  };
  const weeks: TrendPoint[] = [];
  for (let i = 0; i < 8; i++) {
    const key = addDays(thisWeek, (i - 7) * 7);
    const net = sessions.filter((s) => weekOf(s) === key).reduce((n, s) => n + s.netWords, 0);
    weeks.push({ key, label: shortDay(key), net, current: key === thisWeek });
  }
  const todayTotals = totalsOf(sessions.filter((s) => s.day === today));
  const weekTotals = totalsOf(sessions.filter((s) => weekOf(s) === thisWeek));
  const target = (kind: string, words: number): TargetRow | null => {
    const goal = goals.find((g) => g.kind === kind && (g.targetWords ?? 0) !== 0) ?? null;
    return goal === null ? null : { goal, words, target: goal.targetWords!, percent: percentOf(words, goal.targetWords!) };
  };

  const byId = new Map(nodes.map((n) => [n.id, n]));
  // Dart's List.sort on the due dates (an unstable sort in Dart; ties are rare and this keeps them in stored order).
  const dated = goals.filter((g) => g.kind === 'deadline' && (g.dueDate ?? '') !== '');
  const sortedDeadlines = [...dated].sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : a.dueDate! > b.dueDate! ? 1 : 0));
  const deadlines = sortedDeadlines.map((goal): DeadlineRow => {
    const scopeNode = goal.nodeId === null ? null : (byId.get(goal.nodeId) ?? null);
    const words =
      scopeNode !== null ? subtreeIds(nodes, scopeNode.id).reduce((n, id) => n + (byId.get(id)?.wordCount ?? 0), 0) : totalWords;
    const daysLeft = daysBetween(today, goal.dueDate!);
    const t = goal.targetWords;
    const reached = t !== null && words >= t;
    return {
      goal,
      scope: scopeNode?.title ?? null,
      words,
      target: t,
      percent: t !== null && t !== 0 ? percentOf(words, t) : null,
      daysLeft,
      perDay: t !== null && t !== 0 && !reached && daysLeft > 0 ? Math.ceil((t - words) / daysLeft) : null,
      reached,
    };
  });
  const tasks = goals.filter((g) => g.kind === 'task');
  const all = totalsOf(sessions);
  const isCompleted = (s: NodeStatus) => completedStatuses.includes(s);
  return {
    totalWords,
    targetWords: targetWordCount,
    percent: targetWordCount !== null && targetWordCount !== 0 ? percentOf(totalWords, targetWordCount) : null,
    today: todayTotals,
    week: weekTotals,
    month: totalsOf(sessions.filter((s) => monthOf(s.day) === monthOf(today))),
    chapters: { total: chapters.length, completed: chapters.filter((t) => isCompleted(t.node.status)).length },
    scenes: { total: scenes.length, completed: scenes.filter((n) => isCompleted(n.status)).length },
    averageChapterWords: written.length === 0 ? 0 : jsRound(written.reduce((n, t) => n + t.totalWords, 0) / written.length),
    statusCounts,
    sessionCount: sessions.length,
    averageWordsPerSession: sessions.length === 0 ? 0 : jsRound(all.net / sessions.length),
    totalMinutes: all.minutes,
    currentRun,
    daysWrittenLast30: [...byDay.keys()].filter((d) => daysBetween(d, today) >= 0 && daysBetween(d, today) < 30).length,
    lastWritingDay: writingDays.length === 0 ? null : writingDays[writingDays.length - 1],
    days,
    weeks,
    daily: target('daily', todayTotals.net),
    weekly: target('weekly', weekTotals.net),
    deadlines,
    tasks: { total: tasks.length, done: tasks.filter((t) => t.done).length },
  };
}

/** The `dayOf` of the day book, for a Date (re-exported for the screens). */
export const dayOfDate = dayOf;
