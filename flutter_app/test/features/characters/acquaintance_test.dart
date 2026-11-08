import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';

import '../../helpers/pump_app.dart';

void main() {
  testWidgets('each card says how well the character is known, and a press asks the next question', (tester) async {
    final c = await pumpApp(tester, size: phone, location: '/organize');
    final novel = c.read(libraryServiceProvider).create({'title': 'Ash'}).id;
    c.read(characterServiceProvider).change(novel, (x) => x.create(name: 'Mira'));
    c.read(openNovelProvider.notifier).open(novel);
    await tester.pumpAndSettle();

    final gauge = find.textContaining('Known 0 of');
    expect(gauge, findsOneWidget);
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await tester.ensureVisible(gauge);
    await tester.pumpAndSettle();
    await tester.tap(gauge);
    await tester.pumpAndSettle();
    expect(find.textContaining('What does Mira want'), findsOneWidget, reason: 'the interview, from the card');
    await tester.enterText(find.byType(TextField).last, 'To be free of the Guild');
    await tester.pumpAndSettle();
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Done'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Known 1 of'), findsOneWidget, reason: 'one more answered');
    expect(currentLocation(c), '/organize', reason: 'still the cast');
  });
}
