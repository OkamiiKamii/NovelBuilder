// PLOT-THREAD LANES. Each thread across the chapters, read only from what the author has recorded: its beats (each at a
// chapter or scene, with a role) and the timeline events that belong to it, at the chapters and scenes that tell them.
// Nothing is filled in: a chapter with nothing recorded is shown as that, a gap, and no beat, role or chapter is ever
// made up for a thread. A port of flutter_app/lib/shared/domain/plot/lanes.dart.

import { localeCompare } from '../collation';
import type { StoryModel } from '../model/storyModel';
import { stableSorted } from '../reader/stableSort';
import type { PlotThread, ThreadBeat } from '../records/thread';
import { dartTrim } from '../text/dartString';

/** A chapter or scene where a thread is recorded, and what is recorded there. */
export class ThreadPlace {
  readonly beats: ThreadBeat[] = [];
  /** The thread's events that this chapter or scene tells. */
  readonly eventIds: string[] = [];
  constructor(
    readonly nodeId: string,
    /** The chapter it is, or is in. */
    readonly chapterId: string,
  ) {}
}

/** The chapter a chapter or scene is in (itself for a chapter); null for a volume, act or arc, or a node that is gone. */
export function chapterOf(nodeId: string, model: StoryModel): string | null {
  let node = model.nodes.get(nodeId);
  for (let seen = 0; node !== undefined && seen < 50; seen++) {
    if (node.kind === 'chapter') return node.id;
    if (node.kind !== 'scene') return null;
    node = node.parentId === null ? undefined : model.nodes.get(node.parentId);
  }
  return null;
}

/** The role a beat has, as the original reads it: a beat stored before roles is a development; an unknown role is kept
 * as written, and is none of the five. */
export function roleKey(beat: ThreadBeat): string {
  const role = beat.raw['role'];
  return typeof role === 'string' ? role : 'development';
}

/** Every chapter and scene a thread is recorded at, in reading order. */
export function placesOf(thread: PlotThread, model: StoryModel): ThreadPlace[] {
  const places = new Map<string, ThreadPlace>();
  const at = (nodeId: string): ThreadPlace | null => {
    const chapterId = chapterOf(nodeId, model);
    if (chapterId === null) return null;
    let place = places.get(nodeId);
    if (place === undefined) places.set(nodeId, (place = new ThreadPlace(nodeId, chapterId)));
    return place;
  };
  for (const beat of thread.beats) {
    if (beat.nodeId !== null) at(beat.nodeId)?.beats.push(beat);
  }
  for (const event of model.events.values()) {
    if (!event.threadIds.includes(thread.id)) continue;
    for (const nodeId of event.nodeIds) at(nodeId)?.eventIds.push(event.id);
  }
  const last = 9007199254740991;
  return stableSorted(places.values(), (a, b) =>
    Math.sign((model.order.position.get(a.nodeId) ?? last) - (model.order.position.get(b.nodeId) ?? last)),
  );
}

export class LaneCell {
  /** The places in this chapter (the chapter itself, or its scenes). */
  readonly places: ThreadPlace[] = [];
  readonly beats: ThreadBeat[] = [];
  readonly eventIds: string[] = [];
  /** The role drawn for the cell: the weightiest among its beats, or null when only events are recorded. */
  role: string | null = null;
}

/** A run of chapters, between two that have something recorded, with nothing recorded. Column indexes, inclusive. */
export type Gap = { from: number; to: number; chapters: number };

/** An intersection beat, at a chapter, and a thread it crosses. */
export type Crossing = { beatId: string; column: number; otherId: string };

export type Lane = {
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
};

export type LaneChapter = { id: string; number: number; title: string };

export type Lanes = { chapters: LaneChapter[]; lanes: Lane[] };

/** Which role a cell shows when a chapter holds several: the ones that open and close a thread first. */
const weight = ['resolution', 'introduction', 'intersection', 'development', 'appears'];

/** The threads as lanes across the chapters, in reading order. `threadIds` picks and orders them; by default every
 * thread, by title. */
