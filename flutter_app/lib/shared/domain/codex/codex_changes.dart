import 'dart:math' as math;

import '../collation.dart';
import '../json.dart';
import '../model/entity_ref.dart';
import '../records/canon.dart';
import '../records/category.dart';
import '../records/entry.dart';
import '../records/link.dart';
import '../snapshot/novel_snapshot.dart';
import '../stable_sort.dart';
import 'capabilities.dart';

/// A change the author asked for that cannot be made as asked, with the reason in plain words. Nothing is changed.
class ChangeRefused implements Exception {
  ChangeRefused(this.message);
  final String message;

  @override
  String toString() => message;
}

/// A change being made to one novel: it starts from what was read, operations are applied in order (each building on
/// the ones before, as the original app's transactions do), and [snapshot] is then saved against what was read, so a
/// newer save elsewhere is never overwritten.
class RecordChanges {
  RecordChanges(this.snapshot, {required this.now, required String Function() createId}) : _createId = createId;

  NovelSnapshot snapshot;
  final int now;
  final String Function() _createId;

  String newId() => _createId();
  String get projectId => snapshot.projectId;

  List<JsonMap> rows(String collection) => snapshot.rows(collection);
  JsonMap? row(String collection, String id) => rows(collection).where((r) => r['id'] == id).firstOrNull;
  void put(String collection, JsonMap row) => snapshot = snapshot.putRow(collection, row);
  void remove(String collection, String id) => snapshot = snapshot.withRows(collection, [
    for (final r in rows(collection))
      if (r['id'] != id) r,
  ]);
}

const _maxCoverLength = 2000000;
final _coverPattern = RegExp(r'^(https?://\S+$|data:image/(png|jpeg|webp|gif);base64,)', caseSensitive: false);

/// An image the app keeps: a web address or an uploaded picture as a data URL, within the size the original allows.
/// Anything else is no image.
String? normalizeImage(Object? value) {
  final image = value is String ? value : '';
  return image.isNotEmpty && image.length <= _maxCoverLength && _coverPattern.hasMatch(image) ? image : null;
}

/// Tags as the codex keeps them: trimmed, without blanks or repeats, in the order given.
List<String> cleanList(Iterable<Object?> values) => {
  for (final v in values)
    if (v is String && v.trim().isNotEmpty) v.trim(),
}.toList();

/// The novel's categories, the built-ins (with the author's changes) and the author's own.
Map<String, Category> categoriesOf(NovelSnapshot s) => {
  for (final c in resolveCategories([for (final r in s.rows('loreSchemas')) Category(r)])) c.key: c,
};

/// Limits that keep custom fields from swelling past what the app can show and check well, as in the original.
const fieldLimits = (fields: 60, options: 100, name: 60, help: 200);

/// Colours given to categories the author creates, in turn.
const customColors = ['#2b7a8c', '#a8436b', '#6b7a2b', '#a3622b', '#4f5fa3', '#8c2b5a', '#2b8c6b', '#7a5c3d'];

String _cut(String s, int n) => s.length > n ? s.substring(0, n) : s;

/// Choices as stored: trimmed, at most 60 characters each, without blanks or repeats, at most 100.
List<String> cleanOptions(Object? options) => cleanList([
  for (final o in listOf(options)) o is String ? _cut(o.trim(), fieldLimits.name) : '',
]).take(fieldLimits.options).toList();

num? _finite(Object? value) {
  if (value is num) return value.isFinite ? value : null;
  if (value is String && value.trim().isNotEmpty) {
    final n = num.tryParse(value.trim());
    return n != null && n.isFinite ? n : null;
  }
  return null;
}

const _defKeys = {'id', 'name', 'type', 'options', 'archived', 'required', 'help', 'min', 'max', 'target'};

