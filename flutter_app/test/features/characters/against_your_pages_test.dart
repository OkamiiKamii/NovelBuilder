import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/characters/looks.dart';
import 'package:novel_builder/shared/domain/characters/record_look.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/records/entry.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';

void main() {
  setUpAll(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDownAll(() => BlinkController.indeterminateAnimationsEnabled = true);

  testWidgets('a profile checked against the pages: a slip shown and put right, a look recorded, the chapter a press '
      'away', (tester) async {
    final c = await pumpApp(tester, size: phone, location: '/organize');
    final novel = c.read(libraryServiceProvider).create({'title': 'Ash Road'}).id;
    final s = c.read(characterServiceProvider);
    final wren = s.change(novel, (x) {
      final w = x.create(name: 'Wren Hollis');
      recordLook(x, w.id, Feature.eyes, 'Grey');
      return w;
    }).id;
    s.change(novel, (x) => x.create(name: 'Kai Doyle'));
    final m = c.read(manuscriptServiceProvider);
    final one = m.create(novel, NodeKind.chapter, title: 'The Bell');
    m.save(
      novel,
      one.id,
      textToDoc(
        'Wren’s blue eyes narrowed at the window.\n'
        'Wren pushed back her black hair and went down.\n'
        'Wren watched Kai push back his red hair.',
      ),
      baseRev: 0,
    );
    c.read(openNovelProvider.notifier).open(novel);
    await tester.pumpAndSettle();
    c.read(routerProvider).go('/organize/character/$wren');
    await tester.pumpAndSettle();

    String fieldOf(String key) => Entry(
      c.read(novelStoreProvider).row(novel, 'loreEntries', wren)!,
    ).fields.firstWhere((f) => f.key == key, orElse: () => throw StateError('no $key')).value;

    await tester.scrollUntilVisible(
      find.text('Checked against your pages'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.textContaining('One look in your chapters does not match'), findsOneWidget);
    expect(find.text('Eyes: the profile says Grey; The Bell says “blue eyes”.'), findsOneWidget);
    expect(find.text('Hair: The Bell says “her black hair”. Not in the profile yet.'), findsOneWidget);
    expect(find.textContaining('red'), findsNothing, reason: 'Kai’s hair is not hers');

    // Put right, in a press: the profile now agrees.
    await tester.ensureVisible(find.text('Make it blue'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Make it blue'));
    await tester.pumpAndSettle();
    expect(fieldOf('Eyes'), 'Blue');
    expect(find.text('Eyes: Blue, as your pages have it.'), findsOneWidget);

    // Recorded, in a press.
    await tester.ensureVisible(find.text('Record black'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Record black'));
    await tester.pumpAndSettle();
    expect(fieldOf('Hair'), 'Black');
    expect(find.text('Hair: Black, as your pages have it.'), findsOneWidget);
  });

  testWidgets('a slip a press from its chapter', (tester) async {
    final c = await pumpApp(tester, size: phone, location: '/organize');
    final novel = c.read(libraryServiceProvider).create({'title': 'Ash Road'}).id;
    final wren = c.read(characterServiceProvider).change(novel, (x) {
      final w = x.create(name: 'Wren Hollis');
      recordLook(x, w.id, Feature.eyes, 'Grey');
      return w;
    }).id;
    final m = c.read(manuscriptServiceProvider);
    final one = m.create(novel, NodeKind.chapter, title: 'The Bell');
    m.save(novel, one.id, textToDoc('Wren’s blue eyes narrowed at the window.'), baseRev: 0);
    c.read(openNovelProvider.notifier).open(novel);
    await tester.pumpAndSettle();
    c.read(routerProvider).go('/organize/character/$wren');
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Read it in The Bell'), 300, scrollable: find.byType(Scrollable).first);
    await tester.ensureVisible(find.text('Read it in The Bell'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Read it in The Bell'));
    await tester.pumpAndSettle();
    expect(c.read(selectedNodeProvider), one.id);
  });
}
