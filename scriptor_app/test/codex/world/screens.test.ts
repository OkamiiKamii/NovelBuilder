// The logic of the world's screens: ports of flutter_app/test/features/codex/world_chart_test.dart,
// found_in_pages_test.dart, world_charter_test.dart and world_screens_test.dart (what they check of the records, the
// words and the layout; taps, scrolling, text scaling and contrast guidelines are the screens' own), with the codex
// service's delete on the app's own stores.

import { openLibrary } from '../../../src/data/library';
import { CastData } from '../../../src/domain/characters/castData';
import { characterPath, entryPath } from '../../../src/domain/characters/screens/create';
import { CodexService } from '../../../src/domain/codex/codexService';
import {
  autosaveKeys,
  deleteDialog,
  encodeQueryComponent,
  entryEdits,
  entryHead,
  kindFields,
  linkStatusLabel,
  nameTyped,
  ownFieldAdded,
  ownFieldEdited,
  ownFieldRow,
  ownFieldsNote,
  ownFieldsSaved,
  relatedEdits,
  relatedEntries,
  whereItFigures,
} from '../../../src/domain/codex/screens/entryPage';
import { addFind, foundInPages, notAnEntryAfter, notEntriesKey, worldFindsFor } from '../../../src/domain/codex/screens/foundInPages';
import {
  articleOf,
  countLine,
  encyclopedia,
  fileByLetter,
  kindColor,
  letterOf,
  newEntry,
  newEntryKinds,
  volumePressed,
  worldShelves,
  worldVisible,
  worldVolumes,
} from '../../../src/domain/codex/screens/world';
import {
  type ChartPlace,
  belongSheet,
  belongTo,
  belongsWord,
  chartLabels,
  chartTargets,
  chartWords,
  layOutChart,
  shorePath,
  worldChartOf,
} from '../../../src/domain/codex/screens/worldChart';
import { charterAny, charterAsked, charterMessage, charterParts, foundWorld } from '../../../src/domain/codex/screens/worldCharter';
import { setIdGenerator } from '../../../src/domain/ids';
import { type JsonMap, jsonEquals } from '../../../src/domain/json';
import { Category } from '../../../src/domain/records/category';
import { Entry } from '../../../src/domain/records/entry';
import { Link } from '../../../src/domain/records/link';
import { textToDoc } from '../../../src/domain/prose';
import { NovelSnapshot } from '../../../src/domain/snapshot/novelSnapshot';
import { readJson, samplePath, testIds } from '../../fixtures';
import { memoryLibrary } from '../../nodeSql';
import { World } from '../../characters/world';
import { fakeLayout, fakeWidth } from './golden/outputs';

setIdGenerator(testIds());

const all = (places: readonly ChartPlace[]): ChartPlace[] => places.flatMap((p) => [p, ...all(p.children)]);
const sampleCast = () => new CastData('x', NovelSnapshot.fromJson(readJson(samplePath)));

const linked = (text: string, entryId: string): JsonMap => ({
  type: 'doc',
  content: [{ type: 'paragraph', attrs: { textAlign: null }, content: [{ type: 'text', text, marks: [{ type: 'entityLink', attrs: { entryId } }] }] }],
});

function castOf(w: World): CastData {
  return new CastData('novel', w.snapshot);
}

// ---------------------------------------------------------------------------------------------------- the chart

