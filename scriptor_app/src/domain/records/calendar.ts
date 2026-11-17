// A novel's calendar, worked out into minutes (`storyCalendars`). A port of
// flutter_app/lib/shared/domain/records/calendar.dart.

import { type JsonMap, listOf, mapOrNull, str } from '../json';
import { compareNum, dartSort } from '../manuscript/dartSort';
import { dartToLowerCase, dartTrim } from '../text/dartString';
import { dartRound } from './dartNum';
import {
  ApproximateDate,
  type EventDate,
  type EventDuration,
  ExactDate,
  type Season,
  type TimeUnit,
  seasons as allSeasons,
} from './event';
import { firstOrNull, intOrNull, maps } from './jsonRecord';

/** A stretch of story time in minutes from the start of year 0, both ends included. */
export class Span {
  constructor(
    readonly lo: number,
    readonly hi: number,
  ) {}

  equals(other: unknown): boolean {
    return other instanceof Span && other.lo === this.lo && other.hi === this.hi;
  }

  toString(): string {
    return `Span(${this.lo}, ${this.hi})`;
  }
}

export const monthNames: readonly string[] = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const minutesPerDayStandard = 1440.0;
const minutesPerYearStandard = 525600.0;
const standardSeasons: ReadonlyMap<Season, number> = new Map([
  ['spring', 3],
  ['summer', 6],
  ['autumn', 9],
  ['winter', 12],
]);

export class CalendarEra {
  constructor(
    readonly name: string,
    /** The first year of the era, counted as "Name 1". */
    readonly startYear: number,
  ) {}
}

/** A NOVEL'S CALENDAR, worked out into minutes. Most novels use the standard one (twelve even months, 24-hour days,
 * years numbered plainly). A novel can have its own months, day length, week length and eras.
 *
 * Changing the calendar never changes a stored date. A date that does not fit the calendar in use is not placed, and
 * says why, so switching back loses nothing. */
export class Calendar {
  readonly standard: boolean;
  readonly name: string;
  readonly months: readonly string[];
  readonly monthStarts: readonly number[];
  readonly monthLengths: readonly number[];
  readonly minutesPerYear: number;
  readonly minutesPerDay: number;
  readonly hoursPerDay: number;
  readonly daysPerWeek: number;
  readonly eras: readonly CalendarEra[];
  /** When each season begins and how long it lasts, in minutes from the start of the year. */
  readonly seasons: ReadonlyMap<Season, Span>;

  private constructor(args: {
    standard: boolean;
    name: string;
    months: readonly string[];
    monthStarts: readonly number[];
    monthLengths: readonly number[];
    minutesPerYear: number;
    minutesPerDay: number;
    hoursPerDay: number;
    daysPerWeek: number;
    eras: readonly CalendarEra[];
    seasons: ReadonlyMap<Season, Span>;
  }) {
    this.standard = args.standard;
    this.name = args.name;
    this.months = args.months;
    this.monthStarts = args.monthStarts;
    this.monthLengths = args.monthLengths;
    this.minutesPerYear = args.minutesPerYear;
    this.minutesPerDay = args.minutesPerDay;
    this.hoursPerDay = args.hoursPerDay;
    this.daysPerWeek = args.daysPerWeek;
    this.eras = args.eras;
    this.seasons = args.seasons;
  }

  static readonly standardCalendar: Calendar = (() => {
    const starts = Array.from({ length: 12 }, (_, i) => (i * minutesPerYearStandard) / 12);
    return new Calendar({
      standard: true,
      name: 'Standard calendar',
      months: monthNames,
      monthStarts: starts,
      monthLengths: Array.from({ length: 12 }, () => minutesPerYearStandard / 12),
      minutesPerYear: minutesPerYearStandard,
      minutesPerDay: minutesPerDayStandard,
      hoursPerDay: 24,
      daysPerWeek: 7,
      eras: [],
      seasons: seasonSpans(standardSeasons, starts, minutesPerYearStandard),
    });
  })();

