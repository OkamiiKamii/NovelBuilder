// The Flutter app's own outputs for the genre modules (modules.golden.json pins them; outputs.ts makes Scriptor's,
// keyed and shaped the same way). For every novel given: where every module stands, what each would add (try it on),
// each installed module's workspace as the novel holds it, and each built-in module turned on, off and on again in a
// copy (with ids handed out in turn, so the order ids are made in is checked too), its workspace and its starter
// system; Made for your story; a module made from the novel, written to a file and read back. And `misc`: every
// built-in module read as a file would be, starter systems copied, formulas, Made for your story on random books,
// tracks' labels, numbers as typed, addresses and colours.
//
// What is the widgets' (module_service.dart's ToolData and paths, module_tools.dart, module_page.dart,
// modules_page.dart, try_on_panel.dart, genre_shelf.dart, core/format.dart) is copied here word for word but for
// Flutter's types, since those files need Flutter: dart.exe runs the domain itself (module_defs, module_changes,
// module_match, try_on, snapshots, compute, formula, system_changes, chronology).
//
// To make the golden again (from the scratch dir holding the package config that names novel_builder):
//   dart run dump.dart modules.golden.json <the Flutter fixtures>/*.novel.json ../../model/edge.novel.json \
//        ../../../assets/sample/the-drowned-road.novel.json

import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:novel_builder/shared/domain/codex/field_values.dart';
import 'package:novel_builder/shared/domain/collation.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/manuscript/outline.dart' show isDocument;
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:novel_builder/shared/domain/model/story_order.dart';
import 'package:novel_builder/shared/domain/modules/module_changes.dart';
import 'package:novel_builder/shared/domain/modules/module_defs.dart';
import 'package:novel_builder/shared/domain/modules/module_match.dart';
import 'package:novel_builder/shared/domain/modules/try_on.dart';
import 'package:novel_builder/shared/domain/progression/snapshots.dart';
import 'package:novel_builder/shared/domain/records/category.dart';
import 'package:novel_builder/shared/domain/records/entry.dart';
import 'package:novel_builder/shared/domain/records/novel.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:novel_builder/shared/domain/records/system.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';
import 'package:novel_builder/shared/domain/systems/formula.dart' as f;
import 'package:novel_builder/shared/domain/systems/system_changes.dart' show instantiateBlueprint;
import 'package:novel_builder/shared/domain/timeline/chronology.dart';

// ------------------------------------------------------------------------------------------- core/format.dart

String formatNumber(num n) {
  final digits = n.round().abs().toString();
  final out = StringBuffer(n < 0 ? '-' : '');
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) out.write(',');
    out.write(digits[i]);
  }
  return out.toString();
}

String plural(int n, String one, [String? many]) => '${formatNumber(n)} ${n == 1 ? one : (many ?? '${one}s')}';

// ------------------------------------------------------------------------------------------- module_service.dart

String? corePagePath(String to) => switch (to) {
  'systems' => '/organize/systems',
  'progression' => '/visualize/progression',
  'graph' => '/visualize/graph',
  'timeline' => '/plan',
  'relationships' => '/visualize',
  'plot' => '/plan/threads',
  'canon' => '/review/canon',
  'characters' => '/organize',
  'branches' => '/plan/histories',
  'continuity' => '/review/continuity',
  _ => null,
};

const modulesPath = '/organize/modules';
String modulePath(String moduleId, {String? tool, String? record}) => Uri(
  path: '$modulesPath/${Uri.encodeComponent(moduleId)}',
  queryParameters: {'tool': ?tool, 'record': ?record},
).toString().replaceFirst(RegExp(r'\?$'), '');

class ToolData {
  ToolData(this.novelId, this.snapshot, this.bindings) : model = StoryModel.fromSnapshot(snapshot) {
    final reading = readingOrder(model.nodes.values);
    final depth = <String, int>{};
    for (final n in reading) {
      depth[n.id] = n.parentId != null && depth.containsKey(n.parentId) ? depth[n.parentId]! + 1 : 0;
    }
    documents = [
      for (final n in reading)
        if (isDocument(n.kind)) (node: n, depth: depth[n.id]!),
    ];
    _position = {for (final (i, d) in documents.indexed) d.node.id: i};
  }

  final String novelId;
  final NovelSnapshot snapshot;
  final StoryModel model;
  final Bindings? bindings;
  late final List<({StoryNode node, int depth})> documents;
  late final Map<String, int> _position;

  List<Category> get categories => [...model.categories.values];
  List<Entry> get entries => [...model.entries.values];
  List<JsonMap> get records => snapshot.rows('moduleRecords');
  Category? category(String name) => resolveCategory(name, categories, bindings);
  List<Entry> entriesOf(Category? category) => category == null
      ? const []
      : ([
          for (final e in model.entries.values)
            if (e.category == category.key) e,
        ]..sort((a, b) => localeCompare(a.name, b.name)));
  FieldDef? field(Category? category, String name, [String? as]) =>
      resolveField(as ?? category?.name ?? '', category, name, bindings);
  String raw(Entry entry, Category category, FieldDef def) =>
      viewFields(entry, category).category.where((slot) => slot.$1.id == def.id).firstOrNull?.$2?.value ?? '';
  String shown(Entry entry, Category category, FieldDef def) =>
      displayValue(def.type, raw(entry, category, def), (id) => model.entries[id]?.name);
  int position(String? nodeId) => nodeId == null ? -1 : (_position[nodeId] ?? 1 << 52);
}

// ------------------------------------------------------------------------------------------- module_tools.dart

String missingText(String what) =>
    'This tool needs $what, which is not in the Codex. Turning the module off and on again puts back anything of its '
    'own that is missing.';

String entryTitle(Entry e) => e.name.isEmpty ? 'Untitled' : e.name;

JsonMap newEntryWords(Category c) {
  final singular = c.singular.toLowerCase();
  return {'label': 'New $singular', 'hint': 'New $singular…', 'add': 'Add'};
}

String numString(String text) => '${num.tryParse(text)}';

