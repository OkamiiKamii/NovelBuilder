// REVIEWING THE TIMELINE. A port of flutter_app/lib/shared/domain/timeline/review.dart.
//
// Deterministic checks of the timeline against itself and against what the author has recorded elsewhere. Each
// finding comes from one stated rule, says what records it rests on, and is raised only when those records hold the
// data the rule needs: no date, no place or no recorded travel time means no finding, never a guess. Same records,
// same findings, every time.
//
// Findings are suggestions. Nothing here changes an event, a date, a place or canon. The author fixes the records (and
// the finding goes), or keeps a decision about it, stored with the continuity decisions under a key that starts
// "timeline|". The event page (#271) shows the date, travel and two-places findings beside its own problems; the full
// review screen comes with Review.

import { localeCompare } from '../collation';
import { type JsonMap, idOrNull, numOrNull, str } from '../json';
import { compareNum } from '../manuscript/dartSort';
import type { StoryModel } from '../model/storyModel';
import { boundsOfEvent, spanOfDate } from '../model/validity';
import { stableSorted } from '../reader/stableSort';
import { RelativeDate, timeUnitOf } from '../records/event';
import { type ReviewItem, decisionCloses } from '../records/review';
import { agesOf, birthDateOf } from './ages';
import { resolveChronology } from './chronology';
import { formatDate, jsNum, jsRound, localeNumber } from './dates';
import { together, togetherCertain } from './overlap';

export type ReviewRule = 'dates' | 'follows' | 'anchor' | 'calendar' | 'ages' | 'born' | 'travel' | 'two-places';
export const reviewRules: readonly ReviewRule[] = ['dates', 'follows', 'anchor', 'calendar', 'ages', 'born', 'travel', 'two-places'];

/** Each rule: its title, the rule in words, and what it needs to be checked. */
export const reviewRuleWords: Readonly<Record<ReviewRule, { title: string; rule: string; needs: string }>> = {
  dates: {
    title: 'Ends before it starts',
    rule: 'An event cannot end before it begins.',
    needs: 'A start date and an end date that can both be worked out.',
  },
  follows: {
    title: 'Dated before what it follows',
    rule: 'An event set to come after another (“Comes after”) cannot be dated before it.',
    needs: 'Both events dated.',
  },
  anchor: {
    title: 'Dated from an event that is gone',
    rule: 'A date given relative to another event (“two days after the siege”) needs that event to exist.',
    needs: 'A relative date.',
  },
  calendar: {
    title: 'Date not in the calendar',
    rule: 'A date must exist in the novel’s calendar: a month it has, a day that month has, an hour its days have.',
    needs: 'A date with a month, day or hour.',
  },
  ages: {
    title: 'Ages that disagree',
    rule: 'A character’s age at an event must fit their date of birth and the ages given for them at other events, birthdays counted by the calendar.',
    needs: 'At least two of: a date of birth on their profile, their age at a dated event.',
  },
  born: {
    title: 'Takes part before being born',
    rule: 'A character cannot take part in an event before they are born.',
    needs: 'A birth worked out from their records, and the event dated.',
  },
  travel: {
    title: 'Too little time to travel',
    rule: 'When a character is at one place and next at another, the time between the two events must be at least the travel time recorded between those places.',
    needs: 'Both events dated with a place, and a travel time recorded between the places.',
  },
  'two-places': {
    title: 'In two places at once',
    rule: 'A character cannot be at two events at the same time in two different places, unless one place lies inside the other.',
    needs: 'Both events dated closely enough to be certainly at the same time, each with a place.',
  },
};

export class ReviewFinding {
  constructor(
    /** The same for the same finding on every run, built from the records' ids, so a decision about it holds. */
    readonly key: string,
    readonly rule: ReviewRule,
    /** What was found, in a sentence. */
    readonly message: string,
    /** The facts it rests on, in words. */
    readonly because: string,
    /** The records to open to resolve it. */
    readonly eventIds: readonly string[],
    readonly entryIds: readonly string[],
    /** A recorded travel time, for the travel rule. */
    readonly ruleId: string | null = null,
  ) {}

  toJson(): JsonMap {
    return {
      key: this.key,
      rule: this.rule,
      message: this.message,
      because: this.because,
      eventIds: [...this.eventIds],
      entryIds: [...this.entryIds],
      ruleId: this.ruleId,
    };
  }
}

const keyOf = (rule: ReviewRule, ids: readonly string[]) => ['timeline', rule, ...ids].join('|');
const travelUnits = new Set(['minutes', 'hours', 'days', 'weeks', 'months']);

/** A length of time in words, at the largest whole unit: "5 days", "36 hours". */
function lengthWords(minutes: number, dayMinutes: number): string {
  for (const [size, name] of [
    [dayMinutes, 'day'],
    [60.0, 'hour'],
    [1.0, 'minute'],
  ] as const) {
    if (minutes >= size && minutes % size === 0) {
      const n = minutes / size;
      return `${localeNumber(n)} ${name}${n === 1 ? '' : 's'}`;
    }
  }
  return `${localeNumber(jsRound(minutes / 60))} hours`;
}

