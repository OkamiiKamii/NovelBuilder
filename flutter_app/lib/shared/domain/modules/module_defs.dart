import 'dart:convert';

import '../json.dart';
import '../model/story_order.dart';
import '../records/category.dart';
import '../records/relation.dart';
import '../systems/system_changes.dart' show tidyBlueprint;
import 'builtin_modules.g.dart';

/// GENRE MODULES, as the original app's `src/modules/extensions`. A module is described, not coded: the codex
/// categories and fields it brings, an optional starter system, and descriptions of tools ("a board of Suspects
/// grouped by Status") that the app's generic tools draw. Categories and fields are named, not referenced by id, so a
/// module works in any novel and can be written to a file and shared.
///
/// CLEAN CORE RULE: a module adds to a novel and never takes away. Turning it on merges its categories and fields into
/// the codex (what is there stays as it is) and shows its tools; it creates no records. Turning it off hides its tools
/// and tucks away the categories it introduced when they are empty and no other module that is on uses them; nothing
/// written is deleted, and the core never depends on a module being on.

/// Core pages a module can send the author to, rather than rebuild.
const corePages = [
  'systems',
  'progression',
  'graph',
  'timeline',
  'relationships',
  'plot',
  'canon',
  'characters',
  'branches',
  'continuity',
];

const moduleFileFormat = 'novel-builder-module';

String _text(Object? v) => v is String ? v.trim() : '';
List<String> _strings(Object? v) => v is List
    ? [
        for (final x in v)
          if (_text(x).isNotEmpty) _text(x),
      ]
    : const [];
num _number(Object? v, num fallback) => v is num && v.isFinite ? v : fallback;

/// One tool, as a module describes it (`type` and what that kind of tool needs). Null when it is not one this app
/// knows, or it lacks what it needs: the rest of the module still works.
JsonMap? parseTool(Object? raw, int index) {
  final t = mapOrNull(raw) ?? const <String, Object?>{};
  final base = <String, Object?>{
    'id': _text(t['id']).isNotEmpty ? _text(t['id']) : 'tool-${index + 1}',
    'title': _text(t['title']).isNotEmpty ? _text(t['title']) : 'Untitled tool',
    if (_text(t['hint']).isNotEmpty) 'hint': _text(t['hint']),
  };
  switch (t['type']) {
    case 'registry':
      return _text(t['category']).isEmpty
          ? null
          : {
              ...base,
              'type': 'registry',
              'category': _text(t['category']),
              if (_text(t['groupBy']).isNotEmpty) 'groupBy': _text(t['groupBy']),
              if (_strings(t['summary']).isNotEmpty) 'summary': _strings(t['summary']),
            };
    case 'lineage':
      return {...base, 'type': 'lineage'};
    case 'board':
      return _text(t['category']).isEmpty || _text(t['groupBy']).isEmpty
          ? null
          : {
              ...base,
              'type': 'board',
              'category': _text(t['category']),
              'groupBy': _text(t['groupBy']),
              if (_strings(t['show']).isNotEmpty) 'show': _strings(t['show']),
            };
    case 'table':
      return _text(t['category']).isEmpty || _strings(t['fields']).isEmpty
          ? null
          : {...base, 'type': 'table', 'category': _text(t['category']), 'fields': _strings(t['fields'])};
    case 'matrix':
      return _text(t['rows']).isEmpty || _text(t['columns']).isEmpty
          ? null
          : {
              ...base,
              'type': 'matrix',
              'rows': _text(t['rows']),
              'columns': _text(t['columns']),
              if (_strings(t['values']).isNotEmpty) 'values': _strings(t['values']),
            };
    case 'meters':
      return _text(t['category']).isEmpty || _strings(t['fields']).isEmpty
          ? null
          : {
              ...base,
              'type': 'meters',
              'category': _text(t['category']),
              'fields': _strings(t['fields']),
              'max': _number(t['max'], 10) < 1 ? 1 : _number(t['max'], 10),
            };
    case 'log':
      final v = mapOrNull(t['value']);
      return {
        ...base,
        'type': 'log',
        if (_strings(t['states']).isNotEmpty) 'states': _strings(t['states']),
        if (_text(t['about']).isNotEmpty) 'about': _text(t['about']),
        if (_text(t['second']).isNotEmpty) 'second': _text(t['second']),
        if (t['checklist'] == true) 'checklist': true,
        if (_strings(t['suggestions']).isNotEmpty) 'suggestions': _strings(t['suggestions']),
        if (v != null)
          'value': {
            'label': _text(v['label']).isNotEmpty ? _text(v['label']) : 'Value',
            'min': _number(v['min'], 0),
            'max': _number(v['max'], 10),
          },
      };
    case 'calculator':
      final inputs = [
        for (final i in maps(t['inputs']))
          if (_text(i['key']).isNotEmpty)
            {
              'key': _text(i['key']),
              'label': _text(i['label']).isNotEmpty ? _text(i['label']) : _text(i['key']),
              'unit': _text(i['unit']),
              'value': _number(i['value'], 0),
            },
      ];
      final outputs = [
        for (final o in maps(t['outputs']))
          if (_text(o['formula']).isNotEmpty)
            {
              'label': _text(o['label']).isNotEmpty ? _text(o['label']) : 'Result',
              'formula': _text(o['formula']),
              'unit': _text(o['unit']),
            },
      ];
      return inputs.isEmpty || outputs.isEmpty
          ? null
          : {...base, 'type': 'calculator', 'inputs': inputs, 'outputs': outputs};
    case 'ranks' || 'inventory':
      return {...base, 'type': t['type']};
    case 'page':
      return corePages.contains(t['to']) ? {...base, 'type': 'page', 'to': t['to']} : null;
    default:
      return null;
  }
}

