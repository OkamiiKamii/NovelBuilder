import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/data/database.dart';
import 'package:novel_builder/shared/data/novel_store.dart';

import '../../helpers/large_novel.dart';

void main() {
  test('every collection of every book counted in one query, as counting each one does', () {
    final db = AppDatabase.inMemory();
    addTearDown(db.close);
    final store = NovelStore(db);
    final ids = <String>[];
    for (var i = 0; i < 4; i++) {
      final s = largeNovel(seed: 50 + i, volumes: 1, chaptersPerVolume: 2 + i, characters: 3 + i, events: i, links: i);
      final copy = s.copyWith(project: {...s.project, 'id': 'book$i'});
      store.putNovel(copy);
      ids.add(copy.projectId);
    }
    final counts = store.countsByCollection([...ids, 'not-a-book']);
    for (final id in ids) {
      for (final c in store.load(id)!.collections.keys) {
        expect(counts[id]?[c] ?? 0, store.countIn(id, c), reason: '$id $c');
      }
    }
    expect(counts['not-a-book'], isNull);
    expect(store.countsByCollection(const []), isEmpty);
  });
}
