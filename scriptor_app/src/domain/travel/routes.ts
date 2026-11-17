// ROUTES AND WHERE EVERYONE WAS (as in the original app): each journey read against the story (when it leaves and
// arrives, in story time or reading order, and how long it must take when the author has given a distance and a
// speed); each traveller's route, with the stays between journeys, the events they are at and where they are recorded
// as located; and possible conflicts, flagged by stated rules and only when the records settle them. An approximate
// date counts as all the time it may mean, story time is never compared with reading order, and no speed is assumed.
// A port of flutter_app/lib/shared/domain/travel/routes.dart.

import { localeCompare } from '../collation';
import type { JsonMap } from '../json';
import { compareNum } from '../manuscript/dartSort';
import type { StoryModel } from '../model/storyModel';
import { type Anchor, DateAnchor, EventAnchor, NodeAnchor, type Truth, Validity, overlaps, spanOfDate, spanOfEvent } from '../model/validity';
import { parentsOf } from '../places/explore';
import type { MapPin, WorldMap } from '../places/places';
import { whenWords } from '../progression/track';
import { stableSorted } from '../reader/stableSort';
import { EventDuration, RelativeDate, type TimelineEvent } from '../records/event';
import type { Journey } from '../records/journey';
import { jsRound, jsString } from '../systems/formula';
import { dartToLowerCase, dartTrim } from '../text/dartString';
import { formatDuration } from '../timeline/dates';
import { eventRecord } from '../timeline/eventRecord';
import { type TravelMethod, type TravelSettings, perLabels } from './travel';

/** Where a point in the story falls: a stretch of story time (lo to hi), a place in the reading (at), or nowhere it
 * can be placed (no point at all). */
export class TravelPoint {
  private constructor(
    readonly lo: number | null,
    readonly hi: number | null,
    readonly at: number | null,
  ) {}
  static story(lo: number, hi: number): TravelPoint {
    return new TravelPoint(lo, hi, null);
  }
  static reading(at: number): TravelPoint {
    return new TravelPoint(null, null, at);
  }
  get isStory(): boolean {
    return this.lo !== null;
  }
  toJson(): JsonMap {
    return this.isStory ? { axis: 'story', lo: this.lo, hi: this.hi } : { axis: 'reading', at: this.at };
  }
}

export function pointOf(anchor: Anchor | null, model: StoryModel): TravelPoint | null {
  const context = model.timeContext;
  if (anchor === null) return null;
  if (anchor instanceof NodeAnchor) {
    const at = model.order.position.get(anchor.nodeId);
    return at === undefined ? null : TravelPoint.reading(at);
  }
  if (anchor instanceof EventAnchor) {
    const s = spanOfEvent(anchor.eventId, context);
    return s === null ? null : TravelPoint.story(s.lo, s.hi);
  }
  const s = spanOfDate((anchor as DateAnchor).when, context);
  return s === null ? null : TravelPoint.story(s.lo, s.hi);
}

const story = (p: TravelPoint | null): TravelPoint | null => (p !== null && p.isStory ? p : null);

/** A stretch of minutes in words: "3 days", "6 hours". */
export function minutesWords(minutes: number, model: StoryModel): string {
  const day = model.calendar.durationMinutes(new EventDuration(1, 'days'));
  const round = (n: number) => jsRound(n * 10) / 10;
  if (minutes >= day) {
    const n = round(minutes / day);
    return `${jsString(n)} ${n === 1 ? 'day' : 'days'}`;
  }
  if (minutes >= 60) {
    const n = round(minutes / 60);
    return `${jsString(n)} ${n === 1 ? 'hour' : 'hours'}`;
  }
  const n = jsRound(minutes);
  return `${jsString(n)} ${n === 1 ? 'minute' : 'minutes'}`;
}

export type JourneyDistance = { value: number; unit: string; from: 'author' | 'map' };

