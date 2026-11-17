// TRACKS. A port of flutter_app/lib/shared/domain/timeline/tracks.dart.
//
// A timeline can be split into tracks: one per character, place, faction, plot thread, or record of any kind the
// author has made. An event is on every track it is connected to (its participants, its place, its threads, anything
// linked to it), and it is still one event wherever it is drawn. Events connected to nothing of the kind go on a track
// of their own, so none of them goes missing.
//
// How the tracks are arranged (order, hidden, folded, focus) is only a way of looking: it never changes when an event
// happens.

import { localeCompare } from '../collation';
import { type Connection, connectionsOf, deriveConnections } from '../model/connections';
import { EntityRef } from '../model/entityRef';
import type { StoryModel } from '../model/storyModel';
import { stableSorted } from '../reader/stableSort';
import { dartToLowerCase } from '../text/dartString';
import type { EventRecord } from './eventRecord';

/** How a timeline is split: in one line, by plot thread, or by the records of one category. */
export type Grouping = { kind: 'none' } | { kind: 'thread' } | { kind: 'category'; key: string };

/** As the original keeps it in an address: `none`, `thread`, or `category:<key>`. */
export function encodeGrouping(g: Grouping): string {
  return g.kind === 'category' ? `category:${g.key}` : g.kind;
}

export function decodeGrouping(text: string | null | undefined): Grouping {
  if (text === 'thread') return { kind: 'thread' };
  if (text != null && text.startsWith('category:') && text.length > 9) return { kind: 'category', key: text.substring(9) };
  return { kind: 'none' };
}

export class Track {
  constructor(
    readonly id: string,
    readonly label: string,
    readonly eventIds: readonly string[],
    readonly folded = false,
  ) {}

  fold(folded: boolean): Track {
    return new Track(this.id, this.label, this.eventIds, folded);
  }
}

/** The track for events connected to nothing of the kind tracks are made of. */
export const unlinkedTrack = '__unlinked';
const allTrack = '__all';

/** The ways this novel's timeline can be split: by threads, and by every kind of codex record it has, the usual ones
 * first. */
export function groupings(model: StoryModel): { value: string; label: string }[] {
  const used = new Set([...model.entries.values()].map((e) => e.category));
  const first = ['character', 'location', 'faction'];
  const rank = (k: string) => (first.includes(k) ? first.indexOf(k) + 1 : 99);
  const keys = stableSorted(used, (a, b) => {
    const byRank = rank(a) - rank(b);
    return byRank !== 0 ? byRank : localeCompare(model.categoryOf(a).name, model.categoryOf(b).name);
  });
  return [
    { value: 'none', label: 'One line' },
    ...keys.map((key) => ({ value: `category:${key}`, label: key === 'location' ? 'Places' : model.categoryOf(key).name })),
    { value: 'thread', label: 'Plot threads' },
  ];
}

/** The tracks for these events. Each event is on every track it belongs to; tracks with no events are left out. */
export function tracksFor(model: StoryModel, events: readonly EventRecord[], grouping: Grouping): Track[] {
  if (grouping.kind === 'none') {
    return events.length === 0 ? [] : [new Track(allTrack, 'All events', events.map((e) => e.id))];
  }
  const connections: readonly Connection[] = grouping.kind === 'category' ? deriveConnections(model).connections : [];
  const members = new Map<string, string[]>();
  const unlinked: string[] = [];
  for (const event of events) {
    let ids: string[];
    if (grouping.kind === 'thread') {
      ids = (model.events.get(event.id)?.threadIds ?? []).filter((id) => model.threads.has(id));
    } else {
      const set = new Set<string>();
      for (const c of connectionsOf(connections, new EntityRef('event', event.id))) {
        if (c.other.type === 'entry' && model.entries.get(c.other.id)?.category === grouping.key) set.add(c.other.id);
      }
      ids = [...set];
    }
    if (ids.length === 0) unlinked.push(event.id);
    for (const id of ids) {
      let list = members.get(id);
      if (list === undefined) members.set(id, (list = []));
      list.push(event.id);
    }
  }
  const nameOf = (id: string) => (grouping.kind === 'thread' ? model.threads.get(id)!.title : model.entries.get(id)!.name);
  const tracks = stableSorted(
    [...members].map(([id, list]) => new Track(id, nameOf(id), list)),
    (a, b) => {
      const byLabel = localeCompare(a.label, b.label);
      return byLabel !== 0 ? byLabel : localeCompare(a.id, b.id);
    },
  );
  if (unlinked.length > 0) {
    const kind =
      grouping.kind === 'category'
        ? `linked to any ${grouping.key === 'location' ? 'place' : dartToLowerCase(model.categoryOf(grouping.key).singular)}`
        : 'part of any plot thread';
    tracks.push(new Track(unlinkedTrack, `Not ${kind}`, unlinked));
  }
  return tracks;
}

/** How the author has arranged the tracks. */
export type TrackPrefs = {
  /** Track ids in the order the author put them; tracks not named keep their usual place after these. */
  order?: readonly string[];
  hidden?: readonly string[];
  folded?: readonly string[];
  /** Show this track alone. */
  focus?: string | null;
};

/** The tracks as the author has arranged them: in their order, without the hidden ones (or only the focused one),
 * each marked folded or not. Ids of tracks that are not there (a character since deleted) are ignored. */
export function arrange(
  tracks: readonly Track[],
  prefs: TrackPrefs,
): { shown: Track[]; hidden: Track[]; focused: Track | null } {
  const byId = new Map(tracks.map((t) => [t.id, t]));
  const first = [...new Set(prefs.order ?? [])].filter((id) => byId.has(id)).map((id) => byId.get(id)!);
  const ordered = [...first, ...tracks.filter((t) => !first.includes(t))];
  const hidden = prefs.hidden ?? [];
  const folded = prefs.folded ?? [];
  const focused = prefs.focus == null ? null : (byId.get(prefs.focus) ?? null);
  if (focused !== null) {
    return { shown: [focused.fold(false)], hidden: ordered.filter((t) => t !== focused), focused };
  }
  return {
    shown: ordered.filter((t) => !hidden.includes(t.id)).map((t) => t.fold(folded.includes(t.id))),
    hidden: ordered.filter((t) => hidden.includes(t.id)),
    focused: null,
  };
}

/** The full order after moving one track up (-1) or down (+1) among those in `current`, the order as shown now. */
export function moveTrack(current: readonly string[], id: string, by: number): string[] {
  const at = current.indexOf(id);
  const to = at + by;
  if (at < 0 || to < 0 || to >= current.length) return [...current];
  const next = [...current];
  next[at] = current[to];
  next[to] = current[at];
  return next;
}

/** Turns one id on or off in a list (hidden, folded). */
export function toggleId(list: readonly string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}
