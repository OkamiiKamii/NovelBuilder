import { beforeEach, describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry, type ProjectRegistry } from '@/core/projectRegistry';
import { lifeHistory } from '@/modules/characters/lifeHistory';
import { createCharacterService, registerCharacters } from '@/modules/characters/service';
import { createCodexService, registerCodex } from '@/modules/codex/service';
import { createConnectionService } from '@/modules/connections/service';
import { brokenReferences } from '@/modules/integrity/rules';
import { createIntegrityService } from '@/modules/integrity/service';
import { createManuscriptService, registerManuscript } from '@/modules/manuscript/service';
import { loadModel } from '@/modules/model/model';
import type { Anchor } from '@/modules/model/validity';
import { placeLinks } from '@/modules/places/explore';
import { createPlaceService, registerPlaces } from '@/modules/places/service';
import { createProjectService, type ProjectService } from '@/modules/projects/service';
import { createTimelineService, registerTimeline } from '@/modules/timeline/service';
import type { EventDate } from '@/modules/timeline/types';
import { journeyRecord, routeOf, travelProblems } from './routes';
import { createTravelService, registerTravel, type JourneyInput } from './service';

let n = 0;
let db: NovelDB;
let registry: ProjectRegistry;
let projects: ProjectService;

beforeEach(() => {
  db = new NovelDB(`travel-${++n}`);
  registry = createProjectRegistry();
  projects = createProjectService(db, registry);
  registerManuscript(registry);
  registerCodex(registry);
  registerTimeline(registry);
  registerCharacters(registry);
  registerPlaces(registry);
  registerTravel(registry);
});

const day = (month: number, d: number, year = 10): Anchor => ({ kind: 'date', when: { precision: 'exact', year, month, day: d, hour: null, minute: null } });
const about = (year: number, season: 'spring' | 'summer' | 'autumn' | 'winter' | null = null): Anchor => ({ kind: 'date', when: { precision: 'approximate', year, month: null, season } });
const when = (month: number, d: number): EventDate => ({ precision: 'exact', year: 10, month, day: d, hour: null, minute: null });

/** Mira and Orrin; Paris (with the Louvre inside it), Lyon and Marseille; three chapters. */
async function world() {
  const p = await projects.create({ title: 'Travels' });
  const codexService = createCodexService(db, projects.contentChanged);
  const s = {
    codex: codexService.forProject(p.id),
    characters: createCharacterService(db, codexService, projects.contentChanged).forProject(p.id),
    ms: createManuscriptService(db, projects.contentChanged).forProject(p.id),
    timeline: createTimelineService(db, projects.contentChanged).forProject(p.id),
    connections: createConnectionService(db, projects.contentChanged).forProject(p.id),
    places: createPlaceService(db, projects.contentChanged).forProject(p.id),
    travel: createTravelService(db, projects.contentChanged).forProject(p.id),
    integrity: createIntegrityService(db, registry, projects.contentChanged).forProject(p.id),
  };
  const [mira, orrin] = [await s.characters.create({ name: 'Mira' }), await s.characters.create({ name: 'Orrin' })];
  const [paris, lyon, marseille, louvre] = [await s.codex.create('location', 'Paris'), await s.codex.create('location', 'Lyon'), await s.codex.create('location', 'Marseille'), await s.codex.create('location', 'Louvre')];
  await s.places.setParent(louvre.id, paris.id);
  const [one, two, three] = [await s.ms.create('chapter', null, 'Chapter 1'), await s.ms.create('chapter', null, 'Chapter 2'), await s.ms.create('chapter', null, 'Chapter 3')];
  const go = (input: JourneyInput) => s.travel.saveJourney(null, { travellerIds: [mira.id], ...input });
  const event = async (name: string, place: string, at: EventDate) => {
    const e = await s.timeline.create(name);
    await s.timeline.update(e.id, { when: at, locationId: place, characters: [{ id: mira.id, age: null }] });
    return e;
  };
  const model = async (id = p.id) => (await loadModel(db, id))!;
  const check = async () => travelProblems(await model(), await s.travel.journeys(), await s.travel.settings(), await s.places.maps(), await s.places.pins());
  return { p, ...s, mira, orrin, paris, lyon, marseille, louvre, one, two, three, go, event, model, check };
}

