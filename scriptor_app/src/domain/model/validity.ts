// Points in the story and when things hold. A port of flutter_app/lib/shared/domain/model/validity.dart.
//
// A point is a chapter or scene ("from chapter 12 on", in READING order), a timeline event ("from the Siege on", in
// STORY time) or a date in story time. Reading order and story time are different axes (a flashback is read late and
// happened early), so a point on one is never compared with a point on the other: the answer is "unknown", not a
// guess.

import { type JsonMap, idOrNull, jsonEquals, mapOrNull } from '../json';
import { compareNum, dartSort } from '../manuscript/dartSort';
import { Calendar, Span } from '../records/calendar';
import { ApproximateDate, EventDate, ExactDate, RelativeDate, type TimelineEvent } from '../records/event';
import { freezeMap } from '../records/jsonRecord';

/** A point in the story. Dart's sealed class: one of NodeAnchor, EventAnchor, DateAnchor. */
export abstract class Anchor {
  abstract readonly kind: 'node' | 'event' | 'date';

  /** The anchor as stored, kept whole so nothing in it is lost. */
  readonly raw: JsonMap;

  protected constructor(raw: JsonMap) {
    this.raw = raw;
  }

  static fromJson(json: unknown): Anchor | null {
    const m = mapOrNull(json);
    if (m === null) return null;
    const frozen = freezeMap(m);
    switch (m['kind']) {
      case 'node': {
        const id = idOrNull(m['nodeId']);
        return id === null ? null : new NodeAnchor(id, frozen);
      }
      case 'event': {
        const id = idOrNull(m['eventId']);
        return id === null ? null : new EventAnchor(id, frozen);
      }
      case 'date':
        return new DateAnchor(EventDate.fromJson(m['when']), frozen);
    }
    return null;
  }

  static node(nodeId: string): NodeAnchor {
    return new NodeAnchor(nodeId, freezeMap({ kind: 'node', nodeId }));
  }

  static event(eventId: string): EventAnchor {
    return new EventAnchor(eventId, freezeMap({ kind: 'event', eventId }));
  }

  static date(when: JsonMap): DateAnchor {
    return new DateAnchor(EventDate.fromJson(when), freezeMap({ kind: 'date', when }));
  }

  equals(other: unknown): boolean {
    return other instanceof Anchor && jsonEquals(other.raw, this.raw);
  }
}

export class NodeAnchor extends Anchor {
  readonly kind = 'node' as const;
  /** @internal Made by Anchor.fromJson and Anchor.node. */
  constructor(
    readonly nodeId: string,
    raw: JsonMap,
  ) {
    super(raw);
  }
}

export class EventAnchor extends Anchor {
  readonly kind = 'event' as const;
  /** @internal Made by Anchor.fromJson and Anchor.event. */
  constructor(
    readonly eventId: string,
    raw: JsonMap,
  ) {
    super(raw);
  }
}

export class DateAnchor extends Anchor {
  readonly kind = 'date' as const;
  /** @internal Made by Anchor.fromJson and Anchor.date. */
  constructor(
    /** Null when the stored date cannot be read: it is then never placed. */
    readonly when: EventDate | null,
    raw: JsonMap,
  ) {
    super(raw);
  }
}

/** When something holds: from a point (included) until another (not included). `from: null` holds from the start;
 * `until: null` still holds. An unknown date is different: the change happened, but when is not known. */
export class Validity {
  constructor(
    readonly from: Anchor | null,
    readonly until: Anchor | null,
  ) {}

  static readonly always = new Validity(null, null);

  static fromJson(json: unknown): Validity | null {
    const m = mapOrNull(json);
    return m === null ? null : new Validity(Anchor.fromJson(m['from']), Anchor.fromJson(m['until']));
  }
}

/** A three-way answer: only yes or no when the recorded data settles it. */
export type Truth = 'yes' | 'no' | 'unknown';

export function truthOf(value: boolean): Truth {
  return value ? 'yes' : 'no';
}

/** The JSON the original app used: true, false or "unknown". */
export function truthToJson(t: Truth): boolean | 'unknown' {
  return t === 'yes' ? true : t === 'no' ? false : 'unknown';
}

function both(a: Truth, b: Truth): Truth {
  return a === 'no' || b === 'no' ? 'no' : a === 'yes' && b === 'yes' ? 'yes' : 'unknown';
}

