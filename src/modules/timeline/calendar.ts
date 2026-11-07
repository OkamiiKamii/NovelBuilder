import { MONTHS, SEASONS, type EventDate, type Season, type TimeUnit } from './types';

/**
 * A NOVEL'S CALENDAR
 * Every date in the app is a year, a month, a day and a time, counted in the
 * novel's calendar. Most novels use the standard one: twelve months, 24-hour
 * days, years numbered plainly ("Year 10"). A novel can have its own instead:
 * months with its own names and lengths, days of its own length, weeks of its
 * own length, and named eras ("Second Age 4").
 *
 * Story time is counted in minutes from the start of year 0, so every dated
 * event has one number to be ordered by. A calendar says how a year, a month
 * and a day turn into minutes.
 *
 * Changing the calendar never changes a stored date. A date that does not fit
 * the calendar in use (month 12 when there are ten) is not placed, and says
 * why, so switching back loses nothing.
 */
export interface CalendarMonth {
  name: string;
  days: number;
}

export interface CalendarEra {
  name: string;
  /** The first year of the era, counted as "<name> 1". */
  startYear: number;
}

/** A novel's calendar as stored: one row per project. No row, or `kind: 'standard'`, is the standard calendar. */
export interface StoryCalendarRow {
  id: string;
  projectId: string;
  /** Which is in use. The custom settings are kept while the standard calendar is used, so switching back loses nothing. */
  kind: 'standard' | 'custom';
  name: string;
  months: CalendarMonth[];
  hoursPerDay: number;
  daysPerWeek: number;
  eras: CalendarEra[];
  /** The month (1-based) each season begins in. A season lasts until the next one begins. */
  seasons: Record<Season, number>;
  updatedAt: number;
}

export type CalendarSettings = Pick<StoryCalendarRow, 'kind' | 'name' | 'months' | 'hoursPerDay' | 'daysPerWeek' | 'eras' | 'seasons'>;

/** A stretch of story time in minutes, both ends included. */
export interface Span {
  lo: number;
  hi: number;
}

/** A calendar worked out into minutes, as everything that places or labels dates reads it. */
export interface Calendar {
  /** The standard calendar: dates read exactly as they always have. */
  standard: boolean;
  name: string;
  months: string[];
  /** Where each month begins, in minutes from the start of its year. */
  monthStarts: number[];
  /** How long each month is, in minutes. */
  monthLengths: number[];
  minutesPerYear: number;
  minutesPerDay: number;
  hoursPerDay: number;
  daysPerWeek: number;
  /** Named eras, earliest first. Years before the first are "Year N". */
  eras: CalendarEra[];
  /** When each season begins, and how long it lasts, in minutes from the start of the year. */
  seasons: Record<Season, Span>;
}

export const DAY = 1440;
export const YEAR = 525_600;
/** The standard calendar's months are even twelfths of its year. */
export const MONTH = YEAR / 12;

/** Spring in March, summer in June, autumn in September, winter in December. */
const STANDARD_SEASONS: Record<Season, number> = { spring: 3, summer: 6, autumn: 9, winter: 12 };
/** Real-world month lengths, the starting point for a calendar of one's own. */
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function seasonSpans(starts: Record<Season, number>, monthStarts: number[], year: number): Record<Season, Span> {
  const at = (s: Season) => monthStarts[Math.min(monthStarts.length, Math.max(1, starts[s])) - 1];
  const sorted = [...SEASONS].sort((a, b) => at(a) - at(b));
  return Object.fromEntries(
    SEASONS.map((s) => {
      const next = sorted[(sorted.indexOf(s) + 1) % sorted.length];
      // Until the next season begins, round into next year when it begins earlier in the year; a season alone lasts the year.
      const length = (at(next) - at(s) + year) % year || year;
      return [s, { lo: at(s), hi: at(s) + length - 1 }];
    }),
  ) as Record<Season, Span>;
}

export const STANDARD_CALENDAR: Calendar = {
  standard: true,
  name: 'Standard calendar',
  months: MONTHS,
  monthStarts: MONTHS.map((_, i) => i * MONTH),
  monthLengths: MONTHS.map(() => MONTH),
  minutesPerYear: YEAR,
  minutesPerDay: DAY,
  hoursPerDay: 24,
  daysPerWeek: 7,
  eras: [],
  seasons: seasonSpans(STANDARD_SEASONS, MONTHS.map((_, i) => i * MONTH), YEAR),
};

/** What a new calendar of the author's own starts from: the real-world months, ready to rename and resize. */
export const STARTING_CALENDAR: Omit<CalendarSettings, 'kind'> = {
  name: 'My calendar',
  months: MONTHS.map((name, i) => ({ name, days: MONTH_DAYS[i] })),
  hoursPerDay: 24,
  daysPerWeek: 7,
  eras: [],
  seasons: { ...STANDARD_SEASONS },
};

