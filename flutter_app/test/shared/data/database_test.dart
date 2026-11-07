import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/data/database.dart';
import 'package:novel_builder/shared/data/novel_store.dart';
import 'package:sqlite3/sqlite3.dart';

import '../domain/fixtures.dart';

void main() {
  late Directory dir;
  late String path;

  setUp(() {
    dir = Directory.systemTemp.createTempSync('novel_builder_db_');
    path = '${dir.path}/library/novel_builder.sqlite3';
  });
  tearDown(() => dir.deleteSync(recursive: true));

  test('a new library is created at the latest schema, with durable settings', () {
    final db = AppDatabase.open(path);
    expect(db.schemaVersion, latestSchemaVersion);
    expect(db.raw.select('PRAGMA journal_mode').single.values.first, 'wal');
    expect(db.raw.select('PRAGMA synchronous').single.values.first, 2, reason: 'FULL: committed means on disk');
    expect(db.raw.select('PRAGMA foreign_keys').single.values.first, 1);
    db.close();
  });

  test('records survive closing and reopening the library (a restart)', () {
    final first = AppDatabase.open(path);
    NovelStore(first).putNovel(loadFixture('qa-sample'));
    first.close();

    final second = AppDatabase.open(path);
    final store = NovelStore(second);
    expect(store.listNovels().single.title, loadFixture('qa-sample').project['title']);
    expect(store.load(loadFixture('qa-sample').projectId)!.rows('chapters'), hasLength(10));
    second.close();
  });

  test('a library made by a newer app is refused and left untouched', () {
    final raw = sqlite3.open(path.replaceFirst('/library', ''))
      ..execute('PRAGMA user_version = ${latestSchemaVersion + 1}')
      ..execute('CREATE TABLE future (x)');
    raw.close();
    final newer = path.replaceFirst('/library', '');
    final before = File(newer).readAsBytesSync();
    expect(
      () => AppDatabase.open(newer),
      throwsA(isA<DatabaseOpenException>().having((e) => e.reason, 'reason', contains('newer version'))),
    );
    expect(File(newer).readAsBytesSync(), before);
  });

  test('an interrupted change leaves the library as it was: all of a transaction or none of it', () {
    final db = AppDatabase.open(path);
    final store = NovelStore(db)..putNovel(loadFixture('qa-sample'));
    final id = loadFixture('qa-sample').projectId;
    final countBefore = db.raw.select('SELECT COUNT(*) AS n FROM records').single['n'];

    expect(
      () => db.transaction(() {
        db.raw.execute('DELETE FROM records WHERE project_id = ?', [id]);
        throw StateError('power cut');
      }),
      throwsStateError,
    );
    expect(db.raw.select('SELECT COUNT(*) AS n FROM records').single['n'], countBefore);
    expect(store.load(id)!.rows('loreEntries'), hasLength(13));
    db.close();
  });

  test('a write the app was killed in the middle of never reaches the file', () {
    final db = AppDatabase.open(path);
    NovelStore(db).putNovel(loadFixture('qa-sample'));
    // Begin a change and stop without committing, as if the app were killed.
    db.raw.execute('BEGIN');
    db.raw.execute('DELETE FROM records');
    db.close();

    final reopened = AppDatabase.open(path);
    expect(NovelStore(reopened).load(loadFixture('qa-sample').projectId)!.rows('chapters'), hasLength(10));
    reopened.close();
  });

  test('upgrading a library with data: a copy is kept first, nothing is lost', () {
    final v1 = AppDatabase.open(path);
    NovelStore(v1).putNovel(loadFixture('qa-sample'));
    v1.close();

    final steps = [
      ...migrations,
      (
        version: latestSchemaVersion + 1,
        name: 'test step',
        statements: ['ALTER TABLE novels ADD COLUMN pinned INTEGER'],
      ),
    ];
    final v2 = AppDatabase.open(path, steps: steps);
    expect(v2.schemaVersion, latestSchemaVersion + 1);
    expect(NovelStore(v2).listNovels(), hasLength(1));
    v2.close();
    final copy = File('$path.before-v${latestSchemaVersion + 1}');
    expect(copy.existsSync(), isTrue);
    final old = AppDatabase.open(copy.path);
    expect(old.schemaVersion, latestSchemaVersion, reason: 'the copy is the library as it was before the upgrade');
    expect(NovelStore(old).listNovels(), hasLength(1));
    old.close();
  });

  test('a failing upgrade step is rolled back: the library stays at its version with its data', () {
    final v1 = AppDatabase.open(path);
    NovelStore(v1).putNovel(loadFixture('qa-sample'));
    v1.close();
    final broken = [
      ...migrations,
      (
        version: latestSchemaVersion + 1,
        name: 'broken',
        statements: ['ALTER TABLE novels ADD COLUMN ok INTEGER', 'NOT SQL'],
      ),
    ];
    expect(() => AppDatabase.open(path, steps: broken), throwsA(isA<SqliteException>()));
    final again = AppDatabase.open(path);
    expect(again.schemaVersion, latestSchemaVersion);
    expect(again.raw.select("SELECT name FROM pragma_table_info('novels') WHERE name = 'ok'"), isEmpty);
    expect(NovelStore(again).listNovels(), hasLength(1));
    again.close();
  });

  test('schema steps are numbered without gaps', () {
    expect(migrations.map((m) => m.version), [for (var v = 1; v <= latestSchemaVersion; v++) v]);
  });
}
