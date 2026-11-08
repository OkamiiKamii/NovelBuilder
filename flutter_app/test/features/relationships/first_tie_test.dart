import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/records/entry.dart';
import 'package:novel_builder/shared/domain/records/relation.dart';

import '../../helpers/pump_app.dart';

void main() {
  testWidgets('an empty map is where the first line is drawn: two names and what they are, in one press', (
    tester,
  ) async {
    final c = await pumpApp(tester, size: phone, location: '/visualize');
    final novel = c.read(libraryServiceProvider).create({'title': 'Ash'}).id;
    c.read(openNovelProvider.notifier).open(novel);
    await tester.pumpAndSettle();
    expect(find.text('Draw the first lines'), findsOneWidget);
    final draw = find.ancestor(of: find.text('Draw it on the map'), matching: find.bySubtype<ButtonStyleButton>());
    expect(tester.widget<ButtonStyleButton>(draw).onPressed, isNull);

    await tester.enterText(find.widgetWithText(TextField, 'Mira'), 'Ilse');
    await tester.enterText(find.widgetWithText(TextField, 'Kai'), 'Brannoc');
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Friends'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Friends'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Rivals').last);
    await tester.pumpAndSettle();
    await expectLater(tester, meetsGuideline(textContrastGuideline));
    await tester.ensureVisible(draw);
    await tester.pumpAndSettle();
    await tester.tap(draw);
    await tester.pumpAndSettle();

    final store = c.read(novelStoreProvider);
    final names = {for (final r in store.rowsIn(novel, 'loreEntries')) Entry(r).id: Entry(r).name};
    final ties = [for (final r in store.rowsIn(novel, 'characterRelations')) CharacterRelation(r)];
    expect(names.values.toSet(), {'Ilse', 'Brannoc'});
    expect(
      [for (final t in ties) (names[t.fromId], names[t.toId], t.stages.single.preset)],
      [('Ilse', 'Brannoc', 'rivals')],
    );
    expect(find.textContaining('are on the map'), findsOneWidget);
    expect(find.text('Draw the first lines'), findsNothing, reason: 'the map takes its place');
  });

  testWidgets('with one character, they are named, and only the other is asked for', (tester) async {
    final c = await pumpApp(tester, size: phone, location: '/visualize');
    final novel = c.read(libraryServiceProvider).create({'title': 'Ash'}).id;
    final mira = c.read(characterServiceProvider).change(novel, (x) => x.create(name: 'Mira')).id;
    c.read(openNovelProvider.notifier).open(novel);
    await tester.pumpAndSettle();
    expect(find.text('Draw the first lines'), findsOneWidget);
    expect(find.widgetWithText(TextField, 'Mira'), findsNothing);
    await tester.enterText(find.widgetWithText(TextField, 'Kai'), 'Kai');
    await tester.pumpAndSettle();
    final draw = find.ancestor(of: find.text('Draw it on the map'), matching: find.bySubtype<ButtonStyleButton>());
    await tester.ensureVisible(draw);
    await tester.pumpAndSettle();
    await tester.tap(draw);
    await tester.pumpAndSettle();
    final ties = [for (final r in c.read(novelStoreProvider).rowsIn(novel, 'characterRelations')) CharacterRelation(r)];
    expect(ties.single.fromId, mira);
    expect(c.read(novelStoreProvider).rowsIn(novel, 'loreEntries').length, 2);
  });
}
