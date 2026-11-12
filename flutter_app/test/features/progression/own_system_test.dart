import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';

import '../../helpers/pump_app.dart';

void main() {
  testWidgets('Systems offers the book’s own system first, and begins it with its skills and the hero’s sheet', (
    tester,
  ) async {
    final c = await pumpApp(tester, size: phone, location: '/organize/systems');
    final novel = c.read(libraryServiceProvider).create({'title': 'Skill In Fantasy'}).id;
    final m = c.read(manuscriptServiceProvider);
    final one = m.create(novel, NodeKind.chapter, title: 'Chapter 1');
    m.save(
      novel,
      one.id,
      textToDoc(
        'Whenever James wants to choose a skill, he searches a big library.\n'
        'For now, James was flying by using Smart Atoms skill. His level rose.',
      ),
      baseRev: 0,
    );
    final s = c.read(characterServiceProvider);
    final james = s.change(novel, (x) => x.create(name: 'James', roles: ['Protagonist'])).id;
    s.change(novel, (x) => x.createEntry('power', 'Empathic Mimicry'));
    c.read(openNovelProvider.notifier).open(novel);
    await tester.pumpAndSettle();

    expect(find.text('Your book’s own system'), findsOneWidget);
    expect(find.textContaining('“skill” ×2'), findsOneWidget);
    expect(find.text('Empathic Mimicry'), findsOneWidget);
    expect(find.text('Smart Atoms'), findsOneWidget);
    expect(find.text('A sheet for James, holding all 2.'), findsOneWidget);
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(textContrastGuideline));

    await tester.ensureVisible(find.text('Begin with your book’s system'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Begin with your book’s system'));
    await tester.pumpAndSettle();

    final store = c.read(novelStoreProvider);
    final systems = store.rowsIn(novel, 'systems');
    expect(systems, hasLength(1));
    final items = [for (final i in systems.single['items'] as List) i as Map];
    final mine = items.where((i) => ['Empathic Mimicry', 'Smart Atoms'].contains(i['name'])).toList();
    expect(mine, hasLength(2));
    final sheets = store.rowsIn(novel, 'systemSheets');
    expect(sheets.single['entryId'], james);
    expect((sheets.single['itemIds'] as List).toSet(), {for (final i in mine) i['id']});
    expect(find.text('Your book’s own system'), findsNothing, reason: 'begun: the system itself is shown');
  });
}
