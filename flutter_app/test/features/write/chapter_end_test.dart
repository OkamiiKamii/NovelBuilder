import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/model/story_order.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:super_editor/super_editor.dart';
import 'package:super_editor/super_editor_test.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';
import 'write_page_test.dart' show openWrite, storedText;

Future<void> pressEnd(WidgetTester tester, String label) async {
  final button = find.text(label);
  final page = find.descendant(of: find.byKey(const ValueKey('page')), matching: find.byType(Scrollable)).first;
  await tester.scrollUntilVisible(button, 300, scrollable: page);
  await tester.pumpAndSettle();
  await tester.tap(button);
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDownAll(() => BlinkController.indeterminateAnimationsEnabled = true);

  testWidgets('the end of a chapter names what follows, and one press opens it with the caret after its words', (
    tester,
  ) async {
    final w = await openWrite(tester);
    final m = w.c.read(manuscriptServiceProvider);
    final river = m.create(w.novel, NodeKind.chapter, title: 'The River');
    m.save(w.novel, river.id, textToDoc('The water rose.'), baseRev: 0);
    await tester.pumpAndSettle();
    expect(find.text('Next'), findsOneWidget);
    expect(find.text('3 words'), findsOneWidget);
    await pressEnd(tester, 'Continue to “The River”');
    expect(w.c.read(selectedNodeProvider), river.id);
    final caret = SuperEditorInspector.findDocumentSelection()!;
    final last = SuperEditorInspector.findDocument()!.last as TextNode;
    expect((caret.extent.nodePosition as TextNodePosition).offset, last.text.length, reason: 'ready to carry on');
    expect(storedText(w.c, w.novel, w.chapter), 'The gate was open.\nNobody guarded it.', reason: 'untouched');
  });

  testWidgets('at the end of the manuscript, one press begins the next chapter after this one and opens it', (
    tester,
  ) async {
    final w = await openWrite(tester, size: phone);
    expect(find.text('The end, so far'), findsOneWidget);
    expect(find.text('Chapter 2'), findsOneWidget);
    await pressEnd(tester, 'Begin the next chapter');
    final nodes = readingOrder(w.c.read(manuscriptServiceProvider).nodes(w.novel));
    expect([for (final n in nodes) n.title], ['The Gate', 'Chapter 2']);
    expect(w.c.read(selectedNodeProvider), nodes.last.id);
    expect(find.text('Chapter 2'), findsWidgets, reason: 'the new chapter is open on the page');
    expect(tester.takeException(), isNull);
  });
}
