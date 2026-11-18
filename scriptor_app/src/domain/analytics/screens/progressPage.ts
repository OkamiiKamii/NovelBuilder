// WRITING PROGRESS, the page's pure parts: what it says and draws, worked out from the progress report and the
// writing journal. The manuscript's words against the author's targets, the writing log (kept automatically as they
// write), where the chapters and scenes stand, deadlines and tasks. It describes; nothing here judges. Cutting is shown
// as cutting, not as a shortfall, and days spent planning, revising or resting are part of writing a book.
//
// Ports of the logic of flutter_app/lib/features/progress/{progress_page,journal_view}.dart and
// widgets/{length_shelf,bars}.dart (the parts the Progress page uses).
//
// What the screen draws (sizes from the Flutter widgets):
// - The journal hero: three parts (stacked under 720 wide, else side by side 3 : 4 : 4 with dividers): the run (its
//   number at 52, bold, in the accent; "days in a row"; "Best: …" muted), the manuscript (a page 62 × 82 with a folded
//   corner of 14, ruled every 9 from 22 down, filling with the accent at 85% from the foot by `fill`; its words at 52
//   in the text colour and the caption), and what lies ahead (`ahead`).
// - The length shelf: six spines growing 46 + 13·i high (at most 46 wide, 3 apart, radius 4 at the top), the lengths
//   passed full of the accent, the current one filling from the foot (`through`) with a 2-wide accent border, those
//   ahead in outline; two bands at 16% and 24% of the height; a 3-high shelf under them; the names a word to a line
//   (9.5, bold for the current one, in the accent); then the sentence (17, italic).
// - A year of writing: 53 weeks of 7 days, cells `step − 3` square (radius 3), `step` = (width − 30) / 53 between 14
//   and 22 (scrolling sideways, ending at this week, when too narrow); the weekday names Mon, Wed, Fri at the left, the
//   month names above (18 high); a cell shaded by its level (0: the empty ground; 1–4: the ground toward the accent by
//   0.3, 0.55, 0.8, 1); today and the pointed day outlined (1.25; 2 when pointed); the legend "Less … More"; the line
//   under it says what the pointed (or today's) day was.
// - Milestones: seals 56 round in a 92-wide column, filled with the accent (and glowing) when reached, else an outline
//   (2 wide for the next one of its kind); an icon by kind (words: a quill, run: a flame, chapters: a bookmark); the
//   label (bold when reached) and what is still to go, in the accent.

import { type Journal, type Milestone, addDays, parseDay, weekStart } from '../../desk/dayBook';
import { grouped } from '../../desk/format';
import { type StoryNode, nodeStatuses } from '../../records/storyNode';
import { buildTree, flattenTree, type TreeItem } from '../../plot/board';
import { taskLabels } from '../goalChanges';
import {
  type DeadlineRow,
  type Goal,
  type PeriodTotals,
  type ProgressReport,
  type TargetRow,
  type WritingSession,
  clockTime,
  dayKeyOf,
  mediumDay,
  sessionMinutes,
  shortDay,
  weekdayDay,
} from '../progress';

// ---------------------------------------------------------------------------------------------------- numbers

/** "−1,200": a minus sign, not a hyphen, as the original writes a cut. */
export function signed(n: number): string {
  return `${n < 0 ? '−' : ''}${grouped(Math.abs(n))}`;
}

/** "1 session", "3 sessions", grouped. */
export function pluralOf(n: number, word: string): string {
  return `${grouped(n)} ${word}${n === 1 ? '' : 's'}`;
}

/** "40 min", "1 h 5 min". */
export function duration(minutes: number): string {
  return minutes < 60 ? `${minutes} min` : `${Math.trunc(minutes / 60)} h ${minutes % 60} min`;
}

/** "1.2K", "15K": a number short enough for an axis or a column's top, as the original writes it. */
export function compactNumber(n: number): string {
  const abs = Math.abs(n);
  if (abs < 1000) return `${n}`;
  const k = n / 1000;
  return `${k === Math.round(k) || abs >= 10000 ? Math.floor(k + 0.5) : k.toFixed(1)}K`;
}

const daysWords = (n: number) => `${grouped(n)} ${n === 1 ? 'day' : 'days'}`;

/** Whether a stored date is one the app can read (`yyyy-mm-dd`). */
export const isDay = (key: string) => /^\d{4}-\d{2}-\d{2}$/.test(key);

// ---------------------------------------------------------------------------------------------------- the head