/// A field set as stored, as the original app cleans it: each field has an id, a name, a known type and clean choices;
/// the rules a field may carry (required, help, a number range, the kind a link points at) are kept only where they fit
/// its type. Whatever else a field holds (written by a later version) is kept beside it.
List<JsonMap> cleanDefs(Object? defs, String Function() newId) => [
  for (final raw in listOf(defs))
    () {
      final def = mapOrNull(raw) ?? const <String, Object?>{};
      final type = FieldType.of(def['type'])?.name ?? 'text';
      final min = type == 'number' ? _finite(def['min']) : null;
      final max = type == 'number' ? _finite(def['max']) : null;
      final help = def['help'] is String ? _cut((def['help']! as String).trim(), fieldLimits.help) : '';
      final name = def['name'] is String && (def['name']! as String).trim().isNotEmpty
          ? (def['name']! as String).trim()
          : 'Untitled field';
      final target = def['target'];
      return <String, Object?>{
        for (final e in def.entries)
          if (!_defKeys.contains(e.key)) e.key: e.value,
        'id': def['id'] is String && (def['id']! as String).isNotEmpty ? def['id'] : newId(),
        'name': _cut(name, fieldLimits.name),
        'type': type,
        'options': cleanOptions(def['options']),
        if (def['archived'] == true) 'archived': true,
        if (def['required'] == true) 'required': true,
        if (help.isNotEmpty) 'help': help,
        'min': ?min,
        if (max != null && (min == null || max >= min)) 'max': max,
        if ((type == 'reference' || type == 'references') && target is String && target.isNotEmpty) 'target': target,
      };
    }(),
];

/// Whether an entry matches what was typed: its name, summary, description, tags, and its fields' names and values.
bool matchesEntry(Entry entry, String query) {
  final needle = query.trim().toLowerCase();
  if (needle.isEmpty) return true;
  return [
    entry.name,
    entry.summary,
    entry.description,
    ...entry.tags,
    for (final f in entry.fields) ...[f.key, f.value],
  ].any((t) => t.toLowerCase().contains(needle));
}

/// Codex changes: entries, the values of their category's fields, and links between entries. As the original app's
/// codex service. REFERENCE ISOLATION RULE: nothing here reads or writes manuscript text.
class CodexChanges extends RecordChanges {
  CodexChanges(super.snapshot, {required super.now, required super.createId});

  Entry owned(String entryId) {
    final row = this.row('loreEntries', entryId);
    if (row == null) throw ChangeRefused('That entry is no longer in this novel.');
    return Entry(row);
  }

  Category category(String key) => categoriesOf(snapshot)[key] ?? Category.unknown(key);

  void putEntry(Entry entry, JsonMap changes) => put('loreEntries', entry.merged({...changes, 'updatedAt': now}));

  /// A new entry of a category, with only a name. The category's fields show on it by themselves; only values the
  /// author writes are stored.
  /// [id], when given, is the new entry's permanent id (a fresh one decided beforehand, so a preview can show the
  /// colour it will keep); otherwise a new one is made.
  Entry createEntry(String categoryKey, [String? name, String? id]) {
    final kind = categoriesOf(snapshot)[categoryKey];
    if (kind == null) throw ChangeRefused('Unknown category.');
    if (kind.archived) throw ChangeRefused('${kind.name} is archived. Restore it to add entries.');
    final entry = <String, Object?>{
      'id': id ?? newId(),
      'projectId': projectId,
      'category': categoryKey,
      'name': (name ?? '').trim().isNotEmpty ? name!.trim() : 'New ${kind.singular.toLowerCase()}',
      'summary': '',
      'description': '',
      'image': null,
      'notes': '',
      'tags': <String>[],
      'fields': <Object?>[],
      'createdAt': now,
      'updatedAt': now,
    };
    put('loreEntries', entry);
    return Entry(entry);
  }

  /// Changes an entry's own details. Only what is given changes.
  void updateEntry(
    String entryId, {
    String? name,
    String? summary,
    String? description,
    ({String? value})? image,
    List<String>? tags,
    String? category,
    String? notes,
  }) {
    final entry = owned(entryId);
    putEntry(entry, {
      if (category != null && categoriesOf(snapshot).containsKey(category)) 'category': category,
      'notes': ?notes,
      if (name != null) 'name': name.trim().isNotEmpty ? name.trim() : 'Untitled entry',
      'summary': ?summary,
      'description': ?description,
      if (image != null) 'image': normalizeImage(image.value),
      if (tags != null) 'tags': cleanList(tags),
    });
  }

  /// Sets this entry's value for one field of its category, based on the entry as stored.
  void setFieldValue(String entryId, String defId, String value) {
    final entry = owned(entryId);
    final slot = viewFields(entry, category(entry.category)).category.where((c) => c.$1.id == defId).firstOrNull;
    if (slot == null) throw ChangeRefused('That field is not part of this category.');
    final (def, field) = slot;
    final stored = <String, Object?>{
      ...?field?.raw,
      'id': field?.id ?? newId(),
      'key': def.name,
      'value': value,
      'type': def.raw['type'],
      'defId': defId,
    };
    putEntry(entry, {
      'fields': field == null
          ? [...listOf(entry.raw['fields']), stored]
          : [for (final f in listOf(entry.raw['fields'])) (f is Map && f['id'] == field.id) ? stored : f],
    });
  }