/// A module: its card, the categories and fields it brings, its starter system and its tools.
class ModuleDefinition {
  ModuleDefinition(this.raw);
  final JsonMap raw;

  String get id => str(raw['id']);
  String get name => str(raw['name']);
  String get genre => str(raw['genre']);
  String get description => str(raw['description']);

  /// What its workspace is called; its name when absent.
  String get nav => str(raw['nav'], name);
  String get icon => str(raw['icon']);
  List<String> get features => strings(raw['features']);
  List<String> get integrates => strings(raw['integrates']);
  int get version => (numOrNull(raw['version']) ?? 1).toInt();
  bool get builtin => raw['builtin'] == true;

  /// The categories it brings: `{key, name, singular, color, builtin, fields: [{id, name, type, options}]}`.
  List<JsonMap> get categories => maps(mapOrNull(raw['schema'])?['categories']).toList();
  JsonMap? get system => mapOrNull(raw['system']);
  List<JsonMap> get tools => maps(raw['tools']).toList();
}

/// Reads a module from anywhere (a file, another novel) without trusting it. Throws [FormatException] when it is not a
/// module at all.
ModuleDefinition parseDefinition(Object? raw, {required String Function() newId}) {
  final d = mapOrNull(raw);
  if (d == null || _text(d['name']).isEmpty) throw const FormatException('That is not a module.');
  final schema = mapOrNull(d['schema']) ?? const <String, Object?>{};
  final categories = [
    for (final c in maps(schema['categories']))
      if (_text(c['name']).isNotEmpty || c['builtin'] == true)
        {
          'key': _text(c['key']),
          'name': _text(c['name']),
          'singular': _text(c['singular']).isNotEmpty ? _text(c['singular']) : _text(c['name']),
          'color': RegExp(r'^#[0-9a-f]{6}$', caseSensitive: false).hasMatch(_text(c['color'])) ? _text(c['color']) : '',
          'builtin': c['builtin'] == true,
          'fields': [
            for (final (i, f) in maps(c['fields']).where((f) => _text(f['name']).isNotEmpty).indexed)
              {
                'id': 'module-$i',
                'name': _text(f['name']),
                'type': FieldType.of(f['type']) != null ? f['type'] : 'text',
                'options': _strings(f['options']),
              },
          ],
        },
  ];
  final system = mapOrNull(d['system']) == null ? null : tidyBlueprint(mapOrNull(d['system'])!, newId);
  final tools = [for (final (i, t) in listOf(d['tools']).indexed) ?parseTool(t, i)];
  final name = _text(d['name']);
  final nav = _text(d['nav']);
  final icon = _text(d['icon']);
  return ModuleDefinition({
    'id': _text(d['id']).isNotEmpty ? _text(d['id']) : 'custom-${newId()}',
    'name': name.length > 80 ? name.substring(0, 80) : name,
    'genre': _text(d['genre']),
    'description': _text(d['description']),
    if (nav.isNotEmpty) 'nav': nav.length > 40 ? nav.substring(0, 40) : nav,
    if (icon.isNotEmpty) 'icon': icon.runes.take(2).map(String.fromCharCode).join(),
    if (_strings(d['features']).isNotEmpty) 'features': _strings(d['features']).take(12).toList(),
    if (_strings(d['integrates']).isNotEmpty) 'integrates': _strings(d['integrates']).take(16).toList(),
    'version': _number(d['version'], 1).round() < 1 ? 1 : _number(d['version'], 1).round(),
    'builtin': false,
    'schema': {'categories': categories},
    'system': system,
    'tools': tools,
    'unlocks': system != null ? ['systems', 'progression'] : <String>[],
  });
}

