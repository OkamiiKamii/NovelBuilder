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
  testWidgets('Stakes: what drives each of them, a question answered in a press, and where they collide', (
    tester,
  ) async {
    final c = await pumpApp(tester, size: phone, location: '/organize');
    final novel = c.read(libraryServiceProvider).create({'title': 'Ash'}).id;
    c.read(openNovelProvider.notifier).open(novel);
    final s = c.read(characterServiceProvider);
    final mira = s.change(novel, (x) => x.create(name: 'Mira Vale')).id;
    final kai = s.change(novel, (x) => x.create(name: 'Kai')).id;
    s.change(novel, (x) => recordStake(x, kai, Stake.wants, 'To see Mira hanged for the fire'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Stakes'));
    await tester.pumpAndSettle();
    expect(c.read(castViewProvider), CastView.stakes);
    expect(find.textContaining('You know what 1 of 2 characters want'), findsOneWidget);
    expect(find.text('WHERE THEY COLLIDE'), findsOneWidget);
    expect(find.text('Kai’s want names Mira Vale'), findsOneWidget);

    // A question asked, answered, and in her profile.
    final ask = find.bySemanticsLabel('What does Mira Vale want?');
    await tester.ensureVisible(ask);
    await tester.pumpAndSettle();
    await tester.tap(ask);
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).last, 'To prove the fire was not hers');
    await tester.tap(find.text('Keep'));
    await tester.pumpAndSettle();
    Entry entry(String id) => Entry(c.read(novelStoreProvider).row(novel, 'loreEntries', id)!);
    expect(fieldNamed(entry(mira), 'What they want'), 'To prove the fire was not hers');
    expect(find.text('You know what every one of them wants.'), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp('^Wants: To prove the fire was not hers')), findsOneWidget);

    // Changed in a press too: the same field rewritten, not a second one.
    await tester.tap(find.bySemanticsLabel(RegExp('^Wants: To prove the fire')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).last, 'To prove the fire was Kai’s');
    await tester.tap(find.text('Keep'));
    await tester.pumpAndSettle();
    expect(fieldNamed(entry(mira), 'What they want'), 'To prove the fire was Kai’s');
    expect(entry(mira).fields.where((f) => f.key == 'What they want'), hasLength(1));
    expect(find.textContaining('want names'), findsOneWidget, reason: 'a pair collides once, however many ways');
  });

  testWidgets('no one’s wants written: said so, not “0 of 1”', (tester) async {
    final c = await pumpApp(tester, size: phone, location: '/organize');
    final novel = c.read(libraryServiceProvider).create({'title': 'Ash'}).id;
    c.read(openNovelProvider.notifier).open(novel);
    c.read(characterServiceProvider).change(novel, (x) => x.create(name: 'James'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Stakes'));
    await tester.pumpAndSettle();
    expect(find.textContaining('No one’s wants are written yet.'), findsOneWidget);
    expect(find.bySemanticsLabel('What does James want?'), findsOneWidget);
  });
}
