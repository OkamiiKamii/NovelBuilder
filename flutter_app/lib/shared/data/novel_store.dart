import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';

import '../domain/collab/access.dart';
import '../domain/collab/review_files.dart';
import '../domain/json.dart';
import '../domain/records/novel.dart';
import '../domain/snapshot/novel_snapshot.dart';
import 'database.dart';

/// A change that would overwrite something saved since it was read. Nothing is written when this is thrown.
class StaleWriteException implements Exception {
  StaleWriteException(this.what);
  final String what;

  @override
  String toString() => '$what changed since it was opened. Nothing was saved, so the newer version is kept.';
}

/// The novels stored on this device. Widgets never touch the database: they go through this repository.
///
/// Every method that writes is one transaction. Reads return immutable records. [revision] changes after every
/// successful write, so screens can refresh.
class NovelStore extends ChangeNotifier {
  NovelStore(this.db, {DateTime Function()? clock}) : _clock = clock ?? DateTime.now;

  final AppDatabase db;
  final DateTime Function() _clock;

  int _revision = 0;
  int get revision => _revision;

  int get _now => _clock().millisecondsSinceEpoch;

  void _changed() {
    _revision++;
    notifyListeners();
  }

  /// How many times each collection of each novel has been written since the app started ('project' for the novel's
  /// own row), and how many times each novel was written whole (stored anew, or deleted). Counted in memory, after a
  /// write succeeds: work done from some collections can be kept until [versionOf] them moves, whatever else changes.
  final _written = <String, int>{};
  final _wholly = <String, int>{};

  void _wrote(String projectId, Iterable<String> collections) {
    for (final c in collections) {
      final key = '$projectId\u0000$c';
      _written[key] = (_written[key] ?? 0) + 1;
    }
  }

  void _wroteWhole(String projectId) => _wholly[projectId] = (_wholly[projectId] ?? 0) + 1;

  /// And each record: how many times it was written (stored, changed or removed) since the app started, by novel, then
  /// collection, then record.
  final _rowsWritten = <String, Map<String, Map<String, int>>>{};

  void _wroteRows(String projectId, Iterable<(String collection, String id)> rows) {
    final byCollection = _rowsWritten[projectId] ??= {};
    for (final (collection, id) in rows) {
      final counts = byCollection[collection] ??= {};
      counts[id] = (counts[id] ?? 0) + 1;
    }
  }

  /// For each record of a collection of [projectId] written since the app started, how many times; records not in it
  /// are as they were when the novel was last [wholeVersionOf] stored. Work kept per record (a chapter's gaps, say)
  /// is done again for those whose count moved, and for all when [wholeVersionOf] does. Nothing is read.
  Map<String, int> rowVersionsIn(String projectId, String collection) =>
      Map.of(_rowsWritten[projectId]?[collection] ?? const {});

  /// A number that moves whenever [projectId] is stored whole (put anew: imported, restored) or deleted.
  int wholeVersionOf(String projectId) => _wholly[projectId] ?? 0;

  /// A number that moves whenever any of [collections] of [projectId] (or the novel's own row, as 'project') is
  /// written, and stays the same otherwise. Cheap to ask on every build: nothing is read.
  int versionOf(String projectId, Iterable<String> collections) {
    var v = _wholly[projectId] ?? 0;
    for (final c in collections) {
      v += _written['$projectId\u0000$c'] ?? 0;
    }
    return v;
  }

  /// REVIEW COPY GUARD. In a review copy, every change is judged by its role's rule before anything is written, as
  /// the original app's guard sat under every write: a change the role may not make is refused with
  /// [PermissionException], and nothing of the write is saved. The keys of the changes it does allow are kept in the
  /// copy's mark: they are what the person's feedback file carries back.
  List<String> _guarded(ReviewMark mark, String collection, String id, JsonMap? before, JsonMap? after) {
    final reason = refusal(mark.role, mark.memberId, '$collection:$id', before, after);
    if (reason != null) throw PermissionException(reason);
    return ['$collection:$id'];
  }

