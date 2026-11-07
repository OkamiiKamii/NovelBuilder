import 'dart:convert';
import 'dart:io';

import 'package:archive/archive.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/exchange/exchange_service.dart';
import 'package:novel_builder/features/write/data/manuscript_service.dart';
import 'package:novel_builder/shared/data/backup_service.dart';
import 'package:novel_builder/shared/data/database.dart';
import 'package:novel_builder/shared/data/draft_store.dart';
import 'package:novel_builder/shared/data/library_service.dart';
import 'package:novel_builder/shared/data/novel_store.dart';
import 'package:novel_builder/shared/domain/exchange/compile.dart';
import 'package:novel_builder/shared/domain/exchange/import_parse.dart';
import 'package:novel_builder/shared/domain/exchange/import_structure.dart';
import 'package:novel_builder/shared/domain/exchange/render_pdf.dart';
import 'package:novel_builder/shared/domain/integrity/rules.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/manuscript/outline.dart' show OutlineException;
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:novel_builder/shared/domain/records/novel.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';

import '../../shared/domain/fixtures.dart';

void main() {
  late AppDatabase db;
  late NovelStore store;
  late BackupService backups;
  late ManuscriptService manuscript;
  late ExchangeService exchange;
  final now = DateTime(2026, 10, 25, 9);

  setUp(() {
    db = AppDatabase.inMemory();
    store = NovelStore(db, clock: () => now);
    backups = BackupService(store, RestorePointStore(db, clock: () => now), clock: () => now);
    manuscript = ManuscriptService(store, DraftStore(db, clock: () => now), backups, clock: () => now);
    exchange = ExchangeService(store, manuscript);
  });
  tearDown(() => db.close());

  String stored(String name) {
    final snapshot = loadFixture(name);
    store.putNovel(snapshot);
    return snapshot.projectId;
  }

  group('exporting a manuscript', () {
    test('makes every format from a real novel, each a file of its kind', () async {
      final id = stored('qa-sample');
      final compiled = exchange.compile(id, ExportOptions.reader);
      final docx = await exchange.render(compiled, ExportFormat.docx);
      final parts = {for (final f in ZipDecoder().decodeBytes(docx).files) f.name};
      expect(parts, containsAll(['word/document.xml', 'word/styles.xml', '[Content_Types].xml', 'docProps/core.xml']));
      final pdf = await exchange.render(compiled, ExportFormat.pdf);
      expect(latin1.decode(pdf.sublist(0, 5)), '%PDF-');
      expect(utf8.decode(await exchange.render(compiled, ExportFormat.html)), startsWith('<!doctype html>'));
      expect(utf8.decode(await exchange.render(compiled, ExportFormat.md)), startsWith('# QA Sample'));
      expect(utf8.decode(await exchange.render(compiled, ExportFormat.txt)), startsWith('QA SAMPLE'));
      expect(compiled.wordCount, greaterThan(0));
    });

    test('a PDF holds the text, starts each chapter on a new page and numbers its pages', () async {
      final id = stored('qa-sample');
      final compiled = exchange.compile(id, ExportOptions.reader);
      final raw = latin1.decode(await renderPdf(compiled, compress: false));
      final pages = RegExp(r'/Type\s*/Page\b').allMatches(raw).length;
      expect(
        pages,
        greaterThanOrEqualTo(compiled.chapterCount + 1),
        reason: 'a title page, then a page at least per chapter',
      );
      expect(raw, contains('(2)'), reason: 'page 2 is numbered');
      final firstWords = ((compiled.blocks.whereType<ParagraphBlock>().firstWhere(
        (b) => b.text.trim().length > 20,
      )).text.split(' ').take(2)).join(' ');
      expect(raw, contains(firstWords));
    });

    test(
      'a PDF draws curly quotes, dashes and the ellipsis, and refuses text its fonts cannot draw rather than lose letters',
      () async {
        const fine = Compiled(
          title: 'T',
          author: '',
          blocks: [
            ParagraphBlock([Run('“Not yet,” she said — and waited…')]),
          ],
          wordCount: 6,
          chapterCount: 0,
        );
        expect(latin1.decode(await renderPdf(fine, compress: false)), contains('Not yet'));
        const greek = Compiled(
          title: 'T',
          author: '',
          blocks: [
            ParagraphBlock([Run('Καλημέρα, Мира')]),
          ],
          wordCount: 2,
          chapterCount: 0,
        );
        expect(pdfCanDraw(pdfTextOf(greek)), isFalse);
        await expectLater(
          renderPdf(greek),
          throwsA(isA<PdfCannotDraw>().having((e) => '$e', 'says', allOf(contains('Κ'), contains('Word')))),
        );
      },
    );

    test('one part of the book can be exported on its own, under its own file name', () {
      final id = stored('qa-sample');
      final part = exchange.scopes(id).firstWhere((t) => t.children.isNotEmpty);
      final compiled = exchange.compile(id, ExportOptions.reader.copyWith(scopeId: () => part.node.id));
      expect((compiled.blocks.first as HeadingBlock).text, endsWith(': ${part.node.title}'));
      expect(compiled.chapterCount, lessThan(exchange.compile(id, ExportOptions.reader).chapterCount + 1));
      final novel = store.novel(id)!;
      expect(
        ExchangeService.fileName(novel, ExportFormat.docx, part: part.node.title),
        '${novel.title.replaceAll(':', '')} - ${part.node.title.replaceAll(':', '')}.docx',
      );
      expect(ExchangeService.fileName(Novel({'id': 'x', 'title': ' A/B: C? '}), ExportFormat.pdf), 'AB C.pdf');
    });

    test('revision history goes in only when asked for, with each saved version listed', () {
      final id = stored('made-in-the-app');
      final without = exchange.compile(id, ExportOptions.bible);
      expect(without.blocks.whereType<HeadingBlock>().any((h) => h.text == 'Revision history'), isFalse);
      final withHistory = exchange.compile(id, ExportOptions.bible.copyWith(history: true));
      expect(withHistory.blocks.whereType<HeadingBlock>().any((h) => h.text == 'Revision history'), isTrue);
      final listed = withHistory.blocks
          .whereType<ListBlock>()
          .expand((l) => l.items)
          .where((i) => i.contains(' words — '));
      // Versions of chapters deleted since are left out, as the original leaves them out.
      final fixture = loadFixture('made-in-the-app');
      final live = {for (final r in fixture.rows('chapters')) r['id']};
      expect(listed.length, fixture.rows('chapterRevisions').where((r) => live.contains(r['nodeId'])).length);
      expect(listed, isNotEmpty);
    });

    test('private notes reach the file only through their switch', () {
      final snapshot = loadFixture('qa-sample');
      final chapter = snapshot.rows('chapters').firstWhere((r) => r['kind'] == 'chapter');
      store.putNovel(snapshot.putRow('chapters', {...chapter, 'notes': 'SECRET NOTE'}));
      String all(ExportOptions o) => jsonEncode(exchange.compile(snapshot.projectId, o).toJson());
      expect(all(ExportOptions.reader), isNot(contains('SECRET NOTE')));
      expect(all(ExportOptions.bible), contains('SECRET NOTE'));
    });
  });

  group('importing a manuscript', () {
    late String p;
    setUp(() {
      p = 'novel';
      store.putNovel(NovelSnapshot(project: {'id': p, 'title': 'T'}, collections: const {}));
      manuscript.create(p, NodeKind.chapter, title: 'Already here');
    });

    test('adds what a file holds after what is there, text and formatting intact, and changes nothing else', () {
      final blocks = exchange.read('novel.md', File('test/fixtures/exchange/novel.md').readAsBytesSync());
      final nodes = buildStructure(blocks, const ImportOptions(fallbackTitle: 'novel'));
      final before = [for (final n in manuscript.nodes(p)) n.toJson()];
      final created = exchange.importNodes(p, null, nodes);
      final all = manuscript.nodes(p);
      expect(created.length, all.length - 1);
      for (final n in before) {
        expect(all.firstWhere((x) => x.id == n['id']).toJson(), n, reason: 'what was there is untouched');
      }
      final top = all.where((n) => n.parentId == null).toList()..sort((a, b) => a.order.compareTo(b.order));
      expect(top.first.title, 'Already here');
      expect(
        [for (final n in top.skip(1)) '${n.kindKey}: ${n.title}'],
        // The structure the original app makes of this file (see exchange_agreement_test.dart).
        ['volume: The Ember Crown', 'chapter: Chapter 2', 'volume: Part Two: Embers'],
      );
      final chapter1 = all.firstWhere((n) => n.title == 'Chapter 1');
      final scene = all.firstWhere((n) => n.parentId == chapter1.id && n.kind == NodeKind.scene);
      final doc = mapOrNull(store.row(p, 'chapterContents', scene.id)?['doc'])!;
      expect(
        jsonEncode(doc),
        allOf(contains('"bold"'), contains('"italic"'), contains('blockquote'), contains('black gate')),
      );
      expect(scene.wordCount, measureDoc(doc).words);
      expect(scene.status, NodeStatus.drafting);
    });

    test('a structure that cannot go where asked is refused whole: nothing is added', () {
      final chapter = manuscript.nodes(p).single;
      final nodes = buildStructure(
        parseMarkdown(File('test/fixtures/exchange/novel.md').readAsStringSync()),
        const ImportOptions(fallbackTitle: 'x'),
      );
      final before = jsonEncode(store.load(p)!.toJson());
      expect(() => exchange.importNodes(p, chapter.id, nodes), throwsA(isA<OutlineException>()));
      expect(jsonEncode(store.load(p)!.toJson()), before);
    });

    test('a Word file this app exported comes back as the same chapters with the same paragraphs', () async {
      final id = stored('qa-sample');
      final source = store.load(id)!;
      final docx = await exchange.render(exchange.compile(id, ExportOptions.reader), ExportFormat.docx);
      final nodes = buildStructure(exchange.read('back.docx', docx), const ImportOptions(fallbackTitle: 'back'));
      exchange.importNodes(p, null, nodes);
      final model = StoryModel.fromSnapshot(source);
      final texts = {
        for (final n in model.nodes.values)
          if (n.kind == NodeKind.chapter || n.kind == NodeKind.scene)
            for (final t in blockTexts(
              source.rows('chapterContents').where((r) => r['id'] == n.id).firstOrNull?['doc'],
            ))
              if (t.trim().isNotEmpty) t,
      };
      final imported = {
        for (final r in store.rowsIn(p, 'chapterContents'))
          for (final t in blockTexts(r['doc'])) t,
      };
      expect(texts.difference(imported), isEmpty, reason: 'every paragraph of the original text came back');
      final chapterTitles = {
        for (final n in model.nodes.values)
          if (n.kind == NodeKind.chapter) n.title,
      };
      expect(chapterTitles.difference({for (final n in manuscript.nodes(p)) n.title}), isEmpty);
    });

    test('a file that is not a manuscript says why, and nothing is added', () {
      expect(() => exchange.read('old.doc', [1, 2, 3]), throwsA(isA<ImportException>()));
      expect(() => exchange.read('broken.docx', utf8.encode('nope')), throwsA(isA<ImportException>()));
      expect(manuscript.nodes(p).length, 1);
    });
  });

  group('full backups', () {
    test(
      'every fixture novel round-trips exactly: every record, field, link, history, alternate history and saved view',
      () {
        for (final name in ['qa-sample', 'made-in-the-app', 'chronicle', 'growth', 'canon', 'world', 'kinds']) {
          var snapshot = loadFixture(name);
          snapshot = snapshot.putRow('savedViews', {
            'id': 'saved-view-1',
            'projectId': snapshot.projectId,
            'view': 'timeline',
            'name': 'Act one',
            'filter': {'text': 'gate'},
            'config': {'scale': 'months'},
          });
          store.putNovel(snapshot);
          final text = backups.exportBackup(snapshot.projectId);
          final preview = backups.previewImport(text);
          final original = store.load(snapshot.projectId)!.toJson()..remove('exportedAt');
          final back = preview.snapshot.toJson()..remove('exportedAt');
          expect(jsonEncode(back), jsonEncode(original), reason: '$name comes back exactly');
          expect(preview.changes, isEmpty, reason: '$name: replacing a novel with its own backup changes nothing');
          final links = brokenReferences(StoryModel.fromSnapshot(store.load(snapshot.projectId)!)).length;
          expect(preview.problems.length, links, reason: '$name: the same references, intact');
        }
      },
    );

    test('importing as a copy keeps every link, pointing at the copy\'s own records', () {
      final id = stored('made-in-the-app');
      final library = LibraryService(store, backups, clock: () => now);
      final copy = library.importAsCopy(backups.previewImport(backups.exportBackup(id)));
      final a = StoryModel.fromSnapshot(store.load(id)!);
      final b = StoryModel.fromSnapshot(store.load(copy.id)!);
      expect(
        [b.links.length, b.relations.length, b.events.length, b.entries.length],
        [a.links.length, a.relations.length, a.events.length, a.entries.length],
      );
      expect(brokenReferences(b).length, brokenReferences(a).length);
      expect(b.entries.keys.toSet().intersection(a.entries.keys.toSet()), isEmpty);
    });

    test('before replacing a novel, says per kind what would be added, changed and removed', () {
      final id = stored('qa-sample');
      final backup = backups.exportBackup(id);
      final s = store.load(id)!;
      final chapter = s.rows('chapters').first;
      final event = s.rows('timelineEvents').first;
      store.putNovel(
        s
            .putRow('chapters', {...chapter, 'title': 'Renamed since'})
            .putRow('loreEntries', {'id': 'new-entry', 'projectId': id, 'category': 'character', 'name': 'Newcomer'})
            .withRows('timelineEvents', [
              for (final r in s.rows('timelineEvents'))
                if (r['id'] != event['id']) r,
            ]),
      );
      final changes = backups.previewImport(backup).changes;
      expect(changes.keys.toSet(), {'chapters', 'loreEntries', 'timelineEvents'});
      expect([changes['chapters']!.changed, changes['chapters']!.added, changes['chapters']!.removed], [1, 0, 0]);
      expect(
        [changes['loreEntries']!.removed, changes['loreEntries']!.added],
        [1, 0],
        reason: 'the entry made since would go',
      );
      expect(
        [changes['timelineEvents']!.added, changes['timelineEvents']!.removed],
        [1, 0],
        reason: 'the deleted event would come back',
      );
    });

    test('references in a file that name nothing are reported before importing, and kept as they are', () {
      final s = loadFixture('qa-sample');
      final broken = s.putRow('loreLinks', {
        'id': 'stray-link',
        'projectId': s.projectId,
        'fromId': s.rows('loreEntries').first['id'],
        'toId': 'deleted-long-ago',
        'fromLabel': '',
        'toLabel': '',
        'createdAt': 1,
      });
      final preview = backups.previewImport(jsonEncode(broken.toJson()));
      expect(preview.problems.length, brokenReferences(StoryModel.fromSnapshot(s)).length + 1);
      backups.importBackup(preview);
      expect(store.row(s.projectId, 'loreLinks', 'stray-link'), isNotNull, reason: 'nothing is dropped on the way in');
    });

    test('an older file says which version it was, and is upgraded as it is read', () {
      final json = fixtureJson('qa-sample')! as JsonMap;
      expect(backups.previewImport(jsonEncode({...json, 'version': 2})).fromVersion, 2);
      expect(backups.previewImport(jsonEncode(json)).fromVersion, 4);
    });

    test('an import that fails part way leaves the library exactly as it was', () {
      final id = stored('qa-sample');
      final before = jsonEncode(store.load(id)!.toJson());
      final s = store.load(id)!;
      // A record that cannot be written (not a number JSON can hold) after many that can.
      final failing = s.putRow('timelineEvents', {
        'id': 'zzz-last',
        'projectId': id,
        'name': 'Broken',
        'order': double.nan,
      });
      expect(() => backups.importBackup(ImportPreview(failing, store.novel(id), stored: s)), throwsA(anything));
      expect(jsonEncode(store.load(id)!.toJson()), before);
      expect(
        () => backups.previewImport('{"format": "novel-builder/project", "version": 99}'),
        throwsA(isA<SnapshotException>()),
      );
      expect(store.listNovels().length, 1);
    });
  });
}
