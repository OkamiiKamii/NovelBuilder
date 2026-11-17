// Dates as the author reads and writes them, and calendar settings. A port of
// flutter_app/lib/shared/domain/timeline/dates.dart.

import { ChangeRefused } from '../codex/codexChanges';
import { type JsonMap, idOrNull, mapOrNull, str } from '../json';
import { compareNum, dartSort } from '../manuscript/dartSort';
import { Calendar, calendarProblems, monthNames } from '../records/calendar';
import { dartNumTryParse, dartRound } from '../records/dartNum';
import {
  ApproximateDate,
  type EventDate,
  type EventDuration,
  ExactDate,
  RelativeDate,
  type Season,
  type TimeUnit,
  seasonOf,
  timeUnitOf,
} from '../records/event';
import { maps } from '../records/jsonRecord';
import { dartTrim } from '../text/dartString';

/** A number as the original app writes it (`toLocaleString`): thousands grouped, at most three decimals. */
export function localeNumber(n: number): string {
  const rounded = dartRound(n * 1000) / 1000;
  const whole = Math.abs(Math.trunc(rounded));
  const digits = String(whole);
  let out = rounded < 0 ? '-' : '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ',';
    out += digits[i];
  }
  const fraction = dartRound((Math.abs(rounded) - whole) * 1000);
  if (fraction > 0) out += `.${String(fraction).padStart(3, '0').replace(/0+$/, '')}`;
  return out;
}

/** A number as JavaScript prints it in a template: 10, not 10.0. */
export function jsNum(n: number): string {
  return Number.isFinite(n) && n === Math.trunc(n) ? String(Math.trunc(n) + 0) : String(n);
}

/** JavaScript's `Math.round`: halves go up, also below zero. */
export function jsRound(n: number): number {
  return Math.floor(n + 0.5) + 0;
}

export const seasonLabels: Readonly<Record<Season, string>> = {
  spring: 'Spring',
  summer: 'Summer',
  autumn: 'Autumn',
  winter: 'Winter',
};

/** How exact a date is, as the editor offers it. */
export const precisionLabels: Readonly<Record<string, string>> = {
  exact: 'Exact',
  approximate: 'Approximate',
  relative: 'Relative',
  unknown: 'Undated',
};
export const precisions: readonly string[] = ['exact', 'approximate', 'relative', 'unknown'];

/** "1 day", "3 weeks", "1.5 years". */
export function unitLabel(amount: number, unit: TimeUnit): string {
  return `${localeNumber(amount)} ${amount === 1 ? unit.substring(0, unit.length - 1) : unit}`;
}

// Dart's `%`: never negative for a positive divisor.
const mod = (a: number, b: number) => ((a % b) + b) % b;

