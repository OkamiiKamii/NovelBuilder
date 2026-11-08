import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/write/writing_prefs.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';
import 'write_page_test.dart' show openWrite;

void main() {
  setUp(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDown(() => BlinkController.indeterminateAnimationsEnabled = true);

  testWidgets('on a phone the tools beside the page are a drawer that names each, and opens what is chosen', (
    tester,
  ) async {
    final w = await openWrite(tester, size: phone);
    expect(find.byTooltip('Version history'), findsNothing, reason: 'no bare icons for these on a phone');
    expect(find.byTooltip('Writing settings'), findsOneWidget, reason: 'the most used stay at hand');
    await tester.tap(find.text('Desk'));
    await tester.pumpAndSettle();
    for (final name in ['Notes for this chapter', 'Focus mode', 'Alternate drafts', 'Version history']) {
      expect(find.text(name), findsOneWidget);
    }
    expect(find.textContaining('compare, and bring one back'), findsOneWidget);
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(textContrastGuideline));

    await tester.tap(find.text('Focus mode'));
    await tester.pumpAndSettle();
    expect(w.c.read(focusModeProvider), isTrue, reason: 'the drawer closes and the tool opens');
    expect(find.text('The desk'), findsNothing);
  });

  testWidgets('on a computer the tools stay icons over the page', (tester) async {
    await openWrite(tester);
    expect(find.text('Desk'), findsNothing);
    expect(find.byTooltip('Version history'), findsOneWidget);
  });
}
