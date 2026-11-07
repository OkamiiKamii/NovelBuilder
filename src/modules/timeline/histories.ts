import { STATUS_LABELS as CANON_LABELS, type BranchStatus } from '@/modules/branching/types';
import type { StoryModel } from '@/modules/model/types';
import { STANDARD_CALENDAR, type Calendar } from './calendar';
import { formatDate, resolveChronology } from './chronology';
import type { TimelineEvent } from './types';

/**
 * ALTERNATE HISTORIES
 * Another course of events for the same novel: an alternate history, a
 * what-if, a changed future, a time-travel branch. A history is never a copy
 * of the timeline. It holds only what is different from the timeline it
 * branches from (its base, the main timeline or another history):
 *  - `changed`: base events that go differently, with only the fields that
 *    differ;
 *  - `removed`: base events that do not happen in it;
 *  - `added`: events that happen only in it, kept inside the history, never
 *    in the main timeline's records.
 * Every other event is the base's own record, read through, so a change to
 * it in the base shows in the history too.
 *
 * The main timeline is the novel's canon and is never touched by a history.
 * Nothing here merges a history into it, or changes a history's canon
 * status, on its own: the author does both by hand, if ever.
 */
export const HISTORY_KINDS = ['alternate', 'hypothetical', 'changed-future', 'time-travel'] as const;
export type HistoryKind = (typeof HISTORY_KINDS)[number];
export const HISTORY_KIND_LABELS: Record<HistoryKind, string> = { alternate: 'Alternate history', hypothetical: 'What if', 'changed-future': 'Changed future', 'time-travel': 'Time-travel branch' };

/** A history's canon status: the words the Story branches page uses, without "Main Canon", which only the main timeline is. */
export const HISTORY_STATUSES = ['alternate', 'non-canon', 'experimental', 'abandoned'] as const satisfies readonly BranchStatus[];
export type HistoryStatus = (typeof HISTORY_STATUSES)[number];
export const HISTORY_STATUS_LABELS: Record<HistoryStatus, string> = { alternate: CANON_LABELS.alternate, 'non-canon': CANON_LABELS['non-canon'], experimental: CANON_LABELS.experimental, abandoned: CANON_LABELS.abandoned };
export const MAIN_TIMELINE = 'The main timeline';

/** The fields of an event a history can have differently. */
export const CHANGEABLE = ['name', 'description', 'when', 'end', 'duration', 'ongoing', 'importance', 'locationId', 'characters', 'entryIds', 'afterId'] as const;
export type EventChange = Partial<Pick<TimelineEvent, (typeof CHANGEABLE)[number]>>;
export const FIELD_WORDS: Record<(typeof CHANGEABLE)[number], string> = { name: 'name', description: 'description', when: 'date', end: 'end', duration: 'length', ongoing: 'still going on', importance: 'importance', locationId: 'place', characters: 'who takes part', entryIds: 'what is involved', afterId: 'what it follows' };

export interface AlternateHistory {
  id: string;
  projectId: string;
  name: string;
  /** What it branches from: null for the main timeline, or another history's id. */
  baseId: string | null;
  kind: HistoryKind;
  status: HistoryStatus;
  /** Where it departs from its base: from this event on. Null: across the whole timeline. */
  originEventId: string | null;
  /** For a time-travel branch: the event that causes it, often later in story time than where it lands. */
  causeEventId: string | null;
  note: string;
  /** Base events that go differently here, by id: only the fields that differ. */
  changed: Record<string, EventChange>;
  /** Base events that do not happen here. */
  removed: string[];
  /** Events that happen only here. */
  added: TimelineEvent[];
  createdAt: number;
  updatedAt: number;
}

/** The ids of a history and every history it is based on, nearest first; stops at a loop or a missing base. */
export function lineage(histories: ReadonlyMap<string, AlternateHistory>, id: string): AlternateHistory[] {
  const chain: AlternateHistory[] = [];
  for (let at: string | null = id; at && histories.has(at) && !chain.some((h) => h.id === at); at = histories.get(at)!.baseId) chain.push(histories.get(at)!);
  return chain;
}

/**
 * The events of a history: its base's events, with its own differences. A
 * change to an event its base no longer has is left out (and reported by
 * `staleChanges`). The base's records are read, never altered.
 */
export function historyEvents(main: ReadonlyMap<string, TimelineEvent>, histories: ReadonlyMap<string, AlternateHistory>, id: string | null): Map<string, TimelineEvent> {
  const events = new Map(main);
  if (!id) return events;
  for (const history of lineage(histories, id).reverse()) {
    for (const eventId of history.removed) events.delete(eventId);
    for (const [eventId, change] of Object.entries(history.changed)) {
      const event = events.get(eventId);
      if (event) events.set(eventId, { ...event, ...change });
    }
    for (const event of history.added) events.set(event.id, event);
  }
  return events;
}

/** The story model as a history has it: everything else in the novel is the same records. */
export const withHistory = (model: StoryModel, histories: ReadonlyMap<string, AlternateHistory>, id: string | null): StoryModel => (id ? { ...model, events: historyEvents(model.events, histories, id) } : model);

/** Changes and removals in a history that point at events its base no longer has. */
export function staleChanges(main: ReadonlyMap<string, TimelineEvent>, histories: ReadonlyMap<string, AlternateHistory>, history: AlternateHistory): string[] {
  const base = historyEvents(main, histories, history.baseId);
  return [...new Set([...Object.keys(history.changed), ...history.removed])].filter((id) => !base.has(id));
}

