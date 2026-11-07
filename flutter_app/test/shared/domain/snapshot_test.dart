import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/model/entity_ref.dart';
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:novel_builder/shared/domain/records/system.dart';
import 'package:novel_builder/shared/domain/snapshot/collections.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';

import 'fixtures.dart';

JsonMap _minimal({int version = 4, JsonMap collections = const {}}) => {
  'format': NovelSnapshot.format,
  'version': version,
  'exportedAt': 1,
  'project': {'id': 'p', 'title': 'T'},
  'collections': collections,
};

void main() {
  group('round trip of real files', () {
    for (final name in fixtureNames) {
      test('$name reads and writes back with every record and field unchanged', () {
        final original = fixtureJson(name)! as JsonMap;
        final written = loadFixture(name).toJson();
        expect(jsonEquals(written['project'], original['project']), isTrue);
        final a = original['collections']! as JsonMap;
        final b = written['collections']! as JsonMap;
        for (final key in a.keys) {
          expect(jsonEquals(b[key], a[key]), isTrue, reason: key);
        }
        // And again: reading what was written gives the same document.
        final twice = NovelSnapshot.fromJson(jsonDecode(jsonEncode(written))).toJson();
        expect(jsonEquals(twice, written), isTrue);
      });
    }

    test('every collection in the real files is a known one', () {
      for (final name in fixtureNames) {
        expect(loadFixture(name).unknownCollections, isEmpty);
      }
    });
  });

  group('nothing is silently discarded', () {
    test('unknown fields on rows, on the novel, and at the top level are kept', () {
      final json =
          _minimal(
              collections: {
                'loreEntries': [
                  {
                    'id': 'e',
                    'category': 'character',
                    'name': 'Mira',
                    'futureField': {
                      'nested': [1, 2],
                    },
                  },
                ],
              },
            )
            ..['project'] = {'id': 'p', 'title': 'T', 'newSetting': true}
            ..['futureTopLevel'] = 'kept';
      final written = NovelSnapshot.fromJson(json).toJson();
      expect(written['futureTopLevel'], 'kept');
      expect((written['project']! as JsonMap)['newSetting'], isTrue);
      final entry = ((written['collections']! as JsonMap)['loreEntries']! as List).single as JsonMap;
      expect(entry['futureField'], {
        'nested': [1, 2],
      });
    });

    test('a collection from a newer app is kept, reported, and written back', () {
      final s = NovelSnapshot.fromJson(
        _minimal(
          collections: {
            'starCharts': [
              {'id': 'x', 'stars': 3},
            ],
          },
        ),
      );
      expect(s.unknownCollections, ['starCharts']);
      expect(((s.toJson()['collections']! as JsonMap)['starCharts']! as List).single, {'id': 'x', 'stars': 3});
    });

    test('collections the app does not use (assistant, sync, team) are kept too', () {
      expect(novelCollections['brainstorms'], CollectionRole.retired);
      final s = NovelSnapshot.fromJson(
        _minimal(
          collections: {
            'brainstorms': [
              {'id': 'b', 'prompt': 'kept'},
            ],
          },
        ),
      );
      expect(s.unknownCollections, isEmpty);
      expect(((s.toJson()['collections']! as JsonMap)['brainstorms']! as List).single, {'id': 'b', 'prompt': 'kept'});
    });

    test('a record changed through its type keeps the fields it does not know', () {
      final node = StoryNode({'id': 'n', 'title': 'Old', 'kind': 'chapter', 'order': 0, 'fromTheFuture': 42});
      final renamed = node.renamed('New');
      expect(renamed.title, 'New');
      expect(renamed.raw['fromTheFuture'], 42);
      expect(node.title, 'Old', reason: 'records are immutable');
      expect(() => (node.raw as Map)['title'] = 'x', throwsUnsupportedError);
    });
  });

  group('files that cannot be read safely are refused, with a reason', () {
    void refuses(Object? json, String reason) => expect(
      () => NovelSnapshot.fromJson(json),
      throwsA(isA<SnapshotException>().having((e) => e.reason, 'reason', contains(reason))),
    );

    test('not a project file', () {
      refuses('text', 'not a JSON object');
      refuses({'format': 'something-else', 'version': 4}, 'not a Novel Builder project file');
      refuses({..._minimal(), 'version': '4'}, 'does not say which version');
    });

    test('a newer format is refused rather than misread', () {
      refuses(_minimal(version: 5), 'made by a newer version');
    });

    test('broken records stop the whole import', () {
      refuses({..._minimal(), 'project': null}, 'no novel details');
      refuses(_minimal(collections: {'chapters': 'oops'}), 'chapters are not a list');
      refuses(
        _minimal(
          collections: {
            'chapters': [
              {'title': 'no id'},
            ],
          },
        ),
        '1 record in chapters cannot be read',
      );
      refuses(
        _minimal(
          collections: {
            'chapters': [
              {'id': 'same'},
              {'id': 'same'},
            ],
          },
        ),
        'two records in chapters share the id same',
      );
    });
  });

  group('upgrades of older files', () {
    test('a version 3 file: blueprint ranks and table cells become links by id, nothing dropped', () {
      final s = NovelSnapshot.fromJson(
        _minimal(
          version: 3,
          collections: {
            'systems': [
              {
                'id': 'sys',
                'name': 'Cultivation',
                'ranks': ['Novice', 'Adept'],
                'groups': [
                  {'id': 'g', 'name': 'Skills'},
                ],
                'items': [
                  {'id': 'i1', 'groupId': 'g', 'name': 'Fire Palm', 'rank': 'Adept'},
                  {'id': 'i2', 'groupId': 'g', 'name': 'Old Art', 'rank': 'Legendary'},
                  {'id': 'i3', 'groupId': 'g', 'name': 'Plain'},
                ],
                'matrices': [
                  {
                    'id': 'm',
                    'name': 'Elements',
                    'rows': ['Fire'],
                    'columns': ['Water'],
                    'cells': {'Fire|Water': 'weak', 'Ghost|Row': 'kept'},
                  },
                ],
              },
            ],
          },
        ),
      );
      final sys = s.rows('systems').single;
      final ranks = {for (final r in maps(sys['ranks'])) r['name']: r['id']};
      expect(ranks.keys, ['Novice', 'Adept', 'Legendary'], reason: 'a rank an item names but the list lacks is added');
      final items = maps(sys['items']);
      expect(items[0]['rankId'], ranks['Adept']);
      expect(items[0].containsKey('rank'), isFalse);
      expect(items[1]['rankId'], ranks['Legendary']);
      expect(items[2]['rankId'], isNull);
      final m = maps(sys['matrices']).single;
      final rowId = maps(m['rows']).single['id'];
      final colId = maps(m['columns']).single['id'];
      expect(m['cells'], {'$rowId|$colId': 'weak', 'Ghost|Row': 'kept'});

      // Renaming the rank afterwards cannot cut the item loose: it points at the rank's id.
      final model = StoryModel.fromSnapshot(s);
      expect(model.abilities['sys/i1']!.item.rankId, ranks['Adept']);
    });

    test('upgrades are safe to run again: a current file is unchanged', () {
      final once = loadFixture('made-in-the-app');
      final twice = NovelSnapshot.fromJson(once.toJson());
      expect(jsonEquals(twice.toJson(), once.toJson()), isTrue);
      final row = once.rows('systems').first;
      expect(jsonEquals(upgradeBlueprintShape(row, createId: () => fail('no new ids needed')), row), isTrue);
    });

    test('old chapter statuses join the single pipeline', () {
      final s = NovelSnapshot.fromJson(
        _minimal(
          version: 2,
          collections: {
            'chapters': [
              {'id': 'a', 'status': 'outlining', 'publication': 'planned'},
              {'id': 'b', 'status': 'complete', 'publication': 'published'},
              {'id': 'c', 'status': 'editing'},
              {'id': 'd', 'status': 'final'},
            ],
          },
        ),
      );
      expect([for (final r in s.rows('chapters')) r['status']], ['planned', 'published', 'revising', 'final']);
      expect(s.rows('chapters').any((r) => r.containsKey('publication')), isFalse);
      expect(NodeStatus.upgrade('nonsense'), NodeStatus.idea);
    });
  });

  test('the shared model reads one record per entity and copies none', () {
    final s = loadFixture('qa-sample');
    final model = StoryModel.fromSnapshot(s);
    expect(model.entries.length, s.rows('loreEntries').length);
    expect(model.nodes.length, s.rows('chapters').length);
    // Characters, places, factions and items are all codex entries, told apart by category: one store, one link model.
    expect({for (final e in model.entries.values) e.category}, containsAll(['character', 'location']));
    expect(model.resolve(const EntityRef(EntityType.entry, 'not-there')), isNull);
  });
}
