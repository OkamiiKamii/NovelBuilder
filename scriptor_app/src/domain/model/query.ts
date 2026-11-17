// WHAT A VIEW ASKS FOR. Every field narrows the result; fields combine with AND, values inside one field with OR
// ("Mira or Orrin"). An absent or empty field narrows nothing. Shared by every list, timeline, map and graph, so they
// all filter the same way. A port of flutter_app/lib/shared/domain/model/query.dart.

import { localeCompare } from '../exchange/collation';
import { type JsonMap, idOrNull, mapOrNull, strOrNull } from '../json';
import { strings } from '../records/jsonRecord';
import { type Connection, type ConnectionKind, connectionKindOf, deriveConnections } from './connections';
import { EntityRef, type EntityType, type EntityView, entityTypeOf, entityTypes } from './entityRef';
import { type StoryModel } from './storyModel';
import { Anchor, type TimeContext, Validity, overlaps, spanOfDate, spanOfEvent } from './validity';

export class Filter {
  constructor(
    readonly f: {
      types?: EntityType[];
      ids?: string[];
      /** World categories (`character`, `custom-…`). Only entries have one. */
      categories?: string[];
      /** Words in the record's name, any case. */
      text?: string | null;
      /** Reading order, from one chapter or scene to another, both included. Either end may be open. */
      chaptersFrom?: string | null;
      chaptersTo?: string | null;
      /** Story time, from one point (included) until another (not included). Either end may be open. */
      timeFrom?: Anchor | null;
      timeUntil?: Anchor | null;
      /** The record is one of these, or has a recorded connection to one. */
      characters?: string[];
      locations?: string[];
      factions?: string[];
      threads?: string[];
      canon?: string[];
      status?: string[];
      significance?: string[];
    } = {},
  ) {}

  static fromJson(json: JsonMap): Filter {
    const chapters = mapOrNull(json['chapters']);
    const time = mapOrNull(json['time']);
    return new Filter({
      types: strings(json['types']).flatMap((t) => {
        const type = entityTypeOf(t);
        return type === null ? [] : [type];
      }),
      ids: strings(json['ids']),
      categories: strings(json['categories']),
      text: strOrNull(json['text']),
      chaptersFrom: idOrNull(chapters?.['from']),
      chaptersTo: idOrNull(chapters?.['to']),
      timeFrom: Anchor.fromJson(time?.['from']),
      timeUntil: Anchor.fromJson(time?.['until']),
      characters: strings(json['characters']),
      locations: strings(json['locations']),
      factions: strings(json['factions']),
      threads: strings(json['threads']),
      canon: strings(json['canon']),
      status: strings(json['status']),
      significance: strings(json['significance']),
    });
  }
}

/** Records a filter could not decide about, with the reason, never dropped without a word. */
export class Undecided {
  constructor(
    readonly filter: string,
    readonly reason: string,
    readonly refs: EntityRef[],
  ) {}
}

export class QueryResult {
  constructor(
    /** Records that definitely match every filter: by type, then name, then id. */
    readonly items: EntityView[],
    /** Records no filter ruled out but at least one could not decide about, grouped by filter and reason. */
    readonly undecided: Undecided[],
    /** How many records were looked at: those of the asked-for types. */
    readonly considered: number,
  ) {}
}

const neighbourhoods = new WeakMap<StoryModel, Map<string, Set<string>>>();

function neighboursOf(model: StoryModel): Map<string, Set<string>> {
  const kept = neighbourhoods.get(model);
  if (kept !== undefined) return kept;
  const index = new Map<string, Set<string>>();
  const touch = (a: string, b: string) => {
    let s = index.get(a);
    if (s === undefined) index.set(a, (s = new Set()));
    s.add(b);
  };
  for (const c of deriveConnections(model).connections) {
    touch(c.from.id, c.to.id);
    touch(c.to.id, c.from.id);
  }
  // A relationship, as a record, is connected to the two characters it joins.
  for (const r of model.relations.values()) {
    for (const end of [r.fromId, r.toId]) {
      touch(r.id, end);
      touch(end, r.id);
    }
  }
  neighbourhoods.set(model, index);
  return index;
}

