import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/characters/character_actions.dart' show characterPath;
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/progression/widgets/levels_view.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';

void main() {
  setUp(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDown(() => BlinkController.indeterminateAnimationsEnabled = true);

  /// A book of [chapters] with the cast [cast], open at [at].
  Future<({ProviderContainer c, String novel, List<String> ids, Map<String, String> people})> book(
    WidgetTester tester,
    List<String> chapters, {
    List<String> cast = const [],
    String at = '/organize/systems',
  }) async {
    final c = await pumpApp(tester, size: const Size(1200, 6000), location: '/organize');
    final novel = c.read(libraryServiceProvider).create({'title': 'The Ever Armor'}).id;
    final people = {
      for (final name in cast) name: c.read(characterServiceProvider).change(novel, (x) => x.create(name: name)).id,
    };
    final m = c.read(manuscriptServiceProvider);
    final ids = <String>[];
    for (final (i, text) in chapters.indexed) {
      final ch = m.create(novel, NodeKind.chapter, title: 'Chapter ${i + 1}');
      m.save(novel, ch.id, textToDoc(text), baseRev: m.open(novel, ch.id).rev);
      ids.add(ch.id);
    }
    c.read(openNovelProvider.notifier).open(novel);
    c.read(routerProvider).go(at == 'kade' ? characterPath(people['Kade']!) : at);
    await settle(tester);
    return (c: c, novel: novel, ids: ids, people: people);
  }

  const armor = [
    'The armor answered him. Archer Armor Level 1. The bow settled into his hands.',
    'He drew on it until his arms shook, and the Archer Armor reached Level 2.',
    'A second shape came out of the first: Hunter Armor (Lv. 1).',
    'The Hunter Armor’s level rose to 12 after the wolves.',
    'At last, on the ridge above the city, the Hunter Armor reached Level 100.',
  ];

  /// The same book, with Kade wearing it.
  const kades = [
    'Kade felt the armor answer him. Kade’s Archer Armor Level 1. The bow settled into his hands.',
    'Kade drew on it until his arms shook, and the Archer Armor reached Level 2.',
    'A second shape came out of the first: Kade’s Hunter Armor (Lv. 1). Kade reached Level 3.',
    'The Hunter Armor’s level rose to 12 after the wolves, and Kade knew it.',
    'At last, on the ridge above the city, Kade’s Hunter Armor reached Level 100.',
  ];

  testWidgets('on Systems, what is no one’s: the versions, where each is now, every step, and read there', (
    tester,
  ) async {
    final b = await book(tester, armor);
    final before = jsonEncode(b.c.read(novelStoreProvider).load(b.novel)!.toJson(exportedAt: 0));
    expect(find.byType(LevelsView), findsOneWidget);
    expect(find.text('NO ONE’S'), findsOneWidget);
    expect(find.text('ARMOR · 2 versions'), findsOneWidget);
    expect(find.text('since chapter 5 · 2 steps from Level 1'), findsOneWidget);
    expect(find.text('100'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('level-Hunter Armor')));
    await tester.pumpAndSettle();
    expect(find.text('“A second shape came out of the first: Hunter Armor (Lv. 1).”'), findsOneWidget);
    expect(
      jsonEncode(b.c.read(novelStoreProvider).load(b.novel)!.toJson(exportedAt: 0)),
      before,
      reason: 'it only reads',
    );
    await tester.tap(find.text('Read it there').first);
    await tester.pumpAndSettle();
    expect(currentLocation(b.c), '/write');
    expect(b.c.read(selectedNodeProvider), b.ids[4]);
    await tester.pump(const Duration(seconds: 2));
  });

  testWidgets('on the character’s page: their own level and their armor; Systems says who holds them', (tester) async {
    final b = await book(tester, kades, cast: ['Kade', 'Mira']);
    // Systems: no one's is empty; Kade holds them.
    expect(find.text('NO ONE’S'), findsNothing);
    expect(find.text('ON THEIR PAGES'), findsOneWidget);
    expect(find.textContaining('Kade: ', findRichText: true), findsOneWidget);
    await tester.tap(find.byKey(ValueKey('holder-${b.people['Kade']}')));
    await settle(tester);

    // Kade's page.
    expect(currentLocation(b.c), characterPath(b.people['Kade']!));
    expect(find.byType(TheirLevels), findsOneWidget);
    expect(find.text('Kade’s level'), findsOneWidget);
    expect(find.text('ARMOR · 2 versions'), findsOneWidget);
    expect(find.text('Hunter Armor'), findsOneWidget);
    expect(find.text('100'), findsOneWidget, reason: 'his Hunter Armor is at 100');
  });

  testWidgets('not theirs: back on Systems, no one’s; give to someone else: on their page', (tester) async {
    final b = await book(tester, kades, cast: ['Kade', 'Mira'], at: 'kade');
    await tester.tap(find.byKey(const ValueKey('level-Archer Armor')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Not theirs'));
    await settle(tester);
    expect(find.text('Archer Armor'), findsNothing, reason: 'not on Kade’s page now');
    expect(b.c.read(settingsStoreProvider).read(levelsOwnersKey(b.novel)), {'archer armor': ''});

    b.c.read(routerProvider).go('/organize/systems');
    await settle(tester);
    expect(find.text('NO ONE’S'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('level-Archer Armor')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Give to…'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Mira').last);
    await settle(tester);
    expect(find.text('NO ONE’S'), findsNothing);
    expect(b.c.read(settingsStoreProvider).read(levelsOwnersKey(b.novel)), {'archer armor': b.people['Mira']});

    b.c.read(routerProvider).go(characterPath(b.people['Mira']!));
    await settle(tester);
    expect(find.text('Archer Armor'), findsOneWidget, reason: 'on Mira’s page now');
  });

  testWidgets('a slip marked; not a level; the view follows the pages as they change', (tester) async {
    final b = await book(tester, [...armor, 'The Archer Armor was Level 1, though no one had touched it.']);
    expect(find.text('One goes back down where the page does not say it fell: marked below.'), findsOneWidget);

    final m = b.c.read(manuscriptServiceProvider);
    m.save(b.novel, b.ids[4], textToDoc('The Hunter Armor reached Level 150.'), baseRev: m.open(b.novel, b.ids[4]).rev);
    b.c.read(routerProvider).go('/organize');
    await settle(tester);
    b.c.read(routerProvider).go('/organize/systems');
    await settle(tester);
    expect(find.text('150'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('level-Archer Armor')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Not a level'));
    await settle(tester);
    expect(find.text('Archer Armor'), findsNothing);
    expect(b.c.read(settingsStoreProvider).read(levelsAsideKey(b.novel)), ['archer armor']);
  });

  testWidgets('a book that levels nothing says how to write one', (tester) async {
    await book(tester, ['He walked into the rain.']);
    expect(find.textContaining('Nothing in your chapters has a level yet.'), findsOneWidget);
  });
}

/// Settled, and the reading done away from the screen.
Future<void> settle(WidgetTester tester) async {
  await tester.pumpAndSettle();
  await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 300)));
  await tester.pumpAndSettle();
}
