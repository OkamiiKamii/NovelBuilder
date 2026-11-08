import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:super_editor/super_editor.dart';
import 'package:super_editor/super_editor_test.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';
import 'write_page_test.dart' show openWrite, storedText;

List<String> _editorText() => [
  for (final n in SuperEditorInspector.findDocument()!) (n as TextNode).text.toPlainText(),
];

Future<void> _press(WidgetTester tester, Finder f) async {
  await tester.ensureVisible(f.first);
  await tester.pumpAndSettle();
  await tester.tap(f.first);
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDownAll(() => BlinkController.indeterminateAnimationsEnabled = true);

  testWidgets('a blank new draft opens in the editor; switching back brings the first text back, both kept', (
    tester,
  ) async {
    final w = await openWrite(tester);
    expect(find.textContaining('Draft:'), findsNothing, reason: 'one draft: nothing to say');
    await _press(tester, find.byTooltip('Alternate drafts'));
    expect(find.textContaining('None yet.'), findsOneWidget);
    await _press(tester, find.text('Start a new draft…'));
    await tester.enterText(find.widgetWithText(TextField, 'Name of the new draft'), 'The gate stays shut');
    await tester.pump();
    await _press(tester, find.text('Start on a blank page'));
    await _press(tester, find.text('Start draft'));
    expect(find.text('The gate stays shut'), findsOneWidget);
    expect(find.text('Main draft'), findsOneWidget);
    await _press(tester, find.byTooltip('Close'));

    // The editor shows the blank page, and says which draft it is.
    expect(_editorText(), ['']);
    expect(storedText(w.c, w.novel, w.chapter), '');
    expect(find.text('Draft: The gate stays shut · 1 other'), findsOneWidget);

    // Back to the first text.
    await _press(tester, find.text('Draft: The gate stays shut · 1 other'));
    await _press(tester, find.text('Put in the manuscript'));
    await _press(tester, find.widgetWithText(FilledButton, 'Switch drafts'));
    await _press(tester, find.byTooltip('Close'));
    expect(_editorText(), ['The gate was open.', 'Nobody guarded it.']);
    expect(find.text('Draft: Main draft · 1 other'), findsOneWidget);
    final kept = w.c.read(manuscriptServiceProvider).alternateDrafts(w.novel, w.chapter).single;
    expect(str(kept['name']), 'The gate stays shut');
  });

  testWidgets('a draft can be read, renamed and deleted; a name already used is refused', (tester) async {
    final w = await openWrite(tester);
    final m = w.c.read(manuscriptServiceProvider);
    m.createDraft(w.novel, w.chapter, 'Bleak ending');
    await tester.pumpAndSettle();
    await _press(tester, find.byTooltip('Alternate drafts'));
    await _press(tester, find.text('Read'));
    expect(find.text('Nobody guarded it.'), findsWidgets);
    await _press(tester, find.widgetWithText(FilledButton, 'Close'));

    await _press(tester, find.byTooltip('Rename “Bleak ending”'));
    await tester.enterText(find.byType(TextField).last, 'main draft');
    await _press(tester, find.widgetWithText(FilledButton, 'Rename'));
    expect(find.textContaining('already has a draft called'), findsOneWidget);
    await _press(tester, find.byTooltip('Rename “Bleak ending”'));
    await tester.enterText(find.byType(TextField).last, 'The happy one');
    await _press(tester, find.widgetWithText(FilledButton, 'Rename'));
    expect(m.activeDraft(w.novel, w.chapter), 'The happy one');

    await _press(tester, find.text('Delete'));
    await _press(tester, find.widgetWithText(FilledButton, 'Delete draft'));
    expect(m.alternateDrafts(w.novel, w.chapter), isEmpty);
    expect(storedText(w.c, w.novel, w.chapter), 'The gate was open.\nNobody guarded it.');
    await tester.pump(const Duration(seconds: 5));
  });

  testWidgets('on a phone at twice the text size, the drafts fit', (tester) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final w = await openWrite(tester, size: phone);
    w.c.read(manuscriptServiceProvider).createDraft(w.novel, w.chapter, 'An alternate ending for this chapter');
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    // On a phone the drafts are in the desk's drawer.
    await _press(tester, find.text('Desk'));
    await _press(tester, find.text('Alternate drafts'));
    expect(tester.takeException(), isNull);
    expect(find.text('In the manuscript'), findsOneWidget);
  });
}