export class JourneyRecord {
  constructor(
    readonly journey: Journey,
    readonly travellers: string,
    readonly from: string,
    readonly to: string,
    readonly leaves: TravelPoint | null,
    readonly arrives: TravelPoint | null,
    readonly leavesWords: string,
    readonly arrivesWords: string,
    readonly method: TravelMethod | null,
    readonly methodWords: string,
    /** How far: the author's distance, or what a map gives between pinned places (in the map's unit). */
    readonly distance: JourneyDistance | null,
    /** The least time it can take, from the distance and the method's speed; null when the records do not give both. */
    readonly leastMinutes: number | null,
    /** The journey in one line. */
    readonly words: string,
  ) {}
}

const same = (a: string, b: string): boolean => dartToLowerCase(dartTrim(a)) === dartToLowerCase(dartTrim(b));

/** How far a journey is on a map with every place of it pinned: the legs from, through, to, in a straight line. */
function mapDistance(journey: Journey, maps: readonly WorldMap[], pins: readonly MapPin[]): { value: number; unit: string } | null {
  const stops = [journey.fromId, ...journey.via, journey.toId];
  if (stops.some((s) => s === null)) return null;
  for (const map of stableSorted(maps, (a, b) => localeCompare(a.name, b.name))) {
    const at = stops.map((id) => pins.find((p) => p.mapId === map.id && p.entryId === id) ?? null);
    if (at.some((p) => p === null)) continue;
    let value = 0;
    for (let i = 1; i < at.length; i++) {
      const dx = at[i]!.x - at[i - 1]!.x;
      const dy = at[i]!.y - at[i - 1]!.y;
      value += Math.sqrt(dx * dx + dy * dy);
    }
    return { value: jsRound(value * 100) / 100, unit: map.unit };
  }
  return null;
}

export function journeyRecord(
  model: StoryModel,
  journey: Journey,
  settings: TravelSettings | null,
  maps: readonly WorldMap[] = [],
  pins: readonly MapPin[] = [],
): JourneyRecord {
  const name = (id: string | null) => (id === null ? 'somewhere not recorded' : (model.entries.get(id)?.name ?? 'a place that is gone'));
  const who = journey.travellerIds.map((id) => model.entries.get(id)?.name ?? 'someone deleted');
  const method = journey.methodId === null ? null : (settings?.methods.find((m) => m.id === journey.methodId) ?? null);
  const methodWords = method !== null ? method.name : dartTrim(journey.method);
  const d = journey.distance;
  const given: JourneyDistance | null =
    d !== null
      ? { value: d, unit: journey.distanceUnit.length > 0 ? journey.distanceUnit : (method?.distanceUnit ?? ''), from: 'author' }
      : null;
  const fromMap = given === null ? mapDistance(journey, maps, pins) : null;
  const distance: JourneyDistance | null = given ?? (fromMap === null ? null : { value: fromMap.value, unit: fromMap.unit, from: 'map' });
  // A least time only when the method has a speed in the very unit the distance is in: nothing converted or assumed.
  const speed = method?.speed ?? null;
  const leastMinutes =
    speed !== null && speed > 0 && distance !== null && distance.unit.length > 0 && same(distance.unit, method!.distanceUnit)
      ? (distance.value / speed) * model.calendar.durationMinutes(new EventDuration(1, method!.per))
      : null;
  const via = journey.via.length === 0 ? '' : ` by way of ${journey.via.map(name).join(', ')}`;
  const travellers = who.length === 0 ? 'Nobody named' : who.join(' and ');
  return new JourneyRecord(
    journey,
    travellers,
    name(journey.fromId),
    name(journey.toId),
    pointOf(journey.departure, model),
    pointOf(journey.arrival, model),
    journey.departure !== null ? whenWords(journey.departure, model) : 'when is not known',
    journey.arrival !== null ? whenWords(journey.arrival, model) : 'when is not known',
    method,
    methodWords,
    distance,
    leastMinutes,
    `${travellers}: ${name(journey.fromId)} to ${name(journey.toId)}${via}${methodWords.length > 0 ? `, ${methodWords}` : ''}`,
  );
}

