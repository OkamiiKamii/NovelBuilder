import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';

import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';

void main() {
  setUpAll(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDownAll(() => BlinkController.indeterminateAnimationsEnabled = true);
  passagesScreenTests();
  testWidgets('the cast is found in the text by name, unlinked, and follows the text as it changes', (tester) async {
    final c = await pumpApp(tester, size: phone, location: '/organize');
    final novel = c.read(libraryServiceProvider).create({'title': 'Ash Road'}).id;
    final m = c.read(manuscriptServiceProvider);
    final one = m.create(novel, NodeKind.chapter, title: 'One');
    final two = m.create(novel, NodeKind.chapter, title: 'Two');
    m.save(novel, one.id, textToDoc('Mira waited at the gate.'), baseRev: 0);
    m.save(novel, two.id, textToDoc('Nobody came.'), baseRev: 0);
    final s = c.read(characterServiceProvider);
    s.change(novel, (x) => x.create(name: 'Mira Vance'));
    s.change(novel, (x) => x.create(name: 'Kai Doyle'));
    c.read(openNovelProvider.notifier).open(novel);
    await tester.pumpAndSettle();
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();

    expect(find.text('In chapter 1'), findsOneWidget, reason: 'Mira, by her first name, never linked');
    expect(find.text('Not in the manuscript yet'), findsOneWidget, reason: 'Kai');

    // Kai comes into chapter 2: shortly after it is saved, the card says so.
    m.save(novel, two.id, textToDoc('Nobody came but Kai.'), baseRev: 1);
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();
    expect(find.text('In chapter 2'), findsOneWidget);
    expect(find.text('Not in the manuscript yet'), findsNothing);

    // The world's encyclopedia finds its entries by name too.
    c.read(routerProvider).go('/organize/world');
    await tester.pumpAndSettle();
    expect(c.read(namedInProvider).length, 2);
  });
}

void passagesScreenTests() {
  testWidgets('a character’s page quotes them where they come into each chapter; a press reads it there', (
    tester,
  ) async {
    final c = await pumpApp(tester, size: phone, location: '/organize');
    final novel = addSampleNovel(c.read(novelStoreProvider), now: DateTime(2026, 11, 10).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    await tester.pumpAndSettle();
    final store = c.read(novelStoreProvider);
    final jory = store.rowsIn(novel.id, 'loreEntries').firstWhere((e) => e['name'] == 'Jory');
    c.read(routerProvider).go('/organize/character/${jory['id']}');
    await tester.pumpAndSettle();
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(find.text('In their pages'), 300, scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    expect(find.text('In their pages'), findsOneWidget);
    final first = find.textContaining('it’s Jory and the twins');
    expect(first, findsOneWidget, reason: 'chapter 11, where Jory is first named');
    expect(find.textContaining('Sefa’s Crew'), findsWidgets);
    await expectLater(tester, meetsGuideline(textContrastGuideline));

    await tester.ensureVisible(first);
    await tester.pumpAndSettle();
    await tester.tap(first);
    await tester.pumpAndSettle();
    expect(currentLocation(c), '/write');
    expect(find.text('Jory'), findsWidgets, reason: 'found in the chapter, in the find bar');
    expect(c.read(selectedNodeProvider), isNotNull);
  });
}