  /// Replaces the fields that belong to this entry alone. Values for the category's fields, current or archived, are
  /// left as they are. Completely empty rows are dropped, as the original does.
  void setOwnFields(String entryId, List<JsonMap> own) {
    final entry = owned(entryId);
    final view = viewFields(entry, category(entry.category));
    final kept = {for (final (_, f) in view.category) ?f?.id, for (final (_, f) in view.archived) f.id};
    final mine = [
      for (final f in own)
        if (!kept.contains(f['id']) &&
            ((f['key'] is String && (f['key']! as String).trim().isNotEmpty) ||
                (f['value'] is String && (f['value']! as String).trim().isNotEmpty)))
          <String, Object?>{
            for (final e in f.entries)
              if (e.key != 'defId') e.key: e.value,
            'id': f['id'] is String && (f['id']! as String).isNotEmpty ? f['id'] : newId(),
            'key': str(f['key']).trim(),
            'value': str(f['value']),
            if (f['options'] is List && listOf(f['options']).isNotEmpty) 'options': cleanOptions(f['options']),
          },
    ];
    putEntry(entry, {
      'fields': [
        for (final f in listOf(entry.raw['fields']))
          if (f is Map && kept.contains(f['id'])) f,
        ...mine,
      ],
    });
  }

  /// Sets where a link between two entries stands: confirmed (canon), provisional, disputed or invalid.
  void setLinkCanon(String linkId, CanonStatus status) {
    final link = _ownedLink(linkId);
    put('loreLinks', link.merged({'canon': status.key, 'updatedAt': now}));
  }

  List<Category> categories() => [...categoriesOf(snapshot).values];

  /// Creates a category ([key] null) or changes one, from [edit] given the category as stored right now. Fields are
  /// never removed by this: a field left out is kept, archived, so every value entries hold for it survives.
  Category saveCategory(String? key, JsonMap Function(Category? current) edit) {
    final all = categories();
    final rows = this.rows('loreSchemas');
    final current = key == null ? null : all.where((c) => c.key == key).firstOrNull;
    if (key != null && current == null) throw ChangeRefused('Unknown category.');
    final changes = edit(current);
    final row = current == null ? null : rows.where((r) => r['key'] == current.key).firstOrNull;
    final name = (changes['name'] is String ? changes['name']! as String : current?.name ?? '').trim();
    if (name.isEmpty) throw ChangeRefused('Give the category a name.');
    final clash = all
        .where((c) => c.key != current?.key && c.name.trim().toLowerCase() == name.toLowerCase())
        .firstOrNull;
    if (clash != null) throw ChangeRefused('There is already a category called “${clash.name}”.');

    var fields = current == null ? <JsonMap>[] : [for (final f in maps(current.raw['fields'])) f];
    if (changes.containsKey('fields')) {
      // A link may only be limited to a category that exists.
      final next = [
        for (final d in cleanDefs(changes['fields'], newId))
          d['target'] != null && !all.any((c) => c.key == d['target']) ? ({...d}..remove('target')) : d,
      ];
      if (next.where((d) => d['archived'] != true).length > fieldLimits.fields) {
        throw ChangeRefused('A category can have at most ${fieldLimits.fields} fields.');
      }
      final ids = {for (final d in next) d['id']};
      fields = [
        ...next,
        for (final d in fields)
          if (!ids.contains(d['id'])) {...d, 'archived': true},
      ];
    }
    // Which fields the views read: only fields the category has.
    final uses = cleanUses(changes.containsKey('uses') ? changes['uses'] : current?.raw['uses'], [
      for (final f in fields) str(f['id']),
    ]);
    final archived = (changes['archived'] ?? current?.archived) == true && !(current?.builtin ?? false);
    final graph = changes.containsKey('graph') ? changes['graph'] : current?.raw['graph'];
    final order =
        numOrNull(changes['order']) ?? current?.order ?? all.fold<num>(-1, (m, c) => math.max(m, c.order)) + 1;
    final singular = (changes['singular'] is String ? changes['singular']! as String : current?.singular ?? '').trim();
    final color = changes['color'] is String && (changes['color']! as String).isNotEmpty
        ? changes['color']
        : (current?.color.isNotEmpty ?? false)
        ? current!.color
        : customColors[all.where((c) => !c.builtin).length % customColors.length];
    final saved = <String, Object?>{
      // Whatever a later version stored on the category is kept.
      for (final e in (row ?? const <String, Object?>{}).entries)
        if (!const {'archived', 'graph', 'uses'}.contains(e.key)) e.key: e.value,
      'id': row?['id'] ?? newId(),
      'projectId': projectId,
      'key': current?.key ?? 'custom-${newId()}',
      'name': name,
      'singular': singular.isNotEmpty ? singular : name,
      'color': color,
      'builtin': current?.builtin ?? false,
      'order': order,
      if (archived) 'archived': true,
      if (graph == false) 'graph': false,
      'fields': fields,
      'uses': ?uses,
      'createdAt': row?['createdAt'] ?? now,
      'updatedAt': now,
    };
    put('loreSchemas', saved);
    return Category(saved);
  }

