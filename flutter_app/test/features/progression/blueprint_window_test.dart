import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/progression/progression_providers.dart';
import 'package:novel_builder/features/progression/widgets/live_window.dart';
import 'package:novel_builder/features/progression/widgets/status_window.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/systems/system_presets.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';

/// A novel with the LitRPG system and Protagonist on it, at its blueprint.
Future<ProviderContainer> blueprint(WidgetTester tester, Size size, {String preset = 'litrpg'}) async {
  final c = await pumpApp(tester, size: size, location: '/organize');
  final novel = c.read(libraryServiceProvider).create({'title': 'Super Power'}).id;
  final content = systemPresets.firstWhere((p) => p.id == preset).content;
  c.read(progressionServiceProvider).systems(novel, (x) => x.createSystem(content));
  c.read(characterServiceProvider).change(novel, (x) => x.create(name: 'Protagonist'));
  c.read(openNovelProvider.notifier).open(novel);
  await tester.pumpAndSettle();
  c.read(routerProvider).go('/organize/systems');
  await tester.pumpAndSettle();
  await tester.tap(find.text('The blueprint'));
  await tester.pumpAndSettle();
  return c;
}

/// The blueprint with its window, live: beside it on a wide screen, so a stat renamed in the blueprint is in the
/// window as it is typed; folded above it on a phone, a press away, and kept open going from tab to tab.
void main() {
  setUpAll(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDownAll(() => BlinkController.indeterminateAnimationsEnabled = true);

  testWidgets('on a wide screen the window is beside the blueprint, and a stat renamed there is in it', (tester) async {
    await blueprint(tester, const Size(1400, 2400));
    final window = find.byType(LiveWindow);
    expect(window, findsOneWidget, reason: 'beside it, without a press');
    expect(find.text('The window, as it reads now'), findsNothing);
    expect(find.textContaining('Change the system beside'), findsOneWidget);
    final strength = find.widgetWithText(TextField, 'Strength');
    expect(
      tester.getRect(window).left,
      greaterThan(tester.getRect(strength).right),
      reason: 'to the right of the blueprint',
    );
    expect(find.bySemanticsLabel(RegExp('^Status window for Protagonist')), findsOneWidget);
    expect(find.descendant(of: window, matching: find.text('Strength')), findsOneWidget);

    // Strength renamed in the blueprint: kept as it is typed (after a pause), and in the window.
    await tester.enterText(strength, 'Might');
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();
    expect(find.descendant(of: window, matching: find.text('Might')), findsOneWidget);
    expect(find.descendant(of: window, matching: find.text('Strength')), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a tier given a power in the blueprint: a character at that tier holds it, in the window at once', (
    tester,
  ) async {
    await blueprint(tester, const Size(1400, 2400), preset: 'superhero');
    await tester.tap(find.textContaining('Levels & realms'));
    await tester.pumpAndSettle();
    final window = find.byType(LiveWindow);
    final inWindow = find.descendant(of: window, matching: find.text('Kinetic Release'));
    expect(inWindow, findsNothing);
    expect(find.text('Reaching Delta gives'), findsOneWidget);

    // From the menu of the system's powers, by group.
    final give = find.byTooltip('Give something on reaching Delta');
    await tester.ensureVisible(give);
    await tester.pumpAndSettle();
    await tester.tap(give);
    await tester.pumpAndSettle();
    expect(find.text('Powers'), findsWidgets, reason: 'the menu names the group');
    await tester.tap(find.text('Kinetic Release').last);
    await tester.pumpAndSettle();
    expect(find.widgetWithText(InputChip, 'Kinetic Release'), findsOneWidget);
    expect(inWindow, findsOneWidget, reason: 'Protagonist is at Delta, the first tier');
    expect(find.descendant(of: window, matching: find.text('from Delta')), findsOneWidget);

    // No longer given: gone from the window too.
    await tester.tap(find.byTooltip('No longer given by Delta: Kinetic Release'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(InputChip, 'Kinetic Release'), findsNothing);
    expect(inWindow, findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('on a phone the window is folded above the blueprint, opened with a press, and kept open', (
    tester,
  ) async {
    await blueprint(tester, phone);
    final fold = find.text('The window, as it reads now');
    expect(fold, findsOneWidget);
    expect(find.byType(StatusWindow), findsNothing, reason: 'folded: the blueprint first');
    await tester.ensureVisible(fold);
    await tester.pumpAndSettle();
    await tester.tap(fold);
    await tester.pumpAndSettle();
    expect(find.byType(StatusWindow), findsOneWidget);
    expect(find.textContaining('Change the system below'), findsOneWidget);

    // Another tab of the blueprint: the window stays open above it.
    await tester.ensureVisible(find.textContaining('Levels & realms'));
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining('Levels & realms'));
    await tester.pumpAndSettle();
    expect(find.byType(StatusWindow), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
