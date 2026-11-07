import type { LoreEntry } from '@/modules/codex/types';
import { boundsOfEvent, type TimeContext } from '@/modules/model/validity';
import { STANDARD_CALENDAR, type Calendar, type Span } from './calendar';
import type { Placed } from './chronology';
import { partsOf, readDate } from './scale';
import type { TimelineEvent } from './types';

/**
 * AGES
 * A character's age at an event is worked out only from what the author has
 * said, and only as exactly as that allows:
 *  - a date of birth on their profile (a field named "Date of Birth", "Birth
 *    date" or "Born"), read as a date in the novel's calendar;
 *  - an event where their age is 0: their birth;
 *  - their age at any other event ("17 at the tournament").
 * Every clue narrows when they can have been born; together they give the
 * earliest and latest possible birth. An age is then exact when the dates
 * allow it ("26"), a range when they do not ("25–26": born some time in
 * Year 1000, so on a day in 1026 they may not have had their birthday yet),
 * and unknown when nothing is said. Nothing is invented, and a stated age is
 * never changed: one that does not fit the others is pointed out.
 */
export type AgeAt =
  /** The author's own figure for this event. */
  | { kind: 'stated'; age: number }
  /** Worked out, exactly. */
  | { kind: 'known'; age: number }
  /** Worked out, as closely as the dates allow. */
  | { kind: 'range'; min: number; max: number }
  /** The event happens before they are born. */
  | { kind: 'unborn' }
  | { kind: 'unknown'; reason: string };

export interface Birth {
  /** When they were born, as closely as the records say: the earliest and latest moment. Null when nothing says, or the records disagree. */
  span: Span | null;
  /** What it is worked out from, in words. */
  basis: string[];
  /** A date of birth on the profile that could not be read as a date, as written. */
  unread: string | null;
  /** The records given disagree, so no birth can be worked out from them together. */
  conflict: boolean;
}

export interface Ages {
  birth: Birth;
  /** The age at each event asked about. */
  at: Map<string, AgeAt>;
  /** Things to check, by event: a stated age the other records do not allow, or taking part before being born. */
  issues: Map<string, string>;
}

/** The profile fields read as a date of birth. */
export const BIRTH_FIELDS = ['date of birth', 'birth date', 'birthdate', 'born'];

/** A character's date of birth as written on their profile, or null when there is none. */
export function birthDateOf(entry: Pick<LoreEntry, 'fields'> | undefined): string | null {
  const field = entry?.fields.find((f) => BIRTH_FIELDS.includes(f.key.trim().toLowerCase()) && f.value.trim());
  return field ? field.value.trim() : null;
}

/** The first and last minute of the calendar day a moment falls on. Months need not be whole days long, so a day ends at its month's end. */
function dayOf(t: number, c: Calendar): Span {
  const p = partsOf(t, c);
  const lo = t - p.minute;
  const monthEnd = p.year * c.minutesPerYear + c.monthStarts[p.month] + c.monthLengths[p.month];
  return { lo, hi: Math.min(lo + c.minutesPerDay, monthEnd) - 1 };
}

/** Whole years from one moment to another, counting birthdays by the calendar's day and month, as people count them. */
function yearsBetween(born: number, at: number, c: Calendar): number {
  const [b, a] = [partsOf(born, c), partsOf(at, c)];
  return a.year - b.year - (a.month < b.month || (a.month === b.month && a.day < b.day) ? 1 : 0);
}

/**
 * How old someone born in `birth` is at `at`, as exactly as the two
 * stretches allow. Birthdays are counted by the calendar's day and month:
 * on the day they turn 17 they are 17, whatever the hour.
 */
export function ageAt(birth: Span, at: Span, calendar: Calendar = STANDARD_CALENDAR): AgeAt {
  const max = yearsBetween(birth.lo, at.hi, calendar);
  if (max < 0) return { kind: 'unborn' };
  const min = Math.max(0, yearsBetween(birth.hi, at.lo, calendar));
  return min === max ? { kind: 'known', age: max } : { kind: 'range', min, max };
}

/** "Age 26", "Age 25–26", "Before their birth"; empty when unknown. */
export function ageLabel(age: AgeAt): string {
  if (age.kind === 'stated' || age.kind === 'known') return `Age ${age.age}`;
  if (age.kind === 'range') return `Age ${age.min}–${age.max}`;
  if (age.kind === 'unborn') return 'Before their birth';
  return '';
}

/** The same in a sentence: "26", "25 or 26", "between 30 and 35", "unknown". */
export function ageWords(age: AgeAt): string {
  if (age.kind === 'stated' || age.kind === 'known') return String(age.age);
  if (age.kind === 'range') return age.max - age.min === 1 ? `${age.min} or ${age.max}` : `between ${age.min} and ${age.max}`;
  if (age.kind === 'unborn') return 'before their birth';
  return 'unknown';
}

interface Clue {
  label: string;
  span: Span;
  /** The event it comes from, when it is a stated age. */
  eventId: string | null;
  stated: number | null;
}

const meet = (spans: Span[]): Span | null => {
  if (!spans.length) return null;
  const lo = Math.max(...spans.map((s) => s.lo));
  const hi = Math.min(...spans.map((s) => s.hi));
  return lo <= hi ? { lo, hi } : null;
};

