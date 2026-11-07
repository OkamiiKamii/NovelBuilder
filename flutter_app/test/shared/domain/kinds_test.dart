// Kinds of record in the views, ported: agreement with the original app on what each setting reads and what is
// missing, Records by kind (table, CSV, timeline, map, ladder, holders), the record check for settings that no
// longer suit, and the worldbuilding presets (tool/golden/kinds.test.ts).
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/codex/capabilities.dart';
import 'package:novel_builder/shared/domain/codex/world_presets.dart';
import 'package:novel_builder/shared/domain/integrity/rules.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';
import 'package:novel_builder/shared/domain/visualize/kinds.dart';

import 'fixtures.dart';
import 'golden.dart';

JsonMap _entry(dynamic e) => {'id': e.id, 'name': e.name};

List<JsonMap> _unplaced(List<Unplaced> u) => [
  for (final x in u) {..._entry(x.entry), 'reason': x.reason},
];

JsonMap _report(NovelSnapshot s) {
  final model = StoryModel.fromSnapshot(s);
  final kinds = kindsOf(model);
  return {
    'kinds': [
      for (final k in kinds) {'key': k.category.key, 'count': k.count},
    ],
    'categories': {
      for (final c in model.categories.values)
        c.key: {
          'missing': {
            for (final v in KindView.values) v.name: missingFor(c, v),
            'graphLabel': missingFor(c, 'graphLabel'),
            'graphLinks': missingFor(c, 'graphLinks'),
          },
          'ready': [for (final v in readyViews(c)) v.name],
          'fieldsFor': {
            for (final slot in Slot.values) slot.key: [for (final d in fieldsFor(c, slot)) d.id],
          },
        },
    },
    'views': {
      for (final (:category, count: _) in kinds)
        category.key: () {
          final key = category.key;
          final table = kindTable(model, key);
          final timeline = kindTimeline(model, key);
          final map = kindMap(model, key);
          final ranks = kindRanks(model, key);
          final held = kindHolders(model, key);
          return {
            'table': {
              'columns': [for (final d in table.columns) d.id],
              'rows': [
                for (final r in table.rows) {..._entry(r.entry), 'cells': r.cells},
              ],
            },
            'csv': tableCsv(table),
            'timeline': {
              'placed': [
                for (final t in timeline.placed)
                  {
                    ..._entry(t.entry),
                    'start': t.start.toJson(),
                    'end': t.end?.toJson(),
                    'span': {'lo': t.lo, 'hi': t.hi},
                    'label': t.label,
                    'note': t.note,
                  },
              ],
              'unplaced': _unplaced(timeline.unplaced),
              'missing': timeline.missing,
            },
            'map': {
              'points': [
                for (final p in map.points) {..._entry(p.entry), 'x': p.x, 'y': p.y},
              ],
              'unplaced': _unplaced(map.unplaced),
              'axes': {'x': map.axes.x, 'y': map.axes.y},
              'missing': map.missing,
            },
            'ranks': {
              'levels': [
                for (final l in ranks.levels)
                  {
                    'label': l.label,
                    'entries': [for (final e in l.entries) e.id],
                  },
              ],
              'unplaced': _unplaced(ranks.unplaced),
              'field': ranks.field,
              'missing': ranks.missing,
            },
            'holders': {
              'records': [
                for (final r in held.records)
                  {
                    ..._entry(r.entry),
                    'history': [
                      for (final h in r.history)
                        {
                          'connection': h.connection.id,
                          'holder': h.holder.id,
                          'holderName': h.holderName,
                          'when': h.when,
                        },
                    ],
                    'current': r.current == null ? null : {'id': r.current!.id, 'name': r.current!.name},
                    'note': r.note,
                  },
              ],
              'typeLabel': held.typeLabel,
              'field': held.field,
              'missing': held.missing,
            },
          };
        }(),
    },
    'unsuited': [
      for (final u in unsuitedKinds(model)) {'key': u.key, 'category': u.category.key, 'problems': u.problems},
    ],
  };
}

void main() {
  final golden = readGolden('kinds.golden.json');
  final sources = {
    for (final name in fixtureNames) name: loadFixture(name),
    for (final name in ['chronicle', 'kinds', 'kinds-calendar']) name: loadFixture(name),
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

  test('the words for each setting, and a map’s grid, follow the original', () {
    expectJson({for (final s in Slot.values) s.key: typeWords(s)}, golden['typeWords'], 'typeWords');
    expectJson(
      [
        niceTicks(0, 10),
        niceTicks(-3, 4, 4),
        niceTicks(0.1, 0.35),
        niceTicks(5, 5),
        niceTicks(-1000, 2500),
        niceTicks(1e-3, 9e-3),
        niceTicks(0, 1, 3),
      ],
      golden['niceTicks'],
      'niceTicks',
    );
  });

  test('the worldbuilding presets are the original’s', () {
    expectJson(
      [
        for (final p in worldPresets)
          {'id': p.id, 'name': p.name, 'description': p.description, 'categories': p.categories},
      ],
      golden['presets'],
      'presets',
    );
  });
}
