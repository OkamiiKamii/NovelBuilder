// The Flutter app's own outputs for the relationships domain (history, the network and its layout under many filters,
// and runs of relation changes), which relationships.golden.json pins (outputs.ts makes Scriptor's, keyed the same
// way). To make the golden again, as for test/model/golden (see dump.dart there for the package config):
//   1. dart run --packages=<that config> dump.dart <out.json>   (the Dart SDK of flutter-3.38.9)
//   2. node make-golden.js <out.json> relationships.golden.json

import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:novel_builder/shared/domain/codex/codex_changes.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:novel_builder/shared/domain/records/relation.dart';
import 'package:novel_builder/shared/domain/relationships/history.dart';
import 'package:novel_builder/shared/domain/relationships/network.dart';
import 'package:novel_builder/shared/domain/relationships/relation_changes.dart';
import 'package:novel_builder/shared/domain/relationships/relation_types.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';

final here = File.fromUri(Platform.script).parent.path;
final fixturesDir = '$here/../../../../flutter_app/test/fixtures';

Object? plain(Object? v) => switch (v) {
  double() when v.isNaN => 'NaN',
  double() when v.isInfinite => v > 0 ? 'Infinity' : '-Infinity',
  Map() => {for (final e in v.entries) '${e.key}': plain(e.value)},
  Iterable() => [for (final x in v) plain(x)],
  _ => v,
};

JsonMap netJson(Network net) => {
  'nodes': [
    for (final n in net.nodes) {'id': n.id, 'name': n.name, 'degree': n.degree, 'focus': n.focus},
  ],
  'edges': [
    for (final e in net.edges)
      {
        'id': e.id,
        'kind': e.kind.name,
        'from': e.from,
        'to': e.to,
        'directed': e.directed,
        'label': e.label,
        'fromRole': e.fromRole,
        'toRole': e.toRole,
        'category': e.category?.name,
        'affinity': e.affinity?.name,
        'stage': e.stage?.id,
        'range': e.range,
      },
  ],
  'total': net.total,
  'hidden': net.hidden,
  'layout': {
    for (final MapEntry(:key, :value) in layoutNetwork(net.nodes, net.edges).entries) key: [value.x, value.y],
  },
};

JsonMap report(NovelSnapshot s) {
  final model = StoryModel.fromSnapshot(s);
  final settings = RelationSettings(s.rows('relationSettings').firstOrNull);
  final chapters = [for (final c in model.order.chapters) c.id];
  final characters = [
    for (final e in model.entries.values)
      if (e.category == 'character') e.id,
  ]..sort();
  final factions = [
    for (final e in model.entries.values)
      if (e.category == 'faction') e.id,
  ]..sort();
  final presets = <String>{
    for (final r in model.relations.values)
      for (final st in r.stages) st.preset,
  }.toList()..sort();
  String name(String id) => model.entries[id]?.name ?? '?';
  final attributes = [const TrackedAttribute('trust', 'Trust'), ...settings.attributes];
  final timelines = {
    for (final r in model.relations.values)
      r.id: () {
        final t = timelineOf(r, model.order);
        return [
          for (final (i, e) in t.indexed)
            {
              'stage': e.stage.id,
              'range': e.range,
              'orphaned': e.orphaned,
              'changes': stageDifferences(
                i == 0 ? null : t[i - 1].stage,
                e.stage,
                fromName: name(r.fromId),
                toName: name(r.toId),
                attributes: attributes,
              ),
              'roles': [roleOf(e.stage, r, r.fromId), roleOf(e.stage, r, r.toId)],
            },
        ];
      }(),
  };
  final whens = <String, When>{
    'current': const Now(),
    'ever': const Ever(),
    'acrossAll': const Across(null, null),
    'acrossGone': const Across('gone', 'gone'),
    'atGone': const AsOf('gone'),
    for (final (i, c) in chapters.indexed) 'at$i': AsOf(c),
    for (var i = 0; i < chapters.length; i++)
      for (var j = i; j < chapters.length && j < i + 3; j++) 'across$i-$j': Across(chapters[i], chapters[j]),
    if (chapters.isNotEmpty) 'fromFirst': Across(chapters.first, null),
    if (chapters.isNotEmpty) 'toLast': Across(null, chapters.last),
  };
  final filters = <String, NetworkFilter>{
    'all': const NetworkFilter(),
    'ever': const NetworkFilter(when: Ever()),
    'isolated': const NetworkFilter(isolated: true),
    'noSocial': const NetworkFilter(hidden: {Layer.social, Layer.connection}),
    'noFamilyLabels': const NetworkFilter(hidden: {Layer.family, Layer.labels}),
    'keepNone': NetworkFilter(keep: (_) => false),
    'keepHalf': NetworkFilter(keep: (id) => id.compareTo('m') < 0),
    for (final p in presets) 'type:$p': NetworkFilter(type: p),
    for (final p in presets) 'typeEver:$p': NetworkFilter(type: p, when: const Ever()),
    for (final f in factions) 'faction:$f': NetworkFilter(factionId: f),
    for (final f in factions) 'factionIsolated:$f': NetworkFilter(factionId: f, isolated: true),
    'factionGone': const NetworkFilter(factionId: 'gone'),
    for (final c in characters.take(6)) 'focus1:$c': NetworkFilter(focus: (id: c, depth: 1)),
    for (final c in characters.take(6)) 'focus2:$c': NetworkFilter(focus: (id: c, depth: 2), isolated: true),
    'focusGone': const NetworkFilter(focus: (id: 'gone', depth: 1)),
    for (final (i, c) in chapters.indexed.take(8)) 'at$i': NetworkFilter(when: AsOf(c)),
    if (chapters.length > 1) 'across': NetworkFilter(when: Across(chapters[1], chapters.length > 3 ? chapters[3] : null)),
  };
  return {
    'timelines': timelines,
    'shown': {
      for (final MapEntry(key: k, value: w) in whens.entries)
        k: {
          for (final r in model.relations.values)
            r.id: [stageShown(r, model, w)?.id, for (final p in presets.take(4)) stageShown(r, model, w, p)?.id],
        },
    },
    'networks': {for (final MapEntry(key: k, value: f) in filters.entries) k: netJson(relationNetwork(model, f))},
  };
}

