import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/modules/try_on_panel.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';
import 'package:novel_builder/shared/domain/ids.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/modules/module_changes.dart';
import 'package:novel_builder/shared/domain/modules/module_defs.dart';
import 'package:novel_builder/shared/domain/modules/try_on.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';

import '../../helpers/pump_app.dart';

void main() {
  test('trying a module on says what turning it on does, and changes nothing', () {
    final snapshot = sampleNovel(now: 0);
    final progression = builtinModules.firstWhere((m) => m.id == 'progression');
    final tried = tryOnModule(snapshot, progression);

    // What the press itself would do.
    final on = ModuleChanges(snapshot, now: 0, createId: newId)..enable(progression);
    final before = {for (final c in tried.before) c.key};
    final made = [
      for (final c in on.categories())
        if (!before.contains(c.key) && !c.archived) c.name,
    ];
    expect([for (final c in tried.added) c.name], made);
    expect(made, contains('Skills & Abilities'));
    // The cast gains Power Rank, and the preview names who.
    final cast = tried.gains.firstWhere((g) => g.kind.key == 'character');
    expect(cast.fields, contains('Power Rank'));
    expect(cast.entries, contains('Wren Hollis'));
    expect(tried.tools.map((t) => t.title), contains('Skills by rank'));
    expect(tried.offersSystem, isTrue);

    // Trying it on stored nothing.
    expect(snapshot.rows('projectModules'), isEmpty);
    expect(tryOnModule(snapshot, progression).added.length, tried.added.length);
  });

  testWidgets('on a narrow shelf every new kind of record stays in view', (tester) async {
    final snapshot = sampleNovel(now: 0);
    final fantasy = builtinModules.firstWhere((m) => m.id == 'high-fantasy');
    final added = tryOnModule(snapshot, fantasy).added;
    expect(added.length, greaterThan(5));
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: Center(
              child: SizedBox(
                key: const Key('panel'),
                width: 260,
                child: TryOnPanel(snapshot: snapshot, module: fantasy, novelTitle: 'Ashfall', initiallyOpen: true),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    final panel = tester.getRect(find.byKey(const Key('panel')));
    for (final c in added) {
      final spine = tester.getRect(find.text(c.name).first);
      expect(spine.right, lessThanOrEqualTo(panel.right + 0.5), reason: c.name);
      expect(spine.left, greaterThanOrEqualTo(panel.left - 0.5), reason: c.name);
    }
    expect(tester.takeException(), isNull);
  });

  testWidgets('Made for your story shows what the first module adds to this book, under its Turn on', (tester) async {
    final c = await pumpApp(tester, size: phone, location: '/organize/modules');
    final novel = c.read(libraryServiceProvider).create({'title': 'Skill In Fantasy'}).id;
    final m = c.read(manuscriptServiceProvider);
    final one = m.create(novel, NodeKind.chapter, title: 'Chapter 1');
    m.save(novel, one.id, textToDoc('James chose a skill. His level and rank rose.'), baseRev: 0);
    c.read(characterServiceProvider).change(novel, (x) => x.create(name: 'James', roles: ['Protagonist']));
    c.read(openNovelProvider.notifier).open(novel);
    await tester.pumpAndSettle();

    expect(find.text('In “Skill In Fantasy”, with Progression Fantasy & LitRPG'), findsOneWidget);
    expect(find.text('James gains Power Rank.'), findsOneWidget);
    expect(find.text('Skills by rank'), findsOneWidget);
    expect(find.textContaining('turning it off later deletes nothing'), findsOneWidget);
    await expectLater(tester, meetsGuideline(textContrastGuideline));
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    expect(c.read(novelStoreProvider).rowsIn(novel, 'projectModules'), isEmpty, reason: 'seeing it turns nothing on');

    // Hidden and shown again.
    await tester.tap(find.text('Hide what it adds').first);
    await tester.pumpAndSettle();
    expect(find.text('James gains Power Rank.'), findsNothing);
    await tester.tap(find.text('See it in your book').first);
    await tester.pumpAndSettle();
    expect(find.text('James gains Power Rank.'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
