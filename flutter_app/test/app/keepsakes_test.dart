import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/shell/keepsakes.dart';
import 'package:novel_builder/features/progress/book_quiz_page.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../helpers/pump_app.dart';

void main() {
  setUp(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDown(() => BlinkController.indeterminateAnimationsEnabled = true);

  Future<ProviderContainer> more(WidgetTester tester) async {
    final c = await pumpApp(tester, size: phone, location: '/organize');
    final novel = addSampleNovel(c.read(novelStoreProvider), now: DateTime(2026, 11, 13).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.more_horiz));
    await tester.pumpAndSettle();
    return c;
  }

  List<String> rowLabels(WidgetTester tester) => [
    for (final t in tester.widgetList<KeepsakeTile>(find.byType(KeepsakeTile))) t.keepsake.id,
  ];

  testWidgets('every keepsake once, in one list; none opened yet: all new, the heading says how many', (tester) async {
    await more(tester);
    final heading = find.textContaining('KEEPSAKES', findRichText: true);
    await tester.ensureVisible(heading);
    await tester.pumpAndSettle();
    expect(find.textContaining('9 new', findRichText: true), findsOneWidget);
    final ids = rowLabels(tester);
    expect(ids, ['gazette', 'quiz', 'postcards', 'trailer', 'lines', 'sampler', 'story', 'print', 'jacket']);
    expect(find.bySemanticsLabel(RegExp(r'^The book quiz.*, not yet opened$')), findsOneWidget);
    expect(find.byType(Banner), findsNWidgets(9));
  });

  testWidgets('a keepsake opened from the row loses its ribbon, goes to the end of the row, and is remembered', (
    tester,
  ) async {
    final c = await more(tester);
    final quiz = find.bySemanticsLabel(RegExp('^The book quiz'));
    await tester.ensureVisible(quiz);
    await tester.pumpAndSettle();
    await tester.tap(quiz);
    await tester.pumpAndSettle();
    expect(find.byType(BookQuizScreen), findsOneWidget);
    await tester.tap(find.byTooltip('Close'));
    await tester.pumpAndSettle();

    expect(c.read(openedKeepsakesProvider), {'quiz'});
    expect(c.read(settingsStoreProvider).read(keepsakesOpenedSettingKey), ['quiz'], reason: 'kept on this device');
    expect(rowLabels(tester).last, 'quiz', reason: 'the ones not yet opened first');
    expect(find.textContaining('8 new', findRichText: true), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp(r'^The book quiz.*, not yet opened$')), findsNothing);
  });

  testWidgets('the shelf: all of them standing on shelves; one opened from it opens in the shelf’s place', (
    tester,
  ) async {
    final c = await more(tester);
    c.read(openedKeepsakesProvider.notifier).opened('gazette');
    await tester.pumpAndSettle();
    final shelf = find.text('See the shelf');
    await tester.ensureVisible(shelf);
    await tester.pumpAndSettle();
    await tester.tap(shelf);
    await tester.pumpAndSettle();

    expect(find.byType(KeepsakeShelf), findsOneWidget);
    expect(find.text('Everything your book can be made into. 8 of 9 not yet opened.'), findsOneWidget);
    final standing = find.descendant(of: find.byType(KeepsakeShelf), matching: find.byType(KeepsakeTile));
    expect(
      tester.widgetList<KeepsakeTile>(standing).first.keepsake.id,
      'gazette',
      reason: 'in their own order here, opened or not',
    );
    expect(tester.widgetList<KeepsakeTile>(standing).every((t) => t.standing), isTrue);

    await tester.tap(
      find.descendant(of: find.byType(KeepsakeShelf), matching: find.bySemanticsLabel(RegExp('^The book quiz'))),
    );
    await tester.pumpAndSettle();
    expect(find.byType(KeepsakeShelf), findsNothing);
    expect(find.byType(BookQuizScreen), findsOneWidget);
    expect(c.read(openedKeepsakesProvider), {'gazette', 'quiz'});
  });

  testWidgets('all opened: no ribbons, and the shelf says so', (tester) async {
    final c = await more(tester);
    for (final id in ['gazette', 'quiz', 'postcards', 'trailer', 'lines', 'sampler', 'story', 'print', 'jacket']) {
      c.read(openedKeepsakesProvider.notifier).opened(id);
    }
    await tester.pumpAndSettle();
    expect(find.byType(Banner), findsNothing);
    expect(find.textContaining('KEEPSAKES  ·  9', findRichText: true), findsOneWidget);
    await tester.ensureVisible(find.text('See the shelf'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('See the shelf'));
    await tester.pumpAndSettle();
    expect(find.text('Everything your book can be made into. You have opened them all.'), findsOneWidget);
  });
}
