// The Flutter app's own outputs for Visualize's world views and the knowledge graph (world.golden.json pins them;
// outputs.ts makes Scriptor's, keyed and shaped the same way). For every novel given: each journey read against the
// story, each traveller's route, the travel checks; the factions and their ties (at the end of the story, at the first
// chapter, at the first event), each faction at a point, the faction map (all, around each, at most two); the items
// and who held them; the knowledge graph (every node and edge, its counts and letter codes, queries, paths, folding,
// the limit, the pairs); and a script of place and journey changes (levels, nesting, maps, pins, images, methods,
// journeys, with their refusals), each step's outcome and the records it leaves.
//
// To make the golden again: dart run dump.dart world.golden.json <novels…> (with the package config the views'
// golden uses), as run.sh in the scratch dir does; FULL=1 writes it whole.

import 'dart:convert';
import 'dart:io';

import 'package:novel_builder/shared/domain/codex/codex_changes.dart' show ChangeRefused;
import 'package:novel_builder/shared/domain/factions/ownership.dart';
import 'package:novel_builder/shared/domain/factions/ties.dart';
import 'package:novel_builder/shared/domain/graph/knowledge.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:novel_builder/shared/domain/model/validity.dart';
import 'package:novel_builder/shared/domain/places/place_changes.dart';
import 'package:novel_builder/shared/domain/places/places.dart';
import 'package:novel_builder/shared/domain/records/event.dart';
import 'package:novel_builder/shared/domain/records/journey.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';
import 'package:novel_builder/shared/domain/travel/routes.dart';
import 'package:novel_builder/shared/domain/travel/travel.dart';

Object? point(TravelPoint? p) => p?.toJson();

JsonMap tieJson(Tie t) => {
  'link': t.link.id,
  'role': t.role.name,
  'other': '${t.other.type.name}:${t.other.id}',
  'otherName': t.otherName,
  'words': t.words,
  'when': t.when,
  'timeless': t.timeless,
  'holds': t.holds.name,
};

JsonMap graphJson(KnowledgeGraph g) => {
  'nodes': [
    for (final n in g.nodes)
      {
        'key': n.key,
        'type': n.type,
        'label': n.label,
        'aka': n.aka,
        'color': n.color,
        'degree': n.degree,
        'members': n.members,
      },
  ],
  'edges': [
    for (final e in g.edges)
      {
        'id': e.id,
        'from': e.from,
        'to': e.to,
        'kind': e.kind.key,
        'type': e.type,
        'label': e.label,
        'reverse': e.reverseLabel,
        'directed': e.directed,
      },
  ],
  'dangling': g.dangling,
  'excluded': [for (final x in g.excluded ?? const <Excluded>[]) {'category': x.category, 'count': x.count}],
  'undrawn': [for (final x in g.undrawn ?? const <Undrawn>[]) {'category': x.category, 'field': x.field, 'count': x.count}],
};

