import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/characters/character_page.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:super_editor/super_editor.dart';
import 'package:super_editor/super_editor_test.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';
import 'name_keys_test.dart' show openSample;

/// Puts the caret in the first paragraph that has [name], [into] letters into it.
Future<void> caretOn(WidgetTester tester, String name, {int into = 2}) async {
  final node = SuperEditorInspector.findDocument()!.whereType<TextNode>().firstWhere(
    (n) => n.text.toPlainText().contains(name),
  );
  await caretAt(tester, node.id, node.text.toPlainText().indexOf(name) + into);
}

/// Puts the caret in paragraph [nodeId] at [offset], through the editor, as a tap would (the paragraph may be out of
/// view, where a tap could not reach it).
Future<void> caretAt(WidgetTester tester, String nodeId, int offset) async {
  final editor = tester.widget<SuperEditor>(find.byType(SuperEditor)).editor;
  editor.execute([
    ChangeSelectionRequest(
      DocumentSelection.collapsed(
        position: DocumentPosition(
          nodeId: nodeId,
          nodePosition: TextNodePosition(offset: offset),
        ),
      ),
      SelectionChangeType.placeCaret,
      SelectionReason.userInteraction,
    ),
  ]);
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDownAll(() => BlinkController.indeterminateAnimationsEnabled = true);

  testWidgets('on a phone the caret on a name shows their card over the keyboard; a press shows it whole, and their '
      'page is a press from there', (tester) async {
    final w = await openSample(tester, size: phone);
    tester.view.viewInsets = FakeViewPadding(bottom: 300 * tester.view.devicePixelRatio);
    addTearDown(tester.view.resetViewInsets);
    await tester.pumpAndSettle();
    final before = jsonEncode(w.c.read(novelStoreProvider).load(w.novel)!.toJson(exportedAt: 0));

    await caretOn(tester, 'Wren Hollis');
    final strip = find.bySemanticsLabel(RegExp(r'^Wren Hollis, Protagonist.*Show their card$'));
    expect(strip, findsOneWidget);
    expect(find.bySemanticsLabel('Names on this page'), findsNothing, reason: 'the card has the place');
    expect(tester.getSize(strip).height, greaterThanOrEqualTo(48));

    await tester.tap(strip);
    await tester.pumpAndSettle();
    expect(find.text('“the apprentice”'), findsOneWidget);
    expect(find.textContaining('Apprentice cartographer, nineteen.'), findsOneWidget);
    expect(
      jsonEncode(w.c.read(novelStoreProvider).load(w.novel)!.toJson(exportedAt: 0)),
      before,
      reason: 'a look changes nothing',
    );

    await tester.tap(find.text('Open their page'));
    await tester.pumpAndSettle();
    expect(find.byType(CharacterPage), findsOneWidget);
  });

  testWidgets('on a computer the card floats at the page’s foot; typing a name, the keys that complete it take its '
      'place', (tester) async {
    await openSample(tester, size: desktop);
    await caretOn(tester, 'Ilse Marrow', into: 4);
    expect(find.bySemanticsLabel(RegExp(r'^Ilse Marrow, Supporting')), findsOneWidget);

    // Away from any name: no card.
    final doc = SuperEditorInspector.findDocument()!;
    final plain = doc.whereType<TextNode>().first;
    await caretAt(tester, plain.id, 1);
    expect(find.bySemanticsLabel(RegExp(r'Show their card$')), findsNothing);

    // A name being typed: the keys, not a card.
    await caretAt(tester, plain.id, plain.text.length);
    await tester.typeImeText(' Wr');
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel('Write Wren (Tab)'), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp(r'Show their card$')), findsNothing);
    await tester.pump(const Duration(seconds: 2));
  });
}
