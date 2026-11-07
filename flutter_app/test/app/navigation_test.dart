import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/destinations.dart';
import 'package:novel_builder/app/shell/app_shell.dart';

import '../helpers/pump_app.dart';

void main() {
  group('Destination.forLocation', () {
    test('maps every destination path, and nested paths, to its destination', () {
      for (final d in Destination.values) {
        expect(Destination.forLocation(d.path), d);
        if (d != Destination.library) expect(Destination.forLocation('${d.path}/something'), d);
      }
      expect(Destination.forLocation('/write?chapter=1'), Destination.write);
    });

    test('does not confuse look-alike paths', () {
      expect(Destination.forLocation('/writer'), isNull);
      expect(Destination.forLocation('/nowhere'), isNull);
    });
  });

  testWidgets('desktop: a labelled rail reaches every area', (tester) async {
    final container = await pumpApp(tester, size: desktop);
    expect(find.byType(NavigationRail), findsOneWidget);
    expect(tester.widget<NavigationRail>(find.byType(NavigationRail)).extended, isTrue);
    expect(find.byType(NavigationBar), findsNothing);

    for (final d in Destination.values) {
      await tester.tap(find.descendant(of: find.byType(NavigationRail), matching: find.text(d.label)));
      await tester.pumpAndSettle();
      expect(currentLocation(container), d.path);
      expect(
        find.widgetWithText(AppBar, d.label).evaluate().isEmpty,
        isTrue,
        reason: 'pages use PageScaffold, not AppBar',
      );
      expect(find.descendant(of: find.byType(ListView), matching: find.text(d.label)), findsWidgets);
    }
  });

  testWidgets('tablet: a compact rail with labels under the icons', (tester) async {
    await pumpApp(tester, size: tablet);
    final rail = tester.widget<NavigationRail>(find.byType(NavigationRail));
    expect(rail.extended, isFalse);
    expect(rail.labelType, NavigationRailLabelType.all);
  });

  testWidgets('phone: bottom bar with More for the remaining areas', (tester) async {
    final container = await pumpApp(tester, size: phone);
    expect(find.byType(NavigationRail), findsNothing);
    expect(find.byType(NavigationBar), findsOneWidget);
    for (final d in AppShell.compactPrimary) {
      expect(find.descendant(of: find.byType(NavigationBar), matching: find.text(d.label)), findsOneWidget);
    }

    final rest = Destination.values.where((d) => !AppShell.compactPrimary.contains(d));
    for (final d in rest) {
      await tester.tap(find.text('More'));
      await tester.pumpAndSettle();
      await tester.tap(find.descendant(of: find.byType(BottomSheet), matching: find.text(d.label)));
      await tester.pumpAndSettle();
      expect(currentLocation(container), d.path);
      expect(find.byType(BottomSheet), findsNothing);
      // "More" is the highlighted item while one of its areas is shown.
      expect(tester.widget<NavigationBar>(find.byType(NavigationBar)).selectedIndex, AppShell.compactPrimary.length);
    }
  });

  testWidgets('a short landscape window can still reach every rail item', (tester) async {
    await pumpApp(tester, size: const Size(844, 390));
    expect(tester.takeException(), isNull);
    await tester.scrollUntilVisible(
      find.descendant(of: find.byType(NavigationRail), matching: find.byIcon(Destination.settings.icon)),
      100,
      scrollable: find.descendant(of: find.byType(AppShell), matching: find.byType(Scrollable)).first,
    );
  });

  testWidgets('an unknown address shows a not-found page with a way back', (tester) async {
    final container = await pumpApp(tester, location: '/does-not-exist');
    expect(find.text('This page does not exist'), findsOneWidget);
    await tester.tap(find.text('Back to library'));
    await tester.pumpAndSettle();
    expect(currentLocation(container), '/');
  });

  testWidgets('every area is usable at 200% text size on a phone', (tester) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    for (final d in Destination.values) {
      await pumpApp(tester, size: phone, location: d.path);
      expect(tester.takeException(), isNull, reason: d.label);
    }
  });
}
