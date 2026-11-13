import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:novel_builder/features/progress/book_story.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/backup_files.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';

void main() {
  setUpAll(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDownAll(() => BlinkController.indeterminateAnimationsEnabled = true);

  testWidgets('from More, the book told as a story: page by page, each shared as a story-sized picture, and Keep '
      'writing at the end', (tester) async {
    final files = FakeBackupFiles();
    final c = await pumpApp(tester, size: phone, location: '/organize', files: files);
    final store = c.read(novelStoreProvider);
    final novel = addSampleNovel(store, now: DateTime(2026, 11, 12).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    await tester.pumpAndSettle();
    final before = jsonEncode(store.load(novel.id)!.toJson(exportedAt: 0));

    await tester.tap(find.text('More'));
    await tester.pumpAndSettle();
    await tester.tap(find.bySemanticsLabel(RegExp('^Your book so far')));
    await tester.pumpAndSettle();
    expect(find.byType(BookStoryScreen), findsOneWidget);
    expect(find.text('YOUR BOOK SO FAR'), findsOneWidget);
    expect(find.text('The Drowned Road'), findsOneWidget);

    // A press on the right turns on.
    Future<void> next() async {
      await tester.tapAt(const Offset(330, 400));
      await tester.pumpAndSettle();
    }

    await next();
    expect(find.text('9,645'), findsOneWidget);
    expect(find.textContaining('15 chapters'), findsOneWidget);

    await tester.runAsync(() async {
      await tester.tap(find.text('Share this page'));
      for (var i = 0; i < 60 && files.savedFiles.isEmpty; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 50));
        await tester.pump();
      }
    });
    await tester.pumpAndSettle();
    final png = files.savedFiles.single;
    expect(png.kind, FileKind.png);
    expect(png.name, 'book-so-far-2.png');
    final picture = img.decodePng(png.bytes)!;
    expect((picture.width, picture.height), (1080, 1920));

    // On to who it is about, who talks most, the words leaned on.
    while (find.text('YOUR BOOK IS ABOUT').evaluate().isEmpty) {
      await next();
    }
    expect(find.text('Wren Hollis'), findsOneWidget);
    await next();
    expect(find.text('WHO TALKS MOST'), findsOneWidget);
    expect(find.text('“Master, it’s the tide bell.”'), findsOneWidget);
    await next();
    expect(find.text('THE WORDS YOU LEAN ON'), findsOneWidget);
    expect(find.text('stone'), findsOneWidget);

    // A press on the left goes back.
    await tester.tapAt(const Offset(40, 400));
    await tester.pumpAndSettle();
    expect(find.text('WHO TALKS MOST'), findsOneWidget);

    // The end: what comes next, and back to the writing.
    while (find.text('NEXT STOP').evaluate().isEmpty) {
      await next();
    }
    expect(find.text('2,355 words to go'), findsOneWidget);
    await tester.tap(find.text('Keep writing'));
    await tester.pumpAndSettle();
    expect(find.byType(BookStoryScreen), findsNothing);
    expect(currentLocation(c), startsWith('/write'));
    expect(jsonEncode(store.load(novel.id)!.toJson(exportedAt: 0)), before, reason: 'a story read, nothing changed');
  });
}
