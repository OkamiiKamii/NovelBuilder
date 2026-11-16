import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/write/data/manuscript_service.dart';
import 'package:novel_builder/shared/data/backup_service.dart';
import 'package:novel_builder/shared/data/database.dart';
import 'package:novel_builder/shared/data/draft_store.dart';
import 'package:novel_builder/shared/data/novel_store.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';

import '../domain/fixtures.dart';

/// A chapter's history (and its alternate drafts) is found by the chapter, through an index, not by reading every
/// chapter's: a save no longer reads the book's history. A library made before the index is given it, its copy kept.
void main() {
  late Directory dir;
  late String path;

  setUp(() {
    dir = Directory.systemTemp.createTempSync('novel_builder_history_');
    path = '${dir.path}/library/novel_builder.sqlite3';
  });
  tearDown(() => dir.deleteSync(recursive: true));

  JsonMap revision(String project, String id, String node, int at) => {
    'id': id,
    'projectId': project,
    'nodeId': node,
    'doc': textToDoc('Text of $node at $at.'),
    'capturedAt': at,
    'sourceRev': at,
    'reason': 'auto',
  };

  test('a library made before the index is given it: a copy kept first, every record as it was', () {
    final before = AppDatabase.open(path, steps: [migrations.first]);
    final store = NovelStore(before);
    final novel = loadFixture('qa-sample');
    store.putNovel(novel);
    store.writeRows(novel.projectId, [
      for (var i = 0; i < 30; i++) RowWrite.put('chapterRevisions', revision(novel.projectId, 'r$i', 'n${i % 3}', i)),
    ]);
    final rows = before.raw.select('SELECT collection, id, json FROM records ORDER BY collection, id').toList();
    before.close();

    final after = AppDatabase.open(path);
    expect(after.schemaVersion, latestSchemaVersion);
    expect(latestSchemaVersion, greaterThanOrEqualTo(2));
    expect(
      after.raw.select("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'records_by_node'"),
      hasLength(1),
    );
    final now = after.raw.select('SELECT collection, id, json FROM records ORDER BY collection, id').toList();
    expect(now.length, rows.length);
    for (var i = 0; i < rows.length; i++) {
      expect(now[i].values, rows[i].values, reason: 'nothing stored changes: an index is only a way to find');
    }
    expect(File('$path.before-v2').existsSync(), isTrue, reason: 'the library as it was, kept beside it');
    after.close();
  });

  test('found by the chapter: the same records, in the same order, as reading them all and keeping the chapter’s', () {
    final db = AppDatabase.inMemory();
    addTearDown(db.close);
    final store = NovelStore(db);
    final novel = loadFixture('qa-sample');
    store.putNovel(novel);
    final p = novel.projectId;
    store.writeRows(p, [
      for (var i = 0; i < 60; i++) RowWrite.put('chapterRevisions', revision(p, 'r$i', 'n${(i * 7) % 5}', 60 - i)),
      RowWrite.put('chapterRevisions', {'id': 'no-node', 'projectId': p}),
      RowWrite.put('chapterBranches', {'id': 'b1', 'projectId': p, 'nodeId': 'n2', 'createdAt': 3}),
      RowWrite.put('chapterBranches', {'id': 'b2', 'projectId': p, 'nodeId': 'n1', 'createdAt': 1}),
    ]);
    // One changed after: its place in the order is where it was first stored.
    store.writeRows(p, [RowWrite.put('chapterRevisions', revision(p, 'r4', 'n3', 99))]);
    for (final collection in ['chapterRevisions', 'chapterBranches']) {
      for (final node in ['n0', 'n1', 'n2', 'n3', 'n4', 'missing']) {
        final kept = [
          for (final r in store.rowsIn(p, collection))
            if (r['nodeId'] == node) r,
        ];
        expect(store.rowsForNode(p, collection, node).toString(), kept.toString(), reason: '$collection $node');
      }
    }
    final plan = db.raw.select(
      'EXPLAIN QUERY PLAN SELECT json, position FROM records INDEXED BY records_by_node '
      "WHERE project_id = ? AND collection = ? AND json_extract(json, '\$.nodeId') = ?",
      [p, 'chapterRevisions', 'n1'],
    );
    expect(plan.map((r) => r['detail']).join(), contains('records_by_node'), reason: 'found through the index');
  });

  test('a save keeps its chapter’s history as before, reading only that chapter’s', () {
    final db = AppDatabase.inMemory();
    addTearDown(db.close);
    final store = NovelStore(db);
    var clock = DateTime(2026, 11, 16, 9);
    final service = ManuscriptService(
      store,
      DraftStore(db),
      BackupService(store, RestorePointStore(db)),
      clock: () => clock,
    );
    final novel = loadFixture('qa-sample');
    store.putNovel(novel);
    final p = novel.projectId;
    final docs = [
      for (final r in novel.rows('chapters'))
        if (r['kind'] == 'chapter' || r['kind'] == 'scene') str(r['id']),
    ];
    final one = docs.first;
    final other = docs.last;
    // Another chapter's long history, which a save of this one never reads.
    store.writeRows(p, [
      for (var i = 0; i < 40; i++) RowWrite.put('chapterRevisions', revision(p, 'other$i', other, i)),
    ]);
    for (var k = 0; k < 4; k++) {
      clock = clock.add(revisionInterval + const Duration(minutes: 1));
      service.save(p, one, textToDoc('Take $k of the first chapter.'), baseRev: service.open(p, one).rev);
    }
    final history = service.revisions(p, one);
    expect(history.length, 4, reason: 'one kept for each save after the interval, as before');
    expect(history.every((r) => r['nodeId'] == one), isTrue);
    expect(service.revisions(p, other), hasLength(40), reason: 'the other chapter’s history untouched');
  });
}
