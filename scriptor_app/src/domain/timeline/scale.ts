// The axis's scale, its marks, zoom and pan, and dates typed by the author. A port of
// flutter_app/lib/shared/domain/timeline/scale.dart.

import { dartEscape } from '../characters/pageText';
import { dartIntTryParse } from '../records/dartNum';
import type { Calendar } from '../records/calendar';
import { dartToLowerCase, dartTrim } from '../text/dartString';

/** A stretch of story time on screen, in minutes. */
export type TimeWindow = { from: number; to: number };

const monthMinutes = (c: Calendar) => c.minutesPerYear / c.months.length;

/** Which year, month (0-based), day (0-based) and minute of the day a moment falls in. */
export function partsOf(t: number, c: Calendar): { year: number; month: number; day: number; minute: number } {
  const year = Math.floor(t / c.minutesPerYear);
  const inYear = t - year * c.minutesPerYear;
  let month = c.monthStarts.length - 1;
  while (month > 0 && c.monthStarts[month] > inYear) month--;
  const inMonth = inYear - c.monthStarts[month];
  const day = Math.floor(inMonth / c.minutesPerDay);
  const minute = Math.floor(inMonth - day * c.minutesPerDay);
  return { year, month, day, minute };
}

/** Units the axis can count in, finest first. */
export type ScaleUnit = 'hour' | 'day' | 'week' | 'month' | 'year';
export const scaleUnits: readonly ScaleUnit[] = ['hour', 'day', 'week', 'month', 'year'];

const steps: Readonly<Record<ScaleUnit, readonly number[]>> = {
  hour: [1, 2, 3, 6, 12],
  day: [1, 2],
  week: [1, 2],
  month: [1, 2, 3, 6],
  year: [
    1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000,
    1000000, 2000000, 5000000, 10000000,
  ],
};

function size(unit: ScaleUnit, c: Calendar): number {
  switch (unit) {
    case 'hour':
      return 60;
    case 'day':
      return c.minutesPerDay;
    case 'week':
      return c.minutesPerDay * c.daysPerWeek;
    case 'month':
      return monthMinutes(c);
    case 'year':
      return c.minutesPerYear;
  }
}

/** What a scale is called, for saying it aloud: "Showing decades". */
export function scaleName(unit: ScaleUnit, step: number): string {
  switch (unit) {
    case 'hour':
      return 'hours';
    case 'day':
      return 'days';
    case 'week':
      return 'weeks';
    case 'month':
      return 'months';
    case 'year':
      return step >= 1000 ? 'millennia' : step >= 100 ? 'centuries' : step >= 10 ? 'decades' : 'years';
  }
}

/** The finest unit and step whose marks are at least `minGap` pixels apart at this zoom. */
export function chooseScale(window: TimeWindow, width: number, c: Calendar, minGap = 90): { unit: ScaleUnit; step: number } {
  const perPixel = (window.to - window.from) / Math.max(1, width);
  for (const unit of scaleUnits) {
    for (const step of steps[unit]) {
      if ((size(unit, c) * step) / perPixel >= minGap) return { unit, step };
    }
  }
  return { unit: 'year', step: steps.year[steps.year.length - 1] };
}

/** The marks along the axis for what is on screen, at the chosen scale, on the unit's own boundaries (the start of a
 * day, a month, a year), named the way the calendar names them. Labels say the larger unit where it changes ("March
 * Year 10", then "April"). */
export function ticksFor(window: TimeWindow, width: number, c: Calendar): { t: number; label: string }[] {
  const { unit, step } = chooseScale(window, width, c);
  const ticks: { t: number; label: string }[] = [];
  const push = (t: number, label: string) => {
    if (t >= window.from && t <= window.to) ticks.push({ t, label });
  };

  if (unit === 'year') {
    const first = Math.ceil(window.from / c.minutesPerYear / step) * step;
    for (let y = first; y * c.minutesPerYear <= window.to && ticks.length < 200; y += step) {
      push(y * c.minutesPerYear, c.yearName(y));
    }
    return ticks;
  }
  if (unit === 'month') {
    const start = partsOf(window.from, c);
    const count = c.months.length;
    // Counted: `ticks.length < 200` bounds it in Dart, and so do skipped months (at most `step` a tick) here.
    for (let i = 0; ticks.length < 200 && i < 200 * 12 * count; i++) {
      const index = start.year * count + start.month + i;
      const year = Math.floor(index / count);
      const month = index - year * count;
      if (month % step !== 0) continue;
      const t = year * c.minutesPerYear + c.monthStarts[month];
      if (t > window.to) break;
      push(t, month === 0 || ticks.length === 0 ? `${c.months[month]} ${c.yearName(year)}` : c.months[month]);
    }
    return ticks;
  }
  // Hours, days and weeks are counted in whole days from the start of the year (a year is a whole number of days; a
  // month need not be), each labelled with its day of the month.
  const length = unit === 'hour' ? 60.0 * step : unit === 'day' ? c.minutesPerDay * step : c.minutesPerDay * c.daysPerWeek * step;
  for (let t = Math.floor(window.from / length) * length; t <= window.to && ticks.length < 400; t += length) {
    const p = partsOf(t, c);
    const date = `${c.months[p.month]} ${p.day + 1}`;
    push(t, unit === 'hour' ? `${date}, ${String(Math.trunc(p.minute / 60)).padStart(2, '0')}:00` : date);
  }
  return ticks;
}