export type Difference = 'same' | 'changed' | 'moved' | 'only-a' | 'only-b';

export interface EventDifference {
  id: string;
  difference: Difference;
  /** The fields that differ, in words ("date", "place"), for a changed event. */
  fields: string[];
  a: TimelineEvent | null;
  b: TimelineEvent | null;
  /** Each side's date in words, and where it falls in story time. */
  whenA: string | null;
  whenB: string | null;
  /** For a moved event: later or earlier in B than in A. */
  direction: 'earlier' | 'later' | null;
}

/** A field as compared: rows written before a field existed lack it, and read as its default (not going on, no end). */
export const fieldValue = (event: Partial<TimelineEvent>, field: (typeof CHANGEABLE)[number]): unknown => (field === 'ongoing' ? event.ongoing === true : (event[field] ?? null));
const same = (a: TimelineEvent, b: TimelineEvent, field: (typeof CHANGEABLE)[number]) => JSON.stringify(fieldValue(a, field)) === JSON.stringify(fieldValue(b, field));

/**
 * Two timelines side by side, event by event: the same, changed (and which
 * fields), moved (unchanged itself, but its date depends on one that
 * changed), or found in only one of them. Reads only: comparing changes
 * nothing and merges nothing.
 */
export function compareTimelines(a: ReadonlyMap<string, TimelineEvent>, b: ReadonlyMap<string, TimelineEvent>, calendar: Calendar = STANDARD_CALENDAR): EventDifference[] {
  const placedA = new Map(resolveChronology([...a.values()], calendar).map((p, i) => [p.event.id, { ...p, i }]));
  const placedB = new Map(resolveChronology([...b.values()], calendar).map((p, i) => [p.event.id, { ...p, i }]));
  const ids = [...new Set([...a.keys(), ...b.keys()])];
  const nameOfA = (id: string) => a.get(id)?.name;
  const nameOfB = (id: string) => b.get(id)?.name;
  const out = ids.map((id): EventDifference & { order: number } => {
    const [ea, eb] = [a.get(id) ?? null, b.get(id) ?? null];
    const [pa, pb] = [placedA.get(id), placedB.get(id)];
    const whenA = ea ? formatDate(ea.when, nameOfA, calendar) : null;
    const whenB = eb ? formatDate(eb.when, nameOfB, calendar) : null;
    // In the first timeline's story time; what only the second has, by its own date there.
    const order = pa?.value ?? pb?.value ?? Infinity;
    if (!ea || !eb) return { id, difference: ea ? 'only-a' : 'only-b', fields: [], a: ea, b: eb, whenA, whenB, direction: null, order };
    const fields = CHANGEABLE.filter((f) => !same(ea, eb, f)).map((f) => FIELD_WORDS[f]);
    if (fields.length) return { id, difference: 'changed', fields, a: ea, b: eb, whenA, whenB, direction: null, order };
    const [va, vb] = [pa?.value ?? null, pb?.value ?? null];
    if (va !== vb) return { id, difference: 'moved', fields: [], a: ea, b: eb, whenA: pa?.label ?? whenA, whenB: pb?.label ?? whenB, direction: va === null || vb === null ? null : vb < va ? 'earlier' : 'later', order };
    return { id, difference: 'same', fields: [], a: ea, b: eb, whenA, whenB, direction: null, order };
  });
  const index = (d: EventDifference) => placedA.get(d.id)?.i ?? placedB.get(d.id)?.i ?? Infinity;
  return out.sort((x, y) => x.order - y.order || index(x) - index(y) || (x.a ?? x.b)!.name.localeCompare((y.a ?? y.b)!.name)).map(({ order: _order, ...d }) => d);
}

/** A comparison in one sentence. */
export function comparisonSummary(diffs: EventDifference[], nameA: string, nameB: string): string {
  const count = (d: Difference) => diffs.filter((x) => x.difference === d).length;
  const differ = diffs.filter((d) => d.difference !== 'same').length;
  if (!differ) return `${nameA} and ${nameB} have the same events.`;
  const parts = [
    count('changed') ? `${count('changed')} changed` : '',
    count('moved') ? `${count('moved')} moved by a change they depend on` : '',
    count('only-b') ? `${count('only-b')} only in ${nameB}` : '',
    count('only-a') ? `${count('only-a')} only in ${nameA}` : '',
  ].filter(Boolean);
  return `${differ} ${differ === 1 ? 'event differs' : 'events differ'}: ${parts.join(', ')}.`;
}

/** Where a history departs from its base, in words. */
export function originWords(history: AlternateHistory, base: ReadonlyMap<string, TimelineEvent>, histories: ReadonlyMap<string, AlternateHistory>, calendar: Calendar = STANDARD_CALENDAR): string {
  const from = history.baseId ? `“${histories.get(history.baseId)?.name ?? 'a history since deleted'}”` : MAIN_TIMELINE.toLowerCase();
  const event = history.originEventId ? base.get(history.originEventId) : null;
  const at = history.originEventId ? (event ? ` at “${event.name}” (${formatDate(event.when, (id) => base.get(id)?.name, calendar)})` : ' at an event since deleted') : ', across the whole timeline';
  return `Branches from ${from}${at}.`;
}