export const progressWords = {
  title: 'Progress',
  noNovel: { title: 'No novel open', message: 'Progress works inside one novel. Open one from the Library.', action: 'Go to Library' },
  howLong: 'How long it is',
  year: 'A year of writing',
  milestones: 'Milestones',
  trend: 'Net words per week, last 8 weeks',
  trendPeriod: 'Week of',
  trendEmpty: 'Nothing logged in this period yet. It fills in as you write.',
  showTable: 'Show as table',
  standing: 'Where the manuscript stands',
  targets: 'Word targets',
  perDay: 'Words per day',
  perWeek: 'Words per week',
  noTarget: 'No target',
  deadlines: 'Deadlines',
  noDeadlines: 'No deadlines yet.',
  addDeadline: 'Add deadline',
  tasks: 'Tasks & milestones',
  addTask: 'Add task',
  sessions: 'Recent sessions',
  noSessions: 'Sessions are logged automatically while you write or revise. A break of half an hour starts a new one.',
  sessionColumns: ['Day', 'Started', 'Length', 'Words'],
  yearColumns: ['Day', 'Net words', 'Sessions'],
  less: 'Less',
  more: 'More',
} as const;

/** The line under the title: the words against the target, the share, the chapters complete, this week's words. */
export function healthLine(report: ProgressReport): string {
  return [
    report.targetWords !== null ? `${grouped(report.totalWords)} / ${grouped(report.targetWords)} words` : pluralOf(report.totalWords, 'word'),
    ...(report.percent !== null ? [`${report.percent}% complete`] : []),
    ...(report.chapters.total > 0 ? [`${report.chapters.completed} / ${report.chapters.total} chapters complete`] : []),
    `${grouped(report.week.net < 0 ? 0 : report.week.net)} words this week`,
  ].join(' • ');
}

// ---------------------------------------------------------------------------------------------------- the journal hero

export type JournalHero = {
  run: { number: string; label: string; best: string; semantics: string };
  manuscript: { number: string; caption: string; fill: number | null; semantics: string };
  ahead:
    | { kind: 'reached'; label: string }
    | { kind: 'finish'; label: string; day: string; note: string }
    | { kind: 'pace'; label: string; note: string }
    | { kind: 'none'; label: string };
};

export function journalHero(journal: Journal, report: ProgressReport): JournalHero {
  const target = report.targetWords;
  const percent = report.percent;
  const pace = journal.pacePerDay;
  const reached = target !== null && report.totalWords >= target;
  const perDay = (n: number) => `${grouped(n)} ${n === 1 ? 'word' : 'words'}`;
  return {
    run: {
      number: `${journal.currentRun}`,
      label: journal.currentRun === 1 ? 'day in a row' : 'days in a row',
      best: `Best: ${daysWords(journal.bestRun)}`,
      semantics: `${daysWords(journal.currentRun)} in a row. Best: ${daysWords(journal.bestRun)}.`,
    },
    manuscript: {
      number: grouped(report.totalWords),
      caption: target !== null ? `of ${grouped(target)} words · ${percent}%` : 'words so far',
      fill: target === null ? null : (percent ?? 0) / 100,
      semantics: `${grouped(report.totalWords)} words${target !== null ? ` of ${grouped(target)}, ${percent}%` : ''}`,
    },
    ahead: reached
      ? { kind: 'reached', label: 'Target reached' }
      : journal.finishDay !== null
        ? {
            kind: 'finish',
            label: 'Finished around',
            day: mediumDay(journal.finishDay),
            note: `At your pace of the last 30 days: about ${perDay(pace!)} a day`,
          }
        : pace !== null
          ? { kind: 'pace', label: `About ${perDay(pace)} a day`, note: 'over the last 30 days' }
          : { kind: 'none', label: 'No words logged in the last 30 days' },
  };
}

/** The page of the journal hero: its ruled lines' y, from 22 down every 9 while above the foot less 8. */
export function pageLines(height = 82): number[] {
  const out: number[] = [];
  for (let y = 22; y < height - 8 && out.length < 100; y += 9) out.push(y);
  return out;
}

// ---------------------------------------------------------------------------------------------------- the length shelf

/** The lengths fiction is commonly sorted by, by word count, each up to (not including) its end. The usual awards'
 * bounds (flash fiction to 1,000, short story to 7,500, novelette to 17,500, novella to 40,000); "long novel" from
 * 100,000. */
