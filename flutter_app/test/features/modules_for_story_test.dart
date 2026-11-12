import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/modules/modules_page.dart' show modulesSuggestionRuns;
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';

import '../helpers/pump_app.dart';

void main() {
  testWidgets('Modules opens on what the story calls for, said why, turned on in one press', (tester) async {
    final c = await pumpApp(tester, size: phone, location: '/organize/modules');
    final novel = c.read(libraryServiceProvider).create({'title': 'Skill Creator'}).id;
    final m = c.read(manuscriptServiceProvider);
    final one = m.create(novel, NodeKind.chapter, title: 'Chapter 1');
    m.save(
      novel,
      one.id,
      textToDoc('Can create skills.\n\nHave ranks from E to SSS.\n\nHave 4 evolution from Ranks.'),
      baseRev: 0,
    );
    c.read(openNovelProvider.notifier).open(novel);
    await tester.pumpAndSettle();

    expect(find.text('Made for your story'), findsOneWidget);
    expect(find.text('Progression Fantasy & LitRPG'), findsWidgets);
    expect(find.textContaining('Your book mentions'), findsOneWidget);
    expect(find.textContaining('ranks'), findsWidgets);
    await expectLater(tester, meetsGuideline(textContrastGuideline));

    // The suggestion's own (the shelf below has one for every module too).
    await tester.tap(find.bySemanticsLabel('Turn on Progression Fantasy & LitRPG').first);
    await tester.pumpAndSettle();
    final installed = c.read(novelStoreProvider).rowsIn(novel, 'projectModules');
    expect(installed.where((r) => r['moduleId'] == 'progression' && r['enabled'] == true), hasLength(1));
    expect(find.text('Made for your story'), findsNothing, reason: 'nothing left to offer once it is on');
  });

  testWidgets('a story with no telling words is offered nothing', (tester) async {
    final c = await pumpApp(tester, size: phone, location: '/organize/modules');
    final novel = c.read(libraryServiceProvider).create({'title': 'Blank'}).id;
    c.read(openNovelProvider.notifier).open(novel);
    await tester.pumpAndSettle();
    expect(find.text('Made for your story'), findsNothing);
    expect(find.text('Genre modules'), findsOneWidget);
  });

  testWidgets('the suggestions are worked out again only when the chapters (or the details) change', (tester) async {
    final c = await pumpApp(tester, size: phone, location: '/organize/modules');
    final novel = c.read(libraryServiceProvider).create({'title': 'Skill Creator'}).id;
    final m = c.read(manuscriptServiceProvider);
    final one = m.create(novel, NodeKind.chapter, title: 'Chapter 1');
    m.save(novel, one.id, textToDoc('Can create skills. Have ranks.'), baseRev: 0);
    var runs = 0;
    c.read(openNovelProvider.notifier).open(novel);
    await tester.pumpAndSettle();
    expect(find.text('Made for your story'), findsOneWidget);
    runs = modulesSuggestionRuns;

    // Something else in the novel is saved: the page rebuilds, but the chapters are not read again.
    c.read(characterServiceProvider).change(novel, (x) => x.create(name: 'Mira'));
    await tester.pumpAndSettle();
    expect(modulesSuggestionRuns, runs, reason: 'a character is not a chapter');

    // A chapter changes: worked out again.
    m.save(novel, one.id, textToDoc('Can create skills. Have ranks. A dragon.'), baseRev: 1);
    await tester.pumpAndSettle();
    expect(modulesSuggestionRuns, runs + 1);
  });
}