JsonMap registryJson(String moduleId, JsonMap tool, ToolData data, {String query = '', String only = '', bool recent = false, String? record}) {
  final category = data.category(str(tool['category']));
  if (category == null) return {'missing': missingText('“${str(tool['category'])}”')};
  final group = strOrNull(tool['groupBy']) == null ? null : data.field(category, str(tool['groupBy']), str(tool['category']));
  final summary = [for (final name in strings(tool['summary'])) ?data.field(category, name, str(tool['category']))];
  final all = data.entriesOf(category);
  String groupOf(Entry e) => group == null ? '' : data.shown(e, category, group);
  final groups = group == null
      ? const <String>[]
      : [
          if (group.type == FieldType.select) ...group.options,
          ...{
            for (final e in all)
              if (groupOf(e).isNotEmpty && !(group.type == FieldType.select && group.options.contains(groupOf(e)))) groupOf(e),
          },
        ];
  final needle = query.trim().toLowerCase();
  final listed = [
    for (final e in all)
      if ((only.isEmpty || (only == '—' ? groupOf(e).isEmpty : groupOf(e) == only)) &&
          (needle.isEmpty || [e.name, e.summary, ...e.tags, for (final f in e.fields) f.value].any((t) => t.toLowerCase().contains(needle))))
        e,
  ];
  if (recent) {
    listed.sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
  } else {
    listed.sort((a, b) => localeCompare(a.name, b.name));
  }
  final selected = all.where((e) => e.id == record).firstOrNull;
  final preset = group != null && group.type == FieldType.select && only.isNotEmpty && only != '—' ? only : null;
  return {
    'category': category.name,
    'newEntry': newEntryWords(category),
    'preset': preset,
    'searchLabel': 'Search ${category.name}',
    'filter': group == null
        ? null
        : {
            'label': 'Filter by ${group.name}',
            'options': [...groups, '—'],
            'none': 'Any ${group.name.toLowerCase()}',
            'names': [for (final o in [...groups, '—']) o == '—' ? 'Not set' : o],
          },
    'empty': all.isEmpty
        ? 'No ${category.name.toLowerCase()} yet. Nothing is made for you: add the first one above.'
        : (listed.isEmpty ? 'Nothing matches.' : null),
    'rows': [
      for (final e in listed)
        () {
          final line = [
            if (e.summary.trim().isNotEmpty) e.summary.trim(),
            for (final d in summary)
              if (data.shown(e, category, d).isNotEmpty) '${d.name}: ${data.shown(e, category, d)}',
          ].join(' · ');
          return [
            entryTitle(e),
            line.isEmpty ? null : line,
            groupOf(e).isEmpty ? null : groupOf(e),
            e.id == selected?.id,
            modulePath(moduleId, tool: str(tool['id']), record: e.id),
          ];
        }(),
    ],
    'record': selected == null
        ? null
        : {
            'name': selected.name,
            'back': [category.name, modulePath(moduleId, tool: str(tool['id']))],
            'nameLabel': '${category.singular} name',
            'fields': [
              for (final (def, field) in viewFields(selected, category).category)
                [def.name, field?.value ?? '', data.shown(selected, category, def)],
            ],
            'note':
                'This is a record in the Codex under ${category.name}. Its links, canon facts and where the manuscript '
                'mentions it are on its Codex page; fields are added, renamed or removed under “Categories & fields” there.',
          },
    'groups': groups,
  };
}

JsonMap boardJson(JsonMap tool, ToolData data) {
  final name = str(tool['category']);
  final category = data.category(name);
  final group = data.field(category, str(tool['groupBy']), name);
  if (category == null || group == null) return {'missing': missingText('“$name” with a “${str(tool['groupBy'])}” field')};
  final entries = data.entriesOf(category);
  final values = [for (final e in entries) data.raw(e, category, group)];
  final columns = group.type == FieldType.select
      ? [
          ...group.options,
          ...{
            for (final v in values)
              if (v.isNotEmpty && !group.options.contains(v)) v,
          },
        ]
      : ([
          ...{
            for (final v in values)
              if (v.isNotEmpty) v,
          },
        ]..sort((a, b) {
          final x = num.tryParse(a), y = num.tryParse(b);
          final byNumber = x != null && y != null ? x.compareTo(y) : 0;
          return byNumber != 0 ? byNumber : localeCompare(a, b);
        }));
  final shown = [for (final n in strings(tool['show'])) ?data.field(category, n, name)];
  List<Object?> column(String title, String value) {
    final cards = [
      for (final e in entries)
        if (data.raw(e, category, group) == value) e,
    ];
    return [
      title,
      value,
      '$title  ${cards.length}',
      [
        for (final e in cards)
          [
            e.name,
            [
              for (final d in shown)
                if (data.shown(e, category, d).isNotEmpty) '${d.name}: ${data.shown(e, category, d)}',
            ],
          ],
      ],
    ];
  }

  return {
    'category': category.name,
    'group': group.name,
    'newEntry': newEntryWords(category),
    'columns': [
      for (final v in columns) column(group.type == FieldType.number ? '${group.name} $v' : v, v),
      if (entries.any((e) => data.raw(e, category, group).isEmpty) || columns.isEmpty) column('No ${group.name.toLowerCase()} yet', ''),
    ],
  };
}

JsonMap tableJson(JsonMap tool, ToolData data) {
  final name = str(tool['category']);
  final category = data.category(name);
  final defs = [for (final n in strings(tool['fields'])) ?data.field(category, n, name)];
  if (category == null || defs.isEmpty) return {'missing': missingText('“$name” and its fields')};
  final entries = data.entriesOf(category);
  return {
    'empty': entries.isEmpty ? 'Nothing in ${category.name} yet.' : null,
    'header': [category.singular, for (final d in defs) d.name],
    'rows': [
      for (final e in entries)
        [
          e.name,
          for (final d in defs)
            [d.name + ' of ' + e.name, data.raw(e, category, d), data.shown(e, category, d).isEmpty ? '—' : data.shown(e, category, d)],
        ],
    ],
  };
}

JsonMap matrixJson(String moduleId, JsonMap tool, ToolData data) {
  final rows = data.category(str(tool['rows']));
  final columns = data.category(str(tool['columns']));
  if (rows == null || columns == null) return {'missing': missingText('“${str(tool['rows'])}” and “${str(tool['columns'])}”')};
  final rowEntries = data.entriesOf(rows);
  final columnEntries = data.entriesOf(columns);
  final toolId = str(tool['id']);
  final cells = {
    for (final r in data.records)
      if (r['kind'] == 'cell' && r['moduleId'] == moduleId && r['toolId'] == toolId) '${r['rowId']}|${r['colId']}': str(r['state']),
  };
  return {
    'newEntries': [newEntryWords(rows), if (columns.key != rows.key) newEntryWords(columns)],
    'empty': rowEntries.isEmpty || columnEntries.isEmpty
        ? 'Add at least one ${rows.singular.toLowerCase()} and one ${columns.singular.toLowerCase()} to fill in the matrix.'
        : null,
    'rows': [for (final e in rowEntries) e.name],
    'columns': [for (final e in columnEntries) e.name],
    'values': strings(tool['values']),
    'cells': [
      for (final r in rowEntries)
        for (final c in columnEntries)
          () {
            final value = cells['${r.id}|${c.id}'] ?? '';
            final label = '${r.name} and ${c.name}';
            return [value, label, value.isEmpty ? '—' : value, '$label: $value'];
          }(),
    ],
  };
}