describe('the chart of the world', () => {
  test('it holds every place inside what it is in, and every other world entry once: on a shore or adrift', () => {
    const cast = sampleCast();
    const chart = worldChartOf(cast.model, cast.chaptersOf());
    const places = all(chart.islands);
    const locations = cast.entries.filter((e) => e.category === 'location');
    expect(new Set(places.map((p) => p.entry.id))).toEqual(new Set(locations.map((e) => e.id)));
    for (const island of chart.islands) {
      expect(island.depth).toBe(0);
      for (const p of all(island.children)) expect(p.depth).toBeGreaterThan(0);
    }
    const world = cast.entries.filter((e) => e.category !== 'character' && e.category !== 'location');
    const shown = [...places.flatMap((p) => p.seals), ...chart.adrift];
    expect(shown.map((e) => e.id).sort()).toEqual(world.map((e) => e.id).sort());
    // A seal is linked to its place; an entry adrift is linked to none.
    const placeIds = new Set(places.map((p) => p.entry.id));
    const tiedToAPlace = (id: string) =>
      cast.model.links.some((l) => l.isEntryLink && ((l.fromId === id && placeIds.has(l.toId)) || (l.toId === id && placeIds.has(l.fromId))));
    for (const p of places) for (const s of p.seals) expect([s.name, tiedToAPlace(s.id)]).toEqual([s.name, true]);
    for (const e of chart.adrift) expect([e.name, tiedToAPlace(e.id)]).toEqual([e.name, false]);
  });

  test('an entry adrift is placed in a press: linked with the word for its kind, then on the shore', () => {
    const w = new World();
    w.snapshot = NovelSnapshot.fromJson(readJson(samplePath));
    const cast = castOf(w);
    const before = worldChartOf(cast.model, cast.chaptersOf());
    const drifting = before.adrift[0];
    const island = before.islands[0];
    const sheet = belongSheet(drifting, before);
    expect(sheet.title).toBe(`Where does ${drifting.name} belong?`);
    expect(sheet.places.map((p) => p.place.entry.id)).toEqual(all(before.islands).map((p) => p.entry.id));
    const told = w.act((c) => belongTo(c, drifting, island.entry));
    const word = belongsWord(drifting.category);
    const made = w.rows('loreLinks').map((r) => new Link(r)).filter((l) => l.fromId === drifting.id && l.toId === island.entry.id);
    expect(made).toHaveLength(1);
    expect(made[0].fromLabel).toBe(word);
    expect(told.tell).toBe(`${drifting.name} ${word} ${island.entry.name}.`);
    const after = castOf(w);
    const chart = worldChartOf(after.model, after.chaptersOf());
    expect(chart.adrift.map((e) => e.id)).not.toContain(drifting.id);
    expect(all(chart.islands).find((p) => p.entry.id === island.entry.id)!.seals.map((e) => e.id)).toContain(drifting.id);
    // Its target says so.
    const laid = layOutChart(1400, chart, { caps: false, measure: fakeWidth });
    const targets = chartTargets(laid, chart, (e) => after.model.categories.get(e.category) ?? Category.unknown(e.category), true);
    expect(targets.some((t) => t.label.startsWith(`${drifting.name}, `) && t.label.endsWith('on the shore'))).toBe(
      laid.seals.some((s) => s.entry.id === drifting.id),
    );
    expect(targets.some((t) => t.label.startsWith(`${drifting.name}, adrift`))).toBe(false);
  });

  test('a world with no places has no chart; one place and one adrift are said so', () => {
    const w = new World();
    w.act((c) => c.createEntry('faction', 'Ash Guild'));
    let chart = worldChartOf(castOf(w).model, new Map());
    expect(chart.islands).toEqual([]);
    w.act((c) => c.createEntry('location', 'The Keep'));
    chart = worldChartOf(castOf(w).model, new Map());
    expect(chartWords(chart).label).toBe('Chart of the world: 1 place, 1 adrift');
    expect(chartWords(chart).caption.endsWith('1 adrift, linked to no place: press one to say where it belongs.')).toBe(true);
  });

  test('laid out: inside the chart, every place inside what it is in, the names placed, the shores closed', () => {
    const cast = sampleCast();
    const chart = worldChartOf(cast.model, cast.chaptersOf());
    for (const width of [390, 1000]) {
      const laid = layOutChart(width, chart, { caps: false, measure: fakeWidth });
      expect(laid.compact).toBe(width < 600);
      expect(laid.sea).toBe(chart.adrift.length === 0 ? 0 : 84);
      for (const d of laid.drawn) {
        expect(d.centre.x - d.r).toBeGreaterThanOrEqual(0);
        expect(d.centre.x + d.r).toBeLessThanOrEqual(width);
        expect(d.centre.y + d.r).toBeLessThanOrEqual(laid.height);
      }
      const byId = new Map(laid.drawn.map((d) => [d.place.entry.id, d]));
      for (const d of laid.drawn) {
        for (const k of d.place.children) {
          const kid = byId.get(k.entry.id)!;
          const apart = Math.hypot(kid.centre.x - d.centre.x, kid.centre.y - d.centre.y);
          expect(apart + kid.r).toBeLessThanOrEqual(d.r + 1e-6);
        }
      }
      expect(chartLabels(laid.drawn, { caps: false, layout: fakeLayout })).toHaveLength(laid.drawn.filter((d) => d.r >= 5).length);
      const path = shorePath(laid.drawn[0].centre, laid.drawn[0].r, 7, 0.06);
      expect(path.startsWith('M')).toBe(true);
      expect(path.endsWith('Z')).toBe(true);
      expect(path.match(/Q/g)).toHaveLength(72);
    }
  });
});

