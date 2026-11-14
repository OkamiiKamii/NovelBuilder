import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:novel_builder/features/progress/book_quiz_page.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/backup_files.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';
import 'package:novel_builder/shared/domain/manuscript/book_quiz.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';

void main() {
  setUp(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDown(() => BlinkController.indeterminateAnimationsEnabled = true);

  /// The choices of the question on screen that can still be pressed.
  Finder choices() => find.descendant(
    of: find.byWidgetPredicate(
      (w) => w.key is ValueKey<String> && (w.key! as ValueKey<String>).value.startsWith('quiz-choice-'),
    ),
    matching: find.byWidgetPredicate((w) => w is InkWell && w.onTap != null),
  );

  testWidgets('from More, the book quiz: ten questions from the pages, each answered and said where, the score shared '
      'and played again', (tester) async {
    final files = FakeBackupFiles();
    final c = await pumpApp(tester, size: phone, location: '/organize', files: files);
    final store = c.read(novelStoreProvider);
    final novel = addSampleNovel(store, now: DateTime(2026, 11, 13).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    await tester.pumpAndSettle();
    final before = jsonEncode(store.load(novel.id)!.toJson(exportedAt: 0));

    await tester.tap(find.byIcon(Icons.more_horiz));
    await tester.pumpAndSettle();
    final tile = find.bySemanticsLabel(RegExp('^The book quiz'));
    await tester.ensureVisible(tile);
    await tester.pumpAndSettle();
    await tester.tap(tile);
    await tester.pumpAndSettle();
    expect(find.byType(BookQuizScreen), findsOneWidget);
    final count = find.textContaining(RegExp(r'^1 of \d+$'));
    expect(count, findsOneWidget);
    final total = int.parse(tester.widget<Text>(count).data!.split(' ').last);
    expect(total, inInclusiveRange(quizAtLeast, quizLength));
    debugPrint('TOTAL $total');

    // Every question answered (the first choice each time): right or not, and where the line is.
    final kinds = <String>{};
    var right = 0;
    for (var i = 0; i < total; i++) {
      for (final k in QuizKind.values) {
        if (find.text(k.kicker).evaluate().isNotEmpty) kinds.add(k.kicker);
      }
      await tester.ensureVisible(choices().first);
      await tester.pumpAndSettle();
      await tester.tap(choices().first);
      await tester.pumpAndSettle();
      if (find.text('Right.').evaluate().isNotEmpty) right++;
      expect(find.text('Right.').evaluate().length + find.text('Not quite.').evaluate().length, 1);
      expect(choices(), findsNothing, reason: 'answered once');
      final next = find.text(i == total - 1 ? 'See your score' : 'Next');
      await tester.ensureVisible(next);
      await tester.pumpAndSettle();
      await tester.tap(next);
      await tester.pumpAndSettle();
    }
    expect(kinds, containsAll([for (final k in QuizKind.values) k.kicker]), reason: 'the sample has every kind');

    // The score, as a card to share.
    final card = tester.widget<QuizScoreCard>(find.byType(QuizScoreCard));
    expect((card.score, card.of, card.title), (right, total, 'The Drowned Road'));
    expect(find.text(quizVerdict(right, total)), findsOneWidget);
    await tester.runAsync(() async {
      await tester.tap(find.text('Share your score'));
      for (var i = 0; i < 60 && files.savedFiles.isEmpty; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 50));
        await tester.pump();
      }
    });
    await tester.pumpAndSettle();
    final png = files.savedFiles.single;
    expect((png.kind, png.name), (FileKind.png, 'book-quiz-score.png'));
    final picture = img.decodePng(png.bytes)!;
    expect((picture.width, picture.height), (1080, 1080));

    // Again: a new game from the start.
    await tester.tap(find.text('Play again'));
    await tester.pumpAndSettle();
    expect(find.textContaining(RegExp(r'^1 of \d+$')), findsOneWidget);
    expect(find.text('0 right'), findsOneWidget);
    expect(jsonEncode(store.load(novel.id)!.toJson(exportedAt: 0)), before, reason: 'it only reads');
  });

  testWidgets('read it there: the chapter opens with find on the line', (tester) async {
    final c = await pumpApp(tester, size: phone, location: '/organize');
    final novel = addSampleNovel(c.read(novelStoreProvider), now: DateTime(2026, 11, 13).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.more_horiz));
    await tester.pumpAndSettle();
    final tile = find.bySemanticsLabel(RegExp('^The book quiz'));
    await tester.ensureVisible(tile);
    await tester.pumpAndSettle();
    await tester.tap(tile);
    await tester.pumpAndSettle();
    await tester.ensureVisible(choices().first);
    await tester.pumpAndSettle();
    await tester.tap(choices().first);
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Read it there'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Read it there'));
    await tester.pumpAndSettle();
    expect(find.byType(BookQuizScreen), findsNothing);
    expect(currentLocation(c), '/write');
    expect(c.read(selectedNodeProvider), isNotNull);
    await tester.pump(const Duration(seconds: 2));
  });

  testWidgets('a book with too little: said so', (tester) async {
    final c = await pumpApp(tester, size: phone, location: '/organize');
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: c,
        child: const MaterialApp(home: BookQuizScreen(novelId: 'no-chapters', seed: 1)),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('Not enough to ask about yet'), findsOneWidget);
  });
}
