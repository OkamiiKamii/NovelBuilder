import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/modules/genre_shelf.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';
import 'package:novel_builder/shared/domain/modules/module_defs.dart';

import '../../helpers/pump_app.dart';

void main() {
  testWidgets('on a phone the genre modules are a shelf of tiles: turn one on, open one’s full card in its place', (
    tester,
  ) async {
    final c = await pumpApp(tester, size: phone);
    final novel = addSampleNovel(c.read(novelStoreProvider), now: DateTime(2026, 11, 10).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    await tester.pumpAndSettle();
    c.read(routerProvider).go('/organize/modules');
    await tester.pumpAndSettle();
    final shelf = find.byType(GenreShelf);
    await tester.scrollUntilVisible(shelf, 300, scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();

    // A tile for each, no full card among them.
    final first = builtinModules.first;
    expect(find.descendant(of: shelf, matching: find.text(first.name)), findsOneWidget);
    expect(find.byKey(ValueKey('module:${first.id}')), findsNothing);
    expect({for (final m in builtinModules) moduleTone(m)}, hasLength(builtinModules.length), reason: 'each its own');
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(textContrastGuideline));

    // Turned on from its tile, in a press: the tile then says so and opens it.
    final turnOn = find.descendant(of: shelf, matching: find.bySemanticsLabel('Turn on ${first.name}'));
    await tester.ensureVisible(turnOn);
    await tester.pumpAndSettle();
    await tester.tap(turnOn);
    await tester.pumpAndSettle();
    final installed = c.read(novelStoreProvider).rowsIn(novel.id, 'projectModules');
    expect(installed.any((r) => r['moduleId'] == first.id && r['enabled'] == true), isTrue);
    expect(find.descendant(of: shelf, matching: find.bySemanticsLabel('Open ${first.name}')), findsOneWidget);

    // Its full card opens in its place, and closes back to the shelf.
    final second = builtinModules[1];
    final tile = find.descendant(of: shelf, matching: find.text(second.name));
    await tester.ensureVisible(tile);
    await tester.pumpAndSettle();
    await tester.tap(tile);
    await tester.pumpAndSettle();
    expect(find.byKey(ValueKey('module:${second.id}')), findsOneWidget);
    await tester.ensureVisible(find.text('Back to the shelf'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Back to the shelf'));
    await tester.pumpAndSettle();
    expect(find.byKey(ValueKey('module:${second.id}')), findsNothing);
  });
}
