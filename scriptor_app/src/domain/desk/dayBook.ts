// THE DAY BOOK, at the head of the contents: five weeks of writing as ink on the page, a mark for every day written
// (fuller and darker the more words), today a ring that closes on the day's goal; the days written in a row; and one
// press back into the chapter being written. And THE WRITING JOURNAL: the writing log read as runs of days, a pace,
// shading and milestones. Both read the writing log (`writingSessions`) and nothing else; nothing here is stored.
// Pure TypeScript. Ports of flutter_app/lib/shared/domain/analytics/day_book.dart and journal.dart, the days of
// progress.dart, and the logic of flutter_app/lib/features/write/day_book.dart.

import { type JsonMap, numOrNull, str } from '../json';
import { type StoryNode, isDocument, readingOrder } from '../outline';
import { DartRandom, dartStringHash } from './dartRandom';
import { formatNumber, grouped, plural } from './format';

// ---------------------------------------------------------------------------------------------------- days

const pad = (n: number) => String(n).padStart(2, '0');

/** The author's local day of [d], written `yyyy-mm-dd`. */
export function dayOf(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The author's local day at [millis] since the epoch. */
export function dayKeyOf(millis: number): string {
  return dayOf(new Date(Math.trunc(millis)));
}

const wholeNumber = /^\s*[+-]?\d+\s*$/;

/** Local midnight of a date, a month or day past its end running on as Dart's `DateTime(y, m, d)` does (and years 0
 * to 99 kept as they are, which `new Date(y, m, d)` would read as 1900 to 1999). */
function localDate(year: number, month0: number, day: number): Date {
  const out = new Date(2000, 0, 1);
  out.setFullYear(year, month0, day);
  out.setHours(0, 0, 0, 0);
  return out;
}

/** The local midnight of a `yyyy-mm-dd` day. Throws on a key that is not three whole numbers, as Dart's `int.parse`
 * does. */
export function parseDay(key: string): Date {
  const p = key.split('-');
  if (p.length < 3 || !p.every((x) => wholeNumber.test(x))) throw new Error(`Not a day: ${key}`);
  const [y, m, d] = p.map((x) => parseInt(x, 10));
  return localDate(y, m - 1, d);
}

export function addDays(key: string, days: number): string {
  const d = parseDay(key);
  return dayOf(localDate(d.getFullYear(), d.getMonth(), d.getDate() + days));
}

/** The weekday of a day, Monday 1 to Sunday 7 (Dart's `DateTime.weekday`). */
export function weekdayOf(key: string): number {
  return ((parseDay(key).getDay() + 6) % 7) + 1;
}

/** The Monday on or before the given day. */
export function weekStart(key: string): string {
  return addDays(key, -(weekdayOf(key) - 1));
}

const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Oct 25", as the original's dashboard writes a day. */
export function shortDay(key: string): string {
  const d = parseDay(key);
  return `${shortMonths[d.getMonth()]} ${d.getDate()}`;
}

// ---------------------------------------------------------------------------------------------------- the log

/** One session of the writing log, as the day book and journal read it. */
export type WritingSession = { day: string; netWords: number; added: number };

/** A whole number, as Dart's `intOrNull` reads one (a double that is whole counts). */
function intOrNull(value: unknown): number | null {
  const n = numOrNull(value);
  return n !== null && Number.isInteger(n) ? n : null;
}

/** A `writingSessions` row read leniently: a missing or mistyped field is "" or 0. */
export function writingSessionOf(raw: JsonMap): WritingSession {
  return { day: str(raw['day']), netWords: intOrNull(raw['netWords']) ?? 0, added: intOrNull(raw['added']) ?? 0 };
}

// ---------------------------------------------------------------------------------------------------- the day book

/** One day in the day book: its key (`yyyy-mm-dd`), the net words written (never below 0), whether anything was
 * written at all (a day of cutting still counts), and whether it is today or still to come this week. */
export type BookDay = { key: string; words: number; written: boolean; today: boolean; ahead: boolean };

export type DayBook = {
  /** Whole weeks, Monday first, ending with this week's Sunday: rows of 7. */
  days: BookDay[];
  /** Days written in a row, up to today when today is written, else up to yesterday. */
  streak: number;
  keptToday: boolean;
  /** Net words written today (below 0 on a day of cutting). */
  today: number;
  /** The most net words in one of the days shown (at least 1, for scaling). */
  most: number;
  /** Net words written in the week that holds today (the days to come count 0). */
  thisWeek: number;
};

/** The day book at [nowMs] (local days): [weeks] whole weeks from Monday, ending this Sunday. A day is written when a
 * session that day added words or ended with more; its words are the day's net words, never below 0. */
export function dayBookOf(sessions: Iterable<WritingSession>, nowMs: number, weeks = 5): DayBook {
  const words = new Map<string, number>();
  const written = new Set<string>();
  for (const s of sessions) {
    words.set(s.day, (words.get(s.day) ?? 0) + s.netWords);
    if (s.netWords > 0 || s.added > 0) written.add(s.day);
  }
  const today = dayKeyOf(nowMs);
  const first = addDays(weekStart(today), -7 * (weeks - 1));
  const days: BookDay[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const key = addDays(first, i);
    days.push({
      key,
      words: Math.max(0, words.get(key) ?? 0),
      written: written.has(key),
      today: key === today,
      ahead: key > today,
    });
  }
  const kept = written.has(today);
  let streak = 0;
  for (let d = kept ? today : addDays(today, -1); written.has(d); d = addDays(d, -1)) streak++;
  return {
    days,
    streak,
    keptToday: kept,
    today: words.get(today) ?? 0,
    most: Math.max(1, days.reduce((m, d) => Math.max(m, d.words), 0)),
    thisWeek: days.slice(days.length - 7).reduce((n, d) => n + (d.ahead ? 0 : d.words), 0),
  };
}

/** The initials over the columns, Monday first. */
export const weekInitials: readonly string[] = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** A droplet beside a big day's mark: where it is (an angle in radians, and how far beyond the mark's edge, in
 * logical pixels), and its radius in logical pixels. */
