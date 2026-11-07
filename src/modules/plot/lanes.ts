import type { StoryModel } from '@/modules/model/types';
import { BEAT_ROLES, roleOf, type BeatRole, type PlotThread, type ThreadBeat } from './types';

/**
 * PLOT-THREAD LANES
 * Each thread across the chapters, read only from what the author has
 * recorded: its beats (each at a chapter or scene, with a role) and the
 * timeline events that belong to it, at the chapters and scenes that tell
 * them. Nothing is filled in: a chapter with nothing recorded is shown as
 * that, a gap, and no beat, role or chapter is ever made up for a thread.
 */
export type LaneInput = Pick<StoryModel, 'nodes' | 'order' | 'events' | 'threads'>;

/** A chapter or scene where a thread is recorded, and what is recorded there. */
export interface ThreadPlace {
  nodeId: string;
  /** The chapter it is, or is in. */
  chapterId: string;
  beats: ThreadBeat[];
  /** The thread's events that this chapter or scene tells. */
  eventIds: string[];
}

/** The chapter a chapter or scene is in (itself for a chapter); null for a volume, act or arc, or a node that is gone. */
export function chapterOf(nodeId: string, input: Pick<LaneInput, 'nodes'>): string | null {
  for (let node = input.nodes.get(nodeId), seen = 0; node && seen < 50; node = node.parentId ? input.nodes.get(node.parentId) : undefined, seen++) {
    if (node.kind === 'chapter') return node.id;
    if (node.kind !== 'scene') return null;
  }
  return null;
}

/** Every chapter and scene a thread is recorded at, in reading order. */
export function placesOf(thread: PlotThread, input: LaneInput): ThreadPlace[] {
  const places = new Map<string, ThreadPlace>();
  const at = (nodeId: string) => {
    const chapterId = chapterOf(nodeId, input);
    if (!chapterId) return null;
    if (!places.has(nodeId)) places.set(nodeId, { nodeId, chapterId, beats: [], eventIds: [] });
    return places.get(nodeId)!;
  };
  for (const beat of thread.beats) if (beat.nodeId) at(beat.nodeId)?.beats.push(beat);
  for (const event of input.events.values()) {
    if (!(event.threadIds ?? []).includes(thread.id)) continue;
    for (const nodeId of event.nodeIds ?? []) at(nodeId)?.eventIds.push(event.id);
  }
  const position = (id: string) => input.order.position.get(id) ?? Number.MAX_SAFE_INTEGER;
  return [...places.values()].sort((a, b) => position(a.nodeId) - position(b.nodeId));
}

export interface LaneCell {
  /** The places in this chapter (the chapter itself, or its scenes). */
  places: ThreadPlace[];
  beats: ThreadBeat[];
  eventIds: string[];
  /** The role drawn for the cell: the weightiest among its beats, or null when only events are recorded. */
  role: BeatRole | null;
}
/** A run of chapters, between two that have something recorded, with nothing recorded. Column indexes, inclusive. */
export interface Gap {
  from: number;
  to: number;
  chapters: number;
}
/** An intersection beat, at a chapter, and a thread it crosses. */
export interface Crossing {
  beatId: string;
  column: number;
  otherId: string;
}
export interface Lane {
  thread: PlotThread;
  cells: LaneCell[];
  /** The first and last chapters with anything recorded. */
  first: number | null;
  last: number | null;
  gaps: Gap[];
  crossings: Crossing[];
  /** Beats with no chapter given, or whose chapter is gone. */
  unplaced: ThreadBeat[];
  /** The thread's events that no chapter or scene tells. */
  untold: string[];
}
export interface Lanes {
  chapters: { id: string; number: number; title: string }[];
  lanes: Lane[];
}

/** Which role a cell shows when a chapter holds several: the ones that open and close a thread first. */
const WEIGHT: BeatRole[] = ['resolution', 'introduction', 'intersection', 'development', 'appears'];