  /// One category as template data: its name, colour, fields (archived ones left out), rules and view settings. The
  /// "show in the knowledge graph" setting is not carried: it is a choice about one novel's graph.
  static JsonMap kindTemplate(Category c) => {
    'key': c.key,
    'name': c.name,
    'singular': c.singular,
    'color': c.color,
    'builtin': c.builtin,
    'fields': [
      for (final f in c.fields)
        if (!f.archived) f.raw,
    ],
    if (c.raw['uses'] != null) 'uses': c.raw['uses'],
  };

  /// The novel's categories and fields as template data (archived ones left out).
  List<JsonMap> schemaSnapshot() => [
    for (final c in categories())
      if (!c.archived) kindTemplate(c),
  ];

  /// Adds a template's categories and fields to this novel (a preset). It only ever adds: a category or field that
  /// already exists (by name) is left exactly as it is, and nothing is removed or retyped.
  List<Category> addKinds(List<JsonMap> incomingAll) {
    var all = categories();
    bool same(String a, String b) => a.trim().toLowerCase() == b.trim().toLowerCase();
    Category? matching(JsonMap incoming) => incoming['builtin'] == true && builtinCategoryKeys.contains(incoming['key'])
        ? all.where((c) => c.key == incoming['key']).firstOrNull
        : all.where((c) => same(c.name, str(incoming['name']))).firstOrNull;
    final here = [for (final incoming in incomingAll) matching(incoming)?.key ?? 'custom-${newId()}'];
    final keys = <String, String>{};
    for (final (i, incoming) in incomingAll.indexed) {
      final key = str(incoming['key']);
      if (key.isNotEmpty && incomingAll.where((x) => x['key'] == key).length == 1) keys[key] = here[i];
    }
    bool known(String key) => all.any((c) => c.key == key) || here.contains(key);
    for (final (index, incoming) in incomingAll.indexed) {
      final target = matching(incoming);
      final cleaned = cleanDefs(incoming['fields'], newId);
      final fresh = [
        for (final def in cleaned)
          () {
            final limited = def['target'] is String ? (keys[def['target']] ?? def['target']! as String) : null;
            return <String, Object?>{
                ...def,
                'id': newId(),
                'target': limited != null && known(limited) ? limited : null,
              }
              ..remove('archived')
              ..removeWhere((k, v) => k == 'target' && v == null);
          }(),
      ];
      if (target == null && str(incoming['name']).trim().isEmpty) continue;
      final baseFields = target == null ? <JsonMap>[] : [for (final f in maps(target.raw['fields'])) f];
      final fields = [
        ...baseFields,
        for (final def in fresh)
          if (!baseFields.any((e) => same(str(e['name']), str(def['name'])))) def,
      ];
      String? idOf(String id) {
        final i = cleaned.indexWhere((d) => d['id'] == id);
        if (i < 0) return null;
        final existing = baseFields.where((e) => same(str(e['name']), str(fresh[i]['name']))).firstOrNull;
        return str((existing ?? fresh[i])['id']);
      }

      final baseUses = target == null ? null : mapOrNull(target.raw['uses']);
      final uses = mergeUses(baseUses, remapUses(mapOrNull(incoming['uses']), idOf));
      if (target != null && fields.length == baseFields.length && jsonEquals(uses, baseUses)) continue;
      final name = str(incoming['name']).trim();
      final row = rows('loreSchemas').where((r) => r['key'] == (target?.key ?? here[index])).firstOrNull;
      final base =
          target?.raw ??
          {
            'key': here[index],
            'name': name,
            'singular': str(incoming['singular']).trim().isNotEmpty ? str(incoming['singular']).trim() : name,
            'color': str(incoming['color']).isNotEmpty
                ? incoming['color']
                : customColors[all.where((c) => !c.builtin).length % customColors.length],
            'builtin': false,
            'order': all.fold<num>(-1, (m, c) => math.max(m, c.order)) + 1,
          };
      put('loreSchemas', {
        ...base,
        'fields': fields,
        'uses': ?uses,
        'id': row?['id'] ?? newId(),
        'projectId': projectId,
        'createdAt': row?['createdAt'] ?? now,
        'updatedAt': now,
      });
      all = categories();
    }
    return all;
  }