export type Droplet = { angle: number; beyond: number; radius: number };

/** How one day is marked. The cell's radius `r` is half its shortest side, less 3.
 * - `ahead`: a day to come, a faint dot (radius 1.2);
 * - `unwritten`: a faint ring (radius `r * 0.32`, stroke 1.2);
 * - `blot`: an ink mark, `share` = √(words / most) from 0 to 1, of opacity `alpha` (0.4 + 0.6 × share) and radius
 *   `r * scale` (0.42 + 0.48 × share); past a share of 0.6, three droplets around it, the same for the same day
 *   every time.
 * And `ring`, for today only: a faint ring at `r + 1`, closed in ink this far (0 to 1, clockwise from the top) on the
 * day's goal; without a goal, whole once anything is written. Null on other days. */
export type DayMark = (
  | { kind: 'ahead' }
  | { kind: 'unwritten' }
  | { kind: 'blot'; share: number; alpha: number; scale: number; droplets: Droplet[] }
) & { ring: number | null };

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function dayMarkOf(day: BookDay, most: number, goal: number | null): DayMark {
  const ring = day.today
    ? goal === null || goal <= 0
      ? day.written
        ? 1
        : 0
      : clamp01(day.words / goal)
    : null;
  if (day.ahead) return { kind: 'ahead', ring: null };
  if (!day.written) return { kind: 'unwritten', ring };
  const share = clamp01(Math.sqrt(day.words / most));
  const droplets: Droplet[] = [];
  if (share > 0.6) {
    const rnd = new DartRandom(dartStringHash(day.key));
    for (let i = 0; i < 3; i++) {
      const angle = rnd.nextDouble() * Math.PI * 2;
      const beyond = 1.5 + rnd.nextDouble() * 2;
      const radius = 0.8 + rnd.nextDouble() * 0.9;
      droplets.push({ angle, beyond, radius });
    }
  }
  return { kind: 'blot', share, alpha: 0.4 + 0.6 * share, scale: 0.42 + 0.48 * share, droplets, ring };
}

/** What a screen reader hears for a day: "Nov 11, today: 7 words", "Nov 9: nothing written"; null for a day to come. */
export function dayLabel(day: BookDay): string | null {
  if (day.ahead) return null;
  return `${shortDay(day.key)}${day.today ? ', today' : ''}: ${day.written ? plural(day.words, 'word') : 'nothing written'}`;
}

/** The day book's headline: the days in a row. */
export function dayBookHeadline(book: Pick<DayBook, 'streak' | 'keptToday'>): string {
  const n = book.streak;
  if (n === 0) return 'Every day you write leaves a mark';
  if (book.keptToday) return n === 1 ? 'Written today' : `${n} days in a row`;
  return `${n} ${n === 1 ? 'day' : 'days in a row'} · write today to keep it`;
}

/** The line under it: "Today: 7 of 250 words · this week 1,320", or without a daily goal "Today: 7 words · …". */
export function dayBookCounts(book: Pick<DayBook, 'today' | 'thisWeek'>, goal: number | null): string {
  const today =
    goal !== null && goal > 0
      ? `Today: ${formatNumber(book.today)} of ${formatNumber(goal)} words`
      : `Today: ${plural(book.today, 'word')}`;
  return `${today} · this week ${formatNumber(book.thisWeek)}`;
}

/** Which of the day book's presses are offered: "Set a daily goal" without one; "Share today’s page" once today has
 * words or there is a run of days. */
export function dayBookOffers(book: Pick<DayBook, 'today' | 'streak'>, goal: number | null) {
  return { setGoal: goal === null || goal <= 0, share: book.today > 0 || book.streak > 0 };
}

/** Where the chapter last open in a novel is kept in this device's settings. */
export function lastNodeKey(novelId: string): string {
  return `write.lastNode.${novelId}`;
}

/** The chapter or scene to carry on in ("Carry on in “<title>”", the caret after its last word): the one last open
 * here ([remembered]), else the last with words in it, else the first. Null when there is none (no button). */