  /** The calendar a novel uses, from its `storyCalendars` row. No row, a standard one, or a custom one that cannot be
   * read (a damaged import) gives the standard calendar, so dates always have somewhere to go. */
  static fromJson(row: JsonMap | null): Calendar {
    if (row === null || row['kind'] !== 'custom' || calendarProblems(row).length > 0) return Calendar.standardCalendar;
    const hoursPerDay = intOrNull(row['hoursPerDay'])!;
    const minutesPerDay = hoursPerDay * 60.0;
    const months = maps(row['months']);
    const lengths = months.map((m) => intOrNull(m['days'])! * minutesPerDay);
    const starts: number[] = [];
    let at = 0.0;
    for (const l of lengths) {
      starts.push(at);
      at += l;
    }
    const seasonsRow = mapOrNull(row['seasons'])!;
    const eras = dartSort(
      maps(row['eras']).map((e) => new CalendarEra(dartTrim(str(e['name'])), intOrNull(e['startYear'])!)),
      (a, b) => compareNum(a.startYear, b.startYear),
    );
    return new Calendar({
      standard: false,
      name: dartTrim(str(row['name'])),
      months: months.map((m) => dartTrim(str(m['name']))),
      monthStarts: starts,
      monthLengths: lengths,
      minutesPerYear: at,
      minutesPerDay,
      hoursPerDay,
      daysPerWeek: intOrNull(row['daysPerWeek'])!,
      eras,
      seasons: seasonSpans(new Map(allSeasons.map((s) => [s, intOrNull(seasonsRow[s])!])), starts, at),
    });
  }

  /** How many minutes one of a unit lasts. A month is the average month. */
  unitMinutes(unit: TimeUnit): number {
    switch (unit) {
      case 'minutes':
        return 1;
      case 'hours':
        return 60;
      case 'days':
        return this.minutesPerDay;
      case 'weeks':
        return this.minutesPerDay * this.daysPerWeek;
      case 'months':
        return this.minutesPerYear / this.months.length;
      case 'years':
        return this.minutesPerYear;
    }
  }

  durationMinutes(duration: EventDuration | null): number {
    return duration === null ? 0 : duration.amount * this.unitMinutes(duration.unit);
  }

  /** How many days a month (1-based) has. The standard calendar's even months hold up to 31. */
  daysIn(month: number): number {
    return this.standard
      ? 31
      : dartRound(
          (month >= 1 && month <= this.monthLengths.length ? this.monthLengths[month - 1] : 0) / this.minutesPerDay,
        );
  }

  monthName(month: number): string {
    return month >= 1 && month <= this.months.length ? this.months[month - 1] : `Month ${month}`;
  }

  /** A year as the calendar names it: "Year 10", or in an era, "Second Age 4". */
  yearName(year: number): string {
    const era = firstOrNull([...this.eras].reverse().filter((e) => year >= e.startYear));
    return era === null ? `Year ${year}` : `${era.name} ${year - era.startYear + 1}`;
  }

  /** Why a date is not in this calendar, or null when it is. */
  dateProblem(when: EventDate): string | null {
    if (!(when instanceof ExactDate) && !(when instanceof ApproximateDate)) return null;
    const month = when.month;
    const day = when instanceof ExactDate ? when.day : null;
    const hour = when instanceof ExactDate ? when.hour : null;
    const n = this.months.length;
    if (month !== null && (month < 1 || month > n)) {
      return `Month ${month} is not in ${this.standard ? 'the calendar' : `${this.name}, which has ${n} ${n === 1 ? 'month' : 'months'}`}.`;
    }
    if (!(when instanceof ExactDate) || this.standard) return null;
    if (month !== null && day !== null && (day < 1 || day > this.daysIn(month))) {
      return `${this.monthName(month)} has ${this.daysIn(month)} days in ${this.name}; day ${day} is not one of them.`;
    }
    if (hour !== null && (hour < 0 || hour >= this.hoursPerDay)) {
      return `A day in ${this.name} has ${this.hoursPerDay} hours; hour ${hour} is not one of them.`;
    }
    return null;
  }

  /** How much story time a dated year, month, season, day or time covers. Null for relative and undated dates, and
   * for dates not in this calendar. */
  spanOf(when: EventDate): Span | null {
    const stretch = (lo: number, length: number) => new Span(lo, lo + (length - 1 < 0 ? 0 : length - 1));
    if ((!(when instanceof ExactDate) && !(when instanceof ApproximateDate)) || this.dateProblem(when) !== null) {
      return null;
    }
    if (when instanceof ApproximateDate) {
      const base = when.year * this.minutesPerYear;
      const month = when.month;
      const season = when.season;
      if (month !== null) return stretch(base + this.monthStarts[month - 1], this.monthLengths[month - 1]);
      if (season !== null) {
        const s = this.seasons.get(season)!;
        return new Span(base + s.lo, base + s.hi);
      }
      return stretch(base, this.minutesPerYear);
    }
    const base = when.year * this.minutesPerYear;
    const m = when.month;
    if (m === null) return stretch(base, this.minutesPerYear);
    const month = base + this.monthStarts[m - 1];
    const d = when.day;
    if (d === null) return stretch(month, this.monthLengths[m - 1]);
    const day = month + (d - 1) * this.minutesPerDay;
    // The standard calendar's months are even twelfths of a year, so its 31st days are short: a day ends with its
    // month.
    const monthEnd = month + this.monthLengths[m - 1];
    const h = when.hour;
    if (h === null) {
      return stretch(
        day,
        day < monthEnd
          ? this.minutesPerDay < monthEnd - day
            ? this.minutesPerDay
            : monthEnd - day
          : this.minutesPerDay,
      );
    }
    const hour = day + h * 60;
    const min = when.minute;
    return min === null ? stretch(hour, 60) : new Span(hour + min, hour + min);
  }
}