/**
 * Ages for one character at the events asked about (by default, every event
 * they take part in). `events` is the whole timeline, so relative dates can
 * be worked out. Reads only.
 */
export function agesOf(characterId: string, events: ReadonlyMap<string, TimelineEvent>, calendar: Calendar = STANDARD_CALENDAR, birthDate: string | null = null, eventIds?: string[]): Ages {
  const context: TimeContext = { position: new Map(), events, calendar };
  const year = calendar.minutesPerYear;
  const startOf = (id: string) => boundsOfEvent(id, context)?.start ?? null;
  const taking = [...events.values()].filter((e) => e.characters.some((c) => c.id === characterId));
  const clues: Clue[] = [];
  let unread: string | null = null;
  if (birthDate) {
    const read = readDate(birthDate, calendar);
    if (read) clues.push({ label: `the date of birth on their profile (${birthDate})`, span: { lo: read.t, hi: read.t + read.length - 1 }, eventId: null, stated: null });
    else unread = birthDate;
  }
  for (const event of taking) {
    const stated = event.characters.find((c) => c.id === characterId && c.age !== null)?.age ?? null;
    const at = stated === null ? null : startOf(event.id);
    if (stated === null || !at) continue;
    // Age 0 is their birth. Age a means their a-th birthday has come and their next has not: born from the day after a + 1 years before, to a years before.
    const span = stated === 0 ? at : { lo: dayOf(at.lo - (stated + 1) * year, calendar).hi + 1, hi: dayOf(at.hi - stated * year, calendar).hi };
    clues.push({ label: stated === 0 ? `their birth, “${event.name}”` : `age ${stated} at “${event.name}”`, span, eventId: event.id, stated });
  }
  const span = meet(clues.map((c) => c.span));
  const conflict = clues.length > 0 && !span;

  const issues = new Map<string, string>();
  // A stated age is checked against all the other clues; each that does not fit them is pointed out.
  for (const clue of clues) {
    if (clue.eventId === null || clue.stated === null) continue;
    const others = clues.filter((c) => c !== clue);
    const rest = meet(others.map((c) => c.span));
    if (!rest) continue;
    const expected = ageAt(rest, startOf(clue.eventId)!, calendar);
    const fits = expected.kind === 'known' ? expected.age === clue.stated : expected.kind === 'range' ? clue.stated >= expected.min && clue.stated <= expected.max : false;
    if (!fits) issues.set(clue.eventId, `Stated as age ${clue.stated}, but the dates make it ${expected.kind === 'unborn' ? 'before their birth' : ageLabel(expected).replace('Age ', '')} (counting from ${others.map((c) => c.label).join(' and ')}).`);
  }

  const at = new Map<string, AgeAt>();
  for (const id of eventIds ?? taking.map((e) => e.id)) {
    const event = events.get(id);
    if (!event) continue;
    const stated = event.characters.find((c) => c.id === characterId && c.age !== null)?.age ?? null;
    if (stated !== null) {
      at.set(id, { kind: 'stated', age: stated });
      continue;
    }
    const when = startOf(id);
    if (!when) at.set(id, { kind: 'unknown', reason: 'this event has no date that can be worked out' });
    else if (!span) at.set(id, { kind: 'unknown', reason: conflict ? 'the ages and dates given for them disagree' : 'no date of birth or age is given for them yet' });
    else {
      const age = ageAt(span, when, calendar);
      at.set(id, age);
      if (age.kind === 'unborn' && event.characters.some((c) => c.id === characterId) && !issues.has(id)) issues.set(id, 'Takes part here, but the dates put this before their birth.');
    }
  }
  return { birth: { span, basis: clues.map((c) => c.label), unread, conflict }, at, issues };
}

export interface LifeStep {
  placed: Placed;
  /** Their age here when it is a single number, stated or worked out; null when it is a range or unknown. */
  age: number | null;
  stated: boolean;
  /** The age as exactly as it is known. */
  ageAt: AgeAt;
  /** "Age 26", "Age 25–26", or empty. */
  label: string;
  issue: string | null;
}

/**
 * A character's life path: every event they are part of, in chronological
 * order, with their age at each, worked out as `agesOf` does.
 */
export function lifePath(placed: Placed[], characterId: string, calendar: Calendar = STANDARD_CALENDAR, birthDate: string | null = null): LifeStep[] {
  const events = new Map(placed.map((p) => [p.event.id, p.event]));
  const mine = placed.filter((p) => p.event.characters.some((c) => c.id === characterId));
  const ages = agesOf(characterId, events, calendar, birthDate, mine.map((p) => p.event.id));
  return mine.map((p) => {
    const age = ages.at.get(p.event.id) ?? { kind: 'unknown', reason: '' };
    return { placed: p, age: age.kind === 'stated' || age.kind === 'known' ? age.age : null, stated: age.kind === 'stated', ageAt: age, label: ageLabel(age), issue: ages.issues.get(p.event.id) ?? null };
  });
}

/** "Age 0: Mira is born → Age 7–8: Parents disappear → …" */
export const lifeSummary = (steps: LifeStep[]): string => steps.map((s) => `${s.label ? `${s.label}: ` : ''}${s.placed.event.name}`).join(' → ');
