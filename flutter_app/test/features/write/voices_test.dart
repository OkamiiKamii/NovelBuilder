import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/write/voices.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:super_editor/super_editor.dart';
import 'package:super_editor/super_editor_test.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';
import 'write_page_test.dart' show openWrite, storedText;

/// The colour each run of the page's text is drawn in, with its text.
List<(String, Color?)> runs(WidgetTester tester) {
  final out = <(String, Color?)>[];
  for (final rich in tester.widgetList<RichText>(
    find.descendant(of: find.byType(SuperEditor), matching: find.byWidgetPredicate((w) => w is RichText)),
  )) {
    rich.text.visitChildren((span) {
      if (span is TextSpan && (span.text ?? '').isNotEmpty) out.add((span.text!, span.style?.color));
      return true;
    });
    if (rich.text case TextSpan(:final text?, :final style) when text.isNotEmpty) out.add((text, style?.color));
  }
  return out;
}

void main() {
  setUpAll(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDownAll(() => BlinkController.indeterminateAnimationsEnabled = true);

  const text =
      'The river rose all night.\n'
      '“It is going,” Wren said. “All of it.”\n'
      '“Go,” said Nan.\n'
      '“Who is there?” she asked.';

  for (final (form, size) in [('a phone', phone), ('a computer', desktop)]) {
    testWidgets('on $form the voices colour each line by its speaker, find them, and change nothing', (tester) async {
      final w = await openWrite(tester, size: size, text: text);
      final characters = w.c.read(characterServiceProvider);
      final wren = characters.change(w.novel, (x) => x.create(name: 'Wren Hollis')).id;
      final nan = characters.change(w.novel, (x) => x.create(name: 'Nan')).id;
      await tester.pumpAndSettle();
      final before = jsonEncode(w.c.read(novelStoreProvider).load(w.novel)!.toJson(exportedAt: 0));
      final plain = runs(tester);

      if (size == phone) {
        expect(find.byTooltip('Voices: each line of dialogue in its speaker\'s colour'), findsNothing);
        await tester.tap(find.text('Desk'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Voices'));
      } else {
        await tester.tap(find.byTooltip('Voices: each line of dialogue in its speaker\'s colour'));
      }
      await tester.pumpAndSettle();

      expect(find.textContaining('of this chapter is dialogue'), findsOneWidget);
      expect(find.text('Wren Hollis · 2 lines'), findsOneWidget);
      expect(find.text('Nan · 1 line'), findsOneWidget);
      expect(find.text('Not named · 1 line'), findsOneWidget);

      // Each speaker's lines in their own colour, the telling around them faded.
      final lens = find.byType(VoicesBar).evaluate().single.widget as VoicesBar;
      final dark = Theme.of(tester.element(find.byType(VoicesBar))).brightness == Brightness.dark;
      Color? colourOf(String run) => runs(tester).firstWhere((r) => r.$1 == run).$2;
      expect(colourOf('“It is going,”'), lens.lens.toneOf(wren, darkPage: dark));
      expect(colourOf('“All of it.”'), lens.lens.toneOf(wren, darkPage: dark));
      expect(colourOf('“Go,”'), lens.lens.toneOf(nan, darkPage: dark));
      expect(colourOf('The river rose all night.')!.a, lessThan(0.5));
      expect(colourOf('“Who is there?”')!.a, greaterThan(0.9), reason: 'not named: in ink');
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));

      // A speaker's next line is selected, so it is brought into view.
      await tester.ensureVisible(find.text('Nan · 1 line'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Nan · 1 line'));
      await tester.pumpAndSettle();
      final s = SuperEditorInspector.findDocumentSelection()!;
      final node = SuperEditorInspector.findDocument()!.getNodeById(s.base.nodeId)! as TextNode;
      expect(
        node.text.toPlainText().substring(
          (s.base.nodePosition as TextNodePosition).offset,
          (s.extent.nodePosition as TextNodePosition).offset,
        ),
        '“Go,”',
      );

      // Put away: the page as it was, and nothing was ever written.
      await tester.tap(find.byTooltip('Put the voices away'));
      await tester.pumpAndSettle();
      expect(find.byType(VoicesBar), findsNothing);
      expect(runs(tester), plain);
      expect(jsonEncode(w.c.read(novelStoreProvider).load(w.novel)!.toJson(exportedAt: 0)), before);
      expect(storedText(w.c, w.novel, w.chapter), text);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('typing with the voices out keeps the text exactly as typed', (tester) async {
    final w = await openWrite(tester, text: '“Go,” Wren said.');
    w.c.read(characterServiceProvider).change(w.novel, (x) => x.create(name: 'Wren'));
    w.c.read(voicesProvider.notifier).set(true);
    await tester.pumpAndSettle();
    expect(find.text('Wren · 1 line'), findsOneWidget);
    final last = SuperEditorInspector.findDocument()!.last;
    await tester.placeCaretInParagraph(last.id, '“Go,” Wren said.'.length);
    await tester.typeImeText(' “Now,” said Wren.');
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();
    expect(storedText(w.c, w.novel, w.chapter), '“Go,” Wren said. “Now,” said Wren.');
    expect(find.text('Wren · 2 lines'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
