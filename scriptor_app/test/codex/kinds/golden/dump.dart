// The Flutter app's own outputs for Categories & fields, the views' settings, templates and every connection
// (kinds.golden.json pins them; outputs.ts makes Scriptor's, keyed and shaped the same way). For every novel given: the
// categories in order, each one's editor and field rows and views' settings, the novel as template data, each preset
// applied to it, field-set edits, every record's connections and the dialog's choices, and making and changing a
// connection. And `misc`: the presets, templates kept and listed, the words of each kind of connection, numbers typed
// back.
//
// What is the widgets' (kinds_page.dart, kind_uses_editor.dart, connections_panel.dart, template_store.dart and the
// documentLabel of characters/widgets/parts.dart) is copied here word for word but for Flutter's types, since those
// files need Flutter: dart.exe runs the domain itself (codex_changes, presets, capabilities, connections, rules).
//
// To make the golden again (from the scratch dir holding the package config that names novel_builder):
//   dart run dump.dart kinds.golden.json <the Flutter fixtures>/*.novel.json ../../../model/edge.novel.json \
//        ../../../../assets/sample/the-drowned-road.novel.json

import 'dart:convert';
import 'dart:io';

import 'package:novel_builder/shared/domain/codex/capabilities.dart';
import 'package:novel_builder/shared/domain/codex/codex_changes.dart';
import 'package:novel_builder/shared/domain/codex/type_presets.dart';
import 'package:novel_builder/shared/domain/codex/world_presets.dart';
import 'package:novel_builder/shared/domain/collation.dart';
import 'package:novel_builder/shared/domain/integrity/rules.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/model/connections.dart';
import 'package:novel_builder/shared/domain/model/entity_ref.dart';
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:novel_builder/shared/domain/records/canon.dart';
import 'package:novel_builder/shared/domain/records/category.dart';
import 'package:novel_builder/shared/domain/records/entry.dart';
import 'package:novel_builder/shared/domain/records/link.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';
import 'package:novel_builder/shared/domain/stable_sort.dart';

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

// ------------------------------------------------------------------------------------------- kinds_page.dart

String _plain(num n) => n == n.roundToDouble() ? n.toInt().toString() : n.toString();

List<Category> kindsInOrder(StoryModel model) => [...model.categories.values]
  ..sort((a, b) => a.order != b.order ? a.order.compareTo(b.order) : localeCompare(a.name, b.name));

JsonMap fieldRow(FieldDef def, bool first, bool last, List<Category> kinds) {
  final type = def.type ?? FieldType.text;
  final isLink = type == FieldType.reference || type == FieldType.references;
  return {
    'id': def.id,
    'name': def.name,
    'type': type.name,
    'up': {'tooltip': 'Move ${def.name} up', 'enabled': !first},
    'down': {'tooltip': 'Move ${def.name} down', 'enabled': !last},
    'archiveTooltip': 'Remove ${def.name} (archived: values already written are kept)',
    'choices': type == FieldType.select || type == FieldType.multiselect ? def.options.join(', ') : null,
    'required': def.required,
    'numbers': type == FieldType.number
        ? {'min': def.min == null ? '' : _plain(def.min!), 'max': def.max == null ? '' : _plain(def.max!)}
        : null,
    'linksTo': isLink
        ? {
            'value': kinds.any((k) => k.key == def.target) ? def.target : '',
            'choices': [
              {'value': '', 'label': 'Any kind of entry'},
              for (final k in kinds) {'value': k.key, 'label': k.name},
            ],
          }
        : null,
    'help': def.help ?? '',
  };
}

