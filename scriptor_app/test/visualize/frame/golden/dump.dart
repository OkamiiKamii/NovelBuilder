// The Flutter app's own outputs for the Visualize workspace (frame.golden.json pins them; outputs.ts makes Scriptor's,
// keyed and shaped the same way). For every novel given: what each view lists (summaries), the shared query under a
// set of filters, every record's details and what it is connected to, Records by kind (table, CSV, timeline, map,
// ranks, holders), saved views opened and changed, and every chart under a set of filters. And `misc`: turning views
// off and on, filters and configs cleaned, ticks, steps, CSV and file names.
//
// Run from a scratch dir holding the package config that names novel_builder:
//   dart run dump.dart frame.golden.json <the Flutter fixtures>/*.novel.json edge.novel.json the-drowned-road.novel.json

import 'dart:convert';
import 'dart:io';

import 'package:novel_builder/shared/domain/analytics/charts.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/model/entity_ref.dart';
import 'package:novel_builder/shared/domain/model/navigate.dart';
import 'package:novel_builder/shared/domain/model/query.dart';
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';
import 'package:novel_builder/shared/domain/visualize/kinds.dart';
import 'package:novel_builder/shared/domain/visualize/modules.dart';
import 'package:novel_builder/shared/domain/visualize/saved_views.dart';
import 'package:novel_builder/shared/domain/visualize/summaries.dart';
import 'package:novel_builder/shared/domain/visualize/views.dart';

/// features/progress/charts_page.dart's fileSlug, word for word (that file needs Flutter).
String fileSlug(String title) {
  final s = title.replaceAll(RegExp(r'[^\p{L}\p{N}]+', unicode: true), '-').replaceAll(RegExp(r'^-|-$'), '');
  return s.isEmpty ? 'untitled' : s;
}

Object? num_(num n) => n.isFinite ? n : (n > 0 ? 'inf' : '-inf');

int _byKey(EntityRef a, EntityRef b) => a.key.compareTo(b.key);

List<EntityRef> allRefs(StoryModel m) => [
  for (final id in m.nodes.keys) EntityRef(EntityType.node, id),
  for (final id in m.entries.keys) EntityRef(EntityType.entry, id),
  for (final id in m.events.keys) EntityRef(EntityType.event, id),
  for (final id in m.threads.keys) EntityRef(EntityType.thread, id),
  for (final id in m.relations.keys) EntityRef(EntityType.relation, id),
  for (final id in m.abilities.keys) EntityRef(EntityType.ability, id),
]..sort(_byKey);

Object? summaries(StoryModel m, NovelSnapshot s) => {
  'timeline': [
    for (final r in timelineRows(m))
      {'id': r.id, 'title': r.title, 'when': r.when, 'dated': r.dated, 'start': num_(r.start), 'told': r.told},
  ],
  'relationships': [
    for (final r in relationshipRows(m)) {'id': r.id, 'between': r.between, 'now': r.now, 'stages': r.stages},
  ],
  'plot': [
    for (final r in plotRows(m))
      {
        'id': r.id,
        'title': r.title,
        'status': r.status,
        'developments': r.developments,
        'unplaced': r.unplaced,
        'chapters': r.chapters,
      },
  ],
  'graph': () {
    final g = graphSummary(m);
    return {
      'records': g.records,
      'connections': g.connections,
      'dangling': g.dangling,
      'most': [
        for (final x in g.mostConnected) {'ref': x.ref.key, 'label': x.label, 'count': x.count},
      ],
    };
  }(),
  'places': [
    for (final r in placeRows(m)) {'id': r.id, 'name': r.name, 'depth': r.depth, 'events': r.events},
  ],
  'progression': [
    for (final r in progressionRows(m, s.rows('progressSnapshots')))
      {
        'id': r.id,
        'name': r.name,
        'abilities': r.abilities,
        'snapshots': r.snapshots,
        'changes': r.changes,
        'now': r.now,
      },
  ],
};

