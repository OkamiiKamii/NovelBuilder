import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/write/goal_pledge.dart';
import 'package:novel_builder/features/write/write_providers.dart';

import '../../helpers/pump_app.dart';
import 'write_page_test.dart' show openWrite;

void main() {
  test('what a day’s words are in pages, and when they finish the draft', () {
    expect(pagesOf(100), 'A paragraph or two');
    expect(pagesOf(250), 'About a page');
    expect(pagesOf(1000), 'About 4 pages');
    expect(finishAt(500, words: 1000, target: 11000, today: '2026-11-07'), 'The draft by ${'Nov 27, 2026'}');
    expect(finishAt(500, words: 1000, target: null, today: '2026-11-07'), isNull);
    expect(finishAt(500, words: 12000, target: 11000, today: '2026-11-07'), isNull, reason: 'target reached');
  });

  testWidgets('a daily goal in one press on a phone; your own number, and none, still there', (tester) async {
    final w = await openWrite(tester, size: phone);
    final service = w.c.read(manuscriptServiceProvider);
    await tester.tap(find.textContaining('Set a goal'));
    await tester.pumpAndSettle();
    expect(find.text('How much a day?'), findsOneWidget);
    expect(find.text('About a page'), findsOneWidget);
    await expectLater(tester, meetsGuideline(textContrastGuideline));
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));

    await tester.tap(find.bySemanticsLabel(RegExp('^250 words a day')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save goals'));
    await tester.pumpAndSettle();
    expect(service.wordGoals(w.novel).daily, 250);
    expect(find.textContaining('of 250 words'), findsOneWidget);

    // An own number wins over the cards; "No daily goal" clears it.
    await tester.tap(find.bySemanticsLabel(RegExp('of 250 words')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Your own numbers'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Your own numbers'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Each day'), '333');
    await tester.tap(find.text('Save goals'));
    await tester.pumpAndSettle();
    expect(service.wordGoals(w.novel).daily, 333);

    await tester.tap(find.bySemanticsLabel(RegExp('of 333 words')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('No daily goal'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('No daily goal'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save goals'));
    await tester.pumpAndSettle();
    expect(service.wordGoals(w.novel).daily, isNull);
  });
}
