import { describe, expect, it } from 'vitest';
import { agesOf, ageLabel, ageWords, birthDateOf, type AgeAt } from './ages';
import { calendarFrom, STANDARD_CALENDAR } from './calendar';
import type { EventDate, TimelineEvent } from './types';

const day = (year: number, month: number | null = null, d: number | null = null): EventDate => ({ precision: 'exact', year, month, day: d, hour: null, minute: null });
const season = (year: number, s: 'spring' | 'summer' | 'autumn' | 'winter'): EventDate => ({ precision: 'approximate', year, month: null, season: s });
const event = (id: string, when: EventDate, age: number | null = null, more: Partial<TimelineEvent> = {}): TimelineEvent => ({ id, projectId: 'p', name: id, description: '', when, duration: null, importance: 'minor', locationId: null, characters: [{ id: 'mira', age }], entryIds: [], nodeIds: [], afterId: null, createdAt: 0, updatedAt: 0, ...more });
const ages = (events: TimelineEvent[], birthDate: string | null = null, calendar = STANDARD_CALENDAR) => agesOf('mira', new Map(events.map((e) => [e.id, e])), calendar, birthDate);
const at = (events: TimelineEvent[], birthDate: string | null = null, calendar = STANDARD_CALENDAR) => Object.fromEntries([...ages(events, birthDate, calendar).at].map(([id, a]) => [id, ageLabel(a) || (a as Extract<AgeAt, { kind: 'unknown' }>).reason]));

describe('ages from a known birth', () => {
  it('counts whole years, birthday by birthday, from a date of birth on the profile', () => {
    const events = [event('eve', day(1026, 2, 28)), event('birthday', day(1026, 3, 1)), event('after', day(1026, 3, 2))];
    expect(at(events, '1000-3-1')).toEqual({ eve: 'Age 25', birthday: 'Age 26', after: 'Age 26' });
    expect(ages(events, '1000-3-1').birth.basis).toEqual(['the date of birth on their profile (1000-3-1)']);
  });

  it('or from the event of their birth (age 0), or any age stated at an event, exactly when the dates allow', () => {
    expect(at([event('born', day(1000, 3, 1), 0), event('awakens', { precision: 'relative', anchorId: 'born', amount: 17, unit: 'years', direction: 'after' }, null)])).toEqual({ born: 'Age 0', awakens: 'Age 17' });
    // Twelve on the first of March 1012 means twelve on that day every year after until the next birthday.
    expect(at([event('feast', day(1012, 3, 1), 12), event('later', day(1020, 3, 1))])).toEqual({ feast: 'Age 12', later: 'Age 20' });
  });

  it('follows a novel’s own calendar: its months, its year length, its eras', () => {
    const reckoning = calendarFrom({ kind: 'custom', name: 'The Reckoning', months: ['Thaw', 'Seed', 'Bloom', 'High', 'Deep'].map((name) => ({ name, days: 40 })), hoursPerDay: 20, daysPerWeek: 5, eras: [{ name: 'Second Age', startYear: 100 }], seasons: { spring: 1, summer: 2, autumn: 4, winter: 5 } });
    const events = [event('before', day(110, 2, 39)), event('on', day(110, 2, 40)), event('era', day(115, 1, 1))];
    expect(at(events, '100-2-40', reckoning)).toEqual({ before: 'Age 9', on: 'Age 10', era: 'Age 14' });
    // A birth given only as an era's year is a whole year of 200 days: the age is a range until the dates say more.
    expect(at([event('era', day(115, 1, 1))], 'Second Age 1', reckoning)).toEqual({ era: 'Age 14–15' });
  });
});