List<JsonMap> filtersFor(StoryModel m) {
  final characters = [
    for (final e in m.entries.values)
      if (e.category == 'character') e.id,
  ]..sort();
  final threads = [...m.threads.keys]..sort();
  final chapters = m.order.chapters;
  final events = [...m.events.keys]..sort();
  return [
    {},
    {'text': 'a'},
    {'text': 'the'},
    if (characters.isNotEmpty) {'characters': [characters.first]},
    if (characters.length > 1) {'characters': [characters.last], 'types': ['event', 'node']},
    {'types': ['event']},
    if (threads.isNotEmpty) {'threads': [threads.first]},
    if (chapters.length > 2) {'chapters': {'from': chapters[1].id, 'to': chapters[2].id}},
    if (chapters.isNotEmpty) {'chapters': {'from': chapters.last.id}},
    {'canon': ['provisional', 'canon']},
    {'significance': ['major'], 'status': ['confirmed']},
    {'categories': ['location']},
    if (events.isNotEmpty)
      {
        'time': {
          'from': {'kind': 'event', 'eventId': events.first},
        },
      },
    {
      'time': {
        'from': {
          'kind': 'date',
          'when': {'precision': 'exact', 'year': 1},
        },
        'until': {
          'kind': 'date',
          'when': {'precision': 'exact', 'year': 1200},
        },
      },
    },
  ];
}

Object? query(StoryModel m) => [
  for (final f in filtersFor(m))
    () {
      final r = select(m, Filter.fromJson(f));
      return {
        'filter': f,
        'items': [for (final v in r.items) v.ref.key],
        'undecided': [
          for (final u in r.undecided)
            {
              'filter': u.filter,
              'reason': u.reason,
              'refs': [for (final x in u.refs) x.key],
            },
        ],
        'considered': r.considered,
      };
    }(),
];

Object? details(StoryModel m) => {
  for (final ref in allRefs(m))
    ref.key: () {
      final d = detailsOf(m, ref);
      return {
        'view': d == null ? null : {'ref': d.view.ref.key, 'label': d.view.label, 'kind': d.view.kind},
        'facts': [
          for (final f in d?.facts ?? const <({String label, String value})>[]) {'label': f.label, 'value': f.value},
        ],
        'groups': [
          for (final g in d?.groups ?? const <({String title, List<DetailItem> items})>[])
            {
              'title': g.title,
              'items': [
                for (final i in g.items) {'ref': i.ref.key, 'label': i.label, 'note': i.note},
              ],
            },
        ],
        'related': relatedIds(m, ref).toList()..sort(),
      };
    }(),
  'gone': detailsOf(m, const EntityRef(EntityType.entry, 'no-such-record')) == null,
};

Object? kinds(StoryModel m) => {
  'kinds': [
    for (final k in kindsOf(m)) {'key': k.category.key, 'count': k.count},
  ],
  'first': kindKeyOf(m, null),
  'asked': kindKeyOf(m, 'location'),
  'each': {
    for (final k in kindsOf(m))
      k.category.key: () {
        final key = k.category.key;
        final table = kindTable(m, key);
        final timeline = kindTimeline(m, key);
        final map = kindMap(m, key);
        final ranks = kindRanks(m, key);
        final holders = kindHolders(m, key);
        Object? unplaced(List<Unplaced> list) => [
          for (final u in list) {'id': u.entry.id, 'reason': u.reason},
        ];
        return {
          'table': {
            'columns': [for (final c in table.columns) c.name],
            'rows': [
              for (final r in table.rows) {'id': r.entry.id, 'cells': r.cells},
            ],
            'csv': tableCsv(table),
          },
          'timeline': {
            'placed': [
              for (final t in timeline.placed)
                {
                  'id': t.entry.id,
                  'start': t.start.toJson(),
                  'end': t.end?.toJson(),
                  'lo': num_(t.lo),
                  'hi': num_(t.hi),
                  'label': t.label,
                  'note': t.note,
                },
            ],
            'unplaced': unplaced(timeline.unplaced),
            'missing': timeline.missing,
          },
          'map': {
            'points': [
              for (final p in map.points) {'id': p.entry.id, 'x': p.x, 'y': p.y},
            ],
            'unplaced': unplaced(map.unplaced),
            'axes': [map.axes.x, map.axes.y],
            'missing': map.missing,
          },
          'ranks': {
            'levels': [
              for (final l in ranks.levels)
                {
                  'label': l.label,
                  'ids': [for (final e in l.entries) e.id],
                },
            ],
            'unplaced': unplaced(ranks.unplaced),
            'field': ranks.field,
            'missing': ranks.missing,
          },
          'holders': {
            'records': [
              for (final r in holders.records)
                {
                  'id': r.entry.id,
                  'history': [
                    for (final h in r.history)
                      {'connection': h.connection.id, 'holder': h.holder.key, 'name': h.holderName, 'when': h.when},
                  ],
                  'current': r.current == null ? null : {'id': r.current!.id, 'name': r.current!.name},
                  'note': r.note,
                },
            ],
            'type': holders.typeLabel,
            'field': holders.field,
            'missing': holders.missing,
          },
        };
      }(),
  },
};

