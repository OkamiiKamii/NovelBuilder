import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/destinations.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/app/shell/app_shell.dart';
import 'package:novel_builder/app/theme/app_theme.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';

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

  Finder inRail(String label) => find.descendant(of: find.byType(NavigationRail), matching: find.text(label));

  testWidgets('desktop: on the shelf the rail is the Library and the settings gear; inside a book, the novel', (
    tester,
  ) async {
    final container = await pumpApp(tester, size: desktop);
    expect(find.byType(NavigationRail), findsOneWidget);
    expect(tester.widget<NavigationRail>(find.byType(NavigationRail)).extended, isTrue);
    expect(find.byType(NavigationBar), findsNothing);
    expect(inRail('Library'), findsOneWidget);
    expect(inRail('Settings'), findsOneWidget);
    for (final d in Destination.values.where((d) => d.needsNovel)) {
      expect(inRail(d.label), findsNothing, reason: '${d.label} is inside a book');
    }

    container.read(openNovelProvider.notifier).open(container.read(libraryServiceProvider).create({'title': 'A'}).id);
    container.read(routerProvider).go(Destination.write.path);
    await tester.pumpAndSettle();
    expect(inRail('Settings'), findsNothing, reason: 'the app’s settings are the gear on the shelf');
    for (final d in AppShell.bookAreas.where((d) => d != Destination.library)) {
      await tester.tap(inRail(d.label));
      await tester.pumpAndSettle();
      expect(currentLocation(container), d.path);
      expect(
        find.widgetWithText(AppBar, d.label).evaluate().isEmpty,
        isTrue,
        reason: 'pages use PageScaffold, not AppBar',
      );
    }

    // The Library goes back to the shelf, and the gear beside it to Settings.
    await tester.tap(inRail('Library'));
    await tester.pumpAndSettle();
    expect(currentLocation(container), '/');
    expect(inRail('Write'), findsNothing);
    await tester.tap(inRail('Settings'));
    await tester.pumpAndSettle();
    expect(currentLocation(container), Destination.settings.path);
  });

  testWidgets('tablet: a compact rail with labels under the icons', (tester) async {
    await pumpApp(tester, size: tablet);
    final rail = tester.widget<NavigationRail>(find.byType(NavigationRail));
    expect(rail.extended, isFalse);
    expect(rail.labelType, NavigationRailLabelType.all);
  });

  testWidgets('phone: the shelf has no bar, only the gear; inside a book, the bar and More for the novel', (
    tester,
  ) async {
    final container = await pumpApp(tester, size: phone);
    expect(find.byType(NavigationRail), findsNothing);
    expect(find.byType(NavigationBar), findsNothing, reason: 'Write, Organize and More are inside a book');

    // The gear beside the Library is Settings; there, a way back.
    await tester.tap(find.byTooltip('Settings'));
    await tester.pumpAndSettle();
    expect(currentLocation(container), Destination.settings.path);
    expect(find.byType(NavigationBar), findsNothing);
    await tester.tap(find.byIcon(Icons.arrow_back));
    await tester.pumpAndSettle();
    expect(currentLocation(container), '/');

    container.read(openNovelProvider.notifier).open(container.read(libraryServiceProvider).create({'title': 'A'}).id);
    container.read(routerProvider).go(Destination.write.path);
    await tester.pumpAndSettle();
    expect(find.byType(NavigationBar), findsOneWidget);
    for (final d in AppShell.compactPrimary) {
      expect(find.descendant(of: find.byType(NavigationBar), matching: find.text(d.label)), findsOneWidget);
    }
    await tester.tap(find.text('More'));
    await tester.pumpAndSettle();
    expect(
      find.descendant(of: find.byType(BottomSheet), matching: find.text('Settings')),
      findsNothing,
      reason: 'More is the novel’s; Settings is the gear',
    );
    await tester.tapAt(const Offset(20, 20));
    await tester.pumpAndSettle();

    final rest = AppShell.bookAreas.where((d) => !AppShell.compactPrimary.contains(d));
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
    final container = await pumpApp(tester, size: const Size(844, 390));
    container.read(openNovelProvider.notifier).open(container.read(libraryServiceProvider).create({'title': 'A'}).id);
    container.read(routerProvider).go(Destination.write.path);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.scrollUntilVisible(
      find.descendant(of: find.byType(NavigationRail), matching: find.byIcon(Destination.progress.icon)),
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

  testWidgets('going to another area turns the page being left like a leaf, then leaves nothing over the new one', (
    tester,
  ) async {
    final container = await pumpApp(tester, size: desktop);
    container.read(openNovelProvider.notifier).open(container.read(libraryServiceProvider).create({'title': 'A'}).id);
    container.read(routerProvider).go(Destination.organize.path);
    await tester.pumpAndSettle();
    expect(find.byType(RawImage), findsNothing);
    await tester.tap(find.text(Destination.write.label).first);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.byType(RawImage), findsOneWidget, reason: 'the leaf, turning');
    expect(currentLocation(container), Destination.write.path, reason: 'the new area is open under it at once');
    await tester.pumpAndSettle();
    expect(find.byType(RawImage), findsNothing, reason: 'gone once turned');

    // Back the other way, and with less motion asked for, no leaf at all.
    tester.platformDispatcher.accessibilityFeaturesTestValue = const FakeAccessibilityFeatures(disableAnimations: true);
    addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
    await tester.pumpAndSettle();
    await tester.tap(find.text(Destination.library.label).first);
    await tester.pump();
    expect(find.byType(RawImage), findsNothing);
    expect(currentLocation(container), Destination.library.path);
  });

  testWidgets('a dialog opened from the binding is in the app\'s paper colours, not gilt on leather', (tester) async {
    final container = await pumpApp(tester, size: desktop);
    container.read(openNovelProvider.notifier).open(container.read(libraryServiceProvider).create({'title': 'A'}).id);
    container.read(routerProvider).go(Destination.write.path);
    await tester.pumpAndSettle();
    final rail = Theme.of(
      tester.element(find.descendant(of: find.byType(NavigationRail), matching: find.text('Library'))),
    ).colorScheme;
    await tester.tap(find.byTooltip(RegExp(r'^Search the whole novel')));
    await tester.pumpAndSettle();
    final inDialog = find.descendant(of: find.byType(Dialog), matching: find.byType(TextField)).first;
    expect(Theme.of(tester.element(inDialog)).colorScheme.onSurface, AppTheme.light().colorScheme.onSurface);
    expect(rail.onSurface, isNot(AppTheme.light().colorScheme.onSurface), reason: 'the rail itself is gilt');
  });

  testWidgets('on a phone with buttons at its foot, the barless Library keeps clear of them', (tester) async {
    tester.view.padding = const FakeViewPadding(bottom: 120);
    addTearDown(tester.view.resetPadding);
    await pumpApp(tester, size: phone);
    final page = tester.getRect(find.byType(ListView).first);
    expect(page.bottom, lessThanOrEqualTo(phone.height - 120 / tester.view.devicePixelRatio + 0.5));
  });
}