const whole = (value: unknown, min: number, max: number): number | null => (typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : null);
const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** Limits that keep a calendar usable: a month of up to a thousand days, a day of up to a thousand hours. */
export const LIMITS = { months: 100, days: 1000, hours: 1000, week: 100, eras: 50 };

/**
 * What is wrong with calendar settings, in words; empty when they can be
 * saved. A standard calendar is always fine: its own settings are kept for
 * later, and checked only when they are in use.
 */
export function calendarProblems(input: Partial<CalendarSettings>): string[] {
  if (input.kind !== 'custom') return [];
  const problems: string[] = [];
  const months = Array.isArray(input.months) ? input.months : [];
  if (!text(input.name)) problems.push('Give the calendar a name.');
  if (!months.length) problems.push('A calendar needs at least one month.');
  if (months.length > LIMITS.months) problems.push(`A calendar can have up to ${LIMITS.months} months.`);
  months.forEach((m, i) => {
    if (!text(m?.name)) problems.push(`Month ${i + 1} needs a name.`);
    if (whole(m?.days, 1, LIMITS.days) === null) problems.push(`${text(m?.name) || `Month ${i + 1}`} needs a whole number of days, from 1 to ${LIMITS.days}.`);
  });
  const names = months.map((m) => text(m?.name).toLowerCase()).filter(Boolean);
  if (new Set(names).size < names.length) problems.push('Two months have the same name.');
  if (whole(input.hoursPerDay, 1, LIMITS.hours) === null) problems.push(`A day needs a whole number of hours, from 1 to ${LIMITS.hours}.`);
  if (whole(input.daysPerWeek, 1, LIMITS.week) === null) problems.push(`A week needs a whole number of days, from 1 to ${LIMITS.week}.`);
  const eras = Array.isArray(input.eras) ? input.eras : [];
  if (eras.length > LIMITS.eras) problems.push(`A calendar can have up to ${LIMITS.eras} eras.`);
  eras.forEach((e, i) => {
    if (!text(e?.name)) problems.push(`Era ${i + 1} needs a name.`);
    if (!Number.isSafeInteger(e?.startYear)) problems.push(`${text(e?.name) || `Era ${i + 1}`} needs a whole year to begin in.`);
  });
  if (new Set(eras.map((e) => e?.startYear)).size < eras.length) problems.push('Two eras begin in the same year.');
  for (const season of SEASONS) if (whole(input.seasons?.[season], 1, Math.max(1, months.length)) === null) problems.push(`Choose the month ${season} begins in.`);
  return problems;
}

/** Settings as they can be stored: names trimmed, eras in order. Throws with the problems when they cannot be. */
export function cleanCalendar(input: Partial<CalendarSettings>): CalendarSettings {
  const problems = calendarProblems(input);
  if (problems.length) throw new Error(problems.join(' '));
  const fallback = STARTING_CALENDAR;
  const custom = input.kind === 'custom';
  // A standard calendar keeps whatever custom settings it was given that are usable, for switching back.
  const usable = custom || !calendarProblems({ ...input, kind: 'custom' }).length;
  const from = usable ? input : fallback;
  return {
    kind: custom ? 'custom' : 'standard',
    name: text(from.name),
    months: from.months!.map((m) => ({ name: text(m.name), days: m.days })),
    hoursPerDay: from.hoursPerDay!,
    daysPerWeek: from.daysPerWeek!,
    eras: from.eras!.map((e) => ({ name: text(e.name), startYear: e.startYear })).sort((a, b) => a.startYear - b.startYear),
    seasons: { ...from.seasons! },
  };
}

/**
 * The calendar a novel uses. No row, a standard one, or a custom one that
 * cannot be read (a damaged import) gives the standard calendar, so dates
 * always have somewhere to go.
 */
export function calendarFrom(row: Partial<CalendarSettings> | null | undefined): Calendar {
  if (!row || row.kind !== 'custom' || calendarProblems(row).length) return STANDARD_CALENDAR;
  const settings = cleanCalendar(row);
  const minutesPerDay = settings.hoursPerDay * 60;
  const monthLengths = settings.months.map((m) => m.days * minutesPerDay);
  const monthStarts = monthLengths.map((_, i) => monthLengths.slice(0, i).reduce((a, b) => a + b, 0));
  const minutesPerYear = monthLengths.reduce((a, b) => a + b, 0);
  return {
    standard: false,
    name: settings.name,
    months: settings.months.map((m) => m.name),
    monthStarts,
    monthLengths,
    minutesPerYear,
    minutesPerDay,
    hoursPerDay: settings.hoursPerDay,
    daysPerWeek: settings.daysPerWeek,
    eras: settings.eras,
    seasons: seasonSpans(settings.seasons, monthStarts, minutesPerYear),
  };
}

