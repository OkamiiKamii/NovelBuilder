import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/characters/interview.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/records/entry.dart';

import '../../helpers/pump_app.dart';

void main() {
  testWidgets('an interview fills a character\'s empty profile, one question at a time, each into its field', (
    tester,
  ) async {
    final c = await pumpApp(tester, location: '/organize');
    final novel = c.read(libraryServiceProvider).create({'title': 'Ash'}).id;
    c.read(openNovelProvider.notifier).open(novel);
    final mira = c.read(characterServiceProvider).change(novel, (x) => x.create(name: 'Mira')).id;
    c.read(routerProvider).go('/organize/character/$mira');
    await tester.pumpAndSettle();
    Entry stored() => Entry(c.read(novelStoreProvider).row(novel, 'loreEntries', mira)!);
    final cast = c.read(castProvider)!;
    final asked = interviewFor(stored(), cast.listed(mira)!.profile, cast.templates);
    expect(asked.length, greaterThan(4), reason: 'the general layout leaves much to ask');
    expect(asked.first.ask, 'What does Mira want more than anything?', reason: 'named, never given a pronoun');

    await tester.tap(find.text('Interview Mira'));
    await tester.pumpAndSettle();
    expect(find.text('What does Mira want more than anything?'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Answer'), 'To bring her brother home.');
    await tester.pump();
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();
    expect(find.text('What is Mira afraid of?'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Answer'), 'deep water, the dark');
    await tester.pump();
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();
    expect(find.text('2 answers saved to the profile.'), findsOneWidget);
    await tester.tap(find.text('Skip'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Done'));
    await tester.pumpAndSettle();

    final fields = {for (final f in stored().fields) f.key: f.value};
    expect(fields[asked.first.fieldName], 'To bring her brother home.');
    expect(fields['Fears'], 'deep water\nthe dark', reason: 'a list field takes one item per answer part');
    final now = c.read(castProvider)!;
    expect(
      interviewFor(stored(), now.listed(mira)!.profile, now.templates).length,
      asked.length - 2,
      reason: 'answered questions are not asked again',
    );
  });
}
