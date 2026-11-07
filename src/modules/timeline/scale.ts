import { STANDARD_CALENDAR, YEAR, yearName, type Calendar } from './calendar';

/**
 * The drawn timeline reads everything about time from the novel's calendar
 * (`calendar.ts`): how long a year, a month, a week and a day are, what the
 * months are called, and any eras years are counted in. It assumes nothing
 * of its own.
 */
export { yearName, type Calendar } from './calendar';
/** The standard calendar, under the name the timeline has always used for it. */
export const STORY_CALENDAR = STANDARD_CALENDAR;

/** A stretch of story time on screen, in minutes. */
export interface Window {
  from: number;
  to: number;
}

/** The average month, for choosing a scale. */
const monthMinutes = (c: Calendar) => c.minutesPerYear / c.months.length;

/** Which year, month (0-based), day (0-based) and minute of the day a moment falls in. */
export function partsOf(t: number, c: Calendar) {
  const year = Math.floor(t / c.minutesPerYear);
  const inYear = t - year * c.minutesPerYear;
  let month = c.monthStarts.length - 1;
  while (month > 0 && c.monthStarts[month] > inYear) month--;
  const inMonth = inYear - c.monthStarts[month];
  const day = Math.floor(inMonth / c.minutesPerDay);
  const minute = Math.floor(inMonth - day * c.minutesPerDay);
  return { year, month, day, minute };
}

/** Units the axis can count in, finest first, each with the round steps it counts by. */
export type Unit = 'hour' | 'day' | 'week' | 'month' | 'year';
const UNITS: { unit: Unit; steps: number[]; size: (c: Calendar) => number }[] = [
  { unit: 'hour', steps: [1, 2, 3, 6, 12], size: () => 60 },
  { unit: 'day', steps: [1, 2], size: (c) => c.minutesPerDay },
  { unit: 'week', steps: [1, 2], size: (c) => c.minutesPerDay * c.daysPerWeek },
  { unit: 'month', steps: [1, 2, 3, 6], size: monthMinutes },
  { unit: 'year', steps: [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1_000, 2_000, 5_000, 10_000, 20_000, 50_000, 100_000, 200_000, 500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000], size: (c) => c.minutesPerYear },
];

/** What a scale is called, for saying it aloud: "Showing decades". */
export function scaleName(unit: Unit, step: number): string {
  if (unit !== 'year') return { hour: 'hours', day: 'days', week: 'weeks', month: 'months' }[unit];
  return step >= 1000 ? 'millennia' : step >= 100 ? 'centuries' : step >= 10 ? 'decades' : 'years';
}

/** The finest unit and step whose marks are at least `minGap` pixels apart at this zoom. */
export function chooseScale(window: Window, width: number, c: Calendar, minGap = 90): { unit: Unit; step: number } {
  const perPixel = (window.to - window.from) / Math.max(1, width);
  for (const { unit, steps, size } of UNITS) {
    for (const step of steps) if ((size(c) * step) / perPixel >= minGap) return { unit, step };
  }
  return { unit: 'year', step: UNITS[UNITS.length - 1].steps.at(-1)! };
}

/**
 * The marks along the axis for what is on screen, at the chosen scale, on
 * the unit's own boundaries (the start of a day, a month, a year), labelled
 * the way the calendar names them. Labels say the larger unit where it
 * changes ("March Year 10", then "April").
 */
export function ticksFor(window: Window, width: number, c: Calendar): { t: number; label: string }[] {
  const { unit, step } = chooseScale(window, width, c);
  const ticks: { t: number; label: string }[] = [];
  const push = (t: number, label: string) => t >= window.from && t <= window.to && ticks.push({ t, label });
  if (unit === 'year') {
    const first = Math.ceil(window.from / c.minutesPerYear / step) * step;
    for (let y = first; y * c.minutesPerYear <= window.to && ticks.length < 200; y += step) push(y * c.minutesPerYear, yearName(y, c));
    return ticks;
  }
  if (unit === 'month') {
    const start = partsOf(window.from, c);
    for (let i = 0; ticks.length < 200; i++) {
      const index = start.year * c.months.length + start.month + i;
      const year = Math.floor(index / c.months.length);
      const month = index - year * c.months.length;
      if (month % step) continue;
      const t = year * c.minutesPerYear + c.monthStarts[month];
      if (t > window.to) break;
      push(t, month === 0 || !ticks.length ? `${c.months[month]} ${yearName(year, c)}` : c.months[month]);
    }
    return ticks;
  }
  // Hours, days and weeks are counted in whole days from the start of the year (a year is a whole number of days; a month need not be), each labelled with its day of the month.
  const size = unit === 'hour' ? 60 * step : unit === 'day' ? c.minutesPerDay * step : c.minutesPerDay * c.daysPerWeek * step;
  for (let t = Math.floor(window.from / size) * size; t <= window.to && ticks.length < 400; t += size) {
    const p = partsOf(t, c);
    const date = `${c.months[p.month]} ${p.day + 1}`;
    push(t, unit === 'hour' ? `${date}, ${String(Math.floor(p.minute / 60)).padStart(2, '0')}:00` : date);
  }
  return ticks;
}