JsonMap changed(NovelSnapshot s) => {
  for (final c in ['characterRelations', 'relationSettings', 'loreLinks']) c: s.rows(c),
};

/// Runs a script of relation changes, as the original app makes them: each step on what the one before left.
JsonMap runScript(NovelSnapshot start, List<Object?> steps) {
  var s = start;
  var clock = 1000;
  var ids = 0;
  final refs = <String, String>{};
  Object? resolve(Object? v) => switch (v) {
    String() => v.replaceAllMapped(RegExp(r'\$(\w+)'), (m) => refs[m[1]] ?? m[0]!),
    Map() => {for (final e in v.entries) '${e.key}': resolve(e.value)},
    List() => [for (final x in v) resolve(x)],
    _ => v,
  };
  ({String? value})? wrapped(Object? v) => v is Map ? (value: v['value'] as String?) : null;
  StageInput input(JsonMap c) => StageInput(
    preset: c['preset'] as String?,
    label: c['label'] as String?,
    fromRole: c['fromRole'] as String?,
    toRole: c['toRole'] as String?,
    directional: c['directional'] as bool?,
    category: c['category'] == null ? null : RelationCategory.values.byName(c['category']! as String),
    title: c['title'] as String?,
    affinity: c['affinity'] == null ? null : Affinity.values.byName(c['affinity']! as String),
    event: c['event'] as String?,
    notes: c['notes'] as String?,
    attributes: c['attributes'] == null
        ? null
        : {
            for (final MapEntry(:key, :value) in (c['attributes']! as Map).entries)
              key as String: (
                from: (value as Map)['from'] as int?,
                to: value['to'] as int?,
                setFrom: value['setFrom'] == true,
                setTo: value['setTo'] == true,
              ),
          },
    start: wrapped(c['start']),
    startUnknown: c['startUnknown'] as bool?,
    storyEventId: wrapped(c['storyEventId']),
    storyDate: c['storyDate'] == null ? null : (value: mapOrNull((c['storyDate']! as Map)['value'])),
    causeEventId: wrapped(c['causeEventId']),
    causeNodeId: wrapped(c['causeNodeId']),
  );
  final out = <Object?>[];
  for (final raw in steps) {
    final step = resolve(raw)! as JsonMap;
    final c = RelationChanges(s, now: ++clock, createId: () => 'id${++ids}');
    String stageId(Object? relId, Object? at) {
      if (at is! int) return '$at';
      final row = c.row('characterRelations', '$relId');
      final stages = row == null ? const <JsonMap>[] : CharacterRelation(row).stages.map((x) => x.raw).toList();
      return at < stages.length ? str(stages[at]['id']) : 'missing';
    }

    Object? result;
    try {
      result = switch (step['op']) {
        'createRelation' => c
            .createRelation(step['from']! as String, step['to']! as String, step['preset'] as String? ?? 'friends')
            .raw,
        'recordChange' => c
            .recordChange(
              step['rel']! as String,
              nodeId: step['nodeId'] as String?,
              unknown: step['unknown'] == true,
              changes: input(mapOrNull(step['changes']) ?? const {}),
            )
            .raw,
        'addStage' => c.addStage(step['rel']! as String, step['nodeId'] as String?, unknown: step['unknown'] == true).raw,
        'updateStage' => () {
          c.updateStage(
            step['rel']! as String,
            stageId(step['rel'], step['stage']),
            input(mapOrNull(step['changes']) ?? const {}),
          );
          return null;
        }(),
        'moveStage' => () {
          c.moveStage(step['rel']! as String, stageId(step['rel'], step['stage']), step['by']! as int);
          return null;
        }(),
        'removeStage' => () {
          c.removeStage(step['rel']! as String, stageId(step['rel'], step['stage']));
          return null;
        }(),
        'reverse' => () {
          c.reverse(step['rel']! as String);
          return null;
        }(),
        'removeRelation' => () {
          c.removeRelation(step['rel']! as String);
          return null;
        }(),
        'saveType' => c
            .saveType(
              label: step['label'] as String?,
              category: step['category'] == null ? null : RelationCategory.values.byName(step['category']! as String),
              directional: step['directional'] as bool?,
              fromRole: step['fromRole'] as String?,
              toRole: step['toRole'] as String?,
              typeId: step['typeId'] as String?,
            )
            .raw,
        'removeType' => () {
          c.removeType(step['id']! as String);
          return null;
        }(),
        'offerBuiltIn' => () {
          c.offerBuiltIn(step['key']! as String, offered: step['offered'] == true);
          return null;
        }(),
        'trackAttribute' => c.trackAttribute(step['name']! as String).toJson(),
        'untrackAttribute' => () {
          c.untrackAttribute(step['key']! as String);
          return null;
        }(),
        'putLink' => () {
          c.put('loreLinks', {'projectId': c.projectId, ...(step['link']! as JsonMap)});
          return null;
        }(),
        'changeConnection' => c.changeConnection(
          step['id']! as String,
          step['at']! as JsonMap,
          fromId: step['fromId'] as String?,
          toId: step['toId'] as String?,
          type: step['type'] as String?,
          label: step['label'] as String?,
          how: step['how'] as String?,
        ),
        'startConnectionAt' => () {
          c.startConnectionAt(step['id']! as String, step['at']! as JsonMap);
          return null;
        }(),
        'endConnection' => () {
          c.endConnection(step['id']! as String, step['at']! as JsonMap, endHow: step['endHow'] as String? ?? '');
          return null;
        }(),
        _ => throw StateError('Unknown step ${step['op']}'),
      };
      s = c.snapshot;
      final name = step['as'];
      if (name is String) refs[name] = result is String ? result : str((result! as Map)['id']);
      out.add({'ok': result, 'after': changed(s)});
    } on ChangeRefused catch (e) {
      out.add({'refused': e.message});
    }
  }
  return {'steps': out, 'final': s.toJson(exportedAt: 0), 'refs': refs};
}

