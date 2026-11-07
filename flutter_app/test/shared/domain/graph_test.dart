// The knowledge graph, ported: agreement with the original app on every record and connection, the layers, words and
// focus, folding, the drawing limit, paths, counts, labels and letter codes (tool/golden/graph.test.ts).
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/collation.dart';
import 'package:novel_builder/shared/domain/graph/knowledge.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/model/entity_ref.dart';
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:novel_builder/shared/domain/relationships/network.dart' show layoutGraph;
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';
import 'package:novel_builder/shared/domain/stable_sort.dart';

import 'fixtures.dart';
import 'golden.dart';

JsonMap _shape(KnowledgeGraph g) => {
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
        'reverseLabel': e.reverseLabel,
        'directed': e.directed,
      },
  ],
  'dangling': g.dangling,
  'excluded': g.excluded == null
      ? null
      : [
          for (final x in g.excluded!) {'category': x.category, 'count': x.count},
        ],
  'undrawn': g.undrawn == null
      ? null
      : [
          for (final x in g.undrawn!) {'category': x.category, 'field': x.field, 'count': x.count},
        ],
};

List<List<Object>> _counts(List<TypeCount> c) => [
  for (final (t, n) in c) [t, n],
];

JsonMap _report(NovelSnapshot s) {
  final model = StoryModel.fromSnapshot(s);
  final full = knowledgeGraph(model);
  final types = {for (final n in full.nodes) n.type}.toList();
  final edgeTypes = {for (final e in full.edges) e.type}.toList();
  final ranked = stableSorted(full.nodes, (a, b) {
    final d = b.degree.compareTo(a.degree);
    return d != 0 ? d : localeCompare(a.key, b.key);
  });
  final hub = ranked.firstOrNull?.key ?? 'entry:none';
  final second = ranked.length > 1 ? ranked[1].key : hub;
  final named = full.nodes.where((n) => n.label.length > 3).firstOrNull;
  final word = named == null ? 'a' : named.label.substring(1, 4);
  final queries = <String, GraphQuery>{
    'all': const GraphQuery(),
    'isolated': const GraphQuery(isolated: true),
    'hideFirstType': GraphQuery(hiddenNodes: {types[0]}),
    'hideFirstEdge': GraphQuery(hiddenEdges: {edgeTypes[0]}),
    'hideStatuses': const GraphQuery(hiddenStatuses: {'provisional', 'disputed'}),
    'text': GraphQuery(text: ' ${word.toUpperCase()} '),
    'focus1': GraphQuery(focus: (key: hub, depth: 1)),
    'focus2': GraphQuery(focus: (key: second, depth: 2)),
    'focusHidden': GraphQuery(focus: (key: hub, depth: 2), hiddenNodes: {types.length > 1 ? types[1] : 'none'}),
    'textAndFocus': GraphQuery(text: word, focus: (key: hub, depth: 1), isolated: true),
    'focusGone': const GraphQuery(focus: (key: 'entry:gone', depth: 1)),
  };
  String? folder(String key) {
    final ref = refOf(key);
    final node = ref?.type == EntityType.node ? model.nodes[ref!.id] : null;
    return node?.kindKey == 'scene' && node!.parentId != null && model.nodes[node.parentId]?.kindKey == 'chapter'
        ? 'node:${node.parentId}'
        : null;
  }

  String groupLabel(String type, int count) => '$count ${nodeTypeLabel(type, model).toLowerCase()}';
  JsonMap collapse(List<String> t, bool fold) {
    final r = collapseGraph(full, types: t.toSet(), fold: fold ? folder : null, groupLabel: groupLabel);
    return {
      'graph': _shape(r.graph),
      'into': {
        for (final MapEntry(:key, :value) in r.into.entries)
          if (key != value) key: value,
      },
      'inside': r.inside,
    };
  }

  String labelOf(String key) => full.nodes.where((n) => n.key == key).firstOrNull?.label ?? 'Something deleted';
  return {
    'full': _shape(full),
    'counts': () {
      final c = typeCounts(full);
      return {'nodes': _counts(c.nodes), 'edges': _counts(c.edges), 'statuses': _counts(c.statuses)};
    }(),
    'typeLabels': {
      for (final t in [...types, 'entry:gone', 'nonsense']) t: nodeTypeLabel(t, model),
    },
    'edgeTypeLabels': {
      for (final t in [...edgeTypes, 'link:nonsense', 'nonsense']) t: edgeTypeLabel(t),
    },
    'codes': typeCodes([for (final n in full.nodes) n.type], (t) => nodeTypeLabel(t, model)),
    'shapes': {for (final t in types) t: shapeOf(t).name},
    'groups': {for (final e in full.edges) e.id: groupOf(e.kind).name},
    'words': [for (final e in full.edges.take(30)) edgeWords(e, labelOf)],
    'pairs': [
      for (final p in pairsOf(full.edges))
        {
          'key': p.key,
          'edges': [for (final e in p.edges) e.id],
        },
    ],
    'queries': {
      for (final MapEntry(:key, :value) in queries.entries)
        key: () {
          final g = queryGraph(full, value);
          return {
            'nodes': [for (final n in g.nodes) n.key],
            'edges': [for (final e in g.edges) e.id],
          };
        }(),
    },
    'neighbourhood': {
      'one': neighbourhood(full.edges, hub, 1).toList()..sort(),
      'two': neighbourhood(full.edges, hub, 2).toList()..sort(),
    },
    'collapsed': {
      'fold': collapse([], true),
      'types': collapse(types.take(2).toList(), false),
      'both': collapse(['chapter', 'scene', types[0]], true),
    },
    'limits': {
      for (final n in [3, 10, 200])
        '$n': () {
          final r = limitGraph(full, n, {full.nodes.lastOrNull?.key ?? 'x', 'entry:gone'});
          return {
            'nodes': [for (final x in r.graph.nodes) x.key],
            'edges': [for (final e in r.graph.edges) e.id],
            'total': r.total,
            'cut': r.cut,
          };
        }(),
    },
    'paths': {
      'hub': hub,
      'paths': {
        for (final n in full.nodes.take(12)) n.key: pathBetween(full.edges, hub, n.key)?.map((e) => e.id).toList(),
      },
      'self': pathBetween(full.edges, hub, hub)?.map((e) => e.id).toList(),
      'tooFar': pathBetween(full.edges, hub, second, 1)?.map((e) => e.id).toList(),
    },
  };
}

