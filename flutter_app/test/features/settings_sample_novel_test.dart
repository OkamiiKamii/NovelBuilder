import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/features/write/outline_panel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';

import '../helpers/pump_app.dart';
import '../perf/large_project_test.dart' show screens;

void main() {
  testWidgets('Settings adds a copy of the sample novel beside your own, and opens it', (tester) async {
    final c = await pumpApp(tester, size: phone, location: '/settings');
    final own = c.read(libraryServiceProvider).create({'title': 'My own book'});
    final before = c.read(novelStoreProvider).load(own.id)!.toJson(exportedAt: 0);

    for (final title in [sampleNovelTitle, '$sampleNovelTitle 2']) {
      await tester.ensureVisible(find.text('Add the sample novel'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Add the sample novel'));
      await tester.pumpAndSettle();
      expect(find.text('“$title” is in your library.'), findsOneWidget);
      expect([for (final n in c.read(libraryProvider)) n.title], contains(title));
      ScaffoldMessenger.of(tester.element(find.text('Add the sample novel'))).removeCurrentSnackBar();
      await tester.pumpAndSettle();
    }
    expect(c.read(libraryProvider), hasLength(3));
    expect(c.read(novelStoreProvider).load(own.id)!.toJson(exportedAt: 0), before, reason: 'your own book untouched');

    await tester.tap(find.text('Add the sample novel'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    final opened = c.read(openNovelProvider);
    expect(c.read(libraryProvider).firstWhere((n) => n.id == opened).title, '$sampleNovelTitle 3');
    expect(currentLocation(c), '/write');
    // Under the day book and the road to the draft, at the head of the contents.
    await tester.scrollUntilVisible(
      find.text('The Bell'),
      200,
      scrollable: find.descendant(of: find.byType(OutlinePanel), matching: find.byType(Scrollable)).first,
    );
    expect(find.text('The Bell'), findsWidgets, reason: 'its first chapter');
  });

  testWidgets('every screen of the app opens on the sample novel', (tester) async {
    final c = await pumpApp(tester, size: phone);
    final novel = addSampleNovel(c.read(novelStoreProvider), now: DateTime(2026, 11, 9).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    await tester.pumpAndSettle();
    for (final screen in screens) {
      c.read(routerProvider).go(screen);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull, reason: screen);
    }
    c.read(routerProvider).go('/organize');
    await tester.pumpAndSettle();
    expect(find.textContaining('Wren Hollis'), findsWidgets);
  });
}