/// The ten genre modules that come with the app.
final List<ModuleDefinition> builtinModules = [
  for (final m in jsonDecode(builtinModulesJson) as List) ModuleDefinition(m as JsonMap),
];

/// Tools worked out from a module's categories, for modules made from a novel: a table for each, a board where there
/// is a choice to group by, meters where there are numbers.
List<JsonMap> deriveTools(List<JsonMap> categories, bool hasSystem) {
  final tools = <JsonMap>[];
  for (final category in categories.where((c) => c['builtin'] != true && maps(c['fields']).isNotEmpty)) {
    final name = str(category['name']);
    final fields = maps(category['fields']).toList();
    final slug = name.toLowerCase().replaceAll(RegExp('[^a-z0-9]+'), '-');
    final choice = fields.where((f) => f['type'] == 'select').firstOrNull;
    final numbers = [
      for (final f in fields)
        if (f['type'] == 'number') f,
    ];
    if (choice != null) {
      tools.add({
        'id': '$slug-board',
        'type': 'board',
        'title': '$name by ${str(choice['name']).toLowerCase()}',
        'category': name,
        'groupBy': choice['name'],
        'show': [for (final f in fields.where((f) => !identical(f, choice)).take(2)) f['name']],
      });
    }
    tools.add({
      'id': '$slug-table',
      'type': 'table',
      'title': name,
      'category': name,
      'fields': [for (final f in fields.take(5)) f['name']],
    });
    if (numbers.isNotEmpty) {
      tools.add({
        'id': '$slug-meters',
        'type': 'meters',
        'title': '$name: ${[for (final f in numbers) str(f['name']).toLowerCase()].join(', ')}',
        'category': name,
        'fields': [for (final f in numbers.take(4)) f['name']],
        'max': 10,
      });
    }
  }
  if (hasSystem) {
    tools
      ..add({'id': 'system', 'type': 'page', 'title': 'Systems', 'to': 'systems'})
      ..add({'id': 'progression', 'type': 'page', 'title': 'Character progression', 'to': 'progression'});
  }
  return tools;
}

String _lower(String v) => v.trim().toLowerCase();

/// Which of a novel's categories and fields a module's own names stand for (`{categories: {name: key},
/// fields: {"category/field": fieldId}}`), noted when it is turned on.
typedef Bindings = ({Map<String, String> categories, Map<String, String> fields});