JsonMap metersJson(JsonMap tool, ToolData data) {
  final name = str(tool['category']);
  final category = data.category(name);
  final fields = strings(tool['fields']);
  final defs = [for (final n in fields) ?data.field(category, n, name)];
  if (category == null || defs.isEmpty) return {'missing': missingText('“$name” with ${fields.join(', ')}')};
  final max = numOrNull(tool['max']) ?? 10;
  final entries = data.entriesOf(category);
  return {
    'empty': entries.isEmpty ? 'Nothing in ${category.name} yet.' : null,
    'maxLabel': '/ ${max is int || max == max.roundToDouble() ? max.round() : max}',
    'cards': [
      for (final e in entries)
        [
          e.name,
          [
            for (final d in defs)
              () {
                final text = data.raw(e, category, d).trim();
                final value = num.tryParse(text);
                final share = value == null || max <= 0 ? 0.0 : (value / max).clamp(0, 1).toDouble();
                return [d.name, share, '${d.name} meter for ${e.name}', value == null ? 'not set' : '$value of $max'];
              }(),
          ],
        ],
    ],
  };
}

JsonMap? arcJson(List<JsonMap> records, ToolData data, num min, num max, String label) {
  final points = [
    for (final r in records)
      if (r['value'] is num && r['nodeId'] != null && data.position(strOrNull(r['nodeId'])) < 1 << 52) r,
  ];
  if (points.length < 2) return {'note': 'Give at least two points a chapter and a value to see the line.'};
  String first(JsonMap r) => strings(r['entryIds']).firstOrNull ?? '';
  final series = [
    ...{for (final r in points) first(r)},
  ];
  final names = [for (final id in series) data.model.entries[id]?.name ?? 'Everything else'];
  const colours = ['#B4532A', '#3D5FA8', '#3F7D4E', '#8A63A8', '#C08A1A'];
  return {
    'lines': [
      for (final id in series)
        [
          for (final r in points)
            if (first(r) == id) [data.position(strOrNull(r['nodeId'])), (r['value'] as num).toDouble()],
        ]..sort((a, b) => (a[0] as int).compareTo(b[0] as int)),
    ],
    'names': names,
    'last': math.max(1, data.documents.length - 1),
    'semanticsLabel': '$label through the story',
    'caption':
        '$label from $min to $max, left to right through the chapters'
        '${series.any((s) => s.isNotEmpty) ? ': ${names.join(', ')}' : ''}',
    'legend': series.length > 1 ? [for (final (i, n) in names.indexed) [n, colours[i % colours.length]]] : null,
  };
}

JsonMap logJson(String moduleId, JsonMap tool, ToolData data, bool writes) {
  final toolId = str(tool['id']);
  final states = strings(tool['states']);
  final value = mapOrNull(tool['value']);
  final second = strOrNull(tool['second']);
  final about = strOrNull(tool['about']);
  final candidates = about == null ? data.entries : data.entriesOf(data.category(about));
  final placed = resolveChronology(data.model.events.values, data.model.calendar);
  final records = [
    for (final r in data.records)
      if (r['kind'] == 'log' && r['moduleId'] == moduleId && r['toolId'] == toolId) r,
  ];
  records.sort((a, b) {
    final byPlace = data.position(strOrNull(a['nodeId'])).compareTo(data.position(strOrNull(b['nodeId'])));
    return byPlace != 0 ? byPlace : (numOrNull(a['createdAt']) ?? 0).compareTo(numOrNull(b['createdAt']) ?? 0);
  });
  final chapterIds = [for (final d in data.documents) d.node.id];
  String chapterName(String id) {
    final d = data.documents.where((d) => d.node.id == id).firstOrNull;
    return d == null ? id : '${'   ' * d.depth}${d.node.title.isEmpty ? 'Untitled' : d.node.title}';
  }

  String? valid(String? id) => chapterIds.contains(id) ? id : null;
  final label = value == null ? null : str(value['label'], 'Value');
  return {
    'states': states,
    'chart': value == null ? null : arcJson(records, data, numOrNull(value['min']) ?? 0, numOrNull(value['max']) ?? 10, label!),
    'add': writes ? ['New entry in ${str(tool['title'])}', 'What happens?', 'Chapter for the new entry', 'No chapter yet'] : null,
    'suggestions': writes
        ? [
            for (final s in strings(tool['suggestions']))
              if (!records.any((r) => r['title'] == s)) s,
          ]
        : [],
    'chapters': [for (final id in chapterIds) chapterName(id)],
    'candidates': [for (final e in candidates) e.name],
    'placed': [
      for (final p in placed) p.label.isEmpty ? p.event.name : '${p.event.name} (${p.label})',
    ],
    'empty': records.isEmpty ? 'Nothing logged yet.' : null,
    'lines': [
      for (final r in records)
        () {
          final title = str(r['title']);
          final node = data.model.nodes[strOrNull(r['nodeId'])];
          final event = placed.where((p) => p.event.id == r['eventId']).firstOrNull;
          final aboutEntries = [for (final id in strings(r['entryIds'])) ?data.model.entries[id]];
          return {
            'heading': [title, if (str(r['state']).isNotEmpty) str(r['state'])].join(' · '),
            'chapterTitle': node?.title,
            'note': str(r['note']).isEmpty ? null : str(r['note']),
            'done': tool['checklist'] == true ? [r['done'] == true, '$title done'] : null,
            'state': states.isNotEmpty ? ['State of $title', str(r['state'])] : null,
            'value': value == null ? null : ['$label of $title', r['value'] is num ? (r['value'] as num).toDouble() : null],
            'chapter': ['Chapter of $title', valid(strOrNull(r['nodeId']))],
            'second': second == null ? null : ['$second: $title', '$second: not yet', valid(strOrNull(r['endNodeId']))],
            'about': candidates.isEmpty ? null : ['$title is about', strings(r['entryIds']).firstOrNull ?? ''],
            'event': placed.isEmpty ? null : ['Timeline event of $title', placed.any((p) => p.event.id == r['eventId']) ? str(r['eventId']) : ''],
            'links': [
              if (node != null) 'Open ${node.title.isEmpty ? 'Untitled' : node.title}',
              if (event != null) 'On the timeline /plan/event/${event.event.id}',
              for (final e in aboutEntries) e.name,
            ],
          };
        }(),
    ],
  };
}

