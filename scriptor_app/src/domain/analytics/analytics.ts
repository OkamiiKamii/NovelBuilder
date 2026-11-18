// PROJECT ANALYTICS (as in the original app). A port of flutter_app/lib/shared/domain/analytics/analytics.dart.
//
// OBJECTIVE DIAGNOSTICS RULE: counts things. Every number here is read straight off the project: the manuscript's
// tree and saved text, the writing log, World, recorded relationships, snapshots and plot threads. Nothing is scored,
// graded or compared with how a book "should" go, and every sentence it produces says what is, never what it means.
// Whether a number is as intended is for the author.

import { namedIn } from '../characters/namedIn';
import { localeCompare } from '../collation';
import { paragraphsOf } from '../continuity/text';
import { type StoryModel } from '../model/storyModel';
import { isDocument } from '../outline';
import { buildTree, flattenTree } from '../plot/board';
import { diagnose, type ThreadReport } from '../plot/diagnostics';
import { categoryName } from '../plot/plotChanges';
import { threadStatusName } from '../plot/screens/threads';
import { type ProgressSnapshot } from '../progression/snapshots';
import { stableSorted } from '../reader/stableSort';
import {
  addDays,
  computeProgress,
  dayKeyOf,
  type Goal,
  grouped,
  longDay,
  type PeriodTotals,
  type ProgressReport,
  sessionMinutes,
  shortDay,
  type TrendPoint,
  type WritingSession,
} from './progress';

export type Place = { nodeId: string; title: string; number: number };
export type PlaceWords = { nodeId: string; title: string; number: number; words: number };

export type CharacterRow = {
  id: string;
  name: string;
  /** Numbers of the chapters they appear in, in order. */
  chapters: number[];
  /** The same as ranges: "1–3, 7, 12". */
  distribution: string;
  first: Place | null;
  latest: Place | null;
  relationships: number;
  milestones: number;
  line: string;
};

export type ThreadRow = {
  id: string;
  title: string;
  category: string;
  status: string;
  statusLabel: string;
  beats: number;
  chapters: number[];
  /** Share of the manuscript's chapters it has a development in, 0 to 1. */
  density: number;
  /** Written chapters since its latest development. Null when that cannot be measured. */
  quietFor: number | null;
  line: string;
};

export const pipeline: readonly { key: string; label: string; statuses: readonly string[] }[] = [
  { key: 'planned', label: 'Planned', statuses: ['idea', 'planned'] },
  { key: 'drafting', label: 'Drafting', statuses: ['drafting'] },
  { key: 'revision', label: 'In Revision', statuses: ['draft-complete', 'revising'] },
  { key: 'completed', label: 'Completed', statuses: ['final', 'published'] },
];

export const threadGroups: readonly { key: string; label: string; statuses: readonly string[] }[] = [
  { key: 'active', label: 'Active', statuses: ['active'] },
  { key: 'resolved', label: 'Resolved', statuses: ['resolved'] },
  { key: 'paused', label: 'Dormant / Paused', statuses: ['paused'] },
  { key: 'abandoned', label: 'Abandoned', statuses: ['abandoned', 'retconned'] },
  { key: 'planned', label: 'Planned', statuses: ['planned'] },
];

export type Count = { key: string; label: string; count: number };

export type Analytics = {
  output: {
    totalWords: number;
    targetWords: number | null;
    percent: number | null;
    today: PeriodTotals;
    week: PeriodTotals;
    month: PeriodTotals;
    averagePerWritingDay: number;
    averagePerDayLast30: number;
    days: TrendPoint[];
    weeks: TrendPoint[];
  };
  sessions: {
    count: number;
    averageWords: number;
    averageMinutes: number;
    totalMinutes: number;
    longestByWords: { words: number; day: string } | null;
    longestByTime: { minutes: number; day: string } | null;
    currentStreak: number;
    longestStreak: number;
    writingDays: number;
    lastWritingDay: string | null;
  };
  structure: {
    chapters: number;
    scenes: number;
    averageChapter: number;
    averageScene: number;
    longest: PlaceWords | null;
    shortest: PlaceWords | null;
    lengths: PlaceWords[];
    pipeline: Count[];
  };
  cast: { total: number; appearing: number; rows: CharacterRow[] };
  threads: { total: number; groups: Count[]; openMysteries: number; characterArcs: number; rows: ThreadRow[] };
  /** Plain statements of fact drawn from the numbers above. */
  observations: string[];
  /** The writing progress these build on: goals, deadlines and tasks included. */
  progress: ProgressReport;
};

