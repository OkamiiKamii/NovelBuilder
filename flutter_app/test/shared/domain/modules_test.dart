// Genre modules, ported: agreement with the original app's extension service on turning modules on and off, starter
// systems, arrangement, what tools record and where each module stands, step by step (tool/golden/modules.test.ts).
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/codex/codex_changes.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/modules/module_changes.dart';
import 'package:novel_builder/shared/domain/modules/module_defs.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';

import 'builder.dart';
import 'golden.dart';

class _Novel {
  _Novel(this.snapshot);
  NovelSnapshot snapshot;
  var clock = 1000;
  var ids = 0;

  T change<T>(T Function(ModuleChanges m) f) {
    final m = ModuleChanges(snapshot, now: ++clock, createId: () => 'id${++ids}');
    final result = f(m);
    snapshot = m.snapshot;
    return result;
  }

  ModuleChanges get read => ModuleChanges(snapshot, now: clock, createId: () => 'id${++ids}');
}

int _compareJson(Object? a, Object? b) => jsonEncode(a).compareTo(jsonEncode(b));

JsonMap _state(ModuleChanges m) {
  final categories = m.categories();
  String catName(String key) => categories.where((k) => k.key == key).firstOrNull?.name ?? '?';
  final allFields = [for (final c in categories) ...c.fields];
  final entries = m.rows('loreEntries');
  String? entryName(Object? id) => id == null ? null : str(entries.where((e) => e['id'] == id).firstOrNull?['name']);
  final rows = [...m.installed()]..sort((a, b) => str(a['moduleId']).compareTo(str(b['moduleId'])));
  final library = [...builtinModules];
  return {
    'categories': [
      for (final k in categories)
        {
          'key': k.builtin ? k.key : '',
          'name': k.name,
          'archived': k.archived,
          'fields': [
            for (final f in k.fields) [f.name, f.raw['type'], f.options, f.archived],
          ],
        },
    ],
    'modules': [
      for (final r in rows)
        () {
          final definition = ModuleDefinition(mapOrNull(r['definition'])!);
          final bindings = bindingsOf(r['bindings']);
          return {
            'moduleId': r['moduleId'],
            'enabled': r['enabled'],
            'version': definition.version,
            'tools': definition.tools.length,
            'created': [for (final key in strings(r['createdCategories'])) catName(key)],
            'system': r['systemId'] == null ? null : 'yes',
            'settings': r['settings'],
            'bindings': {
              'categories': {for (final e in bindings.categories.entries) e.key: catName(e.value)},
              'fields': {
                for (final e in bindings.fields.entries)
                  e.key: allFields.where((f) => f.id == e.value).firstOrNull?.name ?? '?',
              },
            },
          };
        }(),
    ],
    'status': [
      for (final s in m.status(library))
        {
          'id': s.module.id,
          'state': s.state.name,
          'reasons': s.reasons,
          'installed': s.installed,
          'updatable': s.updatable,
          'usage': {'entries': s.entries, 'records': s.records},
          'shares': [
            for (final sh in s.shares)
              {'moduleId': sh.moduleId, 'name': sh.name, 'enabled': sh.enabled, 'categories': sh.categories},
          ],
        },
    ],
    'entries': [
      for (final e in entries) [e['name'], catName(str(e['category']))],
    ]..sort(_compareJson),
    'records': [
      for (final r in m.rows('moduleRecords'))
        [r['moduleId'], r['toolId'], r['kind'], r['title'], r['state'], entryName(r['rowId']), entryName(r['colId'])],
    ]..sort(_compareJson),
    'systems': [for (final s in m.rows('systems')) s['name']],
  };
}

void _run(_Novel novel, JsonMap step) {
  String keyOf(ModuleChanges m, String category) =>
      m.categories().firstWhere((k) => k.key == category || k.name == category).key;
  String entryId(ModuleChanges m, String name) => str(m.rows('loreEntries').firstWhere((e) => e['name'] == name)['id']);
  novel.change((m) {
    switch (step['op']) {
      case 'enable':
        final custom = step['custom'];
        final definition = custom != null
            ? parseDefinition(custom, newId: m.newId)
            : builtinModules.where((d) => d.id == step['module']).firstOrNull ??
                  (throw ChangeRefused('That module is not available.'));
        m.enable(definition);
      case 'disable':
        m.disable(str(step['module']));
      case 'starter':
        m.addStarterSystem(str(step['module']));
      case 'entry':
        m.createEntry(keyOf(m, str(step['category'])), str(step['name']));
      case 'record':
        m.addRecord(str(step['module']), str(step['tool']), {'title': step['title'], 'state': step['state']});
      case 'cell':
        m.setCell(
          str(step['module']),
          str(step['tool']),
          entryId(m, str(step['row'])),
          entryId(m, str(step['col'])),
          str(step['value']),
        );
      case 'configure':
        m.configure(str(step['module']), (_) => mapOrNull(step['settings'])!);
      case 'template':
        m.addKinds(maps(step['categories']));
      case 'downgrade':
        final row = m.rowFor(str(step['module']))!;
        final definition = mapOrNull(row['definition'])!;
        m.put('projectModules', {
          ...row,
          'definition': {...definition, 'version': 1, 'tools': maps(definition['tools']).take(2).toList()},
        });
      case 'dropCategory':
        for (final k in [...m.rows('loreSchemas')]) {
          if (k['name'] == step['name']) m.remove('loreSchemas', str(k['id']));
        }
      case 'renameCategory':
        m.saveCategory(
          keyOf(m, str(step['name'])),
          (stored) => {
            'name': step['to'],
            'fields': [
              for (final f in stored!.fields)
                f.name == step['field'] ? {...f.raw, 'name': step['fieldTo'], 'options': step['options']} : f.raw,
            ],
          },
        );
      default:
        throw StateError('unknown step ${step['op']}');
    }
  });
}

void main() {
  final golden = readGolden('modules.golden.json');

  for (final MapEntry(key: name, value: results) in golden.entries) {
    test('$name: every step agrees with the original app', () {
      final novel = _Novel(NovelBuilder().build());
      for (final (i, result as JsonMap) in (results as List).indexed) {
        final step = mapOrNull(result['step'])!;
        String? error;
        try {
          _run(novel, step);
        } on ChangeRefused catch (e) {
          error = e.message;
        }
        expect(error, result['error'], reason: '$name step $i ${step['op']}');
        // Quiet steps carry no state to compare: they run, and the next loud step shows what they did.
        if (result.containsKey('state')) expectJson(_state(novel.read), result['state'], '$name step $i ${step['op']}');
      }
    });
  }

  test('a module file reads back, and never replaces a built-in module', () {
    var ids = 0;
    String newId() => 'n${++ids}';
    final mystery = builtinModules.firstWhere((m) => m.id == 'mystery');
    final file = moduleFile(mystery);
    expect(file['format'], moduleFileFormat);
    final read = readModuleFile(jsonDecode(jsonEncode(file)), newId: newId);
    expect(read.id, isNot('mystery'));
    expect(read.name, mystery.name);
    expect(read.builtin, isFalse);
    expect(() => readModuleFile({'format': 'something-else'}, newId: newId), throwsFormatException);
  });
}
