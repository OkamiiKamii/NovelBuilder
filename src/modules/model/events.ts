import type { CanonStatus } from '@/modules/canon/types';
import { STATUS_LABELS as BRANCH_LABELS, type BranchStatus } from '@/modules/branching/types';
import { dateProblem } from '@/modules/timeline/calendar';
import { formatDate, formatDuration } from '@/modules/timeline/chronology';
import type { EventDate, EventDuration, EventStatus, Importance, Precision, RevealRole, TimelineEvent } from '@/modules/timeline/types';
import type { EntityRef, StoryModel } from './types';
import { boundsOfEvent, spanOfDate, spanOfEvent, timeContext, type EventBounds } from './validity';
import { validateRecord } from './validate';

/** An event lasts no time at all, for a stretch (a duration or an end date), or has no end within the story. */
export type EventShape = 'instant' | 'span' | 'ongoing';

export const eventShape = (event: Pick<TimelineEvent, 'end' | 'ongoing' | 'duration'>): EventShape => (event.ongoing ? 'ongoing' : event.end || event.duration ? 'span' : 'instant');

/**
 * ONE EVENT, TWO ORDERS
 * What every view reads for an event: the stored `TimelineEvent`, with its
 * ids resolved and its defaults filled in. When it happens (`start`, `end`,
 * `span`: story time) and where the reader meets it (`told`: chapters and
 * scenes in reading order) are kept apart, so a flashback is early in one
 * and late in the other, and neither is ever worked out from the other.
 */
export interface EventRecord {
  id: string;
  title: string;
  description: string;
  start: EventDate;
  end: EventDate | null;
  duration: EventDuration | null;
  shape: EventShape;
  precision: Precision;
  /** As the author would read it: "Summer of Year 10", "Year 1026, October 14 — 8:30 PM to Year 1026, October 17". */
  label: string;
  /** Minutes of story time from its start to its end; `hi` is Infinity when it has no known end. Null when it cannot be dated. */
  span: { lo: number; hi: number } | null;
  /** When it starts and when it ends, each as the stretch it is known to fall in (`boundsOfEvent`). Null when it cannot be dated. */
  bounds: EventBounds | null;
  /** Why its date cannot be placed in the novel's calendar (a month the calendar does not have), or null. */
  dateProblem: string | null;
  participants: { ref: EntityRef; age: number | null }[];
  location: EntityRef | null;
  involved: EntityRef[];
  /** Where it reaches the reader, in reading order, with how (told, flashback, foreshadowed…). */
  told: { ref: EntityRef; role: RevealRole; position: number | null }[];
  threads: EntityRef[];
  after: EntityRef | null;
  significance: Importance;
  status: EventStatus;
  canon: CanonStatus;
  /** The alternate timeline the project is: its status (main canon, alternate…) as the Branches page names it. */
  branch: { status: BranchStatus; label: string };
}

/** The full record of one event, or null when there is none with that id. */
export function eventRecord(model: StoryModel, eventId: string): EventRecord | null {
  const event = model.events.get(eventId);
  if (!event) return null;
  const context = timeContext(model);
  const nameOf = (id: string) => model.events.get(id)?.name;
  const roles = new Map((event.reveals ?? []).map((r) => [r.nodeId, r.role]));
  const shape = eventShape(event);
  const calendar = model.calendar;
  const start = formatDate(event.when, nameOf, calendar);
  const ends = event.end?.precision === 'unknown' ? `${start}, end not known` : event.end ? `${start} to ${formatDate(event.end, nameOf, calendar)}` : null;
  const label = shape === 'ongoing' ? `${start}, still going on` : (ends ?? (event.duration ? `${start}, for ${formatDuration(event.duration)}` : start));
  const told = event.nodeIds.map((nodeId) => ({ ref: { type: 'node' as const, id: nodeId }, role: roles.get(nodeId) ?? ('told' as const), position: model.order.position.get(nodeId) ?? null }));
  const status: BranchStatus = model.timeline?.status ?? 'main';
  return {
    id: event.id,
    title: event.name,
    description: event.description,
    start: event.when,
    end: event.end ?? null,
    duration: event.duration,
    shape,
    precision: event.when.precision,
    label,
    span: spanOfEvent(event.id, context),
    bounds: boundsOfEvent(event.id, context),
    dateProblem: dateProblem(event.when, calendar) ?? (event.end ? dateProblem(event.end, calendar) : null),
    participants: event.characters.map((c) => ({ ref: { type: 'entry', id: c.id }, age: c.age })),
    location: event.locationId ? { type: 'entry', id: event.locationId } : null,
    involved: event.entryIds.map((id) => ({ type: 'entry', id })),
    // Chapters that no longer exist go last; the event's own date plays no part in this order.
    told: told.sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity)),
    threads: (event.threadIds ?? []).map((id) => ({ type: 'thread', id })),
    after: event.afterId ? { type: 'event', id: event.afterId } : null,
    significance: event.importance,
    status: event.status ?? 'confirmed',
    canon: event.canon ?? 'canon',
    branch: { status, label: BRANCH_LABELS[status] },
  };
}

export const eventRecords = (model: StoryModel): EventRecord[] => [...model.events.keys()].map((id) => eventRecord(model, id)!);

/**
 * What is wrong with an event, in words: its required fields, and anything
 * that contradicts itself (an end before the start, two ways of saying how
 * long it lasts, a reveal in a chapter it is not told in, links to records
 * that are gone). Nothing is changed; the author decides.
 */
export function validateEvent(model: StoryModel, event: TimelineEvent): string[] {
  const problems = validateRecord('event', event);
  if (problems.length) return problems;
  const context = timeContext(model);
  const ways = [event.end ? 'an end date' : '', event.duration ? 'a duration' : '', event.ongoing ? '“still going on”' : ''].filter(Boolean);
  if (ways.length > 1) problems.push(`its length is given more than one way: ${ways.join(' and ')}`);
  if (event.end) {
    const start = spanOfDate(event.when, context, new Set([event.id]));
    const end = spanOfDate(event.end, context, new Set([event.id]));
    if (start && end && end.hi < start.lo) problems.push('it ends before it starts');
  }
  const told = new Set(event.nodeIds ?? []);
  for (const reveal of event.reveals ?? []) if (!told.has(reveal.nodeId)) problems.push(`it is marked as ${reveal.role} in a chapter it is not told in`);
  const gone = (what: string, ids: string[], exists: (id: string) => boolean) => ids.filter((id) => !exists(id)).forEach((id) => problems.push(`${what} ${id} no longer exists`));
  gone('the character', (event.characters ?? []).map((c) => c.id), (id) => model.entries.has(id));
  gone('the place', event.locationId ? [event.locationId] : [], (id) => model.entries.has(id));
  gone('the entry', event.entryIds ?? [], (id) => model.entries.has(id));
  gone('the chapter', event.nodeIds ?? [], (id) => model.nodes.has(id));
  gone('the plot thread', event.threadIds ?? [], (id) => model.threads.has(id));
  gone('the event it follows,', event.afterId ? [event.afterId] : [], (id) => model.events.has(id));
  return problems;
}
