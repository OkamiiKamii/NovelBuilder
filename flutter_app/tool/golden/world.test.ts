// Reference outputs of the original app's places, travel, factions and ownership: the place tree (levels, what is
// inside what, what does not add up), what a place is tied to, places on maps, journeys read against the story,
// each traveller's route, possible travel conflicts, faction ties at every point, the faction map, and who held each
// item. On real files and a generated world (written beside the goldens so the Dart tests read the very same records).
// GOLDEN_OUT=<dir> npx vitest run golden/world.test.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'vitest';
import { factionAt, factionNetwork, factionsOf, factionTies, whenHeld } from '@/modules/factions/ties';
import { ownedItems, ownershipOf } from '@/modules/factions/ownership';
import { buildModel } from '@/modules/model/model';
import { mapPlaces, parentsOf, placeLinks, placeTree, placesWithin } from '@/modules/places/explore';
import { journeyRecord, minutesWords, routeOf, travelProblems, withoutJourneyReference } from '@/modules/travel/routes';

const OUT = process.env.GOLDEN_OUT!;
const FIXTURES: Record<string, string> = {
  'qa-sample': '../qa/qa-sample.novel.json',
  'made-in-the-app': '../src/modules/projects/fixtures/made-in-the-app.novel.json',
};
const json = (value: unknown) => JSON.stringify(value, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? (Number.isNaN(v) ? 'NaN' : v > 0 ? 'Infinity' : '-Infinity') : v instanceof Map ? Object.fromEntries(v) : v instanceof Set ? [...v] : v), 1);

// ---------------------------------------------------------------------------------------------------- the generated world