void main() {
  final golden = readGolden('graph.golden.json');
  final sources = {
    for (final name in fixtureNames) name: loadFixture(name),
    for (final name in ['chronicle', 'court', 'saga']) name: loadFixture(name),
  };
  for (final MapEntry(key: name, value: snapshot) in sources.entries) {
    group('$name agrees with the original', () {
      final expected = golden[name]! as JsonMap;
      final actual = _report(snapshot);
      for (final part in expected.keys) {
        test(part, () => expectJson(actual[part], expected[part], '$name.$part'));
      }
    });
  }

  test('connection groups and letter codes follow the original', () {
    expect([for (final g in EdgeGroup.values) g.name], golden['edgeGroups']);
    final names = {
      'entry:character': 'Characters',
      'entry:location': 'Locations',
      'entry:faction': 'Factions',
      'event': 'Events',
      'chapter': 'Chapters',
      'thread': 'Plot threads',
      'ability': 'Abilities',
      'scene': 'Scenes',
    };
    final clash = {'entry:a': 'Cats', 'entry:b': 'Cattle', 'entry:c': 'Catalogue', 'entry:d': '!!!'};
    final codes = golden['typeCodes']! as JsonMap;
    expectJson(typeCodes(names.keys, (t) => names[t] ?? t), codes['shared'], 'shared');
    expectJson(typeCodes(clash.keys, (t) => clash[t] ?? t), codes['clash'], 'clash');
    expectJson(typeCodes(['entry:character', 'event'], (t) => t), codes['alone'], 'alone');
  });

  test('every graph lays out within bounds, however connected its records', () {
    // A hub tied to dozens of records once swung further each step until it left the page (the chronicle).
    for (final MapEntry(key: name, value: snapshot) in sources.entries) {
      final g = knowledgeGraph(StoryModel.fromSnapshot(snapshot));
      final placed = layoutGraph(
        [for (final n in g.nodes) (id: n.key, degree: n.degree)],
        [for (final p in pairsOf(g.edges)) (from: p.a, to: p.b)],
      );
      for (final p in placed.values) {
        expect(p.x.abs() < 5000 && p.y.abs() < 5000, isTrue, reason: '$name: ${p.x}, ${p.y}');
      }
    }
  });
}
