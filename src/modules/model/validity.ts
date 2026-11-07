import type { ContinuityRule } from '@/modules/continuity/types';
import type { ProgressSnapshot } from '@/modules/progression/types';
import { sortedStages, type StoryOrder } from '@/modules/relationships/timeline';
import type { CharacterRelation, RelationStage } from '@/modules/relationships/types';
import { spanOfCalendarDate, STANDARD_CALENDAR, type Calendar, type Span } from '@/modules/timeline/calendar';
import { durationMinutes } from '@/modules/timeline/chronology';
import type { EventDate, TimelineEvent } from '@/modules/timeline/types';
import type { StoryModel } from './types';

/**
 * FACTS THAT CHANGE OVER THE STORY
 * Something that holds for a while (a membership, an owner, where someone
 * is, a relationship's state) is valid from one point to another. A point
 * is one of:
 *
 *  node   a chapter or scene: "from chapter 12 on", in READING order
 *  event  a timeline event: "from the Siege on", in STORY time
 *  date   a date in story time, as precise as the story is: exact, a month,
 *         a season, "around Year 10", "two days after the Siege", or unknown
 *
 * Reading order and story time are different axes (a flashback is read
 * late and happened early), so a point on one is never compared with a
 * point on the other: the answer is "unknown", not a guess.
 *
 * `from: null` holds from the start; `until: null` still holds (open-ended).
 * An `unknown` date is different: the change happened, but nobody has said
 * when, so whether it holds at a given point is unknown.
 */
export type Anchor = { kind: 'node'; nodeId: string } | { kind: 'event'; eventId: string } | { kind: 'date'; when: EventDate };

export interface Validity {
  from: Anchor | null;
  until: Anchor | null;
}

export const ALWAYS: Validity = { from: null, until: null };

export type Truth = true | false | 'unknown';

/** What a point is compared against: where nodes are in reading order, the events dates can lean on, and the calendar dates are counted in. */
export interface TimeContext {
  position: ReadonlyMap<string, number>;
  events: ReadonlyMap<string, TimelineEvent>;
  /** The novel's calendar; the standard one when not given. */
  calendar?: Calendar;
}

/** A project's reading order, events and calendar, as `validAt` needs them. */
export const timeContext = (model: Pick<StoryModel, 'order' | 'events'> & { calendar?: Calendar }): TimeContext => ({ position: model.order.position, events: model.events, calendar: model.calendar });

const calendarOf = (context: TimeContext): Calendar => context.calendar ?? STANDARD_CALENDAR;

/** How much story time a date covers, in the novel's calendar: a day for a day, a year for "Year 10", the season for "Summer of Year 10". Null when it cannot be placed. */
export function spanOfDate(when: EventDate, context: TimeContext, trail: ReadonlySet<string> = new Set()): Span | null {
  switch (when.precision) {
    case 'exact':
    case 'approximate':
      return spanOfCalendarDate(when, calendarOf(context));
    case 'relative': {
      if (!when.anchorId || trail.has(when.anchorId)) return null;
      const anchor = spanOfEvent(when.anchorId, context, new Set(trail).add(when.anchorId));
      if (!anchor) return null;
      const offset = durationMinutes({ amount: when.amount, unit: when.unit }, calendarOf(context)) * (when.direction === 'before' ? -1 : 1);
      return { lo: anchor.lo + offset, hi: anchor.hi + offset };
    }
    case 'unknown':
      return null;
  }
}

/**
 * When an event begins and when it ends, each as the stretch of time it is
 * known to fall in: a single day or less when the date says so, a month, a
 * season or a year when that is all the author has said.
 *  - A moment ends where it starts.
 *  - A duration ends that long after the start. A start known only to the
 *    month leaves the end as uncertain as the start.
 *  - An end date ends within that date.
 *  - `open: 'ongoing'`: still going on at the end of the story.
 *  - `open: 'unknown'`: it ends, but at a date not given or not worked out.
 * Null when its start cannot be worked out.
 */
export interface EventBounds {
  start: Span;
  /** Null when it has no known end (`open` says why). */
  end: Span | null;
  open: null | 'ongoing' | 'unknown';
}

