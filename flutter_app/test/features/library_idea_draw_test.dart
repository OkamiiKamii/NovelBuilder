import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/library/idea_draw.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/records/novel.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../helpers/pump_app.dart';

void main() {
  test('a draw is one of the ideas, never the same twice running when there are others', () {
    final ideas = [
      for (final t in ['A', 'B', 'C']) Novel({'id': t, 'title': t, 'status': 'planning'}),
    ];
    final random = math.Random(3);
    var last = drawIdea(ideas, random: random);
    for (var i = 0; i < 30; i++) {
      final next = drawIdea(ideas, last: last, random: random);
      expect(next.id, isNot(last.id));
      last = next;
    }
    expect(drawIdea([ideas.first], last: ideas.first).id, 'A', reason: 'a single idea is drawn again');
  });

  testWidgets('on a phone: the two buttons share a row; an idea is drawn and started from the desk', (tester) async {
    BlinkController.indeterminateAnimationsEnabled = false;
    addTearDown(() => BlinkController.indeterminateAnimationsEnabled = true);
    final c = await pumpApp(tester, size: phone);
    final library = c.read(libraryServiceProvider);
    for (final t in ['The Salt Court', 'Harrowmere', 'Ember']) {
      library.create({'title': t, 'status': 'planning', 'synopsis': 'About $t.'});
    }
    await tester.pumpAndSettle();

    // New novel and Import backup side by side, the same width, across the page.
    final made = tester.getRect(find.text('New novel'));
    final imported = tester.getRect(find.text('Import backup'));
    expect((made.center.dy - imported.center.dy).abs(), lessThan(2), reason: 'one row');
    final buttons = [
      for (final t in ['New novel', 'Import backup'])
        tester.getSize(find.ancestor(of: find.text(t), matching: find.bySubtype<ButtonStyleButton>())).width,
    ];
    expect((buttons[0] - buttons[1]).abs(), lessThan(1), reason: 'the same size');
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));

    expect(find.text('Nothing being written'), findsOneWidget);
    expect(find.textContaining('Draw one of your 3 ideas'), findsOneWidget);
    await tester.ensureVisible(find.text('Draw an idea'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Draw an idea'));
    await tester.pumpAndSettle();
    expect(find.text('Drawn from your ideas'), findsOneWidget);
    final first = [
      'The Salt Court',
      'Harrowmere',
      'Ember',
    ].firstWhere((t) => find.text('About $t.').evaluate().isNotEmpty);
    await tester.tap(find.text('Draw another'));
    await tester.pumpAndSettle();
    expect(find.text('About $first.'), findsNothing, reason: 'another book');
    expect(c.read(libraryProvider).every((n) => n.status == NovelStatus.planning), isTrue, reason: 'nothing changed');

    await tester.tap(find.text('Start writing it'));
    await tester.pumpAndSettle();
    expect(c.read(libraryProvider).where((n) => n.status == NovelStatus.drafting).length, 1);
    expect(currentLocation(c), '/write');
  });
}
