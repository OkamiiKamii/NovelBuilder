// ALTERNATE HISTORIES. A port of flutter_app/lib/shared/domain/timeline/histories.dart.
//
// Another course of events for the same novel: an alternate history, a what-if, a changed future, a time-travel
// branch. A history is never a copy of the timeline. It holds only what is different from the timeline it branches
// from (its base: the main timeline or another history):
//  - `changed`: base events that go differently, with only the fields that differ;
//  - `removed`: base events that do not happen in it;
//  - `added`: events that happen only in it, kept inside the history, never in the main timeline's records.
// Every other event is the base's own record, read through, so a change to it in the base shows in the history too.
//
// The main timeline is the novel's canon and is never touched by a history.

import { localeCompare } from '../collation';
import { type JsonMap, idOrNull, mapOrNull, numOrNull, str } from '../json';
import { compareNum } from '../manuscript/dartSort';
import type { StoryModel } from '../model/storyModel';
import { stableSorted } from '../reader/stableSort';
import { type BranchStatus, branchStatusLabel } from '../records/branch';
import { Calendar } from '../records/calendar';
import { TimelineEvent } from '../records/event';
import { JsonRecord, maps, strings } from '../records/jsonRecord';
import { resolveChronology } from './chronology';
import { formatDate } from './dates';

export type HistoryKind = 'alternate' | 'hypothetical' | 'changed-future' | 'time-travel';
export const historyKinds: readonly HistoryKind[] = ['alternate', 'hypothetical', 'changed-future', 'time-travel'];
export const historyKindLabel: Readonly<Record<HistoryKind, string>> = {
  alternate: 'Alternate history',
  hypothetical: 'What if',
  'changed-future': 'Changed future',
  'time-travel': 'Time-travel branch',
};

export function historyKindOf(value: unknown): HistoryKind | null {
  return historyKinds.find((k) => k === value) ?? null;
}

/** A history's canon status: the words the story branches use, without "Main Canon", which only the main timeline is. */
export const historyStatuses: readonly BranchStatus[] = ['alternate', 'non-canon', 'experimental', 'abandoned'];

export function historyStatusOf(value: unknown): BranchStatus | null {
  return historyStatuses.find((s) => s === value) ?? null;
}

export const historyStatusLabel = (s: BranchStatus): string => branchStatusLabel[s];

export const mainTimeline = 'The main timeline';

/** The fields of an event a history can have differently, and how each is said. */
export const changeableFields: ReadonlyMap<string, string> = new Map([
  ['name', 'name'],
  ['description', 'description'],
  ['when', 'date'],
  ['end', 'end'],
  ['duration', 'length'],
  ['ongoing', 'still going on'],
  ['importance', 'importance'],
  ['locationId', 'place'],
  ['characters', 'who takes part'],
  ['entryIds', 'what is involved'],
  ['afterId', 'what it follows'],
]);

export class AlternateHistory extends JsonRecord {
  get name(): string {
    return str(this.raw['name']);
  }
  /** What it branches from: null for the main timeline, or another history's id. */
  get baseId(): string | null {
    return idOrNull(this.raw['baseId']);
  }
  get kind(): HistoryKind {
    return historyKindOf(this.raw['kind']) ?? 'hypothetical';
  }
  get status(): BranchStatus {
    return historyStatusOf(this.raw['status']) ?? 'experimental';
  }
  /** Where it departs from its base: from this event on. Null: across the whole timeline. */
  get originEventId(): string | null {
    return idOrNull(this.raw['originEventId']);
  }
  /** For a time-travel branch: the event that causes it, often later in story time than where it lands. */
  get causeEventId(): string | null {
    return idOrNull(this.raw['causeEventId']);
  }
  get note(): string {
    return str(this.raw['note']);
  }
  /** Base events that go differently here, by id: only the fields that differ. */
  get changed(): Map<string, JsonMap> {
    const out = new Map<string, JsonMap>();
    const raw = mapOrNull(this.raw['changed']) ?? {};
    for (const key of Object.keys(raw)) {
      const m = mapOrNull(raw[key]);
      if (m !== null) out.set(key, m);
    }
    return out;
  }
  /** Base events that do not happen here. */
  get removed(): string[] {
    return strings(this.raw['removed']);
  }
  /** Events that happen only here. */
  get added(): TimelineEvent[] {
    return maps(this.raw['added']).map((e) => new TimelineEvent(e));
  }
  get createdAt(): number {
    return numOrNull(this.raw['createdAt']) ?? 0;
  }
}

