import { describe, expect, it } from 'vitest';
import { calendarFrom } from './calendar';
import { DAY, MONTH, YEAR } from './chronology';
import { centreOn, chooseScale, panWindow, partsOf, readDate, scaleName, STORY_CALENDAR, ticksFor, yearName, zoomWindow, type Calendar } from './scale';

const C = STORY_CALENDAR;
const W = 900;
const years = (a: number, b: number) => ({ from: a * YEAR, to: b * YEAR });
const named = (from: number, to: number) => {
  const s = chooseScale({ from, to }, W, C);
  return scaleName(s.unit, s.step);
};

/** A story's own calendar: ten months, no weeks of seven in mind, two named ages. */
const FROST: Calendar = calendarFrom({ kind: 'custom', name: 'The Reckoning', months: ['Thaw', 'Seed', 'Bloom', 'High', 'Swelter', 'Wane', 'Harvest', 'Mist', 'Frost', 'Deep'].map((name) => ({ name, days: 40 })), hoursPerDay: 24, daysPerWeek: 7, eras: [{ name: 'First Age', startYear: 0 }, { name: 'Second Age', startYear: 1000 }], seasons: { spring: 1, summer: 4, autumn: 7, winter: 9 } });

describe('scales', () => {
  it('chooses the finest scale that keeps its marks apart, from hours to millennia', () => {
    expect(named(0, 12 * 60)).toBe('hours');
    expect(named(0, 10 * DAY)).toBe('days');
    expect(named(0, 2 * MONTH)).toBe('weeks');
    expect(named(0, 1.5 * YEAR)).toBe('months');
    expect(named(0, 30 * YEAR)).toBe('years');
    expect(named(0, 300 * YEAR)).toBe('decades');
    expect(named(0, 3000 * YEAR)).toBe('centuries');
    expect(named(-2_000_000 * YEAR, 2_000_000 * YEAR)).toBe('millennia');
  });

  it('puts marks on the unit’s own boundaries, inside the view, never too close', () => {
    for (const [from, to] of [[0, 12 * 60], [3 * DAY, 13 * DAY], [0, 2 * MONTH], [5 * YEAR, 6.5 * YEAR], [-40 * YEAR, 300 * YEAR], [-3e6 * YEAR, 4e6 * YEAR]]) {
      const ticks = ticksFor({ from, to }, W, C);
      expect(ticks.length, `${from}..${to}`).toBeGreaterThan(1);
      expect(ticks.length, `${from}..${to}`).toBeLessThanOrEqual(W / 90 + 1);
      expect(ticks.every((t) => t.t >= from && t.t <= to)).toBe(true);
    }
    expect(ticksFor(years(1990, 2025), W, C).map((t) => t.t % YEAR)).toEqual(ticksFor(years(1990, 2025), W, C).map(() => 0));
  });

  it('counts through year zero into the past, and far into the future', () => {
    expect(ticksFor(years(-3, 3), W, C).map((t) => t.label)).toEqual(['Year -3', 'Year -2', 'Year -1', 'Year 0', 'Year 1', 'Year 2', 'Year 3']);
    expect(ticksFor(years(-1_000_000, -999_990), W, C)[0].label).toBe('Year -1000000');
    expect(ticksFor(years(5_000_000, 5_000_010), W, C).at(-1)!.label).toBe('Year 5000010');
    expect(partsOf(0, C)).toEqual({ year: 0, month: 0, day: 0, minute: 0 });
    expect(partsOf(-1, C)).toMatchObject({ year: -1, month: 11 });
    expect(partsOf(YEAR - 1, C)).toMatchObject({ year: 0, month: 11 });
  });

  it('names months with the year where it changes, and days with their month', () => {
    const months = ticksFor({ from: 10 * YEAR + 10 * MONTH, to: 11 * YEAR + 4 * MONTH }, W, C).map((t) => t.label);
    expect(months[0]).toBe('November Year 10');
    expect(months).toContain('January Year 11');
    expect(months).toContain('February');
    // Ten days fit day marks; five would show half-days.
    expect(ticksFor({ from: 10 * YEAR, to: 10 * YEAR + 10 * DAY }, W, C).map((t) => t.label).slice(0, 3)).toEqual(['January 1', 'January 2', 'January 3']);
    expect(chooseScale({ from: 10 * YEAR, to: 10 * YEAR + 5 * DAY }, W, C)).toEqual({ unit: 'hour', step: 12 });
    expect(ticksFor({ from: 10 * YEAR, to: 10 * YEAR + 8 * 60 }, W, C)[1].label).toMatch(/^January 1, 0\d:00$/);
  });

  it('follows a story’s own calendar: its months, year length and ages', () => {
    const months = ticksFor({ from: 1003 * FROST.minutesPerYear, to: 1004.5 * FROST.minutesPerYear }, W, FROST).map((t) => t.label);
    expect(months[0]).toBe('Thaw Second Age 4');
    // A year and a half shows every other month.
    expect(months).toEqual(['Thaw Second Age 4', 'Bloom', 'Swelter', 'Harvest', 'Frost', 'Thaw Second Age 5', 'Bloom', 'Swelter']);
    expect(months).not.toContain('January');
    expect([yearName(-5, FROST), yearName(0, FROST), yearName(999, FROST), yearName(1005, FROST)]).toEqual(['Year -5', 'First Age 1', 'First Age 1000', 'Second Age 6']);
    expect(readDate('Swelter 1004', FROST)).toEqual({ t: 1004 * FROST.minutesPerYear + 4 * 40 * DAY, length: 40 * DAY });
  });
});

