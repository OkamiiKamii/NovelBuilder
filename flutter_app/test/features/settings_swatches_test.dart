import 'dart:ui' show CheckedState;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/theme/theme_choice.dart';

import '../helpers/pump_app.dart';

void main() {
  for (final size in [desktop, phone]) {
    testWidgets('the looks are pages in their own colours, one chosen, each a radio button ($size)', (tester) async {
      final c = await pumpApp(tester, size: size, location: '/settings');
      final semantics = tester.ensureSemantics();
      for (final choice in ThemeChoice.values) {
        final node = tester.getSemantics(find.bySemanticsLabel(choice.label));
        expect(node.flagsCollection.isInMutuallyExclusiveGroup, isTrue);
        expect(
          node.flagsCollection.isChecked,
          choice == ThemeChoice.auto ? CheckedState.isTrue : CheckedState.isFalse,
          reason: '${choice.name} checked only when chosen',
        );
      }
      expect(
        find.text('Chapter I'),
        findsNWidgets(5),
        reason: 'parchment, midnight, both halves of the device, and System Monolith',
      );
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      await expectLater(tester, meetsGuideline(textContrastGuideline));

      await tester.tap(find.bySemanticsLabel(ThemeChoice.dark.label));
      await tester.pumpAndSettle();
      expect(c.read(themeChoiceProvider), ThemeChoice.dark);
      expect(find.byIcon(Icons.check), findsOneWidget);
      semantics.dispose();
    });
  }
}
