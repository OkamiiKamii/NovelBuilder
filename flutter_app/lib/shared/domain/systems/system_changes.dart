import '../codex/codex_changes.dart' show ChangeRefused, RecordChanges;
import '../ids.dart';
import '../json.dart';
import '../records/system.dart';
import 'compute.dart' show takesPoints;
import 'system_presets.dart' show blankBlueprint;

/// The collections a change to systems reads and writes.
const systemCollections = {'systems', 'systemSheets', 'loreEntries', 'loreLinks', 'chapters'};

const _variableKinds = ['number', 'resource', 'derived', 'choice'];
const _modifierOps = ['add', 'multiply', 'set'];

String _text(Object? v, [String fallback = '']) => v is String ? v : fallback;
List<Object?> _list(Object? v) => v is List ? v : const [];
double _number(Object? v, [double fallback = 0]) => v is num && v.isFinite ? v.toDouble() : fallback;
Object _plainNumber(double n) => n == n.truncateToDouble() && n.abs() < 9e15 ? n.toInt() : n;

/// Makes a blueprint safe to store without imposing any game rules on it: everything has an id and a name, formula
/// names are unique, and references inside the blueprint point at things that exist. As the original's `tidy`.
JsonMap tidyBlueprint(JsonMap given, [String Function() createId = newId]) {
  // Blueprints from earlier versions link ranks and table cells by name.
  final input = upgradeBlueprintShape(given, createId: createId);
  final taken = <String>{};
  String unique(String wanted) {
    final base = toFormulaKey(wanted);
    var key = base;
    for (var n = 2; taken.contains(key); n++) {
      key = '${base}_$n';
    }
    taken.add(key);
    return key;
  }

  String or(String a, String b) => a.isNotEmpty ? a : b;
  final variables = [
    for (final raw in _list(input['variables']))
      if (mapOrNull(raw) case final v?)
        {
          'id': or(_text(v['id']), createId()),
          'name': or(_text(v['name']).trim(), 'Unnamed'),
          'key': unique(or(_text(v['key']), or(_text(v['name']), 'value'))),
          'kind': _variableKinds.contains(v['kind']) ? v['kind'] : 'number',
          'unit': _text(v['unit']).trim(),
          'base': _plainNumber(_number(v['base'])),
          'formula': _text(v['formula']),
          'options': [
            for (final o in _list(v['options']))
              if (_text(o).trim().isNotEmpty) _text(o).trim(),
          ],
          'note': _text(v['note']),
        },
  ];
  final tracks = [
    for (final raw in _list(input['tracks']))
      if (mapOrNull(raw) case final t?)
        {
          'id': or(_text(t['id']), createId()),
          'name': or(_text(t['name']).trim(), 'Unnamed'),
          'key': unique(or(_text(t['key']), or(_text(t['name']), 'track'))),
          'kind': t['kind'] == 'stages' ? 'stages' : 'levels',
          'cap': _plainNumber(_number(t['cap']) < 0 ? 0 : (_number(t['cap']) + 0.5).floorToDouble()),
          'curve': _text(t['curve']),
          'curveUnit': _text(t['curveUnit']).trim(),
          if (t['kind'] != 'stages') ...{
            'points': _plainNumber(_number(t['points']) < 0 ? 0 : _number(t['points'])),
            'sources': {
              for (final s in _list(t['sources']))
                if (_text(s).trim().isNotEmpty) _text(s).trim(),
            }.toList(),
          },
          'stages': [
            for (final raw in _list(t['stages']))
              if (mapOrNull(raw) case final s?)
                {
                  'id': or(_text(s['id']), createId()),
                  'name': or(_text(s['name']).trim(), 'Unnamed stage'),
                  'requires': _text(s['requires']),
                  'note': _text(s['note']),
                },
          ],
        },
  ];
  final groups = [
    for (final raw in _list(input['groups']))
      if (mapOrNull(raw) case final g?)
        {
          'id': or(_text(g['id']), createId()),
          'name': or(_text(g['name']).trim(), 'Unnamed group'),
          'single': g['single'] == true,
        },
  ];
  final groupIds = {for (final g in groups) g['id']};
  final raw = [
    for (final r in _list(input['items']))
      if (mapOrNull(r) case final i? when groupIds.contains(i['groupId'])) {...i, 'id': or(_text(i['id']), createId())},
  ];
  final itemIds = {for (final i in raw) i['id']};
  final ranks = [for (final r in _list(input['ranks'])) ?mapOrNull(r)];
  final rankIds = {for (final r in ranks) r['id']};
  final items = [
    for (final i in raw)
      {
        'id': i['id'],
        'groupId': i['groupId'],
        'name': or(_text(i['name']).trim(), 'Unnamed'),
        'description': _text(i['description']),
        'parentId': i['parentId'] is String && i['parentId'] != i['id'] && itemIds.contains(i['parentId'])
            ? i['parentId']
            : null,
        'rankId': i['rankId'] is String && rankIds.contains(i['rankId']) ? i['rankId'] : null,
        'requires': _text(i['requires']),
        'modifiers': [
          for (final raw in _list(i['modifiers']))
            if (mapOrNull(raw) case final m?)
              {
                'id': or(_text(m['id']), createId()),
                'target': _text(m['target']),
                'op': _modifierOps.contains(m['op']) ? m['op'] : 'add',
                'value': _text(m['value']),
              },
        ],
        'costs': [
          for (final raw in _list(i['costs']))
            if (mapOrNull(raw) case final c?)
              {'id': or(_text(c['id']), createId()), 'target': _text(c['target']), 'amount': _text(c['amount'])},
        ],
        'cooldown': _text(i['cooldown']),
        'affinity': _text(i['affinity']),
        'evolution': _text(i['evolution']),
      },
  ];
  final matrices = [
    for (final raw in _list(input['matrices']))
      if (mapOrNull(raw) case final m?)
        {
          'id': or(_text(m['id']), createId()),
          'name': or(_text(m['name']).trim(), 'Unnamed table'),
          'rows': m['rows'],
          'columns': m['columns'],
          'cells': {
            for (final e in (mapOrNull(m['cells']) ?? const {}).entries)
              if (e.value is String && (e.value! as String).trim().isNotEmpty) e.key: e.value,
          },
        },
  ];
  return {
    'name': or(_text(input['name']).trim(), 'Untitled system'),
    'description': _text(input['description']),
    'variables': variables,
    'tracks': tracks,
    'ranks': ranks,
    'groups': groups,
    'items': items,
    'matrices': matrices,
  };
}

