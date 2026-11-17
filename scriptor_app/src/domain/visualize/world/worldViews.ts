// Visualize's world views, their pure parts (FEATURES.md #293–#300): the place explorer's lines, trail and pins; the
// journeys page's order, whose journeys, the problems for a traveller and the journey form's input; the factions
// page's cards, the faction map's layout and its ties' look; the ownership page's item, chain and form; and the
// "when" picker shared by the forms. Ports of the pure parts of flutter_app/lib/features/places/{places_page,
// journeys_page,factions_page,ownership_page}.dart and widgets/{place_panels,when_picker}.dart.

import { relateIn } from '../../characters/views/common';
import type { CharacterChanges } from '../../characters/characterChanges';
import { localeCompare } from '../../collation';
import { plural } from '../../desk/format';
import { type Holding, howEnded, howGained } from '../../factions/ownership';
import { type Tie, type TieRole, factionNetwork, tieRoleLabel } from '../../factions/ties';
import type { JsonMap } from '../../json';
import { compareNum } from '../../manuscript/dartSort';
import { EntityRef } from '../../model/entityRef';
import type { StoryModel } from '../../model/storyModel';
import { type Anchor } from '../../model/validity';
import { type PlaceRow, placesWithin } from '../../places/explore';
import type { MapPin, WorldMap } from '../../places/places';
import { whenWords } from '../../progression/track';
import { stableSorted } from '../../reader/stableSort';
import type { Entry } from '../../records/entry';
import type { Journey } from '../../records/journey';
import { connectionType } from '../../records/link';
import type { RouteItem, TravelProblem } from '../../travel/routes';
import { journeyRecord } from '../../travel/routes';
import type { TravelSettings } from '../../travel/travel';

// ------------------------------------------------------------------------------------------------------- places

/** A number as Dart's `_n` writes it: a whole number without its fraction. */
export const n = (v: number): string => (v === Math.round(v) ? `${Math.round(v)}` : `${v}`);

/** A place's line in the tree: its level, events here and within, characters, factions, chapters, maps; then its notes. */
export function placeLine(r: PlaceRow, mapNames: ReadonlyMap<string, string>, anyMaps: boolean, selection: string | null): string {
  const parts = [
    ...(r.levelWords.length > 0 ? [r.levelWords] : []),
    r.events > 0 ? `${plural(r.events, 'event')} here` : 'no events here yet',
    ...(r.eventsWithin > 0 ? [`${plural(r.eventsWithin, 'event')} within`] : []),
    ...(r.characters > 0 ? [plural(r.characters, 'character')] : []),
    ...(r.factions > 0 ? [plural(r.factions, 'faction')] : []),
    ...(r.chapters > 0 ? [plural(r.chapters, 'chapter or scene', 'chapters and scenes')] : []),
    ...(anyMaps ? [r.maps.length > 0 ? `on ${r.maps.map((id) => mapNames.get(id)).join(', ')}` : 'no coordinates'] : []),
    ...(selection !== null ? [selection] : []),
  ];
  return [parts.join(' · '), ...r.notes].join('\n');
}

/** The places shown, inside one place or all; and the trail down to it. */
export function placesScope(rows: readonly PlaceRow[], inside: string | null): { scoped: PlaceRow[]; trail: PlaceRow[]; inside: string | null } {
  const byId = new Map(rows.map((r) => [r.entry.id, r]));
  const at = inside !== null && byId.has(inside) ? inside : null;
  const within = at === null ? null : new Set(placesWithin(rows, at));
  const scoped = at === null ? [...rows] : rows.filter((r) => r.entry.id === at || within!.has(r.entry.id));
  const trail: PlaceRow[] = [];
  for (let r = at === null ? undefined : byId.get(at), steps = 0; r !== undefined && steps < 10000; steps++) {
    trail.unshift(r);
    r = r.parentId === null ? undefined : byId.get(r.parentId);
  }
  return { scoped, trail, inside: at };
}

