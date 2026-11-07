import '../codex/codex_changes.dart';
import '../json.dart';
import '../records/category.dart';
import '../systems/system_changes.dart' show instantiateBlueprint, tidyBlueprint;
import 'module_defs.dart';

/// Where a module stands in a novel, worked out from what is stored.
enum ModuleState {
  available('Available'),
  enabled('Enabled'),
  disabled('Disabled'),
  attention('Needs attention');

  const ModuleState(this.label);
  final String label;
}

class ModuleStatus {
  const ModuleStatus({
    required this.module,
    required this.state,
    required this.reasons,
    required this.installed,
    required this.updatable,
    required this.entries,
    required this.records,
    required this.shares,
  });
  final ModuleDefinition module;
  final ModuleState state;

  /// Why it needs attention, in words for the author.
  final List<String> reasons;

  /// The version installed here, when it is installed.
  final int? installed;

  /// A newer version of a built-in module is available than the one installed here.
  final bool updatable;

  /// Entries in the categories it brought, and lines and cells recorded with its tools.
  final int entries;
  final int records;

  /// Other modules that use some of the same categories, and so the same records.
  final List<({String moduleId, String name, bool enabled, List<String> categories})> shares;
}

String _text(Object? v) => v is String ? v.trim() : '';
List<String> _strings(Object? v) => v is List
    ? [
        for (final x in v)
          if (_text(x).isNotEmpty) _text(x),
      ]
    : const [];
String _lower(String v) => v.trim().toLowerCase();

/// The changes modules make to a novel, as the original app's extension service makes them. Read and written through
/// a snapshot of the novel; saved by whoever made it, all at once.
class ModuleChanges extends CodexChanges {
  ModuleChanges(super.snapshot, {required super.now, required super.createId});

  List<JsonMap> installed() => rows('projectModules');
  JsonMap? rowFor(String moduleId) => installed().where((r) => r['moduleId'] == moduleId).firstOrNull;

  /// The modules switched on, as their definitions, in the order they were first turned on.
  List<ModuleDefinition> enabled() {
    final on = [
      for (final r in installed())
        if (r['enabled'] == true) r,
    ];
    on.sort((a, b) {
      final c = (numOrNull(a['createdAt']) ?? 0).compareTo(numOrNull(b['createdAt']) ?? 0);
      return c != 0 ? c : str(mapOrNull(a['definition'])?['name']).compareTo(str(mapOrNull(b['definition'])?['name']));
    });
    return [for (final r in on) ModuleDefinition(mapOrNull(r['definition'])!)];
  }

  /// Turns a module on. Its categories and fields are merged into the codex (anything already there is left as it is)
  /// and its tools appear. No record is created: a starter system is only offered. Turning on a built-in module that
  /// has since been improved brings this novel's copy up to date, which only ever adds.
  JsonMap enable(ModuleDefinition definition) {
    final existing = rowFor(definition.id);
    final existingBindings = existing == null ? null : bindingsOf(existing['bindings']);
    final before = {for (final c in categories()) c.key};
    final current = categories();
    // What the author has renamed since it was last on is still the module's: a category goes in under its present
    // name, and a field already bound is not added again.
    final schema = [
      for (final incoming in definition.categories)
        () {
          final builtin = incoming['builtin'] == true;
          final key = str(incoming['key']);
          final name = builtin
              ? (builtinCategoryKeys.contains(key) ? builtinCategoryLabel(key) : key)
              : str(incoming['name']);
          final bound = current.where((c) => c.key == existingBindings?.categories[_lower(name)]).firstOrNull;
          if (bound == null) return incoming;
          final fields = [
            for (final f in maps(incoming['fields']))
              if (!bound.fields.any(
                (have) => have.id == existingBindings?.fields['${_lower(name)}/${_lower(str(f['name']))}'],
              ))
                f,
          ];
          return builtin ? {...incoming, 'fields': fields} : {...incoming, 'name': bound.name, 'fields': fields};
        }(),
    ];
    var after = addKinds(schema);
    final created = {
      ...strings(existing?['createdCategories']),
      for (final c in after)
        if (!before.contains(c.key)) c.key,
    }.toList();
    // Categories it brought that were tucked away when it was last turned off come back.
    for (final key in created) {
      if (after.where((c) => c.key == key).firstOrNull?.archived ?? false) {
        saveCategory(key, (_) => {'archived': false});
      }
    }
    after = categories();
    final row = <String, Object?>{
      'id': existing?['id'] ?? newId(),
      'projectId': projectId,
      'moduleId': definition.id,
      'enabled': true,
      'definition': definition.raw,
      'createdCategories': created,
      'systemId': existing?['systemId'],
      'bindings': bindingsJson(bind(definition, after, existingBindings)),
      if (existing?['settings'] != null) 'settings': existing!['settings'],
      'createdAt': existing?['createdAt'] ?? now,
      'updatedAt': now,
    };
    put('projectModules', row);
    return row;
  }