JsonMap calculatorJson(JsonMap tool) {
  final values = <String, String>{
    for (final i in maps(tool['inputs'])) str(i['key']).toLowerCase(): '${numOrNull(i['value']) ?? 0}',
  };
  final scope = f.FormulaScope(
    value: (name) => values.containsKey(name.toLowerCase()) ? (double.tryParse(values[name.toLowerCase()]!) ?? 0.0) : null,
    holds: (_, _) => null,
  );
  return {
    'inputs': [for (final i in maps(tool['inputs'])) '${str(i['label'])} (${str(i['unit'])})'],
    'outputs': [
      for (final o in maps(tool['outputs']))
        [
          str(o['label']),
          () {
            try {
              final v = f.evaluateFormula(f.parseFormula(str(o['formula'])), scope);
              return v is num ? '${f.formatNumber(v.toDouble())} ${str(o['unit'])}' : f.jsString(v);
            } on f.FormulaError catch (e) {
              return e.message;
            } catch (_) {
              return 'Cannot be worked out';
            }
          }(),
        ],
    ],
  };
}

List<ProgressSnapshot> _snapshots(ToolData data) => [for (final r in data.snapshot.rows('progressSnapshots')) ProgressSnapshot(r)];
List<Entry> _tracked(ToolData data, List<ProgressSnapshot> snapshots) => [
  for (final e in data.entries)
    if (snapshots.any((s) => s.entryId == e.id)) e,
]..sort((a, b) => localeCompare(a.name, b.name));

extension on String {
  String ifEmpty(String other) => isEmpty ? other : this;
}

JsonMap ranksJson(ToolData data) {
  final snapshots = _snapshots(data);
  final tracked = _tracked(data, snapshots);
  final nodes = [...data.model.nodes.values];
  if (tracked.isEmpty) {
    return {
      'empty': [
        'No progression snapshots yet. Log how a character changes on their profile, and their climb appears here.',
        'Open the cast',
        '/organize',
      ],
    };
  }
  return {
    'people': [
      for (final e in tracked)
        [
          e.name,
          [
            for (final s in inStoryOrder(snapshots, nodes, e.id))
              '${placeOfSnapshot(s, nodes)}: ${[for (final b in data.model.systems.values)
                if (s.systems[b.id] != null)
                  for (final t in resolveSystem(b, s.systems[b.id]).tracks) '${t.track.name} ${t.label.replaceFirst(RegExp(r' of \d+$'), '')}'].join(' · ').ifEmpty(s.label.isEmpty ? 'No system' : s.label)}',
          ],
        ],
    ],
  };
}

JsonMap inventoryJson(ToolData data, String who, String at) {
  final snapshots = _snapshots(data);
  final tracked = _tracked(data, snapshots);
  final nodes = [...data.model.nodes.values];
  if (tracked.isEmpty) {
    return {
      'empty': [
        'No progression snapshots yet. Log a character’s gear on their profile, and it appears here.',
        'Open the cast',
        '/organize',
      ],
    };
  }
  final entry = tracked.where((e) => e.id == who).firstOrNull ?? tracked.first;
  final chapterIds = [for (final d in data.documents) d.node.id];
  final state = stateAt(snapshots, nodes, entry.id, chapterIds.contains(at) ? at : null);
  return {
    'entry': entry.name,
    'who': [for (final e in tracked) data.model.entries[e.id]?.name ?? e.id],
    'when': [for (final id in chapterIds) 'As of ${data.model.nodes[id]?.title ?? id}'],
    'note': state == null
        ? 'Nothing logged for ${entry.name} by then.'
        : (state.gear.isEmpty ? '${entry.name} carries nothing at ${placeOfSnapshot(state, nodes)}.' : null),
    'gear': [
      for (final g in state?.gear ?? const <GearItem>[])
        [data.model.entries[g.entryId]?.name, g.name, g.kind.isEmpty ? null : g.kind, g.note.isEmpty ? null : g.note],
    ],
  };
}

JsonMap lineageJson(ToolData data) {
  final people = {
    for (final e in data.entries)
      if (e.category == 'character') e.id: e,
  };
  final rows = buildLineage([...data.model.relations.values], data.model.order, people.containsKey);
  String names(List<String> ids) => [for (final id in ids) ?people[id]?.name].join(', ');
  if (rows.isEmpty) {
    return {
      'empty': [
        'No family relationships yet. Record who is whose parent, sibling or spouse in Relationships and the tree '
            'is drawn from them.',
        'Open Relationships',
        '/visualize',
      ],
    };
  }
  return {
    'generations': [
      for (final (i, row) in rows.indexed)
        [
          'Generation ${i + 1}',
          [
            for (final kin in [...row]..sort((a, b) => localeCompare(people[a.id]!.name, people[b.id]!.name)))
              [
                people[kin.id]!.name,
                [
                  if (kin.parents.isNotEmpty) 'Child of ${names(kin.parents)}',
                  if (kin.partners.isNotEmpty) 'Married to ${names(kin.partners)}',
                  if (kin.siblings.isNotEmpty) 'Sibling of ${names(kin.siblings)}',
                  if (kin.children.isNotEmpty) 'Parent of ${names(kin.children)}',
                  if (kin.relatives.isNotEmpty) 'Related to ${names(kin.relatives)}',
                ],
              ],
          ],
        ],
    ],
  };
}

Object? toolJson(String moduleId, JsonMap tool, ToolData data) => switch (tool['type']) {
  'registry' => {
    'plain': registryJson(moduleId, tool, data),
    'recent': registryJson(moduleId, tool, data, recent: true),
    'query': registryJson(moduleId, tool, data, query: 'a'),
    'notSet': registryJson(moduleId, tool, data, only: '—'),
    'first': () {
      final r = registryJson(moduleId, tool, data);
      final groups = r['groups'] as List? ?? const [];
      final rows = r['rows'] as List? ?? const [];
      final all = data.entriesOf(data.category(str(tool['category'])));
      return {
        'only': groups.isEmpty ? null : registryJson(moduleId, tool, data, only: groups.first as String),
        'record': rows.isEmpty ? null : registryJson(moduleId, tool, data, record: all.first.id)['record'],
      };
    }(),
  },
  'board' => boardJson(tool, data),
  'table' => tableJson(tool, data),
  'matrix' => matrixJson(moduleId, tool, data),
  'meters' => metersJson(tool, data),
  'log' => logJson(moduleId, tool, data, true),
  'calculator' => calculatorJson(tool),
  'ranks' => ranksJson(data),
  'inventory' => () {
    final chapterIds = [for (final d in data.documents) d.node.id];
    final snapshots = _snapshots(data);
    final tracked = _tracked(data, snapshots);
    return {
      'plain': inventoryJson(data, '', ''),
      'last': tracked.isEmpty || chapterIds.isEmpty ? null : inventoryJson(data, tracked.last.id, chapterIds.first),
    };
  }(),
  'lineage' => lineageJson(data),
  'page' => corePagePath(str(tool['to'])) == null ? {'missing': 'That page is not in this version of the app.'} : [corePagePath(str(tool['to'])), 'Open ${str(tool['title'])}'],
  _ => 'unknown',
};

