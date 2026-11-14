import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:novel_builder/features/progress/best_lines_page.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/backup_files.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';

void main() {
  setUp(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDown(() => BlinkController.indeterminateAnimationsEnabled = true);

  testWidgets('from More, the best lines: a card each, dressed three ways, shared square, read where they are', (
    tester,
  ) async {
    final files = FakeBackupFiles();
    final c = await pumpApp(tester, size: phone, location: '/organize', files: files);
    final store = c.read(novelStoreProvider);
    final novel = addSampleNovel(store, now: DateTime(2026, 11, 13).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    await tester.pumpAndSettle();
    final before = jsonEncode(store.load(novel.id)!.toJson(exportedAt: 0));

    await tester.tap(find.byIcon(Icons.more_horiz));
    await tester.pumpAndSettle();
    final tile = find.bySemanticsLabel(RegExp('^Your best lines'));
    await tester.ensureVisible(tile);
    await tester.pumpAndSettle();
    await tester.tap(tile);
    await tester.pumpAndSettle();

    expect(find.text('Your best lines'), findsOneWidget);
    expect(find.text('By then nobody listened to me, and the sea had not gone out again.'), findsOneWidget);
    expect(find.textContaining('1 of 12'), findsOneWidget);
    await tester.tap(find.text('Night'));
    await tester.pumpAndSettle();
    expect(tester.widget<QuoteCard>(find.byType(QuoteCard).first).dress, QuoteDress.night);

    await tester.runAsync(() async {
      await tester.tap(find.text('Share this line'));
      for (var i = 0; i < 60 && files.savedFiles.isEmpty; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 50));
        await tester.pump();
      }
    });
    await tester.pumpAndSettle();
    final png = files.savedFiles.single;
    expect((png.kind, png.name), (FileKind.png, 'a-line-from-the-book.png'));
    final picture = img.decodePng(png.bytes)!;
    expect((picture.width, picture.height), (1080, 1080));

    // The next card, and read there: the chapter, with find on the line.
    await tester.drag(find.byType(PageView), const Offset(-300, 0));
    await tester.pumpAndSettle();
    expect(find.textContaining('2 of 12'), findsOneWidget);
    await tester.tap(find.text('Read it there'));
    await tester.pumpAndSettle();
    expect(currentLocation(c), '/write');
    expect(c.read(selectedNodeProvider), isNotNull);
    expect(jsonEncode(store.load(novel.id)!.toJson(exportedAt: 0)), before, reason: 'it only reads');
    await tester.pump(const Duration(seconds: 2));
  });
}