describe('missing times', () => {
  it('journeys with no time are listed in the order the author gives, and nothing is ever flagged from them', async () => {
    const w = await world();
    await w.travel.setMethods([{ name: 'By horse', speed: 30, distanceUnit: 'leagues', per: 'days' }]);
    const horse = (await w.travel.settings())!.methods[0];
    const first = await w.go({ fromId: w.paris.id, toId: w.lyon.id, methodId: horse.id, distance: 120, distanceUnit: 'leagues' });
    await w.go({ fromId: w.lyon.id, toId: w.marseille.id, afterId: first.id, method: 'on foot' });
    expect(await w.check()).toEqual([]);
    const route = routeOf(await w.model(), w.mira.id, await w.travel.journeys(), await w.travel.settings());
    expect([route.story, route.reading]).toEqual([[], []]);
    expect(route.unknown.map((i) => [i.title, i.when, i.detail])).toEqual([
      ['Paris to Lyon', 'when is not known', 'By horse · 120 leagues'],
      ['Lyon to Marseille', 'when is not known; after the journey to Lyon', 'on foot'],
    ]);
  });

  it('only who travels is needed; a time "not known" is stored as none', async () => {
    const w = await world();
    await expect(w.travel.saveJourney(null, { toId: w.lyon.id })).rejects.toThrow('Say who travels.');
    await expect(w.go({ toId: w.mira.id })).rejects.toThrow('not a place');
    await expect(w.travel.saveJourney(null, { travellerIds: [w.paris.id] })).rejects.toThrow('not places');
    const j = await w.go({ departure: { kind: 'date', when: { precision: 'unknown' } } });
    expect([j.departure, j.fromId, j.toId, journeyRecord(await w.model(), j, null).words]).toEqual([null, null, null, 'Mira: somewhere not recorded to somewhere not recorded']);
  });
});

describe('speeds are the author’s', () => {
  it('no speed is assumed: a method without one, or in another unit, flags nothing; with one, a journey too fast for its dates is flagged', async () => {
    const w = await world();
    await w.travel.setMethods([{ name: 'By horse', speed: null, distanceUnit: 'leagues', per: 'days' }]);
    const settings = (await w.travel.settings())!;
    const ride = await w.go({ fromId: w.paris.id, toId: w.lyon.id, departure: day(3, 1), arrival: day(3, 2), methodId: settings.methods[0].id, distance: 120, distanceUnit: 'leagues' });
    expect(await w.check()).toEqual([]);
    await w.travel.setMethods([{ ...settings.methods[0], speed: 30 }]);
    expect((await w.check()).map((p) => p.message)).toEqual(['Mira, Paris to Lyon: 120 leagues By horse at 30 leagues a day takes at least 4 days, but leaving Year 10, March 1 and arriving Year 10, March 2 allows at most 2 days.']);
    await w.travel.saveJourney(ride.id, { distanceUnit: 'km' });
    expect(await w.check()).toEqual([]);
  });

  it('a distance can come from a map, in the map’s unit, between places pinned on it', async () => {
    const w = await world();
    const map = await w.places.saveMap(null, { name: 'Realm', width: 100, height: 100, unit: 'leagues' });
    await w.places.pin(map.id, w.paris.id, 0, 0);
    await w.places.pin(map.id, w.lyon.id, 30, 40);
    await w.travel.setMethods([{ name: 'By horse', speed: 25, distanceUnit: 'leagues', per: 'days' }]);
    await w.go({ fromId: w.paris.id, toId: w.lyon.id, departure: day(3, 1), arrival: day(3, 1), methodId: (await w.travel.settings())!.methods[0].id });
    const [problem] = await w.check();
    expect(problem.message).toBe('Mira, Paris to Lyon: 50 leagues By horse at 25 leagues a day takes at least 2 days, but leaving Year 10, March 1 and arriving Year 10, March 1 allows at most 1 day.');
  });
});

