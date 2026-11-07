import type { LoreEntry } from '@/modules/codex/types';
import { connectionType } from '@/modules/connections/types';
import type { StoryNode } from '@/modules/manuscript/types';
import { connectionsOf, deriveConnections } from '@/modules/model/connections';
import type { StoryModel } from '@/modules/model/types';
import type { TimelineEvent } from '@/modules/timeline/types';
import type { MapPin, PlaceLevel, PlaceSettings, WorldMap } from './types';

/**
 * THE PLACE TREE
 * Every location of the novel, inside what it is "Located in" (a connection
 * still holding: one that has ended is history, not where it is now), with
 * its level, and how much of the story it holds: events there and in the
 * places inside it, the characters, factions and chapters tied to it. Read
 * from the records; nothing is stored for the tree, and nothing is changed.
 */

export interface PlaceRow {
  entry: LoreEntry;
  depth: number;
  parentId: string | null;
  childIds: string[];
  level: PlaceLevel | null;
  /** The level in words: its name, nothing when none is set, or that the level was removed. */
  levelWords: string;
  events: number;
  /** Events in the places inside it, however deep. */
  eventsWithin: number;
  characters: number;
  factions: number;
  chapters: number;
  /** The maps it has a pin on, by id. */
  maps: string[];
  /** What to look at, in words: also recorded inside another place, inside itself, a larger place inside a smaller. Never fixed. */
  notes: string[];
}

const isPlace = (e: LoreEntry | undefined): e is LoreEntry => e?.category === 'location';

/** Each place's parent: its "Located in" a place, still holding; the first recorded when there are several (the others are said). */
export function parentsOf(model: Pick<StoryModel, 'entries' | 'links'>): { parent: Map<string, string>; others: Map<string, string[]> } {
  const parent = new Map<string, string>();
  const others = new Map<string, string[]>();
  const links = model.links.filter((l) => l.type === 'located-in' && (l.fromType ?? 'entry') === 'entry' && (l.toType ?? 'entry') === 'entry' && !l.validity?.until).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  for (const link of links) {
    if (!isPlace(model.entries.get(link.fromId)) || !isPlace(model.entries.get(link.toId)) || link.fromId === link.toId) continue;
    if (!parent.has(link.fromId)) parent.set(link.fromId, link.toId);
    else if (parent.get(link.fromId) !== link.toId) others.set(link.fromId, [...(others.get(link.fromId) ?? []), link.toId]);
  }
  return { parent, others };
}

/** The places inside one, however deep, in tree order. */
export function placesWithin(rows: PlaceRow[], id: string): string[] {
  const at = rows.findIndex((r) => r.entry.id === id);
  if (at < 0) return [];
  const out: string[] = [];
  for (let i = at + 1; i < rows.length && rows[i].depth > rows[at].depth; i++) out.push(rows[i].entry.id);
  return out;
}

export function placeTree(model: StoryModel, input: { settings?: PlaceSettings | null; pins?: MapPin[] } = {}): PlaceRow[] {
  const places = [...model.entries.values()].filter(isPlace);
  const { parent, others } = parentsOf(model);
  const levels = input.settings?.levels ?? [];
  const levelAt = new Map(levels.map((l, i) => [l.id, i]));
  const name = (id: string) => model.entries.get(id)?.name ?? 'a place that is gone';
  const loopOf = (id: string): boolean => {
    const seen = new Set<string>();
    for (let at: string | undefined = id; at; at = parent.get(at)) {
      if (seen.has(at)) return true;
      seen.add(at);
    }
    return false;
  };
  const children = new Map<string, LoreEntry[]>();
  const roots: LoreEntry[] = [];
  for (const place of places) {
    const up = parent.get(place.id);
    if (!up || loopOf(place.id)) roots.push(place);
    else (children.get(up) ?? children.set(up, []).get(up)!).push(place);
  }
  const { connections } = deriveConnections(model);
  const eventsAt = new Map<string, TimelineEvent[]>();
  for (const e of model.events.values()) if (e.locationId) eventsAt.set(e.locationId, [...(eventsAt.get(e.locationId) ?? []), e]);
  const pinned = new Map<string, string[]>();
  for (const pin of input.pins ?? []) pinned.set(pin.entryId, [...(pinned.get(pin.entryId) ?? []), pin.mapId]);

  const rows: PlaceRow[] = [];
  const shown = new Set<string>();
  const walk = (list: LoreEntry[], depth: number, parentId: string | null) => {
    for (const place of [...list].sort((a, b) => a.name.localeCompare(b.name))) {
      if (shown.has(place.id)) continue;
      shown.add(place.id);
      const links = placeLinks(model, place.id, connections);
      const level = place.placeLevel ? (levels.find((l) => l.id === place.placeLevel) ?? null) : null;
      const notes: string[] = [];
      if (others.has(place.id)) notes.push(`Also recorded as inside ${others.get(place.id)!.map(name).join(', ')}; shown inside ${name(parent.get(place.id)!)}, recorded first.`);
      if (parent.get(place.id) && loopOf(place.id)) notes.push(`It is inside itself through what it is located in, so it is shown at the top.`);
      const up = parentId ? model.entries.get(parentId) : undefined;
      if (level && up?.placeLevel && levelAt.has(up.placeLevel) && levelAt.get(level.id)! <= levelAt.get(up.placeLevel)!) notes.push(`A ${level.name} inside ${up.name}, a ${levels[levelAt.get(up.placeLevel)!].name}: it is not a smaller kind of place than what it is in.`);
      const row: PlaceRow = {
        entry: place,
        depth,
        parentId,
        childIds: (children.get(place.id) ?? []).map((c) => c.id),
        level,
        levelWords: level ? level.name : place.placeLevel ? 'a level that was removed' : '',
        events: eventsAt.get(place.id)?.length ?? 0,
        eventsWithin: 0,
        characters: links.characters.length,
        factions: links.factions.length,
        chapters: links.chapters.length,
        maps: pinned.get(place.id) ?? [],
        notes,
      };
      rows.push(row);
      walk(children.get(place.id) ?? [], depth + 1, place.id);
    }
  };
  walk(roots, 0, null);
  for (const row of rows) row.eventsWithin = placesWithin(rows, row.entry.id).reduce((n, id) => n + (eventsAt.get(id)?.length ?? 0), 0);
  return rows;
}

