// The logic of flutter_app/test/features/places/places_screens_test.dart and faction_map_test.dart, run on a real
// library: levels of place from a preset, a place's level and what it is inside; a map, a pin, the places not on it;
// a journey recorded and a conflict said, never fixed; travel methods with no speed until given one; a tie recorded,
// shown as it stands, and ended with how; an item passing from hand to hand and lost; and the faction map on a large
// novel (the most tied when none is looked at; one faction's own web when one is). What the Flutter tests check of
// the widgets themselves (taps, scrolling, 200% text) belongs to the screens.

import { openLibrary } from '../../../src/data/library';
import { CharacterService } from '../../../src/domain/characters/characterService';
import { type Ownership, ownershipOf } from '../../../src/domain/factions/ownership';
import { factionAt, factionNetwork, factionTies, factionsOf, mapMost } from '../../../src/domain/factions/ties';
import { setIdGenerator } from '../../../src/domain/ids';
import { type JsonMap, mapOrNull } from '../../../src/domain/json';
import { StoryModel } from '../../../src/domain/model/storyModel';
import { mapPlaces, placeTree } from '../../../src/domain/places/explore';
import { PlaceData, PlacesService } from '../../../src/domain/places/placesService';
import { journeyRecord, travelProblems } from '../../../src/domain/travel/routes';
import { TravelMethod } from '../../../src/domain/travel/travel';
import {
  dateAnchor,
  factionCard,
  factionMap,
  holdingLines,
  journeyInput,
  ownershipChange,
  pinWords,
  placeLine,
  tieChange,
  endTie,
} from '../../../src/domain/visualize/world/worldViews';
import { NovelSnapshot } from '../../../src/domain/snapshot/novelSnapshot';
import { readJson, samplePath, testIds } from '../../fixtures';
import { memoryLibrary } from '../../nodeSql';

setIdGenerator(testIds());

function world() {
  let now = 1000;
  const lib = openLibrary(memoryLibrary(), () => now, testIds());
  const novel = lib.library.create({ title: 'World' }).novel.id;
  const s = new CharacterService(lib.novels, lib.backups, { clock: () => (now += 1000), createId: testIds() });
  const places = new PlacesService(lib.novels, { clock: () => (now += 1000), createId: testIds() });
  const mira = s.change(novel, (x) => x.create({ name: 'Mira' })).id;
  const orrin = s.change(novel, (x) => x.create({ name: 'Orrin' })).id;
  const keep = s.change(novel, (x) => x.createEntry('location', 'Greykeep')).id;
  const port = s.change(novel, (x) => x.createEntry('location', 'Saltport')).id;
  const guild = s.change(novel, (x) => x.createEntry('faction', 'Thieves Guild')).id;
  const sword = s.change(novel, (x) => x.createEntry('item', 'Greysword')).id;
  const rows = (collection: string): JsonMap[] => lib.novels.rowsIn(novel, collection);
  const snapshot = () => s.read(novel)!;
  const model = () => StoryModel.fromSnapshot(snapshot());
  return { lib, s, places, novel, mira, orrin, keep, port, guild, sword, rows, snapshot, model };
}

test('levels of place start from a preset; a place gets its level and what it is inside', () => {
  const w = world();
  w.places.change(w.novel, (c) => c.applyPreset('world'));
  expect(w.rows('placeSettings')[0]['levels']).toHaveLength(8);
  const city = new PlaceData(w.snapshot()).settings!.levels.find((l) => l.name === 'City')!;
  w.places.change(w.novel, (c) => c.setLevel(w.port, city.id));
  w.places.change(w.novel, (c) => c.setParent(w.port, w.keep));
  expect(w.rows('loreEntries').find((e) => e['id'] === w.port)!['placeLevel']).toBe(city.id);
  const link = w.rows('loreLinks')[0];
  expect([link['fromId'], link['toId'], link['type']]).toEqual([w.port, w.keep, 'located-in']);
  const data = new PlaceData(w.snapshot());
  const row = placeTree(w.model(), { settings: data.settings, pins: data.pins }).find((r) => r.entry.id === w.port)!;
  expect(placeLine(row, new Map(), false, null)).toContain('City · no events here yet');
});

test('a map is made, a place given coordinates, and the places not on it are listed', () => {
  const w = world();
  const map = w.places.change(w.novel, (c) => c.saveMap(null, { name: 'The Known World' }));
  expect(w.rows('worldMaps')[0]['name']).toBe('The Known World');
  let data = new PlaceData(w.snapshot());
  let rows = placeTree(w.model(), { settings: data.settings, pins: data.pins });
  expect(mapPlaces(rows, data.maps[0], data.pins).missing).toHaveLength(2);
  w.places.change(w.novel, (c) => c.pin(map.id, w.keep, 10, 20));
  const pin = w.rows('mapPins')[0];
  expect([pin['entryId'], pin['x'], pin['y']]).toEqual([w.keep, 10, 20]);
  data = new PlaceData(w.snapshot());
  rows = placeTree(w.model(), { settings: data.settings, pins: data.pins });
  const on = mapPlaces(rows, data.maps[0], data.pins);
  expect(on.missing).toHaveLength(1);
  expect(pinWords(on.pinned[0], data.maps[0])).toBe('Greykeep: 10 across, 20 down');
});