export const storyLengths: readonly { name: string; end: number }[] = [
  { name: 'Flash fiction', end: 1000 },
  { name: 'Short story', end: 7500 },
  { name: 'Novelette', end: 17500 },
  { name: 'Novella', end: 40000 },
  { name: 'Novel', end: 100000 },
  { name: 'Long novel', end: 2 ** 62 },
];

/** Words on a standard manuscript page (12-point, double-spaced), the usual reckoning. */
export const wordsPerManuscriptPage = 250;

/** Which of `storyLengths` `words` is, and how far through it (0–1; the last is never "through"). */
export function lengthOf(words: number): { index: number; through: number } {
  let start = 0;
  for (let i = 0; i < storyLengths.length; i++) {
    const l = storyLengths[i];
    if (words < l.end) {
      const last = i === storyLengths.length - 1;
      return { index: i, through: last ? 1 : Math.min(1, Math.max(0, (words - start) / (l.end - start))) };
    }
    start = l.end;
  }
  return { index: storyLengths.length - 1, through: 1 };
}

const article = (name: string) => (name === 'Flash fiction' ? 'flash fiction' : `a ${name.toLowerCase()}`);

/** What the shelf says: the length now, the pages, and the words to the next length. */
export function lengthSentence(words: number): string {
  const at = lengthOf(words);
  const now = storyLengths[at.index];
  const p = words / wordsPerManuscriptPage;
  const pages = Math.sign(p) * Math.round(Math.abs(p));
  const pagesText =
    words === 0
      ? 'No pages yet'
      : pages < 1
        ? 'Less than a manuscript page'
        : `About ${grouped(pages)} manuscript ${pages === 1 ? 'page' : 'pages'}`;
  const next = at.index + 1 < storyLengths.length ? storyLengths[at.index + 1] : null;
  const toGo = now.end - words;
  const nextText =
    next === null
      ? 'Long enough for any shelf.'
      : `${grouped(toGo)} more ${toGo === 1 ? 'word' : 'words'} and it is the length of a ${next.name.toLowerCase()}.`;
  return `${pagesText}, the length of ${article(now.name)}. ${nextText}`;
}

/** The six spines: how tall, how full, whether the current one. */
export function shelfSpines(words: number): { name: string; height: number; fill: number; current: boolean }[] {
  const at = lengthOf(words);
  return storyLengths.map((l, i) => ({
    name: l.name,
    height: 46 + i * 13,
    fill: i < at.index ? 1 : i === at.index ? at.through : 0,
    current: i === at.index,
  }));
}

// ---------------------------------------------------------------------------------------------------- a year of writing

export const yearWeeks = 53;
/** Room at the left for the weekday names, and at the top for the month names. */
export const yearLabels = 30;
export const yearMonths = 18;

/** The step between cells for a width: the year in it, between 14 and 22. */
export function yearStep(width: number): number {
  return Math.min(22, Math.max(14, (width - yearLabels) / yearWeeks));
}

/** The Monday the year's first column starts on. */
export function yearFirst(today: string): string {
  return addDays(weekStart(today), -(yearWeeks - 1) * 7);
}

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type YearCell = { day: string; col: number; row: number; x: number; y: number; level: number; today: boolean };

/** The year as the painter draws it: every day up to today, a cell each; the month names over the columns; the
 * weekday names at the left. */
export function yearGrid(
  journal: Journal,
  step: number,
): {
  width: number;
  height: number;
  cell: number;
  cells: YearCell[];
  months: { text: string; x: number }[];
  weekdays: { text: string; y: number }[];
} {
  const first = yearFirst(journal.today);
  const cell = step - 3;
  const cells: YearCell[] = [];
  const months: { text: string; x: number }[] = [];
  let lastMonth: number | null = null;
  for (let col = 0; col < yearWeeks; col++) {
    const monday = addDays(first, col * 7);
    const m = parseDay(monday);
    const month = m.getMonth() + 1;
    if (month !== lastMonth && col < yearWeeks - 1) {
      if (lastMonth !== null || m.getDate() <= 7) months.push({ text: monthNames[month - 1], x: yearLabels + col * step });
      lastMonth = month;
    }
    for (let row = 0; row < 7; row++) {
      const day = addDays(monday, row);
      if (day > journal.today) break;
      cells.push({
        day,
        col,
        row,
        x: yearLabels + col * step,
        y: yearMonths + row * step,
        level: journal.level(day),
        today: day === journal.today,
      });
    }
  }
  const weekdays = ([[0, 'Mon'], [2, 'Wed'], [4, 'Fri']] as const).map(([row, text]) => ({
    text,
    y: yearMonths + row * step + cell / 2 - 7,
  }));
  return { width: yearLabels + step * yearWeeks, height: yearMonths + step * 7, cell, cells, months, weekdays };
}