describe('approximate journeys', () => {
  it('an approximate date counts as all the time it may mean: flagged only if even the widest reading is too short', async () => {
    const w = await world();
    await w.travel.setMethods([{ name: 'On foot', speed: 10, distanceUnit: 'leagues', per: 'days' }]);
    const foot = (await w.travel.settings())!.methods[0].id;
    // Some time in Year 10 to some time in the summer of Year 10: 400 leagues at 10 a day (40 days) may well fit.
    const long = await w.go({ fromId: w.paris.id, toId: w.marseille.id, departure: about(10), arrival: about(10, 'summer'), methodId: foot, distance: 400, distanceUnit: 'leagues', duration: { amount: 6, unit: 'weeks' } });
    expect(await w.check()).toEqual([]);
    // Narrowed to days, the same journey cannot fit.
    await w.travel.saveJourney(long.id, { departure: day(6, 1), arrival: day(6, 5) });
    expect((await w.check()).map((p) => p.kind).sort()).toEqual(['duration', 'too-fast']);
    expect((await w.check()).find((p) => p.kind === 'duration')!.message).toBe('Mira, Paris to Marseille: said to take 6 weeks, but its dates allow at most 5 days.');
  });

  it('a duration against a speed, even with no dates; an arrival before the departure; an order the dates contradict', async () => {
    const w = await world();
    await w.travel.setMethods([{ name: 'On foot', speed: 10, distanceUnit: 'leagues', per: 'days' }]);
    const foot = (await w.travel.settings())!.methods[0].id;
    await w.go({ fromId: w.paris.id, toId: w.lyon.id, methodId: foot, distance: 100, distanceUnit: 'leagues', duration: { amount: 2, unit: 'days' } });
    const back = await w.go({ fromId: w.lyon.id, toId: w.paris.id, departure: day(5, 10), arrival: day(5, 2) });
    await w.go({ fromId: w.paris.id, toId: w.marseille.id, afterId: back.id, departure: day(4, 1), arrival: day(4, 20) });
    expect((await w.check()).map((p) => [p.kind, p.message])).toEqual([
      ['backwards', 'Mira, Lyon to Paris: arrives (Year 10, May 2) before leaving (Year 10, May 10).'],
      ['too-fast', 'Mira, Paris to Lyon: said to take 2 days, but 100 leagues On foot at 10 leagues a day takes at least 10 days.'],
      ['order', 'Mira, Paris to Marseille: said to come after the journey Lyon to Paris, but it leaves (Year 10, April 1) before that one does (Year 10, May 10).'],
      // …and, read by the dates, she arrives at Marseille and next leaves from Lyon.
      ['departure', 'Mira leaves from Lyon (Year 10, May 10), but last arrived at Marseille (Year 10, April 20): a journey may be missing.'],
    ]);
  });
});

describe('overlapping location intervals', () => {
  it('two journeys at once, and an event elsewhere during a journey (but not at a stop, or inside one)', async () => {
    const w = await world();
    await w.go({ fromId: w.paris.id, toId: w.lyon.id, departure: day(3, 1), arrival: day(3, 20) });
    await w.go({ fromId: w.paris.id, toId: w.marseille.id, departure: day(3, 5), arrival: day(3, 10) });
    await w.event('The feast', w.marseille.id, when(3, 12));
    await w.event('A night at the museum', w.louvre.id, when(3, 2));
    const found = await w.check();
    expect(found.filter((p) => p.kind === 'two-journeys').map((p) => p.message)).toEqual(['Mira is on two journeys at once: Paris to Lyon (Year 10, March 1 to Year 10, March 20) and Paris to Marseille (Year 10, March 5 to Year 10, March 10).']);
    expect(found.filter((p) => p.kind === 'event-during').map((p) => p.message)).toEqual(['Mira takes part in “The feast” at Marseille while on the journey Paris to Lyon (Year 10, March 1 to Year 10, March 20).']);
  });

  it('between journeys: an event elsewhere, and leaving from somewhere else, are notes', async () => {
    const w = await world();
    await w.go({ fromId: w.paris.id, toId: w.lyon.id, departure: day(3, 1), arrival: day(3, 20) });
    await w.go({ fromId: w.marseille.id, toId: w.paris.id, departure: day(9, 1), arrival: day(9, 30) });
    await w.event('The feast', w.marseille.id, when(6, 1));
    const found = await w.check();
    expect(found.map((p) => [p.kind, p.severity])).toEqual([['departure', 'note'], ['elsewhere', 'note']]);
    expect(found[1].message).toBe('Mira takes part in “The feast” at Marseille, while staying at Lyon between journeys (Year 10, March 20 to Year 10, September 1): a journey may be missing.');
  });

  it('located in two places over the same time (but not a place and one inside it)', async () => {
    const w = await world();
    const at = (to: string, from: Anchor | null, until: Anchor | null) => w.connections.create({ from: { type: 'entry', id: w.mira.id }, to: { type: 'entry', id: to }, type: 'located-in', validity: { from, until } });
    await at(w.paris.id, about(5), about(12));
    await at(w.lyon.id, about(10), null);
    await at(w.louvre.id, about(6), about(7));
    expect((await w.check()).map((p) => p.message)).toEqual(['Mira is recorded as located in both Lyon and Paris over the same time.']);
  });

  it('a chapter is never compared with an event: no overlap is flagged across them', async () => {
    const w = await world();
    await w.go({ fromId: w.paris.id, toId: w.lyon.id, departure: { kind: 'node', nodeId: w.one.id }, arrival: { kind: 'node', nodeId: w.three.id } });
    await w.event('The feast', w.marseille.id, when(3, 12));
    expect(await w.check()).toEqual([]);
    const route = routeOf(await w.model(), w.mira.id, await w.travel.journeys(), null);
    expect([route.reading.map((i) => i.title), route.story.map((i) => i.title)]).toEqual([['Paris to Lyon'], ['At Marseille']]);
  });
});