// ---------------------------------------------------------------------------------------------- a traveller's route

export type RouteKind = 'journey' | 'stay' | 'event' | 'located';

export class RouteItem {
  constructor(
    readonly key: string,
    readonly kind: RouteKind,
    readonly title: string,
    readonly detail: string,
    readonly when: string,
    readonly placeIds: readonly string[],
    readonly order: number,
    readonly journeyId: string | null = null,
  ) {}

  withOrder(order: number, when?: string): RouteItem {
    return new RouteItem(this.key, this.kind, this.title, this.detail, when ?? this.when, this.placeIds, order, this.journeyId);
  }
}

export class TravelRoute {
  constructor(
    /** In story time, by date. */
    readonly story: RouteItem[],
    /** As the reader meets them, by chapter. */
    readonly reading: RouteItem[],
    /** With no time that can be placed: journeys in the order the author gives ("after"), then the rest. */
    readonly unknown: RouteItem[],
  ) {}
}

function byCreated(a: Journey, b: Journey): number {
  const c = compareNum(a.createdAt, b.createdAt);
  return c !== 0 ? c : localeCompare(a.id, b.id);
}

/** Journeys with no time, in the order the author gives: each after the one it says it comes after, when that is
 * among them. */
function relativeOrder(journeys: readonly Journey[]): Journey[] {
  const left = stableSorted(journeys, byCreated);
  const out: Journey[] = [];
  const placed = new Set<string>();
  // One journey placed a turn, so as many turns as there are journeys.
  for (let turn = journeys.length; left.length > 0 && turn > 0; turn--) {
    const i = left.findIndex((j) => j.afterId === null || placed.has(j.afterId) || !left.some((o) => o.id === j.afterId));
    const next = left.splice(i < 0 ? 0 : i, 1)[0];
    out.push(next);
    placed.add(next.id);
  }
  return out;
}

const takesPart = (event: TimelineEvent, id: string): boolean =>
  event.characters.some((c) => c.id === id) || event.entryIds.includes(id);

