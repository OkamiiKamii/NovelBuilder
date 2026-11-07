// Systems, progression and ability paths, ported: agreement with the original app on the formula language, sheets
// worked out from blueprints (presets included), tidying, levels from experience, progression change by change at
// every point, snapshots and their comparison, and the ability tree with what does not add up
// (tool/golden/growth.test.ts).
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/abilities/paths.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:novel_builder/shared/domain/model/validity.dart';
import 'package:novel_builder/shared/domain/progression/snapshots.dart';
import 'package:novel_builder/shared/domain/progression/track.dart';
import 'package:novel_builder/shared/domain/records/system.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';
import 'package:novel_builder/shared/domain/systems/compute.dart';
import 'package:novel_builder/shared/domain/systems/formula.dart';
import 'package:novel_builder/shared/domain/systems/system_changes.dart';
import 'package:novel_builder/shared/domain/systems/system_presets.dart';

import 'fixtures.dart';
import 'golden.dart';

/// A number as the golden writes it: non-finite ones as words.
Object? js(Object? v) => switch (v) {
  final double d when d.isNaN => 'NaN',
  final double d when d.isInfinite => d > 0 ? 'Infinity' : '-Infinity',
  _ => v,
};

JsonMap _sheetOut(ComputedSheet s) => {
  'rows': [
    for (final r in s.rows)
      {'id': r.variable.id, 'value': js(r.value), 'display': r.display, 'sources': r.sources, 'error': r.error},
  ],
  'tracks': [
    for (final t in s.tracks)
      {
        'id': t.track.id,
        'label': t.label,
        'level': t.level,
        'next': t.next,
        'unmet': t.unmet,
        'xp': t.xp == null
            ? null
            : {
                'total': t.xp!.total,
                'into': t.xp!.into,
                'needed': t.xp!.needed,
                'gained': t.xp!.gained,
                'progress': t.xp!.progress,
              },
        'error': t.error,
      },
  ],
  'items': [
    for (final i in s.items)
      {
        'id': i.item.id,
        'group': i.group?.id,
        'requires': i.requires,
        'unmet': i.unmet,
        'costs': [
          for (final c in i.costs) {'label': c.label, 'error': c.error},
        ],
        'effects': i.effects,
        'error': i.error,
      },
  ],
  'available': [for (final i in s.available) i.id],
  'points': s.points == null
      ? null
      : {'name': s.points!.name, 'earned': s.points!.earned, 'spent': s.points!.spent, 'unspent': s.points!.unspent},
};

Object? _safe(Object? Function() f) {
  try {
    return f();
  } on FormulaError catch (e) {
    return {'error': e.message};
  }
}

List<JsonMap> _formulas() {
  const values = {'strength': 12.0, 'level': 30.0, 'mana': 0.0, 'label': 'Fire', 'half': 0.5, 'neg': -3.0};
  final scope = FormulaScope(
    value: (name) => values[name.toLowerCase()],
    holds: (group, name) => switch (group.toLowerCase()) {
      'class' => name.toLowerCase() == 'void mage',
      'title' => false,
      _ => null,
    },
  );
  const texts = [
    'strength * 1.5', '100 * level ^ 1.5', 'max(1, floor(strength / 5))', 'min(3, 1, 2)', 'clamp(strength, 0, 10)', //
    'round(2.5)', 'round(-2.5)', 'ceil(half)', 'abs(neg)', 'sqrt(16)',
    'Class: Void Mage AND level >= 50', 'NOT (level < 3) OR Title: Chosen', 'Class: Void Mage and Title: Chosen',
    'label = "fire"', "label != 'Water'", 'label = “Fire”', 'strength ≥ 10 × 1', '10 ÷ 4', '7 % 3', '-7 % 3', //
    '2 ^ 3 ^ 2', '-2 ^ 2',
    'strength / mana', 'strength % mana', 'unknown + 1', 'Guild: Ash', 'label + 1', 'foo(1)', 'floor(1, 2)', //
    'clamp(1)', 'if(level > 10, 1, 2)', 'if(1, 2)', '[strength] + 1', 'true and yes', 'no or false',
    '', '(1 + 2', '1 +', '1 2', 'Class:', '§', 'max()', 'strength >= 10 && level > 1 || 0', '!strength', //
    'level <> 30', 'level == 30', '.5 + 1', 'strength = 12', 'label = 3',
  ];
  return [
    for (final text in texts)
      () {
        final FNode tree;
        try {
          tree = parseFormula(text);
        } on FormulaError catch (e) {
          return {
            'text': text,
            'parse': {'error': e.message},
          };
        }
        return {
          'text': text,
          'names': namesIn(tree),
          'value': _safe(() => js(evaluateFormula(tree, scope))),
          'unmet': _safe(() => unmet(tree, scope)),
        };
      }(),
  ];
}