  // ------------------------------------------------------------------------------------------------- typed connections

  /// Whether a record is in this novel. An ability is `<systemId>/<itemId>`: its blueprint must hold the item.
  bool recordExists(EntityRef ref) {
    if (ref.type == EntityType.ability) {
      final slash = ref.id.indexOf('/');
      if (slash < 0) return false;
      final system = row('systems', ref.id.substring(0, slash));
      final item = ref.id.substring(slash + 1);
      return system != null && maps(system['items']).any((i) => i['id'] == item);
    }
    final table = switch (ref.type) {
      EntityType.node => 'chapters',
      EntityType.entry => 'loreEntries',
      EntityType.event => 'timelineEvents',
      EntityType.thread => 'plotThreads',
      EntityType.relation => 'characterRelations',
      EntityType.ability => '',
    };
    return row(table, ref.id) != null;
  }

  static String _typeKey(String? type) => (type ?? '').trim().isEmpty ? 'related' : type!.trim();
  static String _words(String? value) {
    final t = (value ?? '').trim();
    return t.length > 80 ? t.substring(0, 80) : t;
  }

  /// Connects two records of the novel: one statement, made from [from]'s side. A kind the author makes up is kept as
  /// written. As in the original: both ends must exist here, a record is not connected to itself, and the same
  /// statement twice is refused (a different kind between the same two is a different connection).
  Link createConnection({
    required EntityRef from,
    required EntityRef to,
    String? type,
    String label = '',
    String reverseLabel = '',
    String notes = '',
    CanonStatus? canon,
    JsonMap? startsAt,
    String how = '',
  }) {
    for (final (which, end) in [('first', from), ('second', to)]) {
      if (end.id.trim().isEmpty) throw ChangeRefused('The $which end has no id.');
    }
    if (startsAt != null) checkPoint(startsAt);
    final validity = startsAt == null ? null : {'from': startsAt, 'until': null};
    if (from == to) throw ChangeRefused('A record cannot be connected to itself.');
    for (final (which, end) in [('first', from), ('second', to)]) {
      if (!recordExists(end)) throw ChangeRefused('The $which end (${end.type.name} ${end.id}) is not in this novel.');
    }
    final key = _typeKey(type);
    final twin = rows('loreLinks')
        .map(Link.new)
        .any(
          (l) =>
              l.fromId == from.id &&
              l.toId == to.id &&
              _typeKey(l.type) == key &&
              l.fromType == from.type &&
              l.toType == to.type &&
              jsonEquals(l.raw['validity'], validity),
        );
    if (twin) throw ChangeRefused('That connection already exists.');
    final link = <String, Object?>{
      'id': newId(),
      'projectId': projectId,
      'fromId': from.id,
      'toId': to.id,
      'fromLabel': label.trim(),
      'toLabel': reverseLabel.trim(),
      'createdAt': now,
      'fromType': from.type.name,
      'toType': to.type.name,
      'type': key,
      'notes': notes.trim(),
      if (canon != null) 'canon': canon.key,
      'validity': ?validity,
      if (_words(how).isNotEmpty) 'how': _words(how),
      'updatedAt': now,
    };
    put('loreLinks', link);
    return Link(link);
  }

