import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:super_editor/super_editor.dart';
import 'package:super_editor/super_editor_test.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';
import 'write_page_test.dart' show openWrite, storedText;

/// The page's text drawn with a background (the gaps' sticky notes).
List<String> stuck(WidgetTester tester) => [
  for (final rich in tester.widgetList<RichText>(
    find.descendant(of: find.byType(SuperEditor), matching: find.byWidgetPredicate((w) => w is RichText)),
  ))
    for (final span in [rich.text, if (rich.text is TextSpan) ...?(rich.text as TextSpan).children])
      if (span is TextSpan && span.style?.backgroundColor != null && (span.text ?? '').isNotEmpty) span.text!,
];

/// What is selected on the page.
String selected() {
  final s = SuperEditorInspector.findDocumentSelection()!;
  final node = SuperEditorInspector.findDocument()!.getNodeById(s.base.nodeId)! as TextNode;
  final a = (s.base.nodePosition as TextNodePosition).offset;
  final b = (s.extent.nodePosition as TextNodePosition).offset;
  return node.text.toPlainText().substring(a < b ? a : b, a < b ? b : a);
}

void main() {
  setUpAll(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDownAll(() => BlinkController.indeterminateAnimationsEnabled = true);

  testWidgets('gaps stand out on the page, are listed in the contents, and a press selects one to fill', (
    tester,
  ) async {
    final w = await openWrite(
      tester,
      text: 'The blade was forged in TK.\nMira rode to [[the name of the pass]] at dawn.',
    );
    final m = w.c.read(manuscriptServiceProvider);
    final second = m.create(w.novel, NodeKind.chapter, title: 'The Pass');
    m.save(w.novel, second.id, textToDoc('Kael waited. TK'), baseRev: 0);
    await tester.pumpAndSettle();
    final before = jsonEncode(w.c.read(novelStoreProvider).load(w.novel)!.toJson(exportedAt: 0));

    // On the page: the gaps as sticky notes, the brackets with them.
    expect(stuck(tester).join(), contains('TK'));
    expect(stuck(tester).join(), contains('the name of the pass'));

    // In the contents: every gap in the book, a press from each.
    await tester.scrollUntilVisible(find.text('GAPS TO FILL'), 200, scrollable: find.byType(Scrollable).first);
    expect(find.text('3 gaps left to fill in 2 chapters'), findsOneWidget);
    expect(find.text('the name of the pass'), findsOneWidget, reason: 'the note itself');
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));

    // A gap in another chapter: that chapter opens with the gap selected, so typing fills it.
    await tester.ensureVisible(find.bySemanticsLabel(RegExp(r'^Gap in The Pass')));
    await tester.pumpAndSettle();
    await tester.tap(find.bySemanticsLabel(RegExp(r'^Gap in The Pass')));
    await tester.pumpAndSettle();
    expect(w.c.read(selectedNodeProvider), second.id);
    expect(selected(), 'TK');

    // One in the chapter open now: selected at once.
    await tester.ensureVisible(find.bySemanticsLabel(RegExp(r'^Gap in The Gate: the name')));
    await tester.pumpAndSettle();
    await tester.tap(find.bySemanticsLabel(RegExp(r'^Gap in The Gate: the name')));
    await tester.pumpAndSettle();
    expect(w.c.read(selectedNodeProvider), w.chapter);
    expect(selected(), '[[the name of the pass]]');

    // Reading them changed nothing.
    expect(jsonEncode(w.c.read(novelStoreProvider).load(w.novel)!.toJson(exportedAt: 0)), before);

    // Filling one: typed over, saved, and gone from the list.
    await tester.typeImeText('Sorrow Gap');
    await tester.pump(const Duration(seconds: 2));
    await tester.pumpAndSettle();
    expect(storedText(w.c, w.novel, w.chapter), contains('Mira rode to Sorrow Gap at dawn.'));
    expect(find.text('2 gaps left to fill in 2 chapters'), findsOneWidget);
  });

  testWidgets('Leave a gap puts [[ ]] at the caret, the caret inside; words selected become its note', (tester) async {
    final w = await openWrite(tester, text: 'She crossed the river.');
    final node = SuperEditorInspector.findDocument()!.first;
    await tester.placeCaretInParagraph(node.id, 'She crossed the river'.length);
    await tester.tap(find.byTooltip('Leave a gap'));
    await tester.pumpAndSettle();
    await tester.typeImeText('its name');
    await tester.pump(const Duration(seconds: 2));
    await tester.pumpAndSettle();
    expect(storedText(w.c, w.novel, w.chapter), 'She crossed the river [[its name]].');

    // Selected words: they are the note.
    await tester.doubleTapInParagraph(node.id, 1);
    await tester.pumpAndSettle();
    expect(selected(), 'She');
    await tester.tap(find.byTooltip('Leave a gap'));
    await tester.pump(const Duration(seconds: 2));
    await tester.pumpAndSettle();
    expect(storedText(w.c, w.novel, w.chapter), '[[She]] crossed the river [[its name]].');
  });

  testWidgets('a book with no gaps shows no card', (tester) async {
    await openWrite(tester, size: phone, select: false);
    expect(find.text('GAPS TO FILL'), findsNothing);
    expect(find.text('THE DAY BOOK'), findsOneWidget);
  });
}