/** Every finding for a novel's timeline. `rules` are the continuity rules rows (only travel times are read). */
export function reviewTimeline(model: StoryModel, rules: readonly JsonMap[] = []): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const context = model.timeContext;
  const calendar = model.calendar;
  const events = model.events;
  const name = (id: string) => events.get(id)?.name ?? 'an event';
  const entry = (id: string | null) => (id === null ? null : (model.entries.get(id)?.name ?? null));
  const nameOf = (id: string) => events.get(id)?.name ?? null;
  const dateOf = (id: string) => formatDate(events.get(id)!.when, nameOf, calendar);
  const calendarName = calendar.standard ? 'the calendar' : calendar.name;

  // Dates: each event against itself, the event it follows, and the calendar.
  const placed = new Map(resolveChronology(events.values(), calendar).map((p) => [p.event.id, p]));
  for (const event of events.values()) {
    for (const [which, date] of [
      ['start', event.when],
      ['end', event.end],
    ] as const) {
      if (date === null) continue;
      const words = which === 'start' ? 'date' : 'end date';
      const problem = calendar.dateProblem(date);
      if (problem !== null) {
        findings.push(
          new ReviewFinding(
            keyOf('calendar', [event.id, which]),
            'calendar',
            `“${event.name}”: its ${words} is not in ${calendarName}.`,
            problem,
            [event.id],
            [],
          ),
        );
      }
      if (date instanceof RelativeDate && (date.anchorId === null || !events.has(date.anchorId))) {
        findings.push(
          new ReviewFinding(
            keyOf('anchor', [event.id, which]),
            'anchor',
            `“${event.name}”: its ${words} is given from an event that no longer exists.`,
            `It reads “about ${jsNum(date.amount)} ${date.unit} ${date.before ? 'before' : 'after'}” an event that has been deleted, so it cannot be placed.`,
            [event.id],
            [],
          ),
        );
      }
    }
    if (event.raw['end'] !== null && event.raw['end'] !== undefined) {
      const start = spanOfDate(event.when, context, new Set([event.id]));
      const end = spanOfDate(event.end, context, new Set([event.id]));
      if (start !== null && end !== null && end.hi < start.lo) {
        findings.push(
          new ReviewFinding(
            keyOf('dates', [event.id]),
            'dates',
            `“${event.name}” ends before it starts.`,
            `It starts ${dateOf(event.id)} and ends ${formatDate(event.end, nameOf, calendar)}.`,
            [event.id],
            [],
          ),
        );
      }
    }
    const afterId = event.afterId;
    if (afterId !== null && events.has(afterId)) {
      const mine = placed.get(event.id)?.value ?? null;
      const theirs = placed.get(afterId)?.value ?? null;
      if (mine !== null && theirs !== null && mine < theirs) {
        findings.push(
          new ReviewFinding(
            keyOf('follows', [event.id, afterId]),
            'follows',
            `“${event.name}” is set to come after “${name(afterId)}”, but is dated before it.`,
            `“${event.name}”: ${dateOf(event.id)}. “${name(afterId)}”: ${dateOf(afterId)}.`,
            [event.id, afterId],
            [],
          ),
        );
      }
    }
  }

  // Characters: ages, and where they are when.
  const within = containment(model);
  const travel = new Map<string, JsonMap>();
  for (const r of rules) {
    const from = idOrNull(r['entryId']);
    const to = idOrNull(r['toEntryId']);
    if (r['kind'] !== 'travel' || from === null || to === null || numOrNull(r['amount']) === null) continue;
    if (!travelUnits.has(r['unit'] as string)) continue;
    for (const pair of [`${from}|${to}`, `${to}|${from}`]) {
      if (!travel.has(pair)) travel.set(pair, r);
    }
  }
  for (const character of model.entries.values()) {
    if (character.category !== 'character') continue;
    const theirs = [...events.values()].filter((e) => e.characters.some((c) => c.id === character.id));
    if (theirs.length === 0) continue;
    const ages = agesOf(character.id, events, {
      calendar,
      birthDate: birthDateOf(character),
      eventIds: theirs.map((e) => e.id),
    });
    for (const [eventId, issue] of ages.issues) {
      const born = issue.startsWith('Takes part');
      const basis = ages.birth.basis;
      findings.push(
        new ReviewFinding(
          keyOf(born ? 'born' : 'ages', [character.id, eventId]),
          born ? 'born' : 'ages',
          born
            ? `${character.name} takes part in “${name(eventId)}”, which the dates put before their birth.`
            : `${character.name}’s age at “${name(eventId)}” does not fit the other records.`,
          born
            ? `Born ${basis.length > 0 ? `as worked out from ${basis.join(' and ')}` : 'as recorded'}; “${name(eventId)}” is ${dateOf(eventId)}.`
            : issue.replace(/^Stated/, `${character.name} is stated`),
          [eventId],
          [character.id],
        ),
      );
    }

    // Where they are: the dated events they take part in that have a place, in story order.
    const located = stableSorted(
      theirs.flatMap((e) => {
        if (e.locationId === null || !model.entries.has(e.locationId)) return [];
        const bounds = boundsOfEvent(e.id, context);
        return bounds === null ? [] : [{ e, bounds }];
      }),
      (a, b) => {
        const byStart = compareNum(a.bounds.start.lo, b.bounds.start.lo);
        return byStart !== 0 ? byStart : localeCompare(a.e.id, b.e.id);
      },
    );
    for (let i = 0; i < located.length; i++) {
      for (let j = i + 1; j < located.length; j++) {
        const a = located[i];
        const b = located[j];
        const placeA = a.e.locationId!;
        const placeB = b.e.locationId!;
        if (placeA === placeB || within(placeA, placeB) || within(placeB, placeA)) continue;
        const how = together(a.bounds, b.bounds, calendar.minutesPerDay);
        const certain = how !== null && togetherCertain(how);
        const route = travel.get(`${placeA}|${placeB}`) ?? null;
        const amount = route === null ? null : numOrNull(route['amount']);
        if (certain && !(route !== null && amount === 0)) {
          const pair = [a.e.id, b.e.id].sort();
          findings.push(
            new ReviewFinding(
              keyOf('two-places', [character.id, ...pair]),
              'two-places',
              `${character.name} is at ${entry(placeA)} and at ${entry(placeB)} at the same time.`,
              `“${a.e.name}” (${dateOf(a.e.id)}) is at ${entry(placeA)}; “${b.e.name}” (${dateOf(b.e.id)}) is at ${entry(placeB)}; the dates put both at once, and neither place lies inside the other.`,
              [a.e.id, b.e.id],
              [character.id, placeA, placeB],
              route === null ? null : str(route['id']),
            ),
          );
          continue;
        }
        // Travel between consecutive places: only the next located event after this one.
        if (j !== i + 1 || route === null || amount === null) continue;
        if (a.bounds.open !== null) continue;
        const endA = a.bounds.end!;
        // The most time there can be between leaving the first and arriving for the second.
        const longest = b.bounds.start.hi - endA.lo;
        const unit = str(route['unit']);
        const needed = amount * calendar.unitMinutes(timeUnitOf(unit)!);
        if (longest >= 0 && longest < needed) {
          findings.push(
            new ReviewFinding(
              keyOf('travel', [character.id, a.e.id, b.e.id]),
              'travel',
              `${character.name} cannot get from ${entry(placeA)} to ${entry(placeB)} in time for “${b.e.name}”.`,
              `“${a.e.name}” (${dateOf(a.e.id)}) is at ${entry(placeA)}; “${b.e.name}” (${dateOf(b.e.id)}) is at ${entry(placeB)}, at most ${lengthWords(longest + 1 < 0 ? 0 : longest + 1, calendar.minutesPerDay)} later. The travel time recorded between them is ${jsNum(amount)} ${amount === 1 ? unit.substring(0, unit.length - 1) : unit}.`,
              [a.e.id, b.e.id],
              [character.id, placeA, placeB],
              str(route['id']),
            ),
          );
        }
      }
    }
  }
  return findings;
}

