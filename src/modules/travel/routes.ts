import { eventRecord } from '@/modules/model/events';
import type { StoryModel } from '@/modules/model/types';
import { overlaps, spanOfDate, spanOfEvent, timeContext, type Anchor } from '@/modules/model/validity';
import { parentsOf } from '@/modules/places/explore';
import type { MapPin, WorldMap } from '@/modules/places/types';
import { durationMinutes, formatDuration } from '@/modules/timeline/chronology';
import { whenWords } from '@/modules/progression/track';
import type { TimelineEvent } from '@/modules/timeline/types';
import { PER_LABELS, type Journey, type TravelMethod, type TravelSettings } from './types';

/**
 * ROUTES AND WHERE EVERYONE WAS
 * Each journey read against the story: when it leaves and arrives, in story
 * time (an event or a date) or reading order (a chapter or scene), and how
 * long it must take when the author has given a distance and a speed. Each
 * traveller's route, with the stays between journeys, the events they are
 * at, and where they are recorded as located. Possible conflicts are flagged
 * by stated rules, and only when the records settle them: an approximate
 * date counts as all the time it may mean, story time is never compared
 * with reading order, and no speed is assumed.
 */

type Point = { axis: 'story'; lo: number; hi: number } | { axis: 'reading'; at: number } | null;

/** Where a point in the story falls: a stretch of story time, a place in the reading, or nowhere it can be placed. */
function pointOf(anchor: Anchor | null, model: StoryModel): Point {
  if (!anchor) return null;
  if (anchor.kind === 'node') return model.order.position.has(anchor.nodeId) ? { axis: 'reading', at: model.order.position.get(anchor.nodeId)! } : null;
  const span = anchor.kind === 'event' ? spanOfEvent(anchor.eventId, timeContext(model)) : spanOfDate(anchor.when, timeContext(model));
  return span ? { axis: 'story', lo: span.lo, hi: span.hi } : null;
}
const story = (p: Point): { lo: number; hi: number } | null => (p?.axis === 'story' ? p : null);

/** A stretch of minutes in words: "3 days", "6 hours". */
export function minutesWords(minutes: number, model: Pick<StoryModel, 'calendar'>): string {
  const day = durationMinutes({ amount: 1, unit: 'days' }, model.calendar);
  const round = (n: number) => Math.round(n * 10) / 10;
  if (minutes >= day) return `${round(minutes / day)} ${round(minutes / day) === 1 ? 'day' : 'days'}`;
  if (minutes >= 60) return `${round(minutes / 60)} ${round(minutes / 60) === 1 ? 'hour' : 'hours'}`;
  return `${Math.round(minutes)} ${Math.round(minutes) === 1 ? 'minute' : 'minutes'}`;
}

