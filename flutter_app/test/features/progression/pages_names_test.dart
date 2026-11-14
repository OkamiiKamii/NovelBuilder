import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/progression/progression_providers.dart';
import 'package:novel_builder/features/progression/widgets/pages_names_view.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/novel_store.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/manuscript/outline.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/model/story_order.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:novel_builder/shared/domain/records/system.dart';
import 'package:novel_builder/shared/domain/systems/system_presets.dart';

import '../../helpers/pump_app.dart';

void main() {
  testWidgets('in your pages, not in the system: added to its group and the sheet in a press, or set aside', (
    tester,
  ) async {
    final c = await pumpApp(tester, size: const Size(1200, 2600), location: '/library');
    final store = c.read(novelStoreProvider);
    final novel = addSampleNovel(store, now: DateTime(2026, 11, 13).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    final chapters = [
      for (final n in readingOrder([for (final r in store.rowsIn(novel.id, 'chapters')) StoryNode(r)]))
        if (isDocument(n.kind)) n.id,
    ];
    final row = store.row(novel.id, 'chapterContents', chapters[0])!;
    store.writeRows(novel.id, [
      RowWrite.put('chapterContents', {
        ...row,
        'doc': textToDoc(
          'The bell rang.\n\n[Skill acquired: Tide Sense (E)]\n\nShe tried [Power Strike].\n\n'
          '[Title earned: Drowned Walker]\n\nAgain, [Tide Sense].',
        ),
      }),
    ]);
    final wren = store.rowsIn(novel.id, 'loreEntries').firstWhere((r) => r['name'] == 'Wren Hollis');
    final litrpg = systemPresets.firstWhere((p) => p.id == 'litrpg');
    final systemId = c.read(progressionServiceProvider).systems(novel.id, (x) {
      final made = x.createSystem(litrpg.content);
      x.addSheet(made.id, str(wren['id']));
      return made.id;
    });
    c.read(routerProvider).go('/organize/systems');
    await tester.pumpAndSettle();

    expect(find.text('IN YOUR PAGES, NOT IN THE SYSTEM'), findsOneWidget);
    expect(find.text('[Tide Sense]'), findsOneWidget);
    expect(find.text('Skill · rank E'), findsOneWidget);
    expect(find.text('[Power Strike]'), findsNothing, reason: 'the system holds it');
    expect(find.text('[Drowned Walker]'), findsOneWidget);

    await tester.tap(find.text('Add to Skills'));
    await tester.pumpAndSettle();
    final system = SystemBlueprint(store.row(novel.id, 'systems', systemId)!);
    final tide = system.items.firstWhere((i) => i.name == 'Tide Sense');
    expect(system.groupList.firstWhere((g) => g.id == tide.groupId).name, 'Skills');
    final sheet = SystemSheet(store.rowsIn(novel.id, 'systemSheets').single);
    expect(sheet.itemIds, contains(tide.id), reason: 'on the one sheet');
    expect(find.text('Tide Sense is in the system and on Wren Hollis’s sheet.'), findsOneWidget);
    expect(find.text('[Tide Sense]'), findsNothing);

    await tester.tap(find.text('Not part of it'));
    await tester.pumpAndSettle();
    expect(find.text('IN YOUR PAGES, NOT IN THE SYSTEM'), findsNothing);
    expect(c.read(settingsStoreProvider).read(setAsideKey(systemId)), ['Drowned Walker']);
  });
}
