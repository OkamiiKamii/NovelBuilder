import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/characters/widgets/view_chooser.dart';

/// Shows the cast as [view], as a person would: on a phone through the view chooser (Ways to see your cast), on a wide
/// screen by the view's button.
Future<void> showCastView(WidgetTester tester, CastView view) async {
  final chooser = find.byKey(const ValueKey('cast-views'));
  if (chooser.evaluate().isNotEmpty) {
    await tester.ensureVisible(chooser);
    await tester.pumpAndSettle();
    await tester.tap(chooser);
    await tester.pumpAndSettle();
    final tile = find.byKey(ValueKey('view-${view.name}'));
    await tester.ensureVisible(tile);
    await tester.pumpAndSettle();
    await tester.tap(tile);
  } else {
    final button = find.byTooltip(infoOf(view).name);
    await tester.ensureVisible(button);
    await tester.pumpAndSettle();
    await tester.tap(button);
  }
  await tester.pumpAndSettle();
}
