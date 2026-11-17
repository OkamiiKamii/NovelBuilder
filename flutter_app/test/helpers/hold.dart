import 'package:flutter_test/flutter_test.dart';

/// Holds [finder] (a Hold to Confirm button: what cannot be taken back) until it is done, as the author would.
Future<void> holdToConfirm(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
  final gesture = await tester.startGesture(tester.getCenter(finder));
  await tester.pump();
  // A little past the time it takes to fill.
  for (var i = 0; i < 6; i++) {
    await tester.pump(const Duration(milliseconds: 200));
  }
  await gesture.up();
  await tester.pumpAndSettle();
}
