import { dateProblem, monthName, spanOfCalendarDate, STANDARD_CALENDAR, unitMinutes, yearName, type Calendar } from './calendar';
import { SEASON_LABELS, type EventDate, type EventDuration, type TimeUnit, type TimelineEvent } from './types';

/**
 * Time is measured in minutes from the start of year 0 of the novel's
 * calendar (`calendar.ts`): the standard twelve months unless the novel has
 * its own. That is exact enough to order events and compute ages, and it
 * gives every dated event one comparable number.
 */
export { DAY, MONTH, YEAR } from './calendar';
export const MINUTE = 1;

export const durationMinutes = (duration: EventDuration | null, calendar: Calendar = STANDARD_CALENDAR): number => (duration ? duration.amount * unitMinutes(duration.unit, calendar) : 0);

export interface Placed {
  event: TimelineEvent;
  /** Minutes from year 0, or null when the event has no resolvable date. */
  value: number | null;
  /** The year heading it falls under, or null when undated. */
  year: number | null;
  /** False only for an undated event that nothing ties into the order yet. */
  anchored: boolean;
  label: string;
  /** Continuity problems found for this event, in plain words. */
  issues: string[];
}

const unitLabel = (amount: number, unit: TimeUnit) => `${amount.toLocaleString()} ${amount === 1 ? unit.slice(0, -1) : unit}`;

