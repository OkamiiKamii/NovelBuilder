import type { CanonStatus } from '@/modules/canon/types';
import { durationMinutes } from '@/modules/timeline/chronology';
import type { EventStatus, Importance } from '@/modules/timeline/types';
import { deriveConnections } from './connections';
import { resolveRef } from './model';
import { ENTITY_TYPES, type Connection, type ConnectionKind, type EntityRef, type EntityType, type EntityView, type StoryModel } from './types';
import { overlaps, spanOfDate, spanOfEvent, timeContext, type Anchor, type TimeContext, type Validity } from './validity';

/**
 * WHAT A VIEW ASKS FOR
 * Every field narrows the result; fields combine with AND, and the values
 * inside one field with OR ("Mira or Orrin"). An absent or empty field does
 * not narrow anything.
 */
export interface Filter {
  types?: EntityType[];
  ids?: string[];
  /** Codex categories (`character`, `location`, `custom-…`). Only entries have one. */
  categories?: string[];
  /** Words in the record's name, any case. */
  text?: string;
  /** Reading order, from one chapter or scene to another, both included. Either end may be left open. */
  chapters?: { from?: string | null; to?: string | null };
  /** Story time, from one point (included) until another (not included). Either end may be left open. */
  time?: { from?: Anchor | null; until?: Anchor | null };
  /** The record is one of these characters, or has a recorded connection to one. The same for the next three. */
  characters?: string[];
  locations?: string[];
  factions?: string[];
  threads?: string[];
  /** Canon status: events and stored connections have one. */
  canon?: CanonStatus[];
  /** Event planning status and significance. */
  status?: EventStatus[];
  significance?: Importance[];
}

/**
 * Records a filter could not decide about, with the reason, never dropped
 * without a word: an event with no date asked about a time range, a chapter
 * range asked of an event told in no chapter.
 */
export interface Undecided {
  filter: keyof Filter;
  reason: string;
  refs: EntityRef[];
}

export interface QueryResult {
  /** Records that definitely match every filter, in a fixed order: by type, then name, then id. */
  items: EntityView[];
  /** Records that no filter ruled out but at least one could not decide about, grouped by filter and reason. */
  undecided: Undecided[];
  /** How many records were looked at: those of the asked-for types. */
  considered: number;
}

type Verdict = true | false | string;

/** Two filters at once: for a field both set, only values in both; ranges and text keep the first that is set. */
export function combine(a: Filter, b: Filter): Filter {
  const out: Filter = { ...b, ...a };
  for (const key of ['types', 'ids', 'categories', 'characters', 'locations', 'factions', 'threads', 'canon', 'status', 'significance'] as const) {
    const x = a[key] as string[] | undefined;
    const y = b[key] as string[] | undefined;
    if (x?.length && y?.length) (out as Record<string, unknown>)[key] = x.filter((v) => y.includes(v));
  }
  return out;
}

/** What a model's connections are, indexed by record, worked out once per model. */
const neighbourhoods = new WeakMap<StoryModel, Map<string, Set<string>>>();
function neighboursOf(model: StoryModel): Map<string, Set<string>> {
  let index = neighbourhoods.get(model);
  if (!index) {
    index = new Map();
    const touch = (a: string, b: string) => (index!.get(a) ?? index!.set(a, new Set()).get(a)!).add(b);
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
  }
  return index;
}

const ORDER: Record<EntityType, number> = Object.fromEntries(ENTITY_TYPES.map((t, i) => [t, i])) as Record<EntityType, number>;

/** Every record of the given types, as refs. */
function universe(model: StoryModel, types: EntityType[]): EntityRef[] {
  const ids: Record<EntityType, () => Iterable<string>> = {
    node: () => model.nodes.keys(),
    entry: () => model.entries.keys(),
    event: () => model.events.keys(),
    thread: () => model.threads.keys(),
    relation: () => model.relations.keys(),
    ability: () => model.abilities.keys(),
  };
  return types.flatMap((type) => [...ids[type]()].map((id) => ({ type, id })));
}

/** Where a record sits in reading order: a node's own place; an event, entry or thread by the chapters it is told, mentioned, present or developed in. */
function readingPlaces(model: StoryModel, ref: EntityRef): number[] | null {
  const at = (ids: Iterable<string>) => [...ids].map((id) => model.order.position.get(id)).filter((p): p is number => p !== undefined);
  switch (ref.type) {
    case 'node':
      return at([ref.id]);
    case 'event':
      return at(model.events.get(ref.id)!.nodeIds);
    case 'thread':
      return at(model.threads.get(ref.id)!.beats.flatMap((b) => (b.nodeId ? [b.nodeId] : [])));
    case 'entry': {
      const places: string[] = [];
      for (const node of model.nodes.values()) if ((node.mentions ?? []).includes(ref.id)) places.push(node.id);
      for (const plan of model.plans.values()) if (plan.entityIds.includes(ref.id)) places.push(plan.id);
      return at(places);
    }
    default:
      return null;
  }
}