// ---------------------------------------------------------------------------------------------------- found in your pages

describe('found in your pages (the world)', () => {
  function novelWithPages(): World {
    const w = new World();
    w.chapter('one', { order: 0 });
    w.snapshot = w.snapshot.putRow('chapterContents', {
      id: 'one',
      projectId: 'novel',
      doc: textToDoc(
        'James cut through the Mimir Forest to do so. The Mimir Forest was dark.\n' +
          'For now, James was flying by using the Smart Atoms skill.\n' +
          'The Glass Order waited by the Iron Gate.',
      ),
    });
    return w;
  }

  test('the World offers what the chapters name; a press adds it, under its kind or another; or sets it aside', () => {
    const w = novelWithPages();
    let cast = castOf(w);
    const finds = () => worldFindsFor(castOf(w), w.rows('chapterContents'));
    let panel = foundInPages(finds(), null, cast.model.categories, false)!;
    expect(panel.heading).toBe('Found in your pages');
    const forest = panel.cards.find((c) => c.find.name === 'Mimir Forest')!;
    expect(forest.line).toBe('Location · reads as a place · in chapter 1');
    expect(forest.add).toBe('Add as Location');
    expect(forest.others.map((o) => o.key)).not.toContain('location');
    expect(forest.others.map((o) => o.key)).not.toContain('character');
    const entries = () => w.rows('loreEntries').map((e) => `${e['name']}:${e['category']}`);

    const told = w.act((c) => addFind(c, forest.find, 'location'));
    expect(entries()).toContain('Mimir Forest:location');
    expect(told.tell).toBe('Mimir Forest is in the world.');
    expect([told.action, entryPath(told.made.id, { character: false })]).toEqual(['Open', `/organize/world/entry/${told.made.id}`]);

    cast = castOf(w);
    panel = foundInPages(finds(), null, cast.model.categories, false)!;
    const atoms = panel.cards.find((c) => c.find.name === 'Smart Atoms')!;
    expect(atoms.add).toBe('Add as Power System / Rule');
    w.act((c) => addFind(c, atoms.find, atoms.kind.key));
    expect(entries()).toContain('Smart Atoms:power');

    // Another kind; and one set aside.
    panel = foundInPages(finds(), null, castOf(w).model.categories, false)!;
    const left = panel.cards[0];
    w.act((c) => addFind(c, left.find, 'lore'));
    expect(entries().filter((e) => e.endsWith(':lore'))).toHaveLength(1);
    panel = foundInPages(finds(), null, castOf(w).model.categories, false)!;
    expect(panel.cards).toHaveLength(1);
    const stored = notAnEntryAfter(null, panel.cards[0].find);
    expect(foundInPages(finds(), stored, castOf(w).model.categories, false)).toBeNull();
    expect(stored).toHaveLength(1);
    expect(notEntriesKey('novel')).toBe('world.notEntries.novel');
    expect(entries()).toHaveLength(3);
  });

  test('three, then "Show all"', () => {
    const w = new World();
    w.chapter('one', { order: 0 });
    w.snapshot = w.snapshot.putRow('chapterContents', {
      id: 'one',
      projectId: 'novel',
      doc: textToDoc('The Salt Guild, the Glass River, the Iron Gate, the Brass Compass and Mount Ash.'),
    });
    const kinds = castOf(w).model.categories;
    const finds = worldFindsFor(castOf(w), w.rows('chapterContents'));
    expect(foundInPages(finds, null, kinds, false)!.cards).toHaveLength(3);
    expect(foundInPages(finds, null, kinds, false)!.more).toBe(`Show all ${finds.length}`);
    expect(foundInPages(finds, null, kinds, true)!.cards).toHaveLength(finds.length);
    expect(foundInPages(finds, null, kinds, true)!.more).toBe('Show fewer');
  });
});