Map<String, Object?> reads(NovelSnapshot s) {
  final model = StoryModel.fromSnapshot(s);
  final settings = s.rows('travelSettings').map(TravelSettings.new).firstOrNull;
  final maps = [for (final r in s.rows('worldMaps')) WorldMap(r)];
  final pins = [for (final r in s.rows('mapPins')) MapPin(r)];
  final journeys = [for (final r in s.rows('journeys')) Journey(r)];
  final chapterAt = model.order.chapters.isEmpty ? null : Anchor.node(model.order.chapters.first.id);
  final eventIds = model.events.keys.toList()..sort();
  final eventAt = eventIds.isEmpty ? null : Anchor.event(eventIds.first);

  final out = <String, Object?>{};
  out['journeys'] = [
    for (final j in journeys)
      () {
        final r = journeyRecord(model, j, settings, maps, pins);
        return {
          'id': j.id,
          'travellers': r.travellers,
          'from': r.from,
          'to': r.to,
          'leaves': point(r.leaves),
          'arrives': point(r.arrives),
          'leavesWords': r.leavesWords,
          'arrivesWords': r.arrivesWords,
          'method': r.method?.toJson(),
          'methodWords': r.methodWords,
          'distance': r.distance == null
              ? null
              : {'value': r.distance!.value, 'unit': r.distance!.unit, 'from': r.distance!.from},
          'leastMinutes': r.leastMinutes,
          'words': r.words,
        };
      }(),
  ];
  final travellers = {for (final j in journeys) ...j.travellerIds}.toList()..sort();
  List<Object?> items(List<RouteItem> list) => [
    for (final i in list)
      {
        'key': i.key,
        'kind': i.kind,
        'title': i.title,
        'detail': i.detail,
        'when': i.when,
        'placeIds': i.placeIds,
        'order': i.order.isInfinite ? 'infinite' : i.order,
        'journeyId': i.journeyId,
      },
  ];
  out['routes'] = {
    for (final t in {...travellers, ...model.entries.values.where((e) => e.category == 'character').map((e) => e.id)})
      t: () {
        final r = routeOf(model, t, journeys, settings, maps, pins);
        return {'story': items(r.story), 'reading': items(r.reading), 'unknown': items(r.unknown)};
      }(),
  };
  out['problems'] = [for (final p in travelProblems(model, journeys, settings, maps, pins)) p.toJson()];
  out['without'] = [
    for (final j in journeys)
      for (final id in [...j.travellerIds, ?j.fromId, ...j.eventIds]) withoutJourneyReference(j, id),
  ];

  final factions = factionsOf(model);
  out['factions'] = [for (final f in factions) f.id];
  out['ties'] = {
    for (final f in factions)
      f.id: {
        'end': [for (final t in factionTies(model, f.id)) tieJson(t)],
        'chapter': [for (final t in factionTies(model, f.id, chapterAt)) tieJson(t)],
        'event': [for (final t in factionTies(model, f.id, eventAt)) tieJson(t)],
      },
  };
  out['at'] = {
    for (final f in factions)
      f.id: () {
        final a = factionAt(model, f.id, chapterAt);
        return {
          'byRole': {for (final e in a.byRole.entries) e.key.name: [for (final t in e.value) t.link.id]},
          'notNow': a.notNow,
        };
      }(),
  };
  JsonMap network(({List factions, List<Tie> edges, List territories, int left}) n) => {
    'factions': [for (final f in n.factions) f.id],
    'edges': [for (final t in n.edges) t.link.id],
    'territories': [for (final t in n.territories) t.id],
    'left': n.left,
  };
  out['network'] = {
    'all': network(factionNetwork(model, null)),
    'chapter': network(factionNetwork(model, chapterAt)),
    'two': network(factionNetwork(model, null, most: 2)),
    for (final f in factions) 'around:${f.id}': network(factionNetwork(model, null, around: f.id)),
  };

  JsonMap? owned(Ownership? o) => o == null
      ? null
      : {
          'item': o.item.id,
          'makers': [for (final m in o.makers) {'name': m.name, 'when': m.when}],
          'holdings': [
            for (final h in o.holdings)
              {
                'link': h.link.id,
                'holder': h.holderId,
                'name': h.holderName,
                'how': h.how,
                'began': h.began,
                'ended': h.ended,
                'endHow': h.endHow,
                'timeless': h.timeless,
                'here': h.inThisTimeline,
              },
          ],
          'unknown': o.unknown,
          'now': {'state': o.now.state, 'holders': o.now.holders, 'words': o.now.words},
        };
  final items2 = ownedItems(model);
  out['items'] = [for (final i in items2) i.id];
  out['ownership'] = {
    for (final i in items2)
      i.id: {
        'end': owned(ownershipOf(model, i.id)),
        'chapter': owned(ownershipOf(model, i.id, chapterAt)),
        'event': owned(ownershipOf(model, i.id, eventAt)),
      },
  };

  final graph = knowledgeGraph(model);
  out['graph'] = graphJson(graph);
  final counts = typeCounts(graph);
  out['counts'] = {
    'nodes': [for (final (t, c) in counts.nodes) [t, c]],
    'edges': [for (final (t, c) in counts.edges) [t, c]],
    'statuses': [for (final (t, c) in counts.statuses) [t, c]],
  };
  out['codes'] = typeCodes([for (final n in graph.nodes) n.type], (t) => nodeTypeLabel(t, model));
  out['typeLabels'] = {for (final (t, _) in counts.nodes) t: [nodeTypeLabel(t, model), nodeTypeColor(t, model)]};
  out['edgeLabels'] = {for (final (t, _) in counts.edges) t: edgeTypeLabel(t)};
  final first = graph.nodes.isEmpty ? null : graph.nodes.first.key;
  final busiest = graph.nodes.isEmpty
      ? null
      : (graph.nodes.toList()..sort((a, b) => b.degree != a.degree ? b.degree - a.degree : a.key.compareTo(b.key))).first.key;
  final word = graph.nodes.isEmpty ? '' : graph.nodes[graph.nodes.length ~/ 2].label.split(' ').first;
  out['queries'] = {
    'none': graphJson(queryGraph(graph, const GraphQuery())),
    'isolated': graphJson(queryGraph(graph, const GraphQuery(isolated: true))),
    'text': graphJson(queryGraph(graph, GraphQuery(text: ' $word '))),
    'hidden': graphJson(
      queryGraph(
        graph,
        GraphQuery(
          hiddenNodes: {for (final (t, _) in counts.nodes.take(1)) t},
          hiddenEdges: {for (final (t, _) in counts.edges.take(1)) t},
          hiddenStatuses: const {'confirmed'},
        ),
      ),
    ),
    'focus1': busiest == null ? null : graphJson(queryGraph(graph, GraphQuery(focus: (key: busiest, depth: 1)))),
    'focus2': busiest == null ? null : graphJson(queryGraph(graph, GraphQuery(focus: (key: busiest, depth: 2)))),
  };
  out['paths'] = {
    if (first != null)
      for (final n in graph.nodes.take(12)) n.key: pathBetween(graph.edges, first, n.key)?.map((e) => e.id).toList(),
    if (busiest != null)
      for (final n in graph.nodes.reversed.take(12)) 'b:${n.key}': pathBetween(graph.edges, busiest, n.key, 3)?.map((e) => e.id).toList(),
  };
  String? folder(String key) {
    final ref = refOf(key);
    if (ref == null || ref.type.name != 'node') return null;
    final node = model.nodes[ref.id];
    return node?.kindKey == 'scene' && node!.parentId != null && model.nodes[node.parentId]?.kindKey == 'chapter'
        ? 'node:${node.parentId}'
        : null;
  }

  final folded = collapseGraph(
    graph,
    types: {for (final (t, _) in counts.nodes.take(2)) t},
    fold: folder,
    groupLabel: (type, count) => '$count ${nodeTypeLabel(type, model).toLowerCase()}',
  );
  out['collapsed'] = {
    'graph': graphJson(folded.graph),
    'into': folded.into,
    'inside': folded.inside,
  };
  final limited = limitGraph(graph, 5, {?first});
  out['limited'] = {'graph': graphJson(limited.graph), 'total': limited.total, 'cut': limited.cut};
  out['pairs'] = [
    for (final p in pairsOf(graph.edges)) {'key': p.key, 'a': p.a, 'b': p.b, 'group': p.group.name, 'edges': [for (final e in p.edges) e.id]},
  ];
  out['words'] = [
    for (final e in graph.edges.take(40)) edgeWords(e, (k) => graph.nodes.where((n) => n.key == k).firstOrNull?.label ?? k),
  ];
  out['groups'] = {for (final e in graph.edges) e.id: groupOf(e.kind).name};
  out['shapes'] = {for (final (t, _) in counts.nodes) t: shapeOf(t).name};

  out['script'] = script(s, model);
  return out;
}

