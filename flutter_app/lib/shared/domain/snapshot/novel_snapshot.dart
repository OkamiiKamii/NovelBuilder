import 'package:flutter/foundation.dart';

import '../json.dart';
import '../records/story_node.dart';
import '../records/system.dart';
import 'collections.dart';

/// Why a file cannot be read as a novel. Nothing is imported when this is thrown.
class SnapshotException implements Exception {
  SnapshotException(this.reason);
  final String reason;

  @override
  String toString() => 'This file cannot be opened: $reason.';
}

/// A whole novel as one JSON document: its metadata and every row it owns, grouped by collection. The unit of backup,
/// export, import and duplication, and the same `.novel.json` format the original app writes (format version 4).
///
/// It keeps everything: collections this version does not know, fields on rows it does not know, and top-level keys
/// it does not know. Reading and then writing a file changes nothing but the upgrades in [SnapshotUpgrades].
@immutable
class NovelSnapshot {
  NovelSnapshot({
    required JsonMap project,
    required Map<String, List<JsonMap>> collections,
    this.exportedAt = 0,
    JsonMap extra = const {},
  }) : project = freezeMap(project),
       collections = Map.unmodifiable({
         for (final e in collections.entries)
           e.key: List<JsonMap>.unmodifiable([for (final r in e.value) freezeMap(r)]),
       }),
       extra = freezeMap(extra);

  static const format = 'novel-builder/project';

  /// The version this app reads and writes. Files from versions 1–3 are upgraded on the way in; newer ones are refused
  /// rather than misread.
  static const currentVersion = 4;

  final JsonMap project;
  final Map<String, List<JsonMap>> collections;
  final num exportedAt;

  /// Top-level keys of the file other than the known ones, kept as they were.
  final JsonMap extra;

  String get projectId => str(project['id']);

  List<JsonMap> rows(String collection) => collections[collection] ?? const [];

  /// Collections in the file that this version has never heard of. They are kept and exported unchanged.
  List<String> get unknownCollections => [
    for (final e in collections.entries)
      if (!novelCollections.containsKey(e.key) && e.value.isNotEmpty) e.key,
  ];

  NovelSnapshot copyWith({JsonMap? project, Map<String, List<JsonMap>>? collections, num? exportedAt}) => NovelSnapshot(
    project: project ?? this.project,
    collections: collections ?? this.collections,
    exportedAt: exportedAt ?? this.exportedAt,
    extra: extra,
  );

  /// The same snapshot with one collection's rows replaced.
  NovelSnapshot withRows(String collection, List<JsonMap> rows) =>
      copyWith(collections: {...collections, collection: rows});

  /// Replaces (by id) or adds one row.
  NovelSnapshot putRow(String collection, JsonMap row) {
    final id = row['id'];
    final list = rows(collection);
    final at = list.indexWhere((r) => r['id'] == id);
    return withRows(collection, at < 0 ? [...list, row] : [...list.sublist(0, at), row, ...list.sublist(at + 1)]);
  }

  JsonMap toJson({num? exportedAt}) => {
    ...deepCopy(extra)! as JsonMap,
    'format': format,
    'version': currentVersion,
    'exportedAt': exportedAt ?? this.exportedAt,
    'project': deepCopy(project),
    'collections': {
      // Every known collection is written, empty or not, as the original app does.
      for (final name in novelCollections.keys) name: deepCopy(rows(name)),
      for (final e in collections.entries)
        if (!novelCollections.containsKey(e.key)) e.key: deepCopy(e.value),
    },
  };

  /// Reads a decoded `.novel.json` file. Throws [SnapshotException] with a reason when it cannot be read safely;
  /// nothing is partly read.
  static NovelSnapshot fromJson(Object? json) {
    final file = mapOrNull(json);
    if (file == null) throw SnapshotException('it is not a JSON object');
    if (file['format'] != format) throw SnapshotException('it is not a Novel Builder project file');
    final version = file['version'];
    if (version is! num) throw SnapshotException('it does not say which version of the format it uses');
    if (version > currentVersion) {
      throw SnapshotException(
        'it was made by a newer version of Novel Builder (format $version; this app reads up to $currentVersion)',
      );
    }
    final project = mapOrNull(file['project']);
    if (project == null) throw SnapshotException('it has no novel details');
    if (idOrNull(project['id']) == null) throw SnapshotException('its novel has no id');

    final raw = file['collections'];
    if (raw != null && raw is! Map) throw SnapshotException('its records are not grouped by kind');
    final collections = <String, List<JsonMap>>{};
    final unreadable = <String>[];
    for (final e in (mapOrNull(raw) ?? const {}).entries) {
      if (e.value is! List) throw SnapshotException('its ${e.key} are not a list');
      final list = e.value! as List;
      final readable = [
        for (final r in list)
          if (r is Map && r['id'] is String) r.cast<String, Object?>(),
      ];
      if (readable.length < list.length) {
        final n = list.length - readable.length;
        unreadable.add('$n ${n == 1 ? 'record' : 'records'} in ${e.key}');
      }
      final seen = <Object?>{};
      for (final r in readable) {
        if (!seen.add(r['id'])) throw SnapshotException('two records in ${e.key} share the id ${r['id']}');
      }
      collections[e.key] = readable;
    }
    if (unreadable.isNotEmpty) {
      throw SnapshotException('${unreadable.join(', ')} cannot be read (no id, or not a record)');
    }

    final extra = {
      for (final e in file.entries)
        if (!const {'format', 'version', 'exportedAt', 'project', 'collections'}.contains(e.key)) e.key: e.value,
    };
    return SnapshotUpgrades.apply(
      NovelSnapshot(
        project: project,
        collections: collections,
        exportedAt: numOrNull(file['exportedAt']) ?? 0,
        extra: extra,
      ),
      fromVersion: version.toInt(),
    );
  }
}

/// Versioned, testable upgrades applied to every snapshot on the way in. Each is safe to run on data already in
/// shape, so they run for every file, as the original app's import did, and none drops anything.
abstract final class SnapshotUpgrades {
  static NovelSnapshot apply(NovelSnapshot snapshot, {required int fromVersion}) {
    var s = snapshot;
    for (final step in steps) {
      s = step.run(s);
    }
    return s;
  }

  static final steps = <({String name, NovelSnapshot Function(NovelSnapshot) run})>[
    // Original schema v8: a five-step progress plus a separate publication tag became one status pipeline.
    (name: 'chapter status pipeline', run: _chapterStatus),
    // Original format v4: a blueprint's ranks and table rows and columns gained ids; items point at `rankId`.
    (name: 'blueprint ranks and tables by id', run: _blueprints),
  ];

  static NovelSnapshot _chapterStatus(NovelSnapshot s) {
    if (s.rows('chapters').every((r) => !r.containsKey('publication') && NodeStatus.of(r['status']) != null)) return s;
    return s.withRows('chapters', [
      for (final r in s.rows('chapters'))
        if (!r.containsKey('publication') && NodeStatus.of(r['status']) != null)
          r
        else
          {
            for (final e in r.entries)
              if (e.key != 'publication') e.key: e.value,
            'status': NodeStatus.upgrade(r['status'], r['publication']).key,
          },
    ]);
  }

  static NovelSnapshot _blueprints(NovelSnapshot s) {
    final rows = s.rows('systems');
    if (rows.isEmpty) return s;
    final upgraded = [for (final r in rows) upgradeBlueprintShape(r)];
    return jsonEquals(upgraded, rows) ? s : s.withRows('systems', upgraded);
  }
}
