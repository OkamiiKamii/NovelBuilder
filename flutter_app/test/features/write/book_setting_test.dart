import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/write/book_setting.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:super_editor/super_editor.dart';
import 'package:super_text_layout/super_text_layout.dart';

import 'title_ideas_test.dart' show openChapter;
import 'write_page_test.dart' show storedText;

const _text =
    'The bell in the tower had not rung in thirty-one years, and when it rang, Wren dropped the ink.\n'
    '* * *\n'
    'Nobody guarded the gate.';

/// Every span of the page's text, with its style.
List<TextSpan> spans(WidgetTester tester) => [
  for (final rich in tester.widgetList<RichText>(
    find.descendant(of: find.byType(SuperEditor), matching: find.byWidgetPredicate((w) => w is RichText)),
  ))
    for (final span in [rich.text, if (rich.text is TextSpan) ...?(rich.text as TextSpan).children])
      if (span is TextSpan && (span.text ?? '').isNotEmpty) span,
];

void main() {
  setUpAll(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDownAll(() => BlinkController.indeterminateAnimationsEnabled = true);

  testWidgets('the chapter opens as a book does, the break is an ornament, and the text is untouched', (tester) async {
    final w = await openChapter(tester, title: 'The Bell', text: _text);
    final all = spans(tester);
    final body = all.firstWhere((s) => s.text!.contains('Nobody')).style!.fontSize!;

    final initial = all.firstWhere((s) => s.text == 'T');
    expect(initial.style!.fontSize, greaterThan(body * 2), reason: 'the raised initial');
    final caps = all.firstWhere((s) => s.text == 'he bell in the');
    expect(caps.style!.fontFeatures, contains(const FontFeature.enable('smcp')), reason: 'small capitals');

    final ornament = tester
        .widgetList<RichText>(
          find.descendant(of: find.byType(SuperEditor), matching: find.byWidgetPredicate((w) => w is RichText)),
        )
        .firstWhere((r) => r.text.toPlainText() == '* * *');
    expect(ornament.textAlign, TextAlign.center);

    expect(storedText(w.c, w.novel, w.chapter), _text, reason: 'drawn, never written');
  });

  testWidgets('turned off in the writing settings, the page is plain again', (tester) async {
    final w = await openChapter(tester, title: 'The Bell', text: _text);
    await tester.tap(find.byTooltip('Writing settings'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Set like a book'), 200, scrollable: find.byType(Scrollable).last);
    await tester.tap(find.text('Set like a book'));
    await tester.pumpAndSettle();
    expect(w.c.read(bookSettingProvider), isFalse);
    expect(w.c.read(settingsStoreProvider).read(bookSettingKey), isFalse);
    await tester.tapAt(const Offset(5, 5));
    await tester.pumpAndSettle();
    expect(spans(tester).where((s) => s.text == 'T'), isEmpty, reason: 'no initial set apart');
  });
}
