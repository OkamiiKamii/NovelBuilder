// THE PLACE TREE (as in the original app): every location of the novel, inside what it is "Located in" (a connection
// still holding: one that has ended is history, not where it is now), with its level, and how much of the story it
// holds: events there and in the places inside it, the characters, factions and chapters tied to it. Read from the
// records; nothing is stored for the tree, and nothing is changed. A port of
// flutter_app/lib/shared/domain/places/explore.dart.

import { localeCompare } from '../collation';
import { numOrNull } from '../json';
import { type Connection, connectionsOf, deriveConnections } from '../model/connections';
import { EntityRef } from '../model/entityRef';
import type { StoryModel } from '../model/storyModel';
import { stableSorted } from '../reader/stableSort';
import type { Entry } from '../records/entry';
import type { TimelineEvent } from '../records/event';
import { type Link, connectionType } from '../records/link';
import type { StoryNode } from '../records/storyNode';
import type { MapPin, PlaceLevel, PlaceSettings, WorldMap } from './places';

export class PlaceRow {
  /** Events in the places inside it, however deep. */
  eventsWithin = 0;

  constructor(
    readonly entry: Entry,
    readonly depth: number,
    readonly parentId: string | null,
    readonly childIds: readonly string[],
    readonly level: PlaceLevel | null,
    /** The level in words: its name, nothing when none is set, or that the level was removed. */
    readonly levelWords: string,
    readonly events: number,
    readonly characters: number,
    readonly factions: number,
    readonly chapters: number,
    /** The maps it has a pin on, by id. */
    readonly maps: readonly string[],
    /** What to look at, in words: also recorded inside another place, inside itself, a larger place inside a
     * smaller. Never fixed. */
    readonly notes: readonly string[],
  ) {}
}

export function isPlace(e: Entry | null | undefined): boolean {
  return e?.category === 'location';
}

const createdAtOf = (l: Link): number => numOrNull(l.raw['createdAt']) ?? 0;

/** Each place's parent: its "Located in" a place, still holding; the first recorded when there are several (the
 * others are said). */
export function parentsOf(model: StoryModel): { parent: Map<string, string>; others: Map<string, string[]> } {
  const parent = new Map<string, string>();
  const others = new Map<string, string[]>();
  const links = stableSorted(
    model.links.filter((l) => l.type === 'located-in' && l.isEntryLink && (l.validity?.until ?? null) === null),
    (a, b) => {
      const ca = createdAtOf(a);
      const cb = createdAtOf(b);
      const c = ca < cb ? -1 : ca > cb ? 1 : 0;
      return c !== 0 ? c : localeCompare(a.id, b.id);
    },
  );
  for (const link of links) {
    if (!isPlace(model.entries.get(link.fromId)) || !isPlace(model.entries.get(link.toId)) || link.fromId === link.toId) {
      continue;
    }
    if (!parent.has(link.fromId)) {
      parent.set(link.fromId, link.toId);
    } else if (parent.get(link.fromId) !== link.toId) {
      let list = others.get(link.fromId);
      if (list === undefined) others.set(link.fromId, (list = []));
      list.push(link.toId);
    }
  }
  return { parent, others };
}

/** The places inside one, however deep, in tree order. */
export function placesWithin(rows: readonly PlaceRow[], id: string): string[] {
  const at = rows.findIndex((r) => r.entry.id === id);
  if (at < 0) return [];
  const out: string[] = [];
  for (let i = at + 1; i < rows.length && rows[i].depth > rows[at].depth; i++) out.push(rows[i].entry.id);
  return out;
}