/** "3 chapters", "1,200 words" (grouped by thousands). */
const plural = (n: number, one: string, many?: string): string => `${grouped(n)} ${n === 1 ? one : (many ?? `${one}s`)}`;

/** "1–3, 7, 12" for a sorted list of chapter numbers. */
export function ranges(numbers: readonly number[]): string {
  const out: string[] = [];
  for (let i = 0; i < numbers.length; i++) {
    let end = i;
    for (; end + 1 < numbers.length && numbers[end + 1] === numbers[end] + 1; end++);
    out.push(end > i ? `${numbers[i]}–${numbers[end]}` : `${numbers[i]}`);
    i = end;
  }
  return out.join(', ');
}

const jsRound = (n: number): number => Math.floor(n + 0.5);
const byNumber = (a: number, b: number): number => a - b;
/** Dart's String.compareTo: by code units. */
const byCodeUnits = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function computeAnalytics(
  model: StoryModel,
  args: {
    targetWordCount: number | null;
    /** Each chapter's or scene's saved document, by id. */
    docs: ReadonlyMap<string, unknown>;
    snapshots: readonly ProgressSnapshot[];
    sessions: readonly WritingSession[];
    goals: readonly Goal[];
    now: number;
    /** The names each character goes by (their name, aliases, the parts of it that are theirs alone), by character: a
     * chapter that names them by any of these counts. Without it, only their name as entered does. */
    names?: Readonly<Record<string, readonly string[]>> | null;
  },
): Analytics {
  const { targetWordCount, docs, snapshots, sessions, goals, now } = args;
  const names = args.names ?? null;
  const nodes = [...model.nodes.values()];
  const today = dayKeyOf(now);
  const base = computeProgress({ targetWordCount, nodes, sessions, goals, now });
  const order = model.order;
  const tree = flattenTree(buildTree(nodes));
  const chapters = tree.filter((t) => t.node.kind === 'chapter');
  const scenes = nodes.filter((n) => n.kind === 'scene');
  const documents = nodes.filter((n) => isDocument(n.kind));
  const chapterAt = new Map(order.chapters.map((n, i) => [i + 1, n]));
  const place = (number: number): Place => ({ nodeId: chapterAt.get(number)!.id, title: chapterAt.get(number)!.title, number });
  const numberOf = (nodeId: string): number | null => {
    const n = order.chapterNumber.get(nodeId);
    return n !== undefined && n >= 1 && n <= order.chapters.length ? n : null;
  };

  // ---- Output and sessions
  const byDay = new Map<string, number>();
  for (const s of sessions) byDay.set(s.day, (byDay.get(s.day) ?? 0) + s.netWords);
  const writingDays = [...byDay.keys()].sort(byCodeUnits);
  let longestStreak = 0;
  let run = 0;
  writingDays.forEach((day, i) => {
    run = i > 0 && addDays(writingDays[i - 1], 1) === day ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
  });
  const net = sessions.reduce((n, s) => n + s.netWords, 0);
  const days: TrendPoint[] = [];
  for (let i = 0; i < 30; i++) {
    const key = addDays(today, i - 29);
    days.push({ key, label: shortDay(key), net: byDay.get(key) ?? 0, current: key === today });
  }
  const byWords = stableSorted(sessions, (a, b) => b.netWords - a.netWords)[0] ?? null;
  const byTime = stableSorted(sessions, (a, b) => sessionMinutes(b) - sessionMinutes(a))[0] ?? null;

  // ---- Structure
  const lengths: PlaceWords[] = chapters.map((t) => {
    const p = place(numberOf(t.node.id)!);
    return { nodeId: p.nodeId, title: p.title, number: p.number, words: t.totalWords };
  });
  const written = lengths.filter((c) => c.words > 0);
  const sceneWords = scenes.filter((s) => s.wordCount > 0);
  const pipelineCounts: Count[] = pipeline.map((g) => ({
    key: g.key,
    label: g.label,
    count: chapters.filter((t) => g.statuses.includes(t.node.status)).length,
  }));
  const pick = (better: (a: number, b: number) => boolean): PlaceWords | null =>
    written.length === 0 ? null : written.reduce((a, b) => (better(b.words, a.words) ? b : a));

  // ---- Cast: a character appears in a chapter when they are linked there, listed in its plan, or named in its text.
  const text = new Map(
    documents.map((d) => [
      d.id,
      paragraphsOf(docs.get(d.id))
        .map((p) => p.text)
        .join('\n'),
    ]),
  );
  const characters = [...model.entries.values()].filter((e) => e.category === 'character');
  const parts: { number: number; mentions: Set<string>; involved: Set<string> }[] = [];
  for (const doc of documents) {
    const number = numberOf(doc.id);
    if (number === null) continue;
    parts.push({ number, mentions: new Set(doc.mentions), involved: new Set(model.plans.get(doc.id)?.entityIds ?? []) });
  }
  // Where each character is named: every page read once for the whole cast, by every name each goes by (as given, or
  // their name as entered), whole words as written.
  const pages = new Map<string, string>();
  for (const doc of documents) if (numberOf(doc.id) !== null) pages.set(doc.id, text.get(doc.id) ?? '');
  const lookFor: Record<string, string[]> = {};
  for (const c of characters) {
    const given = names?.[c.id] ?? [c.name];
    lookFor[c.id] = given.filter((n) => n.trim().length > 0).map((n) => n.trim());
  }
  const named = namedIn(pages, lookFor);
  const count = (ids: Iterable<string>): Map<string, number> => {
    const m = new Map<string, number>();
    for (const id of ids) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  };
  const relationCount = count([...model.relations.values()].flatMap((r) => (r.fromId === r.toId ? [r.fromId] : [r.fromId, r.toId])));
  const snapshotCount = count(snapshots.map((s) => s.entryId));
  const rows: CharacterRow[] = characters.map((entry) => {
    const numbers = new Set<number>();
    for (const part of parts) if (part.mentions.has(entry.id) || part.involved.has(entry.id)) numbers.add(part.number);
    for (const nodeId of named.get(entry.id) ?? []) {
      const n = numberOf(nodeId);
      if (n !== null) numbers.add(n);
    }
    const list = [...numbers].sort(byNumber);
    const relationships = relationCount.get(entry.id) ?? 0;
    const milestones = snapshotCount.get(entry.id) ?? 0;
    const first = list.length === 0 ? null : place(list[0]);
    const latest = list.length === 0 ? null : place(list[list.length - 1]);
    const line =
      list.length > 0
        ? `${entry.name}: appears in ${plural(list.length, 'chapter')}, first: Ch. ${first!.number}, latest: Ch. ` +
          `${latest!.number}, relationships: ${relationships}, progression snapshots: ${milestones}`
        : `${entry.name}: no appearances recorded, relationships: ${relationships}, progression snapshots: ${milestones}`;
    return { id: entry.id, name: entry.name, chapters: list, distribution: ranges(list), first, latest, relationships, milestones, line };
  });
  const sortedRows = stableSorted(rows, (a, b) => {
    const c = b.chapters.length - a.chapters.length;
    return c !== 0 ? c : localeCompare(a.name, b.name);
  });

  // ---- Plot threads
  const threads = [...model.threads.values()];
  const reports = new Map<string, ThreadReport>(diagnose(threads, nodes).reports.map((r) => [r.thread.id, r]));
  const threadRows = stableSorted(
    threads.map((thread): ThreadRow => {
      const placed = new Set<number>();
      for (const b of thread.beats) {
        if (b.nodeId === null) continue;
        const n = numberOf(b.nodeId);
        if (n !== null) placed.add(n);
      }
      const numbers = [...placed].sort(byNumber);
      const density = chapters.length === 0 ? 0 : numbers.length / chapters.length;
      const quietFor = reports.get(thread.id)?.quietFor ?? null;
      return {
        id: thread.id,
        title: thread.title,
        category: categoryName(thread),
        status: thread.statusKey,
        statusLabel: threadStatusName(thread) ?? '',
        beats: thread.beats.length,
        chapters: numbers,
        density,
        quietFor,
        line:
          `${thread.title}: ${plural(thread.beats.length, 'development')} in ${numbers.length} of ` +
          `${plural(chapters.length, 'chapter')} (${jsRound(density * 100)}%)` +
          `${numbers.length > 0 ? `, chapters ${ranges(numbers)}` : ''}`,
      };
    }),
    (a, b) => {
      const c = b.chapters.length - a.chapters.length;
      return c !== 0 ? c : localeCompare(a.title, b.title);
    },
  );
  const open = ['planned', 'active', 'paused'];

  // ---- Statements of fact
  const observations: string[] = [];
  const empty = lengths.filter((c) => c.words === 0).length;
  if (chapters.length > 0 && empty > 0) {
    observations.push(`${plural(empty, 'chapter')} of ${chapters.length} ${empty === 1 ? 'has' : 'have'} no text yet.`);
  }
  if (written.length > 1) {
    const longest = pick((a, b) => a > b)!;
    const shortest = pick((a, b) => a < b)!;
    if (longest.words !== shortest.words) {
      observations.push(
        `The longest chapter with text (“${longest.title}”, ${plural(longest.words, 'word')}) is ` +
          `${(longest.words / shortest.words).toFixed(1)} times the length of the shortest (“${shortest.title}”, ` +
          `${plural(shortest.words, 'word')}).`,
      );
    }
  }
  const absent = sortedRows.filter((r) => r.chapters.length === 0);
  if (absent.length > 0) {
    observations.push(
      `${plural(absent.length, 'character')} ${absent.length === 1 ? 'has' : 'have'} no appearance recorded in any ` +
        `chapter: ${absent
          .slice(0, 6)
          .map((r) => r.name)
          .join(', ')}${absent.length > 6 ? ', and others' : ''}.`,
    );
  }
  const quiet = stableSorted(
    threadRows.filter((t) => t.status === 'active' && (t.quietFor ?? 0) > 0),
    (a, b) => b.quietFor! - a.quietFor!,
  ).slice(0, 5);
  for (const row of quiet) {
    observations.push(
      `The active thread “${row.title}” has no recorded development across the last ${plural(row.quietFor!, 'written chapter')}.`,
    );
  }
  const noBeats = threadRows.filter((t) => t.status === 'active' && t.beats === 0);
  if (noBeats.length > 0) {
    observations.push(
      `${plural(noBeats.length, 'active thread')} ${noBeats.length === 1 ? 'has' : 'have'} no developments recorded: ` +
        `${noBeats.map((t) => t.title).join(', ')}.`,
    );
  }
  if (base.lastWritingDay !== null && base.lastWritingDay !== today) {
    observations.push(`The most recent day with writing logged is ${longDay(base.lastWritingDay)}.`);
  }

  return {
    progress: base,
    output: {
      totalWords: base.totalWords,
      targetWords: base.targetWords,
      percent: base.percent,
      today: base.today,
      week: base.week,
      month: base.month,
      averagePerWritingDay: writingDays.length === 0 ? 0 : jsRound(net / writingDays.length),
      averagePerDayLast30: jsRound(days.reduce((n, d) => n + d.net, 0) / 30),
      days,
      weeks: base.weeks,
    },
    sessions: {
      count: sessions.length,
      averageWords: base.averageWordsPerSession,
      averageMinutes: sessions.length === 0 ? 0 : jsRound(base.totalMinutes / sessions.length),
      totalMinutes: base.totalMinutes,
      longestByWords: byWords === null ? null : { words: byWords.netWords, day: byWords.day },
      longestByTime: byTime === null ? null : { minutes: sessionMinutes(byTime), day: byTime.day },
      currentStreak: base.currentRun,
      longestStreak,
      writingDays: writingDays.length,
      lastWritingDay: base.lastWritingDay,
    },
    structure: {
      chapters: chapters.length,
      scenes: scenes.length,
      averageChapter: written.length === 0 ? 0 : jsRound(written.reduce((n, c) => n + c.words, 0) / written.length),
      averageScene: sceneWords.length === 0 ? 0 : jsRound(sceneWords.reduce((n, s) => n + s.wordCount, 0) / sceneWords.length),
      longest: pick((a, b) => a > b),
      shortest: pick((a, b) => a < b),
      lengths,
      pipeline: pipelineCounts,
    },
    cast: {
      total: characters.length,
      appearing: sortedRows.filter((r) => r.chapters.length > 0).length,
      rows: sortedRows,
    },
    threads: {
      total: threads.length,
      groups: threadGroups.map((g) => ({ key: g.key, label: g.label, count: threads.filter((t) => g.statuses.includes(t.statusKey)).length })),
      openMysteries: threads.filter((t) => t.category === 'mystery' && open.includes(t.statusKey)).length,
      characterArcs: threads.filter((t) => t.category === 'character-arc').length,
      rows: threadRows,
    },
    observations,
  };
}