test('a journey is recorded with who travels, from and to; a conflict is said, never fixed', () => {
  const w = world();
  const input = journeyInput({
    travellerIds: [w.mira],
    fromId: w.keep,
    toId: w.port,
    via: [],
    departure: null,
    arrival: null,
    afterId: null,
    methodId: null,
    ownMethod: null,
    duration: '',
    unit: 'days',
    distance: '',
    distanceUnit: '',
    eventIds: [],
    note: '',
  });
  const j = w.places.change(w.novel, (c) => c.saveJourney(null, input));
  const row = w.rows('journeys')[0];
  expect([row['travellerIds'], row['fromId'], row['toId'], row['departure']]).toEqual([[w.mira], w.keep, w.port, null]);
  let data = new PlaceData(w.snapshot());
  expect(journeyRecord(w.model(), data.journeys[0], data.travel).words).toBe('Mira: Greykeep to Saltport');
  expect(travelProblems(w.model(), data.journeys, data.travel)).toEqual([]);

  // Arriving before leaving is said; the journey is kept as it is.
  const day = (m: number) => ({ kind: 'date', when: { precision: 'exact', year: 10, month: m, day: 1, hour: null, minute: null } });
  expect(dateAnchor('10', '3', '1', false)).toEqual(day(3));
  w.places.change(w.novel, (c) => c.saveJourney(j.id, { departure: day(3), arrival: day(2) }));
  data = new PlaceData(w.snapshot());
  expect(travelProblems(w.model(), data.journeys, data.travel).map((p) => p.message).join(' ')).toContain(
    'arrives (Year 10, February 1) before leaving (Year 10, March 1)',
  );
  expect(w.rows('journeys')[0]['arrival']).toEqual(day(2));
});

test('travel methods are the author’s: none has a speed until given one', () => {
  const w = world();
  w.places.change(w.novel, (c) => c.setMethods([new TravelMethod({ id: '', name: 'By horse' })]));
  const methods = new PlaceData(w.snapshot()).travel!.methods;
  expect([methods[0].name, methods[0].speed]).toEqual(['By horse', null]);
});

test('a tie is recorded for a faction, shown as it stands, and ended with how', () => {
  const w = world();
  const s = w.s;
  expect(tieChange({ from: null, to: w.guild, type: 'member-of', own: '', begins: null, how: '' })).toBe('Choose both ends, and the kind of tie.');
  const make = tieChange({ from: w.mira, to: w.guild, type: 'member-of', own: '', begins: null, how: 'joined' });
  if (typeof make === 'string') throw new Error(make);
  s.change(w.novel, make);
  const link = w.rows('loreLinks')[0];
  expect([link['fromId'], link['toId'], link['type'], link['how']]).toEqual([w.mira, w.guild, 'member-of', 'joined']);
  let at = factionAt(w.model(), w.guild, null);
  expect(factionCard(at.byRole, at.notNow).lines).toEqual([{ label: 'Members', ties: 'Mira (no time given)' }]);

  expect(endTie(link['id'] as string, null, 'expelled')).toBe('Choose when it ends.');
  const end = endTie(link['id'] as string, dateAnchor('12', '', '', false), 'expelled');
  if (typeof end === 'string') throw new Error(end);
  s.change(w.novel, end);
  const ended = w.rows('loreLinks')[0];
  expect(ended['endHow']).toBe('expelled');
  expect(mapOrNull(mapOrNull(ended['validity'])!['until'])!['kind']).toBe('date');
  const ties = factionTies(w.model(), w.guild);
  expect(ties[0].when).toContain('until Year 12 (expelled)');
  at = factionAt(w.model(), w.guild, null);
  expect(factionCard(at.byRole, at.notNow).notNow).toBe('1 tie has ended or not yet begun by then.');
});

test('an item passes from hand to hand, each holding kept as history, and is lost', () => {
  const w = world();
  const owned = () => ownershipOf(w.model(), w.sword)!;
  expect(owned().now.words).toBe('No owner recorded.');
  const form = (o: Ownership, what: string, holder: string | null, when: JsonMap | null) =>
    ownershipChange({
      itemId: w.sword,
      what,
      own: '',
      holder,
      open: o.holdings.filter((h) => h.inThisTimeline && (h.link.validity?.until ?? null) === null),
      which: o.holdings.filter((h) => h.inThisTimeline && (h.link.validity?.until ?? null) === null)[0]?.link.id ?? null,
      when,
    });
  const made = form(owned(), 'made', w.mira, null);
  if (typeof made === 'string') throw new Error(made);
  w.s.change(w.novel, made);
  expect(w.rows('loreLinks')[0]['how']).toBe('made');
  expect(owned().now.words).toBe('Held by Mira.');

  // It needs a point in the story to pass on, and says so.
  expect(form(owned(), 'stolen', w.orrin, null)).toBe('Choose when it happens: Mira holds it until then.');
  const stolen = form(owned(), 'stolen', w.orrin, dateAnchor('11', '', '', false));
  if (typeof stolen === 'string') throw new Error(stolen);
  w.s.change(w.novel, stolen);
  expect(w.rows('loreLinks')).toHaveLength(2);
  expect(owned().now.words).toBe('Held by Orrin.');
  expect(holdingLines(owned().holdings[0])).toContain('until Year 11 (stolen by Orrin)');

  const lost = form(owned(), 'lost', null, dateAnchor('12', '', '', false));
  if (typeof lost === 'string') throw new Error(lost);
  w.s.change(w.novel, lost);
  expect(owned().now.state).toBe('ended');
});