/// A copy of a blueprint's content in which everything has a new id, with references inside it kept intact.
JsonMap instantiateBlueprint(JsonMap given, [String Function() createId = newId]) {
  final content = upgradeBlueprintShape(given, createId: createId);
  final ids = <String, String>{};
  String fresh(Object? old) => ids.putIfAbsent(_text(old), createId);
  for (final i in maps(content['items'])) {
    fresh(i['id']);
  }
  for (final g in maps(content['groups'])) {
    fresh(g['id']);
  }
  return tidyBlueprint({
    ...content,
    'variables': [
      for (final v in maps(content['variables']))
        {
          ...v,
          'id': createId(),
          'options': [...strings(v['options'])],
        },
    ],
    'tracks': [
      for (final t in maps(content['tracks']))
        {
          ...t,
          'id': createId(),
          'stages': [
            for (final s in maps(t['stages'])) {...s, 'id': createId()},
          ],
        },
    ],
    'ranks': [
      for (final r in maps(content['ranks'])) {...r},
    ],
    'groups': [
      for (final g in maps(content['groups'])) {...g, 'id': fresh(g['id'])},
    ],
    'items': [
      for (final i in maps(content['items']))
        {
          ...i,
          'id': fresh(i['id']),
          'groupId': fresh(i['groupId']),
          'parentId': i['parentId'] is String ? fresh(i['parentId']) : null,
          'modifiers': [
            for (final m in maps(i['modifiers'])) {...m, 'id': createId()},
          ],
          'costs': [
            for (final c in maps(i['costs'])) {...c, 'id': createId()},
          ],
        },
    ],
    'matrices': [
      for (final m in maps(content['matrices']))
        {
          ...m,
          'id': createId(),
          'rows': [
            for (final r in maps(m['rows'])) {...r},
          ],
          'columns': [
            for (final c in maps(m['columns'])) {...c},
          ],
          'cells': {...?mapOrNull(m['cells'])},
        },
    ],
  }, createId);
}

/// System blueprints and the sheets that put codex entries on them. Nothing in a blueprint is a fixed game concept;
/// nothing here judges an author's numbers.
class SystemChanges extends RecordChanges {
  SystemChanges(super.snapshot, {required super.now, required super.createId});

  List<SystemBlueprint> systems() => [for (final r in rows('systems')) SystemBlueprint(r)];
  List<SystemSheet> sheets() => [for (final r in rows('systemSheets')) SystemSheet(r)];

  SystemBlueprint _owned(String systemId) =>
      SystemBlueprint(row('systems', systemId) ?? (throw ChangeRefused('That system is not in this novel.')));
  SystemSheet _ownedSheet(String sheetId) =>
      SystemSheet(row('systemSheets', sheetId) ?? (throw ChangeRefused('That sheet is not in this novel.')));

  /// Removes the connections that name a blueprint's items: all of them, or only [itemIds].
  void _removeAbilityConnections(String systemId, [Set<String>? itemIds]) {
    final prefix = '$systemId/';
    bool gone(Object? id) =>
        id is String && id.startsWith(prefix) && (itemIds == null || itemIds.contains(id.substring(prefix.length)));
    for (final l in rows('loreLinks')) {
      if ((l['fromType'] == 'ability' && gone(l['fromId'])) || (l['toType'] == 'ability' && gone(l['toId']))) {
        remove('loreLinks', str(l['id']));
      }
    }
  }

