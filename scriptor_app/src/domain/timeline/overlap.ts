// EVENTS THAT SHARE TIME. A port of flutter_app/lib/shared/domain/timeline/overlap.dart.
//
// Stories are full of things happening at once, and none of it is a mistake, so nothing here is a warning: it is how
// two events stand to each other in time, said as honestly as the dates allow.

import { localeCompare } from '../collation';
import { compareNum } from '../manuscript/dartSort';
import type { EventBounds } from '../model/validity';
import { stableSorted } from '../reader/stableSort';
import { Span } from '../records/calendar';
import type { EventRecord } from './eventRecord';

export type Together = 'same-time' | 'during' | 'contains' | 'overlaps' | 'maybe';
export const togethers: readonly Together[] = ['same-time', 'during', 'contains', 'overlaps', 'maybe'];

/** How each way of sharing time is said. */
export const togetherWords: Readonly<Record<Together, string>> = {
  'same-time': 'at the same time',
  during: 'while this is going on',
  contains: 'going on at the time',
  overlaps: 'overlaps with this',
  maybe: 'may be at the same time; the dates are too rough to tell',
};

/** Certainly at the same time, one way or another. */
export const togetherCertain = (t: Together): boolean => t !== 'maybe';

const rough = (s: Span, day: number) => s.hi - s.lo + 1 > day;
const meets = (a: Span, b: Span) => a.lo <= b.hi && b.lo <= a.hi;
const inside = (a: Span, b: Span) => a.lo >= b.lo && a.hi <= b.hi;
const isMoment = (b: EventBounds) =>
  b.open === null && b.end !== null && b.end.lo === b.start.lo && b.end.hi === b.start.hi;

/** Every moment the event could be going on: from the earliest start to the latest end, forever with no known end. */
export function possibleTime(b: EventBounds): Span {
  return new Span(b.start.lo, b.open !== null ? Infinity : b.start.hi > b.end!.hi ? b.start.hi : b.end!.hi);
}

/** The time it is certainly going on, or null when there is none to be sure of: from when it has certainly begun to
 * when it has certainly not yet ended. A moment known only to the month is certain at no moment. */
export function certainTime(b: EventBounds, day = 1440): Span | null {
  const lo = rough(b.start, day) ? b.start.hi : b.start.lo;
  let hi: number;
  if (b.open === 'ongoing') {
    hi = Infinity;
  } else if (b.open === 'unknown' || isMoment(b)) {
    // It may end the moment it begins: only its start, and only when that is known to the day.
    if (rough(b.start, day)) return null;
    hi = b.start.hi;
  } else {
    hi = rough(b.end!, day) ? b.end!.lo : b.end!.hi;
  }
  return hi >= lo ? new Span(lo, hi) : null;
}

/** How `other` stands to `event` in time, from `event`'s point of view; null when they cannot share any time. */
export function together(event: EventBounds, other: EventBounds, day = 1440): Together | null {
  const pa = possibleTime(event);
  const pb = possibleTime(other);
  if (!meets(pa, pb)) return null;
  const ca = certainTime(event, day);
  const cb = certainTime(other, day);
  if (ca !== null && cb !== null && meets(ca, cb)) {
    if (isMoment(event) && isMoment(other)) return 'same-time';
    if (inside(pb, ca)) return 'during';
    if (inside(pa, cb)) return 'contains';
    return 'overlaps';
  }
  // A rough moment can still be certainly within something long ("Summer of Year 10", during a war from 9 to 12).
  if (ca !== null && inside(pb, ca)) return 'during';
  if (cb !== null && inside(pa, cb)) return 'contains';
  return 'maybe';
}

/** The events sharing time with one, each with how, in the order they begin: the certain ones first, then the maybes. */
export function atTheSameTime(
  records: readonly EventRecord[],
  eventId: string,
  day = 1440,
): { record: EventRecord; how: Together }[] {
  const me = records.find((r) => r.id === eventId);
  if (me?.bounds == null) return [];
  const out: { record: EventRecord; how: Together }[] = [];
  for (const record of records) {
    if (record.id === eventId || record.bounds === null) continue;
    const how = together(me.bounds, record.bounds, day);
    if (how !== null) out.push({ record, how });
  }
  return stableSorted(out, (a, b) => {
    const maybe = (a.how === 'maybe' ? 1 : 0) - (b.how === 'maybe' ? 1 : 0);
    if (maybe !== 0) return maybe;
    const start = compareNum(a.record.bounds!.start.lo, b.record.bounds!.start.lo);
    return start !== 0 ? start : localeCompare(a.record.title, b.record.title);
  });
}
