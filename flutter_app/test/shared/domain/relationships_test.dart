// Relationships, ported: agreement with the original app's history and network on both real files and a generated
// court (tool/golden/relationships.test.ts), and its relationship, manager and history tests.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/codex/codex_changes.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:novel_builder/shared/domain/records/relation.dart';
import 'package:novel_builder/shared/domain/relationships/history.dart';
import 'package:novel_builder/shared/domain/relationships/network.dart';
import 'package:novel_builder/shared/domain/relationships/relation_changes.dart';
import 'package:novel_builder/shared/domain/relationships/relation_types.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';

import 'fixtures.dart';
import 'golden.dart';

JsonMap _report(NovelSnapshot s) {
  final model = StoryModel.fromSnapshot(s);
  final chapters = [for (final c in model.order.chapters) c.id];
  final characters = [
    for (final e in model.entries.values)
      if (e.category == 'character') e.id,
  ]..sort();
  final factions = [
    for (final e in model.entries.values)
      if (e.category == 'faction') e.id,
  ]..sort();
  String name(String id) => model.entries[id]?.name ?? '?';
  const attributes = [TrackedAttribute('trust', 'Trust')];
  final timelines = {
    for (final r in model.relations.values)
      r.id: [
        for (final (i, t) in timelineOf(r, model.order).indexed)
          {
            'stage': t.stage.id,
            'range': t.range,
            'orphaned': t.orphaned,
            'changes': stageDifferences(
              i == 0 ? null : timelineOf(r, model.order)[i - 1].stage,
              t.stage,
              fromName: name(r.fromId),
              toName: name(r.toId),
              attributes: attributes,
            ),
          },
      ],
  };
  final whens = <String, When>{
    'current': const Now(),
    'ever': const Ever(),
    if (chapters.length > 2) ...{
      'at3': AsOf(chapters[2]),
      'range': Across(chapters.length > 1 ? chapters[1] : null, chapters.length > 3 ? chapters[3] : null),
    },
  };
  final filters = <String, NetworkFilter>{
    'all': const NetworkFilter(),
    'ever': const NetworkFilter(when: Ever()),
    'isolated': const NetworkFilter(isolated: true),
    'friends': const NetworkFilter(type: 'friends'),
    'noSocial': const NetworkFilter(hidden: {Layer.social, Layer.connection}),
    'faction': NetworkFilter(factionId: factions.firstOrNull),
    'focus1': NetworkFilter(focus: characters.isEmpty ? null : (id: characters.first, depth: 1)),
    'focus2': NetworkFilter(focus: characters.isEmpty ? null : (id: characters.first, depth: 2)),
    if (chapters.length > 2) 'at3': NetworkFilter(when: AsOf(chapters[2])),
  };
  return {
    'timelines': timelines,
    'shown': {
      for (final MapEntry(key: k, value: w) in whens.entries)
        k: {for (final r in model.relations.values) r.id: stageShown(r, model, w)?.id},
    },
    'networks': {
      for (final MapEntry(key: k, value: f) in filters.entries)
        k: () {
          final net = relationNetwork(model, f);
          return {
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
                  'category': e.category?.name ?? 'connection',
                  'affinity': e.affinity?.name,
                  'stage': e.stage?.id,
                  'range': e.range,
                },
            ],
            'total': net.total,
            'hidden': net.hidden,
          };
        }(),
    },
  };
}

class Novel {
  NovelSnapshot s = NovelSnapshot(project: {'id': 'novel', 'title': 'Ties'}, collections: const {});
  int clock = 1000;
  int _ids = 0;

  T act<T>(T Function(RelationChanges c) change) {
    final c = RelationChanges(s, now: ++clock, createId: () => 'id${++_ids}');
    final r = change(c);
    s = c.snapshot;
    return r;
  }

  void chapter(String id, num order) => s = s.putRow('chapters', {
    'id': id,
    'projectId': 'novel',
    'parentId': null,
    'kind': 'chapter',
    'title': id,
    'order': order,
    'createdAt': order,
  });

  CharacterRelation relation(String id) =>
      CharacterRelation(s.rows('characterRelations').firstWhere((r) => r['id'] == id));
}

