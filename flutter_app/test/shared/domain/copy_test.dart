import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/model/connections.dart';
import 'package:novel_builder/shared/domain/model/query.dart';
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:novel_builder/shared/domain/snapshot/copy.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';

import 'fixtures.dart';

/// What a novel looks like without its ids: every connection's kind and wording, broken links, record names.
Map<String, Object?> shape(NovelSnapshot s) {
  final model = StoryModel.fromSnapshot(s);
  final derived = deriveConnections(model);
  return {
    'connections': [for (final c in derived.connections) '${c.kind.key}|${c.label}|${c.reverseLabel}|${c.directed}']
      ..sort(),
    'dangling': derived.dangling.length,
    'labels': [for (final v in select(model, const Filter()).items) '${v.ref.type.name}|${v.label}|${v.kind}'],
    'chapters': [for (final c in model.order.chapters) c.title],
    'counts': {for (final e in s.collections.entries) e.key: e.value.length},
  };
}

void main() {
  for (final name in fixtureNames) {
    group('copying $name', () {
      late NovelSnapshot source;
      late NovelSnapshot copy;
      setUp(() {
        source = loadFixture(name);
        copy = copyNovel(source, title: 'The copy', now: 1);
      });

      test('shares no id with the original: no reference points back into it', () {
        expect(foreignReferences(source, copy), isEmpty);
        expect(copy.projectId, isNot(source.projectId));
        for (final rows in copy.collections.values) {
          for (final r in rows) {
            expect(r['projectId'], copy.projectId);
          }
        }
      });

      test('is the same novel: every connection, broken link, name and chapter, in the same order', () {
        expect(jsonEquals(shape(copy), shape(source)), isTrue);
      });

      test('keeps the order rows are listed in by id', () {
        for (final e in source.collections.entries) {
          List<int> rank(List<JsonMap> rows) {
            final ids = [for (final r in rows) r['id']! as String];
            final sorted = [...ids]..sort();
            return [for (final id in ids) sorted.indexOf(id)];
          }

          expect(rank(copy.rows(e.key)), rank(e.value), reason: e.key);
        }
      });

      test('leaves the prose exactly as written', () {
        List<String> texts(Object? doc) => switch (doc) {
          final Map<Object?, Object?> m => [if (m['type'] == 'text') '${m['text']}', ...texts(m['content'])],
          final List<Object?> l => [for (final x in l) ...texts(x)],
          _ => const [],
        };
        final before = [for (final r in source.rows('chapterContents')) ...texts(r['doc'])];
        final after = [for (final r in copy.rows('chapterContents')) ...texts(r['doc'])];
        expect(after, before);
        expect(before, isNotEmpty);
      });

      test('copying the copy works the same way', () {
        final again = copyNovel(copy, title: 'Again', now: 2);
        expect(foreignReferences(copy, again), isEmpty);
        expect(foreignReferences(source, again), isEmpty);
        expect(jsonEquals(shape(again), shape(source)), isTrue);
      });
    });
  }

  test('ids are replaced wherever they appear: values, lists, keys, composite references, unknown fields', () {
    final source = NovelSnapshot(
      project: {'id': 'p0000000-0000-4000-8000-000000000000', 'title': 'T', 'genre': 'retired', 'future': 'kept'},
      collections: {
        'loreEntries': [
          {'id': 'aaaaaaaa-0000-4000-8000-000000000001', 'name': 'Mira'},
          {'id': 'aaaaaaaa-0000-4000-8000-000000000002', 'name': 'Orrin'},
        ],
        'systems': [
          {
            'id': 'x-cultivation',
            'items': [
              {'id': 'fire', 'name': 'Fire Palm'},
            ],
          },
        ],
        'starCharts': [
          {
            'id': 'bbbbbbbb-0000-4000-8000-000000000001',
            'about': 'aaaaaaaa-0000-4000-8000-000000000001',
            'many': ['aaaaaaaa-0000-4000-8000-000000000002'],
            'byId': {'aaaaaaaa-0000-4000-8000-000000000001': 'trusted'},
            'refKey': 'entry:aaaaaaaa-0000-4000-8000-000000000002',
            'ability': 'x-cultivation/fire',
            'lines': 'aaaaaaaa-0000-4000-8000-000000000001\naaaaaaaa-0000-4000-8000-000000000002',
            'doc': {
              'type': 'doc',
              'content': [
                {
                  'type': 'text',
                  'text': 'She wrote aaaaaaaa-0000-4000-8000-000000000001 on the wall.',
                  'marks': [
                    {
                      'type': 'entityLink',
                      'attrs': {'entryId': 'aaaaaaaa-0000-4000-8000-000000000001'},
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    );
    var n = 0;
    final copy = copyNovel(source, title: 'C', now: 1, createId: () => 'new-${(n++).toString().padLeft(2, '0')}');
    final row = copy.rows('starCharts').single;
    final ids = {for (final r in copy.rows('loreEntries')) r['name']: r['id']};
    final systemId = copy.rows('systems').single['id'];
    expect(row['about'], ids['Mira']);
    expect(row['many'], [ids['Orrin']]);
    expect((row['byId']! as JsonMap).keys, [ids['Mira']]);
    expect(row['refKey'], 'entry:${ids['Orrin']}');
    expect(row['ability'], '$systemId/fire', reason: 'the blueprint is new; the item inside keeps its own id');
    expect(row['lines'], '${ids['Mira']}\n${ids['Orrin']}');
    final text = (((row['doc']! as JsonMap)['content']! as List).single as JsonMap);
    expect(
      text['text'],
      'She wrote aaaaaaaa-0000-4000-8000-000000000001 on the wall.',
      reason: 'prose is never changed',
    );
    expect((((text['marks']! as List).single as JsonMap)['attrs']! as JsonMap)['entryId'], ids['Mira']);
    expect(copy.project['future'], 'kept');
    expect(copy.project.containsKey('genre'), isFalse);
    expect((copy.project['pinned'], copy.project['archived'], copy.project['lastOpenedAt']), (false, false, null));
  });

  test('a duplicate leaves version history with the original', () {
    final source = loadFixture('made-in-the-app');
    expect(source.rows('chapterRevisions'), isNotEmpty);
    final copy = duplicateNovel(source, title: 'Dup', now: 1);
    expect(copy.rows('chapterRevisions'), isEmpty);
    expect(copy.rows('chapters'), hasLength(source.rows('chapters').length));
  });

  test('a new novel from another\'s setup takes its organisation, none of its story', () {
    final source = loadFixture('made-in-the-app');
    final fresh = setupOf(source, {'title': 'Book Two', 'status': 'planning'}, now: 1);
    expect(fresh.project['title'], 'Book Two');
    expect(
      {
        for (final e in fresh.collections.entries)
          if (e.value.isNotEmpty) e.key,
      },
      {
        for (final c in setupCollections)
          if (source.rows(c).isNotEmpty) c,
      },
    );
    expect(fresh.rows('chapters'), isEmpty);
    expect(fresh.rows('loreEntries'), isEmpty);
    expect(fresh.rows('progressCategories').every((r) => (r['characterIds']! as List).isEmpty), isTrue);
    expect(foreignReferences(source, fresh), isEmpty);
  });
}
