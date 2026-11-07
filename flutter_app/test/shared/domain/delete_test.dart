import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/model/connections.dart';
import 'package:novel_builder/shared/domain/model/delete_policy.dart';
import 'package:novel_builder/shared/domain/model/entity_ref.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';

import 'builder.dart';
import 'fixtures.dart';

NovelSnapshot _story() =>
    (NovelBuilder()
          ..node('book', kind: 'volume')
          ..node('ch1', parent: 'book')
          ..node('sc1', kind: 'scene', parent: 'ch1')
          ..node('ch2', parent: 'book', order: 1)
          ..row('chapterContents', {'id': 'sc1', 'doc': <String, Object?>{}})
          ..row('chapterPlans', {
            'id': 'ch1',
            'entityIds': ['mira'],
          })
          ..entry('mira')
          ..entry('orrin')
          ..entry('sword', category: 'item')
          ..link('l1', 'mira', 'orrin')
          ..link('l2', 'sword', 'ch1', toType: 'node')
          ..relation('r', 'mira', 'orrin', [stage('s')])
          ..link('l3', 'r', 'orrin', fromType: 'relation')
          ..event('siege', characters: ['mira'], nodeIds: ['sc1'], threadIds: ['t1'])
          ..thread('t1', characterIds: ['mira'])
          ..thread(
            't2',
            beats: [
              {
                'id': 'b',
                'nodeId': 'ch2',
                'title': 'Cross',
                'role': 'intersection',
                'withThreadIds': ['t1'],
              },
            ],
          )
          ..journey('j', travellers: ['mira', 'orrin'], from: 'mira', via: ['mira', 'sword'])
          ..row('progressChanges', {
            'id': 'pc',
            'entryId': 'orrin',
            'categoryId': 'c',
            'action': 'gain',
            'refId': 'mira',
          })
          ..row('progressChanges', {'id': 'pc2', 'entryId': 'mira', 'categoryId': 'c', 'action': 'gain'})
          ..row('worldMaps', {'id': 'map', 'placeId': 'mira'}))
        .build();

List<String> _ids(NovelSnapshot s, String c) => [for (final r in s.rows(c)) str(r['id'])];

void main() {
  test('deleting a character: links and relationships go; journeys and maps keep the rest; events report it', () {
    final before = _story();
    final outcome = planDelete(before, const EntityRef(EntityType.entry, 'mira'));
    final s = outcome.snapshot;
    expect(_ids(s, 'loreEntries'), ['orrin', 'sword']);
    expect(_ids(s, 'loreLinks'), ['l2'], reason: 'l1 joined mira; l3 joined her relationship');
    expect(_ids(s, 'characterRelations'), isEmpty);
    expect(_ids(s, 'progressChanges'), ['pc'], reason: 'pc2 was about her');
    final journey = s.rows('journeys').single;
    expect(journey['travellerIds'], ['orrin']);
    expect(journey['fromId'], isNull);
    expect(journey['via'], ['sword']);
    expect(s.rows('progressChanges').single['refId'], isNull, reason: 'the change keeps its words, stops linking');
    expect(s.rows('worldMaps').single['placeId'], isNull);
    // The other end is never modified.
    expect(jsonEquals(s.rows('loreEntries').first, before.rows('loreEntries')[1]), isTrue);
    // What still names her is not quietly edited: it is reported as broken.
    final broken = {for (final d in outcome.unresolved) d.connection.kind};
    expect(broken, containsAll([ConnectionKind.participant, ConnectionKind.present, ConnectionKind.threadEntry]));
    expect(outcome.detached.map((e) => e.collection).toSet(), {'journeys', 'worldMaps', 'progressChanges'});
    // Nothing happens until the outcome is stored.
    expect(_ids(before, 'loreEntries'), ['mira', 'orrin', 'sword']);
  });

  test('deleting a chapter takes its scenes, their text and plans, and their links', () {
    final s = planDelete(_story(), const EntityRef(EntityType.node, 'ch1')).snapshot;
    expect(_ids(s, 'chapters'), ['book', 'ch2']);
    expect(_ids(s, 'chapterContents'), isEmpty);
    expect(_ids(s, 'chapterPlans'), isEmpty);
    expect(_ids(s, 'loreLinks'), ['l1', 'l3']);
  });

  test('deleting a thread takes it out of events and other threads\' intersections', () {
    final s = planDelete(_story(), const EntityRef(EntityType.thread, 't1')).snapshot;
    expect(s.rows('timelineEvents').single['threadIds'], isEmpty);
    expect(maps(s.rows('plotThreads').single['beats']).single['withThreadIds'], isEmpty);
  });

  test('deleting an event leaves events that relied on it flagged, not changed', () {
    final before =
        (NovelBuilder()
              ..event('siege', when: year(10))
              ..event('after', afterId: 'siege'))
            .build();
    final outcome = planDelete(before, const EntityRef(EntityType.event, 'siege'));
    expect(outcome.snapshot.rows('timelineEvents').single['afterId'], 'siege');
    expect(outcome.unresolved.single.connection.kind, ConnectionKind.follows);
  });

  test('deleting an ability removes the item and its links; sheets holding it are reported', () {
    final s = loadFixture('qa-sample');
    final sheet = s.rows('systemSheets').firstWhere((r) => strings(r['itemIds']).isNotEmpty);
    final target = EntityRef(EntityType.ability, '${sheet['systemId']}/${strings(sheet['itemIds']).first}');
    final outcome = planDelete(s, target);
    expect(outcome.removed.any((e) => e.collection == 'systems'), isTrue);
    expect(outcome.unresolved.any((d) => d.connection.kind == ConnectionKind.holds), isTrue);
  });

  test('deleting something that is not there is an error, not a silent no-op', () {
    expect(() => planDelete(_story(), const EntityRef(EntityType.entry, 'ghost')), throwsStateError);
  });
}
