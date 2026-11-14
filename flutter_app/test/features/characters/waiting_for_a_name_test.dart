import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/characters/widgets/waiting_for_a_name.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/novel_store.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/characters/cast.dart' show fieldNamed;
import 'package:novel_builder/shared/domain/characters/character_records.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/records/entry.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';

import '../../helpers/pump_app.dart';

void main() {
  testWidgets('waiting for a name: the unnamed people of the pages, named in a press, their mentions theirs', (
    tester,
  ) async {
    final c = await pumpApp(tester, size: const Size(1200, 2600), location: '/organize');
    final novel = c.read(libraryServiceProvider).create({'title': 'Skill'}).id;
    c.read(openNovelProvider.notifier).open(novel);
    c.read(characterServiceProvider).change(novel, (x) => x.create(name: 'James'));
    final chapter = c.read(manuscriptServiceProvider).create(novel, NodeKind.chapter, title: 'One').id;
    final store = c.read(novelStoreProvider);
    store.writeRows(novel, [
      RowWrite.put('chapterContents', {
        ...?store.row(novel, 'chapterContents', chapter),
        'id': chapter,
        'doc': textToDoc(
          'James sat down. The waitress came over.\n\n'
          '"One Elegant Cat," he said. The waitress nodded. A guard watched.\n\n'
          'The guard yawned. With that the waitress left.',
        ),
      }),
    ]);
    await tester.pumpAndSettle();
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 300)));
    await tester.pumpAndSettle();
    Finder inCard(Finder f) => find.descendant(of: find.byType(WaitingForAName), matching: f);
    expect(inCard(find.text('WAITING FOR A NAME')), findsOneWidget);
    expect(inCard(find.text('The waitress')), findsOneWidget);
    expect(inCard(find.text('3 times, in chapter 1')), findsOneWidget);
    expect(inCard(find.text('The guard')), findsOneWidget);

    // Named: a character with the name, the title, the alias, the occupation.
    await tester.tap(inCard(find.text('Write a name')).first);
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).last, 'Mira');
    await tester.tap(find.text('Add to the cast'));
    await tester.pumpAndSettle();
    final mira = store.rowsIn(novel, 'loreEntries').firstWhere((r) => r['name'] == 'Mira');
    final profile = CharacterProfile(
      store.rowsIn(novel, 'characterProfiles').firstWhere((r) => r['entryId'] == mira['id']),
    );
    expect(profile.epithet, 'the waitress');
    expect(profile.aliases, ['the waitress', 'The waitress']);
    expect(fieldNamed(Entry(mira), 'Occupation'), 'Waitress');
    expect(find.text('Mira is the waitress now: all 3 mentions are theirs.'), findsOneWidget);
    expect(inCard(find.text('The waitress')), findsNothing);

    // Not a character: set aside, remembered; nothing left, no card.
    await tester.tap(inCard(find.text('Not a character')));
    await tester.pumpAndSettle();
    expect(find.text('WAITING FOR A NAME'), findsNothing);
    expect(c.read(settingsStoreProvider).read(unnamedAsideKey(novel)), ['guard']);
    expect(str(mira['name']), 'Mira');
  });
}