function idsOf(model: StoryModel, type: EntityType): Iterable<string> {
  switch (type) {
    case 'node':
      return model.nodes.keys();
    case 'entry':
      return model.entries.keys();
    case 'event':
      return model.events.keys();
    case 'thread':
      return model.threads.keys();
    case 'relation':
      return model.relations.keys();
    case 'ability':
      return model.abilities.keys();
  }
}

const universe = (model: StoryModel, types: readonly EntityType[]): EntityRef[] =>
  types.flatMap((type) => [...idsOf(model, type)].map((id) => new EntityRef(type, id)));

/** Where a record sits in reading order: a node's own place; an event, entry or thread by the chapters it is told,
 * mentioned, present or developed in. Null for records with no place in reading order. */
function readingPlaces(model: StoryModel, ref: EntityRef): number[] | null {
  const at = (ids: Iterable<string>) => {
    const out: number[] = [];
    for (const id of ids) {
      const p = model.order.position.get(id);
      if (p !== undefined) out.push(p);
    }
    return out;
  };
  switch (ref.type) {
    case 'node':
      return at([ref.id]);
    case 'event':
      return at(model.events.get(ref.id)!.nodeIds);
    case 'thread':
      return at(model.threads.get(ref.id)!.beats.flatMap((b) => (b.nodeId === null ? [] : [b.nodeId])));
    case 'entry':
      return at([
        ...[...model.nodes.values()].filter((n) => n.mentions.includes(ref.id)).map((n) => n.id),
        ...[...model.plans.values()].filter((p) => p.entityIds.includes(ref.id)).map((p) => p.id),
      ]);
    default:
      return null;
  }
}

/** When an event may start and end, in minutes. An approximate date is a range of possible moments, not a length; its
 * length (a duration, an end date, or none) is added on top. */
function bounds(eventId: string, model: StoryModel, context: TimeContext): { startLo: number; startHi: number; endLo: number; endHi: number } | null {
  const event = model.events.get(eventId)!;
  const start = spanOfDate(event.when, context, new Set([event.id]));
  if (start === null) return null;
  const inf = Number.POSITIVE_INFINITY;
  if (event.ongoing) return { startLo: start.lo, startHi: start.hi, endLo: inf, endHi: inf };
  if (event.raw['end'] !== null && event.raw['end'] !== undefined) {
    const end = spanOfDate(event.end, context, new Set([event.id]));
    return end === null
      ? { startLo: start.lo, startHi: start.hi, endLo: start.lo, endHi: inf }
      : { startLo: start.lo, startHi: start.hi, endLo: Math.max(end.lo, start.lo), endHi: Math.max(end.hi, start.hi) };
  }
  const length = context.calendar.durationMinutes(event.duration);
  return { startLo: start.lo, startHi: start.hi, endLo: start.lo + length, endHi: start.hi + length };
}

/** Where a range given by a point begins. [false, …]: the point is a chapter, not story time. */
function edge(anchor: Anchor, context: TimeContext): [boolean, number | null] {
  if (anchor.kind === 'node') return [false, null];
  if (anchor.kind === 'event') {
    const a = anchor as unknown as { eventId: string };
    return [true, spanOfEvent(a.eventId, context)?.lo ?? null];
  }
  const d = anchor as unknown as { when: Parameters<typeof spanOfDate>[0] };
  return [true, spanOfDate(d.when, context)?.lo ?? null];
}

/** true / false, or the reason it cannot tell. */
function inRange(eventId: string, model: StoryModel, fromAnchor: Anchor | null, untilAnchor: Anchor | null, context: TimeContext): boolean | string {
  const [fromIsTime, fromAt] = fromAnchor === null ? [true, Number.NEGATIVE_INFINITY] : edge(fromAnchor, context);
  const [untilIsTime, untilAt] = untilAnchor === null ? [true, Number.POSITIVE_INFINITY] : edge(untilAnchor, context);
  if (!fromIsTime || !untilIsTime) return 'the range is given in chapters, not story time';
  if (fromAt === null) return 'the start of the range no date that can be worked out';
  if (untilAt === null) return 'the end of the range no date that can be worked out';
  const event = bounds(eventId, model, context);
  if (event === null) return 'no date that can be worked out';
  // Every possible start begins before the range ends and runs into it.
  if (event.startHi < untilAt && event.endLo >= fromAt) return true;
  // No possible start reaches into the range.
  if (event.startLo >= untilAt || event.endHi < fromAt) return false;
  return 'date too broad to tell against the range';
}

