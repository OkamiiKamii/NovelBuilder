import { unknownCategory } from '@/modules/codex/schema';
import { connectionsOf, deriveConnections } from '@/modules/model/connections';
import type { EventRecord } from '@/modules/model/events';
import type { StoryModel } from '@/modules/model/types';

/**
 * TRACKS
 * A timeline can be split into tracks: one per character, place, faction,
 * plot thread, or record of any kind the author has made. An event is on
 * every track it is connected to (its participants, its place, its threads,
 * anything linked to it), and it is still one event: the same record, the
 * same id, wherever it is drawn. Events connected to nothing of the kind go
 * on a track of their own, so none of them goes missing.
 *
 * How the tracks are arranged (their order, which are hidden or folded,
 * which one is in focus) is only a way of looking: it never changes when
 * an event happens.
 */
export type Grouping = { kind: 'none' } | { kind: 'category'; key: string } | { kind: 'thread' };

export interface Track {
  id: string;
  label: string;
  eventIds: string[];
}

/** The track for events connected to nothing of the kind tracks are made of. */
export const UNLINKED = '__unlinked';
const ALL = '__all';

export const encodeGrouping = (g: Grouping): string => (g.kind === 'category' ? `category:${g.key}` : g.kind);

export function decodeGrouping(text: string | null): Grouping {
  if (text === 'thread') return { kind: 'thread' };
  if (text?.startsWith('category:') && text.length > 9) return { kind: 'category', key: text.slice(9) };
  return { kind: 'none' };
}

/** The ways this novel's timeline can be split: by threads, and by every kind of codex record it has, the usual ones first. */
export function groupings(model: StoryModel): { value: string; label: string }[] {
  const used = new Set([...model.entries.values()].map((e) => e.category));
  const first = ['character', 'location', 'faction'];
  const keys = [...used].sort((a, b) => (first.indexOf(a) + 1 || 99) - (first.indexOf(b) + 1 || 99) || (model.categories.get(a)?.name ?? a).localeCompare(model.categories.get(b)?.name ?? b));
  return [
    { value: 'none', label: 'One line' },
    ...keys.map((key) => ({ value: `category:${key}`, label: key === 'location' ? 'Places' : (model.categories.get(key) ?? unknownCategory(key)).name })),
    { value: 'thread', label: 'Plot threads' },
  ];
}

/** The tracks for these events. Each event is on every track it belongs to; tracks with no events are left out. */
export function tracksFor(model: StoryModel, events: EventRecord[], grouping: Grouping): Track[] {
  if (grouping.kind === 'none') return events.length ? [{ id: ALL, label: 'All events', eventIds: events.map((e) => e.id) }] : [];
  const connections = deriveConnections(model).connections;
  const members = new Map<string, string[]>();
  const unlinked: string[] = [];
  for (const event of events) {
    const ids =
      grouping.kind === 'thread'
        ? (model.events.get(event.id)?.threadIds ?? []).filter((id) => model.threads.has(id))
        : [...new Set(connectionsOf(connections, { type: 'event', id: event.id }).filter((c) => c.other.type === 'entry' && model.entries.get(c.other.id)?.category === grouping.key).map((c) => c.other.id))];
    if (!ids.length) unlinked.push(event.id);
    for (const id of ids) (members.get(id) ?? members.set(id, []).get(id)!).push(event.id);
  }
  const nameOf = (id: string) => (grouping.kind === 'thread' ? model.threads.get(id)!.title : model.entries.get(id)!.name);
  const tracks = [...members].map(([id, eventIds]) => ({ id, label: nameOf(id), eventIds })).sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
  if (unlinked.length) {
    const kind = grouping.kind === 'thread' ? 'part of any plot thread' : `linked to any ${grouping.key === 'location' ? 'place' : (model.categories.get(grouping.key) ?? unknownCategory(grouping.key)).singular.toLowerCase()}`;
    tracks.push({ id: UNLINKED, label: `Not ${kind}`, eventIds: unlinked });
  }
  return tracks;
}

