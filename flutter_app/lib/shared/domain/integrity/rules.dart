import '../codex/capabilities.dart';
import '../codex/field_values.dart';
import '../collation.dart';
import '../json.dart';
import '../model/connections.dart';
import '../model/entity_ref.dart';
import '../model/story_model.dart';
import '../records/canon.dart';
import '../records/category.dart';
import '../records/entry.dart';
import '../stable_sort.dart';
import '../text/fold.dart';

/// RECORD INTEGRITY (as in the original app)
/// Deterministic checks of how records point at one another. Each finding comes from one stated rule and the records
/// it rests on; the same records give the same findings every time. Nothing here changes anything: fixes are offered,
/// and made only when the author chooses one.

// ------------------------------------------------------------------------------------------------- connection status

/// A stored connection's status, in the words used for connections. Its canon status underneath: one status.
enum ConnectionStatus {
  confirmed('Confirmed'),
  provisional('Provisional'),
  disputed('Disputed'),
  invalid('Invalid');

  const ConnectionStatus(this.label);
  final String label;
}

ConnectionStatus statusOfCanon(CanonStatus canon) => switch (canon) {
  CanonStatus.canon => ConnectionStatus.confirmed,
  CanonStatus.provisional => ConnectionStatus.provisional,
  CanonStatus.conflicting => ConnectionStatus.disputed,
  CanonStatus.retconned || CanonStatus.nonCanon => ConnectionStatus.invalid,
};

/// How a canon status reads on a connection.
String connectionStatusLabel(CanonStatus s) => switch (s) {
  CanonStatus.canon => 'Confirmed',
  CanonStatus.provisional => 'Provisional',
  CanonStatus.conflicting => 'Disputed',
  CanonStatus.retconned => 'Invalid: retconned',
  CanonStatus.nonCanon => 'Invalid: not canon',
};

/// Only stored connections have a status (none said means confirmed); everything else is a fact of the records.
ConnectionStatus? statusOf(Connection c) =>
    c.kind == ConnectionKind.link ? statusOfCanon(CanonStatus.of(c.canon) ?? CanonStatus.canon) : null;

// ----------------------------------------------------------------------------------------------- where it is kept

const sourceWords = {
  'loreLinks': 'a connection you recorded',
  'characterRelations': 'a character relationship',
  'loreEntries': 'a field of an entry',
  'chapters': 'a link in the manuscript’s text',
  'chapterPlans': 'a chapter’s or scene’s plan',
  'timelineEvents': 'a timeline event',
  'plotThreads': 'a plot thread',
  'systemSheets': 'a system sheet',
  'systems': 'a system blueprint',
  'structureMarkers': 'a structural marker',
  'progressChanges': 'a progression change',
  'journeys': 'a journey',
};

/// Where a reference can be taken out by the app: everything but text, which is changed in the editor.
const fixable = {
  'loreLinks',
  'characterRelations',
  'loreEntries',
  'chapterPlans',
  'timelineEvents',
  'plotThreads',
  'systemSheets',
  'structureMarkers',
  'progressChanges',
  'journeys',
};

/// Connections and relationships with a missing end go whole.
const goesWhole = {'loreLinks', 'characterRelations'};

// ------------------------------------------------------------------------------------------------ broken references

/// What an id looks like: a value that is the id of a deleted record, rather than words.
final _idLike = RegExp(
  r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^[\w-]{20,}$',
  caseSensitive: false,
);

class BrokenReference {
  BrokenReference({
    required this.key,
    required this.where,
    required this.table,
    required this.rowId,
    required this.missing,
    required this.says,
  });

  /// The same broken reference has the same key on every run.
  final String key;

  /// What holds the reference, in words.
  final String where;
  final String table;
  final String rowId;

  /// The id that names nothing now, and what kind of record it named.
  final EntityRef missing;

  /// What it said, in words.
  final String says;
}

String _kindWords(EntityType t) => switch (t) {
  EntityType.node => 'chapter or scene',
  EntityType.entry => 'codex entry',
  _ => t.name,
};

