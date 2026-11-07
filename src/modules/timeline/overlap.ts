import type { EventRecord } from '@/modules/model/events';
import type { EventBounds } from '@/modules/model/validity';
import { DAY } from './calendar';

/**
 * EVENTS THAT SHARE TIME
 * Stories are full of things happening at once: a battle in one place while
 * a treaty is signed in another, a siege that lasts through a winter of
 * smaller events. None of that is a mistake, so nothing here is a warning;
 * it is how two events stand to each other in time, said honestly about
 * how much the dates allow:
 *  same-time  two moments at the same time (to the day, or closer)
 *  during     the other happens while this one is certainly going on
 *  contains   this one happens while the other is certainly going on
 *  overlaps   both are certainly going on at some moment
 *  maybe      they could share time, but the dates are too rough, or an
 *             end is not given, so it cannot be told
 * Null when they cannot share any time.
 */
export type Together = 'same-time' | 'during' | 'contains' | 'overlaps' | 'maybe';

export const TOGETHER_WORDS: Record<Together, string> = {
  'same-time': 'at the same time',
  during: 'while this is going on',
  contains: 'going on at the time',
  overlaps: 'overlaps with this',
  maybe: 'may be at the same time; the dates are too rough to tell',
};

interface Stretch {
  lo: number;
  hi: number;
}

const rough = (s: Stretch, day: number) => s.hi - s.lo + 1 > day;
const meets = (a: Stretch, b: Stretch) => a.lo <= b.hi && b.lo <= a.hi;
const inside = (a: Stretch, b: Stretch) => a.lo >= b.lo && a.hi <= b.hi;
const isMoment = (b: EventBounds) => !b.open && !!b.end && b.end.lo === b.start.lo && b.end.hi === b.start.hi;

/** Every moment the event could be going on: from the earliest start to the latest end, forever when no end is known. */
export const possibleTime = (b: EventBounds): Stretch => ({ lo: b.start.lo, hi: b.open ? Infinity : Math.max(b.start.hi, b.end!.hi) });

/**
 * The time it is certainly going on, or null when there is none to be sure
 * of: from when it has certainly begun to when it has certainly not yet
 * ended. A moment known only to the month is certain at no moment; a start
 * known to the day is certain from that day.
 */
export function certainTime(b: EventBounds, day = DAY): Stretch | null {
  const lo = rough(b.start, day) ? b.start.hi : b.start.lo;
  let hi: number;
  if (b.open === 'ongoing') hi = Infinity;
  else if (b.open === 'unknown' || isMoment(b)) {
    // It may end the moment it begins: only its start, and only when that is known to the day.
    if (rough(b.start, day)) return null;
    hi = b.start.hi;
  } else hi = rough(b.end!, day) ? b.end!.lo : b.end!.hi;
  return hi >= lo ? { lo, hi } : null;
}

/** How `other` stands to `event` in time, from `event`'s point of view; null when they cannot share any time. */
export function together(event: EventBounds, other: EventBounds, day = DAY): Together | null {
  const [pa, pb] = [possibleTime(event), possibleTime(other)];
  if (!meets(pa, pb)) return null;
  const [ca, cb] = [certainTime(event, day), certainTime(other, day)];
  if (ca && cb && meets(ca, cb)) {
    if (isMoment(event) && isMoment(other)) return 'same-time';
    if (inside(pb, ca)) return 'during';
    if (inside(pa, cb)) return 'contains';
    return 'overlaps';
  }
  // A rough moment can still be certainly within something long ("Summer of Year 10", during a war from Year 9 to 12).
  if (ca && inside(pb, ca)) return 'during';
  if (cb && inside(pa, cb)) return 'contains';
  return 'maybe';
}

/** The events sharing time with one, each with how, in the order they begin. The certain ones first, then the maybes. */
export function atTheSameTime(records: EventRecord[], eventId: string, day = DAY): { record: EventRecord; how: Together }[] {
  const me = records.find((r) => r.id === eventId);
  if (!me?.bounds) return [];
  return records
    .flatMap((record) => {
      if (record.id === eventId || !record.bounds) return [];
      const how = together(me.bounds!, record.bounds, day);
      return how ? [{ record, how }] : [];
    })
    .sort((a, b) => Number(a.how === 'maybe') - Number(b.how === 'maybe') || a.record.bounds!.start.lo - b.record.bounds!.start.lo || a.record.title.localeCompare(b.record.title));
}
