import type { EventRecord } from '@/modules/model/events';
import { DAY, YEAR } from './calendar';

/**
 * Drawing events along story time. Every mark says how much is known:
 *  moment     an exact moment, known to the day or better (a dot)
 *  uncertain  one moment somewhere in a stretch: a date given only to the
 *             month, season or year ("Summer of Year 10"), drawn across
 *             the whole stretch
 *  lasting    an event with a length (a duration or an end date): a bar.
 *             A start or end known only roughly is drawn hatched over the
 *             stretch it falls in; the solid part is when it is certainly
 *             going on.
 *  ongoing    no end within the story: a bar to the edge of the drawing
 *  unended    it lasts, but its end is not given (or cannot be worked out):
 *             a bar that fades out after it begins, never claiming an end
 * Overlaps are normal (a war goes on while a treaty is signed elsewhere):
 * events that share time are drawn on separate rows, never flagged.
 * Events with no date that can be worked out are not placed at all.
 */
export type MarkKind = 'moment' | 'uncertain' | 'lasting' | 'ongoing' | 'unended';

/** A stretch of story time in minutes. */
export interface Stretch {
  lo: number;
  hi: number;
}

export interface AxisMark {
  id: string;
  title: string;
  /** The date as the author would say it. */
  when: string;
  kind: MarkKind;
  /** Story time, in minutes: the earliest it can start, and the latest it can end (the drawing's edge when still going on). */
  start: number;
  end: number;
  /** The stretch it starts somewhere in, when that is longer than a day; null when the start is known to the day. */
  startFuzz: Stretch | null;
  /** The stretch it ends somewhere in, when that is longer than a day; null when the end is known to the day, or not known at all. */
  endFuzz: Stretch | null;
  /** Which row it sits on, so marks never cover one another. */
  lane: number;
  /** Where it is drawn, in the drawing's units. */
  x: number;
  width: number;
}

export interface Unplaced {
  id: string;
  title: string;
  /** Why it has no place: said plainly, never guessed around. */
  reason: string;
}

export interface Axis {
  marks: AxisMark[];
  unplaced: Unplaced[];
  /** The stretch of story time drawn, in minutes. */
  from: number;
  to: number;
  width: number;
  lanes: number;
}

/** The drawing's width before any zoom; marks and labels are laid out for it. */
export const AXIS_WIDTH = 1200;
/** How much room a mark's label takes, so the lanes keep labels apart as well as marks. */
const LABEL = 150;

/** How long a day and a year are in the novel's calendar; the standard calendar's when not given. */
export interface AxisTime {
  day: number;
  year: number;
}
const STANDARD_TIME: AxisTime = { day: DAY, year: YEAR };

const rough = (s: Stretch, day: number) => s.hi - s.lo + 1 > day;

function kindOf(e: EventRecord, day: number): MarkKind {
  if (e.bounds?.open === 'ongoing') return 'ongoing';
  if (e.bounds?.open === 'unknown') return 'unended';
  if (e.shape !== 'instant') return 'lasting';
  return e.bounds && rough(e.bounds.start, day) ? 'uncertain' : 'moment';
}

function unplacedReason(e: EventRecord, has: (id: string) => boolean): string {
  if (e.dateProblem) return e.dateProblem;
  if (e.precision === 'unknown') return 'No date yet';
  if (e.precision === 'relative') {
    const anchor = e.start.precision === 'relative' ? e.start.anchorId : null;
    if (!anchor || !has(anchor)) return 'Dated from an event that no longer exists';
    return 'Dated from an event that has no date yet';
  }
  return 'Its date cannot be worked out';
}

/**
 * The stretch of story time a set of events covers, with a margin: from the
 * earliest start to the latest end. A single moment, or everything in one
 * instant, still gets a year either side. Null when nothing is dated.
 */
export function domainOf(events: EventRecord[], time: AxisTime = STANDARD_TIME): { from: number; to: number } | null {
  const dated = events.filter((e) => e.span);
  if (!dated.length) return null;
  let from = Math.min(...dated.map((e) => e.span!.lo));
  let to = Math.max(...dated.map((e) => (Number.isFinite(e.span!.hi) ? e.span!.hi : e.span!.lo)));
  if (to - from < time.year) {
    from -= time.year;
    to += time.year;
  }
  const pad = (to - from) * 0.05;
  return { from: from - pad, to: to + pad };
}

/**
 * Lays events out along story time. Dated events are ordered by when they
 * begin (ties by name, then id) and packed into as few rows as keep both
 * marks and their labels apart: events at the same moment, or overlapping,
 * go side by side on separate rows. Undated ones are listed apart, with why.
 * Several timelines drawn together (tracks) pass the same `domain`, so an
 * event sits at the same place in every one of them.
 */
export function layoutAxis(events: EventRecord[], width = AXIS_WIDTH, domain = domainOf(events), time: AxisTime = STANDARD_TIME): Axis {
  const ids = new Set(events.map((e) => e.id));
  const dated = events.filter((e) => e.bounds).sort((a, b) => a.bounds!.start.lo - b.bounds!.start.lo || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  const unplaced = events.filter((e) => !e.bounds).sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id)).map((e) => ({ id: e.id, title: e.title, reason: unplacedReason(e, (id) => ids.has(id)) }));
  if (!dated.length || !domain) return { marks: [], unplaced, from: domain?.from ?? 0, to: domain?.to ?? time.year, width, lanes: 0 };
  const { from, to } = domain;
  const x = (t: number) => ((t - from) / (to - from)) * width;

  const laneEnds: number[] = [];
  const marks = dated.map((e): AxisMark => {
    const kind = kindOf(e, time.day);
    const { start: begins, end: ends } = e.bounds!;
    const start = begins.lo;
    const end = kind === 'ongoing' ? to : kind === 'moment' ? start : kind === 'uncertain' || kind === 'unended' || !ends ? begins.hi : Math.max(begins.hi, ends.hi);
    const lasts = kind === 'lasting' || kind === 'ongoing' || kind === 'unended';
    const startFuzz = lasts && rough(begins, time.day) ? { lo: begins.lo, hi: begins.hi } : null;
    const endFuzz = kind === 'lasting' && ends && rough(ends, time.day) ? { lo: ends.lo, hi: ends.hi } : null;
    const left = x(start);
    const right = Math.max(left, x(end));
    // The first row where this mark and its label fit after what is already there.
    const reach = Math.max(right, left + LABEL);
    let lane = laneEnds.findIndex((edge) => edge + 8 <= left);
    if (lane === -1) lane = laneEnds.push(reach) - 1;
    else laneEnds[lane] = reach;
    return { id: e.id, title: e.title, when: e.label, kind, start, end, startFuzz, endFuzz, lane, x: left, width: right - left };
  });
  return { marks, unplaced, from, to, width, lanes: laneEnds.length };
}