/// Rule: a reference must name a record that exists. Every reference the shared model reads, and every structural
/// marker ([markers], rows of `structureMarkers`), is checked.
List<BrokenReference> brokenReferences(StoryModel model, [List<JsonMap> markers = const []]) {
  final out = <BrokenReference>[];
  String name(EntityRef ref) => model.resolve(ref)?.label ?? 'a record that is gone';
  for (final d in deriveConnections(model).dangling) {
    final connection = d.connection;
    for (final gone in d.missing) {
      // A field holding words, not an id, is a reference that names nothing, not a broken one.
      if (connection.kind == ConnectionKind.field && !_idLike.hasMatch(gone.id)) continue;
      final other = connection.from == gone ? connection.to : connection.from;
      final table = connection.source.collection;
      out.add(
        BrokenReference(
          key: 'integrity|broken|${connection.id}|${gone.type.name}:${gone.id}',
          where: sourceWords[table] ?? table,
          table: table,
          rowId: connection.source.id,
          missing: gone,
          says:
              '${name(other)}: “${connection.label.isNotEmpty ? connection.label : connection.kind.key}” points at a '
              '${_kindWords(gone.type)} that no longer exists',
        ),
      );
    }
  }
  for (final marker in markers) {
    for (final (field, type) in [('nodeId', EntityType.node), ('eventId', EntityType.event)]) {
      final id = idOrNull(marker[field]);
      if (id == null || model.exists(EntityRef(type, id))) continue;
      final title = str(marker['title']);
      out.add(
        BrokenReference(
          key: 'integrity|broken|marker:${str(marker['id'])}:$field',
          where: sourceWords['structureMarkers']!,
          table: 'structureMarkers',
          rowId: str(marker['id']),
          missing: EntityRef(type, id),
          says:
              'The marker “${str(marker['kind'])}${title.isNotEmpty ? ': $title' : ''}” is placed at a '
              '${type == EntityType.node ? 'chapter or scene' : 'timeline event'} that no longer exists',
        ),
      );
    }
  }
  return stableSorted(out, (a, b) {
    final c = localeCompare(a.says, b.says);
    return c != 0 ? c : localeCompare(a.key, b.key);
  });
}

/// A record with one reference taken out, and nothing else changed: an id in a list goes from the list; an item of a
/// list that is that reference (`{id, age}` for a character at an event) goes; a single reference becomes empty. What
/// holds it (a beat, a field) stays, so no work is lost.
Object? withoutReference(Object? value, String id, [int depth = 0]) {
  if (value is List) {
    return [
      for (final v in value)
        if (v != id && !(v is Map && v['id'] == id)) withoutReference(v, id, depth + 1),
    ];
  }
  if (value is Map && depth < 5) {
    return <String, Object?>{
      for (final e in value.entries)
        '${e.key}': e.key != 'id' && e.value == id
            ? (e.key == 'value' ? '' : null)
            : (e.key == 'value' && e.value is String && (e.value! as String).split('\n').contains(id))
            ? [
                for (final part in (e.value! as String).split('\n'))
                  if (part != id) part,
              ].join('\n')
            : withoutReference(e.value, id, depth + 1),
    };
  }
  return value;
}

// ------------------------------------------------------------------------------------- references that name nothing

/// A name as compared for likeness: no accents, capitals, punctuation or leading article.
String normalizeName(String name) => foldText(
  name,
).replaceAll(RegExp(r'[^\p{L}\p{N}]+', unicode: true), ' ').trim().replaceFirst(RegExp(r'^(the|a|an) '), '');

class UnresolvedField {
  UnresolvedField(this.key, this.entry, this.fieldId, this.fieldName, this.value, this.suggestions);

  final String key;
  final Entry entry;
  final String fieldId;
  final String fieldName;

  /// What the field holds that names no entry.
  final String value;

  /// Entries whose name matches it, ignoring capitals, accents, punctuation and a leading article.
  final List<Entry> suggestions;
}