/** The day at a point of the grid, or null (outside it, or still to come). */
export function yearDayAt(journal: Journal, x: number, y: number, step: number): string | null {
  const col = Math.floor((x - yearLabels) / step);
  const row = Math.floor((y - yearMonths) / step);
  if (col < 0 || col >= yearWeeks || row < 0 || row > 6) return null;
  const day = addDays(yearFirst(journal.today), col * 7 + row);
  return day > journal.today ? null : day;
}

/** What a day of the year was: "Sat, Oct 24, 2026: +900 words in 1 session". */
export function describeDay(journal: Journal, day: string): string {
  const d = journal.days.get(day);
  const when = `${weekdayDay(day)}, ${parseDay(day).getFullYear()}`;
  if (d === undefined) return `${when}: nothing logged`;
  const net = d.net > 0 ? `+${grouped(d.net)} words` : `${signed(d.net)} words, revising`;
  return `${when}: ${net} in ${d.sessions === 1 ? '1 session' : `${d.sessions} sessions`}`;
}

/** The days written in the year shown, latest first (the table under it, and its count). */
export function yearWritten(journal: Journal): string[] {
  const first = yearFirst(journal.today);
  return [...journal.days.keys()].filter((d) => d >= first && d <= journal.today).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
}

export function yearLabel(journal: Journal): string {
  return `A year of writing: ${daysWords(yearWritten(journal).length)} written`;
}

/** The year as a table: each day written, its net words, its sessions. */
export function yearTable(journal: Journal): (string | number)[][] {
  return yearWritten(journal).map((d) => [`${weekdayDay(d)}, ${parseDay(d).getFullYear()}`, signed(journal.days.get(d)!.net), journal.days.get(d)!.sessions]);
}

// ---------------------------------------------------------------------------------------------------- milestones

export type Seal = { icon: 'words' | 'run' | 'chapters'; label: string; reached: boolean; toGo: string | null; next: boolean; semantics: string };

export function sealOf(m: Milestone): Seal {
  return {
    icon: m.kind,
    label: m.label,
    reached: m.reached,
    toGo: m.toGo,
    next: m.toGo !== null,
    semantics: `${m.label}, ${m.reached ? 'reached' : m.toGo !== null ? `not yet: ${m.toGo}` : 'not yet'}`,
  };
}

// ---------------------------------------------------------------------------------------------------- the periods

export type PeriodTile = {
  label: string;
  value: string;
  detail: string;
  meter: { percent: number; label: string; caption: string } | null;
};

/** Today, this week or this month as a tile: the net words, what they were made of, and its target's meter. */
export function periodTile(label: string, totals: PeriodTotals, target: TargetRow | null, empty: string): PeriodTile {
  return {
    label,
    value: totals.sessions === 0 ? '0' : `${totals.net > 0 ? '+' : ''}${signed(totals.net)}`,
    detail:
      totals.sessions === 0
        ? empty
        : totals.removed > 0
          ? `${grouped(totals.added)} written, ${grouped(totals.removed)} trimmed`
          : `words in ${pluralOf(totals.sessions, 'session')}`,
    meter:
      target === null
        ? null
        : {
            percent: target.percent,
            label: `${label} target`,
            caption: target.percent >= 100 ? 'Target reached' : `${target.percent}% of ${grouped(target.target)}`,
          },
  };
}

export function periodTiles(report: ProgressReport): PeriodTile[] {
  return [
    periodTile('Today', report.today, report.daily, 'Nothing logged yet today'),
    periodTile('This week', report.week, report.weekly, 'Nothing logged yet this week'),
    periodTile('This month', report.month, null, 'Nothing logged yet this month'),
  ];
}

/** Tiles in even columns, as many as fit (at least two on a phone). */
export function tileColumns(width: number): number {
  return Math.min(6, Math.max(2, Math.floor((width + 12) / 212)));
}