describe('where everyone was', () => {
  it('a route: journeys and the stays between them, events, and where they are located, in story order', async () => {
    const w = await world();
    await w.go({ fromId: w.paris.id, toId: w.lyon.id, departure: day(3, 1), arrival: day(3, 20), method: 'by coach' });
    await w.go({ fromId: w.lyon.id, toId: w.marseille.id, departure: day(9, 1), arrival: day(9, 30) });
    await w.event('The siege', w.lyon.id, when(6, 1));
    const route = routeOf(await w.model(), w.mira.id, await w.travel.journeys(), null);
    expect(route.story.map((i) => [i.kind, i.title])).toEqual([['journey', 'Paris to Lyon'], ['stay', 'At Lyon'], ['event', 'At Lyon'], ['journey', 'Lyon to Marseille']]);
    expect(route.story[1].when).toBe('from Year 10, March 20 until Year 10, September 1');
  });

  it('journeys are connections: a place lists who leaves from it and goes to it; the character’s history has each journey', async () => {
    const w = await world();
    await w.go({ fromId: w.paris.id, toId: w.lyon.id, departure: { kind: 'node', nodeId: w.two.id } });
    const model = await w.model();
    expect(placeLinks(model, w.lyon.id).characters.map((c) => [c.entry.name, c.how])).toEqual([['Mira', ['Travels to this']]]);
    expect(placeLinks(model, w.paris.id).characters.map((c) => [c.entry.name, c.how])).toEqual([['Mira', ['Leaves from this']]]);
    const history = lifeHistory(model, w.mira.id)!;
    expect(history.reading.filter((i) => i.kind === 'journey').map((i) => [i.title, i.when])).toEqual([['Travels from Paris to Lyon', 'Ch 2: Chapter 2']]);
  });

  it('a deleted chapter is found by the record check, and taking it out keeps the journey; a deleted place leaves it, unnamed', async () => {
    const w = await world();
    const j = await w.go({ fromId: w.paris.id, toId: w.lyon.id, departure: { kind: 'node', nodeId: w.two.id } });
    await w.ms.remove(w.two.id);
    expect(brokenReferences(await w.model()).filter((b) => b.table === 'journeys').map((b) => b.where)).toEqual(['a journey']);
    await w.integrity.removeReference('journeys', j.id, w.two.id);
    await w.codex.remove(w.paris.id);
    expect(await db.journeys.get(j.id)).toMatchObject({ departure: null, fromId: null, toId: w.lyon.id, travellerIds: [w.mira.id] });
  });

  it('copied with the novel, pointing at its own travellers, places and chapters; a method in use stays', async () => {
    const w = await world();
    await w.travel.setMethods([{ name: 'By horse', speed: 30, distanceUnit: 'leagues', per: 'days' }]);
    const horse = (await w.travel.settings())!.methods[0];
    await w.go({ fromId: w.paris.id, toId: w.lyon.id, departure: { kind: 'node', nodeId: w.one.id }, methodId: horse.id });
    await expect(w.travel.setMethods([])).rejects.toThrow('1 journey uses “By horse”. Change it first.');
    const copy = await projects.duplicate(w.p.id);
    const model = await w.model(copy.id);
    const [j] = model.journeys;
    expect([model.entries.get(j.travellerIds[0])?.name, model.entries.get(j.fromId!)?.name, j.departure?.kind === 'node' && model.nodes.has(j.departure.nodeId), j.methodId === horse.id]).toEqual(['Mira', 'Paris', true, true]);
  });
});
