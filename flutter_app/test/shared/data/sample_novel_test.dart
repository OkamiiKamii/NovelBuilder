import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/bootstrap.dart';
import 'package:novel_builder/core/errors/error_log.dart';
import 'package:novel_builder/shared/data/database.dart';
import 'package:novel_builder/shared/data/novel_store.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';
import 'package:novel_builder/shared/data/sample_novel_text.dart';
import 'package:novel_builder/shared/data/settings_store.dart';
import 'package:novel_builder/shared/domain/integrity/rules.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';

const _now = 1792710000000;

void main() {
  final s = sampleNovel(now: _now);
  List<JsonMap> rows(String c) => s.rows(c);

  test('fifteen chapters in three parts, each with its text, summary, status and counted words', () {
    final volumes = [
      for (final r in rows('chapters'))
        if (r['kind'] == 'volume') StoryNode(r),
    ]..sort((a, b) => a.order.compareTo(b.order));
    expect([for (final v in volumes) v.title], samplePartTitles);
    final chapters = [
      for (final v in volumes)
        ...[
          for (final r in rows('chapters'))
            if (r['parentId'] == v.id) StoryNode(r),
        ]..sort((a, b) => a.order.compareTo(b.order)),
    ];
    expect(chapters, hasLength(15));
    expect(chapters.every((c) => c.kind == NodeKind.chapter), isTrue);
    expect([for (final c in chapters) c.title], [for (final c in sampleChapters) c.title]);

    var total = 0;
    for (final (i, c) in chapters.indexed) {
      final content = rows('chapterContents').firstWhere((r) => r['id'] == c.id);
      final paragraphs = blockTexts(content['doc']);
      expect(paragraphs, sampleParagraphs(sampleChapters[i].text), reason: c.title);
      expect(paragraphs.every((p) => p.isNotEmpty && p == p.trim()), isTrue, reason: '${c.title}: no empty lines');
      expect(c.wordCount, measureDoc(content['doc']).words, reason: '${c.title}: its count is its text’s');
      expect(c.wordCount, inInclusiveRange(350, 1000), reason: c.title);
      expect(c.summary, isNotEmpty, reason: c.title);
      total += c.wordCount;
    }
    expect(total, inInclusiveRange(9000, 11500));
    expect(
      {for (final c in chapters) c.status},
      {NodeStatus.finalDraft, NodeStatus.revising, NodeStatus.draftComplete},
    );
    // The sample is not anybody's writing: no sessions, so no words today and no streak.
    expect(rows('writingSessions'), isEmpty);
    expect(rows('chapterRevisions'), isEmpty);
  });

  test('its people, places, things, ties, threads, plans and timeline are all filled in, and point at each other', () {
    String name(String id) => str(rows('loreEntries').firstWhere((e) => e['id'] == id)['name']);
    final byCategory = <String, List<String>>{};
    for (final e in rows('loreEntries')) {
      byCategory.putIfAbsent(str(e['category']), () => []).add(str(e['name']));
      expect(str(e['summary']), isNotEmpty, reason: str(e['name']));
    }
    expect(byCategory['character'], containsAll(['Wren Hollis', 'Ilse Marrow', 'Tobiah Fenn', 'Aldous Crane']));
    expect(byCategory['character'], hasLength(8));
    expect(byCategory['location'], hasLength(8));
    expect(byCategory['faction'], hasLength(3));
    expect(byCategory['item'], hasLength(4));
    expect(rows('characterProfiles'), hasLength(8), reason: 'each with a profile and a role');
    expect(rows('loreLinks'), hasLength(19));

    final relations = rows('characterRelations');
    expect(relations, hasLength(6));
    expect(relations.where((r) => maps(r['stages']).length == 2), hasLength(3), reason: 'three of them change');

    final threads = rows('plotThreads');
    expect([for (final t in threads) t['title']], contains('Charting the Drowned Road'));
    expect(threads, hasLength(5));
    final chapterIds = {
      for (final r in rows('chapters'))
        if (r['kind'] == 'chapter') r['id'],
    };
    for (final t in threads) {
      expect(maps(t['beats']), isNotEmpty);
      expect(maps(t['beats']).every((b) => chapterIds.contains(b['nodeId'])), isTrue, reason: str(t['title']));
    }

    final plans = rows('chapterPlans');
    expect({for (final p in plans) p['id']}, chapterIds, reason: 'a plan for every chapter');
    for (final p in plans) {
      expect(str(p['objective']), isNotEmpty);
      expect(maps(p['beats']), isNotEmpty);
      expect([for (final id in strings(p['povIds'])) name(id)], ['Wren Hollis']);
    }

    final events = rows('timelineEvents');
    expect(events, hasLength(14));
    for (final e in events) {
      expect(mapOrNull(e['when'])?['precision'], 'exact', reason: str(e['name']));
      expect(strings(e['nodeIds']), isNotEmpty, reason: str(e['name']));
      expect(e['locationId'], isNotNull, reason: str(e['name']));
    }

    expect(brokenReferences(StoryModel.fromSnapshot(s)), isEmpty);
  });

  test('a backup of it reads back the same; a second copy shares nothing with the first', () {
    final text = jsonEncode(s.toJson(exportedAt: _now));
    final back = NovelSnapshot.fromJson(jsonDecode(text));
    expect(jsonEncode(back.toJson(exportedAt: _now)), text);

    final again = sampleNovel(now: _now, title: 'The Drowned Road (2)');
    expect(again.projectId, isNot(s.projectId));
    Set<String> ids(NovelSnapshot n) => {
      for (final c in n.collections.values)
        for (final r in c) str(r['id']),
    };
    expect(ids(again).intersection(ids(s)), isEmpty);
    expect(again.project['title'], 'The Drowned Road (2)');
  });

  group('on the first start', () {
    late AppDatabase db;
    late NovelStore store;
    late SettingsStore settings;
    setUp(() {
      db = AppDatabase.inMemory();
      store = NovelStore(db);
      settings = SettingsStore(db);
    });
    tearDown(() {
      store.dispose();
      db.close();
    });

    test('an empty library gets the sample, once; deleted, it stays deleted', () {
      final added = addSampleNovelOnFirstStart(store, settings, now: _now);
      expect(added?.title, sampleNovelTitle);
      expect([for (final n in store.listNovels()) n.title], [sampleNovelTitle]);
      expect(store.load(added!.id)!.rows('chapters').where((r) => r['kind'] == 'chapter'), hasLength(15));

      expect(addSampleNovelOnFirstStart(store, settings, now: _now), isNull);
      expect(store.listNovels(), hasLength(1));

      store.deleteNovel(added.id);
      expect(addSampleNovelOnFirstStart(store, settings, now: _now), isNull);
      expect(store.listNovels(), isEmpty);
    });

    test('a library that already holds novels is left exactly as it is', () {
      final own = sampleNovel(now: _now, title: 'My own book');
      store.putNovel(own);
      final before = jsonEncode(store.load(own.projectId)!.toJson(exportedAt: 0));

      expect(addSampleNovelOnFirstStart(store, settings, now: _now), isNull);
      expect([for (final n in store.listNovels()) n.title], ['My own book']);
      expect(jsonEncode(store.load(own.projectId)!.toJson(exportedAt: 0)), before);
      expect(settings.read(sampleNovelSetting), isNotNull, reason: 'and it is not offered again by itself');
    });

    test('the app’s start adds it to an empty library, and starts all the same if that fails', () {
      welcomeWithSample(db);
      expect([for (final n in store.listNovels()) n.title], [sampleNovelTitle]);

      final broken = AppDatabase.inMemory()..close();
      final errors = ErrorLog.instance.entries.length;
      expect(() => welcomeWithSample(broken), returnsNormally);
      expect(ErrorLog.instance.entries.length, errors + 1);
    });
  });
}