export function boundsOfEvent(eventId: string, context: TimeContext, trail: ReadonlySet<string> = new Set([eventId])): EventBounds | null {
  const event = context.events.get(eventId);
  if (!event) return null;
  const start = spanOfDate(event.when, context, trail);
  if (!start) return null;
  if (event.ongoing) return { start, end: null, open: 'ongoing' };
  if (event.end) {
    const end = spanOfDate(event.end, context, trail);
    if (!end) return { start, end: null, open: 'unknown' };
    // An end before the start is a mistake for the author to see (`validateEvent`), not a reason to move the event: it stays where it starts.
    return { start, end: end.hi >= start.lo ? end : start, open: null };
  }
  const calendar = calendarOf(context);
  const length = durationMinutes(event.duration, calendar);
  if (length <= 0) return { start, end: start, open: null };
  // Known to the day or better, it starts with that day; known only to a longer stretch, it ends that long after whenever it began.
  if (start.hi - start.lo < calendar.minutesPerDay) {
    const at = Math.max(start.hi, start.lo + length - 1);
    return { start, end: { lo: at, hi: at }, open: null };
  }
  return { start, end: { lo: start.lo + length - 1, hi: start.hi + length - 1 }, open: null };
}

/**
 * When an event happens, from the earliest it can start to the latest it can
 * end. One that is still going on, or ends at a time nobody has given, has
 * no known end (`hi` is Infinity), so nothing is ever definitely after it.
 * Null when its start cannot be worked out.
 */
export function spanOfEvent(eventId: string, context: TimeContext, trail: ReadonlySet<string> = new Set([eventId])): Span | null {
  const bounds = boundsOfEvent(eventId, context, trail);
  if (!bounds) return null;
  return { lo: bounds.start.lo, hi: bounds.open ? Infinity : Math.max(bounds.start.hi, bounds.end!.hi) };
}

type Placed = { axis: 'reading'; at: number } | { axis: 'story'; span: Span } | null;

function place(anchor: Anchor, context: TimeContext): Placed {
  if (anchor.kind === 'node') {
    const at = context.position.get(anchor.nodeId);
    return at === undefined ? null : { axis: 'reading', at };
  }
  const span = anchor.kind === 'event' ? spanOfEvent(anchor.eventId, context) : spanOfDate(anchor.when, context);
  return span ? { axis: 'story', span } : null;
}

/** Whether `point` is at or after `start` (a validity's beginning, inclusive). */
function atOrAfter(point: Placed, start: Placed): Truth {
  if (!point || !start || point.axis !== start.axis) return 'unknown';
  if (point.axis === 'reading' && start.axis === 'reading') return point.at >= start.at;
  if (point.axis === 'story' && start.axis === 'story') return point.span.lo >= start.span.hi ? true : point.span.hi < start.span.lo ? false : 'unknown';
  return 'unknown';
}

/** Whether `point` is before `end` (a validity's end, exclusive). */
function before(point: Placed, end: Placed): Truth {
  if (!point || !end || point.axis !== end.axis) return 'unknown';
  if (point.axis === 'reading' && end.axis === 'reading') return point.at < end.at;
  if (point.axis === 'story' && end.axis === 'story') return point.span.hi < end.span.lo ? true : point.span.lo >= end.span.hi ? false : 'unknown';
  return 'unknown';
}

const both = (a: Truth, b: Truth): Truth => (a === false || b === false ? false : a === true && b === true ? true : 'unknown');

/**
 * Whether something with this validity holds at a point. `true` and `false`
 * only when the dates settle it; otherwise `unknown`. Nothing is guessed:
 * a missing date, a date on the other axis, or a change somewhere inside
 * the stretch the point covers all give `unknown`.
 */
export function validAt(validity: Validity, at: Anchor, context: TimeContext): Truth {
  const point = place(at, context);
  const started = validity.from ? atOrAfter(point, place(validity.from, context)) : true;
  const ongoing = validity.until ? before(point, place(validity.until, context)) : true;
  return both(started, ongoing);
}

/** Whether two validities share any moment. `unknown` when the dates cannot tell; touching ends (one stops where the other starts) do not overlap. */
export function overlaps(a: Validity, b: Validity, context: TimeContext): Truth {
  // Two stretches overlap unless one ends before the other begins.
  const endsBeforeStart = (x: Validity, y: Validity): Truth => {
    if (!x.until || !y.from) return false;
    // One stops at the very point the other starts (the same event, chapter or date): a handover, whenever exactly it was.
    if (JSON.stringify(x.until) === JSON.stringify(y.from)) return true;
    const end = place(x.until, context);
    const start = place(y.from, context);
    if (!end || !start || end.axis !== start.axis) return 'unknown';
    if (end.axis === 'reading' && start.axis === 'reading') return end.at <= start.at;
    if (end.axis === 'story' && start.axis === 'story') return end.span.hi <= start.span.lo ? true : end.span.lo > start.span.hi ? false : 'unknown';
    return 'unknown';
  };
  const apart = [endsBeforeStart(a, b), endsBeforeStart(b, a)];
  if (apart.includes(true)) return false;
  return apart.every((x) => x === false) ? true : 'unknown';
}

