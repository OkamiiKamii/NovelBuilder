import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:novel_builder/features/progress/book_print_page.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/backup_files.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';

import '../../helpers/pump_app.dart';

void main() {
  testWidgets('from More, the book’s fingerprint: its chapters and whose colours are whose, shared as a print', (
    tester,
  ) async {
    final files = FakeBackupFiles();
    final c = await pumpApp(tester, size: phone, location: '/organize', files: files);
    final store = c.read(novelStoreProvider);
    final novel = addSampleNovel(store, now: DateTime(2026, 11, 12).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    await tester.pumpAndSettle();
    final before = jsonEncode(store.load(novel.id)!.toJson(exportedAt: 0));

    await tester.tap(find.text('More'));
    await tester.pumpAndSettle();
    expect(find.text('SO FAR'), findsOneWidget);
    expect(find.text('FINGERPRINT'), findsOneWidget);
    final tile = find.bySemanticsLabel(RegExp('^Its fingerprint'));
    await tester.ensureVisible(tile);
    await tester.pumpAndSettle();
    await tester.tap(tile);
    await tester.pumpAndSettle();

    Finder poster(String text) => find.descendant(of: find.byType(BookPrintPoster), matching: find.text(text));
    expect(poster('THE DROWNED ROAD'), findsOneWidget);
    expect(poster('15 chapters · 9,645 words'), findsOneWidget);
    expect(poster('Wren Hollis'), findsOneWidget, reason: 'the legend: whose colour is whose, the most first');
    final shown = tester.widget<BookPrintPoster>(find.byType(BookPrintPoster));
    expect(shown.print.chapters, hasLength(15));
    expect(shown.print.shares.entries.reduce((a, b) => b.value > a.value ? b : a).key, isNotEmpty);

    await tester.runAsync(() async {
      await tester.tap(find.text('Share the print'));
      for (var i = 0; i < 60 && files.savedFiles.isEmpty; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 50));
        await tester.pump();
      }
    });
    await tester.pumpAndSettle();
    final png = files.savedFiles.single;
    expect((png.kind, png.name), (FileKind.png, 'book-fingerprint.png'));
    final picture = img.decodePng(png.bytes)!;
    expect((picture.width, picture.height), (1080, 1350));

    await tester.tap(find.byTooltip('Close'));
    await tester.pumpAndSettle();
    expect(find.byType(BookPrintScreen), findsNothing);
    expect(jsonEncode(store.load(novel.id)!.toJson(exportedAt: 0)), before, reason: 'nothing changed');
  });
}