JsonMap kindEditor(Category kind, List<Entry> entries, int count) {
  final isCharacter = kind.key == 'character';
  int usedBy(FieldDef def) => entries
      .where((e) => e.category == kind.key && e.fields.any((f) => f.defId == def.id && f.value.trim().isNotEmpty))
      .length;
  return {
    'title': kind.name,
    'caption': isCharacter
        ? 'The fields every character shares: offered on every profile, under Details. Fields for one character '
              'alone are added on their profile.'
        : null,
    'colours': [
      for (final color in {kind.color, ...customColors})
        {'color': color, 'chosen': kind.color == color, 'label': 'Colour $color${kind.color == color ? ', chosen' : ''}'},
    ],
    'graph': isCharacter ? null : {'on': kind.raw['graph'] != false},
    'saveTemplate': isCharacter ? null : 'Save ${kind.name} as a template',
    'fieldsTitle': 'Fields every ${kind.singular.toLowerCase()} has',
    'active': [for (final f in kind.fields.where((f) => !f.archived)) f.id],
    'archived': [
      for (final def in kind.fields.where((f) => f.archived))
        {
          'id': def.id,
          'subtitle':
              '${def.type?.label ?? 'Short text'} · '
              '${usedBy(def) > 0 ? 'still filled in on ${plural(usedBy(def), 'entry', 'entries')}' : 'no values'}',
        },
    ],
    'archive': kind.builtin
        ? null
        : {
            'said': kind.archived
                ? 'Archived: no new entries can be added; existing ones are kept.'
                : 'Archiving hides this category from “New entry”. Its ${plural(count, 'entry is', 'entries are')} kept.',
            'button': kind.archived ? 'Restore category' : 'Archive category',
          },
  };
}

List<JsonMap> editField(List<JsonMap> stored, String id, JsonMap patch) => [
  for (final f in stored) f['id'] == id ? ({...f, ...patch}..removeWhere((k, v) => v == null)) : f,
];

List<JsonMap> moveField(List<JsonMap> stored, String id, int by) {
  final live = [
    for (final f in stored)
      if (f['archived'] != true) f,
  ];
  final from = live.indexWhere((f) => f['id'] == id);
  final to = from + by;
  if (from < 0 || to < 0 || to >= live.length) return stored;
  final moving = live[from];
  live[from] = live[to];
  live[to] = moving;
  return [
    ...live,
    for (final f in stored)
      if (f['archived'] == true) f,
  ];
}

List<JsonMap> addField(List<JsonMap> stored, String id) => [
  for (final f in stored)
    if (f['archived'] != true) f,
  {'id': id, 'name': 'New field', 'type': 'text', 'options': <String>[]},
  for (final f in stored)
    if (f['archived'] == true) f,
];

// ------------------------------------------------------------------------------------ kind_uses_editor.dart

JsonMap slotMenu(Category category, Slot slot, String label, Object? value, String none) {
  final fitting = fieldsFor(category, slot);
  final current = value is String && value.isNotEmpty ? value : '';
  final stale = current.isNotEmpty && !fitting.any((f) => f.id == current)
      ? category.fields.where((f) => f.id == current).firstOrNull
      : null;
  return {
    'slot': slot.key,
    'label': label,
    'value': current,
    'choices': [
      {'value': '', 'label': none},
      for (final f in fitting) {'value': f.id, 'label': '${f.name} (${(f.type ?? FieldType.text).label})'},
      if (current.isNotEmpty && !fitting.any((f) => f.id == current))
        {'value': current, 'label': stale != null ? '${stale.name} (does not suit now)' : 'A field that is gone'},
    ],
  };
}

JsonMap viewState(Category category, KindView view, bool isSet, Slot slot) {
  final missing = missingFor(category, view);
  if (!isSet) {
    return {
      'kind': 'note',
      'text': fieldsFor(category, slot).isNotEmpty ? 'Not set up.' : 'Add ${typeWords(slot)} to set this up.',
    };
  }
  if (missing.isNotEmpty) return {'kind': 'issues', 'items': missing};
  return {'kind': 'note', 'text': 'Set up: shown under Visualize → Records by kind.'};
}

