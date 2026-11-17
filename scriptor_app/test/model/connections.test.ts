// Typed connections and text order. A port of the parts of flutter_app/test/shared/domain/
// connections_validation_test.dart that concern the model; its "validation" and "shared query" groups test
// model/validate.dart and model/query.dart, which are not ported yet.

import { localeCompare } from '../../src/domain/collation';
import { connectionsOf, deriveConnections } from '../../src/domain/model/connections';
import { EntityRef } from '../../src/domain/model/entityRef';
import { StoryModel } from '../../src/domain/model/storyModel';
import { Link, wordingOf } from '../../src/domain/records/link';
import { NovelBuilder } from './builder';

const mira = new EntityRef('entry', 'mira');
const orrin = new EntityRef('entry', 'orrin');

test('a one-sided kind says nothing about the other side', () => {
  const model = StoryModel.fromSnapshot(
    new NovelBuilder().entry('mira').entry('orrin').link('l', 'mira', 'orrin', { type: 'considers-rival' }).build(),
  );
  const { connections } = deriveConnections(model);
  expect(connections).toHaveLength(1);
  const c = connections[0];
  expect(c.directed).toBe(true);
  expect(c.label).toBe('Considers a rival');
  expect(c.reverseLabel).toBeNull(); // Orrin's view is never invented
  const seen = connectionsOf([c], orrin);
  expect(seen).toHaveLength(1);
  expect([seen[0].label, seen[0].theirLabel, seen[0].outgoing]).toEqual(['', 'Considers a rival', false]);
});

test('a converse kind reads correctly from both ends; a mutual kind the same both ways', () => {
  expect(wordingOf(new Link({ id: 'a', type: 'owns', fromLabel: '', toLabel: '' })).backward).toBe('Owned by');
  expect(wordingOf(new Link({ id: 'b', type: 'allied-with', fromLabel: '', toLabel: '' }))).toEqual({
    forward: 'Allied with',
    backward: 'Allied with',
    reciprocal: true,
  });
  // The author's own word is kept as written and treated as one-sided.
  expect(wordingOf(new Link({ id: 'c', type: 'owes a debt to', fromLabel: '', toLabel: '' }))).toEqual({
    forward: 'owes a debt to',
    backward: '',
    reciprocal: false,
  });
});

test('connections store ids only, so a rename shows everywhere at once', () => {
  const s = new NovelBuilder()
    .entry('mira')
    .entry('keep', { category: 'location' })
    .event('siege', { characters: ['mira'], locationId: 'keep' })
    .build();
  const { connections } = deriveConnections(StoryModel.fromSnapshot(s));
  expect(new Set(connections.map((c) => c.kind))).toEqual(new Set(['participant', 'occurs-at']));
  expect(connections.every((c) => ['from', 'to', 'source'].every((k) => k in c.toJson()))).toBe(true);
});

test('a reference field on an entry is a connection, named after the field', () => {
  const model = StoryModel.fromSnapshot(
    new NovelBuilder()
      .entry('wardens', {
        category: 'faction',
        fields: [{ id: 'f1', key: 'Leader', value: 'mira', type: 'reference' }],
      })
      .entry('mira')
      .build(),
  );
  const { connections } = deriveConnections(model);
  expect(connections).toHaveLength(1);
  expect([connections[0].kind, connections[0].label, connections[0].to.equals(mira)]).toEqual(['field', 'Leader', true]);
});

test('a link whose end is deleted is reported as broken, not hidden', () => {
  const result = deriveConnections(
    StoryModel.fromSnapshot(new NovelBuilder().entry('mira').link('l', 'mira', 'ghost').build()),
  );
  expect(result.connections).toEqual([]);
  expect(result.dangling).toHaveLength(1);
  expect(result.dangling[0].missing.map((r) => r.key)).toEqual(['entry:ghost']);
});

test('text sorts as the original app does: case and accents ignored first', () => {
  const names = ['zed', 'Émile', 'bran', 'Anna', 'emile', 'Bran', '10 Kings', '#tag'];
  expect(names.sort(localeCompare)).toEqual(['#tag', '10 Kings', 'Anna', 'bran', 'Bran', 'emile', 'Émile', 'zed']);
});