// ------------------------------------------------------------------------------------------- module_page.dart

String? _categoryOf(JsonMap tool) =>
    const {'registry', 'board', 'table', 'meters'}.contains(tool['type']) ? str(tool['category']) : null;

JsonMap dashboardJson(ModuleDefinition module, List<JsonMap> tools, ToolData data) {
  final lists = <({JsonMap tool, Category category, List<Entry> entries})>[];
  for (final tool in tools) {
    final category = data.category(_categoryOf(tool) ?? '');
    if (category != null && !lists.any((l) => l.category.key == category.key)) {
      lists.add((tool: tool, category: category, entries: data.entriesOf(category)));
    }
  }
  final logs = [
    for (final tool in tools)
      if (tool['type'] == 'log' || tool['type'] == 'matrix')
        (tool: tool, count: data.records.where((r) => r['moduleId'] == module.id && r['toolId'] == tool['id']).length),
  ];
  final own = {
    for (final c in module.categories)
      if (c['builtin'] != true) ?data.category(str(c['name']))?.key,
  };
  final mine = [
    for (final l in lists)
      if (own.contains(l.category.key)) l,
  ];
  final recent = [
    for (final l in mine)
      for (final e in l.entries) (entry: e, list: l),
  ]..sort((a, b) => b.entry.updatedAt.compareTo(a.entry.updatedAt));
  final empty = [
    for (final l in mine)
      for (final e in l.entries)
        if (e.summary.trim().isEmpty && e.description.trim().isEmpty && !e.fields.any((f) => f.value.trim().isNotEmpty)) (entry: e, list: l),
  ];
  List<Object?> row(({Entry entry, ({JsonMap tool, Category category, List<Entry> entries}) list}) r) => [
    r.entry.name.isEmpty ? 'Untitled' : r.entry.name,
    r.list.category.singular,
    r.list.tool['type'] == 'registry' ? modulePath(module.id, tool: str(r.list.tool['id']), record: r.entry.id) : 'entry:${r.entry.id}',
  ];
  return {
    'tiles': [
      for (final l in lists)
        ['${l.entries.length} ${l.category.name}: open ${str(l.tool['title'])}', l.entries.length, l.category.name, modulePath(module.id, tool: str(l.tool['id']))],
      for (final l in logs)
        if (l.count > 0) ['${l.count} in ${str(l.tool['title'])}: open it', l.count, str(l.tool['title']), modulePath(module.id, tool: str(l.tool['id']))],
    ],
    'nothing': lists.every((l) => l.entries.isEmpty) && logs.every((l) => l.count == 0),
    'recent': [for (final r in recent.take(6)) row(r)],
    'empty': empty.isEmpty ? null : ['Still empty  ${empty.length}', [for (final r in empty.take(8)) row(r)]],
  };
}

JsonMap configureJson(NovelSnapshot snapshot, String moduleId) {
  final read = ModuleChanges(snapshot, now: 0, createId: () => throw StateError('reading'));
  final row = read.rowFor(moduleId)!;
  final module = ModuleDefinition(mapOrNull(row['definition'])!);
  final settings = mapOrNull(row['settings']) ?? const <String, Object?>{};
  final order = strings(settings['order']);
  int at(String id) => order.contains(id) ? order.indexOf(id) : order.length + module.tools.indexWhere((t) => t['id'] == id);
  final tools = [...module.tools]..sort((a, b) => at(str(a['id'])).compareTo(at(str(b['id']))));
  final hidden = strings(settings['hidden']);
  final titles = mapOrNull(settings['titles']) ?? const {};
  final states = mapOrNull(settings['states']) ?? const {};
  final categories = read.categories();
  final bindings = bindingsOf(row['bindings']);
  return {
    'title': 'Configure ${module.name}',
    'nav': str(settings['nav'], module.nav),
    'tools': [
      for (final (i, t) in tools.indexed)
        [
          str(t['id']),
          !hidden.contains(t['id']),
          str(titles[t['id']], str(t['title'])),
          i != 0,
          i != tools.length - 1,
          t['type'] == 'log' && strings(t['states']).isNotEmpty
              ? (strings(states[t['id']]).isEmpty ? strings(t['states']) : strings(states[t['id']])).join(', ')
              : null,
        ],
    ],
    'categories': [
      for (final c in module.categories)
        ?(resolveCategory(c['builtin'] == true ? str(c['key']) : str(c['name']), categories, bindings) ??
                categories.where((x) => c['builtin'] == true && x.key == c['key']).firstOrNull)
            ?.name,
    ],
  };
}

JsonMap? workspaceJson(NovelSnapshot snapshot, String moduleId, bool writes) {
  final read = ModuleChanges(snapshot, now: 0, createId: () => throw StateError('reading'));
  final row = read.rowFor(moduleId);
  if (row == null) return null;
  final module = ModuleDefinition(mapOrNull(row['definition'])!);
  if (row['enabled'] != true) return {'off': module.name};
  final settings = settingsOf(row['settings']);
  final tools = arrangedTools(module, row['settings']);
  final data = ToolData(str(snapshot.project['id']), snapshot, bindingsOf(row['bindings']));
  final starter = module.system != null && !snapshot.rows('systems').any((s) => s['id'] == row['systemId']) && writes;
  return {
    'title': '${module.icon.isEmpty ? '' : '${module.icon} '}${settings.nav ?? module.nav}',
    'starter': starter,
    'chips': [
      modulePath(module.id),
      for (final t in tools) [str(t['id']), str(t['title']), modulePath(module.id, tool: str(t['id']))],
    ],
    'dashboard': dashboardJson(module, tools, data),
    'views': {for (final t in tools) str(t['id']): toolJson(module.id, t, data)},
    'configure': configureJson(snapshot, moduleId),
  };
}

// ------------------------------------------------------------------------------------------- try_on_panel.dart