JsonMap kindUses(Category category, List<Link> links) {
  final uses = category.uses;
  final timeline = mapOrNull(uses['timeline']) ?? const {};
  final map = mapOrNull(uses['map']) ?? const {};
  final ownership = mapOrNull(uses['ownership']) ?? const {};
  final builtinKeys = {for (final t in connectionTypes) t.key};
  final ownTypes = {
    for (final t in [for (final l in links) l.type ?? '', strOrNull(ownership['type']) ?? ''])
      if (t.isNotEmpty && !builtinKeys.contains(t)) t,
  };
  final holding = strOrNull(ownership['type']);
  final chosenLinks = uses['graphLinks'] is List ? strings(uses['graphLinks']) : null;
  return {
    'caption':
        'Choose the field each view reads. Nothing is worked out from field names. A view ${category.name} is not set '
        'up for shows its records as a table instead.',
    'timeline': {
      'start': slotMenu(category, Slot.timelineStart, 'Date on the timeline', timeline['start'], 'Not on a timeline'),
      'end': slotMenu(category, Slot.timelineEnd, 'End on the timeline (optional)', timeline['end'], 'No end'),
      'state': viewState(category, KindView.timeline, uses['timeline'] != null, Slot.timelineStart),
    },
    'map': {
      'x': slotMenu(category, Slot.mapX, 'Across on the map', map['x'], 'Not set'),
      'y': slotMenu(category, Slot.mapY, 'Up on the map', map['y'], 'Not set'),
      'state': viewState(category, KindView.map, uses['map'] != null, Slot.mapX),
    },
    'rank': {
      'menu': slotMenu(category, Slot.rank, 'Rank', uses['rank'], 'Not ranked'),
      'state': viewState(category, KindView.rank, uses['rank'] != null, Slot.rank),
    },
    'ownership': {
      'holding': {
        'value': holding ?? '',
        'choices': [
          {'value': '', 'label': 'Not set'},
          for (final t in connectionTypes) {'value': t.key, 'label': t.label},
          for (final t in ownTypes) {'value': t, 'label': '${connectionType(t).label} (your own)'},
        ],
      },
      'field': slotMenu(category, Slot.ownershipField, 'Current holder field (optional)', ownership['field'], 'None'),
      'state': viewState(category, KindView.ownership, uses['ownership'] != null, Slot.ownershipField),
    },
    'tree': uses['tree'] == true,
    'graph': {
      'label': slotMenu(category, Slot.graphLabel, 'Label in the knowledge graph', uses['graphLabel'], 'Its name'),
      'links': [
        for (final def in fieldsFor(category, Slot.graphLinks))
          {
            'id': def.id,
            'name': def.name,
            'on': chosenLinks == null || chosenLinks.contains(def.id),
            'label': 'Draw ${def.name} in the knowledge graph',
          },
      ],
      'issues': [...missingFor(category, 'graphLabel'), ...missingFor(category, 'graphLinks')],
    },
  };
}

JsonMap graphLinkTicked(Category category, JsonMap stored, String defId, bool on) {
  final live = [for (final d in fieldsFor(category, Slot.graphLinks)) d.id];
  final now = [
    for (final id in stored['graphLinks'] is List ? strings(stored['graphLinks']) : live)
      if (id != defId) id,
  ];
  final next = on ? [...now, defId] : now;
  return {...stored, 'graphLinks': live.every(next.contains) ? null : next};
}

// ----------------------------------------------------------------------------------- connections_panel.dart

String documentLabel(StoryModel model, StoryNode node) {
  final number = model.order.chapterNumber[node.id];
  return node.kind == NodeKind.scene
      ? '    ${node.displayTitle}'
      : number == null
      ? node.displayTitle
      : 'Ch $number: ${node.displayTitle}';
}

List<StoryNode> documents(StoryModel model) => stableSorted(
  model.nodes.values.where((n) => n.kind == NodeKind.chapter || n.kind == NodeKind.scene),
  (a, b) => (model.order.position[a.id] ?? 0) - (model.order.position[b.id] ?? 0),
);

String _lower(String s) => s.isEmpty ? s : '${s[0].toLowerCase()}${s.substring(1)}';