Bindings bindingsOf(Object? raw) {
  final m = mapOrNull(raw);
  return (
    categories: {for (final e in (mapOrNull(m?['categories']) ?? const {}).entries) e.key: str(e.value)},
    fields: {for (final e in (mapOrNull(m?['fields']) ?? const {}).entries) e.key: str(e.value)},
  );
}

JsonMap bindingsJson(Bindings b) => {'categories': b.categories, 'fields': b.fields};

/// The novel's category a module means by one of its names: the one bound when it was turned on, or failing that the
/// one of that name.
Category? resolveCategory(String name, List<Category> categories, [Bindings? bindings]) {
  final bound = bindings?.categories[_lower(name)];
  return categories.where((c) => c.key == bound).firstOrNull ??
      categories.where((c) => _lower(c.name) == _lower(name)).firstOrNull;
}

/// A category's field a module means by one of its names, the same way. A field the author archived is not found.
FieldDef? resolveField(String categoryName, Category? category, String name, [Bindings? bindings]) {
  if (category == null) return null;
  final bound = bindings?.fields['${_lower(categoryName)}/${_lower(name)}'];
  return category.fields.where((f) => !f.archived && f.id == bound).firstOrNull ??
      category.fields.where((f) => !f.archived && _lower(f.name) == _lower(name)).firstOrNull;
}

/// The name a built-in category goes by in a module: its original name, whatever the author has since called it.
String builtinCategoryLabel(String key) => Category.builtin(key).name;

/// Notes which categories and fields of the novel a module's names stand for. What was noted before is kept, so a
/// renamed category or field stays the one the module uses; only names not yet bound are added.
Bindings bind(ModuleDefinition definition, List<Category> categories, [Bindings? before]) {
  final cats = {...?before?.categories};
  final fields = {...?before?.fields};
  for (final incoming in definition.categories) {
    final builtin = incoming['builtin'] == true;
    final key = str(incoming['key']);
    final name = builtin
        ? (builtinCategoryKeys.contains(key) ? builtinCategoryLabel(key) : key)
        : str(incoming['name']);
    final known = categories.where((c) => c.key == cats[_lower(name)]).firstOrNull;
    final category =
        known ??
        (builtin
            ? categories.where((c) => c.key == key).firstOrNull
            : categories.where((c) => _lower(c.name) == _lower(str(incoming['name']))).firstOrNull);
    if (category == null) continue;
    cats[_lower(name)] = category.key;
    for (final field in maps(incoming['fields'])) {
      final id = '${_lower(name)}/${_lower(str(field['name']))}';
      if (category.fields.any((f) => f.id == fields[id])) continue;
      final def = category.fields.where((f) => _lower(f.name) == _lower(str(field['name']))).firstOrNull;
      if (def != null) fields[id] = def.id;
    }
  }
  return (categories: cats, fields: fields);
}

/// The author's arrangement of a module in one novel: tools hidden, their order, their names, a log's own stages, the
/// workspace's name.
typedef ModuleSettings = ({
  List<String> hidden,
  List<String> order,
  Map<String, String> titles,
  Map<String, List<String>> states,
  String? nav,
});

ModuleSettings settingsOf(Object? raw) {
  final m = mapOrNull(raw);
  return (
    hidden: strings(m?['hidden']),
    order: strings(m?['order']),
    titles: {for (final e in (mapOrNull(m?['titles']) ?? const {}).entries) e.key: str(e.value)},
    states: {for (final e in (mapOrNull(m?['states']) ?? const {}).entries) e.key: strings(e.value)},
    nav: strOrNull(m?['nav']),
  );
}

