// A date in the novel's calendar, as the event page and the history change sheet edit it, and the number fields it is
// typed in. The pure parts of flutter_app/lib/features/timeline/widgets/date_editor.dart and number_field.dart.
//
// The editor: a box titled `legend` ("When", "Ends on"); a row of precision chips (Exact, Approximate, Relative,
// Undated; those `offered`); then the fields of the chosen precision, wrapping, 12 apart:
//  - exact: Year (170, never empty, the era's name under it), Month (200: "Not set" and the calendar's months, and a
//    month the calendar does not have, "(not in this calendar)"), Day (120, only with a month), Hour (120, only with
//    a day), Minute (120, only with an hour);
//  - approximate: Year (170), Part of the year (240: "Sometime that year", the seasons, the months);
//  - relative: Amount (120, decimals), Unit (140), Before or after (140), Relative to (320: "Choose an event…" and the
//    other events);
//  - undated: "No date. Set “Comes after” below to give it a place in the order."
// Every change is worked out from the date as stored when it is saved (`DateEdit`), so a year typed and a month chosen
// in quick succession never undo one another. A second date's fields are named apart ("End year").

import type { JsonMap } from '../../json';
import { numOrNull } from '../../json';
import type { Calendar } from '../../records/calendar';
import { dartNumTryParse } from '../../records/dartNum';
import { ApproximateDate, EventDate, ExactDate, RelativeDate, type Season, type TimeUnit, seasonOf, seasons, timeUnits } from '../../records/event';
import { dartToLowerCase, dartTrim } from '../../text/dartString';
import type { Placed } from '../chronology';
import { precisionLabels, precisions, seasonLabels } from '../dates';

/** A change to a date, worked out from the date as it is stored at the moment it is saved. */
export type DateEdit = (stored: JsonMap) => JsonMap;

export const unitNames: Readonly<Record<TimeUnit, string>> = {
  minutes: 'minutes',
  hours: 'hours',
  days: 'days',
  weeks: 'weeks',
  months: 'months',
  years: 'years',
};

/** A field's name, with the second date's prefix ("End year"). */
export const named = (prefix: string, text: string): string => (prefix.length === 0 ? text : `${prefix} ${dartToLowerCase(text)}`);

/** Choosing a precision: the date begun anew in it, keeping its year (and month) where it can. */
export function setPrecision(precision: string, others: readonly Placed[]): DateEdit {
  return (stored) => {
    const year = numOrNull(stored['year']) ?? 1;
    const month = stored['month'] ?? null;
    switch (precision) {
      case 'exact':
        return { precision: 'exact', year, month, day: null, hour: null, minute: null };
      case 'approximate':
        return { precision: 'approximate', year, month, season: null };
      case 'relative':
        return {
          precision: 'relative',
          anchorId: others.length === 0 ? null : others[0].event.id,
          amount: 1,
          unit: 'years',
          direction: 'before',
        };
      default:
        return { precision: 'unknown' };
    }
  };
}

/** A field of one precision changed: applied only while the date is still of that precision. */
export function patch(precision: string, changes: JsonMap): DateEdit {
  return (stored) => (stored['precision'] === precision ? { ...stored, ...changes } : stored);
}

/** One field of the editor, as it is drawn and what saving it changes. */
export type DateField =
  | {
      kind: 'number';
      label: string;
      width: number;
      value: number | null;
      enabled: boolean;
      allowEmpty: boolean;
      decimals: boolean;
      hint: string | null;
      helper: string | null;
      /** Why a value cannot be saved, or null. */
      check: (v: number | null) => string | null;
      commit: (v: number | null) => DateEdit;
    }
  | {
      kind: 'choice';
      label: string;
      width: number;
      value: string;
      choices: { value: string; label: string }[];
      choose: (v: string) => DateEdit;
    }
  | { kind: 'note'; text: string };

