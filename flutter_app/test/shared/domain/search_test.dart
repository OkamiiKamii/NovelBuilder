// Search across the whole novel, ported: agreement with the original app (tool/golden/search.test.ts) on the blocks
// every chapter and codex entry becomes, and on the results of every query in every scope (groups, order, counts and
// the passages shown).
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/codex/codex_changes.dart' show categoriesOf;
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/records/category.dart';
import 'package:novel_builder/shared/domain/records/entry.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:novel_builder/shared/domain/search/search.dart';

import 'fixtures.dart';
import 'golden.dart';

List<SearchBlock> blocksOf(String name) {
  final s = loadFixture(name);
  final docs = {for (final r in s.rows('chapterContents')) str(r['id']): r['doc']};
  final plans = {for (final r in s.rows('chapterPlans')) str(r['id']): r};
  final categories = categoriesOf(s);
  final names = {for (final r in s.rows('loreEntries')) str(r['id']): str(r['name'])};
  return [
    for (final r in s.rows('chapters')) ...nodeBlocks(StoryNode(r), docs[r['id']], plans[r['id']]),
    for (final r in s.rows('loreEntries'))
      ...entryBlocks(Entry(r), categories[r['category']] ?? Category.unknown(str(r['category'])), (id) => names[id]),
  ];
}

JsonMap _block(SearchBlock b) => {
  'id': b.id,
  'entityType': b.entityType.name,
  'entityId': b.entityId,
  'entityTitle': b.entityTitle,
  'entityKind': b.entityKind,
  'group': b.group,
  'field': b.field.name,
  'label': b.label,
  'index': b.index,
  'text': b.text,
};

JsonMap _result(GroupResult g) => {
  'group': g.group,
  'matchCount': g.matchCount,
  'items': [
    for (final e in g.items)
      {
        'entityType': e.entityType.name,
        'entityId': e.entityId,
        'title': e.title,
        'kind': e.kind,
        'group': e.group,
        'matchCount': e.matchCount,
        'snippets': [
          for (final s in e.snippets)
            {
              'blockId': s.blockId,
              'field': s.field.name,
              'label': s.label,
              'index': s.index,
              'before': s.before,
              'parts': [
                for (final p in s.parts) {'text': p.text, 'hit': p.hit},
              ],
              'after': s.after,
              'term': s.term,
            },
        ],
      },
  ],
};

void main() {
  final golden = readGolden('search.golden.json');

  for (final name in golden.keys) {
    test('$name: the same blocks, and the same results for every query in every scope', () {
      final expected = mapOrNull(golden[name])!;
      final blocks = blocksOf(name);
      // The original's blocks carry the project id; the rest must match exactly.
      expectJson(
        [for (final b in blocks) _block(b)],
        [
          for (final b in maps(expected['blocks']))
            {
              for (final e in b.entries)
                if (e.key != 'projectId') e.key: e.value,
            },
        ],
        '$name blocks',
      );
      final index = SearchIndex(blocks);
      var withResults = 0;
      for (final e in mapOrNull(expected['results'])!.entries) {
        final at = e.key.indexOf('|');
        final scope = SearchScope.values.byName(e.key.substring(0, at));
        final query = e.key.substring(at + 1);
        final found = index.search(query, scope);
        expectJson([for (final g in found) _result(g)], e.value, '$name ${e.key}');
        if (found.isNotEmpty) withResults++;
      }
      expect(withResults, greaterThan(20), reason: 'real matches are compared, not only misses');
    });
  }
}