/// A module's tools as the author has arranged them here: hidden ones left out, in their order, under their names.
List<JsonMap> arrangedTools(ModuleDefinition module, [Object? settingsRaw]) {
  final s = settingsOf(settingsRaw);
  final ids = [for (final t in module.tools) str(t['id'])];
  int at(String id) => s.order.contains(id) ? s.order.indexOf(id) : s.order.length + ids.indexOf(id);
  final shown = [
    for (final t in module.tools)
      if (!s.hidden.contains(t['id'])) t,
  ];
  final indexed = [for (final (i, t) in shown.indexed) (i, t)]
    ..sort((a, b) {
      final c = at(str(a.$2['id'])) - at(str(b.$2['id']));
      return c != 0 ? c : a.$1 - b.$1;
    });
  return [
    for (final (_, tool) in indexed)
      {
        ...tool,
        'title': (s.titles[tool['id']] ?? '').isNotEmpty ? s.titles[tool['id']] : tool['title'],
        if (tool['type'] == 'log' && (s.states[tool['id']]?.isNotEmpty ?? false)) 'states': s.states[tool['id']],
      },
  ];
}

/// One person in a family tree, and their family as recorded.
class Kin {
  Kin(this.id);
  final String id;
  final parents = <String>[];
  final children = <String>[];
  final partners = <String>[];
  final siblings = <String>[];
  final relatives = <String>[];
}

/// A family tree read off the relationships: every family relationship as it stands at the end of the story, in
/// generations. It keeps nothing of its own, so changing a relationship changes the tree. A child sits one below the
/// lowest of their parents; partners and siblings share a row.
List<List<Kin>> buildLineage(List<CharacterRelation> relations, StoryOrder order, bool Function(String id) known) {
  final people = <String, Kin>{};
  Kin kin(String id) => people.putIfAbsent(id, () => Kin(id));
  void add(List<String> list, String id) {
    if (!list.contains(id)) list.add(id);
  }

  bool parentish(String role) => const ['parent', 'mother', 'father', 'ancestor', 'grandparent'].contains(role);
  bool childish(String role) => const ['child', 'son', 'daughter', 'descendant', 'heir', 'grandchild'].contains(role);
  for (final relation in relations) {
    if (!known(relation.fromId) || !known(relation.toId) || relation.fromId == relation.toId) continue;
    final stage = stageAt(relation, null, order);
    if (stage == null || stage.category != 'family') continue;
    final a = kin(relation.fromId);
    final b = kin(relation.toId);
    final from = stage.fromRole.trim().toLowerCase();
    final to = stage.toRole.trim().toLowerCase();
    if (stage.preset == 'parent-child' || (parentish(from) && !parentish(to)) || (childish(to) && !childish(from))) {
      add(a.children, b.id);
      add(b.parents, a.id);
    } else if (parentish(to) || childish(from)) {
      add(b.children, a.id);
      add(a.parents, b.id);
    } else if (stage.preset == 'spouses' || const ['spouse', 'husband', 'wife', 'consort'].contains(from)) {
      add(a.partners, b.id);
      add(b.partners, a.id);
    } else if (stage.preset == 'siblings' || const ['sibling', 'brother', 'sister'].contains(from)) {
      add(a.siblings, b.id);
      add(b.siblings, a.id);
    } else {
      add(a.relatives, b.id);
      add(b.relatives, a.id);
    }
  }
  final depth = {for (final id in people.keys) id: 0};
  for (var round = 0; round < people.length + 2; round++) {
    var moved = false;
    void raise(String id, int to) {
      if (to > depth[id]! && to <= people.length) {
        depth[id] = to;
        moved = true;
      }
    }

    for (final person in people.values) {
      for (final child in person.children) {
        raise(child, depth[person.id]! + 1);
      }
      for (final other in [...person.partners, ...person.siblings]) {
        raise(other, depth[person.id]!);
      }
    }
    if (!moved) break;
  }
  final rows = <int, List<Kin>>{};
  for (final person in people.values) {
    (rows[depth[person.id]!] ??= []).add(person);
  }
  return [for (final d in rows.keys.toList()..sort()) rows[d]!];
}