  /// The project with the keys of a review copy's newly allowed changes added to its mark.
  JsonMap _marked(JsonMap project, ReviewMark mark, Iterable<String> keys) => {
    ...project,
    'review': {
      ...mark.toJson(),
      'changed': {...mark.changed, ...keys}.toList(),
    },
  };

  /// The details a person keeps for themselves on a review copy: they may change these, and nothing else of it.
  static const _personal = {'pinned', 'archived', 'lastOpenedAt', 'updatedAt'};

  /// Every novel's details, most recently changed first.
  List<Novel> listNovels() => [
    for (final row in db.raw.select('SELECT json FROM novels ORDER BY updated_at DESC, id'))
      Novel(jsonDecode(row['json']! as String) as JsonMap),
  ];

  bool exists(String projectId) => db.raw.select('SELECT 1 FROM novels WHERE id = ?', [projectId]).isNotEmpty;

  Novel? novel(String projectId) {
    final rows = db.raw.select('SELECT json FROM novels WHERE id = ?', [projectId]);
    return rows.isEmpty ? null : Novel(jsonDecode(rows.single['json']! as String) as JsonMap);
  }

  /// The whole novel, every collection, rows in the order they were stored. Null when there is no such novel.
  NovelSnapshot? load(String projectId) {
    final head = db.raw.select('SELECT json, extra FROM novels WHERE id = ?', [projectId]);
    if (head.isEmpty) return null;
    final collections = <String, List<JsonMap>>{};
    for (final row in db.raw.select(
      'SELECT collection, json FROM records WHERE project_id = ? ORDER BY collection, position',
      [projectId],
    )) {
      (collections[row['collection']! as String] ??= []).add(jsonDecode(row['json']! as String) as JsonMap);
    }
    return NovelSnapshot(
      project: jsonDecode(head.single['json']! as String) as JsonMap,
      collections: collections,
      extra: jsonDecode(head.single['extra']! as String) as JsonMap,
    );
  }

  /// The novel with only the named collections, for a change that touches nothing else: a long book's text and
  /// history are not read for it. Save it only with [saveChanges] (which writes the collections it holds), never with
  /// [putNovel] (which would store a novel without the rest). Null when there is no such novel.
  NovelSnapshot? loadPart(String projectId, Set<String> collectionNames) {
    final head = db.raw.select('SELECT json, extra FROM novels WHERE id = ?', [projectId]);
    if (head.isEmpty) return null;
    return NovelSnapshot(
      project: jsonDecode(head.single['json']! as String) as JsonMap,
      collections: {for (final name in collectionNames) name: rowsIn(projectId, name)},
      extra: jsonDecode(head.single['extra']! as String) as JsonMap,
    );
  }

