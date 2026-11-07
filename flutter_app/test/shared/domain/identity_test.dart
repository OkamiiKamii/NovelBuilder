import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/ids.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/model/connections.dart';
import 'package:novel_builder/shared/domain/model/entity_ref.dart';
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:novel_builder/shared/domain/model/validity.dart';
import 'package:novel_builder/shared/domain/records/entry.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';

import 'builder.dart';

NovelSnapshot _story() {
  final b = NovelBuilder()
    ..node('book', kind: 'volume')
    ..node('ch1', parent: 'book', order: 0, mentions: ['mira'])
    ..node('ch2', parent: 'book', order: 1)
    ..node('ch3', parent: 'book', order: 2)
    ..entry('mira')
    ..entry('orrin')
    ..entry('keep', category: 'location')
    ..link('l1', 'mira', 'orrin', type: 'considers-rival')
    // A flashback: told in chapter 3, but happened in Year 1, before the Siege (told in chapter 1).
    ..event('siege', when: year(10), nodeIds: ['ch1'], characters: ['mira'], locationId: 'keep')
    ..event('childhood', when: year(1), nodeIds: ['ch3'], characters: ['mira', 'orrin'])
    ..relation('r1', 'mira', 'orrin', [
      stage('s1', title: 'Friends'),
      stage('s2', startNodeId: 'ch2', title: 'Rivals'),
    ]);
  return b.build();
}

Set<String> _connectionIds(NovelSnapshot s) => {
  for (final c in deriveConnections(StoryModel.fromSnapshot(s)).connections) c.id,
};

void main() {
  test('new ids are unique version-4 UUIDs', () {
    final ids = {for (var i = 0; i < 1000; i++) newId()};
    expect(ids, hasLength(1000));
    expect(
      ids.every((id) => RegExp(r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$').hasMatch(id)),
      isTrue,
    );
  });

  test('renaming records keeps every id and connection, and shows the new name', () {
    final before = _story();
    final renamedNode = StoryNode(before.rows('chapters').firstWhere((r) => r['id'] == 'ch1')).renamed('The Siege');
    final renamedEntry = Entry(before.rows('loreEntries').firstWhere((r) => r['id'] == 'mira')).renamed('Mira Vale');
    final after = before.putRow('chapters', renamedNode.toJson()).putRow('loreEntries', renamedEntry.toJson());

    expect(_connectionIds(after), _connectionIds(before));
    final model = StoryModel.fromSnapshot(after);
    expect(model.resolve(const EntityRef(EntityType.node, 'ch1'))!.label, 'The Siege');
    expect(model.resolve(const EntityRef(EntityType.entry, 'mira'))!.label, 'Mira Vale');
    expect(deriveConnections(model).dangling, isEmpty);
    // A relationship's label follows the renamed character, because it reads the name from the entry each time.
    expect(model.resolve(const EntityRef(EntityType.relation, 'r1'))!.label, 'Mira Vale and orrin');
  });

  test('reordering chapters changes reading order only: links and story chronology are untouched', () {
    final before = _story();
    final beforeModel = StoryModel.fromSnapshot(before);
    // Move chapter 3 to the front.
    final moved = StoryNode(
      before.rows('chapters').firstWhere((r) => r['id'] == 'ch3'),
    ).movedTo(parentId: 'book', order: -1);
    final after = before.putRow('chapters', moved.toJson());
    final model = StoryModel.fromSnapshot(after);

    expect([for (final c in model.order.chapters) c.id], ['ch3', 'ch1', 'ch2']);
    expect(_connectionIds(after), _connectionIds(before));
    // When events happen did not move.
    for (final id in ['siege', 'childhood']) {
      expect(spanOfEvent(id, model.timeContext), spanOfEvent(id, beforeModel.timeContext));
    }
    // Only parentId and order changed on the moved node.
    final old = before.rows('chapters').firstWhere((r) => r['id'] == 'ch3');
    final changed = {
      for (final k in moved.raw.keys)
        if (!jsonEquals(moved.raw[k], old[k])) k,
    };
    expect(changed, {'order'});
  });

  test('moving a scene to another chapter keeps its id and what points at it', () {
    final b = NovelBuilder()
      ..node('ch1')
      ..node('ch2', order: 1)
      ..node('sc', kind: 'scene', parent: 'ch1')
      ..event('e', nodeIds: ['sc']);
    final before = b.build();
    final moved = StoryNode(before.rows('chapters').last).movedTo(parentId: 'ch2', order: 0);
    final model = StoryModel.fromSnapshot(before.putRow('chapters', moved.toJson()));
    expect(model.order.position['sc'], greaterThan(model.order.position['ch2']!));
    final told = deriveConnections(model).connections.where((c) => c.kind == ConnectionKind.toldIn).single;
    expect(told.to, const EntityRef(EntityType.node, 'sc'));
  });

  test('a node whose parent is missing is read at the top level, not lost', () {
    final b = NovelBuilder()
      ..node('a')
      ..node('orphan', parent: 'gone', order: 1);
    final model = StoryModel.fromSnapshot(b.build());
    expect(model.order.position.keys, containsAll(['a', 'orphan']));
  });

  test('refs round-trip through their key and JSON, and reject what is not a ref', () {
    const ref = EntityRef(EntityType.ability, 'sys/item');
    expect(EntityRef.parse(ref.key), ref);
    expect(EntityRef.fromJson(ref.toJson()), ref);
    expect(EntityRef.parse('nonsense'), isNull);
    expect(EntityRef.parse('planet:x'), isNull);
    expect(abilityId('sys', 'item'), 'sys/item');
  });
}