/** The sample with 190 factions and 200 characters, and 4,000 typed links among them (as the Flutter test's large
 * novel has: alliances, wars, distrust, places, ownership, leadership, membership), from a fixed seed. */
function largeNovel(): NovelSnapshot {
  const file = readJson(samplePath) as { project: JsonMap; collections: Record<string, JsonMap[]> };
  const project = String(file.project['id']);
  let seed = 7;
  const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648);
  const entry = (id: string, category: string, name: string): JsonMap => ({ id, projectId: project, category, name, createdAt: 1, updatedAt: 1 });
  const factions = Array.from({ length: 190 }, (_, i) => entry(`fa${i}`, 'faction', `The Order ${i}`));
  const people = Array.from({ length: 200 }, (_, i) => entry(`ch${i}`, 'character', `Person ${i}`));
  const ends = [...factions, ...people];
  const types = ['allied-with', 'at-war-with', 'distrusts', 'located-in', 'owns', 'leads', 'member-of', 'influences'];
  const links = Array.from({ length: 4000 }, (_, i) => ({
    id: `ln${i}`,
    projectId: project,
    fromId: String(ends[next() % ends.length]['id']),
    toId: String(factions[next() % factions.length]['id']),
    fromType: 'entry',
    toType: 'entry',
    type: types[next() % types.length],
    fromLabel: '',
    toLabel: '',
    createdAt: next() % 1000,
  }));
  const collections = { ...file.collections, loreEntries: [...file.collections['loreEntries'], ...ends], loreLinks: [...file.collections['loreLinks'], ...links] };
  return NovelSnapshot.fromJson({ ...file, collections });
}

describe('the faction map on a large novel', () => {
  const model = StoryModel.fromSnapshot(largeNovel());
  const factions = factionsOf(model);

  test('a faction’s ties are found from its own links: the same ties, in the same order, as reading every link', () => {
    expect(factions.length).toBeGreaterThan(mapMost);
    for (const f of factions) {
      const every = model.links
        .filter((l) => l.type !== null && ((l.fromId === f.id && l.fromType === 'entry') || (l.toId === f.id && l.toType === 'entry')))
        .map((l) => l.id);
      const found = factionTies(model, f.id).map((t) => t.link.id);
      expect(new Set(found)).toEqual(new Set(every));
      expect(found.length).toBe(every.length);
    }
  });

  test('none looked at: the most tied, the ties among them only, and how many are left out', () => {
    const net = factionNetwork(model, null);
    expect(net.factions.length).toBe(mapMost);
    expect(net.left).toBe(factions.length - mapMost);
    const drawn = new Set(net.factions.map((f) => f.id));
    const every = new Set(factions.map((f) => f.id));
    for (const e of net.edges) for (const end of [e.link.fromId, e.link.toId].filter((id) => every.has(id))) expect(drawn.has(end)).toBe(true);
    const all = factionNetwork(model, null, { most: 100000 });
    const ties = (id: string) => all.edges.filter((e) => e.link.fromId === id || e.link.toId === id).length;
    const least = Math.min(...net.factions.map((f) => ties(f.id)));
    for (const f of factions.filter((f) => !drawn.has(f.id))) expect(ties(f.id)).toBeLessThanOrEqual(least);
    expect(all.left).toBe(0);
    expect(factionMap(model, null, null)!.note).toBe(
      `The ${mapMost} factions with the most ties, of ${factions.length}. Tap one to see its own ties round it; every faction is in the cards below.`,
    );
  });

  test('around one faction: it first, the factions it is tied to, and its own ties only', () => {
    const f = factions.find((f) => factionTies(model, f.id).length > 0)!;
    const net = factionNetwork(model, null, { around: f.id });
    expect(net.factions[0].id).toBe(f.id);
    expect(net.left).toBe(factions.length - net.factions.length);
    for (const e of net.edges) expect([e.link.fromId, e.link.toId]).toContain(f.id);
    const near = new Set(net.edges.flatMap((e) => [e.link.fromId, e.link.toId]));
    for (const g of net.factions.slice(1)) expect(near.has(g.id)).toBe(true);
    const drawn = factionMap(model, null, f.id)!;
    expect(drawn.pos.get(f.id)).toBeDefined();
    expect(drawn.note).toContain(`${f.name} and its own ties:`);
  });
});