bool _opens(EntityRef ref) =>
    ref.type == EntityType.entry ||
    ref.type == EntityType.node ||
    ref.type == EntityType.event ||
    ref.type == EntityType.relation;

JsonMap panel(StoryModel model, List<Connection> connections, EntityRef self) {
  String name(EntityRef ref) => model.resolve(ref)?.label ?? 'Something deleted';
  final seen = stableSorted(connectionsOf(connections, self), (a, b) => localeCompare(name(a.other), name(b.other)));
  return {
    'title': 'Every connection (${seen.length})',
    'empty': seen.isEmpty ? 'Nothing points here yet, and this points at nothing.' : null,
    'lines': [
      for (final s in seen)
        () {
          final label = (s.outgoing ? s.label : s.connection.label).isNotEmpty
              ? (s.outgoing ? s.label : s.connection.label)
              : 'related to';
          final status = statusOf(s.connection);
          final canon = CanonStatus.of(s.connection.canon) ?? CanonStatus.canon;
          final stored = s.connection.kind == ConnectionKind.link;
          return {
            'connection': s.connection.id,
            'outgoing': s.outgoing,
            'words': s.outgoing ? label : '${_lower(label)} this',
            'other': {'ref': s.other.key, 'name': name(s.other), 'opens': _opens(s.other)},
            'status': status == null ? null : {'status': status.name, 'label': connectionStatusLabel(canon)},
            'keptIn': '· kept in ${sourceWords[s.connection.source.collection] ?? s.connection.source.collection}',
            'link': stored ? model.links.where((l) => l.id == s.connection.source.id).firstOrNull?.id : null,
          };
        }(),
    ],
  };
}

List<JsonMap> connectableRecords(StoryModel model, List<Entry> entries, EntityType type, EntityRef except) {
  final out = switch (type) {
    EntityType.entry => [for (final e in entries) (EntityRef(EntityType.entry, e.id), e.name)],
    EntityType.node => [
      for (final n in documents(model)) (EntityRef(EntityType.node, n.id), documentLabel(model, n).trim()),
    ],
    EntityType.event => [for (final e in model.events.values) (EntityRef(EntityType.event, e.id), e.name)],
    EntityType.thread => [for (final t in model.threads.values) (EntityRef(EntityType.thread, t.id), t.title)],
    _ => <(EntityRef, String)>[],
  };
  final kept = [
    for (final r in out)
      if (r.$1 != except) r,
  ];
  final sorted = type == EntityType.node ? kept : stableSorted(kept, (a, b) => localeCompare(a.$2, b.$2));
  return [
    for (final (ref, label) in sorted) {'ref': ref.key, 'label': label},
  ];
}

String reads(String type) {
  final kind = connectionType(type.isEmpty ? null : type);
  return kind.reciprocal
      ? 'Reads the same from both ends.'
      : kind.inverse != null
      ? 'From the other end it reads “${kind.inverse}”.'
      : 'One-sided: it says nothing about what the other side thinks. Add their own connection if they have one.';
}

JsonMap form(Link? editing) {
  final known = connectionTypes.any((t) => t.key == editing?.type);
  return {
    'kind': known ? editing!.type! : (editing == null ? 'related' : '\u0000own'),
    'own': editing != null && !connectionTypes.any((t) => t.key == editing.type) ? (editing.type ?? '') : '',
    'label': editing?.fromLabel ?? '',
    'reverse': editing?.toLabel ?? '',
    'notes': editing?.notes ?? '',
    'canon': (editing?.canon ?? CanonStatus.canon).key,
  };
}

// ---------------------------------------------------------------------------------------- template_store.dart

class Templates {
  Templates(this.settings);
  final Map<String, Object?> settings;
  int _ids = 0;
  int _clock = 5000;

  List<JsonMap> list() => stableSorted([
    for (final t in maps(settings['codex.templates']))
      if (str(t['name']).isNotEmpty) t,
  ], (a, b) => localeCompare(str(a['name']), str(b['name'])));

