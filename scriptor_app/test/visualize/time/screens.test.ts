// The logic of Visualize's time views, as the Flutter app's feature tests check it: ports of the drawn timeline, the
// story-and-reading-order and the character-history cases of flutter_app/test/features/timeline/timeline_screens_test.dart.
// What those check of the widgets themselves (taps, the dropdown, routing) belongs to the screens and is not here;
// each case is run on a real library through the timeline service, and what the page shows is read from the views'
// pure parts.

import { openLibrary } from '../../../src/data/library';
import { CastData } from '../../../src/domain/characters/castData';
import { CharacterService } from '../../../src/domain/characters/characterService';
import { domainOf, layoutAxis } from '../../../src/domain/timeline/axis';
import type { EventChanges } from '../../../src/domain/timeline/eventChanges';
import { tellingNotes, twoOrders, orderSummary } from '../../../src/domain/timeline/narrative';
import { TimelineData } from '../../../src/domain/timeline/screens/timelineData';
import { TimelineService } from '../../../src/domain/timeline/timelineService';
import { arrange, decodeGrouping, groupings, tracksFor } from '../../../src/domain/timeline/tracks';
import { historySections, historySubtitle, lifeOf } from '../../../src/domain/visualize/time/historyView';
import { orderLists, orderShown } from '../../../src/domain/visualize/time/orderView';
import {
  type ChartTrack,
  chartHits,
  hitAt,
  markWords,
  timelineSummary,
  trackRows,
  unplacedLines,
} from '../../../src/domain/visualize/time/timelineView';
import { testIds } from '../../fixtures';
import { memoryLibrary } from '../../nodeSql';

function setUpNovel() {
  let now = Date.UTC(2026, 10, 17, 9);
  const lib = openLibrary(memoryLibrary(), () => now, testIds());
  const { novel } = lib.library.create({ title: 'Ashfall' });
  const characters = new CharacterService(lib.novels, lib.backups, { clock: () => (now += 1000), createId: testIds() });
  const mira = characters.change(novel.id, (x) => x.create({ name: 'Mira' })).id;
  const timeline = new TimelineService(lib.novels, lib.backups, { clock: () => (now += 1000), createId: testIds() });
  const data = () => new TimelineData(new CastData(novel.id, lib.novels.load(novel.id)!));
  const timelineIn = <T>(f: (x: EventChanges) => T): T => timeline.change(novel.id, f);
  return { lib, novel: novel.id, mira, characters, data, timelineIn };
}

/** The drawing as the page lays it out: tracks for `grouping`, every track against the whole story at `width`. */
function chartOf(data: TimelineData, grouping: string, width = 1000): { tracks: ChartTrack[]; summary: string } {
  const model = data.model;
  const records = data.records;
  const byId = new Map(records.map((r) => [r.id, r]));
  const g = decodeGrouping(grouping);
  const shown = arrange(tracksFor(model, records, g), {}).shown;
  const domain = domainOf(records, { day: data.calendar.minutesPerDay, year: data.calendar.minutesPerYear });
  const tracks = shown.map((t) => ({
    track: t,
    axis: layoutAxis(t.eventIds.map((id) => byId.get(id)!).filter(Boolean), { width, domain, useDomain: true }),
  }));
  const dated = records.filter((r) => r.bounds !== null).length;
  return {
    tracks,
    summary: timelineSummary({ dated, grouping: g, shown: shown.length, filtered: false, matching: records.length, all: records.length }),
  };
}