Object? savedViews(StoryModel m, NovelSnapshot s) {
  final refs = allRefs(m);
  final chapters = m.order.chapters;
  final opened = [
    for (final r in s.rows('savedViews')) openSaved(m, mapOrNull(r['filter']) ?? const {}),
    openSaved(m, {
      'ids': [if (refs.isNotEmpty) refs.first.id, 'gone-1'],
      'characters': ['gone-2'],
      'threads': [...m.threads.keys.take(1), 'gone-3'],
      'chapters': {'from': chapters.isEmpty ? 'gone-4' : chapters.first.id, 'to': 'gone-5'},
      'time': {
        'from': {'kind': 'event', 'eventId': 'gone-6'},
        'until': {'kind': 'node', 'nodeId': chapters.isEmpty ? 'gone-7' : chapters.last.id},
      },
      'text': 'keep',
    }),
  ];
  var clock = 1000;
  var ids = 0;
  var snapshot = s;
  final steps = <Object?>[];
  T run<T>(T Function(SavedViewChanges c) apply) {
    final c = SavedViewChanges(snapshot, now: ++clock, createId: () => 'sv${++ids}');
    final result = apply(c);
    snapshot = c.snapshot;
    steps.add({
      'rows': [...snapshot.rows('savedViews')]..sort((a, b) => '${a['id']}'.compareTo('${b['id']}')),
      'off': snapshot.project['viewsOff'],
      'list': [for (final v in c.list()) v.name],
      'timeline': [for (final v in c.list('timeline')) v.name],
    });
    return result;
  }

  final a = run(
    (c) => c.save('timeline', '  Mira’s year ', {
      'filter': {
        'characters': [' x ', 'x', 'y'],
        'types': ['event', 'nonsense'],
        'text': ' war ',
      },
      'mode': 'list',
      'layers': ['a', 'a', '', 3],
      'scale': {'x': 1, 'y': 2, 'k': 0.5},
      'layout': {'grain': 'scenes'},
    }),
  );
  final b = run((c) => c.save('', '', {'scale': {'x': 1, 'y': 2, 'k': 0}}));
  run((c) => c.update(a, {'mode': 'visual', 'filter': {'text': 'peace'}}));
  run((c) => c.rename(b, '   '));
  final d = run((c) => c.duplicate(a));
  run((c) => c.restoreDefault(d));
  run((c) => c.removeView(b));
  run((c) => c.setViewsOff(['journeys', 'places']));
  String? refused;
  try {
    run((c) => c.removeView('no-such-view'));
  } on Object catch (e) {
    refused = '$e';
  }
  return {
    'opened': [
      for (final o in opened) {'filter': o.filter, 'missing': o.missing},
    ],
    'steps': steps,
    'refused': refused != null,
  };
}

JsonMap chartJson(Chart c) => {
  'key': c.key,
  'title': c.title,
  'uses': c.uses,
  'measure': c.measure,
  'units': [c.units.$1, c.units.$2],
  'shape': c.shape,
  'bars': [
    for (final b in c.bars)
      {'key': b.key, 'short': b.short, 'label': b.label, 'value': b.value, 'ref': b.ref?.key, 'detail': b.detail},
  ],
  'empty': c.empty,
  'summary': c.summary,
  'notes': c.notes,
  'columns': c.columns,
  'rows': c.rows,
  'csv': toCsv(c.columns, c.rows),
};

Object? charts(StoryModel m) {
  final chapters = m.order.chapters;
  final threads = [...m.threads.keys]..sort();
  final povs = {
    for (final p in m.plans.values) ...p.povIds,
  }.where(m.entries.containsKey).toList()..sort();
  final labels = {
    for (final p in m.plans.values) ...p.labels,
  }.toList()..sort();
  final layouts = <JsonMap>[
    {},
    {'cgrain': 'scenes'},
    {'ccount': 'page'},
    if (threads.isNotEmpty) {'cthread': threads.first},
    if (povs.isNotEmpty) {'cpov': povs.first},
    if (labels.isNotEmpty) {'clabel': labels.first.toUpperCase()},
    if (chapters.length > 3) {'cfrom': chapters[1].id, 'cto': chapters[3].id, 'cgrain': 'scenes'},
    {'cyfrom': ' 1000 ', 'cyto': '1300', 'cthread': 'gone'},
    {'cyfrom': '-5', 'cyto': 'x'},
  ];
  return [
    for (final l in layouts)
      () {
        final f = ChartFilter.of(l, m);
        return {
          'layout': l,
          'filter': f.toLayout(),
          'filtered': f.filtered,
          'charts': [for (final c in analyticsCharts(m, f)) chartJson(c)],
        };
      }(),
  ];
}

