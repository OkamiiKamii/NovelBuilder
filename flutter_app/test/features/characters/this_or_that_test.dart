import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/characters/cast.dart' show fieldNamed;
import 'package:novel_builder/shared/domain/characters/this_or_that.dart';
import 'package:novel_builder/shared/domain/records/entry.dart';

import '../../helpers/pump_app.dart';

void main() {
  testWidgets('This or that: a card at a time, pressed or swiped, skipped, back; the compass; kept in Core Traits', (
    tester,
  ) async {
    final c = await pumpApp(tester, size: phone, location: '/organize');
    final novel = c.read(libraryServiceProvider).create({'title': 'Ash'}).id;
    c.read(openNovelProvider.notifier).open(novel);
    final s = c.read(characterServiceProvider);
    final mira = s.change(novel, (x) => x.create(name: 'Mira')).id;
    Entry entry() => Entry(c.read(novelStoreProvider).row(novel, 'loreEntries', mira)!);
    c.read(routerProvider).go('/organize/character/$mira');
    await tester.pumpAndSettle();

    await tester.tap(find.text('This or that'));
    await tester.pumpAndSettle();
    expect(find.text('In a crowded room, Mira is…'), findsOneWidget);
    expect(find.text('1 of ${traitAxes.length}'), findsOneWidget);

    // Pressed.
    await tester.tap(find.bySemanticsLabel('Mira is: Quiet'));
    await tester.pumpAndSettle();
    expect(find.text('2 of ${traitAxes.length}'), findsOneWidget);
    // Swiped towards the right.
    await tester.drag(find.bySemanticsLabel('Mira is: A planner'), const Offset(300, 0));
    await tester.pumpAndSettle();
    expect(find.text('When it matters, Mira follows their…'), findsOneWidget);
    // Back, and the choice made shows.
    await tester.tap(find.text('Back'));
    await tester.pumpAndSettle();
    expect(tester.getSemantics(find.bySemanticsLabel('Mira is: An improviser')), containsSemantics(isSelected: true));
    // The rest skipped (Next on the one chosen).
    for (var i = 1; i < traitAxes.length; i++) {
      await tester.tap(find.text(i == 1 ? 'Next' : 'Skip'));
      await tester.pumpAndSettle();
    }
    expect(find.text('Mira’s compass'), findsOneWidget);
    await tester.tap(find.text('Keep these traits'));
    await tester.pumpAndSettle();
    expect(fieldNamed(entry(), 'Core Traits'), 'Quiet\nAn improviser');
    expect(find.text('Mira’s traits are in their profile, under Core Traits.'), findsOneWidget);

    // Again: what is there is chosen when the card comes up; a choice changed takes the other word's place.
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
    await tester.tap(find.text('This or that'));
    await tester.pumpAndSettle();
    expect(tester.getSemantics(find.bySemanticsLabel('Mira is: Quiet')), containsSemantics(isSelected: true));
    await tester.tap(find.bySemanticsLabel('Mira is: Loud'));
    await tester.pumpAndSettle();
    for (var i = 1; i < traitAxes.length; i++) {
      await tester.tap(find.text(i == 1 ? 'Next' : 'Skip'));
      await tester.pumpAndSettle();
    }
    await tester.tap(find.text('Keep these traits'));
    await tester.pumpAndSettle();
    expect(fieldNamed(entry(), 'Core Traits'), 'Loud\nAn improviser');
  });
}