function clampInt(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

function seasonSpans(
  starts: ReadonlyMap<Season, number>,
  monthStarts: readonly number[],
  year: number,
): Map<Season, Span> {
  const at = (s: Season) => monthStarts[clampInt(starts.get(s)!, 1, monthStarts.length) - 1];
  const sorted = dartSort([...allSeasons], (a, b) => compareNum(at(a), at(b)));
  const out = new Map<Season, Span>();
  for (const s of allSeasons) {
    const next = sorted[(sorted.indexOf(s) + 1) % sorted.length];
    // Until the next season begins, rounding into next year when it begins earlier; a season alone lasts the year.
    const raw = (((at(next) - at(s) + year) % year) + year) % year;
    const length = raw === 0 ? year : raw;
    out.set(s, new Span(at(s), at(s) + length - 1));
  }
  return out;
}

/** Limits that keep a calendar usable. */
export const calendarLimits = { months: 100, days: 1000, hours: 1000, week: 100, eras: 50 } as const;

/** What is wrong with calendar settings, in words; empty when they can be used. A standard calendar is always fine.
 * Whole numbers are Dart ints: a JSON `5.0`, which Dart reads as a double and refuses, reads here as 5. */
export function calendarProblems(input: JsonMap): string[] {
  if (input['kind'] !== 'custom') return [];
  const whole = (v: unknown, min: number, max: number): number | null => {
    const n = intOrNull(v);
    return n !== null && n >= min && n <= max ? n : null;
  };
  const text = (v: unknown) => dartTrim(str(v));
  const problems: string[] = [];
  const months = listOf(input['months']);
  if (text(input['name']).length === 0) problems.push('Give the calendar a name.');
  if (months.length === 0) problems.push('A calendar needs at least one month.');
  if (months.length > calendarLimits.months) problems.push(`A calendar can have up to ${calendarLimits.months} months.`);
  months.forEach((raw, i) => {
    const m = mapOrNull(raw);
    if (text(m?.['name']).length === 0) problems.push(`Month ${i + 1} needs a name.`);
    if (whole(m?.['days'], 1, calendarLimits.days) === null) {
      const label = text(m?.['name']).length === 0 ? `Month ${i + 1}` : text(m?.['name']);
      problems.push(`${label} needs a whole number of days, from 1 to ${calendarLimits.days}.`);
    }
  });
  const names = months
    .filter((m) => text(mapOrNull(m)?.['name']).length > 0)
    .map((m) => dartToLowerCase(text(mapOrNull(m)?.['name'])));
  if (new Set(names).size < names.length) problems.push('Two months have the same name.');
  if (whole(input['hoursPerDay'], 1, calendarLimits.hours) === null) {
    problems.push(`A day needs a whole number of hours, from 1 to ${calendarLimits.hours}.`);
  }
  if (whole(input['daysPerWeek'], 1, calendarLimits.week) === null) {
    problems.push(`A week needs a whole number of days, from 1 to ${calendarLimits.week}.`);
  }
  const eras = listOf(input['eras']);
  if (eras.length > calendarLimits.eras) problems.push(`A calendar can have up to ${calendarLimits.eras} eras.`);
  eras.forEach((raw, i) => {
    const e = mapOrNull(raw);
    if (text(e?.['name']).length === 0) problems.push(`Era ${i + 1} needs a name.`);
    if (intOrNull(e?.['startYear']) === null) {
      problems.push(`${text(e?.['name']).length === 0 ? `Era ${i + 1}` : text(e?.['name'])} needs a whole year to begin in.`);
    }
  });
  if (new Set(eras.map((e) => mapOrNull(e)?.['startYear'] ?? null)).size < eras.length) {
    problems.push('Two eras begin in the same year.');
  }
  const seasons = mapOrNull(input['seasons']);
  for (const s of allSeasons) {
    if (whole(seasons?.[s], 1, months.length === 0 ? 1 : months.length) === null) {
      problems.push(`Choose the month ${s} begins in.`);
    }
  }
  return problems;
}
