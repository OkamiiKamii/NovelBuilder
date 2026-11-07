import 'dart:convert';

import 'package:archive/archive.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/reader/reader_providers.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/backup_files.dart';
import 'package:novel_builder/shared/data/novel_store.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/reader/book.dart';
import 'package:novel_builder/shared/domain/reader/reader_prefs.dart';

import '../../helpers/pump_app.dart';
import '../../shared/domain/fixtures.dart';

const _novel = 'b0000000-0000-4000-8000-000000000000';

Future<({ProviderContainer c, FakeBackupFiles files})> openBook(
  WidgetTester tester, {
  Size size = desktop,
  String location = '/write/read',
}) async {
  final files = FakeBackupFiles();
  final c = await pumpApp(tester, size: size, location: location, files: files);
  c.read(novelStoreProvider).putNovel(loadFixture('book'));
  c.read(openNovelProvider.notifier).open(_novel);
  await tester.pumpAndSettle();
  return (c: c, files: files);
}

/// Every row of the novel, to prove reading changes none of them.
String _rows(ProviderContainer c) {
  final store = c.read(novelStoreProvider);
  return jsonEncode({
    for (final name in ['chapters', 'chapterContents', 'bookMatter', 'loreEntries', 'outlines', 'characters'])
      name: store.rowsIn(_novel, name),
  });
}

Future<void> next(WidgetTester tester, [int times = 1]) async {
  for (var i = 0; i < times; i++) {
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowRight);
    await tester.pump();
  }
  await tester.pumpAndSettle();
}

