import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/characters/cast.dart' show fieldNamed;
import 'package:novel_builder/shared/domain/characters/record_look.dart';
import 'package:novel_builder/shared/domain/characters/stakes.dart';
import 'package:novel_builder/shared/domain/records/entry.dart';

import '../../helpers/pump_app.dart';

void main() {
  testWidgets('the roll call: the cast’s basics in one table, written in place and kept in their profiles', (
    tester,
  ) async {
    final c = await pumpApp(tester, size: phone, location: '/organize');
    final novel = c.read(libraryServiceProvider).create({'title': 'Ash'}).id;
    c.read(openNovelProvider.notifier).open(novel);
    final s = c.read(characterServiceProvider);
    final mira = s.change(novel, (x) => x.create(name: 'Mira')).id;
    final kai = s.change(novel, (x) => x.create(name: 'Kai')).id;
    s.change(novel, (x) => recordStake(x, kai, Stake.wants, 'The crown'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Roll call'));
    await tester.pumpAndSettle();
    expect(c.read(castViewProvider), CastView.roll);
    expect(find.text('1 of 10 filled. Write in a blank and it is kept in their profile.'), findsOneWidget);
    expect(find.widgetWithText(TextField, 'The crown'), findsOneWidget, reason: 'what is written, shown');

    Entry entry(String id) => Entry(c.read(novelStoreProvider).row(novel, 'loreEntries', id)!);
    Finder cell(String label) => find.descendant(
      of: find.byWidgetPredicate((w) => w is Semantics && w.properties.label == label),
      matching: find.byType(TextField),
    );
    await tester.enterText(cell('Mira, Age'), '34');
    await tester.enterText(cell('Mira, Gender'), 'Woman');
    c.read(saveControllerProvider).flush();
    await tester.pumpAndSettle();
    expect(fieldNamed(entry(mira), 'Age'), '34');
    expect(fieldNamed(entry(mira), 'Gender'), 'Woman');
    expect(find.text('3 of 10 filled. Write in a blank and it is kept in their profile.'), findsOneWidget);

    // Changed: the same field, not a second; and a blank left blank makes no field.
    await tester.enterText(cell('Mira, Age'), '35');
    c.read(saveControllerProvider).flush();
    await tester.pumpAndSettle();
    expect(entry(mira).fields.where((f) => f.key == 'Age'), hasLength(1));
    expect(fieldNamed(entry(mira), 'Age'), '35');
    expect(entry(kai).fields.where((f) => f.key == 'Age'), isEmpty);
  });
}