/** The line under the weekly chart. */
export function summaryLine(report: ProgressReport): string {
  return [
    `${report.chapters.completed} of ${report.chapters.total} chapters complete`,
    ...(report.scenes.total > 0 ? [`${report.scenes.completed} of ${report.scenes.total} scenes complete`] : []),
    `average chapter ${grouped(report.averageChapterWords)} words`,
    ...(report.sessionCount > 0
      ? [
          `${pluralOf(report.sessionCount, 'session')}, ${duration(report.totalMinutes)} in all, ` +
            `about ${grouped(report.averageWordsPerSession < 0 ? 0 : report.averageWordsPerSession)} words each`,
        ]
      : []),
    `${report.daysWrittenLast30} of the last 30 days written`,
  ].join(' · ');
}

/** The weekly chart: its columns, what each says, and whether there is anything to draw. */
export function trendView(points: ProgressReport['weeks'], periodLabel: string = progressWords.trendPeriod) {
  const words = (n: number) => `${signed(n)} ${Math.abs(n) === 1 ? 'word' : 'words'}`;
  return {
    empty: points.every((p) => p.net === 0),
    most: Math.max(1, ...points.map((p) => Math.abs(p.net))),
    bars: points.map((p) => ({
      key: p.key,
      short: p.label,
      value: p.net,
      current: p.current,
      label: `${periodLabel === '' ? '' : `${periodLabel} `}${p.label}${p.current ? ' (so far)' : ''}`,
      said: `${periodLabel === '' ? '' : `${periodLabel} `}${p.label}${p.current ? ' (so far)' : ''}: ${words(p.net)}`,
      top: compactNumber(p.net),
    })),
    columns: [periodLabel === '' ? 'Day' : periodLabel, 'Net words'],
    rows: points.map((p) => [p.label, p.net] as (string | number)[]),
  };
}

/** Where the manuscript stands: every status, its count, and its share of the chapters and scenes. */
export function statusRows(report: ProgressReport): { key: string; label: string; count: number; share: number; semantics: string }[] {
  const total = report.chapters.total + report.scenes.total;
  return nodeStatuses.map((s) => {
    const count = report.statusCounts.get(s.key) ?? 0;
    return { key: s.key, label: s.label, count, share: total === 0 ? 0 : count / total, semantics: `${s.label}: ${count}` };
  });
}

/** The manuscript's own target, as the word targets box says it (it is changed in the Library). */
export function manuscriptTargetLine(targetWordCount: number | null, deadline: string | null): string {
  return (
    'Manuscript target: ' +
    `${targetWordCount !== null ? `${grouped(targetWordCount)} words` : 'none'}` +
    `${deadline !== null && isDay(deadline) ? ` by ${mediumDay(deadline)}` : ''}. ` +
    'Change it in the Library, under the novel’s details.'
  );
}

/** A word target typed in: kept when the field is left. Blank, not a whole number, or not above zero: no target. */
export function typedTarget(text: string): number | null {
  const t = text.trim();
  const n = /^[+-]?\d+$/.test(t) ? parseInt(t, 10) : null;
  return n === null || n <= 0 ? null : n;
}

// ---------------------------------------------------------------------------------------------------- deadlines and tasks

/** "10 days to go", "Due today", "3 days past the date"; with a target, the words and the words a day that get there. */
export function deadlineText(d: DeadlineRow): string {
  const when =
    d.daysLeft > 0 ? `${pluralOf(d.daysLeft, 'day')} to go` : d.daysLeft === 0 ? 'Due today' : `${pluralOf(-d.daysLeft, 'day')} past the date`;
  if (d.target === null || d.target === 0) return when;
  const count = `${grouped(d.words)} / ${grouped(d.target)} words`;
  if (d.reached) return `${count} · reached`;
  return `${count} · ${when}${d.perDay !== null ? ` · about ${grouped(d.perDay)} a day gets there` : ''}`;
}

/** "Dec 31, 2026 · Crossing", "… · whole manuscript". */
export function deadlineWhen(d: DeadlineRow): string {
  return `${mediumDay(d.goal.dueDate!)}${d.scope !== null ? ` · ${d.scope}` : d.goal.nodeId !== null ? '' : ' · whole manuscript'}`;
}

/** The tasks, those still to do first, then in the order they were made. */
export function tasksInOrder(goals: readonly Goal[]): Goal[] {
  const createdAt = (g: Goal) => (typeof g.raw['createdAt'] === 'number' ? (g.raw['createdAt'] as number) : 0);
  return goals
    .filter((g) => g.kind === 'task')
    .map((g, i) => ({ g, i }))
    .sort((a, b) => (a.g.done ? 1 : 0) - (b.g.done ? 1 : 0) || createdAt(a.g) - createdAt(b.g) || a.i - b.i)
    .map(({ g }) => g);
}

