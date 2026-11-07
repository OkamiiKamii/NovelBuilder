import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/destinations.dart';

import '../helpers/pump_app.dart';

final _digits = [
  LogicalKeyboardKey.digit1,
  LogicalKeyboardKey.digit2,
  LogicalKeyboardKey.digit3,
  LogicalKeyboardKey.digit4,
  LogicalKeyboardKey.digit5,
  LogicalKeyboardKey.digit6,
  LogicalKeyboardKey.digit7,
  LogicalKeyboardKey.digit8,
];

LogicalKeyboardKey get _modifier =>
    defaultTargetPlatform == TargetPlatform.macOS || defaultTargetPlatform == TargetPlatform.iOS
    ? LogicalKeyboardKey.metaLeft
    : LogicalKeyboardKey.controlLeft;

Future<void> _press(WidgetTester tester, LogicalKeyboardKey key) async {
  await tester.sendKeyDownEvent(_modifier);
  await tester.sendKeyEvent(key);
  await tester.sendKeyUpEvent(_modifier);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets(
    'Cmd/Ctrl+1–8 go to the areas in order, and Cmd/Ctrl+, opens Settings',
    (tester) async {
      final container = await pumpApp(tester);
      for (var i = 0; i < Destination.values.length; i++) {
        await _press(tester, _digits[i]);
        expect(currentLocation(container), Destination.values[i].path);
      }
      await _press(tester, LogicalKeyboardKey.digit1);
      await _press(tester, LogicalKeyboardKey.comma);
      expect(currentLocation(container), Destination.settings.path);
    },
    variant: TargetPlatformVariant.only(TargetPlatform.macOS),
  );

  testWidgets('Android and other platforms use Ctrl', (tester) async {
    final container = await pumpApp(tester);
    await _press(tester, LogicalKeyboardKey.digit3);
    expect(currentLocation(container), Destination.organize.path);
  }, variant: TargetPlatformVariant.only(TargetPlatform.android));
}
