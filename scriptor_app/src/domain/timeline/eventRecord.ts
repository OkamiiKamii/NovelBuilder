// ONE EVENT, TWO ORDERS: what every view reads for an event, with its defaults filled in. A port of
// flutter_app/lib/shared/domain/timeline/event_record.dart.
//
// When it happens (`start`, `bounds`, `span`: story time) and where the reader meets it (`told`, chapters and scenes in
// reading order) are kept apart, so a flashback is early in one and late in the other, and neither is ever worked out
// from the other. Plan's plot views read events through here too.

import type { StoryModel } from '../model/storyModel';
import { validateRecord } from '../model/validate';
import { type EventBounds, boundsOfEvent, spanOfDate, spanOfEvent } from '../model/validity';
import { compareNum } from '../manuscript/dartSort';
import { stableSorted } from '../reader/stableSort';
import type { Span } from '../records/calendar';
import { type EventDate, type RevealRole, type TimelineEvent, UnknownDate } from '../records/event';
import { formatDate, formatDuration } from './dates';

/** An event lasts no time at all, for a stretch (a duration or an end date), or has no end within the story. */
export type EventShape = 'instant' | 'span' | 'ongoing';
export const eventShapes: readonly EventShape[] = ['instant', 'span', 'ongoing'];

export function eventShape(e: TimelineEvent): EventShape {
  if (e.ongoing) return 'ongoing';
  return (e.raw['end'] !== null && e.raw['end'] !== undefined) || e.duration !== null ? 'span' : 'instant';
}

/** Where an event reaches the reader: a chapter or scene, how it tells it, and its place in reading order. */
export type Telling = { nodeId: string; role: RevealRole; position: number | null };

export class EventRecord {
  readonly event: TimelineEvent;
  readonly shape: EventShape;
  /** As the author would read it: "Summer of Year 10", "Year 1026, October 14 — 8:30 PM to Year 1026, October 17". */
  readonly label: string;
  /** From its start to its end in minutes of story time; `hi` is Infinity with no known end. Null when undated. */
  readonly span: Span | null;
  /** When it starts and ends, each as the stretch it is known to fall in. Null when it cannot be dated. */
  readonly bounds: EventBounds | null;
  /** Why its date cannot be placed in the novel's calendar (a month the calendar does not have), or null. */
  readonly dateProblem: string | null;
  /** Where it reaches the reader, in reading order; chapters that no longer exist go last. */
  readonly told: readonly Telling[];

  constructor(args: {
    event: TimelineEvent;
    shape: EventShape;
    label: string;
    span: Span | null;
    bounds: EventBounds | null;
    dateProblem: string | null;
    told: readonly Telling[];
  }) {
    this.event = args.event;
    this.shape = args.shape;
    this.label = args.label;
    this.span = args.span;
    this.bounds = args.bounds;
    this.dateProblem = args.dateProblem;
    this.told = args.told;
  }

  get id(): string {
    return this.event.id;
  }
  get title(): string {
    return this.event.name;
  }
  get start(): EventDate | null {
    return this.event.when;
  }
  get precision(): string {
    return this.event.when?.precision ?? 'unknown';
  }
}

const hasEnd = (e: TimelineEvent): boolean => e.raw['end'] !== null && e.raw['end'] !== undefined;

/** The full record of one event, or null when there is none with that id. */
export function eventRecord(model: StoryModel, eventId: string): EventRecord | null {
  const event = model.events.get(eventId);
  if (event === undefined) return null;
  const context = model.timeContext;
  const calendar = model.calendar;
  const nameOf = (id: string) => model.events.get(id)?.name ?? null;
  const shape = eventShape(event);
  const start = formatDate(event.when, nameOf, calendar);
  const end = event.end;
  const ends = !hasEnd(event)
    ? null
    : end instanceof UnknownDate
      ? `${start}, end not known`
      : `${start} to ${formatDate(end, nameOf, calendar)}`;
  const label =
    shape === 'ongoing'
      ? `${start}, still going on`
      : (ends ?? (event.duration !== null ? `${start}, for ${formatDuration(event.duration)}` : start));
  const roles = event.reveals;
  const told = stableSorted(
    event.nodeIds.map((nodeId): Telling => ({
      nodeId,
      role: roles.get(nodeId) ?? 'told',
      position: model.order.position.get(nodeId) ?? null,
    })),
    (a, b) => compareNum(a.position ?? Infinity, b.position ?? Infinity),
  );
  const when = event.when;
  return new EventRecord({
    event,
    shape,
    label,
    span: spanOfEvent(eventId, context),
    bounds: boundsOfEvent(eventId, context),
    dateProblem: (when === null ? null : calendar.dateProblem(when)) ?? (end === null ? null : calendar.dateProblem(end)),
    told,
  });
}

export function eventRecords(model: StoryModel): EventRecord[] {
  return [...model.events.keys()].map((id) => eventRecord(model, id)!);
}

/** What is wrong with an event, in words: its required fields, and anything that contradicts itself (an end before
 * the start, two ways of saying how long it lasts, a reveal in a chapter it is not told in, links to records that
 * are gone). Nothing is changed; the author decides. */
export function validateEvent(model: StoryModel, event: TimelineEvent): string[] {
  const problems = validateRecord('event', event.raw);
  if (problems.length > 0) return problems;
  const context = model.timeContext;
  const ways = [
    ...(hasEnd(event) ? ['an end date'] : []),
    ...(event.duration !== null ? ['a duration'] : []),
    ...(event.ongoing ? ['“still going on”'] : []),
  ];
  if (ways.length > 1) problems.push(`its length is given more than one way: ${ways.join(' and ')}`);
  if (hasEnd(event)) {
    const start = spanOfDate(event.when, context, new Set([event.id]));
    const end = spanOfDate(event.end, context, new Set([event.id]));
    if (start !== null && end !== null && end.hi < start.lo) problems.push('it ends before it starts');
  }
  const told = new Set(event.nodeIds);
  for (const [nodeId, role] of event.reveals) {
    if (!told.has(nodeId)) problems.push(`it is marked as ${role} in a chapter it is not told in`);
  }
  const gone = (what: string, ids: Iterable<string>, exists: (id: string) => boolean) => {
    for (const id of ids) if (!exists(id)) problems.push(`${what} ${id} no longer exists`);
  };
  gone(
    'the character',
    event.characters.map((c) => c.id),
    (id) => model.entries.has(id),
  );
  gone('the place', event.locationId === null ? [] : [event.locationId], (id) => model.entries.has(id));
  gone('the entry', event.entryIds, (id) => model.entries.has(id));
  gone('the chapter', event.nodeIds, (id) => model.nodes.has(id));
  gone('the plot thread', event.threadIds, (id) => model.threads.has(id));
  gone('the event it follows,', event.afterId === null ? [] : [event.afterId], (id) => model.events.has(id));
  return problems;
}
