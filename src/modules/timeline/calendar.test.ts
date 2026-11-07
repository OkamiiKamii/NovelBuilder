import { describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { createCodexService, registerCodex } from '@/modules/codex/service';
import { eventRecords } from '@/modules/model/events';
import { loadModel } from '@/modules/model/model';
import { createProjectService } from '@/modules/projects/service';
import { calendarFrom, calendarProblems, cleanCalendar, DAY, dateProblem, describeCalendar, MONTH, spanOfCalendarDate, STANDARD_CALENDAR, STARTING_CALENDAR, unitMinutes, YEAR, type CalendarSettings } from './calendar';
import { createCalendarService } from './calendarService';
import { lifePath } from './ages';
import { durationMinutes, formatDate, resolveChronology } from './chronology';
import { readDate } from './scale';
import { createTimelineService, normalizeDate, registerTimeline } from './service';
import type { EventDate, TimelineEvent } from './types';

const exact = (year: number, month: number | null = null, day: number | null = null, hour: number | null = null): EventDate => ({ precision: 'exact', year, month, day, hour, minute: hour === null ? null : 0 });

/** The Reckoning: ten months of uneven length, 20-hour days, 5-day weeks, two ages. */
const RECKONING: CalendarSettings = {
  kind: 'custom',
  name: 'The Reckoning',
  months: [
    { name: 'Thaw', days: 30 },
    { name: 'Seed', days: 40 },
    { name: 'Bloom', days: 40 },
    { name: 'High', days: 40 },
    { name: 'Swelter', days: 40 },
    { name: 'Wane', days: 40 },
    { name: 'Harvest', days: 40 },
    { name: 'Mist', days: 40 },
    { name: 'Frost', days: 40 },
    { name: 'Deep', days: 50 },
  ],
  hoursPerDay: 20,
  daysPerWeek: 5,
  eras: [
    { name: 'Second Age', startYear: 1000 },
    { name: 'First Age', startYear: 0 },
  ],
  seasons: { spring: 1, summer: 4, autumn: 7, winter: 9 },
};
const R = calendarFrom(RECKONING);
const HOURS20 = 20 * 60;

describe('the standard calendar', () => {
  it('places every kind of date exactly where it always has', () => {
    // The formulas the app used before calendars: even twelfths of a 365-day year.
    const old = (year: number, month = 1, day = 1, hour = 0) => year * YEAR + (month - 1) * MONTH + (day - 1) * DAY + hour * 60;
    expect(spanOfCalendarDate(exact(1026, 10, 14, 20), STANDARD_CALENDAR)).toEqual({ lo: old(1026, 10, 14, 20), hi: old(1026, 10, 14, 20) });
    expect(spanOfCalendarDate({ ...exact(1026, 10, 14, 20), minute: null } as EventDate, STANDARD_CALENDAR)).toEqual({ lo: old(1026, 10, 14, 20), hi: old(1026, 10, 14, 20) + 59 });
    expect(spanOfCalendarDate(exact(10, 6), STANDARD_CALENDAR)).toEqual({ lo: old(10, 6), hi: old(10, 7) - 1 });
    expect(spanOfCalendarDate(exact(-500), STANDARD_CALENDAR)).toEqual({ lo: old(-500), hi: old(-499) - 1 });
    // Seasons: three months each, spring from March, winter from December into the next year.
    expect(spanOfCalendarDate({ precision: 'approximate', year: 10, month: null, season: 'summer' }, STANDARD_CALENDAR)).toEqual({ lo: old(10, 6), hi: old(10, 9) - 1 });
    expect(spanOfCalendarDate({ precision: 'approximate', year: 10, month: null, season: 'winter' }, STANDARD_CALENDAR)).toEqual({ lo: old(10, 12), hi: old(11, 3) - 1 });
    expect(formatDate(exact(1026, 10, 14, 20), undefined, STANDARD_CALENDAR)).toBe('Year 1026, October 14 — 8:00 PM');
    expect(formatDate({ precision: 'approximate', year: 10, month: 6, season: null })).toBe('June 10');
    expect(describeCalendar(STANDARD_CALENDAR)).toBe('Standard calendar');
  });

  it('is what a novel uses until it chooses its own', () => {
    expect(calendarFrom(null)).toBe(STANDARD_CALENDAR);
    expect(calendarFrom({ ...RECKONING, kind: 'standard' })).toBe(STANDARD_CALENDAR);
    // A damaged row (an edited backup) falls back rather than breaking every date.
    expect(calendarFrom({ ...RECKONING, months: [] })).toBe(STANDARD_CALENDAR);
  });
});

describe('a calendar of the novel’s own', () => {
  it('counts its own months, days, hours and weeks', () => {
    expect(R.minutesPerDay).toBe(HOURS20);
    expect(R.minutesPerYear).toBe(400 * HOURS20);
    expect(R.monthStarts.slice(0, 3)).toEqual([0, 30 * HOURS20, 70 * HOURS20]);
    expect(unitMinutes('weeks', R)).toBe(5 * HOURS20);
    expect(durationMinutes({ amount: 2, unit: 'years' }, R)).toBe(800 * HOURS20);
    // Bloom 3, hour 5 of a 20-hour day.
    expect(spanOfCalendarDate(exact(1003, 3, 3, 5), R)!.lo).toBe(1003 * 400 * HOURS20 + 70 * HOURS20 + 2 * HOURS20 + 5 * 60);
    expect(spanOfCalendarDate({ precision: 'approximate', year: 4, month: null, season: 'winter' }, R)).toEqual({ lo: 4 * 400 * HOURS20 + 310 * HOURS20, hi: 5 * 400 * HOURS20 - 1 });
  });

  it('names years in their era and reads them back', () => {
    expect(formatDate(exact(1003, 1, 3), undefined, R)).toBe('Second Age 4, Thaw 3');
    expect(formatDate(exact(1003, 1, 3, 17), undefined, R)).toBe('Second Age 4, Thaw 3 — 17:00');
    expect(formatDate(exact(-5), undefined, R)).toBe('Year -5');
    expect(formatDate({ precision: 'approximate', year: 12, month: null, season: 'summer' }, undefined, R)).toBe('Summer of First Age 13');
    expect(formatDate({ precision: 'approximate', year: 12, month: 2, season: null }, undefined, R)).toBe('Seed, First Age 13');
    expect(readDate('Second Age 4', R)).toEqual({ t: 1003 * R.minutesPerYear, length: R.minutesPerYear });
    expect(readDate('Bloom Second Age 4', R)).toEqual({ t: 1003 * R.minutesPerYear + R.monthStarts[2], length: 40 * HOURS20 });
    expect(readDate('1003-10-50', R)!.length).toBe(HOURS20);
    expect(readDate('1003-1-31', R)).toBeNull();
    expect(readDate('Octember Second Age 4', R)).toBeNull();
    expect(describeCalendar(R)).toBe('The Reckoning: 10 months, 400 days a year, 20-hour days, 2 eras');
  });

  it('says plainly when a date is not in it, without changing the date', () => {
    expect(dateProblem(exact(10, 11), R)).toBe('Month 11 is not in The Reckoning, which has 10 months.');
    expect(dateProblem(exact(10, 1, 31), R)).toBe('Thaw has 30 days in The Reckoning; day 31 is not one of them.');
    expect(dateProblem(exact(10, 2, 3, 22), R)).toBe('A day in The Reckoning has 20 hours; hour 22 is not one of them.');
    expect(dateProblem(exact(10, 13), STANDARD_CALENDAR)).toBe('Month 13 is not in the calendar.');
    expect([dateProblem(exact(10, 10, 50), R), dateProblem(exact(10, 2, 31), STANDARD_CALENDAR)]).toEqual([null, null]);
    expect(spanOfCalendarDate(exact(10, 11), R)).toBeNull();
  });

  it('checks settings before they can be saved', () => {
    expect(calendarProblems(RECKONING)).toEqual([]);
    expect(calendarProblems({ ...RECKONING, kind: 'standard', months: [] })).toEqual([]);
    expect(calendarProblems({ ...RECKONING, name: ' ', months: [{ name: 'Thaw', days: 0 }, { name: 'thaw', days: 3.5 }, { name: '', days: 4 }], hoursPerDay: NaN, eras: [{ name: 'A', startYear: 1 }, { name: '', startYear: 1 }], seasons: { ...RECKONING.seasons, winter: 9 } })).toEqual([
      'Give the calendar a name.',
      'Thaw needs a whole number of days, from 1 to 1000.',
      'thaw needs a whole number of days, from 1 to 1000.',
      'Month 3 needs a name.',
      'Two months have the same name.',
      'A day needs a whole number of hours, from 1 to 1000.',
      'Era 2 needs a name.',
      'Two eras begin in the same year.',
      'Choose the month summer begins in.',
      'Choose the month autumn begins in.',
      'Choose the month winter begins in.',
    ]);
    // Eras are kept in order; a standard calendar keeps the author's own settings for switching back.
    expect(cleanCalendar(RECKONING).eras.map((e) => e.name)).toEqual(['First Age', 'Second Age']);
    expect(cleanCalendar({ ...RECKONING, kind: 'standard' })).toMatchObject({ kind: 'standard', name: 'The Reckoning', months: RECKONING.months });
    expect(cleanCalendar({ kind: 'standard' })).toEqual({ kind: 'standard', ...STARTING_CALENDAR });
    expect(() => cleanCalendar({ ...RECKONING, months: [] })).toThrow('A calendar needs at least one month.');
  });

  it('orders events and counts ages in its own years', () => {
    const event = (id: string, when: EventDate, age: number | null = null): TimelineEvent => ({ id, projectId: 'p', name: id, description: '', when, duration: null, importance: 'minor', locationId: null, characters: [{ id: 'mira', age }], entryIds: [], nodeIds: [], afterId: null, createdAt: 0, updatedAt: 0 });
    const events = [event('late', exact(1010, 10, 50)), event('early', exact(1010, 1, 30)), event('lost', exact(1010, 11)), event('born', exact(1000, 1, 1), 0)];
    const placed = resolveChronology(events, R);
    expect(placed.map((p) => p.event.id)).toEqual(['born', 'early', 'late', 'lost']);
    expect(placed.find((p) => p.event.id === 'lost')).toMatchObject({ value: null, issues: ['Month 11 is not in The Reckoning, which has 10 months. It is not placed in time until its date or the calendar changes.'] });
    expect(placed.find((p) => p.event.id === 'late')!.label).toBe('Second Age 11, Deep 50');
    // Ten of its years, whatever their length in minutes.
    expect(lifePath(placed, 'mira', R).find((s) => s.placed.event.id === 'late')!.age).toBe(10);
  });
});

describe('a novel’s calendar, stored', () => {
  async function novel() {
    const db = new NovelDB(`calendar-${crypto.randomUUID()}`);
    const registry = createProjectRegistry();
    const projects = createProjectService(db, registry);
    registerCodex(registry);
    registerTimeline(registry);
    const p = await projects.create({ title: 'Ages' });
    const calendars = createCalendarService(db, projects.contentChanged);
    const timeline = createTimelineService(db, projects.contentChanged).forProject(p.id);
    const codex = createCodexService(db, projects.contentChanged).forProject(p.id);
    return { db, p, projects, cal: calendars.forProject(p.id), calendars, timeline, codex };
  }

  it('changes how dates read, never the dates themselves, and switching back restores everything', async () => {
    const s = await novel();
    expect(await s.cal.settings()).toEqual({ kind: 'standard', ...STARTING_CALENDAR });
    const siege = await s.timeline.create('The siege');
    await s.timeline.update(siege.id, { when: exact(1003, 11, 3) });
    const stored = async () => (await s.db.timelineEvents.get(siege.id))!.when;
    const label = async () => eventRecords((await loadModel(s.db, s.p.id))!)[0];
    expect((await label()).label).toBe('Year 1003, November 3');

    await s.cal.save(RECKONING);
    expect(await stored()).toEqual(exact(1003, 11, 3));
    expect(await label()).toMatchObject({ bounds: null, dateProblem: 'Month 11 is not in The Reckoning, which has 10 months.' });
    await s.timeline.update(siege.id, { when: exact(1003, 10, 45) });
    expect((await label()).label).toBe('Second Age 4, Deep 45');

    await s.cal.save({ ...(await s.cal.settings()), kind: 'standard' });
    expect((await label()).label).toBe('Year 1003, October 45');
    // The custom calendar is kept for switching back.
    expect(await s.cal.settings()).toMatchObject({ kind: 'standard', name: 'The Reckoning' });
    await expect(s.cal.save({ ...RECKONING, name: '' })).rejects.toThrow('Give the calendar a name.');
  });

  it('checks a date as it is saved against the calendar in use', async () => {
    const s = await novel();
    const e = await s.timeline.create('Feast');
    await s.cal.save({ ...RECKONING, months: [...RECKONING.months, { name: 'Gap', days: 5 }, { name: 'Long', days: 1000 }, { name: 'Last', days: 1 }] });
    await s.timeline.update(e.id, { when: exact(5, 13, 1) });
    expect((await s.db.timelineEvents.get(e.id))!.when).toEqual(exact(5, 13, 1));
    await s.timeline.update(e.id, { when: exact(5, 12, 999) });
    expect((await s.db.timelineEvents.get(e.id))!.when).toEqual(exact(5, 12, 999));
    await s.timeline.update(e.id, { when: { ...exact(5, 1, 31), hour: 19 } as EventDate });
    expect((await s.db.timelineEvents.get(e.id))!.when).toEqual(exact(5, 1, null));
    // The standard calendar keeps its old rules: twelve months, 31 days, 24 hours.
    expect(normalizeDate(exact(5, 13, 1))).toEqual(exact(5));
    expect(normalizeDate(exact(5, 12, 1, 23))).toEqual(exact(5, 12, 1, 23));
  });

  it('travels with its novel: copied, backed up, and deleted with it', async () => {
    const s = await novel();
    await s.cal.save(RECKONING);
    const copy = await s.projects.duplicate(s.p.id);
    expect(await s.calendars.forProject(copy.id).settings()).toEqual(cleanCalendar(RECKONING));
    const file = JSON.parse(JSON.stringify(await s.projects.exportSnapshot(s.p.id)));
    expect(file.collections.storyCalendars).toHaveLength(1);
    const imported = await s.projects.importSnapshot(file);
    expect((await loadModel(s.db, imported.id))!.calendar.name).toBe('The Reckoning');
    await s.projects.remove(s.p.id);
    expect(await s.db.storyCalendars.where('projectId').equals(s.p.id).count()).toBe(0);
    expect(await s.db.storyCalendars.count()).toBe(2);
  });
});