  /// Creates a blueprint: empty, or as a fresh copy of a preset or of any other blueprint's content.
  SystemBlueprint createSystem([JsonMap content = blankBlueprint]) {
    final saved = {
      'id': newId(),
      'projectId': projectId,
      ...instantiateBlueprint(content, newId),
      'createdAt': now,
      'updatedAt': now,
    };
    put('systems', saved);
    return SystemBlueprint(saved);
  }

  /// Changes a blueprint, worked out from it as stored right now, so quick edits in a row never overwrite one another.
  /// An item taken out takes its connections with it.
  void updateSystem(String systemId, JsonMap Function(SystemBlueprint current) change) {
    final current = _owned(systemId);
    final next = tidyBlueprint({...current.raw, ...change(current)}, newId);
    final kept = {for (final i in maps(next['items'])) i['id']};
    final gone = {
      for (final i in current.items)
        if (!kept.contains(i.id)) i.id,
    };
    if (gone.isNotEmpty) _removeAbilityConnections(systemId, gone);
    put('systems', {...current.raw, ...next, 'updatedAt': now});
  }

  /// Deletes a blueprint and the sheets made from it. Codex entries are not changed.
  void removeSystem(String systemId) {
    _owned(systemId);
    for (final s in sheets()) {
      if (s.systemId == systemId) remove('systemSheets', s.id);
    }
    _removeAbilityConnections(systemId);
    remove('systems', systemId);
  }

  /// Puts a codex entry on a blueprint. An entry has one sheet per blueprint; asking again returns it.
  SystemSheet addSheet(String systemId, String entryId) {
    _owned(systemId);
    if (row('loreEntries', entryId) == null) throw ChangeRefused('That codex entry is not in this novel.');
    final existing = sheets().where((s) => s.systemId == systemId && s.entryId == entryId).firstOrNull;
    if (existing != null) return existing;
    final sheet = {
      'id': newId(),
      'projectId': projectId,
      'systemId': systemId,
      'entryId': entryId,
      'values': <String, Object?>{},
      'progress': <String, Object?>{},
      'itemIds': <String>[],
      'xp': <Object?>[],
      'spent': <String, Object?>{},
      'note': '',
      'createdAt': now,
      'updatedAt': now,
    };
    put('systemSheets', sheet);
    return SystemSheet(sheet);
  }

  /// Changes what is particular to one entry: its own numbers, where it stands, what it holds, experience and points.
  /// Assigning a class or skill stores only its id. Nothing here checks that a character "can afford" anything.
  void updateSheet(String sheetId, JsonMap Function(SystemSheet current) change) {
    final current = _ownedSheet(sheetId);
    final system = _owned(current.systemId);
    final next = {...current.raw, ...change(current)};
    final items = system.items;
    final known = {for (final i in items) i.id};
    var itemIds = {
      for (final id in strings(next['itemIds']))
        if (known.contains(id)) id,
    }.toList();
    // A group that allows one at a time keeps the one chosen last.
    for (final group in system.groupList.where((g) => g.single)) {
      final inGroup = [
        for (final id in itemIds)
          if (items.firstWhere((i) => i.id == id).groupId == group.id) id,
      ];
      final drop = inGroup.take(inGroup.length - 1).toSet();
      itemIds = [
        for (final id in itemIds)
          if (!drop.contains(id)) id,
      ];
    }
    final variableIds = {for (final v in system.variables) v.id};
    final values = {
      for (final e in (mapOrNull(next['values']) ?? const {}).entries)
        if (variableIds.contains(e.key) && (e.value is String || (e.value is num && (e.value! as num).isFinite)))
          e.key: e.value,
    };
    final trackIds = {for (final t in system.tracks) t.id};
    final progress = {
      for (final e in (mapOrNull(next['progress']) ?? const {}).entries)
        if (trackIds.contains(e.key)) e.key: e.value,
    };
    final levelled = {
      for (final t in system.tracks)
        if (t.kind == 'levels') t.id,
    };
    final xp = [
      for (final e in maps(next['xp']))
        if (levelled.contains(e['trackId']) && e['amount'] is num && (e['amount']! as num).isFinite && e['amount'] != 0)
          {
            'id': _text(e['id']).isNotEmpty ? e['id'] : newId(),
            'trackId': e['trackId'],
            'amount': e['amount'],
            'source': _text(e['source']).trim(),
            'nodeId': e['nodeId'] is String && row('chapters', e['nodeId']! as String) != null ? e['nodeId'] : null,
            'note': _text(e['note']).trim(),
          },
    ];
    final pointed = {
      for (final v in system.variables)
        if (takesPoints(v)) v.id,
    };
    final spent = {
      for (final e in (mapOrNull(next['spent']) ?? const {}).entries)
        if (pointed.contains(e.key) && e.value is num && (e.value! as num).isFinite && e.value != 0) e.key: e.value,
    };
    put('systemSheets', {
      ...current.raw,
      'values': values,
      'progress': progress,
      'itemIds': itemIds,
      'xp': xp,
      'spent': spent,
      'note': _text(next['note']),
      'updatedAt': now,
    });
  }

  void removeSheet(String sheetId) {
    _ownedSheet(sheetId);
    remove('systemSheets', sheetId);
  }
}