  /// Stores a whole novel, replacing any stored version of it, in one transaction. Used by import and restore.
  void putNovel(NovelSnapshot snapshot) {
    final id = snapshot.projectId;
    final now = _now;
    db.transaction(() {
      db.raw.execute('DELETE FROM records WHERE project_id = ?', [id]);
      db.raw.execute(
        'INSERT INTO novels (id, json, extra, updated_at) VALUES (?, ?, ?, ?) '
        'ON CONFLICT(id) DO UPDATE SET json = excluded.json, extra = excluded.extra, updated_at = excluded.updated_at',
        [id, jsonEncode(snapshot.project), jsonEncode(snapshot.extra), now],
      );
      final insert = db.raw.prepare(
        'INSERT INTO records (project_id, collection, id, json, position, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      );
      try {
        for (final e in snapshot.collections.entries) {
          for (final (i, row) in e.value.indexed) {
            insert.execute([id, e.key, row['id'], jsonEncode(row), i, now]);
          }
        }
      } finally {
        insert.close();
      }
    });
    _wroteWhole(id);
    _changed();
  }

  /// Saves the difference between two versions of a novel (rows added, changed, removed) in one transaction.
  ///
  /// [before] must be what was read: if any row it touches has been saved differently since, nothing is written and
  /// [StaleWriteException] is thrown, so a newer save is never silently overwritten.
  void saveChanges(NovelSnapshot before, NovelSnapshot after) {
    final id = before.projectId;
    if (after.projectId != id) throw ArgumentError('Changes must stay within one novel.');
    final now = _now;
    // What this save writes, counted once it has succeeded.
    // The novel's own row counts as written only when more than its time changed (every save touches that).
    final wrote = <String>{if (!_sameButTime(after.project, before.project)) 'project'};
    final rowsWrote = <(String, String)>[];
    db.transaction(() {
      final stored = db.raw.select('SELECT json FROM novels WHERE id = ?', [id]);
      if (stored.isEmpty) throw StaleWriteException('The novel');
      final storedProject = jsonDecode(stored.single['json']! as String) as JsonMap;
      final mark = ReviewMark.of(storedProject);
      final changed = <String>[];
      if (mark != null && !jsonEquals(after.project, before.project)) {
        throw const PermissionException('Only the owner changes the project itself.');
      }
      if (!jsonEquals(after.project, before.project)) {
        if (!jsonEquals(jsonDecode(stored.single['json']! as String), before.project)) {
          throw StaleWriteException('The novel');
        }
        db.raw.execute('UPDATE novels SET json = ?, updated_at = ? WHERE id = ?', [jsonEncode(after.project), now, id]);
      } else {
        db.raw.execute('UPDATE novels SET updated_at = ? WHERE id = ?', [now, id]);
      }
      for (final name in {...before.collections.keys, ...after.collections.keys}) {
        final old = {for (final r in before.rows(name)) r['id']: r};
        final next = {for (final r in after.rows(name)) r['id']: r};
        String? current(Object? rowId) {
          final r = db.raw.select('SELECT json FROM records WHERE project_id = ? AND collection = ? AND id = ?', [
            id,
            name,
            rowId,
          ]);
          return r.isEmpty ? null : r.single['json']! as String;
        }

        void expectStored(Object? rowId) {
          final now = current(rowId);
          final was = old[rowId];
          final same = was == null ? now == null : (now != null && jsonEquals(jsonDecode(now), was));
          if (!same) throw StaleWriteException('A record in $name');
        }

        for (final rowId in old.keys.where((k) => !next.containsKey(k))) {
          expectStored(rowId);
          if (mark != null) changed.addAll(_guarded(mark, name, str(rowId), old[rowId], null));
          db.raw.execute('DELETE FROM records WHERE project_id = ? AND collection = ? AND id = ?', [id, name, rowId]);
          wrote.add(name);
          rowsWrote.add((name, str(rowId)));
        }
        var position =
            (db.raw.select('SELECT MAX(position) AS p FROM records WHERE project_id = ? AND collection = ?', [
                  id,
                  name,
                ]).single['p']
                as int?) ??
            -1;
        for (final e in next.entries) {
          final was = old[e.key];
          if (was != null && jsonEquals(was, e.value)) continue;
          expectStored(e.key);
          if (mark != null) changed.addAll(_guarded(mark, name, str(e.key), was, e.value));
          wrote.add(name);
          rowsWrote.add((name, str(e.key)));
          if (was == null) {
            db.raw.execute(
              'INSERT INTO records (project_id, collection, id, json, position, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
              [id, name, e.key, jsonEncode(e.value), ++position, now],
            );
          } else {
            db.raw.execute(
              'UPDATE records SET json = ?, updated_at = ? WHERE project_id = ? AND collection = ? AND id = ?',
              [jsonEncode(e.value), now, id, name, e.key],
            );
          }
        }
      }
      if (mark != null && changed.isNotEmpty) {
        db.raw.execute('UPDATE novels SET json = ? WHERE id = ?', [
          jsonEncode(_marked(storedProject, mark, changed)),
          id,
        ]);
      }
    });
    _wrote(id, wrote);
    _wroteRows(id, rowsWrote);
    _changed();
  }

  /// One stored record, or null.
  JsonMap? row(String projectId, String collection, String id) {
    final r = db.raw.select('SELECT json FROM records WHERE project_id = ? AND collection = ? AND id = ?', [
      projectId,
      collection,
      id,
    ]);
    return r.isEmpty ? null : jsonDecode(r.single['json']! as String) as JsonMap;
  }

  /// When a collection last changed: how many records it holds and the latest time one was written. Read from the
  /// index, not the records, so it is cheap to ask on every build: work done from a collection can be kept until this
  /// changes.
  ({int count, int latest}) stampOf(String projectId, String collection) {
    final r = db.raw.select(
      'SELECT COUNT(*) AS n, COALESCE(MAX(updated_at), 0) AS t FROM records WHERE project_id = ? AND collection = ?',
      [projectId, collection],
    ).single;
    return (count: r['n'] as int, latest: r['t'] as int);
  }

  /// A collection's records as stored (JSON text, in order), not decoded: for work done away from the screen, which
  /// decodes them there.
  List<String> rawJsonIn(String projectId, String collection) => [
    for (final r in db.raw.select(
      'SELECT json FROM records WHERE project_id = ? AND collection = ? ORDER BY position',
      [projectId, collection],
    ))
      r['json']! as String,
  ];

  /// Only the records of a collection named by [ids], as stored (JSON text, in order): to read again the few written
  /// since, not the whole collection.
  List<String> rawJsonOf(String projectId, String collection, Iterable<String> ids) {
    final all = ids.toList();
    return [
      // A few hundred at a time, within the database's limit on values in one query.
      for (var i = 0; i < all.length; i += 400)
        for (final r in db.raw.select(
          'SELECT json FROM records WHERE project_id = ? AND collection = ? AND id IN '
          '(${List.filled(all.skip(i).take(400).length, '?').join(', ')}) ORDER BY position',
          [projectId, collection, ...all.skip(i).take(400)],
        ))
          r['json']! as String,
    ];
  }

  /// How many records each collection of each of [projectIds] holds (by book, then by collection), in one query from
  /// the index, without reading the records. A collection a book has no records in is absent.
  Map<String, Map<String, int>> countsByCollection(List<String> projectIds) {
    final out = <String, Map<String, int>>{};
    if (projectIds.isEmpty) return out;
    // In parts, to stay well inside SQLite's limit on the number of values one statement may take.
    for (var at = 0; at < projectIds.length; at += 500) {
      final part = projectIds.sublist(at, math.min(at + 500, projectIds.length));
      for (final r in db.raw.select(
        'SELECT project_id, collection, COUNT(*) AS n FROM records '
        'WHERE project_id IN (${List.filled(part.length, '?').join(', ')}) GROUP BY project_id, collection',
        part,
      )) {
        (out[r['project_id']! as String] ??= {})[r['collection']! as String] = r['n'] as int;
      }
    }
    return out;
  }

  /// How many records a collection holds, without reading them.
  int countIn(String projectId, String collection) =>
      db.raw.select('SELECT COUNT(*) AS n FROM records WHERE project_id = ? AND collection = ?', [
            projectId,
            collection,
          ]).single['n']
          as int;

  /// A collection's records, in the order they were stored.
  List<JsonMap> rowsIn(String projectId, String collection) => [
    for (final r in db.raw.select(
      'SELECT json FROM records WHERE project_id = ? AND collection = ? ORDER BY position',
      [projectId, collection],
    ))
      jsonDecode(r['json']! as String) as JsonMap,
  ];

  /// The records of a collection that belong to one chapter or scene (their `nodeId` is [nodeId]), in order: found by
  /// the index on it (`records_by_node`), so a chapter's history is read without reading every chapter's.
  List<JsonMap> rowsForNode(String projectId, String collection, String nodeId) {
    // The index named: left to choose, the database (with no statistics of the table) takes the key (every record of
    // the collection, each one's chapter read from its JSON) over the index by chapter. Put in order here, as an order
    // by position would make it take the index in order instead.
    final rows = db.raw.select(
      'SELECT json, position FROM records INDEXED BY records_by_node '
      "WHERE project_id = ? AND collection = ? AND json_extract(json, '\$.nodeId') = ?",
      [projectId, collection, nodeId],
    ).toList()..sort((a, b) => (a['position']! as int).compareTo(b['position']! as int));
    return [for (final r in rows) jsonDecode(r['json']! as String) as JsonMap];
  }

  /// Writes several records in one transaction: all of them, or (if any check fails) none. A write with an
  /// [RowWrite.expect] is refused with [StaleWriteException] when the stored record is no longer what was read.
  /// With [touchNovel], the novel's `updatedAt` becomes now.
  void writeRows(String projectId, List<RowWrite> writes, {bool touchNovel = true}) {
    final now = _now;
    var markChanged = false;
    db.transaction(() {
      final head = db.raw.select('SELECT json FROM novels WHERE id = ?', [projectId]);
      if (head.isEmpty) throw StateError('That novel is no longer in the library.');
      final mark = ReviewMark.of(jsonDecode(head.single['json']! as String) as JsonMap);
      final changed = <String>[];
      for (final w in writes) {
        final id = w.id;
        if (mark != null) changed.addAll(_guarded(mark, w.collection, id, row(projectId, w.collection, id), w.value));
        if (!identical(w.expect, RowWrite.unchecked)) {
          final stored = row(projectId, w.collection, id);
          final same = w.expect == null ? stored == null : (stored != null && jsonEquals(stored, w.expect));
          if (!same) throw StaleWriteException('A record in ${w.collection}');
        }
        final value = w.value;
        if (value == null) {
          db.raw.execute('DELETE FROM records WHERE project_id = ? AND collection = ? AND id = ?', [
            projectId,
            w.collection,
            id,
          ]);
        } else {
          final exists = db.raw.select('SELECT 1 FROM records WHERE project_id = ? AND collection = ? AND id = ?', [
            projectId,
            w.collection,
            id,
          ]).isNotEmpty;
          if (exists) {
            db.raw.execute(
              'UPDATE records SET json = ?, updated_at = ? WHERE project_id = ? AND collection = ? AND id = ?',
              [jsonEncode(value), now, projectId, w.collection, id],
            );
          } else {
            final position =
                (db.raw.select('SELECT MAX(position) AS p FROM records WHERE project_id = ? AND collection = ?', [
                      projectId,
                      w.collection,
                    ]).single['p']
                    as int?) ??
                -1;
            db.raw.execute(
              'INSERT INTO records (project_id, collection, id, json, position, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
              [projectId, w.collection, id, jsonEncode(value), position + 1, now],
            );
          }
        }
      }
      final project = jsonDecode(head.single['json']! as String) as JsonMap;
      markChanged = mark != null && changed.isNotEmpty;
      final marked = mark != null && markChanged ? _marked(project, mark, changed) : project;
      if (touchNovel) {
        db.raw.execute('UPDATE novels SET json = ?, updated_at = ? WHERE id = ?', [
          jsonEncode({...marked, 'updatedAt': now}),
          now,
          projectId,
        ]);
      } else if (!identical(marked, project)) {
        db.raw.execute('UPDATE novels SET json = ? WHERE id = ?', [jsonEncode(marked), projectId]);
      }
    });
    // The novel's own row: only when the review copy's mark changed, not for its time.
    _wrote(projectId, {if (markChanged) 'project', for (final w in writes) w.collection});
    _wroteRows(projectId, [for (final w in writes) (w.collection, w.id)]);
    _changed();
  }

  /// Replaces the novel's own details (title, author…). Fields this version does not know are kept by the caller,
  /// who passes a [Novel] changed through `withFields`.
  void putNovelDetails(Novel novel) {
    final rows = db.raw.select('SELECT json FROM novels WHERE id = ?', [novel.id]);
    if (rows.isEmpty) throw StaleWriteException('The novel');
    final stored = jsonDecode(rows.single['json']! as String) as JsonMap;
    if (ReviewMark.of(stored) != null) {
      final keys = {...stored.keys, ...novel.raw.keys};
      final others = keys.where((k) => !_personal.contains(k) && !jsonEquals(stored[k], novel.raw[k]));
      if (others.isNotEmpty) throw const PermissionException('Only the owner changes the project itself.');
    }
    db.raw.execute('UPDATE novels SET json = ?, updated_at = ? WHERE id = ?', [jsonEncode(novel.raw), _now, novel.id]);
    _wrote(novel.id, const {'project'});
    _changed();
  }

  /// The collections [stats] counts from: a write to any other leaves a novel's numbers as they were.
  static const statsCollections = {'chapters', 'loreEntries', 'timelineEvents', 'plotThreads', 'writingSessions'};

  /// What each novel holds, for the library: counted in the database, without loading any novel. [only]: just those
  /// novels (each read by its own records, not the whole library's).
  Map<String, NovelStats> stats({Iterable<String>? only}) => only != null && only.isEmpty
      ? const {}
      : {
          for (final r in db.raw.select(
            '''
      SELECT project_id,
        SUM(CASE WHEN collection = 'chapters' THEN COALESCE(json_extract(json, '\$.wordCount'), 0) ELSE 0 END) AS words,
        SUM(CASE WHEN collection = 'chapters' AND json_extract(json, '\$.kind') = 'chapter' THEN 1 ELSE 0 END) AS chapters,
        SUM(CASE WHEN collection = 'chapters' AND json_extract(json, '\$.kind') = 'scene' THEN 1 ELSE 0 END) AS scenes,
        SUM(CASE WHEN collection = 'loreEntries' AND json_extract(json, '\$.category') = 'character' THEN 1 ELSE 0 END) AS characters,
        SUM(CASE WHEN collection = 'loreEntries' THEN 1 ELSE 0 END) AS entries,
        SUM(CASE WHEN collection = 'timelineEvents' THEN 1 ELSE 0 END) AS events,
        SUM(CASE WHEN collection = 'plotThreads' THEN 1 ELSE 0 END) AS threads,
        MAX(CASE WHEN collection = 'writingSessions' AND (COALESCE(json_extract(json, '\$.added'), 0) > 0
          OR COALESCE(json_extract(json, '\$.removed'), 0) > 0) THEN json_extract(json, '\$.lastActiveAt') END) AS last_written
      FROM records
      ${only == null ? '' : 'WHERE project_id IN (${List.filled(only.length, '?').join(', ')})'}
      GROUP BY project_id
    ''',
            [...?only],
          ))
            r['project_id']! as String: NovelStats(
              words: (r['words'] as num? ?? 0).toInt(),
              chapters: r['chapters']! as int,
              scenes: r['scenes']! as int,
              characters: r['characters']! as int,
              entries: r['entries']! as int,
              events: r['events']! as int,
              threads: r['threads']! as int,
              lastWrittenAt: r['last_written'] as num?,
            ),
        };

  /// Deletes a novel and everything it owns (its drafts too). Restore points are kept, so it can be brought back.
  void deleteNovel(String projectId) {
    db.transaction(() => db.raw.execute('DELETE FROM novels WHERE id = ?', [projectId]));
    _wroteWhole(projectId);
    _changed();
  }
}

/// What a novel holds, counted from its records. Word counts are the chapters' and scenes' own, as stored.
@immutable
class NovelStats {
  const NovelStats({
    this.words = 0,
    this.chapters = 0,
    this.scenes = 0,
    this.characters = 0,
    this.entries = 0,
    this.events = 0,
    this.threads = 0,
    this.lastWrittenAt,
  });

  static const empty = NovelStats();

  final int words;
  final int chapters;
  final int scenes;
  final int characters;
  final int entries;
  final int events;
  final int threads;

  /// When the novel was last written in (or revised): the end of its latest writing session that added or removed
  /// words, in milliseconds. Null when it has none (a save that changed no words is not writing).
  final num? lastWrittenAt;
}

/// One record to write ([RowWrite.put]) or remove ([RowWrite.delete]), optionally only if it is still as read.
class RowWrite {
  RowWrite.put(this.collection, JsonMap this.value, {this.expect = unchecked}) : id = str(value['id']);
  const RowWrite.delete(this.collection, this.id, {this.expect = unchecked}) : value = null;

  /// No check: write whatever is stored now.
  static const Object unchecked = _Unchecked();

  final String collection;
  final String id;
  final JsonMap? value;

  /// What the stored record must still be (null: must not exist), or [unchecked].
  final Object? expect;
}

class _Unchecked {
  const _Unchecked();
}

/// Whether two versions of a novel's own row differ in nothing but when it was last written.
bool _sameButTime(JsonMap a, JsonMap b) => jsonEquals({...a}..remove('updatedAt'), {...b}..remove('updatedAt'));
