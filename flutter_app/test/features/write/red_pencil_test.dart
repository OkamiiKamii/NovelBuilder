import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/write/red_pencil.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:super_editor/super_editor.dart';
import 'package:super_editor/super_editor_test.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';
import 'write_page_test.dart' show openWrite, storedText;

/// The pencil's lines on the page, by style.
List<String> lines(WidgetTester tester) => [
  for (final layer in tester.widgetList<TextUnderlineLayer>(find.byType(TextUnderlineLayer)))
    for (final _ in layer.underlines)
      switch (layer.style) {
        SquiggleUnderlineStyle() => 'echo',
        DottedUnderlineStyle() => 'filler',
        StraightUnderlineStyle() => 'line',
        _ => 'other',
      },
];

void main() {
  setUpAll(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDownAll(() => BlinkController.indeterminateAnimationsEnabled = true);

  const text =
      'The stone was very cold under her hand.\n'
      'She touched the stone again and suddenly laughed.\n'
      'Nobody guarded the gate.';

  testWidgets('the red pencil marks the page, counts each mark, goes to them, and changes nothing', (tester) async {
    final w = await openWrite(tester, size: phone, text: text);
    final before = jsonEncode(w.c.read(novelStoreProvider).load(w.novel)!.toJson(exportedAt: 0));
    expect(lines(tester).where((l) => l != 'other'), isEmpty, reason: 'put away, no marks');

    // On a phone it is in the desk's drawer, so the chapter's name keeps its room in the bar.
    expect(find.byTooltip('Red pencil: echoes, long sentences, fillers'), findsNothing);
    await tester.tap(find.text('Desk'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Red pencil'));
    await tester.pumpAndSettle();
    expect(find.text('Echoes 2'), findsOneWidget);
    expect(find.text('Fillers 2'), findsOneWidget);
    expect(find.text('Long sentences 0'), findsOneWidget);
    expect(lines(tester).where((l) => l == 'echo'), hasLength(2));
    expect(lines(tester).where((l) => l == 'filler'), hasLength(2));
    await expectLater(tester, meetsGuideline(textContrastGuideline));
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));

    // The next echo, then the one after it: each selected, so it is brought into view.
    await tester.tap(find.text('Echoes 2'));
    await tester.pumpAndSettle();
    final doc = SuperEditorInspector.findDocument()!;
    String selected() {
      final s = SuperEditorInspector.findDocumentSelection()!;
      final node = doc.getNodeById(s.base.nodeId)! as TextNode;
      return node.text.toPlainText().substring(
        (s.base.nodePosition as TextNodePosition).offset,
        (s.extent.nodePosition as TextNodePosition).offset,
      );
    }

    expect(selected(), 'stone');
    expect(SuperEditorInspector.findDocumentSelection()!.base.nodeId, doc.first.id);
    await tester.tap(find.text('Echoes 2'));
    await tester.pumpAndSettle();
    expect(SuperEditorInspector.findDocumentSelection()!.base.nodeId, doc.elementAt(1).id);

    // Gone when put away; nothing was ever written.
    await tester.tap(find.byTooltip('Put the red pencil away'));
    await tester.pumpAndSettle();
    expect(find.text('Echoes 2'), findsNothing);
    expect(lines(tester).where((l) => l != 'other'), isEmpty);
    expect(w.c.read(redPencilProvider), isFalse);
    await tester.pump(const Duration(seconds: 3));
    await tester.pumpAndSettle();
    expect(storedText(w.c, w.novel, w.chapter), text);
    expect(jsonEncode(w.c.read(novelStoreProvider).load(w.novel)!.toJson(exportedAt: 0)), before);
  });

  testWidgets('as you type, the marks follow the text', (tester) async {
    final w = await openWrite(tester, size: phone, text: 'The harbour was empty.');
    w.c.read(redPencilProvider.notifier).set(true);
    await tester.pumpAndSettle();
    expect(find.text('Echoes 0'), findsOneWidget);
    expect(find.text('Red pencil · nothing to mark here'), findsOneWidget);

    await tester.placeCaretInParagraph(SuperEditorInspector.findDocument()!.first.id, 22);
    await tester.typeImeText(' The harbour was very quiet.');
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pumpAndSettle();
    expect(find.text('Echoes 2'), findsOneWidget);
    expect(find.text('Fillers 1'), findsOneWidget);
    expect(lines(tester).where((l) => l == 'echo'), hasLength(2));
    await tester.pump(const Duration(seconds: 3));
    await tester.pumpAndSettle();
    expect(storedText(w.c, w.novel, w.chapter), 'The harbour was empty. The harbour was very quiet.');
  });

  testWidgets('on a wide screen the pencil is in the bar, and stays out from chapter to chapter', (tester) async {
    final w = await openWrite(tester, text: text);
    await tester.tap(find.byTooltip('Red pencil: echoes, long sentences, fillers'));
    await tester.pumpAndSettle();
    expect(find.text('Echoes 2'), findsOneWidget);
    expect(lines(tester).where((l) => l == 'echo'), hasLength(2));

    final two = w.c.read(manuscriptServiceProvider).create(w.novel, NodeKind.chapter, title: 'The River');
    w.c.read(manuscriptServiceProvider).save(w.novel, two.id, textToDoc('Rain, very heavy rain.'), baseRev: 0);
    w.c.read(selectedNodeProvider.notifier).select(two.id);
    await tester.pumpAndSettle();
    expect(find.text('Echoes 2'), findsOneWidget, reason: 'rain… rain');
    expect(find.text('Fillers 1'), findsOneWidget);

    await tester.tap(find.byTooltip('Red pencil: echoes, long sentences, fillers'));
    await tester.pumpAndSettle();
    expect(find.text('Echoes 2'), findsNothing);
    expect(lines(tester).where((l) => l != 'other'), isEmpty);
  });
}
