// When every event happens, in story order. A port of flutter_app/lib/shared/domain/timeline/chronology.dart.

import { localeCompare } from '../collation';
import { numOrNull } from '../json';
import { compareNum } from '../manuscript/dartSort';
import { stableSorted } from '../reader/stableSort';
import { Calendar } from '../records/calendar';
import { ApproximateDate, ExactDate, RelativeDate, type TimelineEvent } from '../records/event';
import { formatDate } from './dates';

/** An event placed in story time. */
export class Placed {
  readonly event: TimelineEvent;
  /** Minutes from year 0, or null when the event has no date that can be worked out. */
  readonly value: number | null;
  /** The year heading it falls under, or null when undated. */
  readonly year: number | null;
  /** False only for an undated event that nothing ties into the order yet. */
  readonly anchored: boolean;
  readonly label: string;
  /** Continuity problems found for this event, in plain words. */
  readonly issues: readonly string[];

  constructor(args: {
    event: TimelineEvent;
    value: number | null;
    year: number | null;
    anchored: boolean;
    label: string;
    issues: readonly string[];
  }) {
    this.event = args.event;
    this.value = args.value;
    this.year = args.year;
    this.anchored = args.anchored;
    this.label = args.label;
    this.issues = args.issues;
  }
}

function stable(a: TimelineEvent, b: TimelineEvent): number {
  const ca = numOrNull(a.raw['createdAt']);
  const cb = numOrNull(b.raw['createdAt']);
  // As the original: a missing creation time compares as no difference, so the id decides.
  const byTime = ca === null || cb === null ? 0 : compareNum(ca, cb);
  return byTime !== 0 ? byTime : localeCompare(a.id, b.id);
}

/** Works out when every event happens and puts them in story order.
 *
 *  1. Exact and approximate dates give a value directly.
 *  2. Relative dates take their anchor's value plus or minus the offset (chains are followed; a loop or a missing
 *     anchor leaves it undated).
 *  3. Dated events are sorted by value. Events at the same moment, and undated events, are placed by their "comes
 *     after" link.
 *  4. Anything left has no place in time yet and goes at the end.
 *
 * Contradictions are reported, never silently fixed. */
export function resolveChronology(all: Iterable<TimelineEvent>, calendar?: Calendar | null): Placed[] {
  const c = calendar ?? Calendar.standardCalendar;
  const events = [...all];
  const byId = new Map<string, TimelineEvent>();
  for (const e of events) byId.set(e.id, e);
  const values = new Map<string, number | null>();
  const valueAt = (id: string) => values.get(id) ?? null;
  const issues = new Map<string, string[]>();
  for (const e of events) issues.set(e.id, []);
  const note = (id: string, text: string) => issues.get(id)!.push(text);

  const valueOf = (event: TimelineEvent, trail: ReadonlySet<string>): number | null => {
    if (values.has(event.id)) return valueAt(event.id);
    const when = event.when;
    let value: number | null = null;
    if (when instanceof ExactDate || when instanceof ApproximateDate) {
      // A date the calendar does not have is not placed, and says why; the stored date is left as it is.
      const problem = c.dateProblem(when);
      if (problem !== null) {
        note(event.id, `${problem} It is not placed in time until its date or the calendar changes.`);
      }
      value = c.spanOf(when)?.lo ?? null;
    } else if (when instanceof RelativeDate) {
      const anchor = when.anchorId === null ? undefined : byId.get(when.anchorId);
      if (anchor === undefined) {
        note(event.id, 'Its date is relative to an event that no longer exists.');
      } else if (trail.has(anchor.id) || anchor.id === event.id) {
        note(event.id, 'Its date depends on itself through a chain of relative dates.');
      } else {
        const base = valueOf(anchor, new Set([...trail, event.id]));
        if (base === null) {
          note(event.id, `Its date is relative to “${anchor.name}”, which has no date yet.`);
        } else {
          value = base + (when.before ? -1 : 1) * when.amount * c.unitMinutes(when.unit);
        }
      }
    }
    values.set(event.id, value);
    return value;
  };

  for (const event of events) valueOf(event, new Set());

  const dated = stableSorted(
    events.filter((e) => valueAt(e.id) !== null),
    (a, b) => {
      const byValue = compareNum(valueAt(a.id)!, valueAt(b.id)!);
      return byValue !== 0 ? byValue : stable(a, b);
    },
  );
  const order = [...dated];

  // Within a tie (same moment), honour "comes after".
  for (let pass = 0; pass < order.length; pass++) {
    let moved = false;
    for (let i = 0; i < order.length; i++) {
      const event = order[i];
      const after = event.afterId === null ? -1 : order.findIndex((e) => e.id === event.afterId);
      if (after > i && valueAt(order[after].id) === valueAt(event.id)) {
        order.splice(i, 1);
        order.splice(after, 0, event);
        moved = true;
      }
    }
    if (!moved) break;
  }

  // Undated events take their place right after the event they follow.
  let waiting = stableSorted(
    events.filter((e) => valueAt(e.id) === null),
    stable,
  );
  for (let progress = true; progress && waiting.length > 0; ) {
    progress = false;
    for (const event of [...waiting]) {
      const at = event.afterId === null ? -1 : order.findIndex((e) => e.id === event.afterId);
      if (at === -1) continue;
      let insert = at + 1;
      while (
        insert < order.length &&
        valueAt(order[insert].id) === null &&
        order[insert].afterId === event.afterId
      ) {
        insert++;
      }
      order.splice(insert, 0, event);
      waiting = waiting.filter((w) => w !== event);
      progress = true;
    }
  }
  const floating = new Set(waiting.map((e) => e.id));
  order.push(...waiting);

  for (const event of events) {
    const previous = event.afterId === null ? undefined : byId.get(event.afterId);
    if (event.afterId !== null && previous === undefined) {
      note(event.id, 'It is set to follow an event that no longer exists.');
    }
    const mine = valueAt(event.id);
    const theirs = previous === undefined ? null : valueAt(previous.id);
    if (previous !== undefined && mine !== null && theirs !== null && mine < theirs) {
      note(event.id, `It is dated before “${previous.name}”, which it is set to follow.`);
    }
  }

  const nameOf = (id: string) => byId.get(id)?.name ?? null;
  return order.map((event) => {
    const value = valueAt(event.id);
    return new Placed({
      event,
      value,
      year: value === null ? null : Math.floor(value / c.minutesPerYear),
      anchored: !floating.has(event.id),
      label: formatDate(event.when, nameOf, c),
      issues: issues.get(event.id)!,
    });
  });
}
