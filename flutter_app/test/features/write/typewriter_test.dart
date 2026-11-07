import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/write/chapter_editor.dart';
import 'package:novel_builder/features/write/writing_prefs.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:super_editor/super_editor_test.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';
import 'write_page_test.dart' show openWrite, storedText;

final _text = [for (var i = 1; i <= 40; i++) 'Line $i of the chapter.'].join('\n');

/// How far down the page a paragraph (the last, unless named) sits, as a share of the page's height.
double lastLineAt(WidgetTester tester, [String? nodeId]) {
  final page = tester.getRect(find.byKey(const ValueKey('page')));
  final scroll = tester.getRect(
    find.descendant(of: find.byKey(const ValueKey('page')), matching: find.byType(CustomScrollView)),
  );
  final last = SuperEditorInspector.findDocument()!.last;
  final y = SuperEditorInspector.findComponentOffset(nodeId ?? last.id, Alignment.center).dy;
  expect(page.contains(Offset(page.center.dx, y)), isTrue, reason: 'on the page: y=$y page=$page scroll=$scroll');
  return (y - scroll.top) / scroll.height;
}

void main() {
  setUpAll(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDownAll(() => BlinkController.indeterminateAnimationsEnabled = true);

  testWidgets(
    'in focus mode the line being written stays in the middle, and the words are only the author\'s',
    (tester) async {
      final w = await openWrite(tester, text: _text);
      final last = SuperEditorInspector.findDocument()!.last;
      await tester.placeCaretInParagraph(last.id, 'Line 40 of the chapter.'.length);
      w.c.read(focusModeProvider.notifier).set(true);
      await tester.pumpAndSettle();
      expect(lastLineAt(tester), closeTo(typewriterLine, 0.06), reason: 'brought to the middle on entering focus');

      await tester.typeImeText(' The end.');
      await tester.pump(const Duration(seconds: 1));
      await tester.pumpAndSettle();
      expect(lastLineAt(tester), closeTo(typewriterLine, 0.06), reason: 'kept there while typing');
      expect(storedText(w.c, w.novel, w.chapter), '$_text The end.', reason: 'only what was typed');
      expect(find.widgetWithText(FilterChip, 'Typewriter'), findsOneWidget);
    },
    variant: TargetPlatformVariant.only(TargetPlatform.windows),
  );

  testWidgets(
    'the typewriter can be turned off, is kept on this device, and keeps the caret where it was',
    (tester) async {
      final w = await openWrite(tester, text: _text);
      final last = SuperEditorInspector.findDocument()!.last;
      await tester.placeCaretInParagraph(last.id, 0);
      w.c.read(focusModeProvider.notifier).set(true);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Typewriter'));
      await tester.pumpAndSettle();
      expect(w.c.read(settingsStoreProvider).read(typewriterKey), false);
      expect(w.c.read(typewriterProvider), isFalse);
      expect(lastLineAt(tester), greaterThan(0.75), reason: 'no room under the last line: it goes back down');
      expect(SuperEditorInspector.findDocumentSelection()!.extent.nodeId, last.id, reason: 'the same editor');

      await tester.tap(find.text('Typewriter'));
      await tester.pumpAndSettle();
      expect(w.c.read(typewriterProvider), isTrue);
      expect(lastLineAt(tester), closeTo(typewriterLine, 0.06));
    },
    variant: TargetPlatformVariant.only(TargetPlatform.windows),
  );

  testWidgets('outside focus mode the page scrolls as it always has', (tester) async {
    await openWrite(tester, text: _text);
    final last = SuperEditorInspector.findDocument()!.last;
    await tester.placeCaretInParagraph(last.id, 0);
    await tester.pumpAndSettle();
    expect(find.text('Typewriter'), findsNothing);
  });

  testWidgets('the typewriter works on a phone, and at once when the device asks for less motion', (tester) async {
    tester.platformDispatcher.accessibilityFeaturesTestValue = const FakeAccessibilityFeatures(disableAnimations: true);
    addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
    final w = await openWrite(tester, text: _text, size: phone);
    w.c.read(focusModeProvider.notifier).set(true);
    await tester.pumpAndSettle();
    // On a phone the caret is placed by a tap in the text, once in focus mode: here, the last line on the screen.
    final page = tester.getRect(find.byKey(const ValueKey('page')));
    final low = SuperEditorInspector.findDocument()!.lastWhere(
      (n) => SuperEditorInspector.findComponentOffset(n.id, Alignment.center).dy < page.bottom - 20,
    );
    expect(lastLineAt(tester, low.id), greaterThan(0.75), reason: 'low on the screen before');
    await tester.placeCaretInParagraph(low.id, 0);
    await tester.pump();
    await tester.pump();
    expect(lastLineAt(tester, low.id), closeTo(typewriterLine, 0.08), reason: 'there at once, with no motion');
    expect(tester.takeException(), isNull);
  });
}