/// Opens Contents and jumps to the entry holding [title], scrolling the sheet to it first.
Future<void> jumpTo(WidgetTester tester, String title) async {
  await tester.tap(find.byTooltip('Contents'));
  await tester.pumpAndSettle();
  final tile = find.ancestor(of: find.textContaining(title), matching: find.byType(ListTile));
  await tester.scrollUntilVisible(
    tile,
    120,
    scrollable: find.descendant(of: find.byType(BottomSheet), matching: find.byType(Scrollable)).first,
  );
  await tester.ensureVisible(tile.first);
  await tester.pumpAndSettle();
  await tester.tap(tile.first);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('the novel as a printed book: title page, chapters a page at a time, and the device it is read on', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    final w = await openBook(tester);
    final before = _rows(w.c);
    expect(find.text('Standard novel'), findsOneWidget);
    expect(find.text('Book details'), findsOneWidget);
    expect(find.text('Publish…'), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp('^E-reader preview')), findsOneWidget);
    expect(find.textContaining('Book Layout Test'), findsWidgets);
    // Pages turn with the keyboard and the buttons.
    await next(tester, 6);
    expect(find.textContaining('page'), findsWidgets);
    await tester.tap(find.byTooltip('Next page'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Previous page'));
    await tester.pumpAndSettle();
    // Contents jumps straight to a chapter.
    await jumpTo(tester, 'Embers');
    expect(find.textContaining('Embers'), findsWidgets);
    await tester.pump(const Duration(seconds: 1));
    expect(_rows(w.c), before, reason: 'reading changes nothing in the novel');
    semantics.dispose();
  });

  testWidgets('as a web serial: one chapter, the author\'s notes, and the chapters either side', (tester) async {
    await openBook(tester);
    await tester.tap(find.text('Web serial'));
    await tester.pumpAndSettle();
    expect(find.textContaining('New chapters on Fridays'), findsOneWidget);
    // Previous and Next sit above the chapter and below it, as on a serial site.
    expect(find.textContaining('Next: Chapter 2'), findsNWidgets(2));
    await tester.tap(find.textContaining('Next: ').first);
    await tester.pumpAndSettle();
    expect(find.textContaining('Previous: Arrival'), findsNWidgets(2));
    expect(find.byTooltip('Contents'), findsNothing);
    await tester.pump(const Duration(seconds: 1));
  });

  testWidgets('appearance: changes show at once, are kept on this device, and can be put back', (tester) async {
    final w = await openBook(tester, size: const Size(1400, 2400));
    await tester.tap(find.byTooltip('Appearance'));
    await tester.pumpAndSettle();
    expect(find.text('Appearance'), findsOneWidget);
    expect(find.textContaining('Contrast 17.2 to 1: comfortable for long reading'), findsOneWidget);
    await tester.tap(find.text('Clean white'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Dark / OLED').last);
    await tester.pumpAndSettle();
    expect(w.c.read(readerPrefsProvider).scheme, ReaderScheme.dark);
    await tester.tap(find.text('Scroll'));
    await tester.pumpAndSettle();
    await tester.pump(const Duration(seconds: 1));
    final stored = ReaderPrefs.fromJson(w.c.read(settingsStoreProvider).read('reader.prefs'));
    expect([stored.scheme, stored.flow], [ReaderScheme.dark, ReaderFlow.scroll]);
    expect(find.text('Previous page'), findsNothing);
    await tester.ensureVisible(find.text('Back to the usual look'));
    await tester.tap(find.text('Back to the usual look'));
    await tester.pumpAndSettle();
    expect(w.c.read(readerPrefsProvider), const ReaderPrefs());
  });

  testWidgets('a phone at twice the text size: everything fits, and the place is remembered', (tester) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final w = await openBook(tester, size: phone);
    expect(tester.takeException(), isNull);
    await jumpTo(tester, 'Chapter 2');
    await tester.tap(find.byTooltip('Next page'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.pump(const Duration(seconds: 1));
    final mark = readBookmark(w.c.read(settingsStoreProvider), _novel)!;
    expect(mark.sectionId, 'b0000000-0000-4000-8000-000000000005');
    expect(mark.furthest, greaterThan(0));
    // The appearance controls open as a sheet on a phone.
    await tester.tap(find.byTooltip('Appearance'));
    await tester.pumpAndSettle();
    expect(find.text('Typeface'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('publishing an ebook: what it holds is shown first, then saved as an EPUB', (tester) async {
    final w = await openBook(tester);
    final before = _rows(w.c);
    await tester.tap(find.text('Publish…'));
    await tester.pumpAndSettle();
    expect(find.text('Ebook (EPUB)'), findsOneWidget);
    expect(find.textContaining('serial notes are left out of an ebook'), findsOneWidget);
    expect(find.descendant(of: find.byType(AlertDialog), matching: find.text('Title page')), findsOneWidget);
    await tester.tap(find.text('Save…'));
    await tester.pumpAndSettle();
    final saved = w.files.savedFiles.single;
    expect([saved.name, saved.kind], ['Book Layout Test.epub', FileKind.epub]);
    final zip = ZipDecoder().decodeBytes(saved.bytes);
    expect(zip.files.first.name, 'mimetype');
    expect(find.textContaining('Saved Book Layout Test.epub. Nothing in the novel changed.'), findsOneWidget);
    expect(_rows(w.c), before);
  });

  testWidgets('publishing a web serial: every chapter in a zip, or one chapter saved or copied', (tester) async {
    final w = await openBook(tester);
    String? copied;
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'Clipboard.setData') copied = (call.arguments as Map)['text'] as String;
      return null;
    });
    addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));
    await tester.tap(find.text('Publish…'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Web serial: every chapter'));
    await tester.pumpAndSettle();
    expect(find.text('001-arrival.html'), findsOneWidget);
    await tester.tap(find.text('Save…'));
    await tester.pumpAndSettle();
    final zipped = w.files.savedFiles.last;
    expect([zipped.name, zipped.kind], ['Book Layout Test - web serial.zip', FileKind.zip]);
    expect(ZipDecoder().decodeBytes(zipped.bytes).files.map((f) => f.name), contains('001-arrival.html'));

    await tester.tap(find.text('Web serial: one chapter'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Web page (.html)'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Markdown (.md)').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Copy'));
    await tester.pumpAndSettle();
    expect(copied, contains('Arrival'));
    expect(copied, contains('New chapters on Fridays'));
    await tester.tap(find.text('Save…'));
    await tester.pumpAndSettle();
    expect(
      [w.files.savedFiles.last.name, w.files.savedFiles.last.kind],
      ['Book Layout Test - 001-arrival.md', FileKind.markdown],
    );
  });

  testWidgets('book details: each field saves into the novel, keeping everything else in the row', (tester) async {
    final w = await openBook(tester, location: '/write/book');
    final store = w.c.read(novelStoreProvider);
    final row = store.rowsIn(_novel, 'bookMatter').single;
    store.writeRows(_novel, [
      RowWrite.put('bookMatter', {...row, 'kept': 'a field this app does not know'}, expect: row),
    ]);
    await tester.pumpAndSettle();
    expect(find.text('Book details'), findsWidgets);
    await tester.enterText(find.widgetWithText(TextField, 'Dedication'), 'For Ada.');
    await tester.pump(const Duration(seconds: 1));
    await tester.ensureVisible(find.text('⁂'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('⁂'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('* * *').last);
    await tester.pumpAndSettle();
    await tester.pump(const Duration(seconds: 1));
    final saved = store.rowsIn(_novel, 'bookMatter').single;
    expect(
      [saved['dedication'], saved['sceneBreak'], saved['kept'], saved['epigraph']],
      ['For Ada.', '* * *', 'a field this app does not know', 'All glass remembers.'],
    );
    expect(str(saved['projectId']), _novel);
  });

  testWidgets('the Write menu leads to the reader and the book details', (tester) async {
    await openBook(tester, location: '/write');
    await tester.tap(find.byTooltip('Import and export'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Read as a book and publish…'));
    await tester.pumpAndSettle();
    expect(currentLocation(ProviderScope.containerOf(tester.element(find.byType(Scaffold).first))), '/write/read');
  });

  testWidgets('a novel with no text yet: the reader says so and publishing is not offered', (tester) async {
    final w = await pumpApp(tester, location: '/write/read');
    final snapshot = loadFixture('book');
    final store = w.read(novelStoreProvider)..putNovel(snapshot);
    for (final r in store.rowsIn(_novel, 'chapterContents')) {
      store.writeRows(_novel, [RowWrite.delete('chapterContents', str(r['id']), expect: r)]);
    }
    w.read(openNovelProvider.notifier).open(_novel);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Publish…'));
    await tester.pumpAndSettle();
    expect(find.textContaining('No chapter has text yet'), findsOneWidget);
    expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Save…')).onPressed, isNull);
    expect(buildBook(w.read(readerSourceProvider)!.source, BookFormat.ebook).words, 0);
  });

  testWidgets('reopening the reader goes back to the place it was left, on its page', (tester) async {
    // A phone at twice the text size, so the chapter runs over several pages.
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final c = await pumpApp(tester, size: phone, location: '/write');
    c.read(novelStoreProvider).putNovel(loadFixture('book'));
    c.read(settingsStoreProvider).write('reader.place.$_novel', {
      'sectionId': 'b0000000-0000-4000-8000-000000000008',
      'fraction': 1,
      'furthest': 0.8,
    });
    c.read(openNovelProvider.notifier).open(_novel);
    await tester.pumpAndSettle();
    c.read(routerProvider).go('/write/read');
    await tester.pumpAndSettle();
    final footer = tester.widgetList<Text>(find.textContaining('Embers')).map((t) => t.data).join('|');
    expect(footer, contains('Embers'));
    // At the end of the section: the last page of it.
    final match = RegExp(r'page (\d+) of (\d+)').firstMatch(footer);
    expect(match, isNotNull, reason: footer);
    expect(int.parse(match![2]!), greaterThan(1));
    expect(match[1], match[2]);
    await tester.pump(const Duration(seconds: 1));
    expect(readBookmark(c.read(settingsStoreProvider), _novel)!.furthest, greaterThanOrEqualTo(0.8));
  });

  testWidgets('the manuscript export shows the start of what it will hold before it is made', (tester) async {
    await openBook(tester, location: '/write');
    await tester.tap(find.byTooltip('Import and export'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Export manuscript…'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Preview'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Preview'));
    await tester.pumpAndSettle();
    final dialog = find.byType(Dialog);
    expect(find.descendant(of: dialog, matching: find.text('All of it')), findsOneWidget);
    expect(find.descendant(of: dialog, matching: find.textContaining('Arrival')), findsWidgets);
    expect(find.descendant(of: dialog, matching: find.textContaining('All glass remembers')), findsNothing);
  });
}