export function carryOnNode(nodes: readonly StoryNode[], remembered: unknown): StoryNode | null {
  const documents = readingOrder(nodes)
    .map((x) => x.node)
    .filter((n) => isDocument(n.kind));
  if (documents.length === 0) return null;
  const last = documents.find((n) => n.id === remembered);
  if (last) return last;
  for (let i = documents.length - 1; i >= 0; i--) if (documents[i].wordCount > 0) return documents[i];
  return documents[0];
}

// ---------------------------------------------------------------------------------------------------- the journal

/** One day of the writing log: its net words and how many sessions it took. */
export type JournalDay = { day: string; net: number; sessions: number };

/** A threshold the author has passed, or has yet to; `toGo` on the next of each kind only. */
export type Milestone = { label: string; kind: 'words' | 'run' | 'chapters'; reached: boolean; toGo: string | null };

export type Journal = {
  today: string;
  /** Every day with a session, by day, in the order first logged. */
  days: Map<string, JournalDay>;
  /** Days written in a row, up to today (or yesterday, while today is still open). */
  currentRun: number;
  bestRun: number;
  /** Net words a day over the last 30 days, when any were written. */
  pacePerDay: number | null;
  /** When the manuscript reaches its target at that pace; null without a target, a pace, or once reached. */
  finishDay: string | null;
  milestones: Milestone[];
  /** How strongly a day is shaded, 0 (nothing logged) to 4, against the author's own days: a day of revising is 1, a
   * day with words added 1 to 4 by where it falls among the days they added words. */
  level(day: string): number;
};

export const wordMilestones: readonly number[] = [1000, 10000, 25000, 50000, 100000];
export const runMilestones: readonly number[] = [7, 30, 100];

export function computeJournal({
  sessions,
  totalWords,
  targetWords,
  chapters,
  now,
}: {
  sessions: readonly WritingSession[];
  totalWords: number;
  targetWords: number | null;
  chapters: { total: number; completed: number };
  now: number;
}): Journal {
  const today = dayKeyOf(now);
  const days = new Map<string, JournalDay>();
  for (const s of sessions) {
    if (s.day === '') continue;
    const d = days.get(s.day);
    days.set(s.day, { day: s.day, net: (d?.net ?? 0) + s.netWords, sessions: (d?.sessions ?? 0) + 1 });
  }

  let currentRun = 0;
  for (let day = days.has(today) ? today : addDays(today, -1); days.has(day); day = addDays(day, -1)) currentRun++;
  let bestRun = 0;
  let run = 0;
  let previous: string | null = null;
  for (const day of [...days.keys()].sort()) {
    run = previous !== null && addDays(previous, 1) === day ? run + 1 : 1;
    if (run > bestRun) bestRun = run;
    previous = day;
  }

  const from = addDays(today, -29);
  let recent = 0;
  for (const d of days.values()) if (d.day >= from && d.day <= today) recent += d.net;
  const pace = recent > 0 ? Math.ceil(recent / 30) : null;
  let finishDay: string | null = null;
  if (pace !== null && targetWords !== null && targetWords > totalWords) {
    finishDay = addDays(today, Math.ceil((targetWords - totalWords) / pace));
  }

  const words = (n: number) => `${grouped(n)} ${n === 1 ? 'word' : 'words'}`;
  const milestones: Milestone[] = [];
  let nextWords = true;
  const wordMarks = [...new Set([...wordMilestones, ...(targetWords !== null ? [targetWords] : [])])].sort((a, b) => a - b);
  for (const m of wordMarks) {
    if (m <= 0) continue;
    const reached = totalWords >= m;
    milestones.push({
      label: m === targetWords ? `Your target: ${grouped(m)}` : words(m),
      kind: 'words',
      reached,
      toGo: !reached && nextWords ? `${words(m - totalWords)} to go` : null,
    });
    if (!reached) nextWords = false;
  }
  let nextRun = true;
  for (const m of runMilestones) {
    const reached = bestRun >= m;
    milestones.push({
      label: `${m} days in a row`,
      kind: 'run',
      reached,
      toGo: !reached && nextRun ? `${m - currentRun} more ${m - currentRun === 1 ? 'day' : 'days'}` : null,
    });
    if (!reached) nextRun = false;
  }
  if (chapters.total > 0) {
    milestones.push({ label: 'First chapter complete', kind: 'chapters', reached: chapters.completed >= 1, toGo: null });
    if (chapters.total > 1) {
      const left = chapters.total - chapters.completed;
      milestones.push({
        label: 'Every chapter complete',
        kind: 'chapters',
        reached: left === 0,
        toGo: left > 0 && chapters.completed > 0 ? `${left} to go` : null,
      });
    }
  }

  const positive = [...days.values()]
    .filter((d) => d.net > 0)
    .map((d) => d.net)
    .sort((a, b) => a - b);
  const level = (day: string): number => {
    const d = days.get(day);
    if (!d) return 0;
    if (d.net <= 0) return 1;
    const rank = positive.findIndex((n) => n >= d.net);
    const share = (rank < 0 ? positive.length : rank + 1) / positive.length;
    return share <= 0.25 ? 1 : share <= 0.5 ? 2 : share <= 0.75 ? 3 : 4;
  };

  return { today, days, currentRun, bestRun, pacePerDay: pace, finishDay, milestones, level };
}