/**
 * When an event may start and end, in minutes. An approximate date is a
 * range of possible moments, not a length: "some time in Year 10" is one
 * moment we cannot pin down. Its length (a duration, an end date, or none
 * yet) is added on top. Null when its start cannot be worked out.
 */
function bounds(eventId: string, model: StoryModel, context: TimeContext): { startLo: number; startHi: number; endLo: number; endHi: number } | null {
  const event = model.events.get(eventId)!;
  const start = spanOfDate(event.when, context, new Set([event.id]));
  if (!start) return null;
  if (event.ongoing) return { startLo: start.lo, startHi: start.hi, endLo: Infinity, endHi: Infinity };
  if (event.end) {
    const end = spanOfDate(event.end, context, new Set([event.id]));
    return end ? { startLo: start.lo, startHi: start.hi, endLo: Math.max(end.lo, start.lo), endHi: Math.max(end.hi, start.hi) } : { startLo: start.lo, startHi: start.hi, endLo: start.lo, endHi: Infinity };
  }
  const length = durationMinutes(event.duration, context.calendar);
  return { startLo: start.lo, startHi: start.hi, endLo: start.lo + length, endHi: start.hi + length };
}

/** Where a range given by a point begins: the start of that day, month, year or event. */
function edge(anchor: Anchor, context: TimeContext): number | null | undefined {
  if (anchor.kind === 'node') return undefined;
  const span = anchor.kind === 'event' ? spanOfEvent(anchor.eventId, context) : spanOfDate(anchor.when, context);
  return span ? span.lo : null;
}

/**
 * Whether an event happens at some moment in a range of story time: true when
 * it does whichever moment its date stands for, false when it cannot, and a
 * reason when its date is too broad to tell. The range runs from the start
 * of `from` up to the start of `until`.
 */
function inRange(eventId: string, model: StoryModel, range: Filter['time'], context: TimeContext): Verdict {
  const from = range?.from ? edge(range.from, context) : -Infinity;
  const until = range?.until ? edge(range.until, context) : Infinity;
  if (from === undefined || until === undefined) return 'the range is given in chapters, not story time';
  if (from === null) return 'the start of the range no date that can be worked out';
  if (until === null) return 'the end of the range no date that can be worked out';
  const event = bounds(eventId, model, context);
  if (!event) return 'no date that can be worked out';
  // Every possible start begins before the range ends and runs into it.
  if (event.startHi < until && event.endLo >= from) return true;
  // No possible start reaches into the range.
  if (event.startLo >= until || event.endHi < from) return false;
  return 'date too broad to tell against the range';
}

/**
 * The records that match a filter. Deterministic: the same model and
 * filter always give the same result in the same order. A record the
 * filter cannot decide about is reported in `undecided` with the reason;
 * one that definitely does not match is left out.
 */