export interface JourneyRecord {
  journey: Journey;
  travellers: string;
  from: string;
  to: string;
  leaves: Point;
  arrives: Point;
  leavesWords: string;
  arrivesWords: string;
  method: TravelMethod | null;
  methodWords: string;
  /** How far: the author's distance, or what a map gives between pinned places (in the map's unit). */
  distance: { value: number; unit: string; from: 'author' | 'map' } | null;
  /** The least time it can take, from the distance and the method's speed, in the same unit; null when the records do not give both. */
  leastMinutes: number | null;
  /** The journey in one line. */
  words: string;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** How far a journey is on a map with every place of it pinned: the legs from, through, to, in a straight line. */
function mapDistance(journey: Journey, maps: WorldMap[], pins: MapPin[]): { value: number; unit: string } | null {
  const stops = [journey.fromId, ...journey.via, journey.toId];
  if (stops.some((s) => !s)) return null;
  for (const map of [...maps].sort((a, b) => a.name.localeCompare(b.name))) {
    const at = stops.map((id) => pins.find((p) => p.mapId === map.id && p.entryId === id));
    if (at.some((p) => !p)) continue;
    let value = 0;
    for (let i = 1; i < at.length; i++) value += Math.hypot(at[i]!.x - at[i - 1]!.x, at[i]!.y - at[i - 1]!.y);
    return { value: Math.round(value * 100) / 100, unit: map.unit };
  }
  return null;
}

export function journeyRecord(model: StoryModel, journey: Journey, settings: TravelSettings | null, maps: WorldMap[] = [], pins: MapPin[] = []): JourneyRecord {
  const name = (id: string | null) => (id ? (model.entries.get(id)?.name ?? 'a place that is gone') : 'somewhere not recorded');
  const who = journey.travellerIds.map((id) => model.entries.get(id)?.name ?? 'someone deleted');
  const method = journey.methodId ? (settings?.methods.find((m) => m.id === journey.methodId) ?? null) : null;
  const methodWords = method ? method.name : journey.method.trim();
  const given = journey.distance !== null && Number.isFinite(journey.distance) ? { value: journey.distance, unit: journey.distanceUnit || method?.distanceUnit || '', from: 'author' as const } : null;
  const fromMap = given ? null : mapDistance(journey, maps, pins);
  const distance = given ?? (fromMap ? { ...fromMap, from: 'map' as const } : null);
  // A least time only when the method has a speed in the very unit the distance is in: nothing is converted, nothing assumed.
  const leastMinutes = method?.speed && method.speed > 0 && distance && distance.unit && same(distance.unit, method.distanceUnit) ? (distance.value / method.speed) * durationMinutes({ amount: 1, unit: method.per }, model.calendar) : null;
  const via = journey.via.length ? ` by way of ${journey.via.map(name).join(', ')}` : '';
  return {
    journey,
    travellers: who.join(' and ') || 'Nobody named',
    from: name(journey.fromId),
    to: name(journey.toId),
    leaves: pointOf(journey.departure, model),
    arrives: pointOf(journey.arrival, model),
    leavesWords: journey.departure ? whenWords(journey.departure, model) : 'when is not known',
    arrivesWords: journey.arrival ? whenWords(journey.arrival, model) : 'when is not known',
    method,
    methodWords,
    distance,
    leastMinutes,
    words: `${who.join(' and ') || 'Nobody named'}: ${name(journey.fromId)} to ${name(journey.toId)}${via}${methodWords ? `, ${methodWords}` : ''}`,
  };
}

// ---------------------------------------------------------------------------------------------------- a traveller's route

export interface RouteItem {
  key: string;
  kind: 'journey' | 'stay' | 'event' | 'located';
  title: string;
  detail: string;
  when: string;
  journeyId?: string;
  placeIds: string[];
  order: number;
}
export interface Route {
  /** In story time, by date. */
  story: RouteItem[];
  /** As the reader meets them, by chapter. */
  reading: RouteItem[];
  /** With no time that can be placed: journeys in the order the author gives ("after"), then the rest as recorded. */
  unknown: RouteItem[];
}

/** Journeys with no time, in the order the author gives: each after the one it says it comes after, when that is among them. */
function relativeOrder(journeys: Journey[]): Journey[] {
  const left = [...journeys].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  const out: Journey[] = [];
  const placed = new Set<string>();
  while (left.length) {
    const i = left.findIndex((j) => !j.afterId || placed.has(j.afterId) || !left.some((o) => o.id === j.afterId));
    const next = left.splice(i < 0 ? 0 : i, 1)[0];
    out.push(next);
    placed.add(next.id);
  }
  return out;
}

const takesPart = (event: TimelineEvent, id: string) => event.characters.some((c) => c.id === id) || event.entryIds.includes(id);

/** Everywhere one traveller is recorded as being, and every journey they make, in order. */
export function routeOf(model: StoryModel, travellerId: string, journeys: Journey[], settings: TravelSettings | null, maps: WorldMap[] = [], pins: MapPin[] = []): Route {
  const name = (id: string | null) => (id ? (model.entries.get(id)?.name ?? 'a place that is gone') : 'somewhere not recorded');
  const route: Route = { story: [], reading: [], unknown: [] };
  const mine = journeys.filter((j) => j.travellerIds.includes(travellerId)).map((j) => journeyRecord(model, j, settings, maps, pins));
  const item = (r: JourneyRecord): RouteItem => ({
    key: `journey:${r.journey.id}`,
    kind: 'journey',
    title: `${r.from} to ${r.to}${r.journey.via.length ? ` by way of ${r.journey.via.map(name).join(', ')}` : ''}`,
    detail: [r.methodWords, r.journey.duration ? `takes ${formatDuration(r.journey.duration)}` : '', r.distance ? `${r.distance.value} ${r.distance.unit}${r.distance.from === 'map' ? ' on the map' : ''}`.trim() : '', r.journey.eventIds.length ? `part of ${r.journey.eventIds.map((id) => `“${model.events.get(id)?.name ?? 'a deleted event'}”`).join(', ')}` : ''].filter(Boolean).join(' · '),
    when: `leaves ${r.leavesWords}, arrives ${r.arrivesWords}`,
    journeyId: r.journey.id,
    placeIds: [r.journey.fromId, ...r.journey.via, r.journey.toId].filter((p): p is string => Boolean(p)),
    order: 0,
  });
  const undated: Journey[] = [];
  for (const r of mine) {
    const at = story(r.leaves) ?? story(r.arrives);
    if (at) route.story.push({ ...item(r), order: at.lo });
    else if (r.leaves?.axis === 'reading' || r.arrives?.axis === 'reading') route.reading.push({ ...item(r), order: r.leaves?.axis === 'reading' ? r.leaves.at : (r.arrives as { at: number }).at });
    else undated.push(r.journey);
  }
  relativeOrder(undated).forEach((j, i) => {
    const before = j.afterId ? journeys.find((o) => o.id === j.afterId) : undefined;
    route.unknown.push({ ...item(mine.find((r) => r.journey.id === j.id)!), when: before ? `when is not known; after the journey to ${name(before.toId)}` : 'when is not known', order: i });
  });
  // Stays: from arriving somewhere to leaving again, between journeys dated in story time.
  const dated = mine.filter((r) => story(r.leaves) && story(r.arrives)).sort((a, b) => story(a.leaves)!.lo - story(b.leaves)!.lo);
  for (let i = 0; i < dated.length - 1; i++) {
    const [here, next] = [dated[i], dated[i + 1]];
    if (here.journey.toId && story(here.arrives)!.hi <= story(next.leaves)!.lo) route.story.push({ key: `stay:${here.journey.id}`, kind: 'stay', title: `At ${here.to}`, detail: 'between journeys', when: `from ${here.arrivesWords} until ${next.leavesWords}`, placeIds: [here.journey.toId], order: story(here.arrives)!.lo + 0.5 });
  }
  // Events they are at, where the event has a place.
  for (const event of model.events.values()) {
    if (!event.locationId || !takesPart(event, travellerId)) continue;
    const span = spanOfEvent(event.id, timeContext(model));
    const it: RouteItem = { key: `event:${event.id}`, kind: 'event', title: `At ${name(event.locationId)}`, detail: `takes part in “${event.name}”`, when: span ? (eventRecord(model, event.id)?.label ?? 'when is not known') : 'when is not known', placeIds: [event.locationId], order: span?.lo ?? 0 };
    (span ? route.story : route.unknown).push(it);
  }
  // Where they are recorded as located, by a "Located in" connection, from when it holds.
  for (const link of model.links) {
    if (link.type !== 'located-in' || link.fromId !== travellerId || model.entries.get(link.toId)?.category !== 'location') continue;
    const from = link.validity?.from ?? null;
    const until = link.validity?.until ?? null;
    const p = pointOf(from, model);
    const it: RouteItem = { key: `located:${link.id}`, kind: 'located', title: `Located in ${name(link.toId)}`, detail: until ? `until ${whenWords(until, model)}` : 'still', when: from ? `from ${whenWords(from, model)}` : 'from the start', placeIds: [link.toId], order: story(p)?.lo ?? (p?.axis === 'reading' ? p.at : -Infinity) };
    if (story(p)) route.story.push(it);
    else if (p?.axis === 'reading') route.reading.push(it);
    else route.unknown.push(it);
  }
  const sort = (list: RouteItem[]) => list.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  return { story: sort(route.story), reading: sort(route.reading), unknown: route.unknown };
}

// ---------------------------------------------------------------------------------------------------- possible conflicts

export type TravelProblemKind = 'backwards' | 'too-fast' | 'duration' | 'order' | 'two-journeys' | 'event-during' | 'elsewhere' | 'departure' | 'two-places';
export interface TravelProblem {
  key: string;
  kind: TravelProblemKind;
  /** A problem is the records contradicting each other; a note may well have an explanation the records do not give. */
  severity: 'problem' | 'note';
  message: string;
  journeyIds: string[];
}

/**
 * Possible conflicts, each from one rule, flagged only when the records
 * settle it. Times are taken at their widest (an approximate date is all the
 * time it may mean), so a journey is "too fast" only if even the most
 * generous reading of its dates is too short. Nothing is flagged from a time
 * that is not known, from a chapter against an event, or from a speed the
 * author has not set.
 */
export function travelProblems(model: StoryModel, journeys: Journey[], settings: TravelSettings | null, maps: WorldMap[] = [], pins: MapPin[] = []): TravelProblem[] {
  const out: TravelProblem[] = [];
  const records = journeys.map((j) => journeyRecord(model, j, settings, maps, pins));
  const byId = new Map(records.map((r) => [r.journey.id, r]));
  const span = (m: number) => minutesWords(m, model);
  const { parent } = parentsOf(model);
  const around = (id: string) => {
    const out = new Set<string>([id]);
    for (let at = parent.get(id), n = 0; at && n < 1000; at = parent.get(at), n++) out.add(at);
    return out;
  };
  /** Two places one of which lies in the other (or the same place): being at one is being at the other. */
  const nested = (a: string, b: string) => around(a).has(b) || around(b).has(a);

  for (const r of records) {
    const [dep, arr] = [story(r.leaves), story(r.arrives)];
    const label = `${r.travellers}, ${r.from} to ${r.to}`;
    if (dep && arr) {
      if (arr.hi < dep.lo) out.push({ key: `travel|backwards|${r.journey.id}`, kind: 'backwards', severity: 'problem', message: `${label}: arrives (${r.arrivesWords}) before leaving (${r.leavesWords}).`, journeyIds: [r.journey.id] });
      else {
        // Spans count whole minutes, ends included: leaving at the first minute and arriving at the last allows the most; the other way round, the least.
        const most = arr.hi - dep.lo + 1;
        const least = Math.max(0, arr.lo - dep.hi - 1);
        if (r.leastMinutes !== null && r.leastMinutes > most) out.push({ key: `travel|too-fast|${r.journey.id}`, kind: 'too-fast', severity: 'problem', message: `${label}: ${r.distance!.value} ${r.distance!.unit} ${r.methodWords} at ${r.method!.speed} ${r.method!.distanceUnit} ${PER_LABELS[r.method!.per]} takes at least ${span(r.leastMinutes)}, but leaving ${r.leavesWords} and arriving ${r.arrivesWords} allows at most ${span(most)}.`, journeyIds: [r.journey.id] });
        const said = r.journey.duration ? durationMinutes(r.journey.duration, model.calendar) : null;
        if (said !== null && said > most) out.push({ key: `travel|duration-long|${r.journey.id}`, kind: 'duration', severity: 'problem', message: `${label}: said to take ${formatDuration(r.journey.duration)}, but its dates allow at most ${span(most)}.`, journeyIds: [r.journey.id] });
        if (said !== null && said < least) out.push({ key: `travel|duration-short|${r.journey.id}`, kind: 'duration', severity: 'problem', message: `${label}: said to take ${formatDuration(r.journey.duration)}, but its dates put at least ${span(least)} between leaving and arriving.`, journeyIds: [r.journey.id] });
      }
    }
    const said = r.journey.duration ? durationMinutes(r.journey.duration, model.calendar) : null;
    if (said !== null && r.leastMinutes !== null && said < r.leastMinutes) out.push({ key: `travel|duration-speed|${r.journey.id}`, kind: 'too-fast', severity: 'problem', message: `${label}: said to take ${formatDuration(r.journey.duration)}, but ${r.distance!.value} ${r.distance!.unit} ${r.methodWords} at ${r.method!.speed} ${r.method!.distanceUnit} ${PER_LABELS[r.method!.per]} takes at least ${span(r.leastMinutes)}.`, journeyIds: [r.journey.id] });
    const before = r.journey.afterId ? byId.get(r.journey.afterId) : undefined;
    if (before && dep && story(before.leaves) && dep.hi < story(before.leaves)!.lo) out.push({ key: `travel|order|${r.journey.id}`, kind: 'order', severity: 'problem', message: `${label}: said to come after the journey ${before.from} to ${before.to}, but it leaves (${r.leavesWords}) before that one does (${before.leavesWords}).`, journeyIds: [r.journey.id, before.journey.id] });
  }

  // Per traveller: two journeys at once; an event elsewhere during a journey, or during a stay; leaving from somewhere else than last arrived at.
  const travellers = new Set(journeys.flatMap((j) => j.travellerIds));
  for (const t of travellers) {
    const who = model.entries.get(t)?.name ?? 'Someone deleted';
    const theirs = records.filter((r) => r.journey.travellerIds.includes(t) && story(r.leaves) && story(r.arrives)).sort((a, b) => story(a.leaves)!.lo - story(b.leaves)!.lo || a.journey.id.localeCompare(b.journey.id));
    for (let i = 0; i < theirs.length; i++) {
      for (let k = i + 1; k < theirs.length; k++) {
        const [a, b] = [theirs[i], theirs[k]];
        if (story(a.leaves)!.hi < story(b.arrives)!.lo && story(b.leaves)!.hi < story(a.arrives)!.lo) out.push({ key: `travel|two|${t}|${a.journey.id}|${b.journey.id}`, kind: 'two-journeys', severity: 'problem', message: `${who} is on two journeys at once: ${a.from} to ${a.to} (${a.leavesWords} to ${a.arrivesWords}) and ${b.from} to ${b.to} (${b.leavesWords} to ${b.arrivesWords}).`, journeyIds: [a.journey.id, b.journey.id] });
      }
    }
    const events = [...model.events.values()].filter((e) => e.locationId && takesPart(e, t));
    for (const r of theirs) {
      const stops = [r.journey.fromId, ...r.journey.via, r.journey.toId].filter((s): s is string => Boolean(s));
      for (const e of events) {
        const s = spanOfEvent(e.id, timeContext(model));
        if (!s || r.journey.eventIds.includes(e.id) || stops.some((p) => nested(p, e.locationId!))) continue;
        if (s.lo > story(r.leaves)!.hi && s.hi < story(r.arrives)!.lo) out.push({ key: `travel|event-during|${t}|${r.journey.id}|${e.id}`, kind: 'event-during', severity: 'problem', message: `${who} takes part in “${e.name}” at ${model.entries.get(e.locationId!)?.name} while on the journey ${r.from} to ${r.to} (${r.leavesWords} to ${r.arrivesWords}).`, journeyIds: [r.journey.id] });
      }
    }
    for (let i = 0; i < theirs.length - 1; i++) {
      const [here, next] = [theirs[i], theirs[i + 1]];
      const [arrived, leaves] = [story(here.arrives)!, story(next.leaves)!];
      if (!here.journey.toId || arrived.hi > leaves.lo) continue;
      if (next.journey.fromId && !nested(next.journey.fromId, here.journey.toId)) out.push({ key: `travel|departure|${t}|${next.journey.id}`, kind: 'departure', severity: 'note', message: `${who} leaves from ${next.from} (${next.leavesWords}), but last arrived at ${here.to} (${here.arrivesWords}): a journey may be missing.`, journeyIds: [here.journey.id, next.journey.id] });
      for (const e of events) {
        const s = spanOfEvent(e.id, timeContext(model));
        if (!s || nested(e.locationId!, here.journey.toId)) continue;
        if (s.lo > arrived.hi && s.hi < leaves.lo) out.push({ key: `travel|elsewhere|${t}|${here.journey.id}|${e.id}`, kind: 'elsewhere', severity: 'note', message: `${who} takes part in “${e.name}” at ${model.entries.get(e.locationId!)?.name}, while staying at ${here.to} between journeys (${here.arrivesWords} to ${next.leavesWords}): a journey may be missing.`, journeyIds: [here.journey.id, next.journey.id] });
      }
    }
  }

  // Located in two places over the same time, by "Located in" connections that each hold for a while.
  const located = model.links.filter((l) => l.type === 'located-in' && model.entries.get(l.fromId)?.category !== 'location' && model.entries.get(l.toId)?.category === 'location');
  for (let i = 0; i < located.length; i++) {
    for (let k = i + 1; k < located.length; k++) {
      const [a, b] = [located[i], located[k]];
      if (a.fromId !== b.fromId || nested(a.toId, b.toId)) continue;
      if (overlaps(a.validity ?? { from: null, until: null }, b.validity ?? { from: null, until: null }, timeContext(model)) === true && (a.validity || b.validity)) {
        // Named in alphabetical order, so the same records always read the same.
        const [first, second] = [model.entries.get(a.toId)?.name ?? '', model.entries.get(b.toId)?.name ?? ''].sort((x, y) => x.localeCompare(y));
        out.push({ key: `travel|two-places|${[a.id, b.id].sort().join('|')}`, kind: 'two-places', severity: 'note', message: `${model.entries.get(a.fromId)?.name ?? 'Someone'} is recorded as located in both ${first} and ${second} over the same time.`, journeyIds: [] });
      }
    }
  }
  const order: TravelProblemKind[] = ['backwards', 'too-fast', 'duration', 'order', 'two-journeys', 'event-during', 'two-places', 'departure', 'elsewhere'];
  return out.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.message.localeCompare(b.message));
}

/** A journey with one reference taken out, and everything else kept: a traveller, place or event that is gone drops out; a time at a deleted chapter or event becomes not known. */
export function withoutJourneyReference(journey: Journey, id: string): Journey {
  const gone = (a: Anchor | null) => a !== null && ((a.kind === 'node' && a.nodeId === id) || (a.kind === 'event' && a.eventId === id) || (a.kind === 'date' && a.when.precision === 'relative' && a.when.anchorId === id));
  return {
    ...journey,
    travellerIds: journey.travellerIds.filter((t) => t !== id),
    fromId: journey.fromId === id ? null : journey.fromId,
    toId: journey.toId === id ? null : journey.toId,
    via: journey.via.filter((v) => v !== id),
    eventIds: journey.eventIds.filter((e) => e !== id),
    departure: gone(journey.departure) ? null : journey.departure,
    arrival: gone(journey.arrival) ? null : journey.arrival,
    afterId: journey.afterId === id ? null : journey.afterId,
  };
}
