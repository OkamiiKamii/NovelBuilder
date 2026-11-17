// Records keep what they do not know and cannot be changed behind their back; the model reads one record per row.
// The model's parts of flutter_app/test/shared/domain/snapshot_test.dart (the file format itself is tested in
// test/snapshot.test.ts).

import { join } from 'node:path';

import { EntityRef } from '../../src/domain/model/entityRef';
import { StoryModel } from '../../src/domain/model/storyModel';
import { maps } from '../../src/domain/records/jsonRecord';
import { StoryNode, upgradeNodeStatus } from '../../src/domain/records/storyNode';
import { Link } from '../../src/domain/records/link';
import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { flutterFixturesDir, readJson } from '../fixtures';

test('a record changed through its type keeps the fields it does not know', () => {
  const node = new StoryNode({ id: 'n', title: 'Old', kind: 'chapter', order: 0, fromTheFuture: 42 });
  const renamed = node.renamed('New');
  expect(renamed.title).toBe('New');
  expect(renamed.raw['fromTheFuture']).toBe(42);
  expect(node.title).toBe('Old'); // records are immutable
  // Frozen all the way down (an assignment throws in strict code and changes nothing either way).
  expect(Object.isFrozen(node.raw)).toBe(true);
  try {
    (node.raw as Record<string, unknown>)['title'] = 'x';
  } catch {
    // strict mode
  }
  expect(node.title).toBe('Old');
});

test('a record copies what it is given, and its JSON is a copy safe to change', () => {
  const raw = { id: 'l', fromId: 'a', toId: 'b', validity: { from: { kind: 'node', nodeId: 'c1' } } };
  const link = new Link(raw);
  raw.validity.from.nodeId = 'changed';
  expect(link.validity!.from!.raw['nodeId']).toBe('c1');
  const json = link.toJson();
  (json['validity'] as Record<string, unknown>)['until'] = null;
  expect(link.raw['validity']).toEqual({ from: { kind: 'node', nodeId: 'c1' } });
  expect(link.merged({ type: null })['type']).toBeNull(); // a null stores null; it does not remove the key
  expect(link.equals(new Link(link.toJson()))).toBe(true);
  expect(link.equals(new StoryNode(link.toJson()))).toBe(false);
  expect(`${link}`).toBe('Link(l)');
});

test('a version 3 file: the model reads an item on its rank by the rank’s id', () => {
  const s = NovelSnapshot.fromJson({
    format: 'novel-builder/project',
    version: 3,
    exportedAt: 1,
    project: { id: 'p', title: 'T' },
    collections: {
      systems: [
        {
          id: 'sys',
          name: 'Cultivation',
          ranks: ['Novice', 'Adept'],
          groups: [{ id: 'g', name: 'Skills' }],
          items: [{ id: 'i1', groupId: 'g', name: 'Fire Palm', rank: 'Adept' }],
        },
      ],
    },
  });
  const ranks = new Map(maps(s.rows('systems')[0]['ranks']).map((r) => [r['name'], r['id']]));
  const model = StoryModel.fromSnapshot(s);
  expect(model.abilities.get('sys/i1')!.item.rankId).toBe(ranks.get('Adept'));
  expect(model.abilities.get('sys/i1')!.group).toBe('Skills');
  expect(upgradeNodeStatus('nonsense')).toBe('idea');
});

test('the shared model reads one record per entity and copies none', () => {
  const s = NovelSnapshot.fromJson(readJson(join(flutterFixturesDir, 'qa-sample.novel.json')));
  const model = StoryModel.fromSnapshot(s);
  expect(model.entries.size).toBe(s.rows('loreEntries').length);
  expect(model.nodes.size).toBe(s.rows('chapters').length);
  // Characters, places, factions and items are all codex entries, told apart by category: one store, one link model.
  const categories = new Set([...model.entries.values()].map((e) => e.category));
  expect(categories.has('character') && categories.has('location')).toBe(true);
  expect(model.resolve(new EntityRef('entry', 'not-there'))).toBeNull();
});

test('the model keeps the rows’ order even for ids that look like numbers', () => {
  const s = new NovelSnapshot({
    project: { id: 'p' },
    collections: {
      loreEntries: [
        { id: 'b', name: 'B' },
        { id: '2', name: 'Two' },
        { id: '1', name: 'One' },
      ],
    },
  });
  expect([...StoryModel.fromSnapshot(s).entries.keys()]).toEqual(['b', '2', '1']);
});
