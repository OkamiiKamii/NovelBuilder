import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/write/margin.dart';
import 'package:novel_builder/features/write/nudge.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:super_editor/super_editor_test.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';
import 'write_page_test.dart' show openWrite, storedText;

MarginNotes _notes({
  List<String> beats = const [],
  String objective = '',
  List<MarginPerson> people = const [],
  List<({String id, String title, String development})> threads = const [],
}) => (
  summary: '',
  objective: objective,
  beats: beats,
  people: people,
  mentioned: const [],
  threads: threads,
  before: null,
);

void main() {
  setUpAll(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDownAll(() => BlinkController.indeterminateAnimationsEnabled = true);

  test('the story’s own nudges come first: the last line, the plan, the threads, who is here; then the moves', () {
    final n = nudgesFor(
      _notes(
        beats: ['Wren finds the ledger', 'The flood'],
        objective: 'Wren learns the truth',
        people: [(id: 'w', name: 'Wren', pov: true), (id: 'n', name: 'Nan', pov: false)],
        threads: [(id: 't', title: 'The ledger', development: 'It is found')],
      ),
      lastLine: '“Where were you?” Nan asked.',
      seed: 1,
    );
    expect(
      [for (final x in n.take(7)) x.kind],
      ['Your last line', 'Your plan', 'Your plan', 'Your plan', 'A thread', 'Who is here', 'Who is here'],
    );
    expect(n.first.text, contains('What is said back'));
    expect(n[1].text, contains('“Wren finds the ledger”'));
    expect(n[5].text, contains('Wren’s eyes'));
    expect(n[6].text, contains('What does Nan want'));
    expect(n.skip(7).map((x) => x.kind).toSet(), {'A move'});
    expect(n.length, 7 + craftNudges.length);
  });

  test('a plain page gets the moves alone, in an order that changes with the day', () {
    final a = nudgesFor(_notes(), lastLine: 'The river rose.', seed: 1);
    final b = nudgesFor(_notes(), lastLine: 'The river rose.', seed: 2);
    expect(a.map((x) => x.kind).toSet(), {'A move'});
    expect({for (final x in a) x.text}, {for (final x in b) x.text});
    expect([for (final x in a) x.text], isNot([for (final x in b) x.text]));
    expect(nudgesFor(_notes(), lastLine: 'Is it?', seed: 1).first.text, contains('A question hangs'));
    expect(nudgesFor(_notes(), lastLine: 'And then—', seed: 1).first.text, contains('mid-thought'));
  });

  for (final (form, size) in [('a phone', phone), ('a computer', desktop)]) {
    testWidgets('on $form a page left still offers a nudge, which writes nothing and goes with the next key', (
      tester,
    ) async {
      final w = await openWrite(tester, size: size);
      final before = jsonEncode(w.c.read(novelStoreProvider).load(w.novel)!.toJson(exportedAt: 0));
      final last = SuperEditorInspector.findDocument()!.last;
      await tester.placeCaretInParagraph(last.id, 'Nobody guarded it.'.length);
      await tester.pump(const Duration(seconds: 20));
      expect(find.text('Stuck? A nudge'), findsNothing, reason: 'not yet');
      await tester.pump(const Duration(seconds: 21));
      await tester.pumpAndSettle();
      expect(find.text('Stuck? A nudge'), findsOneWidget);

      await tester.tap(find.text('Stuck? A nudge'));
      await tester.pumpAndSettle();
      expect(find.text('A MOVE'), findsOneWidget);
      final first = tester.widget<Text>(
        find.descendant(of: find.byType(AnimatedSwitcher).last, matching: find.byType(Text)),
      );
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(textContrastGuideline));
      await tester.tap(find.text('Another'));
      await tester.pumpAndSettle();
      final second = tester.widget<Text>(
        find.descendant(of: find.byType(AnimatedSwitcher).last, matching: find.byType(Text)),
      );
      expect(second.data, isNot(first.data));

      await tester.tap(find.text('Back to it'));
      await tester.pumpAndSettle();
      expect(find.text('A MOVE'), findsNothing);
      expect(SuperEditorInspector.findDocumentSelection(), isNotNull);

      // Stopped again; the next key puts it away.
      await tester.pump(stuckAfter + const Duration(seconds: 1));
      await tester.pumpAndSettle();
      expect(find.text('Stuck? A nudge'), findsOneWidget);
      await tester.placeCaretInParagraph(last.id, 'Nobody guarded it.'.length);
      await tester.typeImeText(' Yet.');
      await tester.pumpAndSettle();
      expect(find.text('Stuck? A nudge'), findsNothing);
      await tester.pump(const Duration(seconds: 2));
      await tester.pumpAndSettle();
      expect(
        storedText(w.c, w.novel, w.chapter),
        'The gate was open.\nNobody guarded it. Yet.',
        reason: 'only my keys',
      );
      expect(before, isNotEmpty);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('nudges can be turned off from the card, and stay off', (tester) async {
    final w = await openWrite(tester, size: phone);
    final last = SuperEditorInspector.findDocument()!.last;
    await tester.placeCaretInParagraph(last.id, 3);
    await tester.pump(stuckAfter + const Duration(seconds: 1));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Stuck? A nudge'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Don’t offer nudges'));
    await tester.pumpAndSettle();
    expect(w.c.read(nudgesProvider), isFalse);
    expect(w.c.read(settingsStoreProvider).read(nudgesKey), false);
    await tester.pump(stuckAfter * 2);
    await tester.pumpAndSettle();
    expect(find.text('Stuck? A nudge'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
