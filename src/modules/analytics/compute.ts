import type { LoreEntry } from '@/modules/codex/types';
import { find, paragraphsOf } from '@/modules/continuity/text';
import { buildTree, flatten, isDocument } from '@/modules/manuscript/tree';
import type { ChapterPlan, NodeStatus, StoryNode } from '@/modules/manuscript/types';
import { diagnose } from '@/modules/plot/diagnostics';
import { CATEGORY_LABELS, statusName, type PlotThread, type ThreadStatus } from '@/modules/plot/types';
import { computeProgress, sessionMinutes, type PeriodTotals, type TrendPoint } from '@/modules/progress/analytics';
import { addDays, dayKey, parseDay } from '@/modules/progress/time';
import type { Goal, WritingSession } from '@/modules/progress/types';
import type { ProgressSnapshot } from '@/modules/progression/types';
import { storyOrder } from '@/modules/relationships/timeline';
import type { CharacterRelation } from '@/modules/relationships/types';

export interface AnalyticsInput {
  targetWordCount: number | null;
  nodes: StoryNode[];
  /** Saved text by chapter or scene id. */
  docs: Map<string, unknown>;
  plans: ChapterPlan[];
  entries: LoreEntry[];
  relations: CharacterRelation[];
  snapshots: ProgressSnapshot[];
  threads: PlotThread[];
  sessions: WritingSession[];
  goals: Goal[];
  now?: number;
}

export interface Place {
  nodeId: string;
  title: string;
  /** Chapter number in reading order. */
  number: number;
}

export interface CharacterRow {
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
  /** The whole row as one sentence. */
  line: string;
}

export interface ThreadRow {
  id: string;
  title: string;
  category: string;
  status: ThreadStatus;
  /** The status in words: the author's own name for a custom one. */
  statusLabel: string;
  beats: number;
  /** Numbers of the chapters it has a development in. */
  chapters: number[];
  /** Share of the manuscript's chapters it has a development in, 0 to 1. */
  density: number;
  /** Written chapters since its latest development. Null when that cannot be measured. */
  quietFor: number | null;
  line: string;
}

export const PIPELINE = [
  { key: 'planned', label: 'Planned', statuses: ['idea', 'planned'] },
  { key: 'drafting', label: 'Drafting', statuses: ['drafting'] },
  { key: 'revision', label: 'In Revision', statuses: ['draft-complete', 'revising'] },
  { key: 'completed', label: 'Completed', statuses: ['final', 'published'] },
] as const satisfies readonly { key: string; label: string; statuses: readonly NodeStatus[] }[];

export const THREAD_GROUPS = [
  { key: 'active', label: 'Active', statuses: ['active'] },
  { key: 'resolved', label: 'Resolved', statuses: ['resolved'] },
  { key: 'paused', label: 'Dormant / Paused', statuses: ['paused'] },
  { key: 'abandoned', label: 'Abandoned', statuses: ['abandoned', 'retconned'] },
  { key: 'planned', label: 'Planned', statuses: ['planned'] },
] as const satisfies readonly { key: string; label: string; statuses: readonly ThreadStatus[] }[];