JsonMap tryOnJson(ModuleTryOn t, ModuleDefinition module, String novelTitle, double screenWidth) {
  String list(List<String> words, [int most = 3]) {
    if (words.length <= most) {
      return words.length <= 1 ? words.join() : '${words.take(words.length - 1).join(', ')} and ${words.last}';
    }
    return '${words.take(most).join(', ')} and ${words.length - most} more';
  }

  String gainLine(TryOnGain g) {
    final fields = list(g.fields);
    if (g.entries.isEmpty) return '${g.kind.name} gain ${plural(g.fields.length, 'field')}: $fields.';
    if (g.entries.length == 1) return '${g.entries.single} gains $fields.';
    if (g.entries.length <= 3) return '${list(g.entries)} each gain $fields.';
    return 'Your ${formatNumber(g.entries.length)} ${g.kind.name.toLowerCase()} gain $fields.';
  }

  final title = novelTitle.trim().isEmpty ? 'your book' : '“${novelTitle.trim()}”';
  final shown = screenWidth < 600 ? 6 : t.tools.length;
  final shelf = [
    for (final c in t.before) [c.name, false, t.gains.any((g) => g.kind.key == c.key)],
    for (final c in t.added) [c.name, true, false],
  ];
  return {
    'before': [for (final c in t.before) c.name],
    'added': [for (final c in t.added) c.name],
    'gains': [
      for (final g in t.gains) [g.kind.name, g.fields, g.entries],
    ],
    'tools': [for (final x in t.tools) [x.type, x.title]],
    'offersSystem': t.offersSystem,
    'changesNothing': t.changesNothing,
    'shelf': shelf,
    'heading': 'In $title, with ${module.name}',
    'shelfLabel': shelf.isEmpty
        ? null
        : 'Kinds of record: ${t.before.length} now, ${t.before.length + t.added.length} with it. '
              'New: ${t.added.map((c) => c.name).join(', ')}',
    'kinds': t.added.isEmpty
        ? '${plural(t.before.length, 'kind')} of record, the same with it.'
        : '${plural(t.before.length, 'kind')} of record now, ${formatNumber(t.before.length + t.added.length)} '
              'with it: ${list([for (final c in t.added) c.name], 4)}.',
    'gainLines': [for (final g in t.gains) gainLine(g)],
    'toolsHeading': t.tools.isEmpty ? null : 'Its workspace opens with ${plural(t.tools.length, 'tool')}',
    'shownTools': [for (final x in t.tools.take(shown)) x.title],
    'moreTools': t.tools.length > shown ? 'and ${formatNumber(t.tools.length - shown)} more' : null,
    'system': t.offersSystem ? 'And an example system, “${str(module.system!['name'])}”, added only if you ask for it.' : null,
  };
}

// ------------------------------------------------------------------------------------------- the domain, as JSON

JsonMap statusJson(ModuleStatus s) => {
  'id': s.module.id,
  'state': s.state.name,
  'label': s.state.label,
  'reasons': s.reasons,
  'installed': s.installed,
  'updatable': s.updatable,
  'entries': s.entries,
  'records': s.records,
  'shares': [
    for (final x in s.shares) [x.moduleId, x.name, x.enabled, x.categories],
  ],
};

List<Object?> cats(ModuleChanges m) => [
  for (final c in m.categories())
    [
      c.key,
      c.name,
      c.singular,
      c.color,
      c.archived,
      [
        for (final f in c.fields) [f.id, f.name, f.raw['type'], f.options, f.archived],
      ],
    ],
];

JsonMap rowJson(JsonMap row) => {
  for (final e in row.entries)
    if (e.key != 'definition') e.key: e.value,
};

JsonMap novel(NovelSnapshot s) {
  final out = <String, Object?>{};
  final title = str(s.project['title']);
  final read = ModuleChanges(s, now: 0, createId: () => throw StateError('reading'));
  out['status'] = [for (final st in read.status(builtinModules)) statusJson(st)];
  out['enabled'] = [for (final d in read.enabled()) d.id];
  for (final m in builtinModules) {
    out['tryOn:${m.id}'] = tryOnJson(tryOnModule(s, m), m, title, 390);
    out['tryOnWide:${m.id}'] = tryOnJson(tryOnModule(s, m), m, title, 1000)['shownTools'];
  }
  for (final r in read.installed()) {
    out['here:${r['moduleId']}'] = workspaceJson(s, str(r['moduleId']), true);
  }
  for (final m in builtinModules) {
    var n = 0;
    String nid() => 'n${++n}';
    final on = ModuleChanges(s, now: 1000, createId: nid);
    final row = on.enable(m);
    final off = ModuleChanges(on.snapshot, now: 2000, createId: nid)..disable(m.id);
    final again = ModuleChanges(off.snapshot, now: 3000, createId: nid)..enable(m);
    Object? starter;
    if (m.system != null) {
      final st = ModuleChanges(on.snapshot, now: 1500, createId: nid);
      final id = st.addStarterSystem(m.id);
      final twice = st.addStarterSystem(m.id);
      starter = {'system': st.row('systems', id), 'twice': twice == id, 'row': rowJson(st.rowFor(m.id)!)};
    }
    // Arranged: the first tool hidden, the second renamed, the order turned round, a log's stages its own.
    final conf = ModuleChanges(on.snapshot, now: 4000, createId: nid);
    final ids = [for (final t in m.tools) str(t['id'])];
    final log = m.tools.where((t) => t['type'] == 'log' && strings(t['states']).isNotEmpty).firstOrNull;
    conf.configure(
      m.id,
      (_) => {
        'hidden': [if (ids.isNotEmpty) ids.first, 'nonsense'],
        'order': ids.reversed.toList(),
        'titles': {if (ids.length > 1) ids[1]: '  Renamed tool  ', 'nonsense': 'x'},
        'states': {if (log != null) str(log['id']): ['Second', 'First', 'Second', ' ']},
        'nav': 'My workspace',
      },
    );
    out['on:${m.id}'] = {
      'row': rowJson(row),
      'categories': cats(on),
      'off': {'categories': cats(off), 'row': rowJson(off.rowFor(m.id)!)},
      'again': {'categories': cats(again), 'row': rowJson(again.rowFor(m.id)!)},
      'status': [
        for (final st in again.status(builtinModules))
          if (st.module.id == m.id) statusJson(st),
      ],
      'enabled': [for (final d in again.enabled()) d.id],
      'starter': starter,
      'configured': {
        'settings': conf.rowFor(m.id)!['settings'],
        'arranged': [
          for (final t in arrangedTools(ModuleDefinition(mapOrNull(conf.rowFor(m.id)!['definition'])!), conf.rowFor(m.id)!['settings']))
            [t['id'], t['title'], t['states']],
        ],
      },
      'workspace': workspaceJson(on.snapshot, m.id, true),
      'workspaceArranged': workspaceJson(conf.snapshot, m.id, true)?['title'],
      'workspaceOff': workspaceJson(off.snapshot, m.id, true),
    };
  }
  final novel = Novel(s.project);
  out['fits'] = [
    for (final fit in fittingModulesFromStored(
      genres: [novel.primaryGenre, ...novel.secondaryGenres],
      tags: novel.tags,
      synopsis: novel.synopsis,
      storedContents: [for (final r in s.rows('chapterContents')) jsonEncode(r)],
    ))
      [fit.moduleId, fit.words, fit.score],
  ];
  // A module made from this novel: every category with fields, and the first system.
  var b = 0;
  String bid() => 'b${++b}';
  final maker = ModuleChanges(s, now: 5000, createId: bid);
  final keys = [
    for (final c in maker.categories())
      if (!c.archived && c.fields.any((f) => !f.archived)) c.key,
  ];
  final systems = s.rows('systems');
  try {
    final built = maker.buildFrom(
      name: 'Made from $title',
      genre: 'Its kind',
      description: 'What it is',
      categoryKeys: keys,
      systemId: systems.isEmpty ? null : str(systems.first['id']),
    );
    final file = jsonDecode(jsonEncode(moduleFile(built)));
    out['built'] = {'raw': built.raw, 'read': readModuleFile(file, newId: bid).raw};
  } on Exception catch (e) {
    out['built'] = {'error': '$e'};
  }
  return out;
}