const typeIndex = (t: EntityType) => entityTypes.indexOf(t);

const compareRefs = (a: EntityRef, b: EntityRef): number =>
  a.type !== b.type ? typeIndex(a.type) - typeIndex(b.type) : localeCompare(a.id, b.id);

/** The records that match a filter. Deterministic: the same model and filter give the same result in the same order. A
 * record the filter cannot decide about is reported in `undecided`; one that definitely does not match is left out. */
export function select(model: StoryModel, filter: Filter): QueryResult {
  const f = filter.f;
  const types = f.types !== undefined && f.types.length > 0 ? f.types : entityTypes;
  const refs = universe(model, types);
  const context = model.timeContext;
  const near = neighboursOf(model);
  const linked = (ref: EntityRef, targets: readonly string[]) =>
    targets.includes(ref.id) || targets.some((t) => near.get(ref.id)?.has(t) ?? false);

  const tests: [string, (ref: EntityRef) => boolean | string][] = [];
  const ids = f.ids ?? [];
  if (ids.length > 0) tests.push(['ids', (ref) => ids.includes(ref.id)]);
  const categories = f.categories ?? [];
  if (categories.length > 0) {
    tests.push(['categories', (ref) => (ref.type === 'entry' ? categories.includes(model.entries.get(ref.id)!.category) : 'no codex category')]);
  }
  const words = (f.text ?? '').trim().toLowerCase();
  if (words.length > 0) tests.push(['text', (ref) => model.resolve(ref)!.label.toLowerCase().includes(words)]);
  const chaptersFrom = f.chaptersFrom ?? null;
  const chaptersTo = f.chaptersTo ?? null;
  if (chaptersFrom !== null || chaptersTo !== null) {
    const lo = chaptersFrom === null ? -2147483648 : (model.order.position.get(chaptersFrom) ?? null);
    const hi = chaptersTo === null ? 2147483648 : (model.order.position.get(chaptersTo) ?? null);
    tests.push([
      'chapters',
      (ref) => {
        if (lo === null || hi === null) return 'the chapter range names a chapter that no longer exists';
        const places = readingPlaces(model, ref);
        if (places === null) return 'no place in reading order';
        if (places.length === 0) {
          return ref.type === 'event' ? 'not told in any chapter' : ref.type === 'thread' ? 'no development placed in a chapter' : 'not linked to any chapter';
        }
        return places.some((p) => p >= lo && p <= hi);
      },
    ]);
  }
  const timeFrom = f.timeFrom ?? null;
  const timeUntil = f.timeUntil ?? null;
  if (timeFrom !== null || timeUntil !== null) {
    tests.push(['time', (ref) => (ref.type === 'event' ? inRange(ref.id, model, timeFrom, timeUntil, context) : 'no place in story time (only events have one)')]);
  }
  for (const [key, wanted] of [
    ['characters', f.characters ?? []],
    ['locations', f.locations ?? []],
    ['factions', f.factions ?? []],
    ['threads', f.threads ?? []],
  ] as const) {
    if (wanted.length > 0) tests.push([key, (ref) => linked(ref, wanted)]);
  }
  const canon = f.canon ?? [];
  if (canon.length > 0) {
    tests.push(['canon', (ref) => (ref.type === 'event' ? canon.includes(model.events.get(ref.id)!.canonKey) : 'no canon status of its own')]);
  }
  const status = f.status ?? [];
  if (status.length > 0) {
    tests.push(['status', (ref) => (ref.type === 'event' ? status.includes(model.events.get(ref.id)!.statusKey) : 'no event status')]);
  }
  const significance = f.significance ?? [];
  if (significance.length > 0) {
    tests.push(['significance', (ref) => (ref.type === 'event' ? significance.includes(model.events.get(ref.id)!.importanceKey) : 'no significance')]);
  }

  const items: EntityView[] = [];
  const undecided = new Map<string, Undecided>();
  for (const ref of refs) {
    const verdicts = tests.map(([key, test]) => [key, test(ref)] as const);
    if (verdicts.some((v) => v[1] === false)) continue;
    const open = verdicts.filter((v): v is readonly [string, string] => typeof v[1] === 'string');
    if (open.length === 0) {
      items.push(model.resolve(ref)!);
      continue;
    }
    for (const [key, reason] of open) {
      const k = `${key}|${reason}`;
      let u = undecided.get(k);
      if (u === undefined) undecided.set(k, (u = new Undecided(key, reason, [])));
      u.refs.push(ref);
    }
  }
  items.sort((a, b) => {
    if (a.ref.type !== b.ref.type) return typeIndex(a.ref.type) - typeIndex(b.ref.type);
    const byLabel = localeCompare(a.label, b.label);
    return byLabel !== 0 ? byLabel : localeCompare(a.ref.id, b.ref.id);
  });
  for (const group of undecided.values()) group.refs.sort(compareRefs);
  const groups = [...undecided.values()].sort((a, b) => {
    const byFilter = localeCompare(a.filter, b.filter);
    return byFilter !== 0 ? byFilter : localeCompare(a.reason, b.reason);
  });
  return new QueryResult(items, groups, refs.length);
}