  JsonMap save(String name, String description, List<JsonMap> categories) {
    if (name.trim().isEmpty) throw ArgumentError('Give the template a name.');
    final template = {
      'id': 't${++_ids}',
      'name': name.trim(),
      'description': description.trim(),
      'categories': categories,
      'createdAt': ++_clock,
    };
    settings['codex.templates'] = [...maps(settings['codex.templates']), template];
    return template;
  }

  void remove(String id) => settings['codex.templates'] = [
    for (final t in maps(settings['codex.templates']))
      if (t['id'] != id) t,
  ];
}

// ------------------------------------------------------------------------------------------------- the dump

class Novel {
  Novel(this.snapshot);
  NovelSnapshot snapshot;
  int clock = 1000;
  int ids = 0;

  T act<T>(T Function(CodexChanges c) change) {
    final c = CodexChanges(snapshot, now: ++clock, createId: () => 'id${++ids}');
    final result = change(c);
    snapshot = c.snapshot;
    return result;
  }
}

Object? attempt(Object? Function() run) {
  try {
    return run();
  } on ChangeRefused catch (e) {
    return {'refused': e.message};
  }
}

JsonMap novel(NovelSnapshot s) {
  final model = StoryModel.fromSnapshot(s);
  final entries = [...model.entries.values]..sort((a, b) => a.id.compareTo(b.id));
  final kinds = kindsInOrder(model);
  int count(Category k) => entries.where((e) => e.category == k.key).length;
  final derived = deriveConnections(model).connections;
  final read = CodexChanges(s, now: 0, createId: () => throw StateError('reading'));

  // Field-set edits on each category with fields: move the first live field down, add one, rename and require it,
  // archive it, restore it.
  final edits = <String, Object?>{};
  for (final k in kinds) {
    final live = k.fields.where((f) => !f.archived).toList();
    if (live.isEmpty) continue;
    final n = Novel(s);
    final id = live.first.id;
    edits[k.key] = [
      attempt(() => n.act((c) => c.saveCategory(k.key, (cur) => {'fields': moveField([for (final f in cur!.fields) f.raw], id, 1)})).raw),
      attempt(() => n.act((c) => c.saveCategory(k.key, (cur) => {'fields': addField([for (final f in cur!.fields) f.raw], 'new-field')})).raw),
      attempt(
        () => n.act(
          (c) => c.saveCategory(k.key, (cur) => {
            'fields': editField([for (final f in cur!.fields) f.raw], 'new-field', {'name': 'Renamed', 'required': true, 'help': null}),
          }),
        ).raw,
      ),
      attempt(
        () => n.act(
          (c) => c.saveCategory(k.key, (cur) => {
            'fields': editField([for (final f in cur!.fields) f.raw], id, {'archived': true}),
          }),
        ).raw,
      ),
      attempt(
        () => n.act(
          (c) => c.saveCategory(k.key, (cur) => {
            'fields': editField([for (final f in cur!.fields) f.raw], id, {'archived': null}),
          }),
        ).raw,
      ),
      [for (final by in [-1, 1, 5]) moveField([for (final f in k.fields) f.raw], id, by).map((f) => f['id']).toList()],
    ];
  }

  // Each preset applied to the novel.
  final presets = <String, Object?>{};
  for (final p in [...typePresets, ...worldPresets]) {
    final n = Novel(s);
    presets[p.id] = attempt(() {
      final after = n.act((c) => c.addKinds(p.categories));
      final made = after.where((c) => c.name.trim().toLowerCase() == p.name.toLowerCase()).firstOrNull;
      return {
        'after': [for (final c in after) c.raw],
        'show': made?.key,
      };
    });
  }

  // Every record's connections.
  final refs = [
    for (final e in entries) EntityRef(EntityType.entry, e.id),
    for (final n in documents(model)) EntityRef(EntityType.node, n.id),
    for (final e in model.events.values) EntityRef(EntityType.event, e.id),
    for (final t in model.threads.values) EntityRef(EntityType.thread, t.id),
  ];
  final first = refs.isEmpty ? EntityRef(EntityType.entry, 'none') : refs.first;

  // Making and changing a connection between the first two entries.
  Object? connect;
  if (entries.length >= 2) {
    final n = Novel(s);
    final a = EntityRef(EntityType.entry, entries[0].id);
    final b = EntityRef(EntityType.entry, entries[1].id);
    connect = [
      attempt(
        () => n
            .act(
              (c) => c.createConnection(
                from: a,
                to: b,
                type: 'owns',
                label: ' holds ',
                reverseLabel: '',
                notes: 'a note',
                canon: CanonStatus.provisional,
              ),
            )
            .raw,
      ),
      attempt(
        () => n
            .act(
              (c) => c.updateConnection(
                'id1',
                type: 'sworn enemy of',
                label: 'hates',
                reverseLabel: 'fears',
                notes: '',
                canon: (value: null),
              ),
            )
            .raw,
      ),
      attempt(() => n.act((c) => c.createConnection(from: a, to: b, type: 'sworn enemy of', label: 'hates')).raw),
      attempt(() => n.act((c) => c.createConnection(from: a, to: a, type: 'related')).raw),
    ];
  }

  return {
    'kinds': [
      for (final k in kinds) {'key': k.key, 'choice': '${k.name} · ${k.archived ? 'archived' : plural(count(k), 'entry', 'entries')}'},
    ],
    'chosen': kinds.firstWhere((k) => k.key != 'character').key,
    'editors': {
      for (final k in kinds)
        k.key: {
          'editor': kindEditor(k, entries, count(k)),
          'rows': [
            for (final (i, def) in k.fields.where((f) => !f.archived).indexed)
              fieldRow(def, i == 0, i == k.fields.where((f) => !f.archived).length - 1, model.categories.values.toList()),
          ],
          'uses': kindUses(k, model.links),
          'graphLinks': [
            for (final def in fieldsFor(k, Slot.graphLinks))
              for (final on in [true, false]) graphLinkTicked(k, {...k.uses}, def.id, on),
          ],
          'template': CodexChanges.kindTemplate(k),
        },
    },
    'schema': read.schemaSnapshot(),
    'edits': edits,
    'presets': presets,
    'panels': {for (final r in refs) r.key: panel(model, derived, r)},
    'connectable': {
      for (final t in [EntityType.entry, EntityType.node, EntityType.event, EntityType.thread, EntityType.relation])
        t.name: connectableRecords(model, entries, t, first),
    },
    'forms': [for (final l in model.links) form(l)],
    'connect': connect,
  };
}