/// Rule: a field that refers to an entry ("Leader", "Owner") must hold an entry, not words. An id of a deleted entry
/// is a broken reference instead.
List<UnresolvedField> unresolvedFields(StoryModel model) {
  final entries = model.entries.values.toList();
  final out = <UnresolvedField>[];
  for (final entry in entries) {
    final category = model.categories[entry.category] ?? Category.unknown(entry.category);
    final defs = {for (final d in category.fields) d.id: d};
    for (final field in entry.fields) {
      final type = field.defId != null ? (defs[field.defId]?.type ?? field.type) : field.type;
      if (type != FieldType.reference && type != FieldType.references) continue;
      for (final value in [
        for (final v in field.value.split('\n'))
          if (v.trim().isNotEmpty) v.trim(),
      ]) {
        if (model.entries.containsKey(value) || _idLike.hasMatch(value)) continue;
        final wanted = normalizeName(value);
        final defName = field.defId == null ? null : defs[field.defId]?.name;
        out.add(
          UnresolvedField(
            'integrity|unresolved|${entry.id}|${field.id}|$wanted',
            entry,
            field.id,
            (defName != null && defName.isNotEmpty) ? defName : (field.key.isNotEmpty ? field.key : 'A field'),
            value,
            [
              for (final e in entries)
                if (e.id != entry.id && normalizeName(e.name) == wanted) e,
            ],
          ),
        );
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------------- duplicates

enum DuplicateRule { sameName, alias }

class DuplicatePair {
  DuplicatePair(this.key, this.a, this.b, this.rule, this.because);

  final String key;
  final Entry a;
  final Entry b;
  final DuplicateRule rule;

  /// Why they look alike, in words.
  final String because;
}

/// Rules: two entries of the same category look like duplicates when their names are the same once capitals, accents,
/// punctuation and a leading article are set aside, or when one's name is another's alias. Nothing is merged: the
/// author decides.
List<DuplicatePair> duplicateCandidates(List<Entry> entries, [Map<String, List<String>> aliases = const {}]) {
  final pairs = <String, DuplicatePair>{};
  void add(Entry x, Entry y, DuplicateRule rule, String because) {
    final (a, b) = x.id.compareTo(y.id) < 0 ? (x, y) : (y, x);
    final key = 'integrity|duplicate|${a.id}|${b.id}';
    pairs.putIfAbsent(key, () => DuplicatePair(key, a, b, rule, because));
  }

  final byCategory = <String, List<Entry>>{};
  for (final e in entries) {
    (byCategory[e.category] ??= []).add(e);
  }
  for (final group in byCategory.values) {
    final byName = <String, List<Entry>>{};
    for (final e in group) {
      final n = normalizeName(e.name);
      if (n.isNotEmpty) (byName[n] ??= []).add(e);
    }
    for (final same in byName.values) {
      for (var i = 0; i < same.length; i++) {
        for (var j = i + 1; j < same.length; j++) {
          add(
            same[i],
            same[j],
            DuplicateRule.sameName,
            '“${same[i].name}” and “${same[j].name}” are the same name, apart from capitals, accents, punctuation '
            'or a leading “The”.',
          );
        }
      }
    }
    for (final e in group) {
      for (final alias in aliases[e.id] ?? const <String>[]) {
        for (final other in byName[normalizeName(alias)] ?? const <Entry>[]) {
          if (other.id != e.id) {
            add(e, other, DuplicateRule.alias, '“${other.name}” is the name of one and an alias of “${e.name}”.');
          }
        }
      }
    }
  }
  return stableSorted(pairs.values, (x, y) {
    final c = localeCompare(x.a.name, y.a.name);
    return c != 0 ? c : localeCompare(x.key, y.key);
  });
}

// ----------------------------------------------------------------------------- values that do not fit their fields

class UnfitEntry {
  UnfitEntry(this.key, this.entry, this.issues);
  final String key;
  final Entry entry;
  final List<FieldIssue> issues;
}

/// Rule: each value fits its field as its category defines it. Values are never changed by this.
List<UnfitEntry> unfitEntries(StoryModel model) {
  String name(String key) => (model.categories[key] ?? Category.unknown(key)).name;
  return stableSorted([
    for (final entry in model.entries.values)
      if (entryIssues(
            entry,
            model.categories[entry.category] ?? Category.unknown(entry.category),
            model.entries,
            categoryName: name,
          )
          case final issues when issues.isNotEmpty)
        UnfitEntry('integrity|unfit|${entry.id}', entry, issues),
  ], (a, b) => localeCompare(a.entry.name, b.entry.name));
}

/// Stored connections marked disputed or invalid: kept as marked, listed so they are not forgotten.
List<Connection> flaggedConnections(StoryModel model) => [
  for (final c in deriveConnections(model).connections)
    if (statusOf(c) case ConnectionStatus.disputed || ConnectionStatus.invalid) c,
];

// ----------------------------------------------------------------------- views set up on fields that no longer suit

class UnsuitedKind {
  UnsuitedKind(this.key, this.category, this.problems);
  final String key;
  final Category category;
  final List<String> problems;
}

/// Rule: a view a kind was set up for reads fields that still suit it. Only settings the author made are listed: a
/// view never set up is not a problem. Settings are never changed by this.
List<UnsuitedKind> unsuitedKinds(StoryModel model) => stableSorted([
  for (final category in model.categories.values)
    if ([
          for (final v in KindView.values)
            if (category.uses[v.name] != null) ...missingFor(category, v),
          ...missingFor(category, 'graphLabel'),
          ...missingFor(category, 'graphLinks'),
        ]
        case final problems when problems.isNotEmpty)
      UnsuitedKind('integrity|uses|${category.key}', category, problems),
], (a, b) => localeCompare(a.category.name, b.category.name));