/**
 * States in the order they began. Open starts come first, then story-time
 * starts by date, then reading-order starts by position, then starts whose
 * date is unknown. Ties, and points that cannot be placed, keep the order
 * they were recorded in. Every state is returned: nothing is dropped.
 */
export function historyOf<T>(states: T[], validity: (state: T) => Validity, context: TimeContext): T[] {
  const key = (state: T): [number, number] => {
    const from = validity(state).from;
    if (!from) return [0, 0];
    const placed = place(from, context);
    if (!placed) return [3, 0];
    return placed.axis === 'story' ? [1, placed.span.lo] : [2, placed.at];
  };
  return states
    .map((state, index) => ({ state, index, key: key(state) }))
    .sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.index - b.index)
    .map(({ state }) => state);
}

/** Of a history, the states that hold at a point: each with its answer, leaving out only the definite `false`s. */
export function statesAt<T>(states: T[], validity: (state: T) => Validity, at: Anchor, context: TimeContext): { state: T; holds: Truth }[] {
  return historyOf(states, validity, context).flatMap((state) => {
    const holds = validAt(validity(state), at, context);
    return holds === false ? [] : [{ state, holds }];
  });
}

const node = (nodeId: string | null): Anchor | null => (nodeId ? { kind: 'node', nodeId } : null);

// What already changes over the story, read as validities. Nothing stored is changed.

/** A relationship's stages: each holds from where it starts until the next one starts (reading order). */
export function stageValidities(relation: CharacterRelation, order: StoryOrder): { stage: RelationStage; validity: Validity }[] {
  const stages = sortedStages(relation, order);
  return stages.map((stage, i) => ({ stage, validity: { from: node(stage.startNodeId), until: node(stages[i + 1]?.startNodeId ?? null) } }));
}

/** A tracked status or possession: from its starting chapter until the one where it stops. */
export const ruleValidity = (rule: Pick<ContinuityRule, 'fromNodeId' | 'untilNodeId'>): Validity => ({ from: node(rule.fromNodeId), until: node(rule.untilNodeId) });

/** A character's snapshots: each is their state from its chapter until their next snapshot. A snapshot with no chapter is before the story. */
export function snapshotValidities(snapshots: ProgressSnapshot[], order: StoryOrder): { snapshot: ProgressSnapshot; validity: Validity }[] {
  const at = (s: ProgressSnapshot) => (s.nodeId === null ? -1 : (order.position.get(s.nodeId) ?? -1));
  const sorted = [...snapshots].sort((a, b) => at(a) - at(b) || a.createdAt - b.createdAt);
  return sorted.map((snapshot, i) => ({ snapshot, validity: { from: node(snapshot.nodeId), until: node(sorted[i + 1]?.nodeId ?? null) } }));
}

/** Every chapter, scene and event an anchor points at, for checking that they still exist and for rewriting them in copies. */
export function anchorIds(validity: Validity | undefined): string[] {
  if (!validity) return [];
  return [validity.from, validity.until].flatMap((a) => (!a ? [] : a.kind === 'node' ? [a.nodeId] : a.kind === 'event' ? [a.eventId] : a.when.precision === 'relative' && a.when.anchorId ? [a.when.anchorId] : []));
}

/** The same validity with every id passed through `mapId` (for copies and imports). */
export function remapValidity(validity: Validity | undefined, mapId: (id: string) => string): Validity | undefined {
  if (!validity) return validity;
  const one = (a: Anchor | null): Anchor | null => {
    if (!a) return a;
    // Only the ids change: anything else an anchor holds, known to this version or not, is kept.
    if (a.kind === 'node') return { ...a, nodeId: mapId(a.nodeId) };
    if (a.kind === 'event') return { ...a, eventId: mapId(a.eventId) };
    return a.when.precision === 'relative' && a.when.anchorId ? { ...a, when: { ...a.when, anchorId: mapId(a.when.anchorId) } } : a;
  };
  return { ...validity, from: one(validity.from), until: one(validity.until) };
}