/** "Worldbuilding · Oct 30, 2026 · done Oct 25". */
export function taskLine(task: Goal): string {
  const kind = taskLabels[String(task.raw['category'])] ?? 'Other';
  const due = task.dueDate !== null && isDay(task.dueDate) ? ` · ${mediumDay(task.dueDate)}` : '';
  const doneAt = task.raw['doneAt'];
  const done = task.done && typeof doneAt === 'number' ? ` · done ${shortDay(dayKeyOf(doneAt))}` : '';
  return `${kind}${due}${done}`;
}

export function tasksCount(report: ProgressReport): string | null {
  return report.tasks.total > 0 ? `${report.tasks.done} of ${report.tasks.total} done` : null;
}

export function deleteGoalDialog(goal: Goal): { title: string; message: string; cancel: string; confirm: string } {
  return {
    title: `Delete “${goal.title}”?`,
    message:
      goal.kind === 'task'
        ? 'The task is removed. Nothing else changes.'
        : 'The deadline is removed. Nothing else changes: the manuscript and the writing log are kept.',
    cancel: 'Cancel',
    confirm: 'Delete',
  };
}

// ---------------------------------------------------------------------------------------------------- the goal form

/** Parts of the manuscript a deadline can cover: everything but scenes, in reading order. */
export function deadlineScopes(nodes: readonly StoryNode[]): TreeItem[] {
  return flattenTree(buildTree(nodes)).filter((t) => t.node.kind !== 'scene');
}

export function scopeLabel(t: TreeItem): string {
  return `${'  '.repeat(t.depth)}${t.node.title.trim() === '' ? 'Untitled' : t.node.title}`;
}

export type GoalForm = { title: string; target: string; due: string | null; nodeId: string; category: string };

export function goalFormStart(goal: Goal | null): GoalForm {
  return {
    title: goal?.title ?? '',
    target: goal?.targetWords !== null && goal?.targetWords !== undefined ? `${goal.targetWords}` : '',
    due: goal?.dueDate ?? null,
    nodeId: goal?.nodeId ?? '',
    category: typeof goal?.raw['category'] === 'string' ? (goal.raw['category'] as string) : 'planning',
  };
}

/** The form's words, for a task or a deadline, new or changed. */
export function goalFormWords(kind: 'deadline' | 'task', editing: boolean, form: GoalForm) {
  const task = kind === 'task';
  const name = task ? 'task' : 'deadline';
  return {
    title: editing ? `Change the ${name}` : `Add a ${name}`,
    nameLabel: task ? 'Task name' : 'Deadline name',
    nameHint: task ? 'e.g. Complete magic system lore' : 'e.g. Finish Volume 1',
    typeLabel: 'Task type',
    targetLabel: 'Word target (optional)',
    coversLabel: 'Deadline covers',
    whole: 'Whole manuscript',
    date:
      form.due !== null && isDay(form.due) ? `${task ? 'Date' : 'Due'}: ${mediumDay(form.due)}` : task ? 'No date (optional)' : 'No date yet',
    pick: task ? 'Pick a date' : 'Pick the date',
    noDate: 'No date',
    cancel: 'Cancel',
    save: editing ? 'Save' : task ? 'Add task' : 'Add deadline',
  };
}

/** What the form gives the change: a task its name, kind and date; a deadline its name, date, target and part. */
export function goalInputOf(kind: 'deadline' | 'task', form: GoalForm) {
  return kind === 'task'
    ? { title: form.title, category: form.category, dueDate: form.due ?? '' }
    : { title: form.title, dueDate: form.due ?? '', targetWords: form.target, nodeId: form.nodeId };
}

// ---------------------------------------------------------------------------------------------------- recent sessions

/** The last 12 sessions, latest first: the day, when it started, how long, the words (or "revising"). */
export function recentSessions(sessions: readonly WritingSession[]): string[][] {
  return [...sessions]
    .map((s, i) => ({ s, i }))
    .sort((a, b) => b.s.startedAt - a.s.startedAt || a.i - b.i)
    .slice(0, 12)
    .map(({ s }) => [
      weekdayDay(s.day),
      clockTime(s.startedAt),
      duration(sessionMinutes(s)),
      `${s.netWords > 0 ? '+' : ''}${signed(s.netWords)}${s.netWords <= 0 ? ' · revising' : ''}`,
    ]);
}