  /// Turns a module off. Its tools go away, and the categories it introduced are tucked out of the "new entry" menus
  /// when they are empty and no other module that is on uses them. Nothing is deleted.
  void disable(String moduleId) {
    final row = rowFor(moduleId);
    if (row == null || row['enabled'] != true) return;
    final cats = categories();
    final others = [
      for (final r in installed())
        if (r['enabled'] == true && r['moduleId'] != moduleId) r,
    ];
    final inUse = {
      for (final r in others) ...[...bindingsOf(r['bindings']).categories.values, ...strings(r['createdCategories'])],
    };
    final entries = rows('loreEntries');
    for (final key in strings(row['createdCategories'])) {
      if (inUse.contains(key) || entries.any((e) => e['category'] == key)) continue;
      if (cats.any((c) => c.key == key && !c.archived)) saveCategory(key, (_) => {'archived': true});
    }
    put('projectModules', {...row, 'enabled': false, 'updatedAt': now});
  }

  /// Adds a module's starter system to the novel, once. Returns its id.
  String addStarterSystem(String moduleId) {
    final row = rowFor(moduleId);
    final system = mapOrNull(mapOrNull(row?['definition'])?['system']);
    if (row == null || system == null) throw ChangeRefused('That module has no starter system.');
    final had = strOrNull(row['systemId']);
    if (had != null && this.row('systems', had) != null) return had;
    final id = newId();
    put('systems', {
      'id': id,
      'projectId': projectId,
      ...instantiateBlueprint(system, newId),
      'createdAt': now,
      'updatedAt': now,
    });
    put('projectModules', {...row, 'systemId': id, 'updatedAt': now});
    return id;
  }

  /// Saves how the author has arranged a module here.
  void configure(String moduleId, JsonMap Function(JsonMap current) change) {
    final row = rowFor(moduleId) ?? (throw ChangeRefused('That module is not installed in this novel.'));
    final next = change(mapOrNull(row['settings']) ?? const {});
    final ids = {for (final t in maps(mapOrNull(row['definition'])?['tools'])) str(t['id'])};
    final nav = _text(next['nav']);
    final settings = {
      'hidden': [
        for (final id in _strings(next['hidden']))
          if (ids.contains(id)) id,
      ],
      'order': {
        for (final id in _strings(next['order']))
          if (ids.contains(id)) id,
      }.toList(),
      'titles': {
        for (final e in (mapOrNull(next['titles']) ?? const {}).entries)
          if (ids.contains(e.key) && _text(e.value).isNotEmpty)
            e.key: _text(e.value).length > 60 ? _text(e.value).substring(0, 60) : _text(e.value),
      },
      'states': {
        for (final e in (mapOrNull(next['states']) ?? const {}).entries)
          if (ids.contains(e.key) && _strings(e.value).isNotEmpty) e.key: _strings(e.value).toSet().toList(),
      },
      if (nav.isNotEmpty) 'nav': nav.length > 40 ? nav.substring(0, 40) : nav,
    };
    put('projectModules', {...row, 'settings': settings, 'updatedAt': now});
  }