describe('ages from approximate dates', () => {
  it('give a range rather than a guess', () => {
    // Born some time in Year 1000: on a day in 1026 they may not have had their birthday yet.
    const events = [event('born', day(1000), 0), event('summer', season(1008, 'summer')), event('siege', day(1026, 10, 14)), event('year-end', day(1025, 12, 31))];
    // …but on the last day of 1025 everyone born in 1000 is 25.
    expect(at(events)).toEqual({ born: 'Age 0', summer: 'Age 7–8', siege: 'Age 25–26', 'year-end': 'Age 25' });
    // Fourteen some time in an autumn: born within a year and a quarter, so three ages are possible a few years on.
    expect(at([event('academy', season(1012, 'autumn'), 14), event('war', day(1015))])).toEqual({ academy: 'Age 14', war: 'Age 16–18' });
  });

  it('narrow as clues are added, every one counted', () => {
    const events = [event('born', day(1000), 0), event('feast', day(1010, 6, 1), 10), event('siege', day(1026, 10, 14))];
    // Born in 1000 and ten on 1 June 1010: born between 2 June 999 and 1 June 1000, so by the 1st of June 1000.
    expect(ages(events).birth.span!.hi).toBeLessThan(ages([events[0]]).birth.span!.hi);
    expect(at(events).siege).toBe('Age 26');
  });

  it('read the same in words: “25 or 26”, “between 16 and 18”', () => {
    expect([ageWords({ kind: 'range', min: 25, max: 26 }), ageWords({ kind: 'range', min: 16, max: 18 }), ageWords({ kind: 'known', age: 3 }), ageWords({ kind: 'unknown', reason: '' })]).toEqual(['25 or 26', 'between 16 and 18', '3', 'unknown']);
  });
});

describe('missing or contradictory birth and age data', () => {
  it('says unknown, and why, instead of inventing an age', () => {
    expect(at([event('arrives', day(1010))])).toEqual({ arrives: 'no date of birth or age is given for them yet' });
    expect(at([event('born', day(1000), 0), event('rumour', { precision: 'unknown' })])).toEqual({ born: 'Age 0', rumour: 'this event has no date that can be worked out' });
  });

  it('a date of birth that cannot be read is said to be unread, and not used', () => {
    const result = ages([event('arrives', day(1010))], 'in the spring after the flood');
    expect(result.birth).toMatchObject({ unread: 'in the spring after the flood', span: null, conflict: false });
    expect(result.at.get('arrives')).toMatchObject({ kind: 'unknown' });
  });

  it('ages that disagree are each pointed out, and a stated age is never changed', () => {
    const events = [event('born', day(1000, 3, 1), 0), event('graduation', day(1016, 6, 1), 22), event('siege', day(1026))];
    const result = ages(events);
    expect(result.birth.conflict).toBe(true);
    expect(result.at.get('graduation')).toEqual({ kind: 'stated', age: 22 });
    expect(result.at.get('siege')).toEqual({ kind: 'unknown', reason: 'the ages and dates given for them disagree' });
    expect(result.issues.get('graduation')).toBe('Stated as age 22, but the dates make it 16 (counting from their birth, “born”).');
    // A third clue that agrees with the birth shows which one is out of line: only that one is pointed out.
    const three = ages([...events, event('school', day(1006, 3, 1), 6)]);
    expect([...three.issues.keys()]).toEqual(['graduation']);
  });

  it('taking part before being born is pointed out', () => {
    const result = ages([event('born', day(1000), 0), event('war', day(990, 5, 1))]);
    expect(result.at.get('war')).toEqual({ kind: 'unborn' });
    expect(result.issues.get('war')).toBe('Takes part here, but the dates put this before their birth.');
  });

  it('reads the date of birth from the profile field the author filled in', () => {
    const field = (key: string, value: string) => ({ id: key, key, value });
    expect(birthDateOf({ fields: [field('Age', '27'), field('Date of Birth', ' 1000-3-1 ')] })).toBe('1000-3-1');
    expect(birthDateOf({ fields: [field('Born', '')] })).toBeNull();
    expect(birthDateOf(undefined)).toBeNull();
  });
});
