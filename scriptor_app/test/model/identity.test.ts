// Stable ids: renaming and moving records keeps every id and connection. A port of
// flutter_app/test/shared/domain/identity_test.dart (the UUID test is Scriptor's ids.ts, tested elsewhere).

import { jsonEquals } from '../../src/domain/json';
import { deriveConnections } from '../../src/domain/model/connections';
import { EntityRef, abilityId } from '../../src/domain/model/entityRef';
import { StoryModel } from '../../src/domain/model/storyModel';
import { spanOfEvent } from '../../src/domain/model/validity';
import { Entry } from '../../src/domain/records/entry';
import { StoryNode } from '../../src/domain/records/storyNode';
import type { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { NovelBuilder, stage, year } from './builder';

function story(): NovelSnapshot {
  return (
    new NovelBuilder()
      .node('book', { kind: 'volume' })
      .node('ch1', { parent: 'book', order: 0, mentions: ['mira'] })
      .node('ch2', { parent: 'book', order: 1 })
      .node('ch3', { parent: 'book', order: 2 })
      .entry('mira')
      .entry('orrin')
      .entry('keep', { category: 'location' })
      .link('l1', 'mira', 'orrin', { type: 'considers-rival' })
      // A flashback: told in chapter 3, but happened in Year 1, before the Siege (told in chapter 1).
      .event('siege', { when: year(10), nodeIds: ['ch1'], characters: ['mira'], locationId: 'keep' })
      .event('childhood', { when: year(1), nodeIds: ['ch3'], characters: ['mira', 'orrin'] })
      .relation('r1', 'mira', 'orrin', [stage('s1', { title: 'Friends' }), stage('s2', { startNodeId: 'ch2', title: 'Rivals' })])
      .build()
  );
}

const connectionIds = (s: NovelSnapshot) =>
  new Set(deriveConnections(StoryModel.fromSnapshot(s)).connections.map((c) => c.id));
const row = (s: NovelSnapshot, c: string, id: string) => s.rows(c).find((r) => r['id'] === id)!;

test('renaming records keeps every id and connection, and shows the new name', () => {
  const before = story();
  const renamedNode = new StoryNode(row(before, 'chapters', 'ch1')).renamed('The Siege');
  const renamedEntry = new Entry(row(before, 'loreEntries', 'mira')).renamed('Mira Vale');
  const after = before.putRow('chapters', renamedNode.toJson()).putRow('loreEntries', renamedEntry.toJson());

  expect(connectionIds(after)).toEqual(connectionIds(before));
  const model = StoryModel.fromSnapshot(after);
  expect(model.resolve(new EntityRef('node', 'ch1'))!.label).toBe('The Siege');
  expect(model.resolve(new EntityRef('entry', 'mira'))!.label).toBe('Mira Vale');
  expect(deriveConnections(model).dangling).toEqual([]);
  // A relationship's label follows the renamed character, because it reads the name from the entry each time.
  expect(model.resolve(new EntityRef('relation', 'r1'))!.label).toBe('Mira Vale and orrin');
});

test('reordering chapters changes reading order only: links and story chronology are untouched', () => {
  const before = story();
  const beforeModel = StoryModel.fromSnapshot(before);
  // Move chapter 3 to the front.
  const moved = new StoryNode(row(before, 'chapters', 'ch3')).movedTo({ parentId: 'book', order: -1 });
  const after = before.putRow('chapters', moved.toJson());
  const model = StoryModel.fromSnapshot(after);

  expect(model.order.chapters.map((c) => c.id)).toEqual(['ch3', 'ch1', 'ch2']);
  expect(connectionIds(after)).toEqual(connectionIds(before));
  // When events happen did not move.
  for (const id of ['siege', 'childhood']) {
    expect(spanOfEvent(id, model.timeContext)!.equals(spanOfEvent(id, beforeModel.timeContext))).toBe(true);
  }
  // Only parentId and order changed on the moved node.
  const old = row(before, 'chapters', 'ch3');
  expect(Object.keys(moved.raw).filter((k) => !jsonEquals(moved.raw[k], old[k]))).toEqual(['order']);
});

test('moving a scene to another chapter keeps its id and what points at it', () => {
  const before = new NovelBuilder()
    .node('ch1')
    .node('ch2', { order: 1 })
    .node('sc', { kind: 'scene', parent: 'ch1' })
    .event('e', { nodeIds: ['sc'] })
    .build();
  const rows = before.rows('chapters');
  const moved = new StoryNode(rows[rows.length - 1]).movedTo({ parentId: 'ch2', order: 0 });
  const model = StoryModel.fromSnapshot(before.putRow('chapters', moved.toJson()));
  expect(model.order.position.get('sc')!).toBeGreaterThan(model.order.position.get('ch2')!);
  const told = deriveConnections(model).connections.filter((c) => c.kind === 'told-in');
  expect(told).toHaveLength(1);
  expect(told[0].to.equals(new EntityRef('node', 'sc'))).toBe(true);
});

test('a node whose parent is missing is read at the top level, not lost', () => {
  const model = StoryModel.fromSnapshot(new NovelBuilder().node('a').node('orphan', { parent: 'gone', order: 1 }).build());
  expect([...model.order.position.keys()]).toEqual(expect.arrayContaining(['a', 'orphan']));
});

test('refs round-trip through their key and JSON, and reject what is not a ref', () => {
  const ref = new EntityRef('ability', 'sys/item');
  expect(EntityRef.parse(ref.key)!.equals(ref)).toBe(true);
  expect(EntityRef.fromJson(ref.toJson())!.equals(ref)).toBe(true);
  expect(EntityRef.parse('nonsense')).toBeNull();
  expect(EntityRef.parse('planet:x')).toBeNull();
  expect(abilityId('sys', 'item')).toBe('sys/item');
});