// ------------------------------------------------------------------------------------------- misc

JsonMap misc() {
  final out = <String, Object?>{};
  var n = 0;
  String id() => 'm${++n}';
  out['builtin'] = [for (final m in builtinModules) parseDefinition(m.raw, newId: id).raw];
  out['starters'] = [
    for (final m in builtinModules)
      if (m.system != null) instantiateBlueprint(m.system!, id),
  ];
  out['odd'] = [
    for (final raw in <Object?>[
      null,
      {'name': '  '},
      {
        'name': 'Odd ${'x' * 90}',
        'nav': 'N' * 50,
        'icon': '🐉✦★',
        'version': 2.5,
        'features': [for (var i = 0; i < 14; i++) 'f$i', 3, ''],
        'schema': {
          'categories': [
            {'name': 'Gadgets', 'color': '#ABCDEF', 'fields': [{'name': 'Power', 'type': 'number'}, {'name': ''}, {'name': 'Kind', 'type': 'weird'}]},
            {'builtin': true, 'key': 'item', 'fields': [{'name': 'Charge', 'type': 'select', 'options': ['Low', ' ', 'High']}]},
            {'name': '', 'builtin': false},
            {'name': 'Bad colour', 'color': 'red'},
          ],
        },
        'tools': [
          {'type': 'registry'},
          {'type': 'registry', 'category': 'Gadgets', 'groupBy': 'Kind', 'summary': ['Power', '']},
          {'type': 'board', 'category': 'Gadgets'},
          {'type': 'meters', 'category': 'Gadgets', 'fields': ['Power'], 'max': 0},
          {'type': 'log', 'value': {'min': 2}, 'checklist': true, 'states': ['A', 'B']},
          {'type': 'calculator', 'inputs': [{'key': 'a', 'value': 3}], 'outputs': [{'formula': 'a * 2'}]},
          {'type': 'calculator', 'inputs': [], 'outputs': [{'formula': '1'}]},
          {'type': 'page', 'to': 'nowhere'},
          {'type': 'page', 'to': 'graph', 'title': 'Graph'},
          {'type': 'ranks', 'id': 'r', 'hint': ' A hint '},
          {'type': 'mystery'},
          'not a tool',
        ],
        'system': {
          'name': 'Rules',
          'variables': [
            {'name': 'Strength', 'base': 10.0},
            {'name': 'Strength'},
            {'kind': 'odd', 'options': [' a ', '']},
          ],
          'tracks': [
            {'name': 'Level', 'cap': 99.6, 'points': -2, 'sources': ['x', ' x ', '']},
            {'name': 'Realm', 'kind': 'stages', 'stages': [{'name': 'One', 'grants': ['i1', 'gone']}, {'name': ''}]},
          ],
          'groups': [{'id': 'g1', 'name': 'Skills'}],
          'items': [{'id': 'i1', 'groupId': 'g1', 'name': 'Bolt', 'parentId': 'i1', 'modifiers': [{'op': 'pow'}], 'costs': [{}]}, {'groupId': 'gone'}],
          'ranks': ['Bronze', {'name': 'Silver'}],
          'matrices': [{'name': 'Table', 'cells': {'a': ' ', 'b': 'yes'}}],
        },
      },
    ])
      () {
        try {
          return parseDefinition(raw, newId: id).raw;
        } on FormatException catch (e) {
          return 'error: ${e.message}';
        }
      }(),
  ];
  out['derived'] = deriveTools([
    {
      'name': 'Space Ships!',
      'fields': [
        {'name': 'Class', 'type': 'select'},
        {'name': 'Crew', 'type': 'number'},
        {'name': 'Speed', 'type': 'number'},
        {'name': 'Notes', 'type': 'longtext'},
        {'name': 'Hull', 'type': 'number'},
        {'name': 'Shields', 'type': 'number'},
        {'name': 'Guns', 'type': 'number'},
      ],
    },
    {'name': 'Empty', 'fields': []},
    {'name': 'Built', 'builtin': true, 'fields': [{'name': 'X'}]},
  ], true);
  // Formulas: what each works out to, or what is said; what is not met; the names read.
  final values = <String, Object>{'strength': 12.0, 'level': 12.0, 'agility': 23.0, 'class': 'Void Mage', 'realm': 2.0, 'zero': 0.0};
  final scope = f.FormulaScope(
    value: (name) => values[name.toLowerCase()],
    holds: (group, name) => group.toLowerCase() == 'class' ? name.toLowerCase() == 'void mage' : (group.toLowerCase() == 'title' ? false : null),
  );
  out['formulas'] = [
    for (final formula in [
      'strength * 1.5',
      'intelligence / 10',
      '100 * level ^ 1.5',
      'max(1, floor(agility / 5))',
      'Class: Void Mage AND level >= 50',
      'NOT (realm < 3) OR Title: Chosen',
      '2 × 3 ÷ 4 − 1',
      'level ≥ 12 and level ≤ 12 and level ≠ 3',
      'if(level > 10, "high", "low")',
      'if(level)',
      'clamp(agility, 1, 10) + round(2.5) + ceil(-1.5) + abs(-3) + sqrt(16) + min(3, 1, 2)',
      'class = "void mage"',
      'class + 1',
      'level / zero',
      'level % zero',
      '7 % 3 + -7 % 3',
      '[strength] + 1',
      "'quoted' = 'QUOTED '",
      '“curly”',
      'nope(1)',
      'floor(1, 2)',
      'min()',
      '(1 + 2',
      '1 +',
      '',
      '   ',
      '1 2',
      '#',
      'Class:',
      'yes and not no',
      '-level',
      '+3',
      '2 ^ 3 ^ 2',
      '!true || false && true',
      'a <> b',
      '10 == 10.0',
      '1e3',
      '.5 + 0.25',
      'Title: Chosen or level > 1',
      'Weapon: Sword',
    ])
      () {
        try {
          final node = f.parseFormula(formula);
          Object? value;
          try {
            value = f.evaluateFormula(node, scope);
          } on f.FormulaError catch (e) {
            value = 'error: ${e.message}';
          }
          List<String>? notMet;
          try {
            notMet = f.unmet(node, scope);
          } on f.FormulaError {
            notMet = null;
          }
          return [formula, value is num ? value.toDouble() : value, notMet, f.namesIn(node)];
        } on f.FormulaError catch (e) {
          return [formula, 'parse: ${e.message}', null, null];
        }
      }(),
  ];
  out['formatted'] = [for (final v in [0.0, 1.0, 1.005, 2.675, -3.14159, 1e21, 12.5, 0.1 + 0.2, double.infinity]) f.formatNumber(v)];
  // Made for your story on random books, as module_match_test.dart makes them.
  final rnd = math.Random(2026);
  String text(int words) => [
    for (var i = 0; i < words; i++) _vocab[rnd.nextInt(_vocab.length)],
  ].join(const [' ', ' ', '\n', ' — ', '-', ''][rnd.nextInt(6)]);
  out['fits'] = [
    for (var round = 0; round < 30; round++)
      () {
        final chapters = [for (var c = 0; c < 1 + rnd.nextInt(4); c++) text(5 + rnd.nextInt(40))];
        final genres = [text(1 + rnd.nextInt(2))];
        final tags = [text(rnd.nextInt(3))];
        final synopsis = text(rnd.nextInt(12));
        final on = {if (rnd.nextBool()) 'progression'};
        final fits = fittingModules(genres: genres, tags: tags, synopsis: synopsis, chapters: chapters, on: on, limit: 10);
        return {
          'chapters': chapters,
          'genres': genres,
          'tags': tags,
          'synopsis': synopsis,
          'on': on.toList(),
          'fits': [for (final x in fits) [x.moduleId, x.words, x.score]],
        };
      }(),
  ];
  // Where a snapshot stands on a track.
  final tracks = [
    SysTrack({'id': 't1', 'name': 'Level', 'kind': 'levels', 'cap': 100}),
    SysTrack({'id': 't2', 'name': 'Level', 'kind': 'levels', 'cap': 0}),
    SysTrack({
      'id': 't3',
      'name': 'Realm',
      'kind': 'stages',
      'stages': [
        {'id': 's1', 'name': 'Qi'},
        {'id': 's2', 'name': 'Core'},
      ],
    }),
    SysTrack({'id': 't4', 'name': 'Empty', 'kind': 'stages', 'stages': []}),
  ];
  final system = SystemBlueprint({
    'id': 'sys',
    'name': 'S',
    'tracks': [for (final t in tracks) t.raw],
  });
  out['tracks'] = [
    for (final progress in <JsonMap>[
      {},
      {'t1': 12, 't2': 7.5, 't3': 's2', 't4': 'x'},
      {'t1': 250, 't2': '  3e1 ', 't3': 'gone'},
      {'t1': 0, 't2': 'abc', 't3': 7},
      {'t1': 2.5, 't2': -4},
      {'t1': '0x10', 't2': ''},
    ])
      [for (final t in resolveSystem(system, SnapshotSystem({'progress': progress})).tracks) t.label],
  ];
  out['numbers'] = [
    for (final t in ['5', '5.0', ' 12 ', '1e3', '0x1f', '-0x1f', '.5', '5.', 'abc', '', 'NaN', 'Infinity', '-Infinity', '+3', '1_000', '00', '-0'])
      () {
        final v = num.tryParse(t);
        return [t, v == null ? null : '$v'];
      }(),
  ];
  out['paths'] = [
    modulePath('mystery'),
    modulePath('mystery', tool: 'people'),
    modulePath('custom-1 2', tool: 'a b*c', record: "x'y(z)!~"),
    modulePath('é/ü', record: 'r&s=t'),
  ];
  return out;
}

