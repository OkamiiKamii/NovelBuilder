import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/backup_files.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';

import '../../helpers/pump_app.dart';
import '../../shared/domain/fixtures.dart';

const tall = Size(1400, 3000);

Future<({ProviderContainer c, String novel, FakeBackupFiles files})> openFixture(
  WidgetTester tester, {
  Size size = tall,
  String location = '/settings/import-export',
  String name = 'qa-sample',
}) async {
  final files = FakeBackupFiles();
  final c = await pumpApp(tester, size: size, location: location, files: files);
  final snapshot = loadFixture(name);
  c.read(novelStoreProvider).putNovel(snapshot);
  c.read(openNovelProvider.notifier).open(snapshot.projectId);
  await tester.pumpAndSettle();
  return (c: c, novel: snapshot.projectId, files: files);
}

Future<void> tapText(WidgetTester tester, String text) async {
  // The page is a lazily built list: on a small screen a button further down is built, and on screen, only once
  // scrolled to.
  final visible = find.text(text).hitTestable();
  if (visible.evaluate().isEmpty) {
    // From the top, downwards: it may be above or below where the page was left.
    final list = find.byType(Scrollable).last;
    tester.state<ScrollableState>(list).position.jumpTo(0);
    await tester.pumpAndSettle();
    if (visible.evaluate().isEmpty) await tester.scrollUntilVisible(visible, 200, scrollable: list);
  }
  await tester.tap(visible.last);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('with no novel open, the page offers backups and says what else needs a novel', (tester) async {
    await pumpApp(tester, location: '/settings');
    await tapText(tester, 'Open Import & export');
    expect(find.text('Import & export'), findsWidgets);
    expect(find.textContaining('Open a novel from the Library'), findsOneWidget);
    expect(find.text('Import a backup…'), findsOneWidget);
    expect(find.text('Export manuscript…'), findsNothing);
    expect(find.textContaining('Nothing is uploaded'), findsOneWidget);
  });

  testWidgets('exporting the manuscript: presets, switches, a Word file, and one part on its own', (tester) async {
    final w = await openFixture(tester);
    await tapText(tester, 'Export manuscript…');
    expect(find.text('Export manuscript'), findsOneWidget);
    CheckboxListTile box(String label) => tester.widget(find.widgetWithText(CheckboxListTile, label));
    expect(
      [box('Manuscript content').value, box('Author private notes').value, box('Chapter/scene planning sheets').value],
      [true, false, false],
    );
    await tapText(tester, 'Complete bible');
    expect(
      [
        box('Author private notes').value,
        box('Worldbuilding & lore profiles').value,
        box('Chapter/scene planning sheets').value,
      ],
      [true, true, true],
    );
    await tapText(tester, 'Clean reader manuscript');
    expect(find.textContaining('6 chapters · 228 words of manuscript'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Export Word document'));
    await tester.pumpAndSettle();
    final saved = w.files.savedFiles.single;
    expect([saved.name, saved.kind], ['QA Sample The Glass Meridian (test data).docx', FileKind.docx]);
    expect(saved.bytes.sublist(0, 2), [0x50, 0x4b], reason: 'a Word document is a zip file');
    expect(find.textContaining('Nothing in the novel changed'), findsOneWidget);

    await tester.tap(find.widgetWithText(DropdownButtonFormField<String?>, 'Whole manuscript'));
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining('Act I:').last);
    await tester.pumpAndSettle();
    expect(find.textContaining('3 chapters'), findsOneWidget);
    await tapText(tester, 'Plain text (.txt)');
    await tester.tap(find.widgetWithText(FilledButton, 'Export text'));
    await tester.pumpAndSettle();
    expect(w.files.savedFiles.last.name, endsWith(' - Act I The Archive.txt'));
    expect(
      utf8.decode(w.files.savedFiles.last.bytes),
      startsWith('QA SAMPLE: THE GLASS MERIDIAN (TEST DATA): ACT I: THE ARCHIVE'),
    );
  });

  testWidgets('a PDF that would lose letters is not made: the dialog says which and offers Word instead', (
    tester,
  ) async {
    final w = await openFixture(tester);
    final store = w.c.read(novelStoreProvider);
    final row = store.rowsIn(w.novel, 'chapterContents').first;
    final s = store.load(w.novel)!;
    store.putNovel(s.putRow('chapterContents', {...row, 'doc': textToDoc('Мира сказала: «Нет».')}));
    await tester.pumpAndSettle();
    await tapText(tester, 'Export manuscript…');
    await tapText(tester, 'PDF (.pdf)');
    expect(find.textContaining('The PDF fonts cannot draw some characters'), findsOneWidget);
    expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Export PDF')).onPressed, isNull);
    await tapText(tester, 'Word (.docx)');
    expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Export Word document')).onPressed, isNotNull);
  });

  testWidgets('importing a manuscript: see what it becomes, change how it splits, cancel or import', (tester) async {
    final w = await openFixture(tester);
    final before = w.c.read(manuscriptServiceProvider).nodes(w.novel).length;
    w.files.manuscriptToPick = (name: 'novel.md', bytes: File('test/fixtures/exchange/novel.md').readAsBytesSync());
    await tapText(tester, 'Choose a file…');
    expect(find.textContaining('Found 3 volumes, 3 chapters, 4 scenes · 85 words.'), findsOneWidget);
    await tester.tap(find.text('Split scenes at scene breaks'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Found 3 volumes, 3 chapters · 85 words.'), findsOneWidget);
    await tapText(tester, 'Cancel');
    expect(w.c.read(manuscriptServiceProvider).nodes(w.novel).length, before, reason: 'cancelling adds nothing');

    await tapText(tester, 'Choose a file…');
    await tester.tap(find.widgetWithText(FilledButton, 'Import'));
    await tester.pumpAndSettle();
    final nodes = w.c.read(manuscriptServiceProvider).nodes(w.novel);
    expect(nodes.length, before + 10);
    expect(find.textContaining('Imported “novel.md”: 10 items added to the manuscript.'), findsOneWidget);
    expect(nodes.where((n) => n.id == w.c.read(selectedNodeProvider)).single.title, 'The Ember Crown');

    w.files.manuscriptToPick = (name: 'old.doc', bytes: utf8.encode('x'));
    await tapText(tester, 'Choose a file…');
    expect(find.text('This file cannot be imported'), findsOneWidget);
    expect(find.textContaining('save it as .docx'), findsOneWidget);
    await tapText(tester, 'OK');
    expect(w.c.read(manuscriptServiceProvider).nodes(w.novel).length, before + 10);
  });

  testWidgets('exporting records: chosen kinds as JSON or a table, private notes only when ticked', (tester) async {
    final w = await openFixture(tester);
    final store = w.c.read(novelStoreProvider);
    final s = store.load(w.novel)!;
    final mira = s.rows('loreEntries').firstWhere((r) => r['category'] == 'character');
    store.putNovel(s.putRow('loreEntries', {...mira, 'notes': 'SECRET NOTE'}));
    await tester.pumpAndSettle();
    await tapText(tester, 'Export records…');
    await tester.tap(find.widgetWithText(FilledButton, 'Export'));
    await tester.pumpAndSettle();
    final json = jsonDecode(utf8.decode(w.files.savedFiles.last.bytes)) as JsonMap;
    expect(
      [json['format'], json['kinds']],
      [
        'novel-builder/records-export',
        ['events', 'characters', 'places', 'threads'],
      ],
    );
    expect(json['notABackup'], contains('It is not a backup'));
    expect(jsonEncode(json), isNot(contains('SECRET NOTE')));
    expect((json['records']! as JsonMap)['characters'], isNotEmpty);
    expect(
      w.files.savedFiles.last.name,
      matches(RegExp(r'^QA-Sample-The-Glass-Meridian-test-data-records-\d{4}-\d\d-\d\d\.json$')),
    );

    await tapText(tester, 'Include private notes (on codex entries, chapters and scenes)');
    await tester.tap(find.widgetWithText(FilledButton, 'Export'));
    await tester.pumpAndSettle();
    expect(utf8.decode(w.files.savedFiles.last.bytes), contains('SECRET NOTE'));

    await tapText(tester, 'Table (CSV)');
    await tester.tap(find.widgetWithText(FilledButton, 'Export'));
    await tester.pumpAndSettle();
    final csv = utf8.decode(w.files.savedFiles.last.bytes);
    // It begins with a byte-order mark, so a spreadsheet reads every script.
    expect(w.files.savedFiles.last.bytes.sublist(0, 3), [0xEF, 0xBB, 0xBF]);
    expect([w.files.savedFiles.last.kind, csv.contains('\r\nCharacters\r\nid,name,')], [FileKind.csv, true]);
  });

  testWidgets('every Visualize view can be exported: its records with its filters, or a picture of it', (tester) async {
    final w = await openFixture(tester, location: '/visualize/timeline');
    await tester.tap(find.byTooltip('Export this view'));
    await tester.pumpAndSettle();
    expect(find.text('Export “Timeline”'), findsOneWidget);
    await tapText(tester, 'Records (JSON)');
    await tester.tap(find.widgetWithText(FilledButton, 'Export'));
    await tester.pumpAndSettle();
    final json = jsonDecode(utf8.decode(w.files.savedFiles.last.bytes)) as JsonMap;
    expect([json['format'], (json['view']! as JsonMap)['key']], ['novel-builder/view-export', 'timeline']);
    expect(
      ((json['records']! as JsonMap)['events']! as List).length,
      loadFixture('qa-sample').rows('timelineEvents').length,
    );

    await tapText(tester, 'Picture (PNG)');
    await tester.runAsync(() async {
      await tester.tap(find.widgetWithText(FilledButton, 'Export'));
      for (var i = 0; i < 50 && w.files.savedFiles.last.kind != FileKind.png; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 50));
        await tester.pump();
      }
    });
    await tester.pumpAndSettle();
    final png = w.files.savedFiles.last;
    expect(
      [png.kind, png.bytes.sublist(0, 4)],
      [
        FileKind.png,
        [0x89, 0x50, 0x4e, 0x47],
      ],
    );
    expect(png.name, endsWith('.png'));
  });

  testWidgets('importing a backup over a novel says first what it would change', (tester) async {
    final w = await openFixture(tester);
    final backups = w.c.read(backupServiceProvider);
    final text = backups.exportBackup(w.novel);
    final store = w.c.read(novelStoreProvider);
    final s = store.load(w.novel)!;
    store.putNovel(s.putRow('chapters', {...s.rows('chapters').first, 'title': 'Renamed since'}));
    w.files.toPick = (name: 'qa.novel.json', text: text);
    await tester.pumpAndSettle();
    await tapText(tester, 'Import a backup…');
    expect(find.textContaining('Replacing would change, compared with what you have now'), findsOneWidget);
    expect(find.text('• chapters, scenes and groups: 1 changed'), findsOneWidget);
    await tapText(tester, 'Cancel');
    expect(store.load(w.novel)!.rows('chapters').first['title'], 'Renamed since');
  });

  testWidgets('works on a phone at 200% text size: the page and every dialog', (tester) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final w = await openFixture(tester, size: phone);
    expect(tester.takeException(), isNull);
    for (final button in ['Export manuscript…', 'Export records…']) {
      await tapText(tester, button);
      expect(tester.takeException(), isNull, reason: button);
      await tapText(tester, 'Close');
    }
    w.files.manuscriptToPick = (name: 'novel.txt', bytes: File('test/fixtures/exchange/novel.txt').readAsBytesSync());
    await tapText(tester, 'Choose a file…');
    expect(tester.takeException(), isNull);
    await tapText(tester, 'Cancel');
    w.c.read(routerProvider).go('/visualize/timeline');
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Export this view'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
}
