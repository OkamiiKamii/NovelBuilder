import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/data/backup_service.dart';
import 'package:novel_builder/shared/data/database.dart';
import 'package:novel_builder/shared/data/draft_store.dart';
import 'package:novel_builder/shared/data/novel_store.dart';
import 'package:novel_builder/shared/data/settings_store.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/model/delete_policy.dart';
import 'package:novel_builder/shared/domain/model/entity_ref.dart';
import 'package:novel_builder/shared/domain/records/novel.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';

import '../domain/fixtures.dart';

/// The same novel: every record and field. The file's export time is not part of the novel.
bool sameNovel(NovelSnapshot a, NovelSnapshot b) => jsonEquals(a.toJson(exportedAt: 0), b.toJson(exportedAt: 0));

void main() {
  late AppDatabase db;
  late NovelStore store;
  late RestorePointStore points;
  late BackupService backups;

  setUp(() {
    db = AppDatabase.inMemory();
    store = NovelStore(db);
    points = RestorePointStore(db);
    backups = BackupService(store, points);
  });
  tearDown(() => db.close());

  group('a novel round-trips through the library unchanged', () {
    for (final name in fixtureNames) {
      test(name, () {
        final original = loadFixture(name);
        store.putNovel(original);
        final loaded = store.load(original.projectId)!;
        expect(sameNovel(loaded, original), isTrue);
      });
    }

    test('unknown fields, unknown collections and unused collections are all kept', () {
      final s = NovelSnapshot(
        project: {'id': 'p', 'title': 'T', 'fromTheFuture': 1},
        collections: {
          'loreEntries': [
            {
              'id': 'e',
              'name': 'Mira',
              'newField': [1, 2],
            },
          ],
          'starCharts': [
            {'id': 's', 'stars': 9},
          ],
          'brainstorms': [
            {'id': 'b', 'prompt': 'kept'},
          ],
        },
        extra: {'topLevel': true},
      );
      store.putNovel(s);
      expect(sameNovel(store.load('p')!, s), isTrue);
    });
  });

  test('novels are isolated: each loads only its own records', () {
    store.putNovel(loadFixture('qa-sample'));
    store.putNovel(loadFixture('made-in-the-app'));
    final a = store.load(loadFixture('qa-sample').projectId)!;
    expect(a.rows('loreEntries'), hasLength(13));
    expect(store.listNovels(), hasLength(2));
    store.deleteNovel(a.projectId);
    expect(store.listNovels(), hasLength(1));
    expect(store.load(loadFixture('made-in-the-app').projectId)!.rows('loreEntries'), hasLength(51));
  });

  test('saving changes writes only what changed, in order, in one transaction', () {
    final original = loadFixture('qa-sample');
    store.putNovel(original);
    final entry = original.rows('loreEntries').first;
    final changed = original.putRow('loreEntries', {...entry, 'name': 'Renamed'}).putRow('loreEntries', {
      'id': 'new',
      'projectId': original.projectId,
      'category': 'item',
      'name': 'Sword',
    });
    store.saveChanges(original, changed);
    final loaded = store.load(original.projectId)!;
    expect(loaded.rows('loreEntries').first['name'], 'Renamed');
    expect(loaded.rows('loreEntries').last['id'], 'new', reason: 'new rows go after the existing ones');
    expect(sameNovel(loaded, changed), isTrue);
  });

  test('a delete outcome is saved whole', () {
    final original = loadFixture('qa-sample');
    store.putNovel(original);
    final character = original.rows('loreEntries').firstWhere((r) => r['category'] == 'character');
    final outcome = planDelete(original, EntityRef(EntityType.entry, character['id']! as String));
    store.saveChanges(original, outcome.snapshot);
    expect(sameNovel(store.load(original.projectId)!, outcome.snapshot), isTrue);
  });

  test('a save based on an out-of-date copy is refused, and the newer version kept', () {
    final original = loadFixture('qa-sample');
    store.putNovel(original);
    final entry = original.rows('loreEntries').first;
    // Someone else saves first.
    final first = original.putRow('loreEntries', {...entry, 'name': 'First'});
    store.saveChanges(original, first);
    // A second change made from the old copy.
    final second = original.putRow('loreEntries', {...entry, 'name': 'Second'});
    expect(() => store.saveChanges(original, second), throwsA(isA<StaleWriteException>()));
    expect(store.load(original.projectId)!.rows('loreEntries').first['name'], 'First');
  });

  test('changing the novel\'s details keeps fields this version does not know', () {
    store.putNovel(NovelSnapshot(project: {'id': 'p', 'title': 'Old', 'future': 'kept'}, collections: const {}));
    store.putNovelDetails(store.novel('p')!.withFields({'title': 'New'}));
    expect(store.novel('p')!.raw, {'id': 'p', 'title': 'New', 'future': 'kept'});
    expect(() => store.putNovelDetails(Novel({'id': 'missing'})), throwsA(isA<StaleWriteException>()));
  });

  group('backup and restore', () {
    test('an exported backup restores the novel exactly in another library', () {
      store.putNovel(loadFixture('made-in-the-app'));
      final text = backups.exportBackup(loadFixture('made-in-the-app').projectId);
      expect((jsonDecode(text) as JsonMap)['format'], NovelSnapshot.format);

      final other = AppDatabase.inMemory();
      final otherStore = NovelStore(other);
      final otherBackups = BackupService(otherStore, RestorePointStore(other));
      final preview = otherBackups.previewImport(text);
      expect(preview.existing, isNull);
      expect(otherBackups.importBackup(preview), isNull);
      final restored = otherStore.load(preview.snapshot.projectId)!;
      expect(
        jsonEquals(restored.toJson()['collections'], loadFixture('made-in-the-app').toJson()['collections']),
        isTrue,
      );
      other.close();
    });

    test('importing over a stored novel keeps a restore point, and restoring it brings the novel back', () {
      final original = loadFixture('qa-sample');
      store.putNovel(original);
      final edited = original.putRow('loreEntries', {
        ...original.rows('loreEntries').first,
        'name': 'Edited in a backup',
      });
      final preview = backups.previewImport(jsonEncode(edited.toJson()));
      expect(preview.existing!.id, original.projectId);
      final kept = backups.importBackup(preview)!;
      expect(store.load(original.projectId)!.rows('loreEntries').first['name'], 'Edited in a backup');

      backups.restore(kept);
      expect(sameNovel(store.load(original.projectId)!, original), isTrue);
      // Restoring is itself undoable: the replaced version became a restore point.
      expect(points.list(projectId: original.projectId), hasLength(2));
    });

    test('a file that cannot be read changes nothing', () {
      store.putNovel(loadFixture('qa-sample'));
      final before = store.load(loadFixture('qa-sample').projectId)!.toJson();
      expect(() => backups.previewImport('not json'), throwsA(isA<SnapshotException>()));
      expect(
        () => backups.previewImport(
          jsonEncode({
            'format': NovelSnapshot.format,
            'version': 99,
            'project': {'id': 'x'},
          }),
        ),
        throwsA(isA<SnapshotException>().having((e) => e.reason, 'reason', contains('newer version'))),
      );
      expect(jsonEquals(store.load(loadFixture('qa-sample').projectId)!.toJson(), before), isTrue);
      expect(store.listNovels(), hasLength(1));
    });

    test('restore points outlive a deleted novel, so it can be brought back', () {
      final s = loadFixture('qa-sample');
      store.putNovel(s);
      final kept = backups.keepRestorePoint(s.projectId, 'Before deleting it')!;
      store.deleteNovel(s.projectId);
      expect(store.listNovels(), isEmpty);
      backups.restore(kept);
      expect(store.load(s.projectId)!.rows('chapters'), hasLength(10));
    });

    test('only the most recent restore points of each novel are kept', () {
      final few = RestorePointStore(db, keepPerNovel: 2);
      for (var i = 0; i < 4; i++) {
        few.add(
          'rp$i',
          {
            'project': {'id': 'p', 'title': 'T$i'},
          },
          title: 'T$i',
          reason: 'test',
        );
      }
      expect([for (final p in few.list()) p.id], ['rp3', 'rp2']);
    });

    test('backup file names are safe on every system', () {
      expect(
        BackupService.fileNameFor(Novel({'id': 'x', 'title': 'Ash/Ember: "Book 1"?'})),
        'AshEmber Book 1.novel.json',
      );
      expect(BackupService.fileNameFor(Novel({'id': 'x', 'title': '  '})), 'Untitled novel.novel.json');
    });
  });

  group('drafts and settings', () {
    test('an unsaved draft survives a restart and is offered back, until discarded', () {
      store.putNovel(NovelSnapshot(project: {'id': 'p', 'title': 'T'}, collections: const {}));
      final drafts = DraftStore(db)..put('p', 'chapter:1', {'text': 'Unsaved words'}, baseRev: 3);
      final draft = drafts.get('p', 'chapter:1')!;
      expect(draft.value, {'text': 'Unsaved words'});
      expect(draft.baseRev, 3);
      expect(drafts.leftIn('p'), hasLength(1));
      drafts.discard('p', 'chapter:1');
      expect(drafts.leftIn('p'), isEmpty);
    });

    test('settings are stored as JSON; a damaged value reads as unset', () {
      final settings = SettingsStore(db)..write('appearance.theme', 'dark');
      expect(settings.read('appearance.theme'), 'dark');
      db.raw.execute("UPDATE settings SET json = '{broken' WHERE key = 'appearance.theme'");
      expect(settings.read('appearance.theme'), isNull);
      expect(settings.read('never.set'), isNull);
    });
  });
}