/** A time of day: "8:30 PM" in a 24-hour day, "27:30" in a calendar whose days are longer or shorter. */
function clock(hour: number, minute: number | null, c: Calendar): string {
  if (c.hoursPerDay !== 24) return `${hour}:${String(minute ?? 0).padStart(2, '0')}`;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${String(minute ?? 0).padStart(2, '0')} ${suffix}`;
}

/**
 * A date as the author would read it, in the novel's calendar: "Year 1026,
 * October 14 — 8:30 PM", "Summer of Year 10", "About 20 years before the
 * Siege", "Second Age 4, Thaw 3".
 */
export function formatDate(when: EventDate, nameOf: (eventId: string) => string | undefined = () => undefined, c: Calendar = STANDARD_CALENDAR): string {
  if (when.precision === 'exact') {
    const date = when.month ? `, ${monthName(when.month, c)}${when.day ? ` ${when.day}` : ''}` : '';
    return `${yearName(when.year, c)}${date}${when.hour !== null && when.month && when.day ? ` — ${clock(when.hour, when.minute, c)}` : ''}`;
  }
  if (when.precision === 'approximate') {
    // The standard calendar has always said "June 10" for June of Year 10; a calendar of the novel's own says it in full.
    if (when.month) return c.standard ? `${monthName(when.month, c)} ${when.year}` : `${monthName(when.month, c)}, ${yearName(when.year, c)}`;
    if (when.season) return `${SEASON_LABELS[when.season]} of ${yearName(when.year, c)}`;
    return `Around ${yearName(when.year, c)}`;
  }
  if (when.precision === 'relative') {
    const anchor = when.anchorId ? nameOf(when.anchorId) : undefined;
    return `About ${unitLabel(when.amount, when.unit)} ${when.direction} ${anchor ?? 'an event that no longer exists'}`;
  }
  return 'Undated';
}

export function formatDuration(duration: EventDuration | null): string {
  return duration ? unitLabel(duration.amount, duration.unit) : '';
}

/**
 * Works out when every event happens and puts them in chronological order.
 *
 *  1. Exact and approximate dates give a value directly.
 *  2. Relative dates take their anchor's value plus or minus the offset
 *     (chains are followed; a loop or a missing anchor leaves it undated).
 *  3. Dated events are sorted by value. Events at the same moment, and
 *     undated events, are placed by their "comes after" link.
 *  4. Anything left has no place in time yet and goes at the end.
 *
 * Contradictions are reported, never silently fixed.
 */
export function resolveChronology(events: TimelineEvent[], calendar: Calendar = STANDARD_CALENDAR): Placed[] {
  const byId = new Map(events.map((e) => [e.id, e]));
  const values = new Map<string, number | null>();
  const issues = new Map<string, string[]>(events.map((e) => [e.id, []]));
  const note = (id: string, text: string) => issues.get(id)!.push(text);

  const valueOf = (event: TimelineEvent, trail: Set<string>): number | null => {
    if (values.has(event.id)) return values.get(event.id)!;
    const { when } = event;
    let value: number | null = null;
    if (when.precision === 'exact' || when.precision === 'approximate') {
      // A date the calendar does not have is not placed, and says why; the stored date is left as it is.
      const problem = dateProblem(when, calendar);
      if (problem) note(event.id, `${problem} It is not placed in time until its date or the calendar changes.`);
      value = spanOfCalendarDate(when, calendar)?.lo ?? null;
    } else if (when.precision === 'relative') {
      const anchor = when.anchorId ? byId.get(when.anchorId) : undefined;
      if (!anchor) note(event.id, 'Its date is relative to an event that no longer exists.');
      else if (trail.has(anchor.id) || anchor.id === event.id) note(event.id, 'Its date depends on itself through a chain of relative dates.');
      else {
        const base = valueOf(anchor, new Set(trail).add(event.id));
        if (base === null) note(event.id, `Its date is relative to “${anchor.name}”, which has no date yet.`);
        else value = base + (when.direction === 'before' ? -1 : 1) * when.amount * unitMinutes(when.unit, calendar);
      }
    }
    values.set(event.id, value);
    return value;
  };
  for (const event of events) valueOf(event, new Set());

  const stable = (a: TimelineEvent, b: TimelineEvent) => a.createdAt - b.createdAt || a.id.localeCompare(b.id);
  const dated = events.filter((e) => values.get(e.id) !== null).sort((a, b) => values.get(a.id)! - values.get(b.id)! || stable(a, b));
  const order = [...dated];

  // Within a tie (same moment), honour "comes after".
  for (let pass = 0; pass < order.length; pass++) {
    let moved = false;
    for (let i = 0; i < order.length; i++) {
      const event = order[i];
      const after = event.afterId ? order.findIndex((e) => e.id === event.afterId) : -1;
      if (after > i && values.get(order[after].id) === values.get(event.id)) {
        order.splice(i, 1);
        order.splice(after, 0, event);
        moved = true;
      }
    }
    if (!moved) break;
  }

  // Undated events take their place right after the event they follow.
  let waiting = events.filter((e) => values.get(e.id) === null).sort(stable);
  for (let progress = true; progress && waiting.length; ) {
    progress = false;
    for (const event of [...waiting]) {
      const at = event.afterId ? order.findIndex((e) => e.id === event.afterId) : -1;
      if (at === -1) continue;
      let insert = at + 1;
      while (insert < order.length && values.get(order[insert].id) === null && order[insert].afterId === event.afterId) insert++;
      order.splice(insert, 0, event);
      waiting = waiting.filter((e) => e !== event);
      progress = true;
    }
  }
  const floating = new Set(waiting.map((e) => e.id));
  order.push(...waiting);

  for (const event of events) {
    const previous = event.afterId ? byId.get(event.afterId) : undefined;
    if (event.afterId && !previous) note(event.id, 'It is set to follow an event that no longer exists.');
    const mine = values.get(event.id);
    const theirs = previous ? values.get(previous.id) : null;
    if (previous && mine !== null && mine !== undefined && theirs !== null && theirs !== undefined && mine < theirs) note(event.id, `It is dated before “${previous.name}”, which it is set to follow.`);
  }

  const nameOf = (id: string) => byId.get(id)?.name;
  return order.map((event) => {
    const value = values.get(event.id) ?? null;
    return { event, value, year: value === null ? null : Math.floor(value / calendar.minutesPerYear), anchored: !floating.has(event.id), label: formatDate(event.when, nameOf, calendar), issues: issues.get(event.id)! };
  });
}

// A character's life path and ages are in `ages.ts`, which works them out as exactly as the dates allow.
