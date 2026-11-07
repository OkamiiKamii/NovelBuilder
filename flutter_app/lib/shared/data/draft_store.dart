import 'dart:convert';

import '../domain/json.dart';
import 'database.dart';

/// Work not saved yet, kept so a crash cannot lose it: what was in an editor moments ago.
class Draft {
  Draft(this.projectId, this.key, this.value, this.baseRev, this.updatedAt);

  final String projectId;

  /// What it is a draft of, e.g. `chapter:<id>`.
  final String key;
  final Object? value;

  /// The saved revision it was typed on top of, when the thing has revisions.
  final int? baseRev;
  final DateTime updatedAt;
}

/// Crash-recovery copies. An editor writes one often while there is unsaved work, and removes it once that work is
/// saved. On the next opening, a draft still here is offered back: "Unsaved writing was recovered — keep or discard".
/// Drafts never replace saved work on their own.
class DraftStore {
  DraftStore(this.db, {DateTime Function()? clock}) : _clock = clock ?? DateTime.now;
  final AppDatabase db;
  final DateTime Function() _clock;

  void put(String projectId, String key, Object? value, {int? baseRev}) => db.raw.execute(
    'INSERT INTO drafts (project_id, key, json, base_rev, updated_at) VALUES (?, ?, ?, ?, ?) '
    'ON CONFLICT(project_id, key) DO UPDATE SET json = excluded.json, base_rev = excluded.base_rev, '
    'updated_at = excluded.updated_at',
    [projectId, key, jsonEncode(value), baseRev, _clock().millisecondsSinceEpoch],
  );

  Draft? get(String projectId, String key) =>
      _read(db.raw.select('SELECT * FROM drafts WHERE project_id = ? AND key = ?', [projectId, key])).firstOrNull;

  /// Every draft left in a novel: work that was not saved before the app stopped.
  List<Draft> leftIn(String projectId) =>
      _read(db.raw.select('SELECT * FROM drafts WHERE project_id = ? ORDER BY updated_at', [projectId]));

  void discard(String projectId, String key) =>
      db.raw.execute('DELETE FROM drafts WHERE project_id = ? AND key = ?', [projectId, key]);

  List<Draft> _read(Iterable<Map<String, Object?>> rows) => [
    for (final r in rows)
      Draft(
        r['project_id']! as String,
        r['key']! as String,
        _decode(r['json']! as String),
        r['base_rev'] as int?,
        DateTime.fromMillisecondsSinceEpoch(r['updated_at']! as int),
      ),
  ];

  static Object? _decode(String text) {
    try {
      return jsonDecode(text);
    } on FormatException {
      return text; // Kept as text rather than lost.
    }
  }
}

/// A whole-novel copy kept before something replaces the novel (an import over it, a restore). Restoring one is
/// itself undoable: the version it replaces becomes a restore point too.
class RestorePoint {
  RestorePoint(this.id, this.projectId, this.title, this.reason, this.createdAt);
  final String id;
  final String projectId;
  final String title;
  final String reason;
  final DateTime createdAt;
}

class RestorePointStore {
  RestorePointStore(this.db, {DateTime Function()? clock, this.keepPerNovel = 20}) : _clock = clock ?? DateTime.now;
  final AppDatabase db;
  final DateTime Function() _clock;

  /// How many restore points each novel keeps; the oldest beyond this are removed.
  final int keepPerNovel;

  void add(String id, JsonMap snapshotJson, {required String title, required String reason}) {
    final projectId = str(mapOrNull(snapshotJson['project'])?['id']);
    db.transaction(() {
      db.raw.execute(
        'INSERT INTO restore_points (id, project_id, title, reason, created_at, snapshot) VALUES (?, ?, ?, ?, ?, ?)',
        [id, projectId, title, reason, _clock().millisecondsSinceEpoch, jsonEncode(snapshotJson)],
      );
      db.raw.execute(
        'DELETE FROM restore_points WHERE project_id = ? AND id NOT IN '
        '(SELECT id FROM restore_points WHERE project_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?)',
        [projectId, projectId, keepPerNovel],
      );
    });
  }

  List<RestorePoint> list({String? projectId}) => [
    for (final r in db.raw.select(
      'SELECT id, project_id, title, reason, created_at FROM restore_points '
      '${projectId == null ? '' : 'WHERE project_id = ? '}ORDER BY created_at DESC, rowid DESC',
      [?projectId],
    ))
      RestorePoint(
        r['id']! as String,
        r['project_id']! as String,
        r['title']! as String,
        r['reason']! as String,
        DateTime.fromMillisecondsSinceEpoch(r['created_at']! as int),
      ),
  ];

  /// The novel as it was, as a `.novel.json` document. Null when there is no such restore point.
  Object? snapshotJson(String id) {
    final rows = db.raw.select('SELECT snapshot FROM restore_points WHERE id = ?', [id]);
    return rows.isEmpty ? null : jsonDecode(rows.single['snapshot']! as String);
  }

  void remove(String id) => db.raw.execute('DELETE FROM restore_points WHERE id = ?', [id]);
}