JsonMap _systemsReport() {
  Map<String, SheetProfile> profiles(SystemBlueprint c) {
    final items = c.items;
    final vars = c.variables;
    final tracks = c.tracks;
    String? item(int i) => i < items.length ? items[i].id : null;
    String? stage(int t, int s) => t < tracks.length && s < tracks[t].stages.length ? tracks[t].stages[s].id : null;
    String v(int i) => i < vars.length ? vars[i].id : 'undefined';
    String t(int i) => i < tracks.length ? tracks[i].id : 'undefined';
    return {
      'empty': const SheetProfile(),
      'holding': SheetProfile(
        values: {v(0): 20.0},
        progress: {t(0): stage(0, 2) ?? 30.0},
        itemIds: [?item(0), ?item(1), ?item(2), ?item(4), ?item(5)],
      ),
      'xp': SheetProfile(
        progress: {t(0): 3.0},
        itemIds: [?item(1)],
        xp: [
          XpEntry({'id': 'a', 'trackId': t(0), 'amount': 5000, 'source': '', 'nodeId': null, 'note': ''}),
          XpEntry({'id': 'b', 'trackId': t(0), 'amount': -100, 'source': '', 'nodeId': null, 'note': ''}),
          XpEntry({'id': 'c', 'trackId': 'nope', 'amount': 3, 'source': '', 'nodeId': null, 'note': ''}),
        ],
        spent: {v(0): 2, v(1): 1, (vars.length > 4 ? vars[4].id : 'x'): 7},
      ),
      'overrides': SheetProfile(
        overrides: {v(0): 99.0, v(vars.length - 1): 3.0},
        itemIds: [for (final i in items) i.id],
      ),
      'odd': SheetProfile(values: {v(0): 'text'}, progress: {t(0): 'nonsense'}, itemIds: const ['nope']),
    };
  }

  JsonMap check(FormulaCheck c) => {'ok': c.ok, 'error': c.error, 'preview': c.preview};
  final presets = <String, Object?>{};
  for (final p in systemPresets) {
    final c = SystemBlueprint(p.content);
    final profs = profiles(c);
    final texts = <String>{
      for (final v in c.variables) v.formula,
      for (final i in c.items) i.requires,
      for (final t in c.tracks) ...[t.curve, for (final s in t.stages) s.requires],
      'levl >= 5', 'Class: Nobody', 'Spirit Root: Lava', 'Cultivation Realm: Nowhere', 'Skill: Fireball', //
      'strength + 1', 'label', '"text"', 'Planet: Mars',
    };
    final prof = profs['xp']!;
    final settled = settle(c, prof);
    final none = settle(c, prof, (_) => false);
    presets[p.id] = {
      'sheets': {for (final e in profs.entries) e.key: _sheetOut(computeSheet(c, e.value))},
      'checks': {
        for (final text in texts)
          text: {
            'number': check(checkFormula(c, text, condition: false)),
            'condition': check(checkFormula(c, text, condition: true)),
          },
      },
      'curves': {
        for (final t in c.tracks)
          t.id: [
            for (final row in curveTable(c, t, const [0, 1, 2, 3, 10, 99, 100, 101]))
              {'level': row.level, 'cost': row.cost},
          ],
      },
      'settle': {'values': settled.values, 'progress': settled.progress, 'itemIds': settled.itemIds},
      'settleNone': {'values': none.values, 'progress': none.progress, 'itemIds': none.itemIds},
      'history': [
        for (final h in xpHistory(c, prof, (_) => 0)) {'entry': h.entry.id, 'level': h.level, 'track': h.track.id},
      ],
    };
  }
  var n = 0;
  String fresh() => '00000000-0000-4000-8000-${(n++).toRadixString(16).padLeft(12, '0')}';
  final tidied = tidyBlueprint({
    'name': '  ',
    'description': 5,
    'variables': [
      {'name': 'Max Health', 'kind': 'odd'},
      {'name': 'Max Health', 'key': 'max_health'},
      {
        'id': 'x',
        'name': '',
        'base': 'x',
        'options': ['a', '', 3],
      },
      {'name': 'Élan Vital'},
    ],
    'tracks': [
      {
        'name': 'Level',
        'points': -2,
        'sources': ['A', 'A', ' ', 'B'],
      },
      {
        'name': 'Realm',
        'kind': 'stages',
        'stages': [
          {'name': ''},
          {'id': 'keep', 'name': 'Two', 'requires': 'x'},
        ],
      },
    ],
    'ranks': [
      'Low',
      {'id': 'r', 'name': 'High'},
      '',
    ],
    'groups': [
      {'id': 'g', 'name': ''},
      {'id': 'h', 'name': 'Classes', 'single': true},
    ],
    'items': [
      {'id': 'a', 'groupId': 'g', 'name': 'A', 'parentId': 'a', 'rank': 'Low'},
      {
        'id': 'b',
        'groupId': 'h',
        'name': '',
        'parentId': 'a',
        'rankId': 'r',
        'modifiers': [
          {'target': 'x', 'op': 'pow', 'value': 2},
        ],
        'costs': [<String, Object?>{}],
      },
      {'id': 'c', 'groupId': 'none', 'name': 'Lost'},
    ],
    'matrices': [
      {
        'name': '',
        'rows': ['R'],
        'columns': ['C'],
        'cells': {'R|C': 'hit', 'R|D': '  ', 'Q|C': 5},
      },
    ],
  }, fresh);
  return {
    'presets': presets,
    'tidy': _named(jsonDecode(jsonEncode(tidied))),
    'keys': [
      for (final k in ['Max Health', 'Élan  Vital!', '', '---', 'ﬁre', 'Strength 2', 'ÆON']) toFormulaKey(k),
    ],
    'formatNumbers': [
      for (final x in [0.0, 1.005, 2.345, -1.5, 1e21, 1 / 3, double.nan, double.infinity]) formatNumber(x),
    ],
    'formulas': _formulas(),
  };
}