  /// Where every module stands in this novel: available, enabled, disabled or needing attention; how much was made
  /// with it; and which other modules work on the same records. [library] is every module that can be turned on.
  List<ModuleStatus> status(List<ModuleDefinition> library) {
    final rows = installed();
    final all = [
      ...library,
      for (final r in rows)
        if (!library.any((m) => m.id == r['moduleId'])) ModuleDefinition(mapOrNull(r['definition'])!),
    ];
    final cats = categories();
    final entries = this.rows('loreEntries');
    final records = this.rows('moduleRecords');
    List<String> named(ModuleDefinition d) => [
      for (final c in d.categories) c['builtin'] == true ? 'key:${str(c['key'])}' : 'name:${_lower(str(c['name']))}',
    ];
    String label(String id) => id.startsWith('key:')
        ? (cats.where((c) => c.key == id.substring(4)).firstOrNull?.name ?? id.substring(4))
        : (cats.where((c) => _lower(c.name) == id.substring(5)).firstOrNull?.name ?? id.substring(5));
    return [
      for (final module in all)
        () {
          final row = rows.where((r) => r['moduleId'] == module.id).firstOrNull;
          final definition = row == null ? module : ModuleDefinition(mapOrNull(row['definition'])!);
          final bindings = row == null ? null : bindingsOf(row['bindings']);
          final own = [
            for (final c in definition.categories)
              if (c['builtin'] != true) ?resolveCategory(str(c['name']), cats, bindings)?.key,
          ];
          final updatable = row != null && module.builtin && module.version > definition.version;
          final reasons = <String>[];
          if (row?['enabled'] == true) {
            final wanted = <String>{
              for (final tool in definition.tools)
                if (tool.containsKey('category'))
                  str(tool['category'])
                else if (tool['type'] == 'matrix') ...[
                  str(tool['rows']),
                  str(tool['columns']),
                ] else if (tool['type'] == 'log' && _text(tool['about']).isNotEmpty)
                  str(tool['about']),
            };
            final missing = [
              for (final name in wanted)
                if (resolveCategory(name, cats, bindings) == null) name,
            ];
            if (missing.isNotEmpty) {
              reasons.add(
                '${missing.join(', ')} ${missing.length == 1 ? 'is' : 'are'} no longer in the Codex. Turn the module off '
                'and on again to put ${missing.length == 1 ? 'it' : 'them'} back.',
              );
            }
            if (updatable) {
              reasons.add(
                'A newer version (${module.version}) is available; this project has version ${definition.version}. '
                'Updating only adds fields and tools.',
              );
            }
          }
          final mine = named(definition).toSet();
          return ModuleStatus(
            module: definition,
            state: row == null
                ? ModuleState.available
                : row['enabled'] != true
                ? ModuleState.disabled
                : reasons.isNotEmpty
                ? ModuleState.attention
                : ModuleState.enabled,
            reasons: reasons,
            installed: row == null ? null : definition.version,
            updatable: updatable,
            entries: entries.where((e) => own.contains(e['category'])).length,
            records: records.where((r) => r['moduleId'] == module.id).length,
            shares: [
              for (final other in all)
                if (other.id != module.id)
                  () {
                    final theirs = rows.where((r) => r['moduleId'] == other.id).firstOrNull;
                    final shared = [
                      for (final id in named(
                        theirs == null ? other : ModuleDefinition(mapOrNull(theirs['definition'])!),
                      ))
                        if (mine.contains(id)) id,
                    ];
                    return shared.isEmpty
                        ? null
                        : (
                            moduleId: other.id,
                            name: other.name,
                            enabled: theirs?['enabled'] == true,
                            categories: [for (final id in shared) label(id)],
                          );
                  }(),
            ].nonNulls.toList(),
          );
        }(),
    ];
  }

  String? _mine(String collection, Object? id) =>
      id is String && id.isNotEmpty && row(collection, id) != null ? id : null;
  List<String> _entryIds(Object? ids) => {for (final id in listOf(ids)) ?_mine('loreEntries', id)}.toList();

  /// Adds a line to a module's log.
  JsonMap addRecord(String moduleId, String toolId, [JsonMap input = const {}]) {
    final value = input['value'];
    final record = <String, Object?>{
      'id': newId(),
      'projectId': projectId,
      'moduleId': moduleId,
      'toolId': toolId,
      'kind': 'log',
      'title': _text(input['title']).isNotEmpty ? _text(input['title']) : 'Untitled',
      'state': _text(input['state']),
      'nodeId': _mine('chapters', input['nodeId']),
      'endNodeId': _mine('chapters', input['endNodeId']),
      'entryIds': _entryIds(input['entryIds']),
      'eventId': _mine('timelineEvents', input['eventId']),
      'value': value is num && value.isFinite ? value : null,
      'note': input['note'] is String ? input['note'] : '',
      'done': input['done'] == true,
      'rowId': null,
      'colId': null,
      'createdAt': now,
      'updatedAt': now,
    };
    put('moduleRecords', record);
    return record;
  }

  void updateRecord(String recordId, JsonMap changes) {
    final record = row('moduleRecords', recordId) ?? (throw ChangeRefused('That record is not in this novel.'));
    final next = <String, Object?>{...record, 'updatedAt': now};
    if (changes['title'] is String) {
      next['title'] = _text(changes['title']).isEmpty ? 'Untitled' : _text(changes['title']);
    }
    if (changes['state'] is String) next['state'] = _text(changes['state']);
    if (changes['note'] is String) next['note'] = changes['note'];
    if (changes['done'] is bool) next['done'] = changes['done'];
    if (changes.containsKey('value')) {
      final v = changes['value'];
      next['value'] = v is num && v.isFinite ? v : null;
    }
    if (changes.containsKey('nodeId')) next['nodeId'] = _mine('chapters', changes['nodeId']);
    if (changes.containsKey('endNodeId')) next['endNodeId'] = _mine('chapters', changes['endNodeId']);
    if (changes.containsKey('entryIds')) next['entryIds'] = _entryIds(changes['entryIds']);
    if (changes.containsKey('eventId')) next['eventId'] = _mine('timelineEvents', changes['eventId']);
    put('moduleRecords', next);
  }