JsonMap misc() {
  final t = Templates({});
  final out = <String, Object?>{};
  out['saved'] = [
    t.save('  Zeta world ', ' all of it ', [
      {'key': 'x', 'name': 'X'},
    ]),
    t.save('alpha', '', []),
    t.save('Émile', 'one', []),
  ];
  out['refused'] = () {
    try {
      t.save('   ', '', []);
      return null;
    } on ArgumentError catch (e) {
      return e.message;
    }
  }();
  out['list'] = t.list();
  t.remove('t2');
  out['afterRemove'] = t.list();
  return {
    ...out,
    'typePresets': [
      for (final p in typePresets) {'id': p.id, 'name': p.name, 'description': p.description, 'categories': p.categories},
    ],
    'worldPresets': [
      for (final p in worldPresets) {'id': p.id, 'name': p.name, 'description': p.description, 'categories': p.categories},
    ],
    'reads': {for (final k in [...connectionTypes.map((t) => t.key), 'sworn enemy of', '']) k: reads(k)},
    'statuses': [
      for (final c in CanonStatus.values) {'key': c.key, 'label': connectionStatusLabel(c), 'status': statusOfCanon(c).name},
    ],
    'plain': [for (final n in [0, 3, -4, 2.5, 10.0, 1e21, -0.125]) _plain(n)],
    'newForm': form(null),
  };
}

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