/** A history and every history it is based on, nearest first; stops at a loop or a missing base. */
export function lineage(histories: ReadonlyMap<string, AlternateHistory>, id: string): AlternateHistory[] {
  const chain: AlternateHistory[] = [];
  // Counted: each step adds a new history, so it can take no more steps than there are histories.
  for (let at: string | null = id, n = 0; at !== null && n <= histories.size; n++) {
    const here: string = at;
    if (!histories.has(here) || chain.some((h) => h.id === here)) break;
    chain.push(histories.get(here)!);
    at = histories.get(here)!.baseId;
  }
  return chain;
}

/** The events of a history: its base's events, with its own differences. A change to an event its base no longer has
 * is left out (and reported by `staleChanges`). The base's records are read, never altered. */
export function historyEvents(
  main: ReadonlyMap<string, TimelineEvent>,
  histories: ReadonlyMap<string, AlternateHistory>,
  id: string | null,
): Map<string, TimelineEvent> {
  const events = new Map(main);
  if (id === null) return events;
  for (const history of lineage(histories, id).reverse()) {
    for (const eventId of history.removed) events.delete(eventId);
    for (const [eventId, change] of history.changed) {
      const event = events.get(eventId);
      if (event !== undefined) events.set(eventId, event.withFields(change));
    }
    for (const event of history.added) events.set(event.id, event);
  }
  return events;
}

/** The story model as a history has it: everything else in the novel is the same records. */
export function withHistory(
  model: StoryModel,
  histories: ReadonlyMap<string, AlternateHistory>,
  id: string | null,
): StoryModel {
  return id === null ? model : model.withEvents(historyEvents(model.events, histories, id));
}

/** Changes and removals in a history that point at events its base no longer has. */
export function staleChanges(
  main: ReadonlyMap<string, TimelineEvent>,
  histories: ReadonlyMap<string, AlternateHistory>,
  history: AlternateHistory,
): string[] {
  const base = historyEvents(main, histories, history.baseId);
  return [...new Set([...history.changed.keys(), ...history.removed])].filter((id) => !base.has(id));
}

export type Difference = 'same' | 'changed' | 'moved' | 'only-a' | 'only-b';

export class EventDifference {
  constructor(
    readonly id: string,
    readonly difference: Difference,
    /** The fields that differ, in words ("date", "place"), for a changed event. */
    readonly fields: readonly string[],
    readonly a: TimelineEvent | null,
    readonly b: TimelineEvent | null,
    readonly whenA: string | null,
    readonly whenB: string | null,
    /** For a moved event: `earlier` or `later` in B than in A. */
    readonly direction: string | null,
  ) {}
}

/** A field as compared: rows written before a field existed lack it, and read as its default. */
export function fieldValue(event: JsonMap, field: string): unknown {
  return field === 'ongoing' ? event['ongoing'] === true : (event[field] ?? null);
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value === 'object' && value !== null) {
    const m = value as JsonMap;
    const out: JsonMap = {};
    for (const k of Object.keys(m).sort()) out[k] = sortKeys(m[k]);
    return out;
  }
  return value === undefined ? null : value;
}

const canonical = (value: unknown): string => JSON.stringify(sortKeys(value));
const same = (a: TimelineEvent, b: TimelineEvent, field: string) =>
  canonical(fieldValue(a.raw, field)) === canonical(fieldValue(b.raw, field));

/** Two timelines side by side, event by event: the same, changed (and which fields), moved (unchanged itself, but its
 * date depends on one that changed), or found in only one of them. Reads only: comparing changes and merges nothing. */