NovelSnapshot scriptNovel(JsonMap spec) {
  var created = 0;
  JsonMap row(Object? r) => {'projectId': 'novel', 'createdAt': ++created, ...(r! as Map).cast<String, Object?>()};
  return NovelSnapshot.fromJson({
    'format': 'novel-builder/project',
    'version': 4,
    'exportedAt': 0,
    'project': {'id': 'novel', 'title': 'Ties', 'createdAt': 0, 'updatedAt': 0},
    'collections': {
      'chapters': [for (final r in spec['chapters']! as List) row(r)],
      'timelineEvents': [for (final r in spec['events']! as List) row(r)],
      'loreEntries': [
        for (final r in spec['entries']! as List) {...row(r), 'fields': <Object?>[], 'tags': <Object?>[]},
      ],
      'loreLinks': [for (final r in spec['links']! as List) row(r)],
    },
  });
}

/// A run of changes on a real novel: on its first relationship (by id), and between its first two characters.
List<Object?> fixtureSteps(NovelSnapshot s) {
  final model = StoryModel.fromSnapshot(s);
  final relations = [...model.relations.keys]..sort();
  final characters = [
    for (final e in model.entries.values)
      if (e.category == 'character') e.id,
  ]..sort();
  final chapters = [for (final c in model.order.chapters) c.id];
  final r = relations.firstOrNull;
  return [
    {'op': 'trackAttribute', 'name': 'trust'},
    if (r != null) ...[
      {
        'op': 'recordChange',
        'rel': r,
        'nodeId': chapters.length > 1 ? chapters[1] : null,
        'changes': {
          'preset': 'rivals',
          'affinity': 'hostile',
          'attributes': {
            'trust': {'from': 4, 'to': null, 'setFrom': true, 'setTo': false},
          },
        },
      },
      {'op': 'addStage', 'rel': r, 'nodeId': null, 'unknown': true},
      {
        'op': 'updateStage',
        'rel': r,
        'stage': 0,
        'changes': {'title': ' Renamed ', 'startUnknown': false},
      },
      {'op': 'reverse', 'rel': r},
      {'op': 'saveType', 'label': 'Bond of salt', 'directional': true, 'fromRole': 'Host', 'toRole': 'Guest', 'as': 't'},
      {
        'op': 'updateStage',
        'rel': r,
        'stage': 0,
        'changes': {'preset': r'type:$t'},
      },
      {'op': 'saveType', 'typeId': r'$t', 'label': 'Bond of bread'},
      {'op': 'moveStage', 'rel': r, 'stage': 2, 'by': -1},
      {'op': 'removeType', 'id': r'$t'},
      {'op': 'removeStage', 'rel': r, 'stage': 1},
      {'op': 'removeRelation', 'rel': relations.last},
    ],
    if (characters.length >= 2) {'op': 'createRelation', 'from': characters[0], 'to': characters[1]},
    if (characters.length >= 2) {'op': 'createRelation', 'from': characters[1], 'to': characters.last, 'preset': 'exes'},
  ];
}