void main() {
  group('agrees with the original app', () {
    final golden = readGolden('relationships.golden.json');
    for (final name in fixtureNames) {
      test('on $name', () => expectJson(_report(loadFixture(name)), golden[name], name));
    }
    test('on a court of 40 characters and 120 relationships with histories', () {
      final court = NovelSnapshot.fromJson(jsonDecode(File('test/fixtures/court.novel.json').readAsStringSync()));
      expectJson(_report(court), golden['court'], 'court');
    });
  });

  group('a relationship’s history', () {
    test('changing how it stands never erases how it stood; a correction changes only that stage', () {
      final w = Novel();
      for (final (i, c) in ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'].indexed) {
        w.chapter(c, i);
      }
      final kael = w.act((c) => c.create(name: 'Kael')).id;
      final mira = w.act((c) => c.create(name: 'Mira')).id;
      final rel = w.act((c) => c.createRelation(kael, mira)).id;
      List<JsonMap> snapshot() => [for (final s in w.relation(rel).stages) s.raw];
      final before = snapshot();
      w.act(
        (c) => c.recordChange(
          rel,
          nodeId: 'c3',
          changes: const StageInput(preset: 'rivals'),
        ),
      );
      expect(jsonEquals(snapshot().first, before.first), isTrue);
      final afterRivals = snapshot();
      w.act((c) => c.recordChange(rel, unknown: true, changes: const StageInput(preset: 'enemies')));
      w.act(
        (c) => c.recordChange(
          rel,
          nodeId: 'c6',
          changes: const StageInput(preset: 'allies', affinity: Affinity.trusting),
        ),
      );
      for (final (i, s) in afterRivals.indexed) {
        expect(jsonEquals(snapshot()[i], s), isTrue, reason: 'stage $i untouched');
      }
      final model = StoryModel.fromSnapshot(w.s);
      expect(
        [for (final t in timelineOf(w.relation(rel), model.order)) t.range],
        ['Chapters 1–2', 'From chapter 3', 'Stage 3, chapter not said', 'Chapter 6+'],
      );
      // A correction to one stage changes only it.
      final third = w.relation(rel).stages[2].id;
      final others = [
        for (final s in snapshot())
          if (s['id'] != third) s,
      ];
      w.act((c) => c.updateStage(rel, third, const StageInput(title: 'The long feud')));
      expect(
        jsonEquals([
          for (final s in snapshot())
            if (s['id'] != third) s,
        ], others),
        isTrue,
      );
    });

    test('a change whose chapter is not said is never assumed begun at a chapter, and can be moved', () {
      final w = Novel();
      w.chapter('c1', 0);
      w.chapter('c2', 1);
      final a = w.act((c) => c.create(name: 'A')).id;
      final b = w.act((c) => c.create(name: 'B')).id;
      final rel = w.act((c) => c.createRelation(a, b)).id;
      final unknown = w.act((c) => c.addStage(rel, null, unknown: true)).id;
      final model = StoryModel.fromSnapshot(w.s);
      final r = w.relation(rel);
      expect(stageShown(r, model, const AsOf('c2'))!.preset, 'friends');
      expect(stageShown(r, model, const Now())!.id, unknown, reason: 'at the end of the story it counts');
      w.act((c) => c.moveStage(rel, unknown, -1));
      expect(w.relation(rel).stages.first.id, unknown);
    });

    test('what brought a change about is only what the author names, and must exist', () {
      final w = Novel();
      final a = w.act((c) => c.create(name: 'A')).id;
      final b = w.act((c) => c.create(name: 'B')).id;
      w.s = w.s.putRow('timelineEvents', {'id': 'betrayal', 'projectId': 'novel', 'name': 'The betrayal'});
      final rel = w.act((c) => c.createRelation(a, b)).id;
      final stage = w.act(
        (c) => c.recordChange(
          rel,
          changes: const StageInput(preset: 'enemies', storyEventId: (value: 'betrayal')),
        ),
      );
      expect(stage.storyAt, {'kind': 'event', 'eventId': 'betrayal'});
      expect([stage.causeEventId, stage.causeNodeId, stage.event], [null, null, ''], reason: 'not inferred');
      expect(
        () => w.act((c) => c.updateStage(rel, stage.id, const StageInput(causeEventId: (value: 'nowhere')))),
        throwsA(isA<ChangeRefused>()),
      );
    });
  });

  group('creating, types and attributes', () {
    test('links two characters; refuses itself, a second record for the pair either way, and non-characters', () {
      final w = Novel();
      final a = w.act((c) => c.create(name: 'Orrin')).id;
      final b = w.act((c) => c.create(name: 'Mira')).id;
      final keep = w.act((c) => c.createEntry('location', 'Keep')).id;
      final rel = w.act((c) => c.createRelation(a, b, 'mentor-student'));
      expect(
        [rel.stages.single.label, rel.stages.single.fromRole, rel.stages.single.directional],
        ['Mentor / Student', 'Mentor', true],
      );
      expect(() => w.act((c) => c.createRelation(a, a)), throwsA(isA<ChangeRefused>()));
      expect(() => w.act((c) => c.createRelation(b, a)), throwsA(isA<ChangeRefused>()));
      expect(() => w.act((c) => c.createRelation(a, keep)), throwsA(isA<ChangeRefused>()));
      w.act((c) => c.reverse(rel.id));
      expect([w.relation(rel.id).fromId, w.relation(rel.id).toId], [b, a]);
    });

    test(
      'types of the novel’s own: checked, used like built-ins, re-word their stages; deleted, stages keep wording',
      () {
        final w = Novel();
        final a = w.act((c) => c.create(name: 'A')).id;
        final b = w.act((c) => c.create(name: 'B')).id;
        Matcher refused(String words) =>
            throwsA(isA<ChangeRefused>().having((e) => e.message, 'message', contains(words)));
        expect(() => w.act((c) => c.saveType(label: ' ')), refused('name'));
        expect(() => w.act((c) => c.saveType(label: 'friends')), refused('already a type'));
        expect(
          () => w.act((c) => c.saveType(label: 'Liege', directional: true, fromRole: 'Lord')),
          refused('both roles'),
        );
        final oath = w.act(
          (c) => c.saveType(
            label: 'Sworn',
            category: RelationCategory.hierarchy,
            directional: true,
            fromRole: 'Liege',
            toRole: 'Sworn',
          ),
        );
        final rel = w.act((c) => c.createRelation(a, b, oath.key)).id;
        expect(w.relation(rel).stages.single.label, 'Sworn');
        w.act((c) => c.saveType(typeId: oath.id, label: 'Oathbound'));
        expect(w.relation(rel).stages.single.label, 'Oathbound');
        w.act((c) => c.removeType(oath.id));
        final stage = w.relation(rel).stages.single;
        expect([stage.preset, stage.label, stage.fromRole], ['custom', 'Oathbound', 'Liege']);
      },
    );

    test('attributes: none until chosen, each way 0–10, carried into a new stage, kept when untracked', () {
      final w = Novel();
      final a = w.act((c) => c.create(name: 'A')).id;
      final b = w.act((c) => c.create(name: 'B')).id;
      final rel = w.act((c) => c.createRelation(a, b)).id;
      final first = w.relation(rel).stages.single.id;
      StageInput trust({int? from, int? to}) =>
          StageInput(attributes: {'trust': (from: from, to: to, setFrom: from != null, setTo: to != null)});
      expect(() => w.act((c) => c.updateStage(rel, first, trust(from: 3))), throwsA(isA<ChangeRefused>()));
      w.act((c) => c.trackAttribute('trust'));
      expect(() => w.act((c) => c.updateStage(rel, first, trust(from: 11))), throwsA(isA<ChangeRefused>()));
      w.act((c) => c.updateStage(rel, first, trust(from: 8)));
      w.act((c) => c.updateStage(rel, first, trust(to: 2)));
      expect(w.relation(rel).stages.single.attribute('trust'), (from: 8, to: 2));
      final second = w.act((c) => c.addStage(rel, null));
      expect(second.attribute('trust'), (from: 8, to: 2), reason: 'as things stood');
      w.act((c) => c.untrackAttribute('trust'));
      expect(w.relation(rel).stages.first.attribute('trust'), (from: 8, to: 2));
    });
  });

  test('the layout is the same every time and keeps everyone apart, on the court', () {
    final court = NovelSnapshot.fromJson(jsonDecode(File('test/fixtures/court.novel.json').readAsStringSync()));
    final model = StoryModel.fromSnapshot(court);
    final net = relationNetwork(model);
    final watch = Stopwatch()..start();
    final first = layoutNetwork(net.nodes, net.edges);
    expect(watch.elapsed, lessThan(const Duration(seconds: 5)));
    expect(layoutNetwork(net.nodes, net.edges), first);
    final points = first.values.toList();
    for (var i = 0; i < points.length; i++) {
      for (var j = i + 1; j < points.length; j++) {
        final dx = points[i].x - points[j].x;
        final dy = points[i].y - points[j].y;
        expect(dx * dx + dy * dy, greaterThan(10 * 10), reason: 'no two characters on top of each other');
      }
    }
  });
}