function worldNovel() {
  const P = 'world';
  const date = (year: number, month: number | null = null, day: number | null = null) => ({ precision: 'exact', year, month, day: month ? day : null, hour: null, minute: null });
  const approx = (year: number) => ({ precision: 'approximate', year, month: null, season: null });
  const node = (id: string, title: string, order: number, mentions: string[] = []) => ({ id, projectId: P, parentId: null, kind: 'chapter', title, order, summary: '', notes: '', status: 'idea', wordCount: 0, charCount: 0, mentions, createdAt: order, updatedAt: 0 });
  const entry = (id: string, name: string, category: string, placeLevel: string | null = null) => ({ id, projectId: P, category, name, summary: '', description: '', image: null, notes: '', tags: [], fields: [], ...(placeLevel ? { placeLevel } : {}), createdAt: 0, updatedAt: 0 });
  let order = 0;
  const link = (id: string, fromId: string, toId: string, type: string, more: Record<string, unknown> = {}) => ({ id, projectId: P, fromId, toId, fromLabel: '', toLabel: '', createdAt: ++order, type, ...more });
  const valid = (from: unknown, until: unknown = null) => ({ validity: { from, until } });
  const at = (when: unknown) => ({ kind: 'date', when });
  const nodeAt = (id: string) => ({ kind: 'node', nodeId: id });
  const eventAt = (id: string) => ({ kind: 'event', eventId: id });
  const event = (id: string, name: string, when: unknown, locationId: string | null, characters: string[], more: Record<string, unknown> = {}) => ({ id, projectId: P, name, description: '', when, duration: null, importance: 'normal', locationId, characters: characters.map((c) => ({ id: c, age: null })), entryIds: [], nodeIds: [], afterId: null, threadIds: [], labels: [], createdAt: ++order, ...more });
  const entries = [
    entry('world', 'The World', 'location', 'L1'),
    entry('north', 'Northreach', 'location', 'L2'),
    entry('south', 'Southmarch', 'location', 'L2'),
    entry('keep', 'Greykeep', 'location', 'L3'),
    entry('hall', 'Great Hall', 'location', 'L4'),
    entry('port', 'Saltport', 'location', 'L3'),
    entry('loopA', 'Loop A', 'location'),
    entry('loopB', 'Loop B', 'location'),
    entry('village', 'Upside Village', 'location', 'L3'),
    entry('county', 'Inner County', 'location', 'L2'),
    entry('ruins', 'Old Ruins', 'location', 'gone-level'),
    entry('mira', 'Mira', 'character'),
    entry('orrin', 'Orrin', 'character'),
    entry('pell', 'Pell', 'character'),
    entry('guild', 'Thieves Guild', 'faction'),
    entry('crown', 'The Crown', 'faction'),
    entry('rebels', 'The Rebels', 'faction'),
    entry('order', 'Order of Dawn', 'lore'),
    entry('sword', 'Greysword', 'item'),
    entry('ring', 'Signet Ring', 'item'),
    entry('relic', 'Dawn Relic', 'lore'),
    entry('cup', 'Empty Cup', 'item'),
  ];
  const links = [
    link('p1', 'north', 'world', 'located-in'),
    link('p2', 'south', 'world', 'located-in'),
    link('p3', 'keep', 'north', 'located-in'),
    link('p4', 'hall', 'keep', 'located-in'),
    link('p5', 'port', 'south', 'located-in'),
    link('p6', 'port', 'north', 'located-in'),
    link('p7', 'loopA', 'loopB', 'located-in'),
    link('p8', 'loopB', 'loopA', 'located-in'),
    link('p9', 'county', 'village', 'located-in'),
    link('p10', 'village', 'north', 'located-in'),
    link('p11', 'ruins', 'south', 'located-in', valid(at(date(1)), at(date(5)))),
    link('c1', 'mira', 'keep', 'located-in', valid(at(date(9)), at(date(12)))),
    link('c2', 'mira', 'hall', 'located-in', valid(at(date(10)))),
    link('c3', 'orrin', 'north', 'located-in'),
    link('c4', 'orrin', 'south', 'located-in', valid(at(date(11)))),
    link('c5', 'pell', 'loopA', 'located-in', valid(nodeAt('n1'), nodeAt('n3'))),
    link('c6', 'pell', 'port', 'related'),
    link('f1', 'mira', 'guild', 'member-of', { ...valid(nodeAt('n1'), nodeAt('n3')), how: 'joined', endHow: 'expelled' }),
    link('f2', 'orrin', 'guild', 'leads'),
    link('f3', 'guild', 'crown', 'allied-with', valid(at(date(10)))),
    link('f4', 'guild', 'rebels', 'at-war-with', valid(null, at(date(12)))),
    link('f5', 'crown', 'north', 'controls'),
    link('f6', 'guild', 'port', 'influences'),
    link('f7', 'guild', 'keep', 'located-in'),
    link('f8', 'guild', 'crown', 'owes-a-debt-to', { fromLabel: 'Owes a debt to' }),
    link('f9', 'orrin', 'order', 'member-of'),
    link('f10', 'crown', 'south', 'controls', valid(eventAt('e2'))),
    link('f11', 'crown', 'guild', 'leads'),
    link('f12', 'rebels', 'pell', 'member-of'),
    link('o1', 'sword', 'orrin', 'created-by', valid(at(date(8)))),
    link('o2', 'mira', 'sword', 'owns', { ...valid(at(date(9)), at(date(11))), how: 'made' }),
    link('o3', 'orrin', 'sword', 'owns', { ...valid(at(date(11)), at(date(13))), how: 'stolen', endHow: 'lost' }),
    link('o4', 'mira', 'ring', 'owns'),
    link('o5', 'orrin', 'ring', 'owns', valid(eventAt('gone-event'))),
    link('o6', 'orrin', 'relic', 'owns', valid(nodeAt('n1'), nodeAt('n2'))),
    link('o7', 'mira', 'relic', 'owns', { ...valid(nodeAt('n3')), how: 'found' }),
    link('o8', 'pell', 'cup', 'owns', { ...valid(at(date(10)), eventAt('gone-event')) }),
  ];
  const nodes = [node('n1', 'Chapter 1', 0, ['keep']), node('n2', 'Chapter 2', 1), node('n3', 'Chapter 3', 2)];
  const plans = [{ id: 'n2', projectId: P, objective: '', beats: [], entityIds: ['keep', 'mira'], createdAt: 0, updatedAt: 0 }];
  const events = [
    event('e1', 'The muster', date(10, 6, 1), 'keep', ['mira']),
    event('e2', 'The landing', date(12), 'port', ['mira', 'orrin'], { nodeIds: ['n3'] }),
    event('e3', 'A feast', approx(11), 'hall', ['mira']),
    event('e4', 'Somewhen', { precision: 'unknown' }, 'world', ['orrin']),
    event('e5', 'The ambush', date(11, 1, 15), 'loopA', ['mira']),
    event('e6', 'A quiet market', date(10, 2, 10), 'village', ['mira']),
  ];
  const journey = (id: string, travellerIds: string[], fromId: string | null, toId: string | null, more: Record<string, unknown> = {}) => ({ id, projectId: P, travellerIds, fromId, toId, via: [], departure: null, arrival: null, afterId: null, method: '', methodId: null, duration: null, distance: null, distanceUnit: '', eventIds: [], note: '', createdAt: ++order, updatedAt: 0, ...more });
  const journeys = [
    journey('j1', ['mira'], 'keep', 'port', { departure: at(date(10, 1, 1)), arrival: at(date(10, 1, 2)), methodId: 'horse' }),
    journey('j2', ['mira'], 'port', 'keep', { departure: at(date(10, 3, 1)), arrival: at(date(10, 2, 1)) }),
    journey('j3', ['orrin'], 'north', 'south', { departure: eventAt('e1'), arrival: eventAt('e2'), duration: { amount: 5, unit: 'years' }, method: 'on foot' }),
    journey('j4', ['orrin'], 'port', 'hall', { afterId: 'j5' }),
    journey('j5', ['orrin'], 'hall', 'keep', { afterId: 'j3' }),
    journey('j6', ['mira'], 'keep', 'hall', { departure: nodeAt('n1'), arrival: nodeAt('n2'), via: ['north'] }),
    journey('j7', ['mira', 'orrin'], 'world', 'south', { departure: at(approx(10)), arrival: at(approx(10)) }),
    journey('j8', ['mira'], 'hall', 'port', { departure: at(date(11, 1, 1)), arrival: at(date(11, 2, 1)), methodId: 'ship', distance: 100, distanceUnit: 'leagues', duration: { amount: 10, unit: 'hours' }, eventIds: ['e2'] }),
    journey('j9', ['pell'], 'keep', 'port', { methodId: 'horse', distance: 10, distanceUnit: 'km' }),
    journey('j10', ['mira'], 'village', 'keep', { departure: at(date(11, 5, 1)), arrival: at(date(11, 5, 3)), methodId: 'walk' }),
    journey('j11', ['mira'], 'port', 'hall', { departure: at(date(11, 3, 1)), arrival: at(date(11, 3, 20)), via: ['south', 'north'] }),
    journey('j12', ['pell'], null, null, { departure: nodeAt('n2'), arrival: eventAt('e1') }),
  ];
  const travelSettings = [{ id: 'ts', projectId: P, methods: [{ id: 'horse', name: 'By horse', speed: 30, distanceUnit: 'leagues', per: 'days' }, { id: 'ship', name: 'By ship', speed: 5, distanceUnit: 'leagues', per: 'hours' }, { id: 'walk', name: 'On foot', speed: null, distanceUnit: '', per: 'days' }], createdAt: 0, updatedAt: 0 }];
  const placeSettings = [{ id: 'ps', projectId: P, levels: [{ id: 'L1', name: 'World' }, { id: 'L2', name: 'Kingdom' }, { id: 'L3', name: 'City' }, { id: 'L4', name: 'Room' }], createdAt: 0, updatedAt: 0 }];
  const worldMaps = [
    { id: 'm1', projectId: P, name: 'The Known World', placeId: null, width: 100, height: 80, unit: 'leagues', grid: 10, image: null, createdAt: 0, updatedAt: 0 },
    { id: 'm2', projectId: P, name: 'Northreach', placeId: 'north', width: 50, height: 50, unit: 'miles', grid: 0, image: null, createdAt: 1, updatedAt: 0 },
  ];
  const pin = (id: string, mapId: string, entryId: string, x: number, y: number) => ({ id, projectId: P, mapId, entryId, x, y, createdAt: 0, updatedAt: 0 });
  const mapPins = [pin('a', 'm1', 'world', 50, 40), pin('b', 'm1', 'keep', 10, 10), pin('c', 'm1', 'port', 80, 70), pin('d', 'm1', 'hall', -5, 5), pin('e', 'm2', 'keep', 25, 25), pin('f', 'm1', 'south', 60, 75), pin('g', 'm1', 'north', 20, 15), pin('h', 'm1', 'village', 15, 30)];
  return {
    format: 'novel-builder/project',
    version: 4,
    exportedAt: 0,
    project: { id: P, title: 'World', createdAt: 0, updatedAt: 0 },
    collections: { chapters: nodes, chapterPlans: plans, loreEntries: entries, loreLinks: links, timelineEvents: events, journeys, travelSettings, placeSettings, worldMaps, mapPins },
  };
}