describe('zooming and moving', () => {
  it('keeps the moment under the pointer where it is, so marks never jump', () => {
    const all = years(0, 100);
    const view = years(20, 60);
    const at = 35 * YEAR;
    const share = (w: { from: number; to: number }, t: number) => (t - w.from) / (w.to - w.from);
    const closer = zoomWindow(view, 4, at, all);
    expect(closer.to - closer.from).toBeCloseTo(10 * YEAR);
    expect(share(closer, at)).toBeCloseTo(share(view, at));
    // Two moments keep their order and their spacing in proportion.
    const [a, b] = [30 * YEAR, 40 * YEAR];
    expect(share(closer, b) - share(closer, a)).toBeCloseTo((share(view, b) - share(view, a)) * 4);
  });

  it('stops at an hour and at a thousand times the whole story', () => {
    const all = years(0, 10);
    let view = all;
    for (let i = 0; i < 100; i++) view = zoomWindow(view, 10, 5 * YEAR, all);
    expect(view.to - view.from).toBe(60);
    for (let i = 0; i < 100; i++) view = zoomWindow(view, 0.1, 5 * YEAR, all);
    expect(view.to - view.from).toBe(10_000 * YEAR);
  });

  it('pans by a share of the view and centres on a moment', () => {
    expect(panWindow(years(0, 40), 0.25)).toEqual(years(10, 50));
    expect(panWindow(years(0, 40), -0.25)).toEqual(years(-10, 30));
    expect(centreOn(years(0, 40), 100 * YEAR)).toEqual(years(80, 120));
  });
});

describe('typing a date to go to', () => {
  it('reads a year, a month, a day or a named month, in the calendar’s own terms', () => {
    expect(readDate('10', C)).toEqual({ t: 10 * YEAR, length: YEAR });
    expect(readDate('Year -500', C)).toEqual({ t: -500 * YEAR, length: YEAR });
    expect(readDate('10-6', C)).toEqual({ t: 10 * YEAR + 5 * MONTH, length: MONTH });
    expect(readDate('10-6-14', C)).toEqual({ t: 10 * YEAR + 5 * MONTH + 13 * DAY, length: DAY });
    expect(readDate('june year 10', C)).toEqual(readDate('10-6', C));
    expect(readDate(' 1000000 ', C)?.t).toBe(1_000_000 * YEAR);
  });

  it('says it cannot read what is not a date of this calendar', () => {
    for (const text of ['', 'abc', 'Octember 10', '10-13', '10-0', '10-6-40', 'Thaw 4', '1e9']) expect(readDate(text, C), text).toBeNull();
  });
});