test('the drawn timeline shows events on tracks, lists them, and opens the one chosen', () => {
  const w = setUpNovel();
  const bren = w.characters.change(w.novel, (x) => x.create({ name: 'Bren' })).id;
  const feast = w.timelineIn((x) => {
    const feast = x.createEvent('The feast');
    x.updateEvent(feast, () => ({ when: { precision: 'approximate', year: 12 }, characters: [{ id: w.mira, age: null }, { id: bren, age: null }] }));
    const war = x.createEvent('The war');
    x.updateEvent(war, () => ({ when: { precision: 'exact', year: 9, month: 1, day: 1 }, ongoing: true }));
    x.createEvent('A rumour');
    return feast;
  });
  const data = w.data();
  const one = chartOf(data, 'none');
  expect(one.summary).toContain('Timeline of 2 dated events, in the order they happen.');
  const unplaced = unplacedLines(layoutAxis(data.records).unplaced).map((u) => u.text);
  expect(unplaced).toEqual(['A rumour: No date yet']);
  const said = chartHits(one.tracks, domainOf(data.records)!, 1000).map((h) => `${markWords(h.mark)}, on the ${h.track} track`);
  expect(said.filter((s) => /^The feast, Around Year 12, somewhere in that stretch of time, on the All events track/.test(s))).toHaveLength(1);

  const characters = groupings(data.model).find((g) => g.label === 'Characters')!;
  const byPeople = chartOf(data, characters.value);
  expect(byPeople.summary).toContain('on 3 tracks');
  const window = domainOf(data.records)!;
  const hits = chartHits(byPeople.tracks, window, 1000);
  expect(hits.map((h) => `${markWords(h.mark)}, on the ${h.track} track`).filter((s) => /^The feast, .* on the (Mira|Bren) track$/.test(s))).toHaveLength(2);
  // A tap on the feast's mark chooses it.
  const h = hits.find((x) => x.mark.id === feast)!;
  expect(hitAt(hits, h.rect.left + 10, (h.rect.top + h.rect.bottom) / 2)).toBe(feast);
  // The list form names it; opening it goes to its page.
  const rows = byPeople.tracks.flatMap((t) => trackRows(t.track, data.recordById));
  expect(rows.some((r) => r.id === feast && r.title === 'The feast')).toBe(true);
});

test('story order beside reading order says how the book is told, and why', () => {
  const w = setUpNovel();
  w.timelineIn((x) => {
    ['Prologue', 'One'].forEach((title, i) => {
      x.put('chapters', { id: `ch${i}`, projectId: w.novel, parentId: null, kind: 'chapter', title, order: i });
    });
    const duel = x.createEvent('The duel');
    x.updateEvent(duel, () => ({ when: { precision: 'exact', year: 20 }, nodeIds: ['ch0'] }));
    const childhood = x.createEvent('Childhood');
    x.updateEvent(childhood, () => ({ when: { precision: 'exact', year: 1 }, nodeIds: ['ch1'] }));
  });
  const model = w.data().model;
  const orders = twoOrders(model);
  expect(orderSummary(orders)).toBe('Not told in story order: 1 telling goes back in time.');
  expect(tellingNotes(orders, model).some((n) => n.note.includes('“Childhood” is told in Ch 2: One, after “The duel” (Ch 1: Prologue), which happens later.'))).toBe(true);
  const shown = orderShown(orders, null);
  expect(orderLists(model, shown.events, shown.tellings).reading.map((r) => r.title)).toContain('Ch 2: One: Childhood');
  expect(w.lib.novels.rowsIn(w.novel, 'chapters').map((c) => c['order'])).toEqual([0, 1]);
});

test('a character’s history gathers their life, with ages as exact as the dates allow', () => {
  const w = setUpNovel();
  w.timelineIn((x) => {
    const born = x.createEvent('Mira is born');
    x.updateEvent(born, () => ({ when: { precision: 'exact', year: 1000, month: 3, day: 1 }, characters: [{ id: w.mira, age: 0 }] }));
    const siege = x.createEvent('The siege');
    x.updateEvent(siege, () => ({ when: { precision: 'approximate', year: 1026 }, characters: [{ id: w.mira, age: null }] }));
  });
  const data = w.data();
  const life = lifeOf(data.model, data.cast.characters().map((c) => c.id), w.mira, {
    snapshots: data.cast.snapshot.rows('progressSnapshots'),
    milestones: data.cast.snapshot.rows('characterHistory'),
  })!;
  expect(life.born).toBe('Born on Year 1000, March 1, worked out from their birth, “Mira is born”.');
  const story = historySections(life)[0].items.map(historySubtitle);
  expect(story).toContain('Around Year 1026 · Age 25–26 · takes part');
  expect(lifeOf(data.model, [], w.mira, { snapshots: [], milestones: [] })).toBeNull();
});