/** The threads as lanes across the chapters, in reading order. `threadIds` picks and orders them; by default every thread, by title. */
export function threadLanes(input: LaneInput, threadIds?: string[]): Lanes {
  const chapters = input.order.chapters.map((c, i) => ({ id: c.id, number: i + 1, title: c.title }));
  const column = new Map(chapters.map((c, i) => [c.id, i]));
  const threads = threadIds ? threadIds.flatMap((id) => input.threads.get(id) ?? []) : [...input.threads.values()].sort((a, b) => a.title.localeCompare(b.title));
  const lanes = threads.map((thread): Lane => {
    const cells: LaneCell[] = chapters.map(() => ({ places: [], beats: [], eventIds: [], role: null }));
    for (const place of placesOf(thread, input)) {
      const cell = cells[column.get(place.chapterId) ?? -1];
      if (!cell) continue;
      cell.places.push(place);
      cell.beats.push(...place.beats);
      cell.eventIds.push(...place.eventIds.filter((id) => !cell.eventIds.includes(id)));
    }
    for (const cell of cells) cell.role = WEIGHT.find((role) => cell.beats.some((b) => roleOf(b) === role)) ?? null;
    const marked = cells.map((c, i) => (c.places.length ? i : -1)).filter((i) => i >= 0);
    const [first, last] = marked.length ? [marked[0], marked[marked.length - 1]] : [null, null];
    const gaps: Gap[] = [];
    for (let i = 1; i < marked.length; i++) if (marked[i] - marked[i - 1] > 1) gaps.push({ from: marked[i - 1] + 1, to: marked[i] - 1, chapters: marked[i] - marked[i - 1] - 1 });
    const crossings = cells.flatMap((cell, i) => cell.beats.filter((b) => roleOf(b) === 'intersection').flatMap((b) => (b.withThreadIds ?? []).filter((id) => input.threads.has(id)).map((otherId) => ({ beatId: b.id, column: i, otherId }))));
    const placedIds = new Set(cells.flatMap((c) => c.beats.map((b) => b.id)));
    const told = new Set(cells.flatMap((c) => c.eventIds));
    const untold = [...input.events.values()].filter((e) => (e.threadIds ?? []).includes(thread.id) && !told.has(e.id)).map((e) => e.id);
    return { thread, cells, first, last, gaps, crossings, unplaced: thread.beats.filter((b) => !placedIds.has(b.id)), untold };
  });
  return { chapters, lanes };
}

/** A run of chapters in words: "Ch 4" or "Ch 4–7". */
export const chaptersWords = (lanes: Lanes, from: number, to: number) => (from === to ? `Ch ${lanes.chapters[from].number}` : `Ch ${lanes.chapters[from].number}–${lanes.chapters[to].number}`);

/** A gap in words, as a fact: "Nothing recorded in Ch 4–7 (4 chapters)". */
export const gapWords = (lanes: Lanes, gap: Gap) => `Nothing recorded in ${chaptersWords(lanes, gap.from, gap.to)} (${gap.chapters} ${gap.chapters === 1 ? 'chapter' : 'chapters'})`;

/** Where the author recorded a thread's introduction and resolution, or that they have not. */
export function endsOf(lane: Lane, lanes: Lanes): { introduced: string; resolved: string } {
  const where = (role: BeatRole) => {
    const at = lane.cells.findIndex((c) => c.beats.some((b) => roleOf(b) === role));
    return at < 0 ? null : `Ch ${lanes.chapters[at].number}`;
  };
  return { introduced: where('introduction') ?? 'not recorded', resolved: where('resolution') ?? 'not recorded' };
}

export interface ThreadHere {
  thread: PlotThread;
  roles: BeatRole[];
  /** Beats here that only say the thread appears, with no words of the author's: the only kind a card may take away. */
  plainIds: string[];
  events: number;
}

/** For every chapter and scene, the threads recorded there, with the roles of their beats there, by title. For chips on cards. */
export function threadsByNode(input: LaneInput): Map<string, ThreadHere[]> {
  const out = new Map<string, ThreadHere[]>();
  for (const thread of [...input.threads.values()].sort((a, b) => a.title.localeCompare(b.title))) {
    for (const place of placesOf(thread, input)) {
      const here = { thread, roles: BEAT_ROLES.filter((r) => place.beats.some((b) => roleOf(b) === r)), plainIds: place.beats.filter((b) => roleOf(b) === 'appears' && !b.title.trim() && !b.note.trim()).map((b) => b.id), events: place.eventIds.length };
      out.set(place.nodeId, [...(out.get(place.nodeId) ?? []), here]);
    }
  }
  return out;
}