JsonMap novel(NovelSnapshot s) {
  final m = StoryModel.fromSnapshot(s);
  return {
    'summaries': summaries(m, s),
    'query': query(m),
    'details': details(m),
    'kinds': kinds(m),
    'savedViews': savedViews(m, s),
    'charts': charts(m),
  };
}

JsonMap misc() {
  final keys = [for (final v in visualViews) v.key];
  return {
    'views': [
      for (final v in visualViews)
        {'key': v.key, 'label': v.label, 'path': v.path, 'phase': v.phase, 'built': isBuilt(v)},
    ],
    'label': [viewLabel('graph'), viewLabel('nope')],
    'on': [
      for (final off in [
        <String>[],
        ['places'],
        ['journeys', 'charts'],
        keys,
      ])
        [for (final v in viewsOn(off)) v.key],
    ],
    'neededBy': {for (final k in keys) k: [for (final m in neededBy(k)) m.key]},
    'turnOff': [
      for (final (off, these) in [
        (<String>[], ['places']),
        (<String>[], ['places', 'journeys']),
        (['journeys'], ['places']),
        (['timeline'], ['graph', 'charts']),
        (<String>[], keys),
      ])
        () {
          final r = turnOff(off, these);
          return {
            'off': r.off,
            'blocked': [
              for (final b in r.blocked)
                {
                  'key': b.key,
                  'by': [
                    for (final x in b.by) {'key': x.key, 'why': x.why},
                  ],
                },
            ],
          };
        }(),
    ],
    'turnOn': [
      for (final (off, key) in [
        (['places', 'journeys'], 'journeys'),
        (['places'], 'places'),
        (['charts'], 'graph'),
        (keys, 'journeys'),
      ])
        () {
          final r = turnOn(off, key);
          return {'off': r.off, 'alsoOn': r.alsoOn};
        }(),
    ],
    'clean': [
      for (final f in [
        null,
        {},
        {
          'types': 'event, entry,nope, event',
          'ids': [' a ', 'b', 'a', 3, 2.5, null],
          'canon': ['canon', 'retconned', 'x'],
          'status': ['idea'],
          'significance': ['minor', 'huge'],
          'text': '  the war  ',
          'chapters': {'from': 'c1', 'to': ''},
          'time': {
            'from': {'kind': 'node', 'nodeId': 'n1'},
            'until': {
              'kind': 'date',
              'when': {'precision': 'exact', 'year': 3},
            },
          },
        },
        {
          'time': {
            'until': {
              'kind': 'date',
              'when': {'precision': 'bogus'},
            },
          },
          'chapters': {'to': 'c9'},
          'characters': [],
        },
      ])
        () {
          final c = cleanFilter(f);
          return {'clean': c, 'active': activeFilters(c)};
        }(),
    ],
    'config': [
      for (final c in <JsonMap>[
        {},
        {
          'mode': 'list',
          'layers': ['x', 'x', 7, ''],
          'scale': {'x': 1, 'y': -2, 'k': 3},
          'layout': {'a': 1},
          'filter': {'text': ' hi '},
        },
        {
          'scale': {'x': 1, 'y': 2, 'k': -1},
          'layout': 'no',
        },
      ])
        cleanConfig(c),
    ],
    'default': defaultViewConfig(),
    'ticks': [
      for (final (lo, hi, n) in [
        (0, 100, 5),
        (-3.2, 7.9, 5),
        (0.001, 0.0172, 4),
        (5, 5, 5),
        (10, 2, 5),
        (-1000, 250000, 6),
        (0.1, 0.3, 5),
      ])
        niceTicks(lo, hi, n),
    ],
    'steps': [
      for (final (s, most) in [(1, 12), (13, 12), (9001, 12), (250, 30), (31, 30), (1201, 12), (0.5, 3)]) niceStep(s, most),
    ],
    'csv': toCsv(
      ['A', 'B, with comma'],
      [
        ['=SUM(1)', 3],
        ['he said "hi"', -2],
        ['@x', 'line\nbreak'],
        ['+1', '-1'],
      ],
    ),
    'slugs': [for (final t in ['', 'The Drowned Road', '  ¡Hola, Señor!  ', '---', 'Ψυχή 2']) fileSlug(t)],
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
