// Events laid out along story time, for the drawn timeline. A port of
// flutter_app/lib/shared/domain/timeline/axis.dart.
//
// How a mark is drawn, saying how much is known:
//  moment     an exact moment, known to the day or better (a dot)
//  uncertain  one moment somewhere in a stretch: a date given only to the month, season or year, drawn across the
//             whole stretch
//  lasting    an event with a length (a duration or an end date): a bar. A start or end known only roughly is drawn
//             hatched over the stretch it falls in; the solid part is when it is certainly going on.
//  ongoing    no end within the story: a bar to the edge of the drawing
//  unended    it lasts, but its end is not given (or cannot be worked out): a bar that fades out after it begins,
//             never claiming an end
// Overlaps are normal: events that share time are drawn on separate rows, never flagged. Events with no date that can
// be worked out are not placed at all.

import { localeCompare } from '../collation';
import { compareNum } from '../manuscript/dartSort';
import { stableSorted } from '../reader/stableSort';
import { Span } from '../records/calendar';
import { RelativeDate } from '../records/event';
import type { EventRecord } from './eventRecord';

export type MarkKind = 'moment' | 'uncertain' | 'lasting' | 'ongoing' | 'unended';
export const markKinds: readonly MarkKind[] = ['moment', 'uncertain', 'lasting', 'ongoing', 'unended'];

export class AxisMark {
  constructor(
    readonly id: string,
    readonly title: string,
    /** The date as the author would say it. */
    readonly when: string,
    readonly kind: MarkKind,
    /** Story time in minutes: the earliest it can start, and the latest it can end (the drawing's edge when ongoing). */
    readonly start: number,
    readonly end: number,
    /** The stretch it starts somewhere in, when longer than a day. */
    readonly startFuzz: Span | null,
    /** The stretch it ends somewhere in, when longer than a day; null when known to the day, or not known at all. */
    readonly endFuzz: Span | null,
    /** Which row it sits on, so marks never cover one another. */
    readonly lane: number,
    /** Where it is drawn, in the drawing's units. */
    readonly x: number,
    readonly width: number,
  ) {}
}

export type Unplaced = { id: string; title: string; reason: string };

export class TimeAxis {
  constructor(
    readonly marks: readonly AxisMark[],
    readonly unplaced: readonly Unplaced[],
    /** The stretch of story time drawn, in minutes. */
    readonly from: number,
    readonly to: number,
    readonly width: number,
    readonly lanes: number,
  ) {}
}

/** The drawing's width before any zoom; marks and labels are laid out for it. */
export const axisWidth = 1200.0;

/** How much room a mark's label takes, so the lanes keep labels apart as well as marks. */
const labelRoom = 150.0;

const rough = (s: Span, day: number) => s.hi - s.lo + 1 > day;

function kindOf(e: EventRecord, day: number): MarkKind {
  if (e.bounds?.open === 'ongoing') return 'ongoing';
  if (e.bounds?.open === 'unknown') return 'unended';
  if (e.shape !== 'instant') return 'lasting';
  return e.bounds !== null && rough(e.bounds.start, day) ? 'uncertain' : 'moment';
}

function unplacedReason(e: EventRecord, has: (id: string) => boolean): string {
  if (e.dateProblem !== null) return e.dateProblem;
  if (e.precision === 'unknown') return 'No date yet';
  if (e.precision === 'relative') {
    const start = e.start;
    const anchor = start instanceof RelativeDate ? start.anchorId : null;
    if (anchor === null || !has(anchor)) return 'Dated from an event that no longer exists';
    return 'Dated from an event that has no date yet';
  }
  return 'Its date cannot be worked out';
}

export type TimeDomain = { from: number; to: number };

/** The stretch of story time a set of events covers, with a margin: from the earliest start to the latest end. A
 * single moment, or everything in one instant, still gets a year either side. Null when nothing is dated. */
export function domainOf(events: readonly EventRecord[], options: { day?: number; year?: number } = {}): TimeDomain | null {
  const year = options.year ?? 525600;
  const dated = events.filter((e) => e.span !== null);
  if (dated.length === 0) return null;
  let from = dated.map((e) => e.span!.lo).reduce((a, b) => Math.min(a, b));
  let to = dated.map((e) => (Number.isFinite(e.span!.hi) ? e.span!.hi : e.span!.lo)).reduce((a, b) => Math.max(a, b));
  if (to - from < year) {
    from -= year;
    to += year;
  }
  const pad = (to - from) * 0.05;
  return { from: from - pad, to: to + pad };
}

const byTitleThenId = (a: EventRecord, b: EventRecord) => {
  const byTitle = localeCompare(a.title, b.title);
  return byTitle !== 0 ? byTitle : localeCompare(a.id, b.id);
};

/** Lays events out along story time. Dated events are ordered by when they begin (ties by name, then id) and packed
 * into as few rows as keep both marks and their labels apart. Undated ones are listed apart, with why. Several
 * timelines drawn together (tracks) pass the same `domain`, so an event sits at the same place in every one. */
export function layoutAxis(
  events: readonly EventRecord[],
  options: { width?: number; domain?: TimeDomain | null; useDomain?: boolean; day?: number; year?: number } = {},
): TimeAxis {
  const width = options.width ?? axisWidth;
  const day = options.day ?? 1440;
  const year = options.year ?? 525600;
  const range = options.useDomain === true ? (options.domain ?? null) : domainOf(events, { day, year });
  const ids = new Set(events.map((e) => e.id));
  const dated = stableSorted(
    events.filter((e) => e.bounds !== null),
    (a, b) => {
      const byStart = compareNum(a.bounds!.start.lo, b.bounds!.start.lo);
      return byStart !== 0 ? byStart : byTitleThenId(a, b);
    },
  );
  const unplaced = stableSorted(
    events.filter((e) => e.bounds === null),
    byTitleThenId,
  ).map((e) => ({ id: e.id, title: e.title, reason: unplacedReason(e, (id) => ids.has(id)) }));
  if (dated.length === 0 || range === null) {
    return new TimeAxis([], unplaced, range?.from ?? 0, range?.to ?? year, width, 0);
  }
  const { from, to } = range;
  const x = (t: number) => ((t - from) / (to - from)) * width;

  const laneEnds: number[] = [];
  const marks = dated.map((e) => {
    const kind = kindOf(e, day);
    const begins = e.bounds!.start;
    const ends = e.bounds!.end;
    const start = begins.lo;
    const end =
      kind === 'ongoing'
        ? to
        : kind === 'moment'
          ? start
          : kind === 'uncertain' || kind === 'unended'
            ? begins.hi
            : ends === null
              ? begins.hi
              : Math.max(begins.hi, ends.hi);
    const lasts = kind === 'lasting' || kind === 'ongoing' || kind === 'unended';
    const startFuzz = lasts && rough(begins, day) ? new Span(begins.lo, begins.hi) : null;
    const endFuzz = kind === 'lasting' && ends !== null && rough(ends, day) ? new Span(ends.lo, ends.hi) : null;
    const left = x(start);
    const right = Math.max(left, x(end));
    // The first row where this mark and its label fit after what is already there.
    const reach = Math.max(right, left + labelRoom);
    let lane = laneEnds.findIndex((edge) => edge + 8 <= left);
    if (lane === -1) {
      laneEnds.push(reach);
      lane = laneEnds.length - 1;
    } else {
      laneEnds[lane] = reach;
    }
    return new AxisMark(e.id, e.title, e.label, kind, start, end, startFuzz, endFuzz, lane, left, right - left);
  });
  return new TimeAxis(marks, unplaced, from, to, width, laneEnds.length);
}
