import 'dart:convert';

import '../domain/ids.dart';
import '../domain/integrity/rules.dart' show brokenReferences;
import '../domain/json.dart';
import '../domain/model/story_model.dart';
import '../domain/records/novel.dart';
import '../domain/snapshot/novel_snapshot.dart';
import 'draft_store.dart';
import 'novel_store.dart';

/// How one kind of record would change if a backup replaced the stored novel.
class CollectionChange {
  const CollectionChange(this.added, this.changed, this.removed, this.kept);
  final int added;
  final int changed;
  final int removed;

  /// Records that are the same in both.
  final int kept;

  bool get isSame => added == 0 && changed == 0 && removed == 0;
}

/// What importing a file would do, worked out before anything is written.
class ImportPreview {
  ImportPreview(this.snapshot, this.existing, {this.stored, this.fromVersion = NovelSnapshot.currentVersion});

  final NovelSnapshot snapshot;

  /// The stored novel with the same id, when there is one: importing replaces it (after keeping a restore point).
  final Novel? existing;

  /// That stored novel's records, for saying what replacing it would change.
  final NovelSnapshot? stored;

  /// The format version the file was written in. Older files are upgraded as they are read.
  final int fromVersion;

  /// Per kind of record, what replacing the stored novel with the file would add, change and remove. Empty when
  /// nothing is replaced. Only kinds where something differs are listed.
  Map<String, CollectionChange> get changes {
    final before = stored;
    if (before == null) return const {};
    final out = <String, CollectionChange>{};
    for (final name in {...before.collections.keys, ...snapshot.collections.keys}) {
      final old = {for (final r in before.rows(name)) r['id']: r};
      final now = {for (final r in snapshot.rows(name)) r['id']: r};
      var added = 0, changed = 0, kept = 0;
      for (final e in now.entries) {
        final was = old[e.key];
        if (was == null) {
          added++;
        } else if (jsonEquals(was, e.value)) {
          kept++;
        } else {
          changed++;
        }
      }
      final removed = old.keys.where((id) => !now.containsKey(id)).length;
      final change = CollectionChange(added, changed, removed, kept);
      if (!change.isSame) out[name] = change;
    }
    return out;
  }

  /// References in the file that name a record it does not hold, in words: worked out by the same rule as Review →
  /// Record check. They are imported as they are (nothing is dropped), and can be dealt with there afterwards.
  late final List<String> problems = [
    for (final b in brokenReferences(StoryModel.fromSnapshot(snapshot), snapshot.rows('structureMarkers')))
      '${b.where}: ${b.says}',
  ];

  String get title => Novel(snapshot.project).title;

  /// How many records of each kind the file holds, for the confirmation screen.
  Map<String, int> get counts => {
    for (final e in snapshot.collections.entries)
      if (e.value.isNotEmpty) e.key: e.value.length,
  };

  List<String> get unknownCollections => snapshot.unknownCollections;
}

/// Backup and restore of whole novels as `.novel.json` files: the same format the original app writes, so its
/// backups import directly. A file is a full backup (every record and field); it is not a picture of a view.
///
/// Nothing here sends anything anywhere: files are read from and written to wherever the author chooses.
class BackupService {
  BackupService(this.novels, this.restorePoints, {DateTime Function()? clock}) : _clock = clock ?? DateTime.now;

  final NovelStore novels;
  final RestorePointStore restorePoints;
  final DateTime Function() _clock;

  /// The novel as a backup file's text. Throws [StateError] when there is no such novel.
  String exportBackup(String projectId) {
    final snapshot = novels.load(projectId);
    if (snapshot == null) throw StateError('There is no novel to export.');
    return const JsonEncoder.withIndent('  ').convert(snapshot.toJson(exportedAt: _clock().millisecondsSinceEpoch));
  }

  /// A file name for a novel's backup: its title, made safe for any file system.
  static String fileNameFor(Novel novel) {
    final base = novel.title.trim().replaceAll(RegExp(r'[\\/:*?"<>|\x00-\x1F]'), '').replaceAll(RegExp(r'\s+'), ' ');
    return '${base.isEmpty ? 'Untitled novel' : base}.novel.json';
  }

  /// Reads a backup file's text and says what importing it would do. Throws [SnapshotException] with a reason when it
  /// cannot be read; nothing is written either way.
  ImportPreview previewImport(String text) {
    final Object? json;
    try {
      json = jsonDecode(text);
    } on FormatException {
      throw SnapshotException('it is not a JSON file');
    }
    final snapshot = NovelSnapshot.fromJson(json);
    final existing = novels.novel(snapshot.projectId);
    return ImportPreview(
      snapshot,
      existing,
      stored: existing == null ? null : novels.load(snapshot.projectId),
      fromVersion: (json! as Map)['version'] is num
          ? ((json as Map)['version'] as num).toInt()
          : NovelSnapshot.currentVersion,
    );
  }

  /// Imports a previewed file. When it replaces a stored novel, that novel is first kept as a restore point, so the
  /// import can be undone. Returns the id of the restore point made, if any.
  String? importBackup(ImportPreview preview) {
    String? kept;
    if (preview.existing != null) {
      kept = keepRestorePoint(preview.snapshot.projectId, 'Before importing a backup over it');
    }
    novels.putNovel(preview.snapshot);
    return kept;
  }

  /// Keeps the stored novel as a restore point. Returns its id, or null when there is no such novel.
  String? keepRestorePoint(String projectId, String reason) {
    final current = novels.load(projectId);
    if (current == null) return null;
    final id = newId();
    restorePoints.add(
      id,
      current.toJson(exportedAt: _clock().millisecondsSinceEpoch),
      title: Novel(current.project).title,
      reason: reason,
    );
    return id;
  }

  /// Brings a novel back as it was at a restore point. The version it replaces is kept as a restore point first.
  void restore(String restorePointId) {
    final json = restorePoints.snapshotJson(restorePointId);
    if (json == null) throw StateError('That restore point no longer exists.');
    final snapshot = NovelSnapshot.fromJson(json);
    keepRestorePoint(snapshot.projectId, 'Before restoring an earlier version');
    novels.putNovel(snapshot);
  }
}