  void removeRecord(String recordId) {
    if (row('moduleRecords', recordId) == null) throw ChangeRefused('That record is not in this novel.');
    remove('moduleRecords', recordId);
  }

  /// Sets one cell of a matrix: what a row's entry has to do with a column's. An empty value clears it.
  void setCell(String moduleId, String toolId, String rowId, String colId, String value) {
    if (_mine('loreEntries', rowId) == null || _mine('loreEntries', colId) == null) {
      throw ChangeRefused('Those entries are not in this novel.');
    }
    final existing = rows('moduleRecords')
        .where(
          (r) =>
              r['kind'] == 'cell' &&
              r['moduleId'] == moduleId &&
              r['toolId'] == toolId &&
              r['rowId'] == rowId &&
              r['colId'] == colId,
        )
        .firstOrNull;
    if (value.trim().isEmpty) {
      if (existing != null) remove('moduleRecords', str(existing['id']));
      return;
    }
    if (existing != null) {
      put('moduleRecords', {...existing, 'state': value.trim(), 'updatedAt': now});
      return;
    }
    put('moduleRecords', {
      'id': newId(),
      'projectId': projectId,
      'moduleId': moduleId,
      'toolId': toolId,
      'kind': 'cell',
      'title': '',
      'state': value.trim(),
      'nodeId': null,
      'endNodeId': null,
      'entryIds': <String>[],
      'value': null,
      'note': '',
      'done': false,
      'rowId': rowId,
      'colId': colId,
      'createdAt': now,
      'updatedAt': now,
    });
  }

  /// Packages part of this novel as a module: the chosen categories with their fields, and a chosen system's rules.
  /// No entries, characters or text go into it: only the shape of things.
  ModuleDefinition buildFrom({
    required String name,
    String genre = '',
    String description = '',
    required List<String> categoryKeys,
    String? systemId,
  }) {
    final snapshot = schemaSnapshot();
    final chosen = [
      for (final c in snapshot)
        if (categoryKeys.contains(c['key'])) c,
    ];
    final categories = [
      for (final c in chosen)
        {
          ...c,
          'key': c['builtin'] == true ? c['key'] : '',
          'name': c['builtin'] == true ? '' : c['name'],
          'fields': [
            for (final (i, f) in maps(c['fields']).indexed)
              {
                'id': 'module-$i',
                'name': f['name'],
                'type': f['type'],
                'options': [...strings(f['options'])],
              },
          ],
        },
    ];
    final blueprint = systemId == null ? null : row('systems', systemId);
    final system = blueprint == null ? null : tidyBlueprint(blueprint, newId);
    if (_text(name).isEmpty) throw ChangeRefused('Give the module a name.');
    if (categories.isEmpty && system == null) {
      throw ChangeRefused('Choose at least one category or a system to put in the module.');
    }
    final named = [
      for (final c in chosen)
        if (c['builtin'] != true) {...c, 'builtin': false},
    ];
    return parseDefinition({
      'id': 'custom-${newId()}',
      'name': name,
      'genre': genre,
      'description': description,
      'version': 1,
      'schema': {'categories': categories},
      'system': system,
      'tools': deriveTools(named, system != null),
    }, newId: newId);
  }
}

/// A module as a file's worth of JSON, to keep or share.
JsonMap moduleFile(ModuleDefinition definition) => {
  'format': moduleFileFormat,
  'version': 1,
  'module': {...definition.raw, 'builtin': false},
};

/// Reads a module file. Throws [FormatException] when the file is something else. A file never replaces a built-in
/// module, whatever id it claims.
ModuleDefinition readModuleFile(Object? data, {required String Function() newId}) {
  final file = mapOrNull(data);
  if (file == null || file['format'] != moduleFileFormat || file['module'] == null) {
    throw const FormatException('That file is not a module.');
  }
  final definition = parseDefinition(file['module'], newId: newId);
  if (builtinModules.any((m) => m.id == definition.id)) {
    return ModuleDefinition({...definition.raw, 'id': 'custom-${newId()}'});
  }
  return definition;
}