// ---------------------------------------------------------------------------------------------------- the report

function report(c: Record<string, any[]>, project: unknown) {
  const rows = (k: string) => (c[k] ?? []) as any[];
  const model = buildModel({ project, nodes: rows('chapters'), plans: rows('chapterPlans'), entries: rows('loreEntries'), schemas: rows('loreSchemas'), links: rows('loreLinks'), relations: rows('characterRelations'), events: rows('timelineEvents'), threads: rows('plotThreads'), systems: rows('systems'), sheets: rows('systemSheets'), timeline: null, calendar: rows('storyCalendars')[0] ?? null, progressCategories: rows('progressCategories'), progress: rows('progressChanges'), journeys: rows('journeys') } as any);
  const settings = rows('placeSettings')[0] ?? null;
  const maps = rows('worldMaps');
  const pins = rows('mapPins');
  const travelSettings = rows('travelSettings')[0] ?? null;
  const journeys = rows('journeys');
  const tree = placeTree(model, { settings, pins });
  const { parent, others } = parentsOf(model);
  const anchors: [string, any][] = [['end', 'end'], ...[...model.nodes.keys()].map((id) => [`node:${id}`, { kind: 'node', nodeId: id }] as [string, any]), ...[...model.events.keys()].map((id) => [`event:${id}`, { kind: 'event', eventId: id }] as [string, any]), ['date:11', { kind: 'date', when: { precision: 'exact', year: 11, month: null, day: null, hour: null, minute: null } }]];
  const tieOut = (t: ReturnType<typeof factionTies>[number]) => ({ link: t.link.id, role: t.role, other: t.other, otherName: t.otherName, words: t.words, when: t.when, timeless: t.timeless, holds: t.holds });
  const record = (j: any) => {
    const r = journeyRecord(model, j, travelSettings, maps, pins);
    return { travellers: r.travellers, from: r.from, to: r.to, leaves: r.leaves, arrives: r.arrives, leavesWords: r.leavesWords, arrivesWords: r.arrivesWords, method: r.method?.id ?? null, methodWords: r.methodWords, distance: r.distance, leastMinutes: r.leastMinutes, words: r.words };
  };
  const travellers = [...new Set(journeys.flatMap((j) => j.travellerIds as string[]))].sort();
  const factions = factionsOf(model);
  const items = ownedItems(model);
  return {
    parents: { parent: Object.fromEntries(parent), others: Object.fromEntries(others) },
    tree: tree.map((r) => ({ id: r.entry.id, depth: r.depth, parentId: r.parentId, childIds: r.childIds, level: r.level?.id ?? null, levelWords: r.levelWords, events: r.events, eventsWithin: r.eventsWithin, characters: r.characters, factions: r.factions, chapters: r.chapters, maps: r.maps, notes: r.notes })),
    within: Object.fromEntries(tree.map((r) => [r.entry.id, placesWithin(tree, r.entry.id)])),
    links: Object.fromEntries(
      tree.map((r) => {
        const l = placeLinks(model, r.entry.id);
        const tied = (list: { entry: { id: string }; how: string[] }[]) => list.map((x) => ({ id: x.entry.id, how: x.how }));
        return [r.entry.id, { characters: tied(l.characters), factions: tied(l.factions), others: tied(l.others), events: l.events.map((e) => e.id), chapters: l.chapters.map((x) => ({ id: x.node.id, how: x.how })) }];
      }),
    ),
    maps: Object.fromEntries(maps.map((m) => [m.id, (() => {
      const on = mapPlaces(tree, m, pins);
      return { pinned: on.pinned.map((p) => ({ id: p.entry.id, pin: p.pin.id, outside: p.outside })), missing: on.missing.map((e) => e.id) };
    })()])),
    journeys: Object.fromEntries(journeys.map((j) => [j.id, record(j)])),
    noSettings: Object.fromEntries(journeys.map((j) => [j.id, journeyRecord(model, j, null).words])),
    routes: Object.fromEntries(travellers.map((t) => [t, routeOf(model, t, journeys, travelSettings, maps, pins)])),
    problems: travelProblems(model, journeys, travelSettings, maps, pins),
    minutes: [0, 1, 59, 60, 61, 90, 1439, 1440, 2160, 10000, 525600].map((m) => minutesWords(m, model)),
    without: journeys.slice(0, 8).flatMap((j) => ['keep', 'mira', 'e1', 'n1', 'j3', 'north'].map((id) => withoutJourneyReference(j, id))),
    factions: factions.map((f) => f.id),
    ties: Object.fromEntries(factions.map((f) => [f.id, Object.fromEntries(anchors.map(([k, a]) => [k, factionTies(model, f.id, a).map(tieOut)]))])),
    factionAt: Object.fromEntries(factions.map((f) => [f.id, Object.fromEntries(anchors.map(([k, a]) => {
      const x = factionAt(model, f.id, a);
      return [k, { byRole: Object.fromEntries([...x.byRole].map(([role, ties]) => [role, ties.map((t) => t.link.id)])), notNow: x.notNow }];
    }))])),
    network: Object.fromEntries(anchors.map(([k, a]) => {
      const n = factionNetwork(model, a);
      return [k, { factions: n.factions.map((f) => f.id), edges: n.edges.map((e) => ({ link: e.link.id, role: e.role, holds: e.holds })), territories: n.territories.map((t) => t.id) }];
    })),
    held: model.links.slice(0, 40).map((l) => whenHeld(l, model)),
    items: items.map((i) => i.id),
    ownership: Object.fromEntries(items.map((i) => [i.id, Object.fromEntries(anchors.map(([k, a]) => {
      const o = ownershipOf(model, i.id, a)!;
      return [k, { makers: o.makers, holdings: o.holdings.map((h) => ({ link: h.link.id, holderId: h.holderId, holderName: h.holderName, how: h.how, began: h.began, ended: h.ended, endHow: h.endHow, timeless: h.timeless, inThisTimeline: h.inThisTimeline })), unknown: o.unknown, now: o.now }];
    }))])),
  };
}

test('world', () => {
  const out: Record<string, unknown> = {};
  writeFileSync(join(OUT, 'world.novel.json'), JSON.stringify(worldNovel(), null, 1));
  const files = { ...FIXTURES, world: `${OUT}/world.novel.json` };
  for (const [name, path] of Object.entries(files)) {
    const file = JSON.parse(readFileSync(path.startsWith('/') ? path : join(__dirname, path), 'utf8'));
    out[name] = report(file.collections, file.project);
  }
  writeFileSync(join(OUT, 'world.golden.json'), json(out));
});
