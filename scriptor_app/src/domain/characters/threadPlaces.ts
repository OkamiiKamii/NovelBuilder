// Where a plot thread is recorded in the book: its beats and the events that belong to it, at the chapters and scenes
// that tell them. A port of `ThreadPlace`, `chapterOf`, `roleKey` and `placesOf` from
// flutter_app/lib/shared/domain/plot/lanes.dart (the rest of the lanes is not ported yet), kept here for the
// appearance matrix's thread filter until the plot has a folder of its own.

import { type StoryModel } from '../model/storyModel';
import { stableSorted } from '../reader/stableSort';
import { type PlotThread, type ThreadBeat } from '../records/thread';

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

/** The chapter a chapter or scene is in (itself for a chapter); null for a volume, act or arc, or a node that is
 * gone. */
export function chapterOf(nodeId: string, model: StoryModel): string | null {
  let node = model.nodes.get(nodeId);
  for (let seen = 0; node !== undefined && seen < 50; seen++) {
    if (node.kind === 'chapter') return node.id;
    if (node.kind !== 'scene') return null;
    node = node.parentId === null ? undefined : model.nodes.get(node.parentId);
  }
  return null;
}

/** The role a beat has, as the original reads it: a beat stored before roles is a development; an unknown role is
 * kept as written, and is none of the five. */
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
  return stableSorted(places.values(), (a, b) => {
    const x = model.order.position.get(a.nodeId) ?? last;
    const y = model.order.position.get(b.nodeId) ?? last;
    return x < y ? -1 : x > y ? 1 : 0;
  });
}
