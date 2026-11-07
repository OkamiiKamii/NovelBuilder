// The Visualize frame, ported: agreement with the original app on the details panel, what is connected to a selection,
// the views' written forms, saved views and turning views off and on (tool/golden/visualize.test.ts).
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/model/entity_ref.dart';
import 'package:novel_builder/shared/domain/model/navigate.dart';
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';
import 'package:novel_builder/shared/domain/visualize/modules.dart';
import 'package:novel_builder/shared/domain/visualize/saved_views.dart';
import 'package:novel_builder/shared/domain/visualize/summaries.dart';

import 'fixtures.dart';
import 'golden.dart';

JsonMap _report(NovelSnapshot s) {
  final model = StoryModel.fromSnapshot(s);
  final refs = [
    for (final id in model.nodes.keys) EntityRef(EntityType.node, id),
    for (final id in model.entries.keys) EntityRef(EntityType.entry, id),
    for (final id in model.events.keys) EntityRef(EntityType.event, id),
    for (final id in model.threads.keys) EntityRef(EntityType.thread, id),
    for (final id in model.relations.keys) EntityRef(EntityType.relation, id),
    for (final id in model.abilities.keys) EntityRef(EntityType.ability, id),
    const EntityRef(EntityType.entry, 'gone'),
  ];
  final ids = [...model.entries.keys];
  final nodes = [...model.nodes.keys];
  final filters = <JsonMap>[
    {},
    {
      'characters': [ids[0], 'gone', ids[0]],
      'locations': ['gone'],
      'text': '  keep  ',
      'types': ['entry', 'nonsense', 'event'],
      'canon': ['canon', 'maybe'],
      'status': ['idea'],
      'significance': ['huge', 'climax'],
    },
    {
      'ids': [...ids.take(3), 'gone'],
      'threads': ['gone'],
      'chapters': {'from': nodes.firstOrNull ?? 'x', 'to': 'gone'},
      'time': {
        'from': {'kind': 'event', 'eventId': 'gone'},
        'until': {'kind': 'node', 'nodeId': nodes.length > 1 ? nodes[1] : 'y'},
      },
    },
    {
      'time': {
        'from': {
          'kind': 'date',
          'when': {'precision': 'relative', 'anchorId': 'gone', 'amount': 1, 'unit': 'years', 'direction': 'after'},
        },
        'until': {
          'kind': 'date',
          'when': {'precision': 'bogus'},
        },
      },
      'factions': [''],
    },
  ];
  final cleaned = [
    for (final (i, filter) in filters.indexed)
      cleanConfig({
        'filter': filter,
        'mode': i.isOdd ? 'list' : 'odd',
        'layers': ['a', 'a', '', 3],
        'scale': i == 1 ? {'x': 1, 'y': 2, 'k': 0.5} : {'x': 1, 'y': double.infinity, 'k': 1},
        'layout': i == 2 ? ['no'] : {'group': 'thread', 'trackOrder': ids.take(2).toList()},
      }),
  ];
  final graph = graphSummary(model);
  return {
    'details': {
      for (final r in refs)
        r.key: switch (detailsOf(model, r)) {
          null => null,
          final d => {
            'label': d.view.label,
            'facts': [
              for (final f in d.facts) {'label': f.label, 'value': f.value},
            ],
            'groups': [
              for (final g in d.groups)
                {
                  'title': g.title,
                  'items': [
                    for (final i in g.items) {'ref': i.ref.key, 'label': i.label, 'note': i.note},
                  ],
                },
            ],
          },
        },
    },
    'related': {for (final r in refs) r.key: relatedIds(model, r).toList()..sort()},
    'timeline': [
      for (final t in timelineRows(model))
        {
          'id': t.id,
          'title': t.title,
          'when': t.when,
          'dated': t.dated,
          'start': t.start.isInfinite ? 'Infinity' : t.start,
          'told': t.told,
        },
    ],
    'relationships': [
      for (final r in relationshipRows(model)) {'id': r.id, 'between': r.between, 'now': r.now, 'stages': r.stages},
    ],
    'plot': [
      for (final p in plotRows(model))
        {
          'id': p.id,
          'title': p.title,
          'status': ?p.status,
          'developments': p.developments,
          'unplaced': p.unplaced,
          'chapters': p.chapters,
        },
    ],
    'graph': {
      'records': graph.records,
      'connections': graph.connections,
      'dangling': graph.dangling,
      'mostConnected': [
        for (final m in graph.mostConnected) {'ref': m.ref.key, 'label': m.label, 'count': m.count},
      ],
    },
    'places': [
      for (final p in placeRows(model)) {'id': p.id, 'name': p.name, 'depth': p.depth, 'events': p.events},
    ],
    'progression': [
      for (final p in progressionRows(model, s.rows('progressSnapshots')))
        {
          'id': p.id,
          'name': p.name,
          'abilities': p.abilities,
          'snapshots': p.snapshots,
          'changes': p.changes,
          'now': p.now,
        },
    ],
    'cleaned': cleaned,
    'opened': [
      for (final c in cleaned)
        () {
          final o = openSaved(model, mapOrNull(c['filter'])!);
          return {'filter': o.filter, 'missing': o.missing};
        }(),
    ],
  };
}

void main() {
  final golden = readGolden('visualize.golden.json');
  final sources = {
    for (final name in fixtureNames) name: loadFixture(name),
    'chronicle': NovelSnapshot.fromJson(jsonDecode(File('test/fixtures/chronicle.novel.json').readAsStringSync())),
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

  test('turning views off and on follows the original’s rules', () {
    String key(({String key, String why}) b) => b.key;
    final actual = {
      'on': [
        for (final v in viewsOn(['charts', 'places'])) v.key,
      ],
      'offPlaces': () {
        final r = turnOff([], ['places']);
        return {
          'off': r.off,
          'blocked': [
            for (final b in r.blocked)
              {
                'key': b.key,
                'by': [
                  for (final x in b.by) {'key': key(x), 'why': x.why},
                ],
              },
          ],
        };
      }(),
      'offBoth': {
        'off': turnOff(['charts'], ['places', 'journeys']).off,
        'blocked': <Object?>[],
      },
      'offJourneys': {
        'off': turnOff([], ['journeys']).off,
        'blocked': <Object?>[],
      },
      'onJourneys': {
        'off': turnOn(['journeys', 'places', 'charts'], 'journeys').off,
        'alsoOn': turnOn(['journeys', 'places', 'charts'], 'journeys').alsoOn,
      },
      'onTimeline': {
        'off': turnOn(['timeline'], 'timeline').off,
        'alsoOn': turnOn(['timeline'], 'timeline').alsoOn,
      },
    };
    expectJson(actual, golden['modules'], 'modules');
  });
}