/** A pin in words: "Greykeep: 10 across, 20 down leagues, outside the map's edges". */
export function pinWords(p: { entry: Entry; pin: MapPin; outside: boolean }, map: WorldMap): string {
  return (
    `${p.entry.name}: ${n(p.pin.x)} across, ${n(p.pin.y)} down${map.unit.length > 0 ? ` ${map.unit}` : ''}` +
    (p.outside ? ', outside the map’s edges' : '')
  );
}

/** About this many drawing units across the larger side of a map, so pins and labels read the same on any map. */
export const mapDrawn = 800;

/** A map's drawing: its scale, its size (with a margin), and whether its grid is drawn. */
export function mapDrawing(map: WorldMap): { s: number; pad: number; w: number; h: number; width: number; height: number; step: number } {
  const s = mapDrawn / Math.max(map.width, map.height);
  const pad = 40;
  const w = map.width * s;
  const h = map.height * s;
  const gridLines = map.grid > 0 && map.width / map.grid <= 200 && map.height / map.grid <= 200;
  return { s, pad, w, h, width: w + pad * 2, height: h + pad * 2, step: gridLines ? map.grid * s : 0 };
}

/** Where a tap on the drawing puts a pin, in the map's own units (to two places). */
export function tapToMap(x: number, y: number, map: WorldMap): { x: number; y: number } {
  const d = mapDrawing(map);
  const round = (v: number) => Math.round(v * 100) / 100;
  return { x: round((x - d.pad) / d.s), y: round((y - d.pad) / d.s) };
}

export const tieKindsForPlace = ['located-in', 'controls', 'influences', 'owns', 'leads', 'related'];

// ----------------------------------------------------------------------------------------------------- journeys

/** Journeys in the order of the story: by when they leave (or arrive), then as recorded. */
export function journeysInOrder(model: StoryModel, list: readonly Journey[], settings: TravelSettings | null): Journey[] {
  const dated = (j: Journey) => {
    const r = journeyRecord(model, j, settings);
    return r.leaves?.lo ?? r.arrives?.lo ?? Number.POSITIVE_INFINITY;
  };
  return stableSorted(list, (a, b) => {
    const c = compareNum(dated(a), dated(b));
    if (c !== 0) return c;
    const t = compareNum(a.createdAt, b.createdAt);
    return t !== 0 ? t : localeCompare(a.id, b.id);
  });
}

/** Everyone who travels, by name. */
export function travellersOf(model: StoryModel, journeys: readonly Journey[]): string[] {
  return stableSorted(
    [...new Set(journeys.flatMap((j) => j.travellerIds))].filter((id) => model.entries.has(id)),
    (a, b) => localeCompare(model.entries.get(a)!.name, model.entries.get(b)!.name),
  );
}

/** The problems a traveller's view lists (everyone's when no one is chosen). */
export function problemsFor(model: StoryModel, problems: readonly TravelProblem[], who: string | null, theirs: readonly Journey[]): TravelProblem[] {
  if (who === null) return [...problems];
  const name = model.entries.get(who)?.name ?? '';
  return problems.filter(
    (p) => p.journeyIds.length === 0 || p.journeyIds.some((id) => theirs.some((j) => j.id === id)) || p.message.startsWith(name),
  );
}

export const routeParts = (r: { story: RouteItem[]; reading: RouteItem[]; unknown: RouteItem[] }) =>
  [
    { title: 'In story time', items: r.story },
    { title: 'As the reader meets them', items: r.reading },
    { title: 'When not known', items: r.unknown },
  ].filter((p) => p.items.length > 0);

/** A route line's words: when, then what else. */
export const routeLine = (i: RouteItem): string => [i.when, ...(i.detail.length > 0 ? [i.detail] : [])].join(' · ');

/** One colour a traveller on the route map. */
export const travellerColors = ['#2b7a8c', '#a8436b', '#6b7a2b', '#a3622b', '#4f5fa3', '#8c2b5a', '#2b8c6b'];
export const otherColor = '#8a8276';