const _vocab = [
  'magic',
  'magical',
  'Magic',
  'MAGIC',
  'mägic',
  'magic,',
  '(magic)',
  'unmagic',
  'magic2',
  'skills',
  'skill',
  'skill-tree',
  'sci-fi',
  'sci',
  'fi',
  'scifi',
  'science',
  'fiction',
  'science fiction',
  'coming',
  'of',
  'age',
  'slice',
  'life',
  'café',
  'Élan',
  'niño',
  'Ωmega',
  '𝐀lpha',
  'dragon𝐀',
  '𝐀dragon',
  '“love”',
  'it’s',
  'hero’s',
  'level\nup',
  'war.',
  '42',
  'ranks',
  'évolution',
  'evolution',
  'king',
  'queen',
  'Kingdom',
  'the',
  'and',
  '—',
  '…',
];

// ------------------------------------------------------------------------------------------- output

/// The test's canonical JSON and its FNV-1a hash (as test/characters/golden/dump.dart).
String canonical(Object? v) {
  if (v == null) return 'null';
  if (v is bool) return '$v';
  if (v is num) {
    if (v.isFinite && v == v.truncateToDouble() && v.abs() < 9007199254740992) return '${v.toInt()}';
    return '$v';
  }
  if (v is String) return '"${v.replaceAllMapped(RegExp(r'["\\]'), (m) => '\\${m[0]}')}"';
  if (v is List) return '[${v.map(canonical).join(',')}]';
  if (v is Map) {
    final keys = [for (final k in v.keys) '$k']..sort();
    return '{${keys.map((k) => '${canonical(k)}:${canonical(v[k])}').join(',')}}';
  }
  return canonical('$v');
}

String hashOf(Object? v) {
  var h = 0x811c9dc5;
  for (final c in canonical(v).codeUnits) {
    h ^= c;
    h = (h * 0x01000193) & 0xffffffff;
  }
  return h.toRadixString(16).padLeft(8, '0');
}

/// With FULL set, every part whole; else each part of each novel as its hash (`misc` is always whole).
void main(List<String> args) {
  final full = Platform.environment['FULL'] != null;
  final out = <String, Object?>{};
  for (final path in args.skip(1)) {
    final name = path.split(RegExp(r'[\\/]')).last.replaceAll('.novel.json', '');
    final s = NovelSnapshot.fromJson(jsonDecode(File(path).readAsStringSync()) as JsonMap);
    final parts = novel(s);
    out[name] = full ? parts : {for (final MapEntry(:key, :value) in parts.entries) key: hashOf(value)};
  }
  out['misc'] = misc();
  File(args.first).writeAsStringSync(jsonEncode(out));
}
