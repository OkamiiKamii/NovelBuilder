import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/characters/character_actions.dart' show characterPath;
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/characters/widgets/write_them_in_page.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/characters/record_look.dart';
import 'package:novel_builder/shared/domain/characters/stakes.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';

void main() {
  setUp(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDown(() => BlinkController.indeterminateAnimationsEnabled = true);

  /// A book with one chapter ([written] in it, or blank), Mark (who wants to open the last door) and Kai; open on
  /// Mark's page.
  Future<({ProviderContainer c, String novel, String chapter, String mark, String kai})> book(
    WidgetTester tester, {
    String written = '',
    Size size = const Size(1200, 2400),
  }) async {
    final c = await pumpApp(tester, size: size, location: '/organize');
    final novel = c.read(libraryServiceProvider).create({'title': 'The Doorwalker'}).id;
    final s = c.read(characterServiceProvider);
    final mark = s.change(novel, (x) => x.create(name: 'Mark')).id;
    final kai = s.change(novel, (x) => x.create(name: 'Kai')).id;
    s.change(novel, (x) => recordStake(x, mark, Stake.wants, 'To open the last door.'));
    final m = c.read(manuscriptServiceProvider);
    final chapter = m.create(novel, NodeKind.chapter, title: 'Chapter 1').id;
    if (written.isNotEmpty) m.save(novel, chapter, textToDoc(written), baseRev: m.open(novel, chapter).rev);
    c.read(openNovelProvider.notifier).open(novel);
    c.read(routerProvider).go(characterPath(mark));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Write Mark in'));
    await tester.pumpAndSettle();
    return (c: c, novel: novel, chapter: chapter, mark: mark, kai: kai);
  }

  JsonMap? plan(ProviderContainer c, String novel, String id) =>
      c.read(novelStoreProvider).rowsIn(novel, 'chapterPlans').where((p) => p['id'] == id).firstOrNull;

  testWidgets('a blank first chapter: Mark is written into it, from what he wants, and the page opens', (tester) async {
    final b = await book(tester);
    expect(find.byType(WriteThemInPage), findsOneWidget);
    expect(find.text('In Chapter 1, still blank'), findsOneWidget);
    expect(find.text('Mark goes after what they want: “To open the last door.”'), findsOneWidget);
    expect(find.text('Kai'), findsOneWidget, reason: 'the rest of the cast to choose from');

    await tester.tap(find.text('Start writing'));
    await tester.pumpAndSettle();
    expect(currentLocation(b.c), '/write');
    expect(b.c.read(selectedNodeProvider), b.chapter, reason: 'into the blank chapter, not a new one');
    expect(b.c.read(novelStoreProvider).rowsIn(b.novel, 'chapters').length, 1);
    final p = plan(b.c, b.novel, b.chapter)!;
    expect(p['objective'], 'Mark goes after what they want: “To open the last door.”');
    expect(strings(p['appearIds']), [b.mark]);
    expect(strings(p['povIds']), [b.mark]);
    expect(
      jsonEncode(b.c.read(manuscriptServiceProvider).open(b.novel, b.chapter).doc),
      isNot(contains('last door')),
      reason: 'no words of the story are written',
    );
    await tester.pump(const Duration(seconds: 2));
  });

  testWidgets('a chapter being written: a new scene in it, with Kai, from the author’s own spark', (tester) async {
    final b = await book(tester, written: 'The door would not open.');
    expect(find.text('In Chapter 1, still blank'), findsNothing);
    await tester.tap(find.text('A new scene in Chapter 1'));
    await tester.tap(find.text('Kai'));
    await tester.tap(find.text('Told through Mark’s eyes'));
    await tester.enterText(find.widgetWithText(TextField, 'Or your own'), 'Kai lies to Mark about the key.');
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Start writing'));
    await tester.tap(find.text('Start writing'));
    await tester.pumpAndSettle();

    final scene = b.c.read(selectedNodeProvider)!;
    final node = StoryNode(
      b.c.read(novelStoreProvider).rowsIn(b.novel, 'chapters').firstWhere((r) => r['id'] == scene),
    );
    expect((node.kindKey, node.parentId), ('scene', b.chapter));
    final p = plan(b.c, b.novel, scene)!;
    expect(p['objective'], 'Kai lies to Mark about the key.');
    expect(strings(p['appearIds']).toSet(), {b.mark, b.kai});
    expect(strings(p['povIds']), isEmpty, reason: 'not through his eyes, as chosen');
    await tester.pump(const Duration(seconds: 2));
  });

  testWidgets('a new chapter at the end; on a phone, it fits', (tester) async {
    final b = await book(tester, written: 'The door would not open.', size: const Size(390, 2400));
    expect(tester.takeException(), isNull);
    await tester.tap(find.text('A new chapter at the end of the book'));
    await tester.ensureVisible(find.text('Start writing'));
    await tester.tap(find.text('Start writing'));
    await tester.pumpAndSettle();
    final id = b.c.read(selectedNodeProvider)!;
    expect(id, isNot(b.chapter));
    final node = StoryNode(b.c.read(novelStoreProvider).rowsIn(b.novel, 'chapters').firstWhere((r) => r['id'] == id));
    expect(node.kindKey, 'chapter');
    await tester.pump(const Duration(seconds: 2));
  });
}
