import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/characters/widgets/empty_chairs.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/characters/empty_chairs.dart';
import 'package:novel_builder/shared/domain/records/relation.dart';
import 'package:novel_builder/shared/domain/relationships/relation_changes.dart';

import '../../helpers/pump_app.dart';

List<CharacterRelation> _relations(ProviderContainer c, String novel) => [
  for (final r in c.read(novelStoreProvider).rowsIn(novel, 'characterRelations')) CharacterRelation(r),
];

void main() {
  testWidgets('the empty chairs round a lone lead: each a question, filled with one name and tied to them', (
    tester,
  ) async {
    final c = await pumpApp(tester, size: phone, location: '/organize');
    final novel = c.read(libraryServiceProvider).create({'title': 'Skill In Fantasy'}).id;
    final james = c
        .read(characterServiceProvider)
        .change(novel, (x) => x.create(name: 'James', roles: ['Protagonist']))
        .id;
    c.read(openNovelProvider.notifier).open(novel);
    await tester.pumpAndSettle();

    expect(find.text('Who else is in James’s story?'), findsOneWidget);
    for (final q in [
      'Who stands against James?',
      'Who taught James?',
      'Who is James’s rival?',
      'Who stands with James?',
      'Who does James love?',
      'Who is James’s family?',
    ]) {
      expect(find.bySemanticsLabel(q), findsOneWidget, reason: q);
    }
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    await expectLater(tester, meetsGuideline(textContrastGuideline));

    // A chair opens the card with the line begun; only the name is written.
    await tester.ensureVisible(find.bySemanticsLabel('Who is James’s rival?'));
    await tester.pumpAndSettle();
    await tester.tap(find.bySemanticsLabel('Who is James’s rival?'));
    await tester.pumpAndSettle();
    final line = find.widgetWithText(TextField, 'Write them in a line');
    expect(tester.widget<TextField>(line).controller!.text, ', James’s rival');
    // The begun line is never taken for the name: that is left to write.
    final name = find.widgetWithText(TextField, 'Name *');
    expect(tester.widget<TextField>(name).controller!.text, isEmpty);
    await tester.enterText(line, 'Kai, James’s rival');
    await tester.pumpAndSettle();
    await tester.tap(find.text('Add to the cast'));
    await tester.pumpAndSettle();

    final kai = c.read(castProvider)!.entries.firstWhere((e) => e.name == 'Kai').id;
    final tie = _relations(c, novel).single;
    expect({tie.fromId, tie.toId}, {kai, james});
    expect(tie.stages.single.preset, 'rivals');

    // Back on the cast: that chair is filled, the others wait.
    c.read(routerProvider).go('/organize');
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel('Who is James’s rival?'), findsNothing);
    expect(find.bySemanticsLabel('Who taught James?'), findsOneWidget);

    // A name written in the Name field alone, the line left as it was begun: still tied, and as the villain.
    await tester.ensureVisible(find.bySemanticsLabel('Who stands against James?'));
    await tester.pumpAndSettle();
    await tester.tap(find.bySemanticsLabel('Who stands against James?'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Name *'), 'Mordren');
    await tester.pumpAndSettle();
    await tester.tap(find.text('Add to the cast'));
    await tester.pumpAndSettle();
    final mordren = c
        .read(castProvider)!
        .listed(c.read(castProvider)!.entries.firstWhere((e) => e.name == 'Mordren').id)!;
    expect(mordren.profile.roles, ['Antagonist']);
    final enemy = _relations(c, novel).firstWhere((r) => {r.fromId, r.toId}.contains(mordren.entry.id));
    expect({enemy.fromId, enemy.toId}, {mordren.entry.id, james});
    expect(enemy.stages.single.preset, 'enemies');
  });

  testWidgets('a tie of a kind fills its chair; an antagonist in the cast fills the first', (tester) async {
    final c = await pumpApp(tester, location: '/organize');
    final novel = c.read(libraryServiceProvider).create({'title': 'Ash'}).id;
    final s = c.read(characterServiceProvider);
    final wren = s.change(novel, (x) => x.create(name: 'Wren Hollis', roles: ['Protagonist'])).id;
    final nan = s.change(novel, (x) => x.create(name: 'Nan')).id;
    s.change(novel, (x) => x.create(name: 'Crane', roles: ['Antagonist']));
    s.change(novel, (x) {
      final r = RelationChanges(x.snapshot, now: x.now, createId: x.newId)..createRelation(nan, wren, 'mentor-student');
      x.snapshot = r.snapshot;
    });
    c.read(openNovelProvider.notifier).open(novel);
    await tester.pumpAndSettle();
    final cast = c.read(castProvider)!;
    final lead = chairsLead(cast.list)!;
    expect(lead.entry.name, 'Wren Hollis');
    final keys = [for (final ch in emptyChairs(lead, cast.list, _relations(c, novel))) ch.key];
    expect(keys, ['rival', 'friend', 'love', 'family'], reason: 'an antagonist and a mentor are there');
    // Asked by the first name, the line ties them to the whole name.
    final rival = emptyChairs(lead, cast.list, _relations(c, novel)).first;
    expect(rival.question, 'Who is Wren’s rival?');
    expect(rival.line, ', Wren Hollis’s rival');
  });

  testWidgets('Not now puts the chairs away for the novel; a cast past three has none', (tester) async {
    final c = await pumpApp(tester, size: phone, location: '/organize');
    final novel = c.read(libraryServiceProvider).create({'title': 'Ash'}).id;
    final s = c.read(characterServiceProvider);
    s.change(novel, (x) => x.create(name: 'Wren', roles: ['Protagonist']));
    c.read(openNovelProvider.notifier).open(novel);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Not now'));
    await tester.pumpAndSettle();
    expect(find.byType(EmptyChairs), findsNothing);
    expect(find.text('Who else is in Wren’s story?'), findsNothing);
    expect(c.read(settingsStoreProvider).read(emptyChairsKey(novel)), true);

    final other = c.read(libraryServiceProvider).create({'title': 'Big'}).id;
    for (final n in ['Ada', 'Bo', 'Cy', 'Di', 'Ed', 'Flo']) {
      s.change(other, (x) => x.create(name: n, roles: n == 'Ada' ? ['Protagonist'] : const []));
    }
    c.read(openNovelProvider.notifier).open(other);
    await tester.pumpAndSettle();
    expect(find.textContaining('story?'), findsNothing);
  });
}
