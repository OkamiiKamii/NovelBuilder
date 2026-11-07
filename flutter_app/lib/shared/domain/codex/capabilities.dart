import '../json.dart';
import '../records/category.dart';

/// WHAT A KIND OF RECORD CAN BE SHOWN AS (as in the original app)
/// A category opts into a view by naming, explicitly, the fields that view reads (`uses`): when its records are on a
/// timeline, where on a map, their rank, who holds them, their graph label and links. Nothing is guessed from a field's
/// name. Editing these settings comes with custom record views (Phase 14); here they are kept and carried, by field id.

const fieldNameLimit = 60;

String? _idIn(Object? value, Set<String> ids) => value is String && ids.contains(value) ? value : null;
JsonMap _obj(Object? value) => mapOrNull(value) ?? const {};

/// Settings as stored: only the known ones, each naming a field the category has (archived ones included, so
/// restoring a field restores its setting). Null when nothing is set.
JsonMap? cleanUses(Object? raw, Iterable<String> fieldIds) {
  final r = _obj(raw);
  final ids = fieldIds.toSet();
  final out = <String, Object?>{};
  JsonMap? part(JsonMap value) {
    final kept = {
      for (final e in value.entries)
        if (e.value != null) e.key: e.value,
    };
    return kept.isEmpty ? null : kept;
  }

  final timeline = part({
    'start': _idIn(_obj(r['timeline'])['start'], ids),
    'end': _idIn(_obj(r['timeline'])['end'], ids),
  });
  if (timeline != null) out['timeline'] = timeline;
  final map = part({'x': _idIn(_obj(r['map'])['x'], ids), 'y': _idIn(_obj(r['map'])['y'], ids)});
  if (map != null) out['map'] = map;
  final rank = _idIn(r['rank'], ids);
  if (rank != null) out['rank'] = rank;
  final holding = _obj(r['ownership']);
  final type = holding['type'];
  final ownership = part({
    'type': type is String && type.trim().isNotEmpty
        ? (type.trim().length > fieldNameLimit ? type.trim().substring(0, fieldNameLimit) : type.trim())
        : null,
    'field': _idIn(holding['field'], ids),
  });
  if (ownership != null) out['ownership'] = ownership;
  final graphLabel = _idIn(r['graphLabel'], ids);
  if (graphLabel != null) out['graphLabel'] = graphLabel;
  if (r['graphLinks'] is List) {
    out['graphLinks'] = {for (final v in listOf(r['graphLinks'])) ?_idIn(v, ids)}.toList();
  }
  if (r['tree'] == true) out['tree'] = true;
  return out.isEmpty ? null : out;
}

/// Settings with each field id swapped for the one it became (a template's field, as added to a novel). Ids with no
/// match are left out.
JsonMap? remapUses(JsonMap? uses, String? Function(String id) idOf) {
  if (uses == null) return null;
  String? map(Object? id) => id is String ? idOf(id) : null;
  final timeline = _obj(uses['timeline']);
  final mapPart = _obj(uses['map']);
  final ownership = _obj(uses['ownership']);
  final links = strings(uses['graphLinks']);
  final mentioned = [
    timeline['start'],
    timeline['end'],
    mapPart['x'],
    mapPart['y'],
    uses['rank'],
    ownership['field'],
    uses['graphLabel'],
    ...links,
  ];
  return cleanUses(
    {
      'timeline': {'start': map(timeline['start']), 'end': map(timeline['end'])},
      'map': {'x': map(mapPart['x']), 'y': map(mapPart['y'])},
      'rank': map(uses['rank']),
      'ownership': {'type': ownership['type'], 'field': map(ownership['field'])},
      'graphLabel': map(uses['graphLabel']),
      if (uses['graphLinks'] is List) 'graphLinks': [for (final id in links) ?map(id)],
      'tree': uses['tree'],
    },
    {for (final id in mentioned) ?map(id)},
  );
}

/// Settings added to ones that exist, only where nothing is set yet: a template never changes what an author set.
JsonMap? mergeUses(JsonMap? existing, JsonMap? incoming) {
  if (incoming == null) return existing;
  final out = <String, Object?>{...?existing};
  for (final e in incoming.entries) {
    if (out[e.key] == null) out[e.key] = e.value;
  }
  return out.isEmpty ? null : out;
}

// ---------------------------------------------------------------------------------------------------- what is missing

/// The ways a kind can be shown, beyond the table every kind has.
enum KindView {
  timeline('On a timeline'),
  map('On a map'),
  rank('By rank'),
  ownership('By who holds it');

  const KindView(this.label);
  final String label;

  static KindView? of(Object? key) => values.where((v) => v.name == key).firstOrNull;
}

