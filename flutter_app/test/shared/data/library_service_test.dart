import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/data/backup_service.dart';
import 'package:novel_builder/shared/data/database.dart';
import 'package:novel_builder/shared/data/draft_store.dart';
import 'package:novel_builder/shared/data/library_service.dart';
import 'package:novel_builder/shared/data/novel_store.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/records/novel.dart';
import 'package:novel_builder/shared/domain/snapshot/copy.dart';

import '../domain/fixtures.dart';

void main() {
  late AppDatabase db;
  late NovelStore store;
  late BackupService backups;
  late LibraryService library;
  var now = DateTime(2026, 10, 24, 12);

  setUp(() {
    db = AppDatabase.inMemory();
    store = NovelStore(db);
    backups = BackupService(store, RestorePointStore(db));
    library = LibraryService(store, backups, clock: () => now);
  });
  tearDown(() => db.close());

  test('creating a novel: details cleaned, defaults set, nothing else added', () {
    final n = library.create({
      'title': '  Ash  ',
      'targetWordCount': '90000',
      'deadline': 'soon',
      'secondaryGenres': ['Fantasy', 'Fantasy', 'Romance'],
      'primaryGenre': 'Fantasy',
    });
    expect(n.title, 'Ash');
    expect(n.targetWordCount, 90000);
    expect(n.deadline, isNull, reason: 'not a yyyy-mm-dd date');
    expect(n.secondaryGenres, ['Romance'], reason: 'duplicates and the main genre are not repeated');
    expect((n.status, n.pinned, n.archived, n.lastOpenedAt), (NovelStatus.planning, false, false, null));
    expect(library.create({}).title, 'Untitled novel');
    expect(store.load(n.id)!.collections.values.every((rows) => rows.isEmpty), isTrue, reason: 'no sample content');
  });

  test('editing details keeps every other field, known or not', () {
    store.putNovel(loadFixture('qa-sample'));
    final id = loadFixture('qa-sample').projectId;
    store.putNovelDetails(store.novel(id)!.withFields({'fromTheFuture': 1}));
    now = now.add(const Duration(minutes: 5));
    library.updateDetails(id, {'title': 'Renamed', 'author': 'R. G.'});
    final n = store.novel(id)!;
    expect((n.title, n.author, n.raw['fromTheFuture']), ('Renamed', 'R. G.', 1));
    expect(n.updatedAt, now.millisecondsSinceEpoch);
    expect(store.load(id)!.rows('loreEntries'), hasLength(13), reason: 'renaming never touches the records');
  });

  test('pinning, archiving and opening', () {
    final n = library.create({'title': 'A'});
    library.setPinned(n.id, true);
    expect(store.novel(n.id)!.pinned, isTrue);
    library.setArchived(n.id, true);
    expect((store.novel(n.id)!.archived, store.novel(n.id)!.pinned), (true, false), reason: 'archiving unpins');
    library.setArchived(n.id, false);
    library.markOpened(n.id);
    expect(store.novel(n.id)!.lastOpenedAt, now.millisecondsSinceEpoch);
  });

  test('titles of copies are unique', () {
    library.create({'title': 'Ash'});
    expect(library.uniqueTitle('Ash'), 'Ash 2');
    expect(library.uniqueTitle('Ember'), 'Ember');
  });

  group('duplicates are separate novels', () {
    test('new ids for everything, isolated in both directions', () {
      final source = loadFixture('qa-sample');
      store.putNovel(source);
      final copy = library.duplicate(source.projectId);
      expect(copy.title, '${source.project['title']} (Copy)');
      expect(library.duplicate(source.projectId).title, '${source.project['title']} (Copy) 2');
      final copied = store.load(copy.id)!;
      expect(foreignReferences(source, copied), isEmpty);

      // Changing the copy leaves the original alone, and deleting the original leaves the copy whole.
      final entry = copied.rows('loreEntries').first;
      store.saveChanges(copied, copied.putRow('loreEntries', {...entry, 'name': 'Only in the copy'}));
      expect(store.load(source.projectId)!.rows('loreEntries').first['name'], source.rows('loreEntries').first['name']);
      library.delete(source.projectId);
      expect(store.load(copy.id)!.rows('loreEntries'), hasLength(13));
    });

    test('a backup of a novel already here can be imported as a copy beside it', () {
      store.putNovel(loadFixture('qa-sample'));
      final preview = backups.previewImport(jsonEncode(fixtureJson('qa-sample')));
      expect(preview.existing, isNotNull);
      final copy = library.importAsCopy(preview);
      expect(store.listNovels(), hasLength(2));
      expect(copy.title, '${preview.title} 2');
      expect(foreignReferences(preview.snapshot, store.load(copy.id)!), isEmpty);
    });

    test('a new novel can start from another\'s setup', () {
      store.putNovel(loadFixture('made-in-the-app'));
      final n = library.create({'title': 'Book Two'}, setupFrom: loadFixture('made-in-the-app').projectId);
      final s = store.load(n.id)!;
      expect(s.rows('loreSchemas'), hasLength(51));
      expect(s.rows('chapters'), isEmpty);
      expect(() => library.create({'title': 'X'}, setupFrom: 'gone'), throwsStateError);
    });
  });

  test('deleting keeps a restore point first, and can be undone', () {
    final source = loadFixture('made-in-the-app');
    store.putNovel(source);
    final kept = library.delete(source.projectId);
    expect(store.listNovels(), isEmpty);
    library.undoDelete(kept);
    final back = store.load(source.projectId)!;
    expect(jsonEquals(back.toJson(exportedAt: 0), source.toJson(exportedAt: 0)), isTrue);
    expect(() => library.delete('gone'), throwsStateError, reason: 'nothing to delete, nothing deleted');
  });

  test('library statistics are counted from the records', () {
    store.putNovel(loadFixture('qa-sample'));
    final s = loadFixture('qa-sample');
    final stats = store.stats()[s.projectId]!;
    final chapters = s.rows('chapters');
    expect(stats.words, chapters.fold<num>(0, (n, r) => n + ((r['wordCount'] as num?) ?? 0)));
    expect(stats.chapters, chapters.where((r) => r['kind'] == 'chapter').length);
    expect(stats.characters, s.rows('loreEntries').where((r) => r['category'] == 'character').length);
    expect(stats.events, 7);
  });

  test('novel details from an imported file are cleaned the same way as the form', () {
    final clean = normalizeNovelDetails({
      'title': '',
      'genre': 'Horror',
      'status': 'unknown',
      'accent': 'red',
      'cover': 'javascript:x',
    });
    expect(clean['title'], 'Untitled novel');
    expect(clean['primaryGenre'], 'Horror', reason: 'the original app\'s pre-v2 single genre');
    expect(clean['status'], 'planning');
    expect(clean['accent'], novelAccents.first);
    expect(clean['cover'], isNull);
  });
}