List<Object?> script(NovelSnapshot s, StoryModel model) {
  var n = 0;
  final c = PlaceChanges(s, now: 1000, createId: () => 'made-${++n}');
  final locs = [for (final e in model.entries.values) if (e.category == 'location') e.id]..sort();
  final chars = [for (final e in model.entries.values) if (e.category == 'character') e.id]..sort();
  final chapters = [for (final ch in model.order.chapters) ch.id];
  final events = model.events.keys.toList()..sort();
  String loc(int i) => locs.length > i ? locs[i] : 'no-place-$i';
  String who(int i) => chars.length > i ? chars[i] : 'no-one-$i';
  final out = <Object?>[];
  final made = <String, String>{};
  void step(String op, Object? Function() run) {
    String outcome;
    try {
      final r = run();
      outcome = 'ok${r is String ? ':$r' : ''}';
    } on ChangeRefused catch (e) {
      outcome = 'refused:${e.message}';
    }
    out.add({
      'op': op,
      'outcome': outcome,
      'records': {
        for (final k in ['placeSettings', 'worldMaps', 'mapPins', 'travelSettings', 'journeys', 'loreEntries', 'loreLinks'])
          k: c.snapshot.rows(k),
      },
    });
  }

  step('levels', () => c.setLevels([(id: null, name: 'World'), (id: null, name: ' city '), (id: null, name: 'CITY'), (id: null, name: '')]).id);
  step('preset', () => c.applyPreset('world').levels.length.toString());
  step('preset-bad', () => c.applyPreset('nope'));
  step('level', () => c.setLevel(loc(0), c.settings()!.levels.first.id));
  step('level-bad', () => c.setLevel(loc(0), 'nope'));
  step('level-person', () => c.setLevel(who(0), null));
  step('levels-drop', () => c.setLevels([(id: null, name: 'Only')]));
  step('parent', () => c.setParent(loc(1), loc(0)));
  step('parent-loop', () => c.setParent(loc(0), loc(1)));
  step('parent-self', () => c.setParent(loc(0), loc(0)));
  step('parent-none', () => c.setParent(loc(1), null));
  step('map', () => made['map'] = c.saveMap(null, name: 'Atlas', width: 200, height: 100, unit: 'leagues', grid: 0).id);
  step('map-unnamed', () => c.saveMap(null, name: '  '));
  step('map-change', () => c.saveMap(made['map'], placeId: (value: loc(0)), grid: -3, width: -5).id);
  step('pin', () => c.pin(made['map'] ?? 'x', loc(0), 10, 20).id);
  step('pin2', () => c.pin(made['map'] ?? 'x', loc(1), 40, 60).id);
  step('pin-move', () => c.pin(made['map'] ?? 'x', loc(0), 15.5, 25).id);
  step('pin-nan', () => c.pin(made['map'] ?? 'x', loc(0), double.nan, 1));
  step('unpin', () => c.unpin(made['map'] ?? 'x', loc(1)));
  step('image', () => c.setImage(made['map'] ?? 'x', 'data:image/png;base64,AAAA'));
  step('image-bad', () => c.setImage(made['map'] ?? 'x', 'http://example.com/x.png'));
  step('image-none', () => c.setImage(made['map'] ?? 'x', null));
  step(
    'methods',
    () => c
        .setMethods(const [
          TravelMethod(id: '', name: 'On foot', speed: 30, distanceUnit: 'leagues'),
          TravelMethod(id: '', name: 'on foot'),
          TravelMethod(id: '', name: 'Ship', speed: -2, per: TimeUnit.hours),
        ])
        .methods
        .length
        .toString(),
  );
  final method = c.travelSettings()?.methods.firstOrNull?.id;
  step(
    'journey',
    () => made['j1'] = c.saveJourney(null, {
      'travellerIds': [who(0), who(0)],
      'fromId': loc(0),
      'toId': loc(1),
      'via': [loc(2), ''],
      'departure': chapters.isEmpty ? null : {'kind': 'node', 'nodeId': chapters.first},
      'arrival': events.isEmpty ? {'kind': 'date', 'when': {'precision': 'unknown'}} : {'kind': 'event', 'eventId': events.first},
      'method': ' by cart ',
      'methodId': method,
      'duration': {'amount': 3, 'unit': 'days'},
      'distance': 90,
      'distanceUnit': 'leagues',
      'eventIds': events.take(1).toList(),
      'note': ' a note ',
    }).id,
  );
  step('journey-nobody', () => c.saveJourney(null, {'travellerIds': <String>[]}));
  step('journey-place', () => c.saveJourney(null, {'travellerIds': [loc(0)]}));
  step('journey-duration', () => c.saveJourney(null, {'travellerIds': [who(0)], 'duration': {'amount': -1, 'unit': 'days'}}));
  step('journey-distance', () => c.saveJourney(null, {'travellerIds': [who(0)], 'distance': 'far'}));
  step('journey-method', () => c.saveJourney(null, {'travellerIds': [who(0)], 'methodId': 'nope'}));
  step('journey-when', () => c.saveJourney(null, {'travellerIds': [who(0)], 'departure': {'kind': 'node', 'nodeId': 'nope'}}));
  step('journey2', () => made['j2'] = c.saveJourney(null, {'travellerIds': [who(1)], 'afterId': made['j1']}).id);
  step('journey-cycle', () => c.saveJourney(made['j1'], {'afterId': made['j2']}));
  step('journey-change', () => c.saveJourney(made['j1'], {'toId': null, 'note': 'changed'}).id);
  step('methods-drop', () => c.setMethods(const []));
  step('remove-journey', () => c.removeJourney(made['j1'] ?? 'x'));
  step('remove-journey-gone', () => c.removeJourney('nope'));
  step('remove-map', () => c.removeMap(made['map'] ?? 'x'));
  return out;
}

// ---------------------------------------------------------------------------------------------------- hashing

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

/// Numbers that are not whole to nine significant places, so the platform's last bits do not count; NaN as a word.
Object? rounded(Object? v) => switch (v) {
  double d when d.isNaN => 'NaN',
  double d when d.isFinite && d != d.truncateToDouble() => double.parse(d.toStringAsPrecision(9)),
  List l => [for (final x in l) rounded(x)],
  Map m => {for (final MapEntry(:key, :value) in m.entries) key: rounded(value)},
  _ => v,
};

void main(List<String> args) {
  final full = Platform.environment.containsKey('FULL');
  final out = <String, Object?>{};
  for (final path in args.skip(1)) {
    final name = path.split(RegExp(r'[\\/]')).last.replaceAll('.novel.json', '');
    final s = NovelSnapshot.fromJson(jsonDecode(File(path).readAsStringSync()) as JsonMap);
    final r = rounded(reads(s)) as Map;
    out[name] = full ? r : {for (final MapEntry(:key, :value) in r.entries) key as String: hashOf(value)};
  }
  File(args.first).writeAsStringSync(const JsonEncoder.withIndent(' ').convert(out));
}
