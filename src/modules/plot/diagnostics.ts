import { isDocument, subtreeIds } from '@/modules/manuscript/tree';
import type { StoryNode } from '@/modules/manuscript/types';
import { storyOrder } from '@/modules/relationships/timeline';
import { DEFAULT_QUIET_AFTER, OPEN_STATUSES, STATUS_LABELS, type PlotThread, type ThreadBeat } from './types';

/** A development with the place in the manuscript it points at worked out. */
export interface PlacedBeat {
  beat: ThreadBeat;
  /** The chapter or scene, when it still exists. */
  node: StoryNode | null;
  /** Number of the chapter it falls in, counting chapters in reading order. */
  chapter: number | null;
  /** The beat names a chapter or scene that is no longer in the manuscript. */
  missing: boolean;
}

export type IssueKind = 'quiet' | 'paused' | 'no-beats' | 'gap' | 'overdue' | 'missing-chapter' | 'planned-underway';

export interface ThreadIssue {
  kind: IssueKind;
  message: string;
}

export interface ThreadReport {
  thread: PlotThread;
  /** Developments in reading order; ones without a place come last. */
  beats: PlacedBeat[];
  /** Chapters written since the thread's latest development, when both are known. */
  quietFor: number | null;
  /** Things the author may want to look at. Empty when the thread is muted. */
  issues: ThreadIssue[];
  /** How many observations are being held back because the author muted the thread. */
  silenced: number;
}

export interface PlotReport {
  /** Number of the furthest chapter that has any words: how far the manuscript has got. 0 when nothing is written. */
  frontier: number;
  chapterCount: number;
  reports: ThreadReport[];
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * NON-INVASIVE DIAGNOSTIC RULE
 * Compares each thread with how far the manuscript has got and returns plain
 * observations. It is a pure function of what it is given: it writes nothing,
 * changes no status, and every message states a fact rather than a verdict.
 * Whether a quiet thread is forgotten, implied or resting is the author's call.
 */
export function diagnose(threads: PlotThread[], nodes: StoryNode[], quietAfter = DEFAULT_QUIET_AFTER): PlotReport {
  const order = storyOrder(nodes);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const chapterCount = order.chapters.length;
  const chapterOf = (id: string): number | null => {
    const n = order.chapterNumber.get(id);
    return n === undefined || chapterCount === 0 ? null : Math.min(n, chapterCount);
  };
  const frontier = Math.max(0, ...nodes.filter((n) => isDocument(n.kind) && n.wordCount > 0).map((n) => chapterOf(n.id) ?? 0));
  const threshold = Math.max(1, Math.round(quietAfter) || DEFAULT_QUIET_AFTER);

  const reports = threads.map((thread): ThreadReport => {
    const beats = thread.beats
      .map((beat, index): PlacedBeat & { index: number; position: number } => {
        const node = beat.nodeId ? (byId.get(beat.nodeId) ?? null) : null;
        // In reading order; then beats whose chapter is gone; then beats not placed yet.
        const position = node ? (order.position.get(node.id) ?? 0) : beat.nodeId ? Number.MAX_SAFE_INTEGER - 1 : Number.MAX_SAFE_INTEGER;
        return { beat, node, chapter: node ? chapterOf(node.id) : null, missing: Boolean(beat.nodeId) && !node, index, position };
      })
      .sort((a, b) => a.position - b.position || a.index - b.index)
      .map(({ beat, node, chapter, missing }) => ({ beat, node, chapter, missing }));

    const placed = beats.filter((b): b is PlacedBeat & { chapter: number } => b.chapter !== null);
    const reached = placed.filter((b) => b.chapter <= frontier);
    const last = reached[reached.length - 1];
    const quietFor = frontier > 0 && last ? frontier - last.chapter : null;
    const open = OPEN_STATUSES.includes(thread.status);
    const issues: ThreadIssue[] = [];
    const lastSeen = last ? `the last was “${last.beat.title}” in chapter ${last.chapter}, and the manuscript has reached chapter ${frontier}` : '';

    if (thread.status === 'active' && quietFor !== null && quietFor >= threshold) {
      issues.push({ kind: 'quiet', message: `Active, with no development recorded for ${plural(quietFor, 'chapter')}: ${lastSeen}.` });
    } else if (thread.status === 'paused' && quietFor !== null && quietFor >= threshold * 2) {
      issues.push({ kind: 'paused', message: `Paused for ${plural(quietFor, 'chapter')}: ${lastSeen}.` });
    }
    if (thread.status === 'active' && thread.beats.length === 0 && frontier > 0) {
      issues.push({ kind: 'no-beats', message: 'Marked Active, with no developments recorded yet.' });
    }
    if (thread.status === 'planned' && reached.length > 0) {
      issues.push({ kind: 'planned-underway', message: `Marked Planned, and it already has ${plural(reached.length, 'development')} in chapters that are written.` });
    }
    if (open) {
      let widest: { from: number; to: number } | null = null;
      for (let i = 1; i < placed.length; i++) {
        const [from, to] = [placed[i - 1].chapter, placed[i].chapter];
        if (to - from >= threshold && (!widest || to - from > widest.to - widest.from)) widest = { from, to };
      }
      if (widest) issues.push({ kind: 'gap', message: `Goes ${plural(widest.to - widest.from, 'chapter')} without a development, between chapters ${widest.from} and ${widest.to}.` });

      const target = thread.targetNodeId ? byId.get(thread.targetNodeId) : undefined;
      if (target) {
        // A volume or arc is "over" after the last chapter inside it.
        const ends = Math.max(0, ...subtreeIds(nodes, target.id).filter((id) => isDocument(byId.get(id)!.kind)).map((id) => chapterOf(id) ?? 0));
        if (ends > 0 && frontier > ends) {
          issues.push({ kind: 'overdue', message: `Meant to resolve by “${target.title}”; the manuscript is ${plural(frontier - ends, 'chapter')} past it and the thread is still ${STATUS_LABELS[thread.status]}.` });
        }
      }
    }
    const gone = beats.filter((b) => b.missing).length;
    if (gone) issues.push({ kind: 'missing-chapter', message: `${plural(gone, 'development')} ${gone === 1 ? 'points' : 'point'} at a chapter or scene that is no longer in the manuscript.` });

    return { thread, beats, quietFor, issues: thread.muted ? [] : issues, silenced: thread.muted ? issues.length : 0 };
  });

  return { frontier, chapterCount, reports };
}

/** "Ch 3" for a placed development, or why it has no chapter. */
export const beatPlace = (placed: PlacedBeat): string => (placed.chapter !== null ? `Ch ${placed.chapter}` : placed.missing ? 'Chapter removed' : 'Not placed');