/// Each place a setting names a field: what it is for, in words, and the field types that can fill it.
enum Slot {
  timelineStart('timeline.start', 'the date on the timeline', [FieldType.number, FieldType.date]),
  timelineEnd('timeline.end', 'the end on the timeline', [FieldType.number, FieldType.date]),
  mapX('map.x', 'across on the map', [FieldType.number]),
  mapY('map.y', 'up on the map', [FieldType.number]),
  rank('rank', 'the rank', [FieldType.number, FieldType.select]),
  ownershipField('ownership.field', 'who holds it now', [FieldType.reference]),
  graphLabel('graphLabel', 'the label in the knowledge graph', [
    FieldType.text,
    FieldType.number,
    FieldType.select,
    FieldType.date,
  ]),
  graphLinks('graphLinks', 'a connection drawn in the knowledge graph', [FieldType.reference, FieldType.references]);

  const Slot(this.key, this.words, this.types);
  final String key;
  final String words;
  final List<FieldType> types;
}

FieldType _typeOf(FieldDef def) => def.type ?? FieldType.text;

/// "a Number or Date field".
String typeWords(Slot slot) => 'a ${slot.types.map((t) => t.label).join(' or ')} field';

String _capital(String s) => s.isEmpty ? s : '${s[0].toUpperCase()}${s.substring(1)}';

/// The fields of a category that can fill a slot: not archived, and of a type it takes.
List<FieldDef> fieldsFor(Category category, Slot slot) => [
  for (final f in category.fields)
    if (!f.archived && slot.types.contains(_typeOf(f))) f,
];

/// The field a slot names, when it can be read: present, not archived, of a type the slot takes.
FieldDef? fieldOf(Category category, Slot slot, Object? id) {
  if (id is! String || id.isEmpty) return null;
  final def = category.fields.where((f) => f.id == id).firstOrNull;
  return def != null && !def.archived && slot.types.contains(_typeOf(def)) ? def : null;
}

/// Why a slot cannot be read, or null when it can. Optional slots say nothing when unset.
String? _slotProblem(Category category, Slot slot, Object? id, {bool optional = false}) {
  final words = slot.words;
  if (id is! String || id.isEmpty) {
    if (optional) return null;
    return fieldsFor(category, slot).isNotEmpty
        ? '${_capital(words)} is not set: choose ${typeWords(slot)}.'
        : '${category.name} has no ${typeWords(slot).substring(2)} for $words: add one, then choose it.';
  }
  final def = category.fields.where((f) => f.id == id).firstOrNull;
  if (def == null) return 'The field chosen for $words no longer exists: choose another.';
  if (def.archived) return '${def.name}, chosen for $words, was removed (archived): restore it or choose another.';
  if (!slot.types.contains(_typeOf(def))) {
    return '${def.name}, chosen for $words, is now ${_typeOf(def).label}; it needs to be ${typeWords(slot)}.';
  }
  if (slot == Slot.rank && def.type == FieldType.select && def.options.length < 2) {
    return '${def.name}, chosen for the rank, has fewer than two choices to rank by.';
  }
  return null;
}

/// What stops a category being shown one way, in words: empty when nothing does. [view] is a [KindView], or
/// `graphLabel` / `graphLinks`.
List<String> missingFor(Category category, Object view) {
  final uses = category.uses;
  final timeline = _obj(uses['timeline']);
  final map = _obj(uses['map']);
  final ownership = _obj(uses['ownership']);
  List<String> found(List<String?> problems) => [for (final p in problems) ?p];
  return switch (view) {
    KindView.timeline => found([
      _slotProblem(category, Slot.timelineStart, timeline['start']),
      _slotProblem(category, Slot.timelineEnd, timeline['end'], optional: true),
    ]),
    KindView.map => found([
      _slotProblem(category, Slot.mapX, map['x']),
      _slotProblem(category, Slot.mapY, map['y']),
      map['x'] is String && (map['x']! as String).isNotEmpty && map['x'] == map['y']
          ? 'The same field is chosen for across and up: choose two different fields.'
          : null,
    ]),
    KindView.rank => found([_slotProblem(category, Slot.rank, uses['rank'])]),
    KindView.ownership => found([
      ownership['type'] is String && (ownership['type']! as String).isNotEmpty
          ? null
          : 'No connection type is chosen as holding '
                '${RegExp('^[aeiou]', caseSensitive: false).hasMatch(category.singular) ? 'an' : 'a'} '
                '${category.singular.toLowerCase()}: choose one, such as Owns.',
      _slotProblem(category, Slot.ownershipField, ownership['field'], optional: true),
    ]),
    'graphLabel' => found([_slotProblem(category, Slot.graphLabel, uses['graphLabel'], optional: true)]),
    'graphLinks' => found([for (final id in strings(uses['graphLinks'])) _slotProblem(category, Slot.graphLinks, id)]),
    _ => const [],
  };
}

/// The views a category is set up for, and can be shown in now.
List<KindView> readyViews(Category category) => [
  for (final v in KindView.values)
    if (missingFor(category, v).isEmpty) v,
];