/** What points are compared against: where nodes are in reading order, the events dates can lean on, and the
 * calendar. */
export class TimeContext {
  readonly position: ReadonlyMap<string, number>;
  readonly events: ReadonlyMap<string, TimelineEvent>;
  readonly calendar: Calendar;

  constructor(args: {
    position: ReadonlyMap<string, number>;
    events: ReadonlyMap<string, TimelineEvent>;
    calendar?: Calendar | null;
  }) {
    this.position = args.position;
    this.events = args.events;
    this.calendar = args.calendar ?? Calendar.standardCalendar;
  }
}

/** How much story time a date covers: a day for a day, a year for "Year 10". Null when it cannot be placed. */
export function spanOfDate(
  when: EventDate | null,
  context: TimeContext,
  trail: ReadonlySet<string> = new Set(),
): Span | null {
  if (when instanceof ExactDate || when instanceof ApproximateDate) return context.calendar.spanOf(when);
  if (when instanceof RelativeDate) {
    const { anchorId, amount, unit, before } = when;
    if (anchorId === null || trail.has(anchorId)) return null;
    const anchor = spanOfEvent(anchorId, context, new Set([...trail, anchorId]));
    if (anchor === null) return null;
    const offset = amount * context.calendar.unitMinutes(unit) * (before ? -1 : 1);
    return new Span(anchor.lo + offset, anchor.hi + offset);
  }
  return null;
}

/** When an event begins and ends, each as the stretch it is known to fall in. `end` is null when there is no known
 * end; `open` says why: `ongoing` (still going on at the end of the story) or `unknown` (ends at a date not given). */
export class EventBounds {
  constructor(
    readonly start: Span,
    readonly end: Span | null,
    readonly open: 'ongoing' | 'unknown' | null,
  ) {}
}

export function boundsOfEvent(eventId: string, context: TimeContext, trail?: ReadonlySet<string>): EventBounds | null {
  const path = trail ?? new Set([eventId]);
  const event = context.events.get(eventId);
  if (event === undefined) return null;
  const start = spanOfDate(event.when, context, path);
  if (start === null) return null;
  if (event.ongoing) return new EventBounds(start, null, 'ongoing');
  if (event.raw['end'] !== null && event.raw['end'] !== undefined) {
    const end = spanOfDate(event.end, context, path);
    if (end === null) return new EventBounds(start, null, 'unknown');
    // An end before the start is a mistake for the author to see, not a reason to move the event.
    return new EventBounds(start, end.hi >= start.lo ? end : start, null);
  }
  const calendar = context.calendar;
  const length = calendar.durationMinutes(event.duration);
  if (length <= 0) return new EventBounds(start, start, null);
  // Known to the day or better, it starts with that day; known only to a longer stretch, it ends that long after.
  if (start.hi - start.lo < calendar.minutesPerDay) {
    const at = Math.max(start.hi, start.lo + length - 1);
    return new EventBounds(start, new Span(at, at), null);
  }
  return new EventBounds(start, new Span(start.lo + length - 1, start.hi + length - 1), null);
}

/** From the earliest an event can start to the latest it can end. Still going on, or ending at an unknown time: no
 * known end (`hi` is Infinity), so nothing is ever definitely after it. */
export function spanOfEvent(eventId: string, context: TimeContext, trail?: ReadonlySet<string>): Span | null {
  const bounds = boundsOfEvent(eventId, context, trail ?? new Set([eventId]));
  if (bounds === null) return null;
  return new Span(
    bounds.start.lo,
    bounds.open !== null ? Infinity : Math.max(bounds.start.hi, bounds.end!.hi),
  );
}

type Placed = { reading: number } | { story: Span };

function place(anchor: Anchor, context: TimeContext): Placed | null {
  if (anchor instanceof NodeAnchor) {
    const at = context.position.get(anchor.nodeId);
    return at === undefined ? null : { reading: at };
  }
  if (anchor instanceof EventAnchor) {
    const span = spanOfEvent(anchor.eventId, context);
    return span === null ? null : { story: span };
  }
  const span = spanOfDate((anchor as DateAnchor).when, context);
  return span === null ? null : { story: span };
}