/** What a view asks of connections. Fields combine with AND, values within one with OR. */
export class ConnectionFilter {
  constructor(
    readonly kinds: ConnectionKind[] = [],
    /** Stored connections' own kinds: `member-of`, `owns`, the author's words. */
    readonly types: string[] = [],
    /** Connections with any of these records at either end. */
    readonly involving: string[] = [],
    readonly canon: string[] = [],
    /** Connections that hold at some moment in this stretch of story time. */
    readonly timeFrom: Anchor | null = null,
    readonly timeUntil: Anchor | null = null,
  ) {}

  static fromJson(json: JsonMap): ConnectionFilter {
    const time = mapOrNull(json['time']);
    return new ConnectionFilter(
      strings(json['kinds']).flatMap((k) => {
        const kind = connectionKindOf(k);
        return kind === null ? [] : [kind];
      }),
      strings(json['types']),
      strings(json['involving']),
      strings(json['canon']),
      Anchor.fromJson(time?.['from']),
      Anchor.fromJson(time?.['until']),
    );
  }
}

/** The connections that match, and those the filter could not decide about, with the reason. Same order every time. */
export function selectConnections(
  model: StoryModel,
  filter: ConnectionFilter,
): { items: Connection[]; undecided: { reason: string; connections: Connection[] }[] } {
  const context = model.timeContext;
  const range = filter.timeFrom !== null || filter.timeUntil !== null ? new Validity(filter.timeFrom, filter.timeUntil) : null;
  const items: Connection[] = [];
  const undecided = new Map<string, Connection[]>();
  for (const c of deriveConnections(model).connections) {
    if (filter.kinds.length > 0 && !filter.kinds.includes(c.kind)) continue;
    if (filter.types.length > 0 && !filter.types.includes(c.type ?? '')) continue;
    if (filter.involving.length > 0 && !filter.involving.some((id) => c.from.id === id || c.to.id === id)) continue;
    const reasons: string[] = [];
    if (filter.canon.length > 0) {
      if (c.kind !== 'link') reasons.push('no canon status of its own');
      else if (!filter.canon.includes(c.canon ?? 'canon')) continue;
    }
    if (range !== null) {
      const holds = overlaps(c.validity ?? Validity.always, range, context);
      if (holds === 'no') continue;
      if (holds === 'unknown') reasons.push('when it holds cannot be compared with the range');
    }
    if (reasons.length === 0) items.push(c);
    else {
      for (const r of reasons) {
        let list = undecided.get(r);
        if (list === undefined) undecided.set(r, (list = []));
        list.push(c);
      }
    }
  }
  const byId = (a: Connection, b: Connection) => localeCompare(a.id, b.id);
  items.sort(byId);
  const groups = [...undecided].sort((a, b) => localeCompare(a[0], b[0]));
  return { items, undecided: groups.map(([reason, connections]) => ({ reason, connections: connections.sort(byId) })) };
}