/** Every place in tree order: the places at the top by name, each followed by the places inside it. */
export function placeTree(
  model: StoryModel,
  options: { settings?: PlaceSettings | null; pins?: readonly MapPin[] } = {},
): PlaceRow[] {
  const pins = options.pins ?? [];
  const places = [...model.entries.values()].filter(isPlace);
  const { parent, others } = parentsOf(model);
  const levels = options.settings?.levels ?? [];
  const levelAt = new Map(levels.map((l, i) => [l.id, i]));
  const name = (id: string) => model.entries.get(id)?.name ?? 'a place that is gone';
  const loopOf = (id: string): boolean => {
    const seen = new Set<string>();
    for (let at: string | undefined = id; at !== undefined; at = parent.get(at)) {
      if (seen.has(at)) return true;
      seen.add(at);
    }
    return false;
  };

  const children = new Map<string, Entry[]>();
  const roots: Entry[] = [];
  for (const place of places) {
    const up = parent.get(place.id);
    if (up === undefined || loopOf(place.id)) {
      roots.push(place);
    } else {
      let list = children.get(up);
      if (list === undefined) children.set(up, (list = []));
      list.push(place);
    }
  }
  const connections = deriveConnections(model).connections;
  const eventsAt = new Map<string, TimelineEvent[]>();
  for (const e of model.events.values()) {
    const id = e.locationId;
    if (id === null) continue;
    let list = eventsAt.get(id);
    if (list === undefined) eventsAt.set(id, (list = []));
    list.push(e);
  }
  const pinned = new Map<string, string[]>();
  for (const pin of pins) {
    let list = pinned.get(pin.entryId);
    if (list === undefined) pinned.set(pin.entryId, (list = []));
    list.push(pin.mapId);
  }

  const rows: PlaceRow[] = [];
  const shown = new Set<string>();
  const walk = (list: readonly Entry[], depth: number, parentId: string | null): void => {
    for (const place of stableSorted(list, (a, b) => localeCompare(a.name, b.name))) {
      if (shown.has(place.id)) continue;
      shown.add(place.id);
      const links = placeLinks(model, place.id, connections);
      const levelId = place.placeLevel;
      const level = levelId === null ? null : (levels.find((l) => l.id === levelId) ?? null);
      const notes: string[] = [];
      const more = others.get(place.id);
      if (more !== undefined) {
        notes.push(
          `Also recorded as inside ${more.map(name).join(', ')}; shown inside ${name(parent.get(place.id)!)}, recorded ` +
            'first.',
        );
      }
      if (parent.get(place.id) !== undefined && loopOf(place.id)) {
        notes.push('It is inside itself through what it is located in, so it is shown at the top.');
      }
      const up = parentId === null ? undefined : model.entries.get(parentId);
      const upLevel = up?.placeLevel ?? null;
      if (level !== null && upLevel !== null && levelAt.has(upLevel) && levelAt.get(level.id)! <= levelAt.get(upLevel)!) {
        notes.push(
          `A ${level.name} inside ${up!.name}, a ${levels[levelAt.get(upLevel)!].name}: it is not a smaller kind of place ` +
            'than what it is in.',
        );
      }
      rows.push(
        new PlaceRow(
          place,
          depth,
          parentId,
          (children.get(place.id) ?? []).map((c) => c.id),
          level,
          level !== null ? level.name : levelId !== null ? 'a level that was removed' : '',
          eventsAt.get(place.id)?.length ?? 0,
          links.characters.length,
          links.factions.length,
          links.chapters.length,
          pinned.get(place.id) ?? [],
          notes,
        ),
      );
      walk(children.get(place.id) ?? [], depth + 1, place.id);
    }
  };

  walk(roots, 0, null);
  for (const row of rows) {
    row.eventsWithin = placesWithin(rows, row.entry.id).reduce((n, id) => n + (eventsAt.get(id)?.length ?? 0), 0);
  }
  return rows;
}

// ---------------------------------------------------------------------------------------------------- what a place is tied to

export type Tied = { entry: Entry; how: string[] };

export class PlaceLinks {
  constructor(
    /** Each with how it is tied: "Located in", "takes part in “The siege”, here". */
    readonly characters: Tied[],
    readonly factions: Tied[],
    readonly others: Tied[],
    readonly events: TimelineEvent[],
    readonly chapters: { node: StoryNode; how: string[] }[],
  ) {}
}

/** Everything one place is tied to: records connected to it (characters, factions, anything else) and how; the events
 * that take place there, and the characters who take part in them; the chapters and scenes that link it in their
 * text or plan, or tell an event that takes place there. */