function atOrAfter(point: Placed | null, start: Placed | null): Truth {
  if (point && start && 'reading' in point && 'reading' in start) return truthOf(point.reading >= start.reading);
  if (point && start && 'story' in point && 'story' in start) {
    const p = point.story;
    const s = start.story;
    return p.lo >= s.hi ? 'yes' : p.hi < s.lo ? 'no' : 'unknown';
  }
  return 'unknown';
}

function before(point: Placed | null, end: Placed | null): Truth {
  if (point && end && 'reading' in point && 'reading' in end) return truthOf(point.reading < end.reading);
  if (point && end && 'story' in point && 'story' in end) {
    const p = point.story;
    const e = end.story;
    return p.hi < e.lo ? 'yes' : p.lo >= e.hi ? 'no' : 'unknown';
  }
  return 'unknown';
}

/** Whether something with this validity holds at a point. Yes or no only when the data settles it: a missing date, a
 * date on the other axis, or a change inside the stretch the point covers all give unknown. */
export function validAt(validity: Validity, at: Anchor, context: TimeContext): Truth {
  const point = place(at, context);
  const from = validity.from;
  const until = validity.until;
  const started = from === null ? 'yes' : atOrAfter(point, place(from, context));
  const ongoing = until === null ? 'yes' : before(point, place(until, context));
  return both(started, ongoing);
}

/** Whether two validities share any moment. Touching ends (one stops where the other starts) do not overlap. */
export function overlaps(a: Validity, b: Validity, context: TimeContext): Truth {
  const endsBeforeStart = (x: Validity, y: Validity): Truth => {
    const until = x.until;
    const from = y.from;
    if (until === null || from === null) return 'no';
    // One stops at the very point the other starts: a handover, whenever exactly it was.
    if (jsonEquals(until.raw, from.raw)) return 'yes';
    const e = place(until, context);
    const s = place(from, context);
    if (e && s && 'reading' in e && 'reading' in s) return truthOf(e.reading <= s.reading);
    if (e && s && 'story' in e && 'story' in s) {
      return e.story.hi <= s.story.lo ? 'yes' : e.story.lo > s.story.hi ? 'no' : 'unknown';
    }
    return 'unknown';
  };
  const apart = [endsBeforeStart(a, b), endsBeforeStart(b, a)];
  if (apart.includes('yes')) return 'no';
  return apart.every((x) => x === 'no') ? 'yes' : 'unknown';
}

/** States in the order they began: open starts, then story-time starts by date, then reading-order starts by
 * position, then starts that cannot be placed. Ties keep the recorded order. Nothing is dropped. */
export function historyOf<T>(states: readonly T[], validity: (state: T) => Validity, context: TimeContext): T[] {
  const key = (state: T): [number, number] => {
    const from = validity(state).from;
    if (from === null) return [0, 0];
    const placed = place(from, context);
    if (placed === null) return [3, 0];
    return 'story' in placed ? [1, placed.story.lo] : [2, placed.reading];
  };
  const keyed = states.map((s, i) => [s, i, key(s)] as const);
  dartSort(keyed, (a, b) => {
    const g = compareNum(a[2][0], b[2][0]);
    if (g !== 0) return g;
    const v = compareNum(a[2][1], b[2][1]);
    return v !== 0 ? v : compareNum(a[1], b[1]);
  });
  return keyed.map((k) => k[0]);
}

/** Of a history, the states that hold at a point, each with its answer; only definite "no"s are left out. */
export function statesAt<T>(
  states: readonly T[],
  validity: (state: T) => Validity,
  at: Anchor,
  context: TimeContext,
): [T, Truth][] {
  const out: [T, Truth][] = [];
  for (const s of historyOf(states, validity, context)) {
    const holds = validAt(validity(s), at, context);
    if (holds !== 'no') out.push([s, holds]);
  }
  return out;
}

/** Every chapter, scene and event a validity points at, for checking they exist and for rewriting them in copies. */
export function anchorIds(validity: Validity | null): string[] {
  if (validity === null) return [];
  const out: string[] = [];
  for (const a of [validity.from, validity.until]) {
    if (a instanceof NodeAnchor) out.push(a.nodeId);
    else if (a instanceof EventAnchor) out.push(a.eventId);
    else if (a instanceof DateAnchor && a.when instanceof RelativeDate && a.when.anchorId !== null) {
      out.push(a.when.anchorId);
    }
  }
  return out;
}