/** The editor for a stored date (`when`) in `calendar`, its relative date chosen from `others`. */
export function dateEditor(args: {
  when: JsonMap | null;
  calendar: Calendar;
  others: readonly Placed[];
  legend?: string;
  prefix?: string;
  offered?: readonly string[];
}): {
  legend: string;
  precision: string;
  chips: { precision: string; label: string; selected: boolean; tooltip: string }[];
  fields: DateField[];
} {
  const calendar = args.calendar;
  const prefix = args.prefix ?? '';
  const offered = args.offered ?? precisions;
  const date = EventDate.fromJson(args.when);
  const precision = date?.precision ?? 'unknown';
  const n = (text: string) => named(prefix, text);
  const era = (year: number) =>
    calendar.eras.length === 0 || year !== Math.trunc(year) ? null : calendar.yearName(Math.trunc(year));
  const monthChoices = (month: number | null) => [
    { value: '0', label: 'Not set' },
    ...calendar.months.map((name, i) => ({ value: `${i + 1}`, label: name })),
    ...(month !== null && month > calendar.months.length
      ? [{ value: `${month}`, label: `${calendar.monthName(month)} (not in this calendar)` }]
      : []),
  ];
  let fields: DateField[];
  if (date instanceof ExactDate) {
    const { year, month, day, hour, minute } = date;
    const hasMonth = month !== null && month !== 0;
    fields = [
      {
        kind: 'number',
        label: n('Year'),
        width: 170,
        value: year,
        enabled: true,
        allowEmpty: false,
        decimals: false,
        hint: null,
        helper: era(year),
        check: () => null,
        commit: (v) => patch('exact', { year: v }),
      },
      {
        kind: 'choice',
        label: n('Month'),
        width: 200,
        value: `${month ?? 0}`,
        choices: monthChoices(month),
        choose: (v) => patch('exact', { month: v === '0' ? null : Number(v) }),
      },
      {
        kind: 'number',
        label: n('Day'),
        width: 120,
        value: day,
        enabled: hasMonth,
        allowEmpty: true,
        decimals: false,
        hint: hasMonth ? `1–${calendar.daysIn(month)}` : null,
        helper: null,
        check: (v) =>
          v !== null && month !== null && (v < 1 || v > calendar.daysIn(month))
            ? `${calendar.monthName(month)} has ${calendar.daysIn(month)} days: day ${Math.trunc(v)} was not saved.`
            : null,
        commit: (v) => patch('exact', { day: v }),
      },
      {
        kind: 'number',
        label: n('Hour'),
        width: 120,
        value: hour,
        enabled: day !== null && day !== 0,
        allowEmpty: true,
        decimals: false,
        hint: `0–${calendar.hoursPerDay - 1}`,
        helper: null,
        check: (v) =>
          v !== null && (v < 0 || v >= calendar.hoursPerDay)
            ? `A day has ${calendar.hoursPerDay} hours, from 0 to ${calendar.hoursPerDay - 1}: hour ${Math.trunc(v)} was not saved.`
            : null,
        commit: (v) => patch('exact', v === null ? { hour: null, minute: null } : { hour: v, minute: minute ?? 0 }),
      },
      {
        kind: 'number',
        label: n('Minute'),
        width: 120,
        value: minute,
        enabled: hour !== null,
        allowEmpty: true,
        decimals: false,
        hint: '0–59',
        helper: null,
        check: (v) => (v !== null && (v < 0 || v > 59) ? `A minute is from 0 to 59: ${showNumber(v)} was not saved.` : null),
        commit: (v) => patch('exact', { minute: v ?? 0 }),
      },
    ];
  } else if (date instanceof ApproximateDate) {
    const { year, month, season } = date;
    fields = [
      {
        kind: 'number',
        label: n('Year'),
        width: 170,
        value: year,
        enabled: true,
        allowEmpty: false,
        decimals: false,
        hint: null,
        helper: era(year),
        check: () => null,
        commit: (v) => patch('approximate', { year: v }),
      },
      {
        kind: 'choice',
        label: n('Part of the year'),
        width: 240,
        value: month !== null && month !== 0 ? `m${month}` : (season ?? ''),
        choices: [
          { value: '', label: 'Sometime that year' },
          ...seasons.map((s: Season) => ({ value: s, label: seasonLabels[s] })),
          ...calendar.months.map((name, i) => ({ value: `m${i + 1}`, label: name })),
          ...(month !== null && month > calendar.months.length
            ? [{ value: `m${month}`, label: `${calendar.monthName(month)} (not in this calendar)` }]
            : []),
        ],
        choose: (v) =>
          patch('approximate', {
            month: v.startsWith('m') ? Number(v.substring(1)) : null,
            season: seasonOf(v),
          }),
      },
    ];
  } else if (date instanceof RelativeDate) {
    const { anchorId, amount, unit, before } = date;
    fields = [
      {
        kind: 'number',
        label: n('Amount'),
        width: 120,
        value: amount,
        enabled: true,
        allowEmpty: false,
        decimals: true,
        hint: null,
        helper: null,
        check: (v) => (v !== null && v < 0 ? 'Give an amount of 0 or more; it was not changed.' : null),
        commit: (v) => patch('relative', { amount: v }),
      },
      {
        kind: 'choice',
        label: n('Unit'),
        width: 140,
        value: unit,
        choices: timeUnits.map((u) => ({ value: u, label: unitNames[u] })),
        choose: (v) => patch('relative', { unit: v }),
      },
      {
        kind: 'choice',
        label: n('Before or after'),
        width: 140,
        value: before ? 'before' : 'after',
        choices: [
          { value: 'before', label: 'before' },
          { value: 'after', label: 'after' },
        ],
        choose: (v) => patch('relative', { direction: v }),
      },
      {
        kind: 'choice',
        label: n('Relative to'),
        width: 320,
        value: args.others.some((p) => p.event.id === anchorId) ? (anchorId ?? '') : '',
        choices: [
          { value: '', label: 'Choose an event…' },
          ...args.others.map((p) => ({ value: p.event.id, label: p.event.name.length === 0 ? 'Untitled event' : p.event.name })),
        ],
        choose: (v) => patch('relative', { anchorId: v.length === 0 ? null : v }),
      },
    ];
  } else {
    fields = [{ kind: 'note', text: 'No date. Set “Comes after” below to give it a place in the order.' }];
  }
  return {
    legend: args.legend ?? 'When',
    precision,
    chips: offered.map((p) => ({
      precision: p,
      label: precisionLabels[p],
      selected: precision === p,
      tooltip: `${n('Date precision')}: ${precisionLabels[p]}`,
    })),
    fields,
  };
}

