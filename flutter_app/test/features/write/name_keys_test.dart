import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:super_editor/super_editor.dart';
import 'package:super_editor/super_editor_test.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';

/// The sample novel open at its first chapter, the caret after its first paragraph.
Future<({ProviderContainer c, String novel, String chapter, String node})> openSample(
  WidgetTester tester, {
  required Size size,
}) async {
  final c = await pumpApp(tester, size: size, location: '/write');
  final novel = addSampleNovel(c.read(novelStoreProvider), now: DateTime(2026, 11, 12).millisecondsSinceEpoch);
  c.read(openNovelProvider.notifier).open(novel.id);
  final chapter = c
      .read(manuscriptServiceProvider)
      .nodes(novel.id)
      .where((n) => n.kind == NodeKind.chapter)
      .reduce((a, b) => a.order <= b.order ? a : b);
  c.read(selectedNodeProvider.notifier).select(chapter.id);
  await tester.pumpAndSettle();
  final first = SuperEditorInspector.findDocument()!.first as TextNode;
  await tester.placeCaretInParagraph(first.id, first.text.length);
  await tester.pump(const Duration(seconds: 1));
  await tester.pumpAndSettle();
  // Wherever the caret is now (a computer may have put it elsewhere as the page opened), at the end of its paragraph.
  final at = SuperEditorInspector.findDocumentSelection()!.extent.nodeId;
  final node = SuperEditorInspector.findDocument()!.getNodeById(at)! as TextNode;
  await tester.placeCaretInParagraph(node.id, node.text.length);
  await tester.pumpAndSettle();
  return (c: c, novel: novel.id, chapter: chapter.id, node: node.id);
}

String textOf(String nodeId) =>
    (SuperEditorInspector.findDocument()!.getNodeById(nodeId)! as TextNode).text.toPlainText();

void main() {
  setUpAll(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDownAll(() => BlinkController.indeterminateAnimationsEnabled = true);

  testWidgets('on a phone the ink tray offers the page’s names, then the ones that complete the word typed', (
    tester,
  ) async {
    final w = await openSample(tester, size: phone);
    // The keyboard comes up (the tray rides on it).
    tester.view.viewInsets = FakeViewPadding(bottom: 300 * tester.view.devicePixelRatio);
    addTearDown(tester.view.resetViewInsets);
    await tester.pumpAndSettle();
    final before = textOf(w.node);

    // Nothing typed yet: the names on this page.
    expect(find.bySemanticsLabel('Names on this page'), findsOneWidget);
    expect(find.bySemanticsLabel('Write Wren'), findsOneWidget);
    for (final key in tester.widgetList(find.bySemanticsLabel(RegExp('^Write ')))) {
      final size = tester.getSize(find.byWidget(key));
      expect(size.height >= 48 && size.width >= 48, isTrue, reason: 'room for a thumb: $size');
    }

    // A name begun: the names that complete it, and a press writes it whole in place of the letters.
    await tester.typeImeText(' Il');
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel('Names that complete the word'), findsOneWidget);
    await tester.tap(find.bySemanticsLabel('Write Ilse'));
    await tester.pumpAndSettle();
    expect(textOf(w.node), '$before Ilse');
    final caret = SuperEditorInspector.findDocumentSelection()!;
    expect((caret.extent.nodePosition as TextNodePosition).offset, '$before Ilse'.length);

    // Typing on after it.
    await tester.typeImeText(' laughed.');
    await tester.pump(const Duration(seconds: 2));
    await tester.pumpAndSettle();
    expect(textOf(w.node), '$before Ilse laughed.');

    // A page's name put in at the caret, after a space.
    await tester.tap(find.bySemanticsLabel('Write Wren'));
    await tester.pumpAndSettle();
    expect(textOf(w.node), '$before Ilse laughed. Wren');
  });

  testWidgets('on a computer the completions float over the page’s foot only while a name is typed; Tab writes the '
      'first', (tester) async {
    final w = await openSample(tester, size: desktop);
    final before = textOf(w.node);
    expect(find.bySemanticsLabel('Names on this page'), findsNothing, reason: 'nothing typed, nothing shown');
    final viewport = find.ancestor(of: find.byType(SuperEditor), matching: find.byType(Viewport)).first;

    await tester.typeImeText(' Wr');
    await tester.pump(const Duration(seconds: 2));
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel('Write Wren (Tab)'), findsOneWidget);
    final shown = tester.getRect(viewport);

    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.pump(const Duration(seconds: 2));
    await tester.pumpAndSettle();
    expect(tester.getRect(viewport), shown, reason: 'the keys float over the page: it never moves for them');
    expect(textOf(w.node), '$before Wren');
    expect(find.bySemanticsLabel('Write Wren (Tab)'), findsNothing);

    // Saved like anything typed.
    final saved = jsonEncode(w.c.read(novelStoreProvider).row(w.novel, 'chapterContents', w.chapter));
    expect(saved, contains('Wren'));
  });
}