export function compareTimelines(
  a: ReadonlyMap<string, TimelineEvent>,
  b: ReadonlyMap<string, TimelineEvent>,
  calendar?: Calendar | null,
): EventDifference[] {
  const c = calendar ?? Calendar.standardCalendar;
  const placedA = new Map(resolveChronology(a.values(), c).map((p, i) => [p.event.id, { p, i }]));
  const placedB = new Map(resolveChronology(b.values(), c).map((p, i) => [p.event.id, { p, i }]));
  const ids = new Set([...a.keys(), ...b.keys()]);
  const out: [EventDifference, number][] = [];
  for (const id of ids) {
    const ea = a.get(id) ?? null;
    const eb = b.get(id) ?? null;
    const pa = placedA.get(id);
    const pb = placedB.get(id);
    const whenA = ea === null ? null : formatDate(ea.when, (x) => a.get(x)?.name ?? null, c);
    const whenB = eb === null ? null : formatDate(eb.when, (x) => b.get(x)?.name ?? null, c);
    // In the first timeline's story time; what only the second has, by its own date there.
    const order = pa?.p.value ?? pb?.p.value ?? Infinity;
    if (ea === null || eb === null) {
      out.push([new EventDifference(id, ea !== null ? 'only-a' : 'only-b', [], ea, eb, whenA, whenB, null), order]);
      continue;
    }
    const fields = [...changeableFields].filter(([f]) => !same(ea, eb, f)).map(([, words]) => words);
    if (fields.length > 0) {
      out.push([new EventDifference(id, 'changed', fields, ea, eb, whenA, whenB, null), order]);
      continue;
    }
    const va = pa?.p.value ?? null;
    const vb = pb?.p.value ?? null;
    if (va !== vb) {
      out.push([
        new EventDifference(
          id,
          'moved',
          [],
          ea,
          eb,
          pa?.p.label ?? whenA,
          pb?.p.label ?? whenB,
          va === null || vb === null ? null : vb < va ? 'earlier' : 'later',
        ),
        order,
      ]);
      continue;
    }
    out.push([new EventDifference(id, 'same', [], ea, eb, whenA, whenB, null), order]);
  }
  const index = (d: EventDifference) => placedA.get(d.id)?.i ?? placedB.get(d.id)?.i ?? Infinity;
  return stableSorted(out, (x, y) => {
    const byOrder = compareNum(x[1], y[1]);
    if (byOrder !== 0 && !(!Number.isFinite(x[1]) && !Number.isFinite(y[1]))) return byOrder;
    const ix = index(x[0]);
    const iy = index(y[0]);
    const byIndex = compareNum(ix, iy);
    if (byIndex !== 0 && !(!Number.isFinite(ix) && !Number.isFinite(iy))) return byIndex;
    return localeCompare((x[0].a ?? x[0].b)!.name, (y[0].a ?? y[0].b)!.name);
  }).map(([d]) => d);
}

/** A comparison in one sentence. */
export function comparisonSummary(diffs: readonly EventDifference[], nameA: string, nameB: string): string {
  const count = (d: Difference) => diffs.filter((x) => x.difference === d).length;
  const differ = diffs.filter((d) => d.difference !== 'same').length;
  if (differ === 0) return `${nameA} and ${nameB} have the same events.`;
  const parts = [
    ...(count('changed') > 0 ? [`${count('changed')} changed`] : []),
    ...(count('moved') > 0 ? [`${count('moved')} moved by a change they depend on`] : []),
    ...(count('only-b') > 0 ? [`${count('only-b')} only in ${nameB}`] : []),
    ...(count('only-a') > 0 ? [`${count('only-a')} only in ${nameA}`] : []),
  ];
  return `${differ} ${differ === 1 ? 'event differs' : 'events differ'}: ${parts.join(', ')}.`;
}

/** Where a history departs from its base, in words. */
export function originWords(
  history: AlternateHistory,
  base: ReadonlyMap<string, TimelineEvent>,
  histories: ReadonlyMap<string, AlternateHistory>,
  calendar?: Calendar | null,
): string {
  const from =
    history.baseId !== null
      ? `“${histories.get(history.baseId)?.name ?? 'a history since deleted'}”`
      : mainTimeline.toLowerCase();
  const origin = history.originEventId;
  const event = origin === null ? null : (base.get(origin) ?? null);
  const at =
    origin === null
      ? ', across the whole timeline'
      : event !== null
        ? ` at “${event.name}” (${formatDate(event.when, (id) => base.get(id)?.name ?? null, calendar)})`
        : ' at an event since deleted';
  return `Branches from ${from}${at}.`;
}