/** The journey form's input, as the original's form builds it. */
export function journeyInput(form: {
  travellerIds: string[];
  fromId: string | null;
  toId: string | null;
  via: string[];
  departure: JsonMap | null;
  arrival: JsonMap | null;
  afterId: string | null;
  methodId: string | null;
  ownMethod: string | null;
  duration: string;
  unit: string;
  distance: string;
  distanceUnit: string;
  eventIds: string[];
  note: string;
}): JsonMap {
  const amount = form.duration.trim();
  const distance = form.distance.trim();
  // As Dart's `num.tryParse(t) ?? t`: a number when it reads as one, else the words (refused when saved).
  const num = (t: string): unknown => (t.length > 0 && Number.isFinite(Number(t)) ? Number(t) : t);
  return {
    travellerIds: form.travellerIds,
    fromId: form.fromId,
    toId: form.toId,
    via: form.via,
    departure: form.departure,
    arrival: form.arrival,
    afterId: form.afterId,
    method: form.ownMethod ?? '',
    methodId: form.ownMethod !== null ? null : form.methodId,
    duration: amount.length === 0 ? null : { amount: num(amount), unit: form.unit },
    distance: distance.length === 0 ? null : num(distance),
    distanceUnit: form.distanceUnit,
    eventIds: form.eventIds,
    note: form.note,
  };
}

// ----------------------------------------------------------------------------------------------------- the when

/** A point in the story the forms take: not known (null), a chapter or event (`n:`/`e:`), or a date. */
export function dateAnchor(year: string, month: string, day: string, approx: boolean): JsonMap {
  const int = (t: string): number | null => (/^-?\d+$/.test(t.trim()) ? Number(t.trim()) : null);
  const y = int(year) ?? 1;
  const m = int(month);
  const d = int(day);
  return {
    kind: 'date',
    when: approx
      ? { precision: 'approximate', year: y, month: m, season: null }
      : { precision: 'exact', year: y, month: m, day: m === null ? null : d, hour: null, minute: null },
  };
}

/** A point as the "as of" choosers name it: the end of the story, a chapter or an event. */
export const pointWords = (at: Anchor | null, model: StoryModel): string => (at === null ? 'the end of the story' : whenWords(at, model));

// ----------------------------------------------------------------------------------------------------- factions

export const tieKinds = ['member-of', 'leads', 'allied-with', 'at-war-with', 'considers-rival', 'controls', 'influences', 'located-in'];

/** How each kind of tie is drawn on the faction map. */
export const tieStyle: Readonly<Partial<Record<TieRole, { color: string; dash: number[] }>>> = {
  ally: { color: '#6b7a2b', dash: [] },
  rival: { color: '#a8436b', dash: [6, 4] },
  influence: { color: '#4f5fa3', dash: [] },
  territory: { color: '#8a8276', dash: [1, 4] },
  other: { color: '#a3622b', dash: [4, 2, 1, 2] },
};

/** A tie in a faction's card: the other end (or its words), whether it may hold, whether no time is given. */
export const tieWords = (t: Tie): string =>
  [t.role === 'other' ? t.words : t.otherName, ...(t.holds === 'unknown' ? ['(may hold)'] : []), ...(t.timeless ? ['(no time given)'] : [])].join(' ');

/** A faction's card at a point: each role's ties, and how many have ended or not begun. */
export function factionCard(byRole: ReadonlyMap<TieRole, Tie[]>, notNow: number): { lines: { label: string; ties: string }[]; empty: boolean; notNow: string | null } {
  const order: TieRole[] = ['leader', 'member', 'ally', 'rival', 'territory', 'influence', 'seat', 'other'];
  return {
    lines: order.filter((r) => byRole.has(r)).map((r) => ({ label: tieRoleLabel[r], ties: byRole.get(r)!.map(tieWords).join(', ') })),
    empty: byRole.size === 0,
    notNow: notNow > 0 ? `${notNow} ${notNow === 1 ? 'tie has' : 'ties have'} ended or not yet begun by then.` : null,
  };
}