// ---------------------------------------------------------------------------------------------------- what a place is tied to

export interface PlaceLinks {
  /** Each with how it is tied: "Located in", "takes part in “The siege”, here". */
  characters: { entry: LoreEntry; how: string[] }[];
  factions: { entry: LoreEntry; how: string[] }[];
  others: { entry: LoreEntry; how: string[] }[];
  events: TimelineEvent[];
  chapters: { node: StoryNode; how: string[] }[];
}

/**
 * Everything one place is tied to: records connected to it (characters,
 * factions, anything else) and how; the events that take place there, and
 * the characters who take part in them; the chapters and scenes that link
 * it in their text or plan, or tell an event that takes place there.
 */
export function placeLinks(model: StoryModel, placeId: string, connections = deriveConnections(model).connections): PlaceLinks {
  const entries = new Map<string, string[]>();
  const nodes = new Map<string, string[]>();
  const tie = (map: Map<string, string[]>, id: string, how: string) => map.set(id, [...new Set([...(map.get(id) ?? []), how])]);
  for (const seen of connectionsOf(connections, { type: 'entry', id: placeId })) {
    const words = seen.outgoing ? `${seen.label || connectionType(seen.connection.type).label}` : `${seen.connection.label || connectionType(seen.connection.type).label}`;
    if (seen.other.type === 'entry' && seen.other.id !== placeId && model.entries.has(seen.other.id)) {
      // A place inside this one, or the one it is in, belongs to the tree, not here.
      if (seen.connection.kind === 'link' && connectionType(seen.connection.type).key === 'located-in' && isPlace(model.entries.get(seen.other.id))) continue;
      tie(entries, seen.other.id, seen.outgoing ? words : `${words} this`);
    }
    if (seen.other.type === 'node' && model.nodes.has(seen.other.id)) tie(nodes, seen.other.id, seen.connection.kind === 'mentioned' ? 'links it in the text' : seen.connection.kind === 'present' ? 'has it in the plan' : words);
  }
  const events = [...model.events.values()].filter((e) => e.locationId === placeId).sort((a, b) => a.name.localeCompare(b.name));
  for (const event of events) {
    for (const c of event.characters) if (model.entries.has(c.id)) tie(entries, c.id, `takes part in “${event.name}”, here`);
    for (const nodeId of event.nodeIds) if (model.nodes.has(nodeId)) tie(nodes, nodeId, `tells “${event.name}”, here`);
  }
  const group = (category: string | null) =>
    [...entries]
      .map(([id, how]) => ({ entry: model.entries.get(id)!, how }))
      .filter(({ entry }) => (category === null ? entry.category !== 'character' && entry.category !== 'faction' : entry.category === category))
      .sort((a, b) => a.entry.name.localeCompare(b.entry.name));
  const position = (id: string) => model.order.position.get(id) ?? Number.MAX_SAFE_INTEGER;
  return {
    characters: group('character'),
    factions: group('faction'),
    others: group(null),
    events,
    chapters: [...nodes].map(([id, how]) => ({ node: model.nodes.get(id)!, how })).sort((a, b) => position(a.node.id) - position(b.node.id)),
  };
}

// ---------------------------------------------------------------------------------------------------- on a map

export interface MapPlaces {
  /** Places with a pin on this map, and whether the pin lies outside its edges. */
  pinned: { entry: LoreEntry; pin: MapPin; outside: boolean }[];
  /** Places this map covers (inside the place it is a map of, or all of them) with no pin on it: in the tree, not on this map. */
  missing: LoreEntry[];
}

export function mapPlaces(rows: PlaceRow[], map: WorldMap, pins: MapPin[]): MapPlaces {
  const byId = new Map(rows.map((r) => [r.entry.id, r.entry]));
  const covers = new Set(map.placeId ? placesWithin(rows, map.placeId) : rows.map((r) => r.entry.id));
  const mine = pins.filter((p) => p.mapId === map.id && byId.has(p.entryId));
  const pinned = mine.map((pin) => ({ entry: byId.get(pin.entryId)!, pin, outside: pin.x < 0 || pin.y < 0 || pin.x > map.width || pin.y > map.height }));
  const has = new Set(mine.map((p) => p.entryId));
  return { pinned: pinned.sort((a, b) => a.entry.name.localeCompare(b.entry.name)), missing: rows.filter((r) => covers.has(r.entry.id) && !has.has(r.entry.id)).map((r) => r.entry) };
}
