import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/shell/today_from_your_book.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';
import 'package:novel_builder/shared/domain/manuscript/book_quiz.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../helpers/pump_app.dart';

void main() {
  setUp(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDown(() => BlinkController.indeterminateAnimationsEnabled = true);

  test('the days take turns, a day each, and the time to read said as a reader would', () {
    final day = dayNumber(DateTime(2026, 11, 13, 23, 59));
    expect(dayNumber(DateTime(2026, 11, 13, 0, 1)), day, reason: 'the same all day');
    expect(dayNumber(DateTime(2026, 11, 14)), day + 1);
    expect({for (var d = day; d < day + 3; d++) dayCardOf(d)}, DayCard.values.toSet());
    expect(
      [readingTime(1), readingTime(39), readingTime(60), readingTime(95), readingTime(900)],
      ['1 minute', '39 minutes', '1 hour', '1.5 hours', '15 hours'],
    );
  });

  Future<({List<String> pressed, String novelId, ProviderContainer c})> pump(WidgetTester tester, int day) async {
    final c = await pumpApp(tester, size: phone, location: '/organize');
    final novel = addSampleNovel(c.read(novelStoreProvider), now: DateTime(2026, 11, 13).millisecondsSinceEpoch);
    final pressed = <String>[];
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: c,
        child: MaterialApp(
          home: Scaffold(
            body: ListView(
              children: [
                TodayFromYourBook(
                  novelId: novel.id,
                  day: day,
                  onRead: (node, text, block) => pressed.add('read $text'),
                  onLines: () => pressed.add('lines'),
                  onQuiz: () => pressed.add('quiz'),
                  onStory: () => pressed.add('story'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    return (pressed: pressed, novelId: novel.id, c: c);
  }

  int dayOf(DayCard card) => [for (var d = 30; d < 33; d++) d].firstWhere((d) => dayCardOf(d) == card);

  testWidgets('a line of the day: one of the best lines, read where it is, and all of them', (tester) async {
    final t = await pump(tester, dayOf(DayCard.line));
    expect(find.text('TODAY FROM YOUR BOOK'), findsOneWidget);
    expect(find.text('A LINE OF THE DAY'), findsOneWidget);
    expect(find.textContaining(RegExp(r'^Chapter \d+$')), findsOneWidget);
    await tester.tap(find.text('Read it there'));
    await tester.tap(find.text('All your best lines'));
    expect(t.pressed, hasLength(2));
    expect(t.pressed.first, startsWith('read '));
    expect(t.pressed.last, 'lines');
  });

  testWidgets('a question of the day: answered here, once, and the whole quiz after', (tester) async {
    final t = await pump(tester, dayOf(DayCard.question));
    expect(find.textContaining('A QUESTION OF THE DAY'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('today-choice-0')));
    await tester.pumpAndSettle();
    final said = find.textContaining(RegExp(r'^(Right|Not quite)\. '), findRichText: true);
    expect(said, findsOneWidget);
    // Answered once: another press changes nothing.
    final before = tester.widget<RichText>(said).text.toPlainText();
    await tester.tap(find.byKey(const ValueKey('today-choice-1')));
    await tester.pumpAndSettle();
    expect(tester.widget<RichText>(said).text.toPlainText(), before);
    await tester.tap(find.text('Play the whole quiz'));
    expect(t.pressed, ['quiz']);
  });

  testWidgets('the book in numbers, and the story', (tester) async {
    final t = await pump(tester, dayOf(DayCard.numbers));
    expect(find.text('YOUR BOOK IN NUMBERS'), findsOneWidget);
    expect(find.text('15 chapters · 8 characters · 39 minutes to read'), findsOneWidget);
    await tester.tap(find.text('See it told as a story'));
    expect(t.pressed, ['story']);
  });

  testWidgets('a day with no line or question to give has the numbers', (tester) async {
    final c = await pumpApp(tester, size: phone, location: '/organize');
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: c,
        child: MaterialApp(
          home: Scaffold(
            body: TodayFromYourBook(
              novelId: 'no-chapters',
              day: dayOf(DayCard.question),
              onLines: () {},
              onQuiz: () {},
              onStory: () {},
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('YOUR BOOK IN NUMBERS'), findsOneWidget);
    expect(bookQuiz(const [], const {}, seed: 1), isEmpty);
  });

  testWidgets('under More, above the keepsakes, once the book has words', (tester) async {
    final c = await pumpApp(tester, size: phone, location: '/organize');
    final novel = addSampleNovel(c.read(novelStoreProvider), now: DateTime(2026, 11, 13).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.more_horiz));
    await tester.pumpAndSettle();
    expect(find.text('TODAY FROM YOUR BOOK'), findsOneWidget);
    final today = tester.widget<TodayFromYourBook>(find.byType(TodayFromYourBook));
    expect(today.day, dayNumber(DateTime.now()));
    final card = tester.getTopLeft(find.byType(TodayFromYourBook)).dy;
    expect(card, lessThan(tester.getTopLeft(find.bySemanticsLabel(RegExp('^The book quiz'))).dy));
  });
}