/** Everywhere one traveller is recorded as being, and every journey they make, in order. */
export function routeOf(
  model: StoryModel,
  travellerId: string,
  journeys: readonly Journey[],
  settings: TravelSettings | null,
  maps: readonly WorldMap[] = [],
  pins: readonly MapPin[] = [],
): TravelRoute {
  const name = (id: string | null) => (id === null ? 'somewhere not recorded' : (model.entries.get(id)?.name ?? 'a place that is gone'));
  const storyItems: RouteItem[] = [];
  const reading: RouteItem[] = [];
  const unknown: RouteItem[] = [];
  const mine = journeys.filter((j) => j.travellerIds.includes(travellerId)).map((j) => journeyRecord(model, j, settings, maps, pins));
  const item = (r: JourneyRecord): RouteItem => {
    const j = r.journey;
    const d = r.distance;
    return new RouteItem(
      `journey:${j.id}`,
      'journey',
      `${r.from} to ${r.to}${j.via.length === 0 ? '' : ` by way of ${j.via.map(name).join(', ')}`}`,
      [
        r.methodWords,
        j.duration !== null ? `takes ${formatDuration(j.duration)}` : '',
        d !== null ? dartTrim(`${jsString(d.value)} ${d.unit}${d.from === 'map' ? ' on the map' : ''}`) : '',
        j.eventIds.length > 0 ? `part of ${j.eventIds.map((id) => `“${model.events.get(id)?.name ?? 'a deleted event'}”`).join(', ')}` : '',
      ]
        .filter((s) => s.length > 0)
        .join(' · '),
      `leaves ${r.leavesWords}, arrives ${r.arrivesWords}`,
      [j.fromId, ...j.via, j.toId].filter((p): p is string => p !== null && p.length > 0),
      0,
      j.id,
    );
  };

  const undated: Journey[] = [];
  for (const r of mine) {
    const at = story(r.leaves) ?? story(r.arrives);
    if (at !== null) {
      storyItems.push(item(r).withOrder(at.lo!));
    } else if ((r.leaves?.at ?? null) !== null || (r.arrives?.at ?? null) !== null) {
      reading.push(item(r).withOrder(r.leaves?.at ?? r.arrives!.at!));
    } else {
      undated.push(r.journey);
    }
  }
  relativeOrder(undated).forEach((j, i) => {
    const before = j.afterId === null ? null : (journeys.find((o) => o.id === j.afterId) ?? null);
    unknown.push(
      item(mine.find((r) => r.journey.id === j.id)!).withOrder(
        i,
        before !== null ? `when is not known; after the journey to ${name(before.toId)}` : 'when is not known',
      ),
    );
  });
  // Stays: from arriving somewhere to leaving again, between journeys dated in story time.
  const dated = stableSorted(
    mine.filter((r) => story(r.leaves) !== null && story(r.arrives) !== null),
    (a, b) => compareNum(story(a.leaves)!.lo!, story(b.leaves)!.lo!),
  );
  for (let i = 0; i < dated.length - 1; i++) {
    const here = dated[i];
    const next = dated[i + 1];
    const toId = here.journey.toId;
    if (toId !== null && story(here.arrives)!.hi! <= story(next.leaves)!.lo!) {
      storyItems.push(
        new RouteItem(
          `stay:${here.journey.id}`,
          'stay',
          `At ${here.to}`,
          'between journeys',
          `from ${here.arrivesWords} until ${next.leavesWords}`,
          [toId],
          story(here.arrives)!.lo! + 0.5,
        ),
      );
    }
  }
  // Events they are at, where the event has a place.
  for (const event of model.events.values()) {
    const locationId = event.locationId;
    if (locationId === null || !takesPart(event, travellerId)) continue;
    const span = spanOfEvent(event.id, model.timeContext);
    const it = new RouteItem(
      `event:${event.id}`,
      'event',
      `At ${name(locationId)}`,
      `takes part in “${event.name}”`,
      span !== null ? (eventRecord(model, event.id)?.label ?? 'when is not known') : 'when is not known',
      [locationId],
      span?.lo ?? 0,
    );
    (span !== null ? storyItems : unknown).push(it);
  }
  // Where they are recorded as located, by a "Located in" connection, from when it holds.
  for (const link of model.links) {
    if (link.type !== 'located-in' || link.fromId !== travellerId || model.entries.get(link.toId)?.category !== 'location') continue;
    const from = link.validity?.from ?? null;
    const until = link.validity?.until ?? null;
    const p = pointOf(from, model);
    const it = new RouteItem(
      `located:${link.id}`,
      'located',
      `Located in ${name(link.toId)}`,
      until !== null ? `until ${whenWords(until, model)}` : 'still',
      from !== null ? `from ${whenWords(from, model)}` : 'from the start',
      [link.toId],
      story(p)?.lo ?? p?.at ?? Number.NEGATIVE_INFINITY,
    );
    if (story(p) !== null) storyItems.push(it);
    else if ((p?.at ?? null) !== null) reading.push(it);
    else unknown.push(it);
  }
  const sort = (list: RouteItem[]) =>
    stableSorted(list, (a, b) => {
      const c = compareNum(a.order, b.order);
      return c !== 0 ? c : localeCompare(a.title, b.title);
    });
  return new TravelRoute(sort(storyItems), sort(reading), unknown);
}

// ---------------------------------------------------------------------------------------------- possible conflicts

export const travelProblemKinds = [
  'backwards',
  'too-fast',
  'duration',
  'order',
  'two-journeys',
  'event-during',
  'two-places',
  'departure',
  'elsewhere',
] as const;