/** A time of day: "8:30 PM" in a 24-hour day, "27:30" in a calendar whose days are longer or shorter. */
function clock(hour: number, minute: number | null, c: Calendar): string {
  const mm = String(minute ?? 0).padStart(2, '0');
  if (c.hoursPerDay !== 24) return `${hour}:${mm}`;
  return `${mod(hour, 12) === 0 ? 12 : mod(hour, 12)}:${mm} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function yearName(year: number, c: Calendar): string {
  return year === Math.trunc(year) ? c.yearName(Math.trunc(year) + 0) : `Year ${jsNum(year)}`;
}

/** A date as the author would read it, in the novel's calendar: "Year 1026, October 14 — 8:30 PM", "Summer of Year
 * 10", "About 20 years before the Siege", "Second Age 4, Thaw 3". */
export function formatDate(
  when: EventDate | null,
  nameOf?: ((eventId: string) => string | null) | null,
  calendar?: Calendar | null,
): string {
  const c = calendar ?? Calendar.standardCalendar;
  if (when instanceof ExactDate) {
    const { year, month, day, hour, minute } = when;
    const date =
      month !== null && month !== 0 ? `, ${c.monthName(month)}${day !== null && day !== 0 ? ` ${day}` : ''}` : '';
    const time =
      hour !== null && month !== null && month !== 0 && day !== null && day !== 0 ? ` — ${clock(hour, minute, c)}` : '';
    return `${yearName(year, c)}${date}${time}`;
  }
  if (when instanceof ApproximateDate) {
    const { year, month, season } = when;
    // The standard calendar has always said "June 10" for June of Year 10; a calendar of the novel's own says it in
    // full.
    if (month !== null && month !== 0) {
      return c.standard ? `${c.monthName(month)} ${jsNum(year)}` : `${c.monthName(month)}, ${yearName(year, c)}`;
    }
    if (season !== null) return `${seasonLabels[season]} of ${yearName(year, c)}`;
    return `Around ${yearName(year, c)}`;
  }
  if (when instanceof RelativeDate) {
    const { anchorId, amount, unit, before } = when;
    const anchor = anchorId === null ? null : (nameOf?.(anchorId) ?? null);
    return `About ${unitLabel(amount, unit)} ${before ? 'before' : 'after'} ${anchor ?? 'an event that no longer exists'}`;
  }
  return 'Undated';
}

export function formatDuration(duration: EventDuration | null): string {
  return duration === null ? '' : unitLabel(duration.amount, duration.unit);
}

function whole(value: unknown, min: number, max: number): number | null {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && dartTrim(value).length > 0
        ? dartNumTryParse(dartTrim(value))
        : null;
  if (n === null || !Number.isFinite(n)) return null;
  const r = jsRound(n);
  return r >= min && r <= max ? r : null;
}

/** A date made valid for its precision, in the novel's calendar: a month it has, a day that month has, an hour its
 * days have. Detail that makes no sense is dropped; a date that needs a year and has none becomes undated. Checked
 * only when a date is saved: changing the calendar later never rewrites a stored date. */
export function normalizeDate(input: unknown, calendar?: Calendar | null): JsonMap {
  const c = calendar ?? Calendar.standardCalendar;
  const when = mapOrNull(input) ?? {};
  const year = whole(when['year'], -9999999, 9999999);
  if (when['precision'] === 'exact' && year !== null) {
    const month = whole(when['month'], 1, c.months.length);
    const day = month !== null ? whole(when['day'], 1, c.daysIn(month)) : null;
    const hour = day !== null ? whole(when['hour'], 0, c.hoursPerDay - 1) : null;
    return {
      precision: 'exact',
      year,
      month,
      day,
      hour,
      minute: hour !== null ? (whole(when['minute'], 0, 59) ?? 0) : null,
    };
  }
  if (when['precision'] === 'approximate' && year !== null) {
    const month = whole(when['month'], 1, c.months.length);
    const season = seasonOf(when['season']);
    return { precision: 'approximate', year, month, season: month === null ? season : null };
  }
  if (when['precision'] === 'relative') {
    const raw = when['amount'];
    const amount = typeof raw === 'number' ? raw : typeof raw === 'string' ? dartNumTryParse(dartTrim(raw)) : null;
    return {
      precision: 'relative',
      anchorId: idOrNull(when['anchorId']),
      amount: amount === null || !Number.isFinite(amount) ? 0 : Math.abs(amount),
      unit: timeUnitOf(when['unit']) ?? 'years',
      direction: when['direction'] === 'after' ? 'after' : 'before',
    };
  }
  return { precision: 'unknown' };
}

/** Real-world month lengths, the starting point for a calendar of one's own. */
const monthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** What a new calendar of the author's own starts from: the real-world months, ready to rename and resize. */
export function startingCalendar(): JsonMap {
  return {
    name: 'My calendar',
    months: monthNames.map((name, i) => ({ name, days: monthDays[i] })),
    hoursPerDay: 24,
    daysPerWeek: 7,
    eras: [],
    seasons: { spring: 3, summer: 6, autumn: 9, winter: 12 },
  };
}

/** The settings a novel with no calendar row has: the standard calendar, with a calendar of its own ready to fill
 * in. */
export function defaultCalendarSettings(): JsonMap {
  return { kind: 'standard', ...startingCalendar() };
}

/** Settings as they can be stored: names trimmed, eras in order. Refused (ChangeRefused) with the problems when they
 * cannot be. */
export function cleanCalendar(input: JsonMap): JsonMap {
  const problems = calendarProblems(input);
  if (problems.length > 0) throw new ChangeRefused(problems.join(' '));
  const custom = input['kind'] === 'custom';
  // A standard calendar keeps whatever custom settings it was given that are usable, for switching back.
  const usable = custom || calendarProblems({ ...input, kind: 'custom' }).length === 0;
  const from = usable ? input : startingCalendar();
  const eras = dartSort(
    maps(from['eras']).map((e) => ({ name: dartTrim(str(e['name'])), startYear: e['startYear'] ?? null })),
    (a, b) => compareNum(a.startYear as number, b.startYear as number),
  );
  return {
    kind: custom ? 'custom' : 'standard',
    name: dartTrim(str(from['name'])),
    months: maps(from['months']).map((m) => ({ name: dartTrim(str(m['name'])), days: m['days'] ?? null })),
    hoursPerDay: from['hoursPerDay'] ?? null,
    daysPerWeek: from['daysPerWeek'] ?? null,
    eras,
    seasons: { ...(mapOrNull(from['seasons']) ?? {}) },
  };
}

/** The settings as the author last saved them, or the defaults. A damaged row reads as the standard calendar. */
export function calendarSettingsOf(row: JsonMap | null): JsonMap {
  if (row === null) return defaultCalendarSettings();
  try {
    return cleanCalendar(row);
  } catch {
    return defaultCalendarSettings();
  }
}

/** A calendar described in a few words: "Standard calendar", "The Reckoning: 10 months, 400 days a year". */
export function describeCalendar(c: Calendar): string {
  if (c.standard) return 'Standard calendar';
  const days = c.minutesPerYear / c.minutesPerDay;
  const months = c.months.length;
  return (
    `${c.name}: ${months} ${months === 1 ? 'month' : 'months'}, ${localeNumber(days)} ${days === 1 ? 'day' : 'days'} a year` +
    `${c.hoursPerDay !== 24 ? `, ${c.hoursPerDay}-hour days` : ''}` +
    `${c.eras.length > 0 ? `, ${c.eras.length} ${c.eras.length === 1 ? 'era' : 'eras'}` : ''}`
  );
}