export function placeLinks(model: StoryModel, placeId: string, connections?: readonly Connection[]): PlaceLinks {
  const all = connections ?? deriveConnections(model).connections;
  const entries = new Map<string, string[]>();
  const nodes = new Map<string, string[]>();
  const tie = (map: Map<string, string[]>, id: string, how: string) => {
    let list = map.get(id);
    if (list === undefined) map.set(id, (list = []));
    if (!list.includes(how)) list.push(how);
  };

  for (const seen of connectionsOf(all, new EntityRef('entry', placeId))) {
    const kind = connectionType(seen.connection.type).label;
    const words = seen.outgoing
      ? seen.label.length > 0
        ? seen.label
        : kind
      : seen.connection.label.length > 0
        ? seen.connection.label
        : kind;
    const other = seen.other;
    if (other.type === 'entry' && other.id !== placeId && model.entries.has(other.id)) {
      // A place inside this one, or the one it is in, belongs to the tree, not here.
      if (
        seen.connection.kind === 'link' &&
        connectionType(seen.connection.type).key === 'located-in' &&
        isPlace(model.entries.get(other.id))
      ) {
        continue;
      }
      tie(entries, other.id, seen.outgoing ? words : `${words} this`);
    }
    if (other.type === 'node' && model.nodes.has(other.id)) {
      tie(
        nodes,
        other.id,
        seen.connection.kind === 'mentioned'
          ? 'links it in the text'
          : seen.connection.kind === 'present'
            ? 'has it in the plan'
            : words,
      );
    }
  }
  const events = stableSorted(
    [...model.events.values()].filter((e) => e.locationId === placeId),
    (a, b) => localeCompare(a.name, b.name),
  );
  for (const event of events) {
    for (const c of event.characters) {
      if (model.entries.has(c.id)) tie(entries, c.id, `takes part in “${event.name}”, here`);
    }
    for (const nodeId of event.nodeIds) {
      if (model.nodes.has(nodeId)) tie(nodes, nodeId, `tells “${event.name}”, here`);
    }
  }
  const group = (category: string | null): Tied[] =>
    stableSorted(
      [...entries]
        .filter(([id]) => {
          const c = model.entries.get(id)!.category;
          return category === null ? c !== 'character' && c !== 'faction' : c === category;
        })
        .map(([id, how]) => ({ entry: model.entries.get(id)!, how })),
      (a, b) => localeCompare(a.entry.name, b.entry.name),
    );
  const position = (id: string) => model.order.position.get(id) ?? 2 ** 53;
  return new PlaceLinks(
    group('character'),
    group('faction'),
    group(null),
    events,
    stableSorted(
      [...nodes].map(([id, how]) => ({ node: model.nodes.get(id)!, how })),
      (a, b) => {
        const pa = position(a.node.id);
        const pb = position(b.node.id);
        return pa < pb ? -1 : pa > pb ? 1 : 0;
      },
    ),
  );
}

// ---------------------------------------------------------------------------------------------------- on a map

export class MapPlaces {
  constructor(
    /** Places with a pin on this map, and whether the pin lies outside its edges. */
    readonly pinned: { entry: Entry; pin: MapPin; outside: boolean }[],
    /** Places this map covers (inside the place it is a map of, or all of them) with no pin on it. */
    readonly missing: Entry[],
  ) {}
}

export function mapPlaces(rows: readonly PlaceRow[], map: WorldMap, pins: readonly MapPin[]): MapPlaces {
  const byId = new Map(rows.map((r) => [r.entry.id, r.entry]));
  const covers =
    map.placeId !== null ? new Set(placesWithin(rows, map.placeId)) : new Set(rows.map((r) => r.entry.id));
  const mine = pins.filter((p) => p.mapId === map.id && byId.has(p.entryId));
  const pinned = mine.map((pin) => ({
    entry: byId.get(pin.entryId)!,
    pin,
    outside: pin.x < 0 || pin.y < 0 || pin.x > map.width || pin.y > map.height,
  }));
  const has = new Set(mine.map((p) => p.entryId));
  return new MapPlaces(
    stableSorted(pinned, (a, b) => localeCompare(a.entry.name, b.entry.name)),
    rows.filter((r) => covers.has(r.entry.id) && !has.has(r.entry.id)).map((r) => r.entry),
  );
}