/** A calendar described in a few words: "Standard calendar", "The Reckoning: 10 months, 400 days a year". */
export function describeCalendar(c: Calendar): string {
  if (c.standard) return 'Standard calendar';
  const days = c.minutesPerYear / c.minutesPerDay;
  return `${c.name}: ${c.months.length} ${c.months.length === 1 ? 'month' : 'months'}, ${days.toLocaleString()} ${days === 1 ? 'day' : 'days'} a year${c.hoursPerDay !== 24 ? `, ${c.hoursPerDay}-hour days` : ''}${c.eras.length ? `, ${c.eras.length} ${c.eras.length === 1 ? 'era' : 'eras'}` : ''}`;
}

/** How many minutes one of a unit lasts in this calendar. A month is the average month. */
export function unitMinutes(unit: TimeUnit, c: Calendar): number {
  switch (unit) {
    case 'minutes':
      return 1;
    case 'hours':
      return 60;
    case 'days':
      return c.minutesPerDay;
    case 'weeks':
      return c.minutesPerDay * c.daysPerWeek;
    case 'months':
      return c.minutesPerYear / c.months.length;
    case 'years':
      return c.minutesPerYear;
  }
}

/** A year as the calendar names it: "Year 10", or in an era, "Second Age 4". */
export function yearName(year: number, c: Calendar): string {
  const era = [...c.eras].reverse().find((e) => year >= e.startYear);
  return era ? `${era.name} ${year - era.startYear + 1}` : `Year ${year}`;
}

/** A month's name, or "Month 13" for one the calendar does not have. */
export const monthName = (month: number, c: Calendar): string => c.months[month - 1] ?? `Month ${month}`;

/** How many days a month (1-based) has. The standard calendar's even months hold up to 31. */
export const daysIn = (month: number, c: Calendar): number => (c.standard ? 31 : Math.round((c.monthLengths[month - 1] ?? 0) / c.minutesPerDay));

/**
 * Why a dated year, month, day or time is not in this calendar, or null when
 * it is. The standard calendar is checked as it always was: a month must be
 * one of its twelve.
 */
export function dateProblem(when: EventDate, c: Calendar): string | null {
  if (when.precision !== 'exact' && when.precision !== 'approximate') return null;
  if (when.month !== null && (when.month < 1 || when.month > c.months.length)) return `Month ${when.month} is not in ${c.standard ? 'the calendar' : `${c.name}, which has ${c.months.length} ${c.months.length === 1 ? 'month' : 'months'}`}.`;
  if (when.precision !== 'exact' || c.standard) return null;
  if (when.month !== null && when.day !== null && (when.day < 1 || when.day > daysIn(when.month, c))) return `${monthName(when.month, c)} has ${daysIn(when.month, c)} days in ${c.name}; day ${when.day} is not one of them.`;
  if (when.hour !== null && (when.hour < 0 || when.hour >= c.hoursPerDay)) return `A day in ${c.name} has ${c.hoursPerDay} hours; hour ${when.hour} is not one of them.`;
  return null;
}

/**
 * How much story time a year, month, season, day or time covers in this
 * calendar: a day for a day, the season for "Summer of Year 10". Null for
 * dates that are not a year (relative, undated) and for dates not in the
 * calendar.
 */
export function spanOfCalendarDate(when: EventDate, c: Calendar): Span | null {
  const stretch = (lo: number, length: number): Span => ({ lo, hi: lo + Math.max(0, length - 1) });
  if ((when.precision !== 'exact' && when.precision !== 'approximate') || dateProblem(when, c)) return null;
  const base = when.year * c.minutesPerYear;
  if (when.precision === 'approximate') {
    if (when.month !== null) return stretch(base + c.monthStarts[when.month - 1], c.monthLengths[when.month - 1]);
    if (when.season !== null) return { lo: base + c.seasons[when.season].lo, hi: base + c.seasons[when.season].hi };
    return stretch(base, c.minutesPerYear);
  }
  if (when.month === null) return stretch(base, c.minutesPerYear);
  const month = base + c.monthStarts[when.month - 1];
  if (when.day === null) return stretch(month, c.monthLengths[when.month - 1]);
  const day = month + (when.day - 1) * c.minutesPerDay;
  // The standard calendar's months are even twelfths of a year, so its 31st days are short: a day ends with its month.
  const monthEnd = month + c.monthLengths[when.month - 1];
  if (when.hour === null) return stretch(day, day < monthEnd ? Math.min(c.minutesPerDay, monthEnd - day) : c.minutesPerDay);
  const hour = day + when.hour * 60;
  return when.minute === null ? stretch(hour, 60) : { lo: hour + when.minute, hi: hour + when.minute };
}