export function select(model: StoryModel, filter: Filter): QueryResult {
  const types = filter.types?.length ? filter.types : [...ENTITY_TYPES];
  const refs = universe(model, types);
  const context = timeContext(model);
  const near = neighboursOf(model);
  const linked = (ref: EntityRef, targets: string[]) => targets.includes(ref.id) || targets.some((t) => near.get(ref.id)?.has(t));

  const tests: [keyof Filter, (ref: EntityRef) => Verdict][] = [];
  if (filter.ids?.length) tests.push(['ids', (ref) => filter.ids!.includes(ref.id)]);
  if (filter.categories?.length) tests.push(['categories', (ref) => (ref.type === 'entry' ? filter.categories!.includes(model.entries.get(ref.id)!.category) : 'no codex category')]);
  if (filter.text?.trim()) {
    const words = filter.text.trim().toLowerCase();
    tests.push(['text', (ref) => (resolveRef(model, ref) as { view: EntityView }).view.label.toLowerCase().includes(words)]);
  }
  if (filter.chapters && (filter.chapters.from || filter.chapters.to)) {
    const lo = filter.chapters.from ? model.order.position.get(filter.chapters.from) : -Infinity;
    const hi = filter.chapters.to ? model.order.position.get(filter.chapters.to) : Infinity;
    tests.push(['chapters', (ref) => {
      if (lo === undefined || hi === undefined) return 'the chapter range names a chapter that no longer exists';
      const places = readingPlaces(model, ref);
      if (places === null) return 'no place in reading order';
      if (!places.length) return ref.type === 'event' ? 'not told in any chapter' : ref.type === 'thread' ? 'no development placed in a chapter' : 'not linked to any chapter';
      return places.some((p) => p >= lo && p <= hi);
    }]);
  }
  if (filter.time && (filter.time.from || filter.time.until)) {
    tests.push(['time', (ref) => (ref.type === 'event' ? inRange(ref.id, model, filter.time, context) : 'no place in story time (only events have one)')]);
  }
  // A record is involved with a character, place, faction or thread when it is that record or has a recorded connection to it.
  for (const key of ['characters', 'locations', 'factions', 'threads'] as const) {
    const wanted = filter[key];
    if (wanted?.length) tests.push([key, (ref) => linked(ref, wanted)]);
  }
  if (filter.canon?.length) {
    tests.push(['canon', (ref) => (ref.type === 'event' ? filter.canon!.includes(model.events.get(ref.id)!.canon ?? 'canon') : 'no canon status of its own')]);
  }
  if (filter.status?.length) tests.push(['status', (ref) => (ref.type === 'event' ? filter.status!.includes(model.events.get(ref.id)!.status ?? 'confirmed') : 'no event status')]);
  if (filter.significance?.length) tests.push(['significance', (ref) => (ref.type === 'event' ? filter.significance!.includes(model.events.get(ref.id)!.importance) : 'no significance')]);

  const items: EntityView[] = [];
  const undecided = new Map<string, Undecided>();
  for (const ref of refs) {
    const verdicts = tests.map(([key, test]) => [key, test(ref)] as const);
    if (verdicts.some(([, v]) => v === false)) continue;
    const open = verdicts.filter((pair): pair is readonly [keyof Filter, string] => typeof pair[1] === 'string');
    if (!open.length) {
      items.push((resolveRef(model, ref) as { view: EntityView }).view);
      continue;
    }
    for (const [key, reason] of open) {
      const at = `${key}|${reason}`;
      (undecided.get(at) ?? undecided.set(at, { filter: key, reason, refs: [] }).get(at)!).refs.push(ref);
    }
  }
  const byOrder = (a: EntityView, b: EntityView) => ORDER[a.ref.type] - ORDER[b.ref.type] || a.label.localeCompare(b.label) || a.ref.id.localeCompare(b.ref.id);
  for (const group of undecided.values()) group.refs.sort((a, b) => ORDER[a.type] - ORDER[b.type] || a.id.localeCompare(b.id));
  return { items: items.sort(byOrder), undecided: [...undecided.values()].sort((a, b) => a.filter.localeCompare(b.filter) || a.reason.localeCompare(b.reason)), considered: refs.length };
}

/** What a view asks of connections. Fields combine with AND, values within one with OR. */
export interface ConnectionFilter {
  kinds?: ConnectionKind[];
  /** Stored connections' own kinds: `member-of`, `owns`, the author's words. */
  types?: string[];
  /** Connections with any of these records at either end. */
  involving?: string[];
  canon?: CanonStatus[];
  /** Connections that hold at some moment in this stretch of story time (from their `validity`). */
  time?: { from?: Anchor | null; until?: Anchor | null };
}

/** The connections that match, and those the filter could not decide about, with the reason. Same order every time. */
export function selectConnections(model: StoryModel, filter: ConnectionFilter): { items: Connection[]; undecided: { reason: string; connections: Connection[] }[] } {
  const context = timeContext(model);
  const range: Validity | null = filter.time && (filter.time.from || filter.time.until) ? { from: filter.time.from ?? null, until: filter.time.until ?? null } : null;
  const items: Connection[] = [];
  const undecided = new Map<string, Connection[]>();
  for (const c of deriveConnections(model).connections) {
    if (filter.kinds?.length && !filter.kinds.includes(c.kind)) continue;
    if (filter.types?.length && !filter.types.includes(c.type ?? '')) continue;
    if (filter.involving?.length && !filter.involving.some((id) => c.from.id === id || c.to.id === id)) continue;
    const reasons: string[] = [];
    if (filter.canon?.length) {
      if (c.kind !== 'link') reasons.push('no canon status of its own');
      else if (!filter.canon.includes(c.canon ?? 'canon')) continue;
    }
    if (range) {
      const holds = overlaps(c.validity ?? { from: null, until: null }, range, context);
      if (holds === false) continue;
      if (holds === 'unknown') reasons.push('when it holds cannot be compared with the range');
    }
    if (!reasons.length) items.push(c);
    else for (const reason of reasons) (undecided.get(reason) ?? undecided.set(reason, []).get(reason)!).push(c);
  }
  return { items: items.sort((a, b) => a.id.localeCompare(b.id)), undecided: [...undecided].sort(([a], [b]) => a.localeCompare(b)).map(([reason, connections]) => ({ reason, connections: connections.sort((a, b) => a.id.localeCompare(b.id)) })) };
}
