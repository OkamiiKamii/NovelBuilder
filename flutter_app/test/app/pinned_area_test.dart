import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/destinations.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/app/shell/pinned_area.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';

import '../helpers/pump_app.dart';

void main() {
  const day = 24 * 60 * 60 * 1000;
  final now = DateTime(2026, 11, 12).millisecondsSinceEpoch;

  test('the visits kept are this week’s', () {
    final v = visitsIn({
      'plan': [now - 8 * day, now - 2 * day, now],
      'review': [now - 9 * day],
      'nonsense': 'x',
    }, now);
    expect(v, {
      'plan': [now - 2 * day, now],
    });
    expect(visitsIn(null, now), isEmpty);
  });

  test('the area opened most this week, four times or more, is offered; not one kept, nor one declined', () {
    final week = {
      'plan': [for (var i = 0; i < 5; i++) now - i * day],
      'progress': [for (var i = 0; i < 4; i++) now - i * day],
      'review': [now, now, now],
    };
    expect(pinOffer(week, pinned: null, declined: {}), Destination.plan);
    expect(pinOffer(week, pinned: Destination.plan, declined: {}), Destination.progress);
    expect(pinOffer(week, pinned: null, declined: {'plan'}), Destination.progress);
    expect(
      pinOffer(week, pinned: Destination.progress, declined: {'plan'}),
      isNull,
      reason: 'review: three times',
    );
  });

  Future<ProviderContainer> inBook(WidgetTester tester) async {
    final c = await pumpApp(tester, size: phone);
    c.read(openNovelProvider.notifier).open(c.read(libraryServiceProvider).create({'title': 'A'}).id);
    c.read(routerProvider).go(Destination.write.path);
    await tester.pumpAndSettle();
    return c;
  }

  Finder onBar(String label) => find.descendant(of: find.byType(NavigationBar), matching: find.text(label));
  Finder inMore(Finder f) => find.descendant(of: find.byType(BottomSheet), matching: f);

  testWidgets('an area kept on the bar from More: a fifth place, one press away; its pin takes it off', (tester) async {
    final c = await inBook(tester);
    expect(onBar('Plan'), findsNothing);

    await tester.tap(find.byIcon(Icons.more_horiz));
    await tester.pumpAndSettle();
    final pin = inMore(find.byTooltip('Keep Progress on the bar'));
    await tester.ensureVisible(pin);
    await tester.pumpAndSettle();
    await tester.tap(pin);
    await tester.pumpAndSettle();
    expect(c.read(settingsStoreProvider).read(pinnedAreaSettingKey), 'progress');
    expect(find.text('Progress is on the bar, one press away.'), findsOneWidget);
    await tester.tapAt(const Offset(20, 20));
    await tester.pumpAndSettle();

    expect(tester.widget<NavigationBar>(find.byType(NavigationBar)).destinations, hasLength(5));
    await tester.tap(onBar('Progress'));
    await tester.pumpAndSettle();
    expect(currentLocation(c), Destination.progress.path);
    expect(tester.widget<NavigationBar>(find.byType(NavigationBar)).selectedIndex, 3, reason: 'its own place lit');

    // Another kept takes its place; then that one's pin takes it off.
    await tester.tap(find.byIcon(Icons.more_horiz));
    await tester.pumpAndSettle();
    await tester.tap(inMore(find.byTooltip('Keep Plan on the bar')));
    await tester.pumpAndSettle();
    expect(find.text('Plan is on the bar, in place of Progress.'), findsOneWidget);
    expect(inMore(find.byTooltip('Take Plan off the bar')), findsOneWidget);
    await tester.tap(inMore(find.byTooltip('Take Plan off the bar')));
    await tester.pumpAndSettle();
    expect(c.read(settingsStoreProvider).read(pinnedAreaSettingKey), isNull);
    await tester.tapAt(const Offset(20, 20));
    await tester.pumpAndSettle();
    expect(tester.widget<NavigationBar>(find.byType(NavigationBar)).destinations, hasLength(4));
  });

  testWidgets('an area opened often from More is offered for the bar: kept in a press, or Not now, remembered', (
    tester,
  ) async {
    final c = await inBook(tester);
    for (var i = 0; i < pinOfferVisits; i++) {
      expect(find.textContaining('You often open'), findsNothing);
      await tester.tap(find.byIcon(Icons.more_horiz));
      await tester.pumpAndSettle();
      await tester.tap(inMore(find.text('Review')));
      await tester.pumpAndSettle();
    }
    await tester.tap(find.byIcon(Icons.more_horiz));
    await tester.pumpAndSettle();
    expect(inMore(find.text('You often open Review. Keep it on the bar, one press away?')), findsOneWidget);
    await tester.tap(inMore(find.text('Not now')));
    await tester.pumpAndSettle();
    expect(find.textContaining('You often open'), findsNothing);
    expect(c.read(settingsStoreProvider).read(pinDeclinedSettingKey), ['review']);
    await tester.tapAt(const Offset(20, 20));
    await tester.pumpAndSettle();

    // Not offered again; Plan, opened as often, is, and kept in a press.
    for (var i = 0; i < pinOfferVisits; i++) {
      await tester.tap(find.byIcon(Icons.more_horiz));
      await tester.pumpAndSettle();
      expect(find.textContaining('You often open Review'), findsNothing);
      await tester.tap(inMore(find.text('Plan')));
      await tester.pumpAndSettle();
    }
    await tester.tap(find.byIcon(Icons.more_horiz));
    await tester.pumpAndSettle();
    await tester.tap(inMore(find.text('Keep it on the bar')));
    await tester.pumpAndSettle();
    expect(c.read(pinnedAreaProvider), Destination.plan);
    expect(find.textContaining('You often open'), findsNothing);
    await tester.tapAt(const Offset(20, 20));
    await tester.pumpAndSettle();
    expect(onBar('Plan'), findsOneWidget);
  });
}