// ---------------------------------------------------------------------------------------------------- the charter

describe('the first page of the world', () => {
  test('an empty world opens on it; the blanks filled become linked entries in one press', () => {
    const w = new World();
    const asked = charterAsked(castOf(w).model.categories);
    expect(asked.map((c) => c.kind)).toEqual(['location', 'faction', 'item', 'power', 'lore']);
    expect(charterAny(asked, new Map())).toBe(false);
    const names = new Map([
      ['location', 'Harrowmere'],
      ['faction', 'The Salt Court'],
      ['lore', 'the Long Winter'],
    ]);
    expect(charterAny(asked, names)).toBe(true);
    const made = w.act((c) => foundWorld(c, names));
    const entries = new Map(w.rows('loreEntries').map((r) => [r['name'], r]));
    expect(Object.fromEntries([...entries].map(([k, v]) => [k, v['category']]))).toEqual({
      Harrowmere: 'location',
      'The Salt Court': 'faction',
      'the Long Winter': 'lore',
    });
    const place = entries.get('Harrowmere')!['id'];
    expect(new Set(w.rows('loreLinks').map((l) => JSON.stringify([l['fromId'], l['toId'], l['fromLabel']])))).toEqual(
      new Set([
        JSON.stringify([entries.get('The Salt Court')!['id'], place, 'holds power in']),
        JSON.stringify([entries.get('the Long Winter')!['id'], place, 'remembered in']),
      ]),
    );
    expect(charterMessage(made)).toBe('Your world has its first 3 entries.');
    expect(charterMessage(1)).toBe('Your world has its first entry.');
    expect(worldShelves(castOf(w)).all).toHaveLength(3);
  });

  test('without a place, the others are still made, unlinked', () => {
    const w = new World();
    w.act((c) => foundWorld(c, new Map([['power', 'Bloodsong']])));
    expect(w.rows('loreEntries').map((r) => [r['name'], r['category']])).toEqual([['Bloodsong', 'power']]);
    expect(w.rows('loreLinks')).toEqual([]);
  });

  test('the paragraph, word by word, each blank with its full stop', () => {
    const parts = charterParts(charterAsked(castOf(new World()).model.categories));
    expect(parts.slice(0, 6).map((p) => (p.kind === 'word' ? p.text : `[${p.clause.kind}${p.stop ? '.' : ''}]`))).toEqual([
      'My',
      'story',
      'takes',
      'place',
      'in',
      '[location.]',
    ]);
    expect(parts.slice(6, 10).map((p) => (p.kind === 'word' ? p.text : `[${p.clause.kind}]`))).toEqual(['[faction]', 'hold', 'power', 'there.']);
  });
});