/** Whether a place lies inside another, through "Located in" links, at any depth. */
function containment(model: StoryModel): (inner: string, outer: string) => boolean {
  const parents = new Map<string, string[]>();
  for (const link of model.links) {
    if (link.type !== 'located-in') continue;
    if (model.entries.get(link.fromId)?.category !== 'location' || model.entries.get(link.toId)?.category !== 'location') {
      continue;
    }
    let list = parents.get(link.fromId);
    if (list === undefined) parents.set(link.fromId, (list = []));
    list.push(link.toId);
  }
  return (inner, outer) => {
    const seen = new Set<string>();
    const stack = [...(parents.get(inner) ?? [])];
    // Counted: each place is expanded once, so it ends after at most as many steps as there are links.
    for (let steps = 0; stack.length > 0 && steps <= model.links.length * 2 + 1; steps++) {
      const at = stack.pop()!;
      if (at === outer) return true;
      if (seen.has(at)) continue;
      seen.add(at);
      stack.push(...(parents.get(at) ?? []));
    }
    return false;
  };
}

/** Findings split by the author's decisions: still open, decided (with the decision), and decisions whose finding is
 * no longer raised (the records changed since). */
export function withDecisions(
  findings: readonly ReviewFinding[],
  decisions: readonly ReviewItem[],
  prefix = 'timeline|',
): {
  open: ReviewFinding[];
  decided: { finding: ReviewFinding; decision: ReviewItem }[];
  gone: ReviewItem[];
} {
  const mine = decisions.filter((d) => d.key.startsWith(prefix));
  // "Needs review" keeps a finding open; every other decision closes it.
  const decided = new Map<string, ReviewItem>();
  for (const d of mine) if (decisionCloses(d.decision)) decided.set(d.key, d);
  const keys = new Set(findings.map((f) => f.key));
  return {
    open: findings.filter((f) => !decided.has(f.key)),
    decided: findings.filter((f) => decided.has(f.key)).map((f) => ({ finding: f, decision: decided.get(f.key)! })),
    gone: mine.filter((d) => !keys.has(d.key)),
  };
}

