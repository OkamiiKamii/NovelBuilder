import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/write/sprint.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/features/write/writing_prefs.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:super_editor/super_editor_test.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';
import 'write_page_test.dart' show openWrite, storedText;

Future<void> startSprint(WidgetTester tester, int minutes) async {
  await tester.tap(find.byTooltip('Start a writing sprint'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Sprint for $minutes minutes'));
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDownAll(() => BlinkController.indeterminateAnimationsEnabled = true);

  testWidgets('a sprint clears the desk, counts the words added, and says what was written when the time is up', (
    tester,
  ) async {
    final w = await openWrite(tester);
    await startSprint(tester, 10);
    expect(w.c.read(focusModeProvider), isTrue, reason: 'the desk clears');
    expect(find.text('10:00'), findsOneWidget);
    expect(find.text('+0 words this sprint'), findsOneWidget);

    final last = SuperEditorInspector.findDocument()!.last;
    await tester.placeCaretInParagraph(last.id, 'Nobody guarded it.'.length);
    await tester.typeImeText(' Not even Orrin.');
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();
    expect(find.text('+3 words this sprint'), findsOneWidget);
    expect(find.textContaining(RegExp(r'^9:5\d$')), findsOneWidget, reason: 'the clock runs down');

    await tester.pump(const Duration(minutes: 10));
    await tester.pumpAndSettle();
    expect(find.text('Sprint complete'), findsOneWidget);
    expect(find.text('+3 words'), findsOneWidget);
    expect(find.text('in 10 minutes'), findsOneWidget);
    expect(find.text('Your best sprint yet'), findsOneWidget);
    expect(w.c.read(focusModeProvider), isFalse, reason: 'the desk comes back');
    expect(w.c.read(settingsStoreProvider).read(bestSprintKey), {'words': 3, 'seconds': 600});
    expect(storedText(w.c, w.novel, w.chapter), 'The gate was open.\nNobody guarded it. Not even Orrin.');

    await tester.tap(find.text('Done'));
    await tester.pumpAndSettle();
    expect(find.text('Sprint complete'), findsNothing);
    expect(find.byTooltip('Start a writing sprint'), findsOneWidget, reason: 'the meter is back');
  });

  testWidgets('words in every chapter written in count; a sprint stopped early says so; under a minute, nothing', (
    tester,
  ) async {
    final w = await openWrite(tester);
    final m = w.c.read(manuscriptServiceProvider);
    final two = m.create(w.novel, NodeKind.chapter, title: 'The River');
    await tester.pumpAndSettle();

    await startSprint(tester, 25);
    await tester.tap(find.text('Stop'));
    await tester.pumpAndSettle();
    expect(find.text('Sprint stopped'), findsNothing, reason: 'under a minute: nothing to say');
    expect(w.c.read(sprintProvider), isNull);

    await startSprint(tester, 25);
    var last = SuperEditorInspector.findDocument()!.last;
    await tester.placeCaretInParagraph(last.id, 'Nobody guarded it.'.length);
    await tester.typeImeText(' Not even Orrin.');
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();
    // To the next chapter mid-sprint.
    w.c.read(focusModeProvider.notifier).set(false);
    w.c.read(selectedNodeProvider.notifier).select(two.id);
    await tester.pumpAndSettle();
    last = SuperEditorInspector.findDocument()!.last;
    await tester.placeCaretInParagraph(last.id, 0);
    await tester.typeImeText('The river ran high.');
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();
    expect(find.text('+7 words this sprint'), findsOneWidget);

    await tester.pump(const Duration(minutes: 3));
    await tester.tap(find.text('Stop'));
    await tester.pumpAndSettle();
    expect(find.text('Sprint stopped'), findsOneWidget);
    expect(find.text('+7 words'), findsOneWidget);
    expect(find.text('in 3 minutes of 25'), findsOneWidget);

    await tester.tap(find.text('Another sprint'));
    await tester.pumpAndSettle();
    expect(find.text('25:00'), findsOneWidget);
    expect(find.text('+0 words this sprint'), findsOneWidget);
    await tester.tap(find.text('Stop'));
    await tester.pumpAndSettle();
  });

  testWidgets('the sprint fits a phone at twice the text size', (tester) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await openWrite(tester, size: phone);
    // With the caret in the text: the desk clearing must keep the same editor (it once rebuilt it, and failed).
    final last = SuperEditorInspector.findDocument()!.last;
    await tester.placeCaretInParagraph(last.id, 0);
    await startSprint(tester, 15);
    expect(SuperEditorInspector.findDocumentSelection(), isNotNull, reason: 'the caret is still there');
    expect(tester.takeException(), isNull);
    await tester.pump(const Duration(minutes: 2));
    await tester.tap(find.text('Stop'));
    await tester.pumpAndSettle();
    expect(find.text('Sprint stopped'), findsOneWidget);
    expect(tester.takeException(), isNull);
    expect(find.byType(Scaffold), findsWidgets);
  });
}