/** The shortest and longest stretches the timeline will show: an hour, and a thousand times everything. */
export function limitsFor(all: TimeWindow): { shortest: number; longest: number } {
  return { shortest: 60, longest: Math.max(525600, (all.to - all.from) * 1000) };
}

/** Zooms by `factor` (above 1 closer) keeping the moment `at` where it is on screen. */
export function zoomWindow(window: TimeWindow, factor: number, at: number, all: TimeWindow): TimeWindow {
  const { shortest, longest } = limitsFor(all);
  const span = Math.min(longest, Math.max(shortest, (window.to - window.from) / factor));
  const width = window.to - window.from;
  const share = (at - window.from) / (width === 0 ? 1 : width);
  return { from: at - share * span, to: at - share * span + span };
}

/** Slides the view by a share of what is on screen: -0.25 a quarter back in time, 0.25 a quarter on. */
export function panWindow(window: TimeWindow, share: number): TimeWindow {
  const shift = (window.to - window.from) * share;
  return { from: window.from + shift, to: window.to + shift };
}

/** Brings a moment to the middle of the screen, keeping the zoom. */
export function centreOn(window: TimeWindow, t: number): TimeWindow {
  const half = (window.to - window.from) / 2;
  return { from: t - half, to: t + half };
}

const maxSafe = 9007199254740991;

/** Dart's `int.parse` of digits a pattern has already matched (an optional minus and digits). */
const wholeOf = (digits: string): number => dartIntTryParse(digits)!;

/** Reads a date typed by the author, in the calendar's own terms: "10", "Year -500", "10-6" (year and month),
 * "10-6-14", "June 10" with a month named as the calendar names it, and in a calendar with eras "Second Age 4" or
 * "Thaw Second Age 4". Gives the start of that year, month or day and how long it lasts, or null when it cannot be
 * read. */
export function readDate(text: string, c: Calendar): { t: number; length: number } | null {
  let clean = dartTrim(text);
  let year: number | null = null;
  // An era's year, longest names first so "Second Age" is not read as "Age".
  const eras = [...c.eras].sort((a, b) => b.name.length - a.name.length);
  for (const era of eras) {
    const found = new RegExp(`^(.*?)\\s*${dartEscape(era.name)}\\s+(-?\\d+)$`, 'i').exec(clean);
    if (found !== null) {
      year = era.startYear + wholeOf(found[2]) - 1;
      clean = dartTrim(found[1]);
      break;
    }
  }
  clean = clean.replace(/^year\s+/i, '');
  let month: number | null = null;
  let day: number | null = null;
  const numbers = /^(-?\d+)(?:\s*[-/.]\s*(\d+))?(?:\s*[-/.]\s*(\d+))?$/.exec(clean);
  const monthNamed = (name: string) => c.months.findIndex((m) => dartToLowerCase(m) === dartToLowerCase(dartTrim(name)));
  if (year !== null) {
    // What is left of an era date is a month's name, or nothing.
    if (clean.length > 0) {
      month = monthNamed(clean);
      if (month < 0) return null;
    }
  } else if (numbers !== null) {
    year = dartIntTryParse(numbers[1]);
    month = numbers[2] !== undefined ? wholeOf(numbers[2]) - 1 : null;
    day = numbers[3] !== undefined ? wholeOf(numbers[3]) - 1 : null;
  } else {
    const named = /^(.+?)\s+(?:year\s+)?(-?\d+)$/i.exec(clean);
    const index = named === null ? -1 : monthNamed(named[1]);
    if (named === null || index < 0) return null;
    year = dartIntTryParse(named[2]);
    month = index;
  }
  if (year === null || Math.abs(year) > maxSafe || (month !== null && (month < 0 || month >= c.months.length))) return null;
  const monthLength = month !== null ? c.monthLengths[month] : 0.0;
  if (day !== null && (day < 0 || day * c.minutesPerDay >= monthLength)) return null;
  const t = year * c.minutesPerYear + (month !== null ? c.monthStarts[month] : 0) + (day ?? 0) * c.minutesPerDay;
  return {
    t,
    length: day !== null ? c.minutesPerDay : month !== null ? monthLength : c.minutesPerYear,
  };
}
