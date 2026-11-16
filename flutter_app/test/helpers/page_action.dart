import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Presses one of a character page's actions, [label]: its button on a wide screen, or (on a phone, where they are in
/// the page's menu) the menu, then the action in it.
Future<void> pressPageAction(WidgetTester tester, String label) async {
  final button = find.widgetWithText(OutlinedButton, label);
  if (button.evaluate().isEmpty) {
    await tester.tap(find.byTooltip(RegExp('^More options for ')));
    await tester.pumpAndSettle();
    await tester.tap(find.text(label).last);
  } else {
    await tester.ensureVisible(button);
    await tester.pumpAndSettle();
    await tester.tap(button);
  }
  await tester.pumpAndSettle();
}