export class TravelProblem {
  constructor(
    readonly key: string,
    readonly kind: string,
    /** A problem is the records contradicting each other; a note may well have an explanation the records lack. */
    readonly severity: 'problem' | 'note',
    readonly message: string,
    readonly journeyIds: readonly string[],
  ) {}
  toJson(): JsonMap {
    return { key: this.key, kind: this.kind, severity: this.severity, message: this.message, journeyIds: [...this.journeyIds] };
  }
}

/** Possible conflicts, each from one rule, flagged only when the records settle it. Times are taken at their widest
 * (an approximate date is all the time it may mean), so a journey is "too fast" only if even the most generous
 * reading of its dates is too short. Nothing is flagged from a time that is not known, from a chapter against an
 * event, or from a speed the author has not set. */
export function travelProblems(
  model: StoryModel,
  journeys: readonly Journey[],
  settings: TravelSettings | null,
  maps: readonly WorldMap[] = [],
  pins: readonly MapPin[] = [],
): TravelProblem[] {
  const out: TravelProblem[] = [];
  const records = journeys.map((j) => journeyRecord(model, j, settings, maps, pins));
  const byId = new Map(records.map((r) => [r.journey.id, r]));
  const span = (m: number) => minutesWords(m, model);
  const parent = parentsOf(model).parent;
  const around = (id: string): Set<string> => {
    const set = new Set([id]);
    let n = 0;
    for (let at = parent.get(id); at !== undefined && n < 1000; at = parent.get(at), n++) set.add(at);
    return set;
  };
  /** Two places one of which lies in the other (or the same place): being at one is being at the other. */
  const nested = (a: string, b: string) => around(a).has(b) || around(b).has(a);
  const speedWords = (r: JourneyRecord) =>
    `${jsString(r.distance!.value)} ${r.distance!.unit} ${r.methodWords} at ${jsString(r.method!.speed!)} ` +
    `${r.method!.distanceUnit} ${perLabels[r.method!.per]}`;
  const said = (j: Journey): number | null => (j.duration === null ? null : model.calendar.durationMinutes(j.duration));

  for (const r of records) {
    const dep = story(r.leaves);
    const arr = story(r.arrives);
    const id = r.journey.id;
    const label = `${r.travellers}, ${r.from} to ${r.to}`;
    const duration = said(r.journey);
    if (dep !== null && arr !== null) {
      if (arr.hi! < dep.lo!) {
        out.push(
          new TravelProblem(`travel|backwards|${id}`, 'backwards', 'problem', `${label}: arrives (${r.arrivesWords}) before leaving (${r.leavesWords}).`, [id]),
        );
      } else {
        // Spans count whole minutes, ends included.
        const most = arr.hi! - dep.lo! + 1;
        const least = Math.max(0, arr.lo! - dep.hi! - 1);
        if (r.leastMinutes !== null && r.leastMinutes > most) {
          out.push(
            new TravelProblem(
              `travel|too-fast|${id}`,
              'too-fast',
              'problem',
              `${label}: ${speedWords(r)} takes at least ${span(r.leastMinutes)}, but leaving ${r.leavesWords} and ` +
                `arriving ${r.arrivesWords} allows at most ${span(most)}.`,
              [id],
            ),
          );
        }
        if (duration !== null && duration > most) {
          out.push(
            new TravelProblem(
              `travel|duration-long|${id}`,
              'duration',
              'problem',
              `${label}: said to take ${formatDuration(r.journey.duration)}, but its dates allow at most ${span(most)}.`,
              [id],
            ),
          );
        }
        if (duration !== null && duration < least) {
          out.push(
            new TravelProblem(
              `travel|duration-short|${id}`,
              'duration',
              'problem',
              `${label}: said to take ${formatDuration(r.journey.duration)}, but its dates put at least ${span(least)} ` +
                'between leaving and arriving.',
              [id],
            ),
          );
        }
      }
    }
    if (duration !== null && r.leastMinutes !== null && duration < r.leastMinutes) {
      out.push(
        new TravelProblem(
          `travel|duration-speed|${id}`,
          'too-fast',
          'problem',
          `${label}: said to take ${formatDuration(r.journey.duration)}, but ${speedWords(r)} takes at least ` +
            `${span(r.leastMinutes)}.`,
          [id],
        ),
      );
    }
    const before = r.journey.afterId === null ? null : (byId.get(r.journey.afterId) ?? null);
    if (before !== null && dep !== null && story(before.leaves) !== null && dep.hi! < story(before.leaves)!.lo!) {
      out.push(
        new TravelProblem(
          `travel|order|${id}`,
          'order',
          'problem',
          `${label}: said to come after the journey ${before.from} to ${before.to}, but it leaves (${r.leavesWords}) ` +
            `before that one does (${before.leavesWords}).`,
          [id, before.journey.id],
        ),
      );
    }
  }

  // Per traveller: two journeys at once; an event elsewhere during a journey or a stay; leaving from elsewhere.
  const travellers = new Set(journeys.flatMap((j) => j.travellerIds));
  for (const t of travellers) {
    const who = model.entries.get(t)?.name ?? 'Someone deleted';
    const theirs = stableSorted(
      records.filter((r) => r.journey.travellerIds.includes(t) && story(r.leaves) !== null && story(r.arrives) !== null),
      (a, b) => {
        const c = compareNum(story(a.leaves)!.lo!, story(b.leaves)!.lo!);
        return c !== 0 ? c : localeCompare(a.journey.id, b.journey.id);
      },
    );
    for (let i = 0; i < theirs.length; i++) {
      for (let k = i + 1; k < theirs.length; k++) {
        const a = theirs[i];
        const b = theirs[k];
        if (story(a.leaves)!.hi! < story(b.arrives)!.lo! && story(b.leaves)!.hi! < story(a.arrives)!.lo!) {
          out.push(
            new TravelProblem(
              `travel|two|${t}|${a.journey.id}|${b.journey.id}`,
              'two-journeys',
              'problem',
              `${who} is on two journeys at once: ${a.from} to ${a.to} (${a.leavesWords} to ${a.arrivesWords}) and ` +
                `${b.from} to ${b.to} (${b.leavesWords} to ${b.arrivesWords}).`,
              [a.journey.id, b.journey.id],
            ),
          );
        }
      }
    }
    const events = [...model.events.values()].filter((e) => e.locationId !== null && takesPart(e, t));
    for (const r of theirs) {
      const stops = [r.journey.fromId, ...r.journey.via, r.journey.toId].filter((s): s is string => s !== null && s.length > 0);
      for (const e of events) {
        const s = spanOfEvent(e.id, model.timeContext);
        if (s === null || r.journey.eventIds.includes(e.id) || stops.some((p) => nested(p, e.locationId!))) continue;
        if (s.lo > story(r.leaves)!.hi! && s.hi < story(r.arrives)!.lo!) {
          out.push(
            new TravelProblem(
              `travel|event-during|${t}|${r.journey.id}|${e.id}`,
              'event-during',
              'problem',
              `${who} takes part in “${e.name}” at ${model.entries.get(e.locationId!)?.name ?? 'null'} while on the journey ${r.from} ` +
                `to ${r.to} (${r.leavesWords} to ${r.arrivesWords}).`,
              [r.journey.id],
            ),
          );
        }
      }
    }
    for (let i = 0; i < theirs.length - 1; i++) {
      const here = theirs[i];
      const next = theirs[i + 1];
      const arrived = story(here.arrives)!;
      const leaves = story(next.leaves)!;
      const toId = here.journey.toId;
      if (toId === null || arrived.hi! > leaves.lo!) continue;
      const fromId = next.journey.fromId;
      if (fromId !== null && !nested(fromId, toId)) {
        out.push(
          new TravelProblem(
            `travel|departure|${t}|${next.journey.id}`,
            'departure',
            'note',
            `${who} leaves from ${next.from} (${next.leavesWords}), but last arrived at ${here.to} (${here.arrivesWords}): ` +
              'a journey may be missing.',
            [here.journey.id, next.journey.id],
          ),
        );
      }
      for (const e of events) {
        const s = spanOfEvent(e.id, model.timeContext);
        if (s === null || nested(e.locationId!, toId)) continue;
        if (s.lo > arrived.hi! && s.hi < leaves.lo!) {
          out.push(
            new TravelProblem(
              `travel|elsewhere|${t}|${here.journey.id}|${e.id}`,
              'elsewhere',
              'note',
              `${who} takes part in “${e.name}” at ${model.entries.get(e.locationId!)?.name ?? 'null'}, while staying at ${here.to} ` +
                `between journeys (${here.arrivesWords} to ${next.leavesWords}): a journey may be missing.`,
              [here.journey.id, next.journey.id],
            ),
          );
        }
      }
    }
  }

  // Located in two places over the same time, by "Located in" connections that each hold for a while.
  const located = model.links.filter(
    (l) => l.type === 'located-in' && model.entries.get(l.fromId)?.category !== 'location' && model.entries.get(l.toId)?.category === 'location',
  );
  for (let i = 0; i < located.length; i++) {
    for (let k = i + 1; k < located.length; k++) {
      const a = located[i];
      const b = located[k];
      if (a.fromId !== b.fromId || nested(a.toId, b.toId)) continue;
      const both: Truth = overlaps(a.validity ?? Validity.always, b.validity ?? Validity.always, model.timeContext);
      if (both === 'yes' && (a.validity !== null || b.validity !== null)) {
        const names = [model.entries.get(a.toId)?.name ?? '', model.entries.get(b.toId)?.name ?? ''].sort(localeCompare);
        const ids = [a.id, b.id].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
        out.push(
          new TravelProblem(
            `travel|two-places|${ids.join('|')}`,
            'two-places',
            'note',
            `${model.entries.get(a.fromId)?.name ?? 'Someone'} is recorded as located in both ${names[0]} and ${names[1]} ` +
              'over the same time.',
            [],
          ),
        );
      }
    }
  }
  const kinds: readonly string[] = travelProblemKinds;
  return stableSorted(out, (a, b) => {
    const c = compareNum(kinds.indexOf(a.kind), kinds.indexOf(b.kind));
    return c !== 0 ? c : localeCompare(a.message, b.message);
  });
}

/** A journey with one reference taken out, and everything else kept: a traveller, place or event that is gone drops
 * out; a time at a deleted chapter or event becomes not known. */
export function withoutJourneyReference(journey: Journey, id: string): JsonMap {
  const gone = (a: Anchor | null): boolean => {
    if (a instanceof NodeAnchor) return a.nodeId === id;
    if (a instanceof EventAnchor) return a.eventId === id;
    if (a instanceof DateAnchor) return a.when instanceof RelativeDate && a.when.anchorId === id;
    return false;
  };
  const raw = journey.toJson();
  return {
    ...raw,
    travellerIds: journey.travellerIds.filter((t) => t !== id),
    fromId: journey.fromId === id ? null : (raw['fromId'] ?? null),
    toId: journey.toId === id ? null : (raw['toId'] ?? null),
    via: journey.via.filter((v) => v !== id),
    eventIds: journey.eventIds.filter((e) => e !== id),
    departure: gone(journey.departure) ? null : (raw['departure'] ?? null),
    arrival: gone(journey.arrival) ? null : (raw['arrival'] ?? null),
    afterId: journey.afterId === id ? null : (raw['afterId'] ?? null),
  };
}
