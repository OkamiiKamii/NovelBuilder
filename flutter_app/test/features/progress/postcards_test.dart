import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:novel_builder/features/progress/postcards_page.dart';
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

  Future<void> openPostcards(WidgetTester tester, ProviderContainer c) async {
    await tester.tap(find.byIcon(Icons.more_horiz));
    await tester.pumpAndSettle();
    final tile = find.bySemanticsLabel(RegExp('^Postcards'));
    await tester.ensureVisible(tile);
    await tester.pumpAndSettle();
    await tester.tap(tile);
    await tester.pumpAndSettle();
  }

  testWidgets('from More, postcards from the world: painted fronts, turned over to a line from the book, each sent as '
      'a picture', (tester) async {
    final files = FakeBackupFiles();
    final c = await pumpApp(tester, size: phone, location: '/organize', files: files);
    final store = c.read(novelStoreProvider);
    final novel = addSampleNovel(store, now: DateTime(2026, 11, 13).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    await tester.pumpAndSettle();
    final before = jsonEncode(store.load(novel.id)!.toJson(exportedAt: 0));
    await openPostcards(tester, c);

    expect(find.byType(PostcardsScreen), findsOneWidget);
    expect(find.text('1 of 5 · Vell'), findsOneWidget);
    expect(find.text('VELL'), findsOneWidget, reason: 'the place in large letters on the front');
    expect(find.byType(PostcardBack), findsNothing);

    // Sent as a picture, front up.
    await tester.runAsync(() async {
      await tester.tap(find.text('Send it'));
      for (var i = 0; i < 60 && files.savedFiles.isEmpty; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 50));
        await tester.pump();
      }
    });
    await tester.pumpAndSettle();
    final front = files.savedFiles.single;
    expect((front.kind, front.name), (FileKind.png, 'postcard-from-vell.png'));
    final picture = img.decodePng(front.bytes)!;
    expect((picture.width, picture.height), (1500, 1000));

    // A tap turns it over: the line the book sets there, and where.
    await tester.tap(find.byKey(postcardKey(0)));
    await tester.pumpAndSettle();
    expect(find.byType(PostcardBack), findsOneWidget);
    expect(find.text('Everyone in Vell knew what the bell meant.'), findsOneWidget);
    expect(find.text('Chapter 1 · The Bell'), findsOneWidget);
    await tester.runAsync(() async {
      await tester.tap(find.text('Send it'));
      for (var i = 0; i < 60 && files.savedFiles.length < 2; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 50));
        await tester.pump();
      }
    });
    await tester.pumpAndSettle();
    expect(files.savedFiles.last.name, 'postcard-from-vell-back.png');
    await tester.tap(find.text('Turn it over'));
    await tester.pumpAndSettle();
    expect(find.byType(PostcardBack), findsNothing, reason: 'front up again');

    // On to the next place.
    await tester.drag(find.byType(PageView), const Offset(-350, 0));
    await tester.pumpAndSettle();
    expect(find.text('2 of 5 · Lantern Street'), findsOneWidget);
    expect(jsonEncode(store.load(novel.id)!.toJson(exportedAt: 0)), before, reason: 'it only reads');
  });

  testWidgets('read it there: the chapter opens with find on the line', (tester) async {
    final c = await pumpApp(tester, size: phone, location: '/organize');
    final novel = addSampleNovel(c.read(novelStoreProvider), now: DateTime(2026, 11, 13).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    await tester.pumpAndSettle();
    await openPostcards(tester, c);
    await tester.tap(find.text('Read it there'));
    await tester.pumpAndSettle();
    expect(find.byType(PostcardsScreen), findsNothing);
    expect(currentLocation(c), '/write');
    expect(c.read(selectedNodeProvider), isNotNull);
    await tester.pump(const Duration(seconds: 2));
  });

  testWidgets('a book with no places: said so', (tester) async {
    final c = await pumpApp(tester, size: phone, location: '/organize');
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: c,
        child: const MaterialApp(home: PostcardsScreen(novelId: 'no-chapters')),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('No postcards yet'), findsOneWidget);
  });
}
