import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';

import '../../helpers/pump_app.dart';

/// The names the forge offers, as shown.
List<String> forged(WidgetTester tester) => [
  for (final chip in tester.widgetList<ActionChip>(find.byType(ActionChip)))
    if (chip.tooltip?.startsWith('Use ') ?? false) (chip.label as Text).data!,
];

void main() {
  testWidgets('a new character’s name forged: in a tradition, the one pressed is written in', (tester) async {
    final c = await pumpApp(tester, size: phone, location: '/organize');
    final novel = c.read(libraryServiceProvider).create({'title': 'Ash Road'}).id;
    c.read(characterServiceProvider).change(novel, (x) => x.create(name: 'Kai Doyle'));
    c.read(openNovelProvider.notifier).open(novel);
    await tester.pumpAndSettle();

    await tester.tap(find.text('New character'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Forge a name'));
    await tester.pumpAndSettle();
    expect(find.text('Forge a name'), findsOneWidget);
    // One character is too few to learn from: a tradition is chosen instead.
    final book = tester.widget<ChoiceChip>(find.widgetWithText(ChoiceChip, 'Like your book'));
    expect(book.onSelected, isNull);
    await tester.tap(find.widgetWithText(ChoiceChip, 'Norse'));
    await tester.pumpAndSettle();
    final names = forged(tester);
    expect(names, hasLength(12));

    await tester.ensureVisible(find.text('More names'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('More names'));
    await tester.pumpAndSettle();
    expect(forged(tester), isNot(names), reason: 'another dozen');

    final pick = forged(tester).first;
    await tester.ensureVisible(find.text(pick));
    await tester.pumpAndSettle();
    await tester.tap(find.text(pick));
    await tester.pumpAndSettle();
    expect(find.text('Forge a name'), findsNothing);
    expect(find.widgetWithText(TextField, pick), findsOneWidget);
  });

  testWidgets('a place in the World named from the forge', (tester) async {
    final c = await pumpApp(tester, size: phone, location: '/organize');
    final novel = c.read(libraryServiceProvider).create({'title': 'Ash Road'}).id;
    final river = c.read(characterServiceProvider).change(novel, (x) => x.createEntry('location', 'Unnamed place')).id;
    c.read(openNovelProvider.notifier).open(novel);
    await tester.pumpAndSettle();
    c.read(routerProvider).go('/organize/world/entry/$river');
    await tester.pumpAndSettle();

    await tester.ensureVisible(find.text('Forge a name'));
    await tester.tap(find.text('Forge a name'));
    await tester.pumpAndSettle();
    expect(tester.widget<SegmentedButton<bool>>(find.byType(SegmentedButton<bool>)).selected, {
      true,
    }, reason: 'a place');
    await tester.tap(find.widgetWithText(ChoiceChip, 'Old English'));
    await tester.pumpAndSettle();
    final pick = forged(tester).first;
    await tester.tap(find.text(pick));
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();
    expect(c.read(novelStoreProvider).row(novel, 'loreEntries', river)!['name'], pick);
  });
}