export const factionsNote = (at: Anchor | null, model: StoryModel): string =>
  `As of ${pointWords(at, model)}. A tie with no time given holds as far as anyone has said: nothing here is ` +
  'assumed to last. “May hold” marks a tie whose time cannot be compared with this point (a chapter against ' +
  'an event).';

/** The faction map: where each faction and each place held in sway goes, its size, and what it says beneath. */
export function factionMap(
  model: StoryModel,
  at: Anchor | null,
  around: string | null,
): {
  pos: Map<string, { x: number; y: number }>;
  width: number;
  height: number;
  factionIds: Set<string>;
  edges: Tie[];
  roles: TieRole[];
  label: string;
  note: string | null;
} | null {
  const { factions, edges, territories, left } = factionNetwork(model, at, { around });
  const pos = new Map<string, { x: number; y: number }>();
  if (around !== null) {
    // The faction in the middle; the factions it is tied to and what it holds round it.
    const ring = [...factions.filter((f) => f.id !== around).map((f) => f.id), ...territories.map((t) => t.id)];
    const r = Math.max(170, ring.length * 24);
    pos.set(around, { x: 0, y: 0 });
    ring.forEach((id, i) => {
      const a = (i / ring.length) * Math.PI * 2 - Math.PI / 2;
      pos.set(id, { x: Math.cos(a) * r, y: Math.sin(a) * r });
    });
  } else {
    const r = Math.max(150, factions.length * 22);
    factions.forEach((f, i) => {
      const a = (i / factions.length) * Math.PI * 2 - Math.PI / 2;
      pos.set(f.id, { x: Math.cos(a) * r, y: Math.sin(a) * r });
    });
    // Territory just beyond the first faction that controls or influences it.
    territories.forEach((t, i) => {
      const owner = edges.find((e) => e.other.id === t.id)!;
      const from = pos.get(owner.link.fromId) ?? { x: 0, y: 0 };
      const dist = Math.sqrt(from.x * from.x + from.y * from.y);
      const len = dist === 0 ? 1 : dist;
      const spread = (i % 3) - 1;
      pos.set(t.id, {
        x: from.x + (from.x / len) * 110 - (from.y / len) * spread * 60,
        y: from.y + (from.y / len) * 110 + (from.x / len) * spread * 60,
      });
    });
  }
  if (pos.size === 0) return null;
  const xs = [...pos.values()].map((p) => p.x);
  const ys = [...pos.values()].map((p) => p.y);
  const minX = Math.min(...xs) - 120;
  const minY = Math.min(...ys) - 60;
  for (const [id, p] of pos) pos.set(id, { x: p.x - minX, y: p.y - minY });
  const roles = (['ally', 'rival', 'influence', 'territory', 'other'] as TieRole[]).filter((role) => edges.some((e) => e.role === role));
  return {
    pos,
    width: Math.max(...xs) + 120 - minX,
    height: Math.max(...ys) + 70 - minY,
    factionIds: new Set(factions.map((f) => f.id)),
    edges,
    roles,
    label:
      `Faction map: ${factions.length} ${factions.length === 1 ? 'faction' : 'factions'} and ` +
      `${edges.length} ${edges.length === 1 ? 'tie' : 'ties'} holding. The cards below give the same in words.`,
    note:
      around !== null
        ? `${model.entries.get(around)?.name ?? 'This faction'} and its own ties: ${factions.length - 1} ` +
          `${factions.length === 2 ? 'faction' : 'factions'}, ${territories.length} held in sway.`
        : left > 0
          ? `The ${factions.length} factions with the most ties, of ${factions.length + left}. Tap one to see its own ` +
            'ties round it; every faction is in the cards below.'
          : null,
  };
}