export function threadLanes(model: StoryModel, threadIds?: readonly string[]): Lanes {
  const chapters = model.order.chapters.map((c, i) => ({ id: c.id, number: i + 1, title: c.title }));
  const column = new Map(chapters.map((c, i) => [c.id, i]));
  const threads =
    threadIds !== undefined
      ? threadIds.flatMap((id) => {
          const t = model.threads.get(id);
          return t === undefined ? [] : [t];
        })
      : stableSorted(model.threads.values(), (a, b) => localeCompare(a.title, b.title));
  const lanes = threads.map((thread): Lane => {
    const cells = chapters.map(() => new LaneCell());
    for (const place of placesOf(thread, model)) {
      const i = column.get(place.chapterId);
      if (i === undefined) continue;
      const cell = cells[i];
      cell.places.push(place);
      cell.beats.push(...place.beats);
      for (const id of place.eventIds) if (!cell.eventIds.includes(id)) cell.eventIds.push(id);
    }
    for (const cell of cells) cell.role = weight.find((r) => cell.beats.some((b) => roleKey(b) === r)) ?? null;
    const marked = cells.flatMap((c, i) => (c.places.length > 0 ? [i] : []));
    const gaps: Gap[] = [];
    for (let i = 1; i < marked.length; i++) {
      if (marked[i] - marked[i - 1] > 1) gaps.push({ from: marked[i - 1] + 1, to: marked[i] - 1, chapters: marked[i] - marked[i - 1] - 1 });
    }
    const crossings: Crossing[] = [];
    cells.forEach((cell, i) => {
      for (const b of cell.beats) {
        if (roleKey(b) !== 'intersection') continue;
        for (const otherId of b.withThreadIds) if (model.threads.has(otherId)) crossings.push({ beatId: b.id, column: i, otherId });
      }
    });
    const placedIds = new Set(cells.flatMap((c) => c.beats.map((b) => b.id)));
    const told = new Set(cells.flatMap((c) => c.eventIds));
    return {
      thread,
      cells,
      first: marked.length === 0 ? null : marked[0],
      last: marked.length === 0 ? null : marked[marked.length - 1],
      gaps,
      crossings,
      unplaced: thread.beats.filter((b) => !placedIds.has(b.id)),
      untold: [...model.events.values()].filter((e) => e.threadIds.includes(thread.id) && !told.has(e.id)).map((e) => e.id),
    };
  });
  return { chapters, lanes };
}

/** A run of chapters in words: "Ch 4" or "Ch 4–7". */
export function chaptersWords(lanes: Lanes, from: number, to: number): string {
  return from === to ? `Ch ${lanes.chapters[from].number}` : `Ch ${lanes.chapters[from].number}–${lanes.chapters[to].number}`;
}

/** A gap in words, as a fact: "Nothing recorded in Ch 4–7 (4 chapters)". */
export function gapWords(lanes: Lanes, gap: Gap): string {
  return `Nothing recorded in ${chaptersWords(lanes, gap.from, gap.to)} (${gap.chapters} ${gap.chapters === 1 ? 'chapter' : 'chapters'})`;
}

/** Where the author recorded a thread's introduction and resolution, or that they have not. */
export function endsOf(lane: Lane, lanes: Lanes): { introduced: string; resolved: string } {
  const where = (role: string): string | null => {
    const at = lane.cells.findIndex((c) => c.beats.some((b) => roleKey(b) === role));
    return at < 0 ? null : `Ch ${lanes.chapters[at].number}`;
  };
  return { introduced: where('introduction') ?? 'not recorded', resolved: where('resolution') ?? 'not recorded' };
}

export const beatRoleKeys: readonly string[] = ['introduction', 'development', 'intersection', 'resolution', 'appears'];
export const beatRoleLabels: Readonly<Record<string, string>> = {
  introduction: 'Introduction',
  development: 'Development',
  intersection: 'Intersection',
  resolution: 'Resolution',
  appears: 'Appears (no development)',
};

export class ThreadHere {
  constructor(
    readonly thread: PlotThread,
    readonly roles: string[],
    /** Beats here that only say the thread appears, with no words of the author's: the only kind a card may take away. */
    readonly plainIds: string[],
    readonly events: number,
  ) {}
}

/** For every chapter and scene, the threads recorded there, with the roles of their beats there, by title. */
export function threadsByNode(model: StoryModel): Map<string, ThreadHere[]> {
  const out = new Map<string, ThreadHere[]>();
  for (const thread of stableSorted(model.threads.values(), (a, b) => localeCompare(a.title, b.title))) {
    for (const place of placesOf(thread, model)) {
      const here = new ThreadHere(
        thread,
        beatRoleKeys.filter((r) => place.beats.some((b) => roleKey(b) === r)),
        place.beats.filter((b) => roleKey(b) === 'appears' && dartTrim(b.title).length === 0 && dartTrim(b.note).length === 0).map((b) => b.id),
        place.eventIds.length,
      );
      let list = out.get(place.nodeId);
      if (list === undefined) out.set(place.nodeId, (list = []));
      list.push(here);
    }
  }
  return out;
}

