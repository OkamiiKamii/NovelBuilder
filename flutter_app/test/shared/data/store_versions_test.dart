import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/data/database.dart';
import 'package:novel_builder/shared/data/novel_store.dart';

import '../domain/fixtures.dart';

/// The store's count of writes, by novel and collection (`NovelStore.versionOf`): what lets work made from some
/// collections be kept until one of them is written.
void main() {
  late AppDatabase db;
  late NovelStore store;
  setUp(() {
    db = AppDatabase.inMemory();
    store = NovelStore(db);
  });
  tearDown(() => db.close());

  test('moves when one of its collections is written, and only then', () {
    final s = loadFixture(fixtureNames.first);
    store.putNovel(s);
    final id = s.projectId;
    final cast = store.versionOf(id, {'loreEntries', 'characterProfiles', 'project'});
    final text = store.versionOf(id, {'chapterContents'});

    store.writeRows(id, [
      RowWrite.put('chapterContents', {'id': 'c-new', 'doc': <String, Object?>{}}),
    ]);
    expect(
      store.versionOf(id, {'loreEntries', 'characterProfiles', 'project'}),
      cast,
      reason: 'a chapter written (the novel’s time touched too): not the cast',
    );
    expect(store.versionOf(id, {'chapterContents'}), greaterThan(text));

    store.writeRows(id, [
      RowWrite.put('loreEntries', {'id': 'e-new', 'name': 'Mark', 'category': 'character'}),
    ]);
    expect(store.versionOf(id, {'loreEntries', 'characterProfiles', 'project'}), greaterThan(cast));

    final before = store.load(id)!;
    final after = before.copyWith(project: {...before.project, 'title': 'Another'});
    final project = store.versionOf(id, {'project'});
    store.saveChanges(before, after);
    expect(store.versionOf(id, {'project'}), greaterThan(project), reason: 'the novel’s own row');
  });

  test('a write refused moves nothing; a novel stored anew or deleted moves everything of it', () {
    final s = loadFixture(fixtureNames.first);
    store.putNovel(s);
    final id = s.projectId;
    final was = store.versionOf(id, {'loreEntries'});
    expect(
      () => store.writeRows(id, [
        RowWrite.put('loreEntries', {'id': 'e-x', 'name': 'X'}, expect: {'id': 'e-x', 'name': 'not what is stored'}),
      ]),
      throwsA(isA<StaleWriteException>()),
    );
    expect(store.versionOf(id, {'loreEntries'}), was);

    store.putNovel(s);
    expect(store.versionOf(id, {'anything'}), greaterThan(0));
    final now = store.versionOf(id, {'loreEntries'});
    store.deleteNovel(id);
    expect(store.versionOf(id, {'loreEntries'}), greaterThan(now));
  });
}
