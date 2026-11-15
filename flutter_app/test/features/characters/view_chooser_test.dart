import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/characters/widgets/view_chooser.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';

void main() {
  setUp(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDown(() => BlinkController.indeterminateAnimationsEnabled = true);

  Future<ProviderContainer> open(WidgetTester tester) async {
    final c = await pumpApp(tester, size: phone, location: '/organize');
    final novel = addSampleNovel(c.read(novelStoreProvider), now: DateTime(2026, 11, 15).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    await tester.pumpAndSettle();
    return c;
  }

  testWidgets('on a phone, the view in use by name; every way to see the cast in a sheet, by name and what it shows', (
    tester,
  ) async {
    final c = await open(tester);
    final button = find.byKey(const ValueKey('cast-views'));
    expect(button, findsOneWidget);
    expect(find.descendant(of: button, matching: find.text('Cards')), findsOneWidget);
    expect(find.byTooltip('Compass'), findsNothing, reason: 'no strip of icons running off the screen');

    await tester.ensureVisible(button);
    await tester.pumpAndSettle();
    await tester.tap(button);
    await tester.pumpAndSettle();
    expect(find.text('Ways to see your cast'), findsOneWidget);
    for (final group in ['THE CAST', 'BETWEEN THEM', 'IN YOUR PAGES']) {
      expect(find.text(group), findsOneWidget, reason: group);
    }
    for (final v in castViews) {
      final tile = find.byKey(ValueKey('view-${v.view.name}'));
      await tester.ensureVisible(tile);
      expect(
        find.descendant(of: tile, matching: find.text(v.name)),
        findsOneWidget,
        reason: v.name,
      );
      expect(
        find.descendant(of: tile, matching: find.text(v.about)),
        findsOneWidget,
        reason: v.name,
      );
    }
    expect(castViews.map((v) => v.view).toSet(), CastView.values.toSet(), reason: 'every view is offered');
    await tester.ensureVisible(find.byKey(const ValueKey('view-cards')));
    await tester.pumpAndSettle();
    expect(
      tester.getSemantics(find.byKey(const ValueKey('view-cards'))),
      containsSemantics(isSelected: true),
      reason: 'the one in use is marked',
    );

    final compass = find.byKey(const ValueKey('view-compass'));
    await tester.ensureVisible(compass);
    await tester.pumpAndSettle();
    await tester.tap(compass);
    await tester.pumpAndSettle();
    expect(c.read(castViewProvider), CastView.compass);
    expect(find.text('Ways to see your cast'), findsNothing);
    expect(find.descendant(of: button, matching: find.text('Compass')), findsOneWidget);
  });

  testWidgets('at twice the text size the chooser and its sheet fit', (tester) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await open(tester);
    await tester.ensureVisible(find.byKey(const ValueKey('cast-views')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('cast-views')));
    await tester.pumpAndSettle();
    expect(find.text('Ways to see your cast'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