/** Records a tie from the faction form: both ends and the kind, or what is missing. */
export function tieChange(form: {
  from: string | null;
  to: string | null;
  type: string;
  own: string;
  begins: JsonMap | null;
  how: string;
}): ((c: CharacterChanges) => unknown) | string {
  const kind = form.type === 'own' ? form.own.trim() : form.type;
  if (form.from === null || form.to === null || kind.length === 0) return 'Choose both ends, and the kind of tie.';
  const { from, to, begins, how } = form;
  return (c) =>
    relateIn(c, (r) =>
      r.createConnection({ from: new EntityRef('entry', from), to: new EntityRef('entry', to), type: kind, startsAt: begins, how }),
    );
}

/** Ends a tie at a point, with how it ended; or says what is missing. */
export function endTie(linkId: string, at: JsonMap | null, how: string): ((c: CharacterChanges) => unknown) | string {
  if (at === null) return 'Choose when it ends.';
  return (c) => relateIn(c, (r) => r.endConnection(linkId, at, { endHow: how }));
}

export const tieKindLabel = (k: string): string => connectionType(k).label;

// ---------------------------------------------------------------------------------------------------- ownership

/** The item shown: the one chosen, else the first anyone owns, else the first. */
export function itemShown(model: StoryModel, items: readonly Entry[], chosen: string | null): Entry {
  return (
    items.find((i) => i.id === chosen) ??
    items.find((i) => model.links.some((l) => l.type === 'owns' && l.toId === i.id)) ??
    items[0]
  );
}

const cap = (s: string) => `${s[0].toUpperCase()}${s.substring(1)}`;

/** What can happen to an item, as the form offers it. */
export const ownershipChoices: { value: string; label: string }[] = [
  ...howGained.map((h) => ({ value: h, label: `${cap(h)} (it passes to someone)` })),
  { value: 'own', label: 'It passes to someone, in your own words…' },
  ...howEnded.map((h) => ({ value: h, label: `${cap(h)} (nobody has it after)` })),
  { value: 'own-end', label: 'Nobody has it after, in your own words…' },
];

export const ownershipEnds = (what: string): boolean => howEnded.includes(what) || what === 'own-end';

/** A holding's card in the chain. */
export function holdingLines(h: Holding): string[] {
  return [
    `${h.how.length > 0 ? `${h.how}, ` : ''}${h.began}`,
    ...(h.ended !== null ? [`until ${h.ended}${h.endHow.length > 0 ? ` (${h.endHow})` : ''}`] : []),
    ...(!h.inThisTimeline ? ['does not happen in this timeline'] : []),
    ...(h.timeless ? ['(no time given)'] : []),
  ];
}

/** Records what happens to an item; or says what is missing. */
export function ownershipChange(form: {
  itemId: string;
  what: string;
  own: string;
  holder: string | null;
  open: readonly Holding[];
  which: string | null;
  when: JsonMap | null;
}): ((c: CharacterChanges) => unknown) | string {
  const ends = ownershipEnds(form.what);
  const how = form.what === 'own' || form.what === 'own-end' ? form.own.trim() : form.what;
  const { when, which, holder, itemId } = form;
  if (how.length === 0) return 'Say what happens.';
  if (ends) {
    if (form.open.length === 0 || which === null) return 'Nobody is recorded as holding it now.';
    if (when === null) return 'Choose when it happens.';
    return (c) => relateIn(c, (r) => r.endConnection(which, when, { endHow: how }));
  }
  if (holder === null) return 'Choose who has it next.';
  if (form.open.length > 0 && which !== null) {
    if (when === null) {
      const before = form.open.find((h) => h.link.id === which)?.holderName ?? 'the holder before';
      return `Choose when it happens: ${before} holds it until then.`;
    }
    return (c) => relateIn(c, (r) => r.changeConnection(which, when, { fromId: holder, how }));
  }
  return (c) =>
    relateIn(c, (r) =>
      r.createConnection({ from: new EntityRef('entry', holder), to: new EntityRef('entry', itemId), type: 'owns', startsAt: when, how }),
    );
}

export const heldNowNote = (open: readonly Holding[]): string =>
  open.length > 0
    ? `Held now by ${open.map((h) => h.holderName).join(' and ')}: that holding ends at the point you choose, and is kept as history.`
    : 'Nobody is recorded as holding it now.';