/** The shortest and longest stretches the timeline will show: an hour, and a thousand times everything. */
export const limitsFor = (all: Window) => ({ shortest: 60, longest: Math.max(YEAR, (all.to - all.from) * 1000) });

/** Zooms by `factor` (above 1 closer) keeping the moment `at` where it is on screen. */
export function zoomWindow(window: Window, factor: number, at: number, all: Window): Window {
  const { shortest, longest } = limitsFor(all);
  const span = Math.min(longest, Math.max(shortest, (window.to - window.from) / factor));
  const share = (at - window.from) / (window.to - window.from || 1);
  return { from: at - share * span, to: at - share * span + span };
}

/** Slides the view by a share of what is on screen: −0.25 a quarter back in time, 0.25 a quarter on. */
export const panWindow = (window: Window, share: number): Window => {
  const shift = (window.to - window.from) * share;
  return { from: window.from + shift, to: window.to + shift };
};

/** Brings a moment to the middle of the screen, keeping the zoom. */
export const centreOn = (window: Window, t: number): Window => {
  const half = (window.to - window.from) / 2;
  return { from: t - half, to: t + half };
};

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Reads a date typed by the author, in the calendar's own terms: "10",
 * "Year -500", "10-6" (year and month), "10-6-14", "June 10" with a month
 * named as the calendar names it, and in a calendar with eras "Second Age 4"
 * or "Thaw Second Age 4". Returns the start of that year, month or day, and
 * how long it lasts, or null when it cannot be read.
 */
export function readDate(text: string, c: Calendar): { t: number; length: number } | null {
  let clean = text.trim();
  let year: number | null = null;
  // An era's year, longest names first so "Second Age" is not read as "Age".
  for (const era of [...c.eras].sort((a, b) => b.name.length - a.name.length)) {
    const found = clean.match(new RegExp(`^(.*?)\\s*${escape(era.name)}\\s+(-?\\d+)$`, 'i'));
    if (found) {
      year = era.startYear + Number(found[2]) - 1;
      clean = found[1].trim();
      break;
    }
  }
  clean = clean.replace(/^year\s+/i, '');
  let month: number | null = null, day: number | null = null;
  const numbers = clean.match(/^(-?\d+)(?:\s*[-/.]\s*(\d+))?(?:\s*[-/.]\s*(\d+))?$/);
  const monthNamed = (name: string) => c.months.findIndex((m) => m.toLowerCase() === name.trim().toLowerCase());
  if (year !== null) {
    // What is left of an era date is a month's name, or nothing.
    if (clean) {
      month = monthNamed(clean);
      if (month < 0) return null;
    }
  } else if (numbers) {
    year = Number(numbers[1]);
    month = numbers[2] ? Number(numbers[2]) - 1 : null;
    day = numbers[3] ? Number(numbers[3]) - 1 : null;
  } else {
    const named = clean.match(/^(.+?)\s+(?:year\s+)?(-?\d+)$/i);
    const index = named ? monthNamed(named[1]) : -1;
    if (!named || index < 0) return null;
    year = Number(named[2]);
    month = index;
  }
  if (!Number.isSafeInteger(year) || (month !== null && (month < 0 || month >= c.months.length))) return null;
  const monthLength = month !== null ? c.monthLengths[month] : 0;
  if (day !== null && (day < 0 || day * c.minutesPerDay >= monthLength)) return null;
  const t = year * c.minutesPerYear + (month !== null ? c.monthStarts[month] : 0) + (day ?? 0) * c.minutesPerDay;
  return { t, length: day !== null ? c.minutesPerDay : month !== null ? monthLength : c.minutesPerYear };
}
