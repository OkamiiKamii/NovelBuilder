import 'dart:io';

import 'package:sqlite3/sqlite3.dart';

/// Thrown when the library cannot be opened. The file is left exactly as it was.
class DatabaseOpenException implements Exception {
  DatabaseOpenException(this.reason);
  final String reason;

  @override
  String toString() => reason;
}

/// One schema step: the statements that take the database from the previous version to [version].
typedef Migration = ({int version, String name, List<String> statements});

/// The library's schema, version by version. A step is never edited once released: changes are new steps.
///
/// Records are stored whole, as the JSON they were read or written as, one row per record, so fields and collections
/// this version does not know survive saving exactly as they survive import and export. The model reads them through
/// the typed records of `shared/domain`.
const List<Migration> migrations = [
  (
    version: 1,
    name: 'library, records, settings, drafts and restore points',
    statements: [
      'CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
      // A novel's own details (the file's `project`), and anything else the file carried at its top level.
      'CREATE TABLE novels (id TEXT PRIMARY KEY, json TEXT NOT NULL, extra TEXT NOT NULL, updated_at INTEGER NOT NULL)',
      // Every other record. `position` keeps the order records were stored in, which views rely on.
      'CREATE TABLE records ('
          'project_id TEXT NOT NULL REFERENCES novels(id) ON DELETE CASCADE, '
          'collection TEXT NOT NULL, id TEXT NOT NULL, json TEXT NOT NULL, position INTEGER NOT NULL, '
          'updated_at INTEGER NOT NULL, PRIMARY KEY (project_id, collection, id)) WITHOUT ROWID',
      'CREATE INDEX records_in_order ON records (project_id, collection, position)',
      // Settings of the app itself (appearance…), not of one novel.
      'CREATE TABLE settings (key TEXT PRIMARY KEY, json TEXT NOT NULL)',
      // Crash-recovery copies of work not yet saved (text being typed). Deleted with their novel.
      'CREATE TABLE drafts ('
          'project_id TEXT NOT NULL REFERENCES novels(id) ON DELETE CASCADE, key TEXT NOT NULL, json TEXT NOT NULL, '
          'base_rev INTEGER, updated_at INTEGER NOT NULL, PRIMARY KEY (project_id, key))',
      // Whole-novel copies taken before anything replaces a novel. Not tied to the novel row: they outlive it.
      'CREATE TABLE restore_points ('
          'id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT NOT NULL, reason TEXT NOT NULL, '
          'created_at INTEGER NOT NULL, snapshot TEXT NOT NULL)',
      'CREATE INDEX restore_points_by_novel ON restore_points (project_id, created_at)',
    ],
  ),
];

int get latestSchemaVersion => migrations.last.version;

/// The app's local library: one SQLite file on this device. Nothing here talks to a network.
///
/// Every save is a transaction, and the file is opened so that a committed save is on disk before it counts as saved
/// (`synchronous = FULL` with write-ahead logging): a crash or power cut leaves either the old state or the new one,
/// never half of a change.
class AppDatabase {
  AppDatabase._(this.raw, this.path, this._steps);

  final Database raw;
  final List<Migration> _steps;

  /// Null for an in-memory database (tests).
  final String? path;

  /// Opens (and if needed creates or upgrades) the library at [path].
  ///
  /// Before upgrading an existing library, a copy of the file is kept next to it (`<file>.before-v<N>`), so a failed
  /// or unwanted upgrade can be undone by hand. A library made by a newer version of the app is refused, untouched.
  ///
  /// [steps] is the schema; tests pass their own to exercise upgrades.
  static AppDatabase open(String path, {List<Migration> steps = migrations}) {
    final latest = steps.last.version;
    final file = File(path);
    final existed = file.existsSync() && file.lengthSync() > 0;
    final Database db;
    try {
      file.parent.createSync(recursive: true);
      db = sqlite3.open(path);
    } on Object catch (e) {
      throw DatabaseOpenException('The library file could not be opened ($e).');
    }
    try {
      final version = _userVersion(db);
      if (version > latest) {
        throw DatabaseOpenException(
          'This library was saved by a newer version of Novel Builder (schema $version; this app knows up to '
          '$latest). Update the app to open it. Nothing was changed.',
        );
      }
      if (existed && version < latest && version > 0) {
        db.execute('PRAGMA wal_checkpoint(TRUNCATE)');
        file.copySync('$path.before-v$latest');
      }
      final app = AppDatabase._(db, path, steps).._configure();
      app._migrate(version);
      return app;
    } on Object {
      db.close();
      rethrow;
    }
  }

  /// A throwaway library in memory, for tests.
  static AppDatabase inMemory() {
    final app = AppDatabase._(sqlite3.openInMemory(), null, migrations).._configure();
    app._migrate(0);
    return app;
  }

  static int _userVersion(Database db) => db.select('PRAGMA user_version').single.values.first! as int;

  int get schemaVersion => _userVersion(raw);

  void _configure() {
    raw.execute('PRAGMA foreign_keys = ON');
    if (path != null) {
      raw.execute('PRAGMA journal_mode = WAL');
      raw.execute('PRAGMA synchronous = FULL');
    }
  }

  void _migrate(int from) {
    for (final step in _steps.where((m) => m.version > from)) {
      transaction(() {
        for (final sql in step.statements) {
          raw.execute(sql);
        }
        raw.execute('PRAGMA user_version = ${step.version}');
      });
    }
  }

  /// Runs [action] as one transaction: all of it is saved, or (if it throws) none of it.
  T transaction<T>(T Function() action) {
    if (!raw.autocommit) return action(); // Already inside one: it joins the outer transaction.
    raw.execute('BEGIN IMMEDIATE');
    try {
      final result = action();
      raw.execute('COMMIT');
      return result;
    } on Object {
      raw.execute('ROLLBACK');
      rethrow;
    }
  }

  void close() => raw.close();
}
