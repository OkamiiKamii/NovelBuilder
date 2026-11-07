// Agreement with the original app: both real fixture files go through the Dart model, and every result must equal
// what the original TypeScript model produced for the same file (tool/golden/golden.test.ts wrote the goldens).
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/model/connections.dart';
import 'package:novel_builder/shared/domain/model/entity_ref.dart';
import 'package:novel_builder/shared/domain/model/query.dart';
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:novel_builder/shared/domain/model/story_order.dart';
import 'package:novel_builder/shared/domain/model/validate.dart';
import 'package:novel_builder/shared/domain/model/validity.dart';
import 'package:novel_builder/shared/domain/records/calendar.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';

import 'fixtures.dart';
import 'golden.dart';

Object? _num(double n) => n == double.infinity ? 'inf' : (n == -double.infinity ? '-inf' : n);
Object? _span(Span? s) => s == null ? null : {'lo': _num(s.lo), 'hi': _num(s.hi)};

void main() {
  for (final name in fixtureNames) {
    group('agrees with the original app on $name', () {
      late StoryModel model;
      late JsonMap golden;
      late NovelSnapshot snapshot;

      setUpAll(() {
        snapshot = loadFixture(name);
        model = StoryModel.fromSnapshot(snapshot);
        golden = jsonDecode(File('test/fixtures/golden/$name.golden.json').readAsStringSync()) as JsonMap;
      });

      test('reading order and chapter numbers', () {
        final order = golden['order']! as JsonMap;
        expectJson(model.order.position, order['position'], 'position');
        expectJson(model.order.chapterNumber, order['chapterNumber'], 'chapterNumber');
        expectJson([for (final c in model.order.chapters) c.id], order['chapters'], 'chapters');
      });

      test('every connection, in the same order, with the same wording', () {
        final derived = deriveConnections(model);
        expectJson([for (final c in derived.connections) c.toJson()], golden['connections'], 'connections');
        expectJson(
          [
            for (final d in derived.dangling)
              {
                'id': d.connection.id,
                'missing': [for (final m in d.missing) m.toJson()],
              },
          ],
          golden['dangling'],
          'dangling',
        );
      });

      test('validation of every stored record', () {
        final problems = <JsonMap>[];
        void check(EntityType type, List<JsonMap> rows) {
          for (final r in rows) {
            final p = validateRecord(type, r);
            if (p.isNotEmpty) problems.add({'type': type.name, 'id': r['id'], 'problems': p});
          }
        }

        check(EntityType.node, snapshot.rows('chapters'));
        check(EntityType.entry, snapshot.rows('loreEntries'));
        check(EntityType.event, snapshot.rows('timelineEvents'));
        check(EntityType.thread, snapshot.rows('plotThreads'));
        check(EntityType.relation, snapshot.rows('characterRelations'));
        for (final s in snapshot.rows('systems')) {
          check(EntityType.ability, maps(s['items']));
        }
        expectJson(problems, golden['validation'], 'validation');
      });

      test('when each event happens, in story time', () {
        final context = model.timeContext;
        expectJson(
          {
            for (final id in [...model.events.keys]..sort())
              id: {
                'span': _span(spanOfEvent(id, context)),
                'bounds': switch (boundsOfEvent(id, context)) {
                  null => null,
                  final b => {'start': _span(b.start), 'end': _span(b.end), 'open': b.open},
                },
              },
          },
          golden['events'],
          'events',
        );
      });

      test('relationship history at every chapter', () {
        final chapters = [null, for (final c in model.order.chapters) c.id];
        expectJson(
          {
            for (final r in model.relations.values) r.id: [for (final n in chapters) stageAt(r, n, model.order)?.id],
          },
          golden['stages'],
          'stages',
        );
      });

      test('whether each time-bounded link holds at each chapter, event and date', () {
        final anchors = [for (final a in golden['anchors']! as List) Anchor.fromJson(a)!];
        final context = model.timeContext;
        expectJson(
          [
            for (final l in model.links)
              if (l.validity != null)
                {
                  'id': l.id,
                  'at': [for (final a in anchors) validAt(l.validity!, a, context).toJson()],
                },
          ],
          golden['validity'],
          'validity',
        );
        final linked = [
          for (final l in model.links)
            if (l.validity != null) l,
        ];
        expectJson(
          [
            for (final a in linked)
              for (final b in linked)
                if (a.id.compareTo(b.id) < 0)
                  {'a': a.id, 'b': b.id, 'overlaps': overlaps(a.validity!, b.validity!, context).toJson()},
          ],
          golden['linkPairs'],
          'linkPairs',
        );
      });

      test('queries return the same records, undecided reasons and order', () {
        for (final e in (golden['query']! as JsonMap).entries) {
          final expected = e.value! as JsonMap;
          final result = select(model, Filter.fromJson(expected['filter']! as JsonMap));
          expectJson(
            {
              'items': [
                for (final v in result.items)
                  {'type': v.ref.type.name, 'id': v.ref.id, 'label': v.label, 'kind': v.kind},
              ],
              'undecided': [
                for (final u in result.undecided)
                  {
                    'filter': u.filter,
                    'reason': u.reason,
                    'refs': [for (final r in u.refs) r.toJson()],
                  },
              ],
              'considered': result.considered,
            },
            {
              for (final k in ['items', 'undecided', 'considered']) k: expected[k],
            },
            'query ${e.key}',
          );
        }
      });

      test('connection queries agree', () {
        for (final e in (golden['connectionQuery']! as JsonMap).entries) {
          final expected = e.value! as JsonMap;
          final result = selectConnections(model, ConnectionFilter.fromJson(expected['filter']! as JsonMap));
          expectJson(
            {
              'items': [for (final c in result.items) c.id],
              'undecided': [
                for (final u in result.undecided)
                  {
                    'reason': u.reason,
                    'connections': [for (final c in u.connections) c.id],
                  },
              ],
            },
            {'items': expected['items'], 'undecided': expected['undecided']},
            'connectionQuery ${e.key}',
          );
        }
      });
    });
  }
}
