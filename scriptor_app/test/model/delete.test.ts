// What deleting each kind of record does. A port of flutter_app/test/shared/domain/delete_test.dart, with how an
// outcome becomes the writes the store applies.

import { join } from 'node:path';

import { jsonEquals, str } from '../../src/domain/json';
import { StateError, planDelete } from '../../src/domain/model/deletePolicy';
import { EntityRef } from '../../src/domain/model/entityRef';
import { rowWritesBetween } from '../../src/domain/model/rowWrites';
import { maps } from '../../src/domain/records/jsonRecord';
import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { flutterFixturesDir, readJson } from '../fixtures';
import { NovelBuilder, stage, year } from './builder';

const story = () =>
  new NovelBuilder()
    .node('book', { kind: 'volume' })
    .node('ch1', { parent: 'book' })
    .node('sc1', { kind: 'scene', parent: 'ch1' })
    .node('ch2', { parent: 'book', order: 1 })
    .row('chapterContents', { id: 'sc1', doc: {} })
    .row('chapterPlans', { id: 'ch1', entityIds: ['mira'] })
    .entry('mira')
    .entry('orrin')
    .entry('sword', { category: 'item' })
    .link('l1', 'mira', 'orrin')
    .link('l2', 'sword', 'ch1', { toType: 'node' })
    .relation('r', 'mira', 'orrin', [stage('s')])
    .link('l3', 'r', 'orrin', { fromType: 'relation' })
    .event('siege', { characters: ['mira'], nodeIds: ['sc1'], threadIds: ['t1'] })
    .thread('t1', { characterIds: ['mira'] })
    .thread('t2', {
      beats: [{ id: 'b', nodeId: 'ch2', title: 'Cross', role: 'intersection', withThreadIds: ['t1'] }],
    })
    .journey('j', { travellers: ['mira', 'orrin'], from: 'mira', via: ['mira', 'sword'] })
    .row('progressChanges', { id: 'pc', entryId: 'orrin', categoryId: 'c', action: 'gain', refId: 'mira' })
    .row('progressChanges', { id: 'pc2', entryId: 'mira', categoryId: 'c', action: 'gain' })
    .row('worldMaps', { id: 'map', placeId: 'mira' })
    .build();

const ids = (s: NovelSnapshot, c: string) => s.rows(c).map((r) => str(r['id']));

test('deleting a character: links and relationships go; journeys and maps keep the rest; events report it', () => {
  const before = story();
  const outcome = planDelete(before, new EntityRef('entry', 'mira'));
  const s = outcome.snapshot;
  expect(ids(s, 'loreEntries')).toEqual(['orrin', 'sword']);
  expect(ids(s, 'loreLinks')).toEqual(['l2']); // l1 joined mira; l3 joined her relationship
  expect(ids(s, 'characterRelations')).toEqual([]);
  expect(ids(s, 'progressChanges')).toEqual(['pc']); // pc2 was about her
  const journey = s.rows('journeys')[0];
  expect(journey['travellerIds']).toEqual(['orrin']);
  expect(journey['fromId']).toBeNull();
  expect(journey['via']).toEqual(['sword']);
  expect(s.rows('progressChanges')[0]['refId']).toBeNull(); // the change keeps its words, stops linking
  expect(s.rows('worldMaps')[0]['placeId']).toBeNull();
  // The other end is never modified.
  expect(jsonEquals(s.rows('loreEntries')[0], before.rows('loreEntries')[1])).toBe(true);
  // What still names her is not quietly edited: it is reported as broken.
  const broken = new Set(outcome.unresolved.map((d) => d.connection.kind));
  for (const k of ['participant', 'present', 'thread-entry'] as const) expect(broken.has(k)).toBe(true);
  expect(new Set(outcome.detached.map((e) => e.collection))).toEqual(new Set(['journeys', 'worldMaps', 'progressChanges']));
  // Nothing happens until the outcome is stored.
  expect(ids(before, 'loreEntries')).toEqual(['mira', 'orrin', 'sword']);
});

test('deleting a chapter takes its scenes, their text and plans, and their links', () => {
  const s = planDelete(story(), new EntityRef('node', 'ch1')).snapshot;
  expect(ids(s, 'chapters')).toEqual(['book', 'ch2']);
  expect(ids(s, 'chapterContents')).toEqual([]);
  expect(ids(s, 'chapterPlans')).toEqual([]);
  expect(ids(s, 'loreLinks')).toEqual(['l1', 'l3']);
});

test("deleting a thread takes it out of events and other threads' intersections", () => {
  const s = planDelete(story(), new EntityRef('thread', 't1')).snapshot;
  expect(s.rows('timelineEvents')[0]['threadIds']).toEqual([]);
  expect(maps(s.rows('plotThreads')[0]['beats'])[0]['withThreadIds']).toEqual([]);
});

test('deleting an event leaves events that relied on it flagged, not changed', () => {
  const before = new NovelBuilder().event('siege', { when: year(10) }).event('after', { afterId: 'siege' }).build();
  const outcome = planDelete(before, new EntityRef('event', 'siege'));
  expect(outcome.snapshot.rows('timelineEvents')[0]['afterId']).toBe('siege');
  expect(outcome.unresolved.map((d) => d.connection.kind)).toEqual(['follows']);
});

test('deleting an ability removes the item and its links; sheets holding it are reported', () => {
  const s = NovelSnapshot.fromJson(readJson(join(flutterFixturesDir, 'qa-sample.novel.json')));
  const sheet = s.rows('systemSheets').find((r) => Array.isArray(r['itemIds']) && r['itemIds'].length > 0)!;
  const target = new EntityRef('ability', `${sheet['systemId']}/${(sheet['itemIds'] as string[])[0]}`);
  const outcome = planDelete(s, target);
  expect(outcome.removed.some((e) => e.collection === 'systems')).toBe(true);
  expect(outcome.unresolved.some((d) => d.connection.kind === 'holds')).toBe(true);
});

test('deleting something that is not there is an error, not a silent no-op', () => {
  expect(() => planDelete(story(), new EntityRef('entry', 'ghost'))).toThrow(StateError);
  expect(() => planDelete(story(), new EntityRef('entry', 'ghost'))).toThrow('No entry ghost to delete.');
});

test('an outcome becomes the writes the store applies, each checked against what was read', () => {
  const before = story();
  const after = planDelete(before, new EntityRef('entry', 'mira')).snapshot;
  const writes = rowWritesBetween(before, after);
  const removed = writes.filter((w) => w.value === null).map((w) => `${w.collection}/${w.id}`);
  expect(removed.sort()).toEqual(
    ['characterRelations/r', 'loreEntries/mira', 'loreLinks/l1', 'loreLinks/l3', 'progressChanges/pc2'].sort(),
  );
  const changed = writes.filter((w) => w.value !== null).map((w) => `${w.collection}/${w.id}`);
  expect(changed.sort()).toEqual(['journeys/j', 'progressChanges/pc', 'worldMaps/map']);
  // Every write expects the row as it was read.
  for (const w of writes) {
    expect(w.expect).toEqual(before.rows(w.collection).find((r) => r['id'] === w.id));
  }
  // Applying them gives the outcome.
  let applied = before;
  for (const w of writes) {
    applied =
      w.value === null
        ? applied.withRows(w.collection, applied.rows(w.collection).filter((r) => r['id'] !== w.id))
        : applied.putRow(w.collection, w.value);
  }
  for (const c of Object.keys(after.collections)) expect(applied.rows(c)).toEqual(after.rows(c));
});
