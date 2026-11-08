import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/data/providers.dart';

import '../../helpers/pump_app.dart';
import 'world_screens_test.dart' show openWorld;

void main() {
  testWidgets('an empty world opens on its first page; the blanks filled become linked entries in one press', (
    tester,
  ) async {
    final w = await openWorld(tester);
    expect(find.text('The first page of your world'), findsOneWidget);
    final begin = find.ancestor(of: find.text('Begin this world'), matching: find.bySubtype<ButtonStyleButton>());
    expect(
      tester.widget<ButtonStyleButton>(begin).onPressed,
      isNull,
      reason: 'nothing to make until a blank is filled',
    );

    await tester.enterText(find.widgetWithText(TextField, 'Vell'), 'Harrowmere');
    await tester.enterText(find.widgetWithText(TextField, 'The Lantern Guild'), 'The Salt Court');
    await tester.enterText(find.widgetWithText(TextField, 'the night the river burned'), 'the Long Winter');
    await tester.pumpAndSettle(); // the button finishes waking before its colours are judged
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    await expectLater(tester, meetsGuideline(textContrastGuideline));
    await tester.tap(begin);
    await tester.pumpAndSettle();

    final store = w.c.read(novelStoreProvider);
    final entries = {for (final r in store.rowsIn(w.novel, 'loreEntries')) r['name']: r};
    expect(
      {for (final e in entries.entries) e.key: e.value['category']},
      {'Harrowmere': 'location', 'The Salt Court': 'faction', 'the Long Winter': 'lore'},
      reason: 'exactly as written, one entry per filled blank, the empty ones left out',
    );
    final place = entries['Harrowmere']!['id'];
    expect(
      {for (final l in store.rowsIn(w.novel, 'loreLinks')) (l['fromId'], l['toId'], l['fromLabel'])},
      {
        (entries['The Salt Court']!['id'], place, 'holds power in'),
        (entries['the Long Winter']!['id'], place, 'remembered in'),
      },
    );
    expect(find.text('Your world has its first 3 entries.'), findsOneWidget);
    expect(find.text('The first page of your world'), findsNothing, reason: 'the encyclopedia takes its place');
    expect(find.text('Harrowmere'), findsWidgets);
  });

  testWidgets('without a place, the others are still made, unlinked', (tester) async {
    final w = await openWorld(tester, size: phone);
    await tester.enterText(find.widgetWithText(TextField, 'tide-magic'), 'Bloodsong');
    await tester.pump();
    await Scrollable.ensureVisible(tester.element(find.text('Begin this world')), alignment: 0.5);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Begin this world'));
    await tester.pumpAndSettle();
    final store = w.c.read(novelStoreProvider);
    expect(
      [for (final r in store.rowsIn(w.novel, 'loreEntries')) (r['name'], r['category'])],
      [('Bloodsong', 'power')],
    );
    expect(store.rowsIn(w.novel, 'loreLinks'), isEmpty);
  });
}
