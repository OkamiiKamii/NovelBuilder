// How this novel counts time: the standard calendar, or one of its own with its own months, days, weeks, eras and
// seasons. Changes are a draft until saved, so the author sees what they will do first: how dates will read, and which
// events have dates the calendar does not have. Saving never changes an event. The pure parts of
// flutter_app/lib/features/timeline/calendar_page.dart.
//
// The page: the Plan switch; two radio rows (Standard calendar, "Twelve months, 24-hour days, years as “Year 10”."; A
// calendar of this novel's own, "Months, days, weeks and eras of your choosing."). For its own: "Begin from one of
// these, or build your own below" and the presets as cards 220 wide scrolling sideways (a calendar icon, the name, what
// it is like, "364 days in 13 months"), filling in every month at once; Calendar name; Months (each row: its name 200,
// its days 110, up, down, remove; Add a month); Hours in a day, Days in a week (180 each); Eras (name 200, From year
// 150, remove; Add an era); Seasons (a chooser 200 wide for each, "<Season> begins in"). Then what is wrong ("To fix
// before saving" and each problem in the error colour) or what it is ("<description>. Dates read like “…”."); the
// events it does not have (at most 8, each opening its event, "…and N more."); Save calendar and Discard changes; and
// what was saved.

import { type JsonMap, jsonEquals, mapOrNull, str } from '../../json';
import { Calendar, calendarLimits, calendarProblems } from '../../records/calendar';
import { ExactDate, seasons } from '../../records/event';
import { intOrNull, maps } from '../../records/jsonRecord';
import { dartIntTryParse, dartNumTryParse } from '../../records/dartNum';
import { dartTrim } from '../../text/dartString';
import { calendarPresets, yearOf } from '../calendarPresets';
import { calendarSettingsOf, describeCalendar, formatDate, seasonLabels } from '../dates';
import type { TimelineData } from './timelineData';

export const calendarWords = {
  title: 'Story calendar',
  standard: 'Standard calendar',
  standardAbout: 'Twelve months, 24-hour days, years as “Year 10”.',
  own: 'A calendar of this novel’s own',
  ownAbout: 'Months, days, weeks and eras of your choosing.',
  presets: 'Begin from one of these, or build your own below',
  name: 'Calendar name',
  months: 'Months',
  addMonth: 'Add a month',
  hours: 'Hours in a day',
  week: 'Days in a week',
  eras: 'Eras',
  erasCaption:
    'Optional. Years from an era’s first year on are counted in it: an era “Second Age” beginning in year 1000 makes year 1003 “Second Age 4”. Years before the first era stay “Year N”. Dates are still typed as plain years.',
  addEra: 'Add an era',
  noEras: 'No eras: years read “Year N”.',
  fromYear: 'From year',
  seasons: 'Seasons',
  seasonsCaption:
    'The month each season begins in, for dates given as “Summer of Year 10”. A season lasts until the next begins.',
  toFix: 'To fix before saving',
  save: 'Save calendar',
  discard: 'Discard changes',
} as const;

/** A number typed in a field of the draft: empty is not set, a whole number, else any number Dart reads. */
export function numberOf(text: string): number | null {
  const t = dartTrim(text);
  return t.length === 0 ? null : (dartIntTryParse(t) ?? dartNumTryParse(t));
}

/** The draft's changes, each from the draft as it stands. */
export const draftChanges = {
  kind: (custom: boolean) => (): JsonMap => ({ kind: custom ? 'custom' : 'standard' }),
  name: (v: string) => (): JsonMap => ({ name: v }),
  preset: (i: number) => (): JsonMap => ({ ...calendarPresets[i].settings }),
  month: (i: number, patch: JsonMap) => (current: JsonMap): JsonMap => ({
    months: maps(current['months']).map((m, j) => (j === i ? { ...m, ...patch } : m)),
  }),
  moveMonth: (i: number, by: number) => (current: JsonMap): JsonMap => {
    const months = maps(current['months']);
    const next = [...months];
    next[i] = months[i + by];
    next[i + by] = months[i];
    return { months: next };
  },
  /** A month taken out: the seasons that began after it begin a month earlier (never before the first). */
  removeMonth: (i: number) => (current: JsonMap): JsonMap => {
    const months = maps(current['months']);
    const ss = mapOrNull(current['seasons']) ?? {};
    const out: JsonMap = {};
    for (const s of seasons) {
      const at = intOrNull(ss[s]) ?? 1;
      const moved = Math.min(Math.max(at > i + 1 ? at - 1 : at, 0), months.length - 1);
      out[s] = moved === 0 ? 1 : moved;
    }
    return { months: months.filter((_, j) => j !== i), seasons: out };
  },
  addMonth: () => (current: JsonMap): JsonMap => ({ months: [...maps(current['months']), { name: '', days: 30 }] }),
  hours: (v: string) => (): JsonMap => ({ hoursPerDay: numberOf(v) }),
  week: (v: string) => (): JsonMap => ({ daysPerWeek: numberOf(v) }),
  era: (i: number, patch: JsonMap) => (current: JsonMap): JsonMap => ({
    eras: maps(current['eras']).map((e, j) => (j === i ? { ...e, ...patch } : e)),
  }),
  /** A new era, a thousand years after the last one begins (the first from year 1). */
  addEra: () => (current: JsonMap): JsonMap => {
    const eras = maps(current['eras']);
    const startYear = eras.length === 0 ? 1 : eras.map((e) => intOrNull(e['startYear']) ?? 0).reduce((a, b) => (a > b ? a : b)) + 1000;
    return { eras: [...eras, { name: '', startYear }] };
  },
  removeEra: (i: number) => (current: JsonMap): JsonMap => ({ eras: maps(current['eras']).filter((_, j) => j !== i) }),
  season: (season: string, month: number | null) => (current: JsonMap): JsonMap => ({
    seasons: { ...(mapOrNull(current['seasons']) ?? {}), [season]: month },
  }),
};

