import { beforeEach, describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { createCharacterService, registerCharacters } from '@/modules/characters/service';
import { createCodexService, registerCodex } from '@/modules/codex/service';
import type { LoreEntry } from '@/modules/codex/types';
import { createConnectionService } from '@/modules/connections/service';
import { createManuscriptService, registerManuscript } from '@/modules/manuscript/service';
import { loadModel } from '@/modules/model/model';
import { createProjectService, type ProjectService } from '@/modules/projects/service';
import { createTimelineService, registerTimeline } from '@/modules/timeline/service';
import { mapPlaces, placeLinks, placeTree, placesWithin } from './explore';
import { createPlaceService, registerPlaces } from './service';

let n = 0;
let db: NovelDB;
let projects: ProjectService;

beforeEach(() => {
  db = new NovelDB(`places-${++n}`);
  const registry = createProjectRegistry();
  projects = createProjectService(db, registry);
  registerManuscript(registry);
  registerCodex(registry);
  registerTimeline(registry);
  registerCharacters(registry);
  registerPlaces(registry);
});

async function world() {
  const p = await projects.create({ title: 'Places' });
  const codexService = createCodexService(db, projects.contentChanged);
  const s = {
    codex: codexService.forProject(p.id),
    characters: createCharacterService(db, codexService, projects.contentChanged).forProject(p.id),
    ms: createManuscriptService(db, projects.contentChanged).forProject(p.id),
    timeline: createTimelineService(db, projects.contentChanged).forProject(p.id),
    connections: createConnectionService(db, projects.contentChanged).forProject(p.id),
    places: createPlaceService(db, projects.contentChanged).forProject(p.id),
  };
  const model = async (id = p.id) => (await loadModel(db, id))!;
  const tree = async (id = p.id) => {
    const placesThere = createPlaceService(db, projects.contentChanged).forProject(id);
    return placeTree(await model(id), { settings: await placesThere.settings(), pins: await placesThere.pins() });
  };
  return { p, ...s, model, tree };
}

/** The Known Universe down to one room of the Louvre, each a level of "Across space", each inside the one before. */
async function nested(w: Awaited<ReturnType<typeof world>>) {
  const settings = await w.places.applyPreset('space');
  const names = ['Known Universe', 'Milky Way', 'Sol', 'Earth', 'Europe', 'France', 'Paris', 'Louvre', 'Gallery 7'];
  const levelOf = ['Universe', 'Galaxy', 'Star system', 'Planet', 'Continent', 'Region', 'City', 'Building', 'Room'];
  const made: LoreEntry[] = [];
  for (const [i, name] of names.entries()) {
    const place = await w.codex.create('location', name);
    await w.places.setLevel(place.id, settings.levels.find((l) => l.name === levelOf[i])!.id);
    if (i > 0) await w.places.setParent(place.id, made[i - 1].id);
    made.push(place);
  }
  return Object.fromEntries(names.map((name, i) => [name, made[i]]));
}

describe('nested places', () => {
  it('from the universe down to one room: each inside the one before, at its own level, however deep', async () => {
    const w = await world();
    await nested(w);
    const rows = await w.tree();
    expect(rows.map((r) => [r.entry.name, r.depth, r.levelWords])).toEqual([
      ['Known Universe', 0, 'Universe'], ['Milky Way', 1, 'Galaxy'], ['Sol', 2, 'Star system'], ['Earth', 3, 'Planet'], ['Europe', 4, 'Continent'],
      ['France', 5, 'Region'], ['Paris', 6, 'City'], ['Louvre', 7, 'Building'], ['Gallery 7', 8, 'Room'],
    ]);
    expect(rows.every((r) => r.notes.length === 0)).toBe(true);
    expect(placesWithin(rows, rows[6].entry.id).length).toBe(2);
  });

  it('events in the places inside are counted for those around them, not as their own', async () => {
    const w = await world();
    const at = await nested(w);
    const heist = await w.timeline.create('The heist');
    await w.timeline.update(heist.id, { locationId: at['Gallery 7'].id });
    const rows = await w.tree();
    const row = (name: string) => rows.find((r) => r.entry.name === name)!;
    expect([row('Gallery 7').events, row('Gallery 7').eventsWithin, row('Paris').events, row('Paris').eventsWithin, row('Known Universe').eventsWithin]).toEqual([1, 0, 0, 1, 1]);
  });

  it('a place cannot go inside itself or inside what is inside it; moving one keeps what it held before, if that has ended', async () => {
    const w = await world();
    const at = await nested(w);
    await expect(w.places.setParent(at['Earth'].id, at['Paris'].id)).rejects.toThrow('Paris is inside Earth, so it cannot also be what it is in.');
    await expect(w.places.setParent(at['Paris'].id, at['Paris'].id)).rejects.toThrow('cannot be inside itself');
    await w.places.setParent(at['Louvre'].id, at['France'].id);
    expect((await w.tree()).find((r) => r.entry.name === 'Louvre')).toMatchObject({ depth: 6, parentId: at['France'].id });
    await w.places.setParent(at['Louvre'].id, null);
    expect((await w.tree()).find((r) => r.entry.name === 'Louvre')).toMatchObject({ depth: 0, parentId: null });
  });

  it('what does not add up is said, never fixed: two places it is in, a loop, a larger kind inside a smaller', async () => {
    const w = await world();
    const at = await nested(w);
    await w.connections.create({ from: { type: 'entry', id: at['Paris'].id }, to: { type: 'entry', id: at['Europe'].id }, type: 'located-in' });
    const levels = (await w.places.settings())!.levels;
    await w.places.setLevel(at['Louvre'].id, levels.find((l) => l.name === 'Planet')!.id);
    let rows = await w.tree();
    expect(rows.find((r) => r.entry.name === 'Paris')!.notes).toEqual(['Also recorded as inside Europe; shown inside France, recorded first.']);
    expect(rows.find((r) => r.entry.name === 'Louvre')!.notes).toEqual(['A Planet inside Paris, a City: it is not a smaller kind of place than what it is in.']);
    // A loop can only come from records made elsewhere (an import): it is shown at the top, and said.
    await db.loreLinks.add({ id: 'loop', projectId: w.p.id, fromId: at['Known Universe'].id, toId: at['Gallery 7'].id, fromType: 'entry', toType: 'entry', type: 'located-in', fromLabel: '', toLabel: '', createdAt: Date.now() + 1 });
    rows = await w.tree();
    expect(rows.length).toBe(9);
    expect(rows.find((r) => r.entry.name === 'Known Universe')!.notes).toEqual(['It is inside itself through what it is located in, so it is shown at the top.']);
  });
});

describe('levels of the author’s own', () => {
  it('named, renamed and ordered by the author; a level in use is never dropped', async () => {
    const w = await world();
    const saved = await w.places.setLevels([{ name: 'Realm' }, { name: 'Hold' }, { name: 'Hall' }, { name: ' hall ' }]);
    expect(saved.levels.map((l) => l.name)).toEqual(['Realm', 'Hold', 'Hall']);
    const keep = await w.codex.create('location', 'Ironhold');
    await w.places.setLevel(keep.id, saved.levels[1].id);
    const renamed = await w.places.setLevels([saved.levels[0], { ...saved.levels[1], name: 'Fortress' }, saved.levels[2]]);
    expect(renamed.levels[1].id).toBe(saved.levels[1].id);
    expect((await w.tree())[0].levelWords).toBe('Fortress');
    await expect(w.places.setLevels([saved.levels[0], saved.levels[2]])).rejects.toThrow('1 place is a Fortress. Give it another level first.');
    await expect(w.places.setLevel(keep.id, 'made-up')).rejects.toThrow('not one of this novel’s');
    // A preset only adds what is missing, after what is there.
    expect((await w.places.applyPreset('world')).levels.map((l) => l.name).slice(0, 4)).toEqual(['Realm', 'Fortress', 'Hall', 'World']);
  });
});

describe('maps, and places with no coordinates', () => {
  it('a place with no coordinates is in the tree as any other, and listed as not on a map that covers it', async () => {
    const w = await world();
    const at = await nested(w);
    const paris = await w.places.saveMap(null, { name: 'Paris', placeId: at['Paris'].id, width: 100, height: 60, unit: 'blocks', grid: 10 });
    await w.places.pin(paris.id, at['Louvre'].id, 40, 22);
    const rows = await w.tree();
    const onParis = mapPlaces(rows, paris, await w.places.pins());
    expect([onParis.pinned.map((p) => [p.entry.name, p.pin.x, p.pin.y, p.outside]), onParis.missing.map((e) => e.name)]).toEqual([[['Louvre', 40, 22, false]], ['Gallery 7']]);
    expect(rows.find((r) => r.entry.name === 'Gallery 7')).toMatchObject({ maps: [], depth: 8 });
    // With no map at all, nothing changes for the tree.
    const plain = await world();
    await nested(plain);
    expect((await plain.tree()).map((r) => r.depth)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('coordinates must be numbers; outside the edges is allowed, and said; a whole-world map covers every place', async () => {
    const w = await world();
    const at = await nested(w);
    const whole = await w.places.saveMap(null, { name: 'Everything', width: 10, height: 10 });
    await expect(w.places.pin(whole.id, at['Sol'].id, Number.NaN, 2)).rejects.toThrow('Coordinates must be numbers.');
    await w.places.pin(whole.id, at['Sol'].id, 12, 2);
    await w.places.pin(whole.id, at['Sol'].id, 11, 3);
    const onIt = mapPlaces(await w.tree(), whole, await w.places.pins());
    expect([onIt.pinned.map((p) => [p.pin.x, p.outside]), onIt.missing.length]).toEqual([[[11, true]], 8]);
    await expect(w.places.saveMap(null, { name: ' ' })).rejects.toThrow('Give the map a name.');
    await expect(w.places.setImage(whole.id, 'https://example.com/map.png')).rejects.toThrow('not an image this app can show');
    await w.places.setImage(whole.id, 'data:image/png;base64,iVBORw0KGgo=');
    expect((await db.worldMaps.get(whole.id))!.image).toBe('data:image/png;base64,iVBORw0KGgo=');
  });

  it('a map removed takes its pins, not its places; a place removed takes its pins, and a map of it becomes a map of the world', async () => {
    const w = await world();
    const at = await nested(w);
    const ofParis = await w.places.saveMap(null, { name: 'Paris', placeId: at['Paris'].id });
    const other = await w.places.saveMap(null, { name: 'Other' });
    await w.places.pin(ofParis.id, at['Louvre'].id, 1, 1);
    await w.places.pin(other.id, at['Louvre'].id, 2, 2);
    await w.places.removeMap(other.id);
    expect((await w.places.pins()).map((p) => p.mapId)).toEqual([ofParis.id]);
    await w.codex.remove(at['Paris'].id);
    await w.codex.remove(at['Louvre'].id);
    expect([await w.places.pins(), (await db.worldMaps.get(ofParis.id))!.placeId, (await w.tree()).length]).toEqual([[], null, 7]);
  });

  it('a copy of the novel has its levels, maps and pins, pointing at its own places', async () => {
    const w = await world();
    const at = await nested(w);
    const map = await w.places.saveMap(null, { name: 'Paris', placeId: at['Paris'].id });
    await w.places.pin(map.id, at['Louvre'].id, 5, 6);
    const copy = await projects.duplicate(w.p.id);
    const rows = await w.tree(copy.id);
    const there = createPlaceService(db, projects.contentChanged).forProject(copy.id);
    const [copiedMap] = await there.maps();
    const [pin] = await there.pins();
    expect([rows.map((r) => r.levelWords).join(), copiedMap.placeId === rows.find((r) => r.entry.name === 'Paris')!.entry.id, pin.entryId === rows.find((r) => r.entry.name === 'Louvre')!.entry.id, pin.mapId === copiedMap.id]).toEqual(['Universe,Galaxy,Star system,Planet,Continent,Region,City,Building,Room', true, true, true]);
  });
});

describe('what a place is tied to', () => {
  it('characters and factions connected to it, events there and who takes part, chapters that link it, plan it or tell what happens there', async () => {
    const w = await world();
    const at = await nested(w);
    const mira = await w.characters.create({ name: 'Mira' });
    const guild = await w.codex.create('faction', 'Thieves’ Guild');
    await w.connections.create({ from: { type: 'entry', id: mira.id }, to: { type: 'entry', id: at['Paris'].id }, type: 'located-in' });
    await w.connections.create({ from: { type: 'entry', id: guild.id }, to: { type: 'entry', id: at['Paris'].id }, type: 'located-in' });
    const [one, two] = [await w.ms.create('chapter', null, 'Chapter 1'), await w.ms.create('chapter', null, 'Chapter 2')];
    await w.ms.updatePlan(two.id, { entityIds: [at['Paris'].id] });
    const heist = await w.timeline.create('The heist');
    await w.timeline.update(heist.id, { locationId: at['Louvre'].id, characters: [{ id: mira.id, age: null }], nodeIds: [one.id] });
    const model = await w.model();
    const paris = placeLinks(model, at['Paris'].id);
    expect([paris.characters.map((c) => [c.entry.name, c.how]), paris.factions.map((f) => [f.entry.name, f.how]), paris.events, paris.chapters.map((c) => [c.node.title, c.how])]).toEqual([[['Mira', ['Located in this']]], [['Thieves’ Guild', ['Located in this']]], [], [['Chapter 2', ['has it in the plan']]]]);
    const louvre = placeLinks(model, at['Louvre'].id);
    expect([louvre.characters.map((c) => [c.entry.name, c.how]), louvre.events.map((e) => e.name), louvre.chapters.map((c) => [c.node.title, c.how])]).toEqual([[['Mira', ['takes part in “The heist”, here']]], ['The heist'], [['Chapter 1', ['tells “The heist”, here']]]]);
    // The tree counts them; places inside and around are the tree's, not ties.
    const row = (await w.tree()).find((r) => r.entry.name === 'Paris')!;
    expect([row.characters, row.factions, row.chapters]).toEqual([1, 1, 1]);
  });
});
