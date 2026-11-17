// A character's age at an event, and their life path. A port of flutter_app/lib/shared/domain/timeline/ages.dart.

import { TimeContext, boundsOfEvent } from '../model/validity';
import { Calendar, Span } from '../records/calendar';
import type { Entry } from '../records/entry';
import type { TimelineEvent } from '../records/event';
import { dartToLowerCase, dartTrim } from '../text/dartString';
import type { Placed } from './chronology';
import { partsOf, readDate } from './scale';

/** A character's age at an event, as exactly as what the author has said allows. */
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

export class Birth {
  constructor(
    /** The earliest and latest moment they can have been born. Null when nothing says, or the records disagree. */
    readonly span: Span | null,
    /** What it is worked out from, in words. */
    readonly basis: readonly string[],
    /** A date of birth on the profile that could not be read as a date, as written. */
    readonly unread: string | null,
    /** The records given disagree, so no birth can be worked out from them together. */
    readonly conflict: boolean,
  ) {}
}

export class Ages {
  constructor(
    readonly birth: Birth,
    /** The age at each event asked about. */
    readonly at: ReadonlyMap<string, AgeAt>,
    /** Things to check, by event: a stated age the other records do not allow, or taking part before being born. */
    readonly issues: ReadonlyMap<string, string>,
  ) {}
}

/** The profile fields read as a date of birth. */
export const birthFields = ['date of birth', 'birth date', 'birthdate', 'born'];

/** A character's date of birth as written on their profile, or null when there is none. */
export function birthDateOf(entry: Entry | null | undefined): string | null {
  if (entry == null) return null;
  for (const f of entry.fields) {
    if (birthFields.includes(dartToLowerCase(dartTrim(f.key))) && dartTrim(f.value).length > 0) return dartTrim(f.value);
  }
  return null;
}

/** The first and last minute of the calendar day a moment falls on. A day ends at its month's end. */
function dayOf(t: number, c: Calendar): Span {
  const p = partsOf(t, c);
  const lo = t - p.minute;
  const monthEnd = p.year * c.minutesPerYear + c.monthStarts[p.month] + c.monthLengths[p.month];
  return new Span(lo, Math.min(lo + c.minutesPerDay, monthEnd) - 1);
}

/** Whole years from one moment to another, counting birthdays by the calendar's day and month. */
function yearsBetween(born: number, at: number, c: Calendar): number {
  const b = partsOf(born, c);
  const a = partsOf(at, c);
  return a.year - b.year - (a.month < b.month || (a.month === b.month && a.day < b.day) ? 1 : 0);
}

/** How old someone born in `birth` is at `at`, as exactly as the two stretches allow. On the day they turn 17 they
 * are 17, whatever the hour. */
export function ageAt(birth: Span, at: Span, calendar?: Calendar | null): AgeAt {
  const c = calendar ?? Calendar.standardCalendar;
  const max = yearsBetween(birth.lo, at.hi, c);
  if (max < 0) return { kind: 'unborn' };
  const min = Math.max(0, yearsBetween(birth.hi, at.lo, c));
  return min === max ? { kind: 'known', age: max } : { kind: 'range', min, max };
}

/** "Age 26", "Age 25–26", "Before their birth"; empty when unknown. */
export function ageLabel(age: AgeAt): string {
  switch (age.kind) {
    case 'stated':
    case 'known':
      return `Age ${age.age}`;
    case 'range':
      return `Age ${age.min}–${age.max}`;
    case 'unborn':
      return 'Before their birth';
    case 'unknown':
      return '';
  }
}

/** The same in a sentence: "26", "25 or 26", "between 30 and 35", "unknown". */
export function ageWords(age: AgeAt): string {
  switch (age.kind) {
    case 'stated':
    case 'known':
      return `${age.age}`;
    case 'range':
      return age.max - age.min === 1 ? `${age.min} or ${age.max}` : `between ${age.min} and ${age.max}`;
    case 'unborn':
      return 'before their birth';
    case 'unknown':
      return 'unknown';
  }
}

type Clue = { label: string; span: Span; eventId: string | null; stated: number | null };

function meet(spans: readonly Span[]): Span | null {
  if (spans.length === 0) return null;
  const lo = spans.map((s) => s.lo).reduce((a, b) => Math.max(a, b));
  const hi = spans.map((s) => s.hi).reduce((a, b) => Math.min(a, b));
  return lo <= hi ? new Span(lo, hi) : null;
}

/** Dart's `num.toInt()`: towards zero. */
const toInt = (n: number): number => Math.trunc(n) + 0;

function statedAge(event: TimelineEvent, characterId: string): number | null {
  for (const c of event.characters) {
    if (c.id === characterId && c.age !== null) return toInt(c.age);
  }
  return null;
}

/** Ages for one character at the events asked about (by default, every event they take part in). `events` is the
 * whole timeline, so relative dates can be worked out. Reads only. */
