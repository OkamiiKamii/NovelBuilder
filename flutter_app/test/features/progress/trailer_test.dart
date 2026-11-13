import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:novel_builder/features/progress/trailer.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/backup_files.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';
import 'package:novel_builder/shared/domain/manuscript/trailer.dart';

import '../../helpers/pump_app.dart';

void main() {
  test('a shot holds long enough to read', () {
    expect(shotLength((kind: ShotKind.line, text: 'Go.')), const Duration(milliseconds: 3000));
    expect(shotLength((kind: ShotKind.line, text: List.filled(40, 'word').join(' '))).inMilliseconds, 6000);
    expect(shotLength((kind: ShotKind.title, text: 'T')), greaterThan(shotLength((kind: ShotKind.name, text: 'N'))));
  });

  testWidgets('from More, the trailer: shots a press apart, ending on a poster shared as a picture', (tester) async {
    final files = FakeBackupFiles();
    final c = await pumpApp(tester, size: phone, location: '/organize', files: files);
    final store = c.read(novelStoreProvider);
    final novel = addSampleNovel(store, now: DateTime(2026, 11, 12).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    await tester.pumpAndSettle();
    final before = jsonEncode(store.load(novel.id)!.toJson(exportedAt: 0));

    await tester.tap(find.text('More'));
    await tester.pumpAndSettle();
    final tile = find.bySemanticsLabel(RegExp('^The trailer'));
    await tester.ensureVisible(tile);
    await tester.pumpAndSettle();
    await tester.tap(tile);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));
    await tester.pump(const Duration(milliseconds: 600));
    expect(find.text('FROM NOVEL BUILDER'), findsOneWidget, reason: 'the first shot: who it is from');

    // A press cuts to the next shot.
    await tester.tap(find.bySemanticsLabel(RegExp('^Next shot')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 800));
    expect(find.text('FROM NOVEL BUILDER'), findsNothing);
    expect(find.text('Wren’s heart was beating very fast.'), findsOneWidget, reason: 'a line from the book');

    // Left to play, it runs to its end: the poster.
    await tester.pumpAndSettle();
    Finder poster(String text) => find.descendant(of: find.byType(TrailerPoster), matching: find.text(text));
    expect(poster('THE DROWNED ROAD'), findsOneWidget);
    expect(poster('COMING SOON'), findsOneWidget);
    expect(poster('“Wren, what is that?”'), findsOneWidget, reason: 'the line that lands hardest');
    expect(poster('WREN HOLLIS    TOBIAH FENN'), findsOneWidget, reason: 'the names above the title');

    await tester.runAsync(() async {
      await tester.tap(find.text('Share the poster'));
      for (var i = 0; i < 60 && files.savedFiles.isEmpty; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 50));
        await tester.pump();
      }
    });
    await tester.pumpAndSettle();
    final png = files.savedFiles.single;
    expect((png.kind, png.name), (FileKind.png, 'book-trailer-poster.png'));
    final picture = img.decodePng(png.bytes)!;
    expect((picture.width, picture.height), (1080, 1920));

    // Again, from the start; then skipped straight to the poster.
    await tester.tap(find.text('Play again'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));
    expect(find.text('FROM NOVEL BUILDER'), findsOneWidget);
    expect(find.byType(TrailerPoster), findsNothing);
    await tester.tap(find.text('Skip to the poster'));
    await tester.pumpAndSettle();
    expect(find.byType(TrailerPoster), findsOneWidget);

    await tester.tap(find.text('Keep writing'));
    await tester.pumpAndSettle();
    expect(find.byType(TrailerScreen), findsNothing);
    expect(jsonEncode(store.load(novel.id)!.toJson(exportedAt: 0)), before, reason: 'nothing changed');
  });

  testWidgets('closes from any shot', (tester) async {
    final c = await pumpApp(tester, size: desktop, location: '/organize', files: FakeBackupFiles());
    final store = c.read(novelStoreProvider);
    final novel = addSampleNovel(store, now: DateTime(2026, 11, 12).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    await tester.pumpAndSettle();
    final context = tester.element(find.byType(Scaffold).first);
    unawaited(showTrailer(context, novelId: novel.id));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));
    expect(find.byType(TrailerScreen), findsOneWidget);
    await tester.tap(find.byTooltip('Close'));
    await tester.pumpAndSettle();
    expect(find.byType(TrailerScreen), findsNothing);
  });

  testWidgets('on a phone with its own buttons along the foot, Skip sits above them', (tester) async {
    final c = await pumpApp(tester, size: phone, location: '/organize', files: FakeBackupFiles());
    final dpr = tester.view.devicePixelRatio;
    tester.view.padding = FakeViewPadding(bottom: 48 * dpr);
    addTearDown(tester.view.resetPadding);
    final store = c.read(novelStoreProvider);
    final novel = addSampleNovel(store, now: DateTime(2026, 11, 12).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    await tester.pumpAndSettle();
    final context = tester.element(find.byType(Scaffold).first);
    unawaited(showTrailer(context, novelId: novel.id));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));
    final skip = tester.getRect(find.widgetWithText(TextButton, 'Skip to the poster'));
    expect(skip.bottom, lessThanOrEqualTo(phone.height - 48), reason: 'clear of the phone’s buttons');
    await tester.tap(find.byTooltip('Close'));
    await tester.pumpAndSettle();
  });
}
