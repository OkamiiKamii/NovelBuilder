import { closes, type ContinuityRule, type Resolution } from '@/modules/continuity/types';
import type { StoryModel } from '@/modules/model/types';
import { boundsOfEvent, spanOfDate, timeContext } from '@/modules/model/validity';
import { agesOf, birthDateOf } from './ages';
import { dateProblem, unitMinutes } from './calendar';
import { formatDate, resolveChronology } from './chronology';
import { together } from './overlap';
import type { TimeUnit } from './types';

/**
 * REVIEWING THE TIMELINE
 * Deterministic checks of the timeline against itself and against what the
 * author has recorded elsewhere. Each finding comes from one stated rule,
 * says what records it rests on, and is raised only when those records hold
 * the data the rule needs: no date, no place or no recorded travel time
 * means no finding, never a guess. Same records, same findings, every time.
 *
 * Findings are suggestions. Nothing here changes an event, a date, a place
 * or canon. The author fixes the records (and the finding goes), or keeps a
 * decision about it: dismissed, or intentional with a reason (stored with
 * the continuity decisions, under a key that starts "timeline|").
 */
export const REVIEW_RULES = ['dates', 'follows', 'anchor', 'calendar', 'ages', 'born', 'travel', 'two-places'] as const;
export type ReviewRule = (typeof REVIEW_RULES)[number];

export const RULE_TEXT: Record<ReviewRule, { title: string; rule: string; needs: string }> = {
  dates: { title: 'Ends before it starts', rule: 'An event cannot end before it begins.', needs: 'A start date and an end date that can both be worked out.' },
  follows: { title: 'Dated before what it follows', rule: 'An event set to come after another (“Comes after”) cannot be dated before it.', needs: 'Both events dated.' },
  anchor: { title: 'Dated from an event that is gone', rule: 'A date given relative to another event (“two days after the siege”) needs that event to exist.', needs: 'A relative date.' },
  calendar: { title: 'Date not in the calendar', rule: 'A date must exist in the novel’s calendar: a month it has, a day that month has, an hour its days have.', needs: 'A date with a month, day or hour.' },
  ages: { title: 'Ages that disagree', rule: 'A character’s age at an event must fit their date of birth and the ages given for them at other events, birthdays counted by the calendar.', needs: 'At least two of: a date of birth on their profile, their age at a dated event.' },
  born: { title: 'Takes part before being born', rule: 'A character cannot take part in an event before they are born.', needs: 'A birth worked out from their records, and the event dated.' },
  travel: { title: 'Too little time to travel', rule: 'When a character is at one place and next at another, the time between the two events must be at least the travel time recorded between those places.', needs: 'Both events dated with a place, and a travel time recorded between the places (Continuity → Tracked → Travel time).' },
  'two-places': { title: 'In two places at once', rule: 'A character cannot be at two events at the same time in two different places, unless one place lies inside the other.', needs: 'Both events dated closely enough to be certainly at the same time, each with a place.' },
};

export type ReviewSeverity = 'warning' | 'info';

export interface ReviewFinding {
  /** The same for the same finding on every run, built from the records' ids, so a decision about it holds. */
  key: string;
  rule: ReviewRule;
  severity: ReviewSeverity;
  /** What was found, in a sentence. */
  message: string;
  /** The facts it rests on, in words. */
  because: string;
  /** The records to open to resolve it. */
  eventIds: string[];
  entryIds: string[];
  /** A recorded travel time, for the travel rule. */
  ruleId: string | null;
}

const keyOf = (rule: ReviewRule, ...ids: string[]) => ['timeline', rule, ...ids].join('|');
const HOUR_UNITS = new Set(['minutes', 'hours', 'days', 'weeks', 'months']);

/** A length of time in words, at the largest whole unit: "5 days", "36 hours". */
function lengthWords(minutes: number, dayMinutes: number): string {
  const units: [number, string][] = [[dayMinutes, 'day'], [60, 'hour'], [1, 'minute']];
  for (const [size, name] of units) {
    if (minutes >= size && minutes % size === 0) {
      const n = minutes / size;
      return `${n.toLocaleString()} ${name}${n === 1 ? '' : 's'}`;
    }
  }
  return `${Math.round(minutes / 60).toLocaleString()} hours`;
}

/**
 * Every finding for a novel's timeline. `rules` are the continuity rules
 * (only travel times are read). Reads only.
 */
