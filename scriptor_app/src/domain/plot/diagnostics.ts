// NON-INVASIVE DIAGNOSTIC RULE: each thread compared with how far the manuscript has got, as plain observations. It
// writes nothing, changes no status, and every message states a fact rather than a verdict. A port of
// flutter_app/lib/shared/domain/plot/diagnostics.dart.

import { StoryOrder, subtreeIds } from '../model/storyOrder';
import { stableSorted } from '../reader/stableSort';
import type { StoryNode } from '../records/storyNode';
import type { PlotThread, ThreadBeat } from '../records/thread';

/** A development with the place in the manuscript it points at worked out. */
export class PlacedBeat {
  constructor(
    readonly beat: ThreadBeat,
    /** The chapter or scene, when it still exists. */
    readonly node: StoryNode | null,
    /** Number of the chapter it falls in, counting chapters in reading order. */
    readonly chapter: number | null,
    /** The beat names a chapter or scene that is no longer in the manuscript. */
    readonly missing: boolean,
  ) {}
}

export type ThreadIssue = { kind: string; message: string };

export class ThreadReport {
  constructor(
    readonly thread: PlotThread,
    /** Developments in reading order; ones without a place come last. */
    readonly beats: PlacedBeat[],
    /** Chapters written since the thread's latest development, when both are known. */
    readonly quietFor: number | null,
    /** Things the author may want to look at. Empty when the thread is muted. */
    readonly issues: ThreadIssue[],
    /** How many observations are held back because the author muted the thread. */
    readonly silenced: number,
  ) {}
}

export class PlotReport {
  constructor(
    /** Number of the furthest chapter that has any words. 0 when nothing is written. */
    readonly frontier: number,
    readonly chapterCount: number,
    readonly reports: ThreadReport[],
  ) {}
}

/** How many chapters an active thread may go without a development before it is flagged. */
export const defaultQuietAfter = 20;
export const quietChoices: readonly number[] = [5, 10, 15, 20, 30, 50];
export const openStatuses: readonly string[] = ['planned', 'active', 'paused'];
export const threadStatusLabels: Readonly<Record<string, string>> = {
  planned: 'Planned',
  active: 'Active',
  paused: 'Paused',
  resolved: 'Resolved',
  abandoned: 'Abandoned',
  retconned: 'Retconned',
  custom: 'Custom',
};

/** Dart's `'$n $word${n == 1 ? '' : 's'}'` (no thousands separator). */
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const isDocument = (n: StoryNode) => n.kind === 'chapter' || n.kind === 'scene';

/** Every thread compared with the manuscript: where its developments fall, how long it has gone quiet, and what may
 * be worth a look. `quietAfter` 0 means the default. */
export function diagnose(threads: readonly PlotThread[], nodes: readonly StoryNode[], quietAfter: number = defaultQuietAfter): PlotReport {
  const order = StoryOrder.of(nodes);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const chapterCount = order.chapters.length;
  const chapterOf = (id: string): number | null => {
    const n = order.chapterNumber.get(id);
    return n === undefined || chapterCount === 0 ? null : Math.min(n, chapterCount);
  };
  const frontier = nodes.filter((n) => isDocument(n) && n.wordCount > 0).map((n) => chapterOf(n.id) ?? 0).reduce((a, b) => Math.max(a, b), 0);
  const threshold = Math.max(1, quietAfter === 0 ? defaultQuietAfter : quietAfter);
  const top = 9007199254740991;

  const reports = threads.map((thread) => {
    const indexed = thread.beats.map((beat, index) => {
      const node = beat.nodeId === null ? null : (byId.get(beat.nodeId) ?? null);
      // In reading order; then beats whose chapter is gone; then beats not placed yet.
      const position = node !== null ? (order.position.get(node.id) ?? 0) : beat.nodeId !== null ? top - 1 : top;
      return {
        placed: new PlacedBeat(beat, node, node === null ? null : chapterOf(node.id), beat.nodeId !== null && node === null),
        index,
        position,
      };
    });
    const beats = stableSorted(indexed, (a, b) => {
      const byPosition = Math.sign(a.position - b.position);
      return byPosition !== 0 ? byPosition : a.index - b.index;
    }).map((x) => x.placed);
    const placed = beats.filter((b) => b.chapter !== null);
    const reached = placed.filter((b) => b.chapter! <= frontier);
    const last = reached.length === 0 ? null : reached[reached.length - 1];
    const quietFor = frontier > 0 && last !== null ? frontier - last.chapter! : null;
    const status = thread.statusKey;
    const open = openStatuses.includes(status);
    const issues: ThreadIssue[] = [];
    const lastSeen =
      last === null ? '' : `the last was “${last.beat.title}” in chapter ${last.chapter}, and the manuscript has reached chapter ${frontier}`;
    if (status === 'active' && quietFor !== null && quietFor >= threshold) {
      issues.push({ kind: 'quiet', message: `Active, with no development recorded for ${plural(quietFor, 'chapter')}: ${lastSeen}.` });
    } else if (status === 'paused' && quietFor !== null && quietFor >= threshold * 2) {
      issues.push({ kind: 'paused', message: `Paused for ${plural(quietFor, 'chapter')}: ${lastSeen}.` });
    }
    if (status === 'active' && thread.beats.length === 0 && frontier > 0) {
      issues.push({ kind: 'no-beats', message: 'Marked Active, with no developments recorded yet.' });
    }
    if (status === 'planned' && reached.length > 0) {
      issues.push({
        kind: 'planned-underway',
        message: `Marked Planned, and it already has ${plural(reached.length, 'development')} in chapters that are written.`,
      });
    }
    if (open) {
      let widest: { from: number; to: number } | null = null;
      for (let i = 1; i < placed.length; i++) {
        const from = placed[i - 1].chapter!;
        const to = placed[i].chapter!;
        if (to - from >= threshold && (widest === null || to - from > widest.to - widest.from)) widest = { from, to };
      }
      if (widest !== null) {
        issues.push({
          kind: 'gap',
          message: `Goes ${plural(widest.to - widest.from, 'chapter')} without a development, between chapters ${widest.from} and ${widest.to}.`,
        });
      }
      const target = thread.targetNodeId === null ? null : (byId.get(thread.targetNodeId) ?? null);
      if (target !== null) {
        // A volume or arc is "over" after the last chapter inside it.
        const ends = subtreeIds(nodes, target.id)
          .filter((id) => isDocument(byId.get(id)!))
          .map((id) => chapterOf(id) ?? 0)
          .reduce((a, b) => Math.max(a, b), 0);
        if (ends > 0 && frontier > ends) {
          issues.push({
            kind: 'overdue',
            message: `Meant to resolve by “${target.title}”; the manuscript is ${plural(frontier - ends, 'chapter')} past it and the thread is still ${threadStatusLabels[status]}.`,
          });
        }
      }
    }
    const gone = beats.filter((b) => b.missing).length;
    if (gone > 0) {
      issues.push({
        kind: 'missing-chapter',
        message: `${plural(gone, 'development')} ${gone === 1 ? 'points' : 'point'} at a chapter or scene that is no longer in the manuscript.`,
      });
    }
    const muted = thread.raw['muted'] === true;
    return new ThreadReport(thread, beats, quietFor, muted ? [] : issues, muted ? issues.length : 0);
  });
  return new PlotReport(frontier, chapterCount, reports);
}

/** "Ch 3" for a placed development, or why it has no chapter. */
export function beatPlace(placed: PlacedBeat): string {
  return placed.chapter !== null ? `Ch ${placed.chapter}` : placed.missing ? 'Chapter removed' : 'Not placed';
}
