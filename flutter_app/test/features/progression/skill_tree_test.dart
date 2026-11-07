// Ability paths seen through one character: held, can be gained, locked; as of a chapter; the inspector; zoom.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/visualize/visualize_providers.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/abilities/paths.dart';
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:novel_builder/shared/domain/progression/snapshots.dart';

import '../../helpers/pump_app.dart';
import '../../shared/domain/fixtures.dart';

/// The growth novel, open on Ability paths, and the character who holds the most there.
Future<({ProviderContainer c, AbilityTree tree, String who, StoryModel model})> _open(
  WidgetTester tester, {
  Size size = const Size(1600, 2000),
}) async {
  final c = await pumpApp(tester, size: size, location: '/');
  final s = loadFixture('growth');
  c.read(novelStoreProvider).putNovel(s);
  final model = StoryModel.fromSnapshot(s);
  final tree = abilityTree(model, [for (final r in s.rows('progressSnapshots')) ProgressSnapshot(r)]);
  final counts = <String, int>{};
  for (final n in tree.nodes) {
    for (final h in n.holders) {
      counts[h.id] = (counts[h.id] ?? 0) + 1;
    }
  }
  final who = (counts.entries.toList()..sort((a, b) => b.value - a.value)).first.key;
  c.read(openNovelProvider.notifier).open(s.project['id']! as String);
  c.read(routerProvider).go('/visualize/abilities');
  await tester.pumpAndSettle();
  return (c: c, tree: tree, who: who, model: model);
}

void main() {
  testWidgets('seen through no one, nothing is said to be held or locked', (tester) async {
    await _open(tester);
    expect(find.textContaining(RegExp(r'^(Held|Locked|Can be gained) \(')), findsNothing);
  });

  testWidgets('seen through a character: each ability held, can be gained or locked, counted, and said', (
    tester,
  ) async {
    final w = await _open(tester);
    w.c.read(vizStateProvider.notifier).setFilter({
      'characters': [w.who],
    });
    await tester.pumpAndSettle();
    final name = w.model.entries[w.who]!.name;
    expect(find.text('For $name, as of'), findsOneWidget);
    expect(find.text('The end of the story'), findsOneWidget);
    // The legend counts each state; the drawing says each node's.
    expect(find.textContaining(RegExp(r'^Held \(\d+\)$')), findsOneWidget);
    expect(find.textContaining(RegExp(r'^Locked \(\d+\)$')), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp(r', held')), findsWidgets);
    expect(find.bySemanticsLabel(RegExp(r', locked')), findsWidgets);

    // The inspector: where the selected one stands, and why when locked.
    final held = w.tree.nodes.firstWhere((n) => n.holders.any((h) => h.id == w.who));
    w.c.read(vizStateProvider.notifier).select(held.ref);
    await tester.pumpAndSettle();
    expect(find.text('$name holds it at the end of the story.'), findsOneWidget);
    final heldSet = {
      for (final n in w.tree.nodes)
        if (n.holders.any((h) => h.id == w.who)) n.key,
    };
    final locked = w.tree.nodes.firstWhere((n) => standings(w.tree, heldSet)[n.key] == Standing.locked);
    w.c.read(vizStateProvider.notifier).select(locked.ref);
    await tester.pumpAndSettle();
    expect(find.textContaining('Locked for $name at the end of the story.'), findsOneWidget);
    expect(find.textContaining(RegExp('Needs|Excluded by')), findsWidgets);
  });

  testWidgets('as of an earlier chapter, what was held by then', (tester) async {
    final w = await _open(tester);
    w.c.read(vizStateProvider.notifier).setFilter({
      'characters': [w.who],
    });
    await tester.pumpAndSettle();
    String heldCount() => (tester.widget<Text>(find.textContaining(RegExp(r'^Held \(\d+\)$'))).data)!;
    final atEnd = heldCount();
    final name = w.model.entries[w.who]!.name;
    await tester.tap(find.widgetWithText(DropdownButtonFormField<String>, 'For $name, as of'));
    await tester.pumpAndSettle();
    // The first chapter in the list (after "The end of the story").
    final items = find.byType(DropdownMenuItem<String>);
    await tester.tap(items.at(items.evaluate().length ~/ 2 + 1).hitTestable().first, warnIfMissed: false);
    await tester.pumpAndSettle();
    expect(find.text('The end of the story'), findsNothing);
    expect(heldCount(), isNot(atEnd), reason: 'what they hold changes over the story');
  });

  testWidgets('zoom buttons and keys change the scale; Esc lets go of the selection', (tester) async {
    final w = await _open(tester);
    final viewer = find.byType(InteractiveViewer);
    // The drawing's own scale (across; the depth axis stays at 1).
    double scale() => tester.widget<InteractiveViewer>(viewer).transformationController!.value.storage[0];
    final start = scale();
    await tester.tap(find.byTooltip('Zoom in'));
    await tester.pumpAndSettle();
    expect(scale(), greaterThan(start));
    await tester.tap(find.byTooltip('Zoom out'));
    await tester.tap(find.byTooltip('Zoom out'));
    await tester.pumpAndSettle();
    expect(scale(), lessThan(start));

    w.c.read(vizStateProvider.notifier).select(w.tree.nodes.first.ref);
    await tester.pumpAndSettle();
    await tester.tap(viewer);
    await tester.pumpAndSettle();
    await tester.sendKeyEvent(LogicalKeyboardKey.escape);
    await tester.pumpAndSettle();
    expect(w.c.read(vizStateProvider).selection, isNull);
  });

  testWidgets('on a phone at twice the text size, the tree and its legend fit', (tester) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final w = await _open(tester, size: phone);
    w.c.read(vizStateProvider.notifier).setFilter({
      'characters': [w.who],
    });
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.scrollUntilVisible(find.byType(InteractiveViewer), 300, scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
}