export type CalendarView = {
  custom: boolean;
  changed: boolean;
  problems: string[];
  /** What it is, when it has no problems: "<description>. Dates read like “…”." */
  summary: string | null;
  presets: { name: string; about: string; year: string }[];
  name: string;
  months: { name: string; nameLabel: string; days: string; daysLabel: string; up: string | null; down: string | null; remove: string | null }[];
  canAddMonth: boolean;
  hours: string;
  week: string;
  eras: { name: string; nameLabel: string; startYear: string; remove: string }[];
  canAddEra: boolean;
  seasons: { season: string; label: string; value: number | null; choices: { value: number; label: string }[] }[];
  /** The events this calendar does not have, at most 8 shown. */
  away: { total: number; count: string | null; shown: { id: string; text: string }[]; more: string | null };
  canSave: boolean;
};

/** The calendar page for the saved settings and the draft (null: nothing changed yet). */
export function calendarView(data: TimelineData, draft: JsonMap | null): CalendarView {
  const rows = data.cast.snapshot.rows('storyCalendars');
  const saved = calendarSettingsOf(rows.length === 0 ? null : rows[0]);
  const current = draft ?? saved;
  const months = maps(current['months']);
  const eras = maps(current['eras']);
  const changed = draft !== null && !jsonEquals(draft, saved);
  const problems = calendarProblems(current);
  const preview = Calendar.fromJson(current);
  const custom = current['kind'] === 'custom';
  const away =
    problems.length > 0
      ? []
      : [...data.model.events.values()].flatMap((e) => {
          const problem = (e.when === null ? null : preview.dateProblem(e.when)) ?? (e.end === null ? null : preview.dateProblem(e.end));
          return problem === null ? [] : [{ id: e.id, name: e.name, problem }];
        });
  const sampleYear = preview.eras.length > 0 ? preview.eras[preview.eras.length - 1].startYear + 3 : 10;
  const sample = formatDate(new ExactDate(sampleYear, { month: 1, day: 1 }), null, preview);
  const monthLabel = (i: number) => {
    const name = dartTrim(str(months[i]['name']));
    return name.length === 0 ? `month ${i + 1}` : name;
  };
  const seasonsNow = mapOrNull(current['seasons']);
  return {
    custom,
    changed,
    problems,
    summary: problems.length > 0 ? null : `${describeCalendar(preview)}. Dates read like “${sample}”.`,
    presets: calendarPresets.map((p) => ({ name: p.name, about: p.about, year: yearOf(p.settings) })),
    name: str(current['name']),
    months: months.map((m, i) => ({
      name: str(m['name']),
      nameLabel: `Name of month ${i + 1}`,
      days: m['days'] === null || m['days'] === undefined ? '' : `${m['days'] as number | string}`,
      daysLabel: `Days in ${monthLabel(i)}`,
      up: i === 0 ? null : `Move ${monthLabel(i)} up`,
      down: i === months.length - 1 ? null : `Move ${monthLabel(i)} down`,
      remove: months.length === 1 ? null : `Remove ${monthLabel(i)}`,
    })),
    canAddMonth: months.length < calendarLimits.months,
    hours: current['hoursPerDay'] === null || current['hoursPerDay'] === undefined ? '' : `${current['hoursPerDay'] as number | string}`,
    week: current['daysPerWeek'] === null || current['daysPerWeek'] === undefined ? '' : `${current['daysPerWeek'] as number | string}`,
    eras: eras.map((e, i) => ({
      name: str(e['name']),
      nameLabel: `Name of era ${i + 1}`,
      startYear: e['startYear'] === null || e['startYear'] === undefined ? '' : `${e['startYear'] as number | string}`,
      remove: `Remove ${dartTrim(str(e['name'])).length === 0 ? `era ${i + 1}` : dartTrim(str(e['name']))}`,
    })),
    canAddEra: eras.length < calendarLimits.eras,
    seasons: seasons.map((s) => {
      const at = intOrNull(seasonsNow?.[s]);
      return {
        season: s,
        label: `${seasonLabels[s]} begins in`,
        value: at !== null && at >= 1 && at <= months.length ? at : null,
        choices: months.map((m, i) => ({
          value: i + 1,
          label: dartTrim(str(m['name'])).length === 0 ? `Month ${i + 1}` : dartTrim(str(m['name'])),
        })),
      };
    }),
    away: {
      total: away.length,
      count:
        away.length === 0
          ? null
          : `${away.length} ${away.length === 1 ? 'event has a date' : 'events have dates'} this calendar does not have. ${changed ? 'Saving keeps them as they are:' : 'They are kept as they are:'} the timeline lists them apart, saying why, until the date or the calendar changes.`,
      shown: away.slice(0, 8).map((m) => ({ id: m.id, text: `${m.name}: ${m.problem}` })),
      more: away.length > 8 ? `…and ${away.length - 8} more.` : null,
    },
    canSave: changed && problems.length === 0,
  };
}

/** What saving says, once saved. */
export function savedMessage(current: JsonMap): string {
  const name = dartTrim(str(current['name']));
  return `Calendar saved. Every date in the novel is now read in the ${current['kind'] === 'custom' ? `“${name}” calendar` : 'standard calendar'}.`;
}