// ---------------------------------------------------------------------------------------------------- the world and its entries

describe('the world and its entries', () => {
  test('a new entry of a kind is made and opened; its kind’s fields are its page’s', () => {
    const w = new World();
    const kinds = newEntryKinds(worldShelves(castOf(w)).kinds);
    expect(kinds.map((k) => k.label)).toContain('Location');
    const made = w.act((c) => newEntry(c, 'location'));
    expect(w.rows('loreEntries').map((r) => [r['name'], r['category']])).toEqual([['New location', 'location']]);
    const cast = castOf(w);
    expect(kindFields(cast, made, cast.model.categories.get('location')!).title).toBe('Location fields');
  });

  test('an entry’s fields save as typed; a required field says so when empty, and is never enforced', () => {
    const w = new World();
    const keep = w.act((c) => c.createEntry('location', 'The Keep')).id;
    w.act((c) =>
      c.saveCategory('location', (current) => ({
        fields: [
          ...current!.fields.map((f) => f.raw),
          { id: 'pop', name: 'Population', type: 'number', options: [], required: true, max: 5000 },
        ],
      })),
    );
    const view = () => {
      const cast = castOf(w);
      const e = cast.model.entries.get(keep)!;
      return kindFields(cast, e, cast.model.categories.get('location')!);
    };
    expect(view().rows.find((r) => r.def.id === 'pop')!.error).toBe('Population is required.');
    expect(view().rows.find((r) => r.def.id === 'pop')!.label).toBe('Population *');
    const type = view().rows.find((r) => r.def.name === 'Type')!;
    w.act((c) => c.setFieldValue(keep, type.def.id, 'Fortress'));
    w.act((c) => c.setFieldValue(keep, 'pop', '9000'));
    const entry = castOf(w).model.entries.get(keep)!;
    expect(Object.fromEntries(entry.fields.map((f) => [f.defId, f.value]))).toEqual({ 'builtin-location-0': 'Fortress', pop: '9000' });
    expect(view().rows.find((r) => r.def.id === 'pop')!.error).toBe('Population should be at most 5000; it is 9000.');
    expect(view().editPath).toBe('/organize/world/kinds?kind=location');
    expect(encodeQueryComponent('my kind & co')).toBe('my+kind+%26+co');
  });

  test('fields just for one entry, tags and a link to another entry, with its status', () => {
    const w = new World();
    const keep = w.act((c) => c.createEntry('location', 'The Keep')).id;
    const guild = w.act((c) => c.createEntry('faction', 'Ash Guild')).id;
    let ids = 0;
    let rows = ownFieldAdded([], () => `f${++ids}`);
    expect(ownFieldsNote(rows)).toBe('A field with neither a name nor a value is not kept.');
    rows = ownFieldEdited(rows, 0, { key: 'Motto' });
    expect(ownFieldRow(rows[0]).valueLabel).toBe('Motto: value');
    rows = ownFieldEdited(rows, 0, { value: 'Hold fast' });
    expect(ownFieldsNote(rows)).toBeNull();
    w.act(ownFieldsSaved(keep, rows));
    w.act(entryEdits.tags(keep, 'north, stone'));
    const entry = castOf(w).model.entries.get(keep)!;
    expect(entry.fields.map((f) => [f.key, f.value])).toEqual([['Motto', 'Hold fast']]);
    expect(entry.tags).toEqual(['north', 'stone']);

    let related = relatedEntries(castOf(w), entry);
    expect(related.empty).toBe('Not linked to anything yet.');
    expect(related.linkable).toEqual([{ value: guild, label: 'Ash Guild (Faction / Species)' }]);
    w.act(relatedEdits.link(keep, guild, 'Seat of'));
    const link = w.rows('loreLinks')[0];
    expect([link['fromId'], link['fromLabel']]).toEqual([keep, 'Seat of']);
    related = relatedEntries(castOf(w), castOf(w).model.entries.get(keep)!);
    expect(related.rows.map((r) => [r.entry.name, r.label, r.canon])).toEqual([['Ash Guild', 'Seat of', 'canon']]);
    expect(related.statuses.map((s) => s.label)).toEqual(['Confirmed', 'Provisional', 'Invalid: not canon', 'Invalid: retconned', 'Disputed']);
    w.act(relatedEdits.canon(related.rows[0].linkId, 'conflicting'));
    expect(relatedEntries(castOf(w), castOf(w).model.entries.get(keep)!).rows[0].canon).toBe('conflicting');
    expect(linkStatusLabel('conflicting')).toBe('Disputed');
    expect(relatedEntries(castOf(w), castOf(w).model.entries.get(guild)!).rows[0].hint).toBe('They say: Seat of');
    w.act(relatedEdits.unlink(related.rows[0].linkId));
    expect(w.rows('loreLinks')).toEqual([]);
  });

  test('the head: its kinds, a name of only spaces not saved, Forge a name for a place', () => {
    const w = new World();
    const keep = w.act((c) => c.createEntry('location', 'The Keep'));
    const cast = castOf(w);
    const head = entryHead(cast, keep, cast.model.categories.get('location')!);
    expect(head.pictureLabel).toBe('The Keep has no picture');
    expect(head.upload).toBe('Upload picture');
    expect(head.categories.map((c) => c.value)).not.toContain('character');
    expect(head.forge.place).toBe(true);
    expect(nameTyped(keep.id, '   ')).toBeNull();
    w.act(nameTyped(keep.id, ' Old Keep ')!);
    expect(castOf(w).model.entries.get(keep.id)!.name).toBe('Old Keep');
    expect(autosaveKeys.value(keep.id, 'd')).toBe(`value:${keep.id}:d`);
  });

  test('deleting an entry says what refers to it, keeps the words, and Undo brings it back', () => {
    let now = Date.UTC(2026, 9, 24, 9);
    const lib = openLibrary(memoryLibrary(), () => now, testIds());
    const { novel } = lib.library.create({ title: 'Ashfall' });
    const service = new CodexService(lib.novels, lib.backups, { clock: () => (now += 1000), createId: testIds() });
    const keep = service.change(novel.id, (c) => c.createEntry('location', 'The Keep'));
    lib.novels.writeRows(novel.id, [
      { collection: 'chapters', id: 'one', value: { id: 'one', projectId: novel.id, kind: 'chapter', title: 'One', order: 0, mentions: [keep.id] } },
      { collection: 'chapterContents', id: 'one', value: { id: 'one', projectId: novel.id, doc: linked('the Keep', keep.id) } },
    ]);
    const text = lib.novels.rowsIn(novel.id, 'chapterContents')[0]['doc'];
    const dialog = deleteDialog(service.references(novel.id, keep.id), keep, Category.unknown('location'));
    expect(dialog.message).toContain('1 chapter linking to it in the text (the words stay)');
    expect(dialog.title).toBe('Delete The Keep?');
    const kept = service.delete(novel.id, keep.id, { name: keep.name });
    expect(lib.novels.rowsIn(novel.id, 'loreEntries').find((r) => r['id'] === keep.id)).toBeUndefined();
    expect(jsonEquals(lib.novels.rowsIn(novel.id, 'chapterContents')[0]['doc'], text)).toBe(true);
    service.undoDelete(kept);
    expect(lib.novels.rowsIn(novel.id, 'loreEntries').find((r) => r['id'] === keep.id)).toBeDefined();
  });

  test('where it figures: the chapters linking to it, the events and threads naming it', () => {
    const w = new World();
    const keep = w.act((c) => c.createEntry('location', 'The Keep'));
    expect(whereItFigures(castOf(w), keep).empty).toBe('No chapter, event or plot thread refers to The Keep yet.');
    w.chapter('two', { order: 1, mentions: [keep.id] });
    w.chapter('one', { order: 0, mentions: [keep.id] });
    const where = whereItFigures(castOf(w), keep);
    expect(where.empty).toBeNull();
    expect(where.chapters!.items.map((i) => i.id)).toEqual(['one', 'two']);
  });

  test('the encyclopedia files entries by letter, opens a volume per kind and shows where each figures', () => {
    const w = new World();
    const keep = w.act((c) => c.createEntry('location', 'The Keep')).id;
    w.act((c) => c.createEntry('location', 'Élan Spire'));
    w.act((c) => c.createEntry('faction', 'Ash Guild'));
    w.act((c) => c.createEntry('item', '7 Bells'));
    w.chapter('one', { order: 0 });
    w.chapter('two', { order: 1, mentions: [keep] });
    const cast = castOf(w);
    expect(letterOf('Élan Spire')).toBe('E');
    expect(letterOf('7 Bells')).toBe('#');
    const shelves = worldShelves(cast);
    const kindOf = (e: Entry) => cast.model.categories.get(e.category) ?? Category.unknown(e.category);
    const book = encyclopedia(shelves.all, kindOf, cast.chaptersOf(), cast.model.order.chapters.length);
    expect(book.letters.map((l) => l.label)).toEqual(['Numbers and signs', 'Letter A', 'Letter E', 'Letter T']);
    const articles = book.letters.flatMap((l) => l.articles);
    expect(articles.find((a) => a.entry.id === keep)!.label.startsWith('The Keep, Location, In chapter 2')).toBe(true);
    expect(/^Ash Guild, .*Not in the manuscript yet/.test(articles.find((a) => a.entry.name === 'Ash Guild')!.label)).toBe(true);
    expect(fileByLetter(shelves.all).map(([l]) => l)).toEqual(['#', 'A', 'E', 'T']);

    const volumes = worldVolumes(shelves, null);
    const locations = volumes.find((v) => v.title === 'Locations')!;
    expect(locations.label).toBe('Locations, 2 entries');
    const chosen = volumePressed(null, locations.key);
    const shown = worldVisible(shelves.all, { category: chosen, tag: null, query: '' });
    expect(shown.map((e) => e.name)).toEqual(['Élan Spire', 'The Keep']);
    expect(countLine(shown.length, shelves.all.length)).toBe('2 of 4 entries');
    expect(volumePressed(chosen, chosen)).toBeNull();
    expect(volumePressed(chosen, null)).toBeNull();
    expect(worldVolumes(shelves, chosen).find((v) => v.selected)!.title).toBe('Locations');
    expect(entryPath(keep, { character: false })).toBe(`/organize/world/entry/${keep}`);
  });

  test('a character’s address under World opens the character’s profile', () => {
    const w = new World();
    const mira = w.createCharacter('Mira');
    expect(entryPath(mira, { character: true })).toBe(characterPath(mira));
    expect(worldShelves(castOf(w)).all).toEqual([]);
  });

  test('a kind’s colour, its articles, a world of many entries a screenful at a time', () => {
    expect(kindColor(Category.unknown('x'))).toMatch(/^#[0-9a-f]{6}$/);
    const w = new World();
    for (let i = 0; i < 30; i++) w.act((c) => c.createEntry('lore', `Tale ${String.fromCharCode(65 + (i % 26))}${i}`));
    const cast = castOf(w);
    const shelves = worldShelves(cast);
    const book = encyclopedia(shelves.all, (e) => cast.model.categories.get(e.category)!, new Map(), 0, 10);
    expect(book.letters.flatMap((l) => l.articles)).toHaveLength(10);
    expect(articleOf(shelves.all[0], cast.model.categories.get('lore')!, new Set(), 0).where).toBeNull();
    expect(articleOf(shelves.all[0], cast.model.categories.get('lore')!, new Set([1, 3]), 4).where).toBe('In 2 of 4 chapters · 1–3');
  });
});