export interface Analytics {
  output: {
    totalWords: number;
    targetWords: number | null;
    percent: number | null;
    today: PeriodTotals;
    week: PeriodTotals;
    month: PeriodTotals;
    /** Net words divided by the number of days with any writing. */
    averagePerWritingDay: number;
    /** Net words over the last 30 days, divided by 30. */
    averagePerDayLast30: number;
    /** The last 30 days, oldest first. */
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
    longest: (Place & { words: number }) | null;
    shortest: (Place & { words: number }) | null;
    /** Every chapter with its length, scenes included. */
    lengths: (Place & { words: number })[];
    pipeline: { key: string; label: string; count: number }[];
  };
  cast: { total: number; appearing: number; rows: CharacterRow[] };
  threads: { total: number; groups: { key: string; label: string; count: number }[]; openMysteries: number; characterArcs: number; rows: ThreadRow[] };
  /** Plain statements of fact drawn from the numbers above. */
  observations: string[];
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** "1–3, 7, 12" for a sorted list of chapter numbers. */
export function ranges(numbers: number[]): string {
  const out: string[] = [];
  for (let i = 0; i < numbers.length; i++) {
    let end = i;
    while (end + 1 < numbers.length && numbers[end + 1] === numbers[end] + 1) end++;
    out.push(end > i ? `${numbers[i]}–${numbers[end]}` : String(numbers[i]));
    i = end;
  }
  return out.join(', ');
}

/**
 * OBJECTIVE DIAGNOSTICS RULE
 * Counts things. Every number here is read straight off the project: the
 * manuscript's tree and saved text, the writing log, the Codex, recorded
 * relationships, snapshots and plot threads. Nothing is scored, graded or
 * compared with how a book "should" go, and every sentence it produces says
 * what is, never what it means. Whether a number is as intended is for the
 * author. It is a pure function and changes nothing.
 */
export function computeAnalytics(input: AnalyticsInput): Analytics {
  const { nodes, docs, plans, entries, relations, snapshots, threads, sessions, goals, targetWordCount } = input;
  const now = input.now ?? Date.now();
  const today = dayKey(now);
  const base = computeProgress({ targetWordCount, nodes, sessions, goals, now });
  const order = storyOrder(nodes);
  const tree = flatten(buildTree(nodes));
  const chapters = tree.filter((t) => t.node.kind === 'chapter');
  const scenes = nodes.filter((n) => n.kind === 'scene');
  const documents = nodes.filter((n) => isDocument(n.kind));
  const chapterAt = new Map(order.chapters.map((node, i) => [i + 1, node]));
  const place = (number: number): Place => ({ nodeId: chapterAt.get(number)!.id, title: chapterAt.get(number)!.title, number });
  const numberOf = (nodeId: string): number | null => {
    const n = order.chapterNumber.get(nodeId);
    return n !== undefined && n >= 1 && n <= order.chapters.length ? n : null;
  };

  // ---- Output and sessions
  const byDay = new Map<string, number>();
  for (const session of sessions) byDay.set(session.day, (byDay.get(session.day) ?? 0) + session.netWords);
  const writingDays = [...byDay.keys()].sort();
  let longestStreak = 0;
  let run = 0;
  writingDays.forEach((day, i) => {
    run = i > 0 && addDays(writingDays[i - 1], 1) === day ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
  });
  const net = sessions.reduce((n, s) => n + s.netWords, 0);
  const days: TrendPoint[] = Array.from({ length: 30 }, (_, i) => {
    const key = addDays(today, i - 29);
    return { key, label: parseDay(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), net: byDay.get(key) ?? 0, current: key === today };
  });
  const byWords = [...sessions].sort((a, b) => b.netWords - a.netWords)[0];
  const byTime = [...sessions].sort((a, b) => sessionMinutes(b) - sessionMinutes(a))[0];

  // ---- Structure
  const lengths = chapters.map((t) => ({ ...place(numberOf(t.node.id)!), words: t.totalWords }));
  const written = lengths.filter((c) => c.words > 0);
  const sceneWords = scenes.filter((s) => s.wordCount > 0);
  const pipeline = PIPELINE.map((group) => ({ key: group.key, label: group.label, count: chapters.filter((t) => (group.statuses as readonly string[]).includes(t.node.status)).length }));

  // ---- Cast: a character appears in a chapter when they are linked there, listed in its plan, or named in its text.
  const text = new Map(documents.map((d) => [d.id, paragraphsOf(docs.get(d.id)).map((p) => p.text).join('\n')]));
  const planOf = new Map(plans.map((p) => [p.id, p]));
  const characters = entries.filter((e) => e.category === 'character');
  // Worked out once, not once a character: each part's chapter, links and plan; relationships and snapshots by character.
  const parts = documents.flatMap((doc) => {
    const number = numberOf(doc.id);
    return number === null ? [] : [{ number, mentions: new Set(doc.mentions ?? []), involved: new Set(planOf.get(doc.id)?.entityIds ?? []), text: text.get(doc.id) ?? '' }];
  });
  const count = (ids: string[]) => ids.reduce((m, id) => m.set(id, (m.get(id) ?? 0) + 1), new Map<string, number>());
  const relationCount = count(relations.flatMap((r) => (r.fromId === r.toId ? [r.fromId] : [r.fromId, r.toId])));
  const snapshotCount = count(snapshots.map((s) => s.entryId));
  const rows: CharacterRow[] = characters.map((entry) => {
    const numbers = new Set<number>();
    const name = entry.name.trim();
    for (const part of parts) {
      if (numbers.has(part.number)) continue;
      // The name search is exact and case-sensitive, so text without the name cannot match: it is skipped.
      if (part.mentions.has(entry.id) || part.involved.has(entry.id) || (name && part.text.includes(name) && find(part.text, [entry.name]).length > 0)) numbers.add(part.number);
    }
    const list = [...numbers].sort((a, b) => a - b);
    const relationships = relationCount.get(entry.id) ?? 0;
    const milestones = snapshotCount.get(entry.id) ?? 0;
    const [first, latest] = list.length ? [place(list[0]), place(list.at(-1)!)] : [null, null];
    const line = list.length
      ? `${entry.name}: appears in ${plural(list.length, 'chapter')}, first: Ch. ${first!.number}, latest: Ch. ${latest!.number}, relationships: ${relationships}, progression snapshots: ${milestones}`
      : `${entry.name}: no appearances recorded, relationships: ${relationships}, progression snapshots: ${milestones}`;
    return { id: entry.id, name: entry.name, chapters: list, distribution: ranges(list), first, latest, relationships, milestones, line };
  });
  rows.sort((a, b) => b.chapters.length - a.chapters.length || a.name.localeCompare(b.name));

  // ---- Plot threads
  const reports = new Map(diagnose(threads, nodes).reports.map((r) => [r.thread.id, r]));
  const threadRows: ThreadRow[] = threads.map((thread) => {
    const numbers = [...new Set(thread.beats.flatMap((b) => (b.nodeId ? (numberOf(b.nodeId) ?? []) : [])))].sort((a, b) => a - b);
    const density = chapters.length ? numbers.length / chapters.length : 0;
    const quietFor = reports.get(thread.id)?.quietFor ?? null;
    return {
      id: thread.id, title: thread.title, category: thread.category === 'custom' && thread.customCategory.trim() ? thread.customCategory.trim() : CATEGORY_LABELS[thread.category], status: thread.status, statusLabel: statusName(thread), beats: thread.beats.length, chapters: numbers, density, quietFor,
      line: `${thread.title}: ${plural(thread.beats.length, 'development')} in ${numbers.length} of ${plural(chapters.length, 'chapter')} (${Math.round(density * 100)}%)${numbers.length ? `, chapters ${ranges(numbers)}` : ''}`,
    };
  });
  threadRows.sort((a, b) => b.chapters.length - a.chapters.length || a.title.localeCompare(b.title));
  const open: ThreadStatus[] = ['planned', 'active', 'paused'];

  // ---- Statements of fact
  const observations: string[] = [];
  const empty = lengths.filter((c) => c.words === 0).length;
  if (chapters.length && empty) observations.push(`${plural(empty, 'chapter')} of ${chapters.length} ${empty === 1 ? 'has' : 'have'} no text yet.`);
  if (written.length > 1) {
    const [longest, shortest] = [written.reduce((a, b) => (b.words > a.words ? b : a)), written.reduce((a, b) => (b.words < a.words ? b : a))];
    if (longest.words !== shortest.words) observations.push(`The longest chapter with text (“${longest.title}”, ${plural(longest.words, 'word')}) is ${(longest.words / shortest.words).toFixed(1)} times the length of the shortest (“${shortest.title}”, ${plural(shortest.words, 'word')}).`);
  }
  const absent = rows.filter((r) => r.chapters.length === 0);
  if (absent.length) observations.push(`${plural(absent.length, 'character')} ${absent.length === 1 ? 'has' : 'have'} no appearance recorded in any chapter: ${absent.slice(0, 6).map((r) => r.name).join(', ')}${absent.length > 6 ? ', and others' : ''}.`);
  for (const row of threadRows.filter((t) => t.status === 'active' && (t.quietFor ?? 0) > 0).sort((a, b) => b.quietFor! - a.quietFor!).slice(0, 5)) {
    observations.push(`The active thread “${row.title}” has no recorded development across the last ${plural(row.quietFor!, 'written chapter')}.`);
  }
  const noBeats = threadRows.filter((t) => t.status === 'active' && t.beats === 0);
  if (noBeats.length) observations.push(`${plural(noBeats.length, 'active thread')} ${noBeats.length === 1 ? 'has' : 'have'} no developments recorded: ${noBeats.map((t) => t.title).join(', ')}.`);
  if (base.lastWritingDay && base.lastWritingDay !== today) observations.push(`The most recent day with writing logged is ${parseDay(base.lastWritingDay).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}.`);

  return {
    output: {
      totalWords: base.totalWords, targetWords: base.targetWords, percent: base.percent, today: base.today, week: base.week, month: base.month,
      averagePerWritingDay: writingDays.length ? Math.round(net / writingDays.length) : 0, averagePerDayLast30: Math.round(days.reduce((n, d) => n + d.net, 0) / 30), days, weeks: base.weeks,
    },
    sessions: {
      count: sessions.length, averageWords: base.averageWordsPerSession, averageMinutes: sessions.length ? Math.round(base.totalMinutes / sessions.length) : 0, totalMinutes: base.totalMinutes,
      longestByWords: byWords ? { words: byWords.netWords, day: byWords.day } : null, longestByTime: byTime ? { minutes: sessionMinutes(byTime), day: byTime.day } : null,
      currentStreak: base.currentRun, longestStreak, writingDays: writingDays.length, lastWritingDay: base.lastWritingDay,
    },
    structure: {
      chapters: chapters.length, scenes: scenes.length,
      averageChapter: written.length ? Math.round(written.reduce((n, c) => n + c.words, 0) / written.length) : 0,
      averageScene: sceneWords.length ? Math.round(sceneWords.reduce((n, s) => n + s.wordCount, 0) / sceneWords.length) : 0,
      longest: written.length ? written.reduce((a, b) => (b.words > a.words ? b : a)) : null, shortest: written.length ? written.reduce((a, b) => (b.words < a.words ? b : a)) : null, lengths, pipeline,
    },
    cast: { total: characters.length, appearing: rows.filter((r) => r.chapters.length > 0).length, rows },
    threads: {
      total: threads.length, groups: THREAD_GROUPS.map((group) => ({ key: group.key, label: group.label, count: threads.filter((t) => (group.statuses as readonly string[]).includes(t.status)).length })),
      openMysteries: threads.filter((t) => t.category === 'mystery' && open.includes(t.status)).length, characterArcs: threads.filter((t) => t.category === 'character-arc').length, rows: threadRows,
    },
    observations,
  };
}