export function reviewTimeline(model: StoryModel, rules: ContinuityRule[] = []): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const context = timeContext(model);
  const calendar = model.calendar;
  const events = model.events;
  const name = (id: string) => events.get(id)?.name ?? 'an event';
  const entry = (id: string | null) => (id ? model.entries.get(id)?.name : undefined);
  const nameOf = (id: string) => events.get(id)?.name;
  const dateOf = (id: string) => formatDate(events.get(id)!.when, nameOf, calendar);

  // Dates: each event against itself, the event it follows, and the calendar.
  const placed = new Map(resolveChronology([...events.values()], calendar).map((p) => [p.event.id, p]));
  for (const event of events.values()) {
    for (const [which, when] of [['start', event.when], ['end', event.end]] as const) {
      if (!when) continue;
      const problem = dateProblem(when, calendar);
      if (problem) findings.push({ key: keyOf('calendar', event.id, which), rule: 'calendar', severity: 'warning', message: `“${event.name}”: its ${which === 'start' ? 'date' : 'end date'} is not in ${calendar.standard ? 'the calendar' : calendar.name}.`, because: problem, eventIds: [event.id], entryIds: [], ruleId: null });
      if (when.precision === 'relative' && (!when.anchorId || !events.has(when.anchorId))) findings.push({ key: keyOf('anchor', event.id, which), rule: 'anchor', severity: 'warning', message: `“${event.name}”: its ${which === 'start' ? 'date' : 'end date'} is given from an event that no longer exists.`, because: `It reads “about ${when.amount} ${when.unit} ${when.direction}” an event that has been deleted, so it cannot be placed.`, eventIds: [event.id], entryIds: [], ruleId: null });
    }
    if (event.end) {
      const start = spanOfDate(event.when, context, new Set([event.id]));
      const end = spanOfDate(event.end, context, new Set([event.id]));
      if (start && end && end.hi < start.lo) findings.push({ key: keyOf('dates', event.id), rule: 'dates', severity: 'warning', message: `“${event.name}” ends before it starts.`, because: `It starts ${dateOf(event.id)} and ends ${formatDate(event.end, nameOf, calendar)}.`, eventIds: [event.id], entryIds: [], ruleId: null });
    }
    if (event.afterId && events.has(event.afterId)) {
      const [mine, theirs] = [placed.get(event.id)?.value ?? null, placed.get(event.afterId)?.value ?? null];
      if (mine !== null && theirs !== null && mine < theirs) findings.push({ key: keyOf('follows', event.id, event.afterId), rule: 'follows', severity: 'warning', message: `“${event.name}” is set to come after “${name(event.afterId)}”, but is dated before it.`, because: `“${event.name}”: ${dateOf(event.id)}. “${name(event.afterId)}”: ${dateOf(event.afterId)}.`, eventIds: [event.id, event.afterId], entryIds: [], ruleId: null });
    }
  }

  // Characters: ages, and where they are when.
  const within = containment(model);
  const travel = new Map<string, ContinuityRule>();
  for (const r of rules) if (r.kind === 'travel' && r.entryId && r.toEntryId && r.amount !== null && HOUR_UNITS.has(r.unit)) for (const pair of [`${r.entryId}|${r.toEntryId}`, `${r.toEntryId}|${r.entryId}`]) if (!travel.has(pair)) travel.set(pair, r);
  for (const character of model.entries.values()) {
    if (character.category !== 'character') continue;
    const theirs = [...events.values()].filter((e) => e.characters.some((c) => c.id === character.id));
    if (!theirs.length) continue;
    const ages = agesOf(character.id, events, calendar, birthDateOf(character), theirs.map((e) => e.id));
    for (const [eventId, issue] of ages.issues) {
      const born = issue.startsWith('Takes part');
      findings.push({
        key: keyOf(born ? 'born' : 'ages', character.id, eventId),
        rule: born ? 'born' : 'ages',
        severity: 'warning',
        message: born ? `${character.name} takes part in “${name(eventId)}”, which the dates put before their birth.` : `${character.name}’s age at “${name(eventId)}” does not fit the other records.`,
        because: born ? `Born ${ages.birth.basis.length ? `as worked out from ${ages.birth.basis.join(' and ')}` : 'as recorded'}; “${name(eventId)}” is ${dateOf(eventId)}.` : issue.replace(/^Stated/, `${character.name} is stated`),
        eventIds: [eventId],
        entryIds: [character.id],
        ruleId: null,
      });
    }

    // Where they are: the dated events they take part in that have a place, in story order.
    const located = theirs
      .map((e) => ({ e, bounds: boundsOfEvent(e.id, context) }))
      .filter((x) => x.e.locationId && model.entries.has(x.e.locationId) && x.bounds)
      .sort((a, b) => a.bounds!.start.lo - b.bounds!.start.lo || a.e.id.localeCompare(b.e.id));
    for (let i = 0; i < located.length; i++) {
      for (let j = i + 1; j < located.length; j++) {
        const [a, b] = [located[i], located[j]];
        const [placeA, placeB] = [a.e.locationId!, b.e.locationId!];
        if (placeA === placeB || within(placeA, placeB) || within(placeB, placeA)) continue;
        const how = together(a.bounds!, b.bounds!, calendar.minutesPerDay);
        const certain = how === 'same-time' || how === 'overlaps' || how === 'during' || how === 'contains';
        const route = travel.get(`${placeA}|${placeB}`);
        if (certain && !(route && route.amount === 0)) {
          const [x, y] = [a.e.id, b.e.id].sort();
          findings.push({
            key: keyOf('two-places', character.id, x, y),
            rule: 'two-places',
            severity: 'warning',
            message: `${character.name} is at ${entry(placeA)} and at ${entry(placeB)} at the same time.`,
            because: `“${a.e.name}” (${dateOf(a.e.id)}) is at ${entry(placeA)}; “${b.e.name}” (${dateOf(b.e.id)}) is at ${entry(placeB)}; the dates put both at once, and neither place lies inside the other.`,
            eventIds: [a.e.id, b.e.id],
            entryIds: [character.id, placeA, placeB],
            ruleId: route?.id ?? null,
          });
          continue;
        }
        // Travel between consecutive places: only the next located event after this one.
        if (j !== i + 1 || !route) continue;
        const endA = a.bounds!.open ? null : a.bounds!.end!;
        if (!endA) continue;
        // The most time there can be between leaving the first and arriving for the second.
        const longest = b.bounds!.start.hi - endA.lo;
        const needed = route.amount! * unitMinutes(route.unit as TimeUnit, calendar);
        if (longest >= 0 && longest < needed) {
          findings.push({
            key: keyOf('travel', character.id, a.e.id, b.e.id),
            rule: 'travel',
            severity: 'warning',
            message: `${character.name} cannot get from ${entry(placeA)} to ${entry(placeB)} in time for “${b.e.name}”.`,
            because: `“${a.e.name}” (${dateOf(a.e.id)}) is at ${entry(placeA)}; “${b.e.name}” (${dateOf(b.e.id)}) is at ${entry(placeB)}, at most ${lengthWords(Math.max(0, longest + 1), calendar.minutesPerDay)} later. The travel time recorded between them is ${route.amount} ${route.amount === 1 ? route.unit.slice(0, -1) : route.unit}.`,
            eventIds: [a.e.id, b.e.id],
            entryIds: [character.id, placeA, placeB],
            ruleId: route.id,
          });
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
    if (model.entries.get(link.fromId)?.category !== 'location' || model.entries.get(link.toId)?.category !== 'location') continue;
    (parents.get(link.fromId) ?? parents.set(link.fromId, []).get(link.fromId)!).push(link.toId);
  }
  return (inner, outer) => {
    const seen = new Set<string>();
    const stack = [...(parents.get(inner) ?? [])];
    while (stack.length) {
      const at = stack.pop()!;
      if (at === outer) return true;
      if (seen.has(at)) continue;
      seen.add(at);
      stack.push(...(parents.get(at) ?? []));
    }
    return false;
  };
}

/** Findings split by the author's decisions: still open, and decided (with the decision). `prefix` picks out the decisions about this kind of finding. */
export function withDecisions<T extends { key: string }>(findings: T[], decisions: Resolution[], prefix = 'timeline|') {
  const mine = decisions.filter((d) => d.key.startsWith(prefix));
  // "Needs review" keeps a finding open; every other decision closes it.
  const decided = new Map(mine.filter(closes).map((d) => [d.key, d]));
  const keys = new Set(findings.map((f) => f.key));
  return {
    open: findings.filter((f) => !decided.has(f.key)),
    decided: findings.filter((f) => decided.has(f.key)).map((f) => ({ finding: f, decision: decided.get(f.key)! })),
    /** Decisions whose finding is no longer raised: the records changed since. */
    gone: mine.filter((d) => !keys.has(d.key)),
  };
}

