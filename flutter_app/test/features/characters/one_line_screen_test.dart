import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';

import '../../helpers/pump_app.dart';

void main() {
  testWidgets('a character written in a line: the preview says what is recorded, and Add records it all', (
    tester,
  ) async {
    final c = await pumpApp(tester, size: phone, location: '/organize');
    final novel = c.read(libraryServiceProvider).create({'title': 'Ash Road'}).id;
    final s = c.read(characterServiceProvider);
    final kai = s.change(novel, (x) => x.create(name: 'Kai Doyle')).id;
    final river = s.change(novel, (x) => x.createEntry('location', 'Glass River')).id;
    c.read(openNovelProvider.notifier).open(novel);
    await tester.pumpAndSettle();

    await tester.tap(find.text('New character'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.widgetWithText(TextField, 'Write them in a line'),
      'Mira Vance, 34, a smuggler from Glass River, Kai’s sister',
    );
    await tester.pumpAndSettle();
    expect(find.text('Also recorded:'), findsOneWidget);
    expect(find.textContaining('smuggler'), findsWidgets);
    expect(find.textContaining('Kai Doyle'), findsWidgets);
    expect(find.widgetWithText(TextField, 'Mira Vance'), findsOneWidget, reason: 'the name filled in');
    await expectLater(tester, meetsGuideline(textContrastGuideline));

    await tester.tap(find.text('Add to the cast'));
    await tester.pumpAndSettle();

    final store = c.read(novelStoreProvider);
    final mira = store.rowsIn(novel, 'loreEntries').firstWhere((e) => e['name'] == 'Mira Vance');
    final fields = {for (final f in mira['fields'] as List) (f as Map)['key']: f['value']};
    expect(fields, {'Age': '34', 'Gender': 'Female', 'Occupation': 'smuggler', 'Place of Origin': river});
    final ties = store.rowsIn(novel, 'characterRelations');
    expect(ties, hasLength(1));
    expect({ties.single['fromId'], ties.single['toId']}, {kai, mira['id']});
    expect(((ties.single['stages'] as List).single as Map)['preset'], 'siblings');
    expect(currentLocation(c), '/organize/character/${mira['id']}');
  });
}