final _uuid = RegExp(r'^[0-9a-f-]{36}$');
final _cellKey = RegExp(r'^[0-9a-f-]{36}\|[0-9a-f-]{36}$');

/// Ids made up while tidying are random in the original: both sides name them by where they are first met, as the
/// generator does, and a table cell keyed by two of them is named `cell`.
Object? _named(Object? json) {
  final fresh = <String, String>{};
  Object? visit(Object? v, String key) {
    if (v is Map) {
      return {for (final e in v.entries) (_cellKey.hasMatch('${e.key}') ? 'cell' : e.key): visit(e.value, '${e.key}')};
    }
    if (v is List) return [for (final x in v) visit(x, key)];
    if (v is String && _uuid.hasMatch(v)) return fresh.putIfAbsent(v, () => 'new:$key');
    return v;
  }

  return visit(json, '');
}

JsonMap _novelReport(NovelSnapshot s) {
  final model = StoryModel.fromSnapshot(s);
  final snapshots = [for (final r in s.rows('progressSnapshots')) ProgressSnapshot(r)];
  final nodes = [...model.nodes.values];
  final people = {
    for (final p in model.progress) p.entryId,
    for (final x in snapshots) x.entryId,
    for (final x in model.sheets) x.entryId,
  }.toList()..sort();
  final anchors = <(String, Anchor?)>[
    ('end', null),
    for (final n in nodes) ('node:${n.id}', Anchor.node(n.id)),
    for (final id in model.events.keys) ('event:$id', Anchor.event(id)),
    (
      'date:11',
      Anchor.date({'precision': 'exact', 'year': 11, 'month': null, 'day': null, 'hour': null, 'minute': null}),
    ),
  ];
  JsonMap stateOut(ProgressState st) => {
    'categories': [
      for (final x in st.categories)
        {
          'category': x.category.id,
          'lines': [
            for (final l in x.lines)
              {
                'subject': l.subject,
                'value': l.value,
                'change': l.change.id,
                'step': l.step,
                'uncertain': [for (final u in l.uncertain) u.id],
              },
          ],
          'moments': [for (final m in x.moments) m.id],
          'lost': x.lost,
        },
    ],
    'unplaced': [for (final u in st.unplaced) u.id],
    'untracked': [for (final u in st.untracked) u.id],
  };
  final systems = [...model.systems.values];
  final progression = {
    for (final id in people)
      id: () {
        final ordered = inStoryOrder(snapshots, nodes, id);
        return {
          'order': [for (final x in inOrder(model, id)) x.id],
          'at': {for (final (k, a) in anchors) k: stateOut(progressAt(model, id, a))},
          'summary': progressSummary(progressAt(model, id, null)),
          'log': [
            for (final l in changeLog(model, id))
              {'change': l.change.id, 'words': l.words, 'before': l.before, 'when': l.when},
          ],
          'snapshots': [for (final x in ordered) x.id],
          'stateAt': {
            for (final n in [null, ...nodes.map((n) => n.id), 'gone']) '$n': stateAt(snapshots, nodes, id, n)?.id,
          },
          'resolved': {
            for (final x in ordered)
              for (final MapEntry(key: sid, value: st) in x.systems.entries)
                if (model.systems[sid] case final system?)
                  '${x.id}/$sid': () {
                    final r = resolveSystem(system, st);
                    return {
                      'auto': r.auto,
                      'rows': [
                        for (final row in r.rows)
                          {
                            'id': row.variable.id,
                            'value': js(row.value),
                            'display': row.display,
                            'byHand': row.byHand,
                            'systemSays': row.systemSays,
                            'sources': row.sources,
                            'error': row.error,
                          },
                      ],
                      'tracks': [
                        for (final t in r.tracks)
                          {'id': t.track.id, 'label': t.label, 'unmet': t.unmet, 'error': t.error},
                      ],
                      'items': [
                        for (final i in r.items)
                          {'id': i.item.id, 'unmet': i.unmet, 'effects': i.effects, 'error': i.error},
                      ],
                      'available': [for (final a in r.available) a.id],
                    };
                  }(),
          },
          'compared': [
            for (var i = 1; i < ordered.length; i++)
              () {
                final c = compareSnapshots(ordered[i - 1], ordered[i], systems);
                return {
                  'stats': [
                    for (final x in c.stats)
                      {'system': x.system, 'name': x.name, 'from': x.from, 'to': x.to, 'delta': x.delta},
                  ],
                  'advancement': [
                    for (final x in c.advancement) {'system': x.system, 'name': x.name, 'from': x.from, 'to': x.to},
                  ],
                  'gained': [
                    for (final x in c.gained) {'group': x.group, 'name': x.name},
                  ],
                  'lost': [
                    for (final x in c.lost) {'group': x.group, 'name': x.name},
                  ],
                  'gear': [
                    for (final x in c.gear) {'change': x.change, 'name': x.name, 'detail': x.detail},
                  ],
                  'status': [
                    for (final x in c.status)
                      {'dimension': x.dimension, 'label': x.label, 'added': x.added, 'removed': x.removed},
                  ],
                  'same': c.same,
                };
              }(),
          ],
        };
      }(),
  };
  final tree = abilityTree(model, snapshots);
  final layout = treeLayout([for (final n in tree.nodes) n.key], tree.edges);
  return {
    'progression': progression,
    'sheets': [
      for (final sheet in model.sheets)
        {
          'id': sheet.id,
          'sheet': model.systems[sheet.systemId] == null
              ? null
              : _sheetOut(computeSheet(model.systems[sheet.systemId]!, SheetProfile.of(sheet))),
        },
    ],
    'words': [
      for (final p in model.progress) [p.id, whenWords(p.at, model)],
    ],
    'tree': {
      'nodes': [
        for (final n in tree.nodes)
          {
            'key': n.key,
            'name': n.name,
            'source': n.source,
            'sourceKey': n.sourceKey,
            'color': n.color,
            'rank': n.rank,
            'requires': n.requires,
            'limits': n.limits,
            'holders': [
              for (final h in n.holders) {'id': h.id, 'name': h.name, 'how': h.how},
            ],
            'acquired': [
              for (final a in n.acquired)
                {
                  'entryId': a.entryId,
                  'name': a.name,
                  'action': a.action,
                  'when': a.when,
                  'changeId': ?a.changeId,
                  'snapshotId': ?a.snapshotId,
                },
            ],
          },
      ],
      'edges': [
        for (final e in tree.edges)
          {
            'id': e.id,
            'from': e.from,
            'to': e.to,
            'role': e.role.name,
            'label': e.label,
            'directed': e.directed,
            'linkId': e.linkId,
          },
      ],
      'notDrawn': [
        for (final x in tree.notDrawn) {'connection': x.connection.id, 'reason': x.reason},
      ],
    },
    'problems': [
      for (final p in pathProblems(tree, model))
        {'key': p.key, 'kind': p.kind.name, 'severity': p.severity, 'message': p.message, 'nodes': p.nodes},
    ],
    'layout': {
      'at': {
        for (final e in layout.at.entries) e.key: {'x': e.value.x, 'y': e.value.y, 'layer': e.value.layer},
      },
      'back': layout.back.toList()..sort(),
      'width': layout.width,
      'height': layout.height,
    },
    'pathsOf': {for (final n in tree.nodes.take(20)) n.key: pathsOf(tree, n.key).toList()..sort()},
  };
}

void main() {
  final golden = readGolden('growth.golden.json');
  final sources = {for (final name in fixtureNames) name: loadFixture(name), 'growth': loadFixture('growth')};
  for (final MapEntry(key: name, value: snapshot) in sources.entries) {
    group('$name agrees with the original', () {
      final expected = golden[name]! as JsonMap;
      final actual = _novelReport(snapshot);
      for (final part in expected.keys.where((k) => k != 'without')) {
        test(part, () => expectJson(actual[part], expected[part], '$name.$part'));
      }
    });
  }

  group('systems agree with the original', () {
    final expected = golden['systems']! as JsonMap;
    final actual = _systemsReport();
    for (final part in expected.keys) {
      test(part, () {
        final want = part == 'tidy' ? _named(expected[part]) : expected[part];
        expectJson(actual[part], want, 'systems.$part');
      });
    }
  });
}