export function agesOf(
  characterId: string,
  events: ReadonlyMap<string, TimelineEvent>,
  options: { calendar?: Calendar | null; birthDate?: string | null; eventIds?: readonly string[] | null } = {},
): Ages {
  const c = options.calendar ?? Calendar.standardCalendar;
  const context = new TimeContext({ position: new Map(), events, calendar: c });
  const year = c.minutesPerYear;
  const startOf = (id: string) => boundsOfEvent(id, context)?.start ?? null;
  const taking = [...events.values()].filter((e) => e.characters.some((x) => x.id === characterId));
  const clues: Clue[] = [];
  let unread: string | null = null;
  const birthDate = options.birthDate ?? null;
  if (birthDate !== null) {
    const read = readDate(birthDate, c);
    if (read !== null) {
      clues.push({
        label: `the date of birth on their profile (${birthDate})`,
        span: new Span(read.t, read.t + read.length - 1),
        eventId: null,
        stated: null,
      });
    } else {
      unread = birthDate;
    }
  }
  for (const event of taking) {
    const stated = statedAge(event, characterId);
    const at = stated === null ? null : startOf(event.id);
    if (stated === null || at === null) continue;
    // Age 0 is their birth. Age a means their a-th birthday has come and their next has not: born from the day after
    // a + 1 years before, to a years before.
    const span =
      stated === 0 ? at : new Span(dayOf(at.lo - (stated + 1) * year, c).hi + 1, dayOf(at.hi - stated * year, c).hi);
    clues.push({
      label: stated === 0 ? `their birth, “${event.name}”` : `age ${stated} at “${event.name}”`,
      span,
      eventId: event.id,
      stated,
    });
  }
  const span = meet(clues.map((clue) => clue.span));
  const conflict = clues.length > 0 && span === null;

  const issues = new Map<string, string>();
  // A stated age is checked against all the other clues; each that does not fit them is pointed out.
  for (const clue of clues) {
    if (clue.eventId === null || clue.stated === null) continue;
    const others = clues.filter((o) => o !== clue);
    const rest = meet(others.map((o) => o.span));
    if (rest === null) continue;
    const expected = ageAt(rest, startOf(clue.eventId)!, c);
    const fits =
      expected.kind === 'known'
        ? expected.age === clue.stated
        : expected.kind === 'range'
          ? clue.stated >= expected.min && clue.stated <= expected.max
          : false;
    if (!fits) {
      const words = expected.kind === 'unborn' ? 'before their birth' : ageLabel(expected).replace('Age ', '');
      issues.set(
        clue.eventId,
        `Stated as age ${clue.stated}, but the dates make it ${words} (counting from ${others.map((o) => o.label).join(' and ')}).`,
      );
    }
  }

  const at = new Map<string, AgeAt>();
  for (const id of options.eventIds ?? taking.map((e) => e.id)) {
    const event = events.get(id);
    if (event === undefined) continue;
    const stated = statedAge(event, characterId);
    if (stated !== null) {
      at.set(id, { kind: 'stated', age: stated });
      continue;
    }
    const when = startOf(id);
    if (when === null) {
      at.set(id, { kind: 'unknown', reason: 'this event has no date that can be worked out' });
    } else if (span === null) {
      at.set(id, {
        kind: 'unknown',
        reason: conflict ? 'the ages and dates given for them disagree' : 'no date of birth or age is given for them yet',
      });
    } else {
      const age = ageAt(span, when, c);
      at.set(id, age);
      if (age.kind === 'unborn' && event.characters.some((x) => x.id === characterId) && !issues.has(id)) {
        issues.set(id, 'Takes part here, but the dates put this before their birth.');
      }
    }
  }
  return new Ages(
    new Birth(
      span,
      clues.map((clue) => clue.label),
      unread,
      conflict,
    ),
    at,
    issues,
  );
}

export class LifeStep {
  constructor(
    readonly placed: Placed,
    /** The age as exactly as it is known. */
    readonly ageAt: AgeAt,
    readonly issue: string | null,
  ) {}

  /** Their age here when it is a single number, stated or worked out; null when it is a range or unknown. */
  get age(): number | null {
    return this.ageAt.kind === 'stated' || this.ageAt.kind === 'known' ? this.ageAt.age : null;
  }
  get stated(): boolean {
    return this.ageAt.kind === 'stated';
  }
  /** "Age 26", "Age 25–26", or empty. */
  get label(): string {
    return ageLabel(this.ageAt);
  }
}

/** A character's life path: every event they are part of, in story order, with their age at each. */
export function lifePath(
  placed: readonly Placed[],
  characterId: string,
  options: { calendar?: Calendar | null; birthDate?: string | null } = {},
): LifeStep[] {
  const events = new Map<string, TimelineEvent>();
  for (const p of placed) events.set(p.event.id, p.event);
  const mine = placed.filter((p) => p.event.characters.some((c) => c.id === characterId));
  const ages = agesOf(characterId, events, {
    calendar: options.calendar,
    birthDate: options.birthDate,
    eventIds: mine.map((p) => p.event.id),
  });
  return mine.map(
    (p) => new LifeStep(p, ages.at.get(p.event.id) ?? { kind: 'unknown', reason: '' }, ages.issues.get(p.event.id) ?? null),
  );
}

/** "Age 0: Mira is born → Age 7–8: Parents disappear → …" */
export function lifeSummary(steps: readonly LifeStep[]): string {
  return steps.map((s) => `${s.label.length > 0 ? `${s.label}: ` : ''}${s.placed.event.name}`).join(' → ');
}
