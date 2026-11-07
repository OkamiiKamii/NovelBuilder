import '../ids.dart';
import '../json.dart';
import 'novel_snapshot.dart';

/// Separators inside composite references: an ability `<systemId>/<itemId>`, a ref key `entry:<id>`, a connection id
/// `participant:<eventId>:<entryId>`, a cell key `<rowId>|<columnId>`, several ids one per line in a field.
final _separators = RegExp(r'([:/|\n])');

/// Version history: kept in backups, left out of duplicates, as in the original app.
const historyCollections = {'chapterRevisions', 'characterHistory'};

/// What a novel's setup is, for starting a new novel from it: how it is organised, never its story.
///
///  loreSchemas         record kinds (categories) and their custom fields
///  relationSettings    relationship types and tracked attributes
///  storyCalendars      its own calendar
///  progressCategories  what it tracks about how characters change (without the characters)
///  systems             fictional system blueprints (without anyone's sheet)
const setupCollections = {'loreSchemas', 'relationSettings', 'storyCalendars', 'progressCategories', 'systems'};

/// Replaces every id in [map] wherever it appears in a JSON value: as a whole value, as a list item, as a map key, and
/// as a part of a composite reference (see [_separators]). Prose is not touched: the text of chapters (ProseMirror
/// `text` nodes) is left exactly as written.
///
/// Because the same substitution is applied everywhere, every reference that held in the source holds in the copy,
/// including ones inside fields and collections this version does not know.
Object? substituteIds(Object? value, Map<String, String> map) {
  String one(String s) {
    final whole = map[s];
    if (whole != null) return whole;
    if (!s.contains(_separators)) return s;
    return s.splitMapJoin(_separators, onNonMatch: (part) => map[part] ?? part);
  }

  Object? walk(Object? v) {
    switch (v) {
      case final String s:
        return one(s);
      case final List<Object?> l:
        return [for (final x in l) walk(x)];
      case final Map<Object?, Object?> m:
        final proseText = m['type'] == 'text';
        return <String, Object?>{
          for (final e in m.entries) one('${e.key}'): proseText && e.key == 'text' ? e.value : walk(e.value),
        };
      default:
        return v;
    }
  }

  return walk(value);
}

/// A fresh id for every row (and the novel), keeping their order: new ids sort as the old ones did, so whatever is
/// listed by id comes back in the same order. Ids that are not UUIDs (a preset blueprint's `x-cultivation`) also get
/// UUIDs, as in the original app.
Map<String, String> freshIds(NovelSnapshot source, {String Function() createId = newId}) {
  final old = <String>{
    for (final rows in source.collections.values)
      for (final r in rows)
        if (r['id'] case final String id) id,
  }.toList()..sort();
  final fresh = [for (final _ in old) createId()]..sort();
  return {for (var i = 0; i < old.length; i++) old[i]: fresh[i], source.projectId: createId()};
}

/// A copy of a novel that shares nothing with it: a new id for the novel and every row, every reference rewritten
/// to the copies. [include] decides which collections come along (all of them when null).
///
/// The copy's details are the source's with [title], unpinned, not archived, and new dates; fields this version does
/// not know come along. The original's long-retired single `genre` is dropped, as the original app did.
NovelSnapshot copyNovel(
  NovelSnapshot source, {
  required String title,
  bool Function(String collection)? include,
  String Function() createId = newId,
  required num now,
}) {
  final kept = {
    for (final e in source.collections.entries)
      if (include == null || include(e.key)) e.key: e.value,
  };
  final trimmed = source.copyWith(collections: kept);
  final map = freshIds(trimmed, createId: createId);
  final newProjectId = map[source.projectId]!;
  final project =
      substituteIds({
            for (final e in source.project.entries)
              if (e.key != 'genre') e.key: e.value,
          }, map)!
          as JsonMap;
  return NovelSnapshot(
    project: {
      ...project,
      'id': newProjectId,
      'title': title,
      'pinned': false,
      'archived': false,
      'createdAt': now,
      'updatedAt': now,
      'lastOpenedAt': null,
    },
    collections: {
      for (final e in kept.entries)
        e.key: [
          for (final r in e.value) {...(substituteIds(r, map)! as JsonMap), 'projectId': newProjectId},
        ],
    },
    extra: source.extra,
  );
}

/// A duplicate: everything but version history.
NovelSnapshot duplicateNovel(
  NovelSnapshot source, {
  required String title,
  required num now,
  String Function() createId = newId,
}) => copyNovel(source, title: title, now: now, createId: createId, include: (c) => !historyCollections.contains(c));

/// A new, empty novel organised like [source]: its setup ([setupCollections]), none of its story. What would point at
/// story records (the characters a progress category is for) is cleared rather than left pointing at the source.
NovelSnapshot setupOf(NovelSnapshot source, JsonMap details, {required num now, String Function() createId = newId}) {
  final copy = copyNovel(
    source.copyWith(project: {...details, 'id': source.projectId}),
    title: str(details['title']),
    now: now,
    createId: createId,
    include: setupCollections.contains,
  );
  return copy.withRows('progressCategories', [
    for (final r in copy.rows('progressCategories')) {...r, 'characterIds': <String>[]},
  ]);
}

/// Every place in [copy] that still holds an id of [source]: a reference back into the other novel. Empty for a
/// proper copy. Used to check copies, and by tests.
List<String> foreignReferences(NovelSnapshot source, NovelSnapshot copy) {
  final ids = <String>{
    source.projectId,
    for (final rows in source.collections.values)
      for (final r in rows)
        if (r['id'] case final String id) id,
  };
  final found = <String>[];
  void scan(Object? v, String where) {
    switch (v) {
      case final String s:
        final parts = s.split(_separators);
        if (ids.contains(s) || parts.any(ids.contains)) found.add('$where: $s');
      case final List<Object?> l:
        for (final (i, x) in l.indexed) {
          scan(x, '$where[$i]');
        }
      case final Map<Object?, Object?> m:
        final proseText = m['type'] == 'text';
        for (final e in m.entries) {
          scan('${e.key}', '$where{key}');
          if (!(proseText && e.key == 'text')) scan(e.value, '$where.${e.key}');
        }
    }
  }

  scan(copy.project, 'project');
  for (final e in copy.collections.entries) {
    for (final r in e.value) {
      scan(r, '${e.key}/${r['id']}');
    }
  }
  return found;
}
