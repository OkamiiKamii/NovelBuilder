import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/app/shell/ribbons.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';

import '../helpers/pump_app.dart';

void main() {
  testWidgets('a ribbon laid in a page turns back to it from anywhere in the book, and can be taken out', (
    tester,
  ) async {
    final c = await pumpApp(tester, size: phone, location: '/plan');
    final novel = c.read(libraryServiceProvider).create({'title': 'Ash'}).id;
    late String mira;
    c.read(characterServiceProvider).change(novel, (x) => mira = x.create(name: 'Mira').id);
    c.read(openNovelProvider.notifier).open(novel);
    c.read(routerProvider).go('/organize/character/$mira');
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('Ribbons: mark pages of this book'));
    await tester.pumpAndSettle();
    expect(find.text('Ribbons'), findsOneWidget);
    await tester.tap(find.text('Lay a ribbon in this page'));
    await tester.pumpAndSettle();
    final name = tester.widget<TextField>(find.byType(TextField).last);
    expect(name.controller!.text, 'Mira', reason: 'named for the character it lies at');
    await tester.tap(find.text('Lay the ribbon'));
    await tester.pumpAndSettle();
    expect(readRibbons(c.read(settingsStoreProvider), novel).single.path, '/organize/character/$mira');
    expect(find.byTooltip('Ribbons: this page is marked “Mira”'), findsOneWidget);

    c.read(routerProvider).go('/plan/calendar');
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Ribbons: 1 in this book'));
    await tester.pumpAndSettle();
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(textContrastGuideline));
    await tester.tap(find.text('Mira'));
    await tester.pumpAndSettle();
    expect(currentLocation(c), '/organize/character/$mira', reason: 'turned to the page');

    await tester.tap(find.byTooltip('Ribbons: this page is marked “Mira”'));
    await tester.pumpAndSettle();
    expect(find.text('Here'), findsOneWidget);
    await tester.tap(find.byTooltip('Take out the ribbon “Mira”'));
    await tester.pumpAndSettle();
    expect(readRibbons(c.read(settingsStoreProvider), novel), isEmpty);
    expect(find.text('Lay a ribbon in this page'), findsOneWidget);
  });

  testWidgets('the ribbon steps aside while the keyboard is up', (tester) async {
    final c = await pumpApp(tester, size: phone, location: '/plan');
    final novel = c.read(libraryServiceProvider).create({'title': 'Ash'}).id;
    c.read(openNovelProvider.notifier).open(novel);
    await tester.pumpAndSettle();
    expect(find.byTooltip('Ribbons: mark pages of this book'), findsOneWidget);
    tester.view.viewInsets = const FakeViewPadding(bottom: 900);
    addTearDown(tester.view.resetViewInsets);
    await tester.pumpAndSettle();
    expect(find.byTooltip('Ribbons: mark pages of this book'), findsNothing);
  });

  testWidgets('no ribbons on the shelf', (tester) async {
    await pumpApp(tester, size: phone);
    expect(find.byType(RibbonMarker), findsNothing);
  });

  test('a ribbon lies in Write at its chapter; new ribbons take a silk not yet used', () {
    const r = (path: '/write', node: 'c1', label: 'One', silk: 0);
    expect(ribbonHere(r, '/write', 'c1'), isTrue);
    expect(ribbonHere(r, '/write', 'c2'), isFalse);
    expect(ribbonHere(r, '/plan', 'c1'), isFalse);
    expect(nextSilk([r, (path: '/plan', node: null, label: 'Plan', silk: 2)]), 1);
  });
}