export interface TrackPrefs {
  /** Track ids in the order the author put them; tracks not named keep their usual place after these. */
  order: string[];
  hidden: string[];
  folded: string[];
  /** Show this track alone. */
  focus: string | null;
}

export const NO_PREFS: TrackPrefs = { order: [], hidden: [], folded: [], focus: null };

/**
 * The tracks as the author has arranged them: in their order, without the
 * hidden ones (or only the focused one), each marked folded or not. Ids of
 * tracks that are not there (a character since deleted) are ignored.
 */
export function arrange(tracks: Track[], prefs: TrackPrefs): { shown: (Track & { folded: boolean })[]; hidden: Track[]; focused: Track | null } {
  const byId = new Map(tracks.map((t) => [t.id, t]));
  const first = [...new Set(prefs.order)].filter((id) => byId.has(id)).map((id) => byId.get(id)!);
  const ordered = [...first, ...tracks.filter((t) => !first.includes(t))];
  const focused = prefs.focus ? (byId.get(prefs.focus) ?? null) : null;
  if (focused) return { shown: [{ ...focused, folded: false }], hidden: ordered.filter((t) => t !== focused), focused };
  return {
    shown: ordered.filter((t) => !prefs.hidden.includes(t.id)).map((t) => ({ ...t, folded: prefs.folded.includes(t.id) })),
    hidden: ordered.filter((t) => prefs.hidden.includes(t.id)),
    focused: null,
  };
}

/** The full order after moving one track up (−1) or down (+1) among those in `current`, the order as shown now. */
export function moveTrack(current: string[], id: string, by: -1 | 1): string[] {
  const at = current.indexOf(id);
  const to = at + by;
  if (at < 0 || to < 0 || to >= current.length) return current;
  const next = [...current];
  [next[at], next[to]] = [next[to], next[at]];
  return next;
}

/** Turns one id on or off in a list (hidden, folded). */
export const toggle = (list: string[], id: string): string[] => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

/** Where a timeline's tracks are kept in the page address. */
export const TRACK_PARAMS = ['group', 'torder', 'thide', 'tfold', 'tfocus'] as const;

const ids = (text: string | null): string[] => (text ? [...new Set(text.split(',').filter(Boolean))] : []);

/** The tracks as the page address has them. */
export function readTracks(params: URLSearchParams): { grouping: Grouping; prefs: TrackPrefs } {
  return { grouping: decodeGrouping(params.get('group')), prefs: { order: ids(params.get('torder')), hidden: ids(params.get('thide')), folded: ids(params.get('tfold')), focus: params.get('tfocus') || null } };
}

/** The address parameters for a way of arranging tracks; the plain one-line timeline sets none. */
export function trackAddress(grouping: Grouping, prefs: TrackPrefs): Record<(typeof TRACK_PARAMS)[number], string | null> {
  const list = (values: string[]) => (values.length ? values.join(',') : null);
  return { group: grouping.kind === 'none' ? null : encodeGrouping(grouping), torder: list(prefs.order), thide: list(prefs.hidden), tfold: list(prefs.folded), tfocus: prefs.focus };
}

/** Tracks as a saved view keeps them (its `layout`), and back. Ids inside are rewritten in copies like any other. */
export const trackLayout = (grouping: Grouping, prefs: TrackPrefs): Record<string, unknown> => (grouping.kind === 'none' ? {} : { group: encodeGrouping(grouping), trackOrder: prefs.order, hiddenTracks: prefs.hidden, foldedTracks: prefs.folded, focusTrack: prefs.focus });

export function tracksFromLayout(layout: Record<string, unknown>): { grouping: Grouping; prefs: TrackPrefs } {
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  return { grouping: decodeGrouping(typeof layout.group === 'string' ? layout.group : null), prefs: { order: list(layout.trackOrder), hidden: list(layout.hiddenTracks), folded: list(layout.foldedTracks), focus: typeof layout.focusTrack === 'string' ? layout.focusTrack : null } };
}