void main(List<String> args) {
  final out = <String, Object?>{};
  final novels = <String, String>{
    for (final f in Directory(fixturesDir).listSync().whereType<File>().where((f) => f.path.endsWith('.novel.json')))
      f.uri.pathSegments.last.replaceAll('.novel.json', ''): f.path,
    'edge': '$here/../../model/edge.novel.json',
    'sample': '$here/../../../assets/sample/the-drowned-road.novel.json',
  };
  for (final MapEntry(key: name, value: path) in novels.entries) {
    final s = NovelSnapshot.fromJson(jsonDecode(File(path).readAsStringSync()));
    out['$name.report'] = report(s);
    final steps = fixtureSteps(s);
    out['$name.steps'] = steps;
    final run = runScript(s, steps);
    out['$name.script'] = {'steps': run['steps'], 'refs': run['refs']};
    out['$name.after'] = report(NovelSnapshot.fromJson(run['final']));
  }
  final spec = jsonDecode(File('$here/script.json').readAsStringSync()) as JsonMap;
  final start = scriptNovel(spec['novel']! as JsonMap);
  final run = runScript(start, spec['steps']! as List);
  out['script.steps'] = run['steps'];
  out['script.final'] = changed(NovelSnapshot.fromJson(run['final']));
  out['script.report'] = report(NovelSnapshot.fromJson(run['final']));
  // Layouts of small graphs: none, one, a pair, a loop to itself, a tie to someone not there, a repeated tie, a star.
  final graphs = <String, (List<({String id, int degree})>, List<({String from, String to})>)>{
    'empty': (const [], const []),
    'one': (const [(id: 'a', degree: 0)], const []),
    'pair': (const [(id: 'a', degree: 1), (id: 'b', degree: 1)], const [(from: 'a', to: 'b')]),
    'self': (const [(id: 'a', degree: 2), (id: 'b', degree: 0)], const [(from: 'a', to: 'a')]),
    'stray': (const [(id: 'a', degree: 1), (id: 'b', degree: 0)], const [(from: 'a', to: 'zz')]),
    'twice': (const [(id: 'a', degree: 2), (id: 'b', degree: 2)], const [(from: 'a', to: 'b'), (from: 'b', to: 'a')]),
    'star': (
      [for (var i = 0; i < 9; i++) (id: 'n$i', degree: i == 0 ? 8 : 1)],
      [for (var i = 1; i < 9; i++) (from: 'n0', to: 'n$i')],
    ),
    'apart': ([for (var i = 0; i < 12; i++) (id: 'p$i', degree: 0)], const []),
  };
  out['graphs'] = {
    for (final MapEntry(key: k, value: (nodes, edges)) in graphs.entries)
      k: {for (final MapEntry(:key, :value) in layoutGraph(nodes, edges).entries) key: [value.x, value.y]},
  };
  // The start of every layout of up to 64 records: the cosine and sine of each place on the circle, as this platform's
  // C library gives them (make-golden.js keeps those that differ from JavaScript's).
  out['trig'] = [
    for (var n = 1; n <= 64; n++)
      for (var i = 0; i < n; i++)
        () {
          final a = 2 * math.pi * i / math.max(n, 1);
          return [a, math.cos(a), math.sin(a)];
        }(),
  ];
  File(args.first).writeAsStringSync(jsonEncode(plain(out)));
}
