import 'package:flutter_test/flutter_test.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';
import 'write_page_test.dart' show openWrite;

void main() {
  setUp(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDown(() => BlinkController.indeterminateAnimationsEnabled = true);

  testWidgets('on a phone the formatting rides on the keyboard, and goes with it', (tester) async {
    await openWrite(tester, size: phone);
    expect(find.byTooltip('Bold (⌘B)'), findsNothing, reason: 'reading: the page has the screen');
    expect(find.textContaining('Today:'), findsOneWidget);

    // The keyboard comes up.
    tester.view.viewInsets = FakeViewPadding(bottom: 300 * tester.view.devicePixelRatio);
    addTearDown(tester.view.resetViewInsets);
    await tester.pumpAndSettle();
    final bold = find.byTooltip('Bold (⌘B)');
    expect(bold, findsOneWidget);
    expect(tester.getRect(bold).bottom, greaterThan(phone.height - 300 - 80), reason: 'just over the keyboard');
    expect(find.textContaining('Today:'), findsNothing, reason: 'the tray in place of the count while typing');
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));

    tester.view.resetViewInsets();
    await tester.pumpAndSettle();
    expect(find.byTooltip('Bold (⌘B)'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('on a computer the formatting stays over the page', (tester) async {
    await openWrite(tester);
    final bold = find.byTooltip('Bold (⌘B)');
    expect(bold, findsOneWidget);
    expect(tester.getRect(bold).top, lessThan(200));
  });
}