  /// A point in the story: a chapter or scene or event of this novel, or a date (as the original's connections
  /// accept).
  void checkPoint(JsonMap anchor) {
    final when = mapOrNull(anchor['when']);
    final ok = switch (anchor['kind']) {
      'node' => row('chapters', str(anchor['nodeId'])) != null,
      'event' => row('timelineEvents', str(anchor['eventId'])) != null,
      'date' =>
        const ['exact', 'approximate', 'relative', 'unknown'].contains(when?['precision']) &&
            (when?['precision'] != 'relative' || row('timelineEvents', str(when?['anchorId'])) != null),
      _ => false,
    };
    if (!ok) throw ChangeRefused('That chapter, scene, event or date is not in this novel.');
  }

  /// Changes how a connection reads: its kind, each side's words, notes, status. Only what is given changes.
  Link updateConnection(
    String linkId, {
    String? type,
    String? label,
    String? reverseLabel,
    String? notes,
    ({CanonStatus? value})? canon,
    String? how,
    String? endHow,
  }) {
    final link = _ownedLink(linkId);
    final next = link.merged({
      if (type != null) 'type': _typeKey(type),
      if (label != null) 'fromLabel': label.trim(),
      if (reverseLabel != null) 'toLabel': reverseLabel.trim(),
      if (notes != null) 'notes': notes.trim(),
      if (canon != null) 'canon': canon.value?.key,
      if (how != null) 'how': _words(how).isEmpty ? null : _words(how),
      if (endHow != null) 'endHow': _words(endHow).isEmpty ? null : _words(endHow),
      'updatedAt': now,
    })..removeWhere((k, v) => v == null && (k == 'canon' || k == 'how' || k == 'endHow'));
    put('loreLinks', next);
    return Link(next);
  }

  /// Removes a connection. The records at its ends are not touched.
  void removeConnection(String linkId) {
    _ownedLink(linkId);
    remove('loreLinks', linkId);
  }

  Link _ownedLink(String linkId) {
    final row = this.row('loreLinks', linkId);
    if (row == null) throw ChangeRefused('That link no longer exists.');
    return Link(row);
  }

  /// Relates two entries. Each will list the other; [label] is the first entry's wording.
  Link linkEntries(String entryId, String otherId, [String label = '']) {
    if (entryId == otherId) throw ChangeRefused('An entry cannot be linked to itself.');
    owned(entryId);
    owned(otherId);
    // Two entries have one plain link; typed connections between them ("owns", "created by") are separate.
    final existing = rows('loreLinks')
        .map(Link.new)
        .any(
          (l) =>
              (l.fromId == entryId || l.toId == entryId) &&
              l.type == null &&
              l.isEntryLink &&
              (l.fromId == otherId || l.toId == otherId),
        );
    if (existing) throw ChangeRefused('These entries are already linked.');
    final link = <String, Object?>{
      'id': newId(),
      'projectId': projectId,
      'fromId': entryId,
      'toId': otherId,
      'fromLabel': label.trim(),
      'toLabel': '',
      'createdAt': now,
    };
    put('loreLinks', link);
    return Link(link);
  }

  /// Sets how [entryId] describes one of its links.
  void labelLink(String linkId, String entryId, String label) {
    final link = _ownedLink(linkId);
    if (link.fromId != entryId && link.toId != entryId) {
      throw ChangeRefused('That link does not belong to this entry.');
    }
    put('loreLinks', link.merged({link.fromId == entryId ? 'fromLabel' : 'toLabel': label.trim()}));
  }

  /// Removes the relationship from both entries.
  void unlink(String linkId) {
    _ownedLink(linkId);
    remove('loreLinks', linkId);
  }
}

/// An entry related to another, with this side's wording of the relationship.
class RelatedEntry {
  RelatedEntry(this.linkId, this.entry, this.label, this.theirLabel);

  final String linkId;
  final Entry entry;
  final String label;
  final String theirLabel;
}

/// Entries related to [entryId], each with this side's wording, by name.
List<RelatedEntry> relatedTo(String entryId, Iterable<Entry> entries, Iterable<Link> links) {
  final byId = {for (final e in entries) e.id: e};
  return stableSorted([
    for (final link in links)
      if ((link.fromId == entryId || link.toId == entryId) && link.isEntryLink)
        if (byId[link.fromId == entryId ? link.toId : link.fromId] case final entry?)
          () {
            final words = wordingOf(link);
            final outgoing = link.fromId == entryId;
            return RelatedEntry(
              link.id,
              entry,
              outgoing ? words.forward : words.backward,
              outgoing ? words.backward : words.forward,
            );
          }(),
  ], (a, b) => localeCompare(a.entry.name, b.entry.name));
}
