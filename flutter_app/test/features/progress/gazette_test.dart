import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:novel_builder/features/progress/gazette_page.dart';
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

  Future<ProviderContainer> open(WidgetTester tester, {FakeBackupFiles? files}) async {
    final c = await pumpApp(tester, size: phone, location: '/organize', files: files);
    final novel = addSampleNovel(c.read(novelStoreProvider), now: DateTime(2026, 11, 13).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.more_horiz));
    await tester.pumpAndSettle();
    final tile = find.bySemanticsLabel(RegExp('^The Gazette'));
    await tester.ensureVisible(tile);
    await tester.pumpAndSettle();
    await tester.tap(tile);
    await tester.pumpAndSettle();
    return c;
  }

  testWidgets('from More, the gazette: opens on the latest edition, back through the others, printed as a picture', (
    tester,
  ) async {
    final files = FakeBackupFiles();
    final c = await open(tester, files: files);
    final store = c.read(novelStoreProvider);
    final novelId = c.read(openNovelProvider)!;
    final before = jsonEncode(store.load(novelId)!.toJson(exportedAt: 0));

    expect(find.byType(GazetteScreen), findsOneWidget);
    expect(find.text('THE OLD MERROW GAZETTE'), findsOneWidget, reason: 'the place the book names most');
    expect(find.text('Chapter 15 edition · 15 of 15'), findsOneWidget);
    expect(find.text('THE FULL MAP'), findsOneWidget);
    expect(find.text('PRINTED BY THE OLD MERROW PRESS · MADE WITH NOVEL BUILDER'), findsOneWidget);
    expect(find.text('TOMORROW’S EDITION'), findsOneWidget, reason: 'the last edition looks ahead');

    // An earlier edition: no tomorrow under it.
    await tester.tap(find.byTooltip('Earlier edition'));
    await tester.pumpAndSettle();
    expect(find.text('Chapter 14 edition · 14 of 15'), findsOneWidget);
    expect(find.text('TOMORROW’S EDITION'), findsNothing);

    await tester.runAsync(() async {
      await tester.tap(find.text('Print it'));
      for (var i = 0; i < 60 && files.savedFiles.isEmpty; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 50));
        await tester.pump();
      }
    });
    await tester.pumpAndSettle();
    final png = files.savedFiles.single;
    expect((png.kind, png.name), (FileKind.png, 'the-old-merrow-gazette-chapter-14.png'));
    expect(img.decodePng(png.bytes)!.width, 1200);
    expect(jsonEncode(store.load(novelId)!.toJson(exportedAt: 0)), before, reason: 'it only reads');
  });

  testWidgets('the first edition: the bell, who said what, the news', (tester) async {
    await open(tester);
    for (var i = 0; i < 14; i++) {
      await tester.tap(find.byTooltip('Earlier edition'));
      await tester.pumpAndSettle();
    }
    expect(find.text('Chapter 1 edition · 1 of 15'), findsOneWidget);
    expect(find.text('THE BELL'), findsOneWidget);
    expect(find.text('SAID ABOUT TOWN'), findsOneWidget);
    expect(find.textContaining('— Wren Hollis', findRichText: true), findsOneWidget);
    expect(find.text('Wren Hollis'), findsOneWidget, reason: 'in the news');
    final earlier = tester.widget<IconButton>(find.widgetWithIcon(IconButton, Icons.chevron_left));
    expect(earlier.onPressed, isNull, reason: 'no edition before the first');
  });

  testWidgets('tomorrow’s edition: keep writing goes back to the writing', (tester) async {
    final c = await open(tester);
    final keep = find.text('Keep writing');
    await tester.ensureVisible(keep);
    await tester.pumpAndSettle();
    await tester.tap(keep);
    await tester.pumpAndSettle();
    expect(find.byType(GazetteScreen), findsNothing);
    expect(currentLocation(c), startsWith('/write'));
    await tester.pump(const Duration(seconds: 2));
  });

  testWidgets('read it there opens the chapter', (tester) async {
    final c = await open(tester);
    await tester.tap(find.text('Read it there'));
    await tester.pumpAndSettle();
    expect(find.byType(GazetteScreen), findsNothing);
    expect(currentLocation(c), '/write');
    expect(c.read(selectedNodeProvider), isNotNull);
    await tester.pump(const Duration(seconds: 2));
  });

  testWidgets('a book with no words: no news yet', (tester) async {
    final c = await pumpApp(tester, size: phone, location: '/organize');
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: c,
        child: const MaterialApp(home: GazetteScreen(novelId: 'no-chapters')),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('No news yet'), findsOneWidget);
  });
}