// ------------------------------------------------------------------------------------------------ the number field

/** A number as the field shows it: 10, not 10.0; empty when not set. */
export function showNumber(n: number | null): string {
  return n === null ? '' : n === Math.trunc(n) ? `${Math.trunc(n)}` : `${n}`;
}

/** What leaving a number field (or pressing Enter) does with what was typed: a problem said under the field (and
 * nothing saved), or the value to save (null: not set), or nothing to do when it is what is stored. A whole number
 * unless `decimals`; empty is "not set" unless not `allowEmpty`. */
export function commitNumber(
  text: string,
  field: { value: number | null; allowEmpty?: boolean; decimals?: boolean; check?: (v: number | null) => string | null },
): { problem: string } | { save: number | null } | { same: true } {
  const typed = dartTrim(text);
  const parsed = typed.length === 0 ? null : dartNumTryParse(typed);
  let problem: string | null;
  if (typed.length > 0 && parsed === null) {
    problem = 'Give a number; it was not changed.';
  } else if (parsed === null && field.allowEmpty === false) {
    problem = 'Give a number; it was not changed.';
  } else if (parsed !== null && field.decimals !== true && parsed !== Math.trunc(parsed)) {
    problem = 'Give a whole number; it was not changed.';
  } else {
    problem = field.check?.(parsed) ?? null;
  }
  if (problem !== null) return { problem };
  return parsed !== field.value ? { save: parsed } : { same: true };
}
