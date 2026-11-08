import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/records/entry.dart';
import 'package:novel_builder/shared/domain/records/relation.dart';

import '../../helpers/pump_app.dart';

void main() {
  testWidgets('an empty cast is a playbill: the names written become the cast, with roles and the hero’s ties', (
    tester,
  ) async {
    final c = await pumpApp(tester, size: phone, location: '/organize');
    final novel = c.read(libraryServiceProvider).create({'title': 'Ash'}).id;
    c.read(openNovelProvider.notifier).open(novel);
    await tester.pumpAndSettle();
    expect(find.text('Dramatis personae'), findsOneWidget);
    final raise = find.ancestor(of: find.text('Raise the curtain'), matching: find.bySubtype<ButtonStyleButton>());
    expect(tester.widget<ButtonStyleButton>(raise).onPressed, isNull, reason: 'nothing named yet');

    await tester.enterText(find.widgetWithText(TextField, 'Mira Vance'), 'Ilse');
    await tester.enterText(find.widgetWithText(TextField, 'The Grey Abbot'), 'Corvan');
    await tester.enterText(find.widgetWithText(TextField, 'Kai'), 'Tamsin');
    await tester.ensureVisible(find.text('Add another part'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Add another part'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Orrin'), 'Brannoc');
    await tester.pumpAndSettle();
    await expectLater(tester, meetsGuideline(textContrastGuideline));
    await tester.ensureVisible(raise);
    await tester.pumpAndSettle();
    await tester.tap(raise);
    await tester.pumpAndSettle();

    final store = c.read(novelStoreProvider);
    final names = {for (final r in store.rowsIn(novel, 'loreEntries')) Entry(r).id: Entry(r).name};
    final roles = {
      for (final p in store.rowsIn(novel, 'characterProfiles')) names[p['entryId']]: (p['roles'] as List).single,
    };
    expect(roles, {'Ilse': 'Protagonist', 'Corvan': 'Antagonist', 'Tamsin': 'Supporting', 'Brannoc': 'Supporting'});
    final ties = {
      for (final r in store.rowsIn(novel, 'characterRelations').map(CharacterRelation.new))
        (names[r.fromId], names[r.toId], r.stages.single.preset),
    };
    expect(ties, {('Ilse', 'Corvan', 'enemies'), ('Ilse', 'Tamsin', 'friends')}, reason: 'none assumed for the rest');
    expect(find.text('Your cast of 4 is ready.'), findsOneWidget);
    expect(find.text('Dramatis personae'), findsNothing, reason: 'the cast takes the page');
  });

  testWidgets('without a hero, the cast is still made, with no ties', (tester) async {
    final c = await pumpApp(tester, size: phone, location: '/organize');
    final novel = c.read(libraryServiceProvider).create({'title': 'Ash'}).id;
    c.read(openNovelProvider.notifier).open(novel);
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Kai'), 'Tamsin');
    await tester.pumpAndSettle();
    final raise = find.text('Raise the curtain');
    await tester.ensureVisible(raise);
    await tester.pumpAndSettle();
    await tester.tap(raise);
    await tester.pumpAndSettle();
    expect(c.read(novelStoreProvider).rowsIn(novel, 'loreEntries').length, 1);
    expect(c.read(novelStoreProvider).rowsIn(novel, 'characterRelations'), isEmpty);
  });
}
