import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';

import '../../helpers/pump_app.dart';

void main() {
  testWidgets('a profile shows how often the name is written, counted from the saved chapters', (tester) async {
    final c = await pumpApp(tester, size: const Size(1400, 2000), location: '/');
    final novel = c.read(libraryServiceProvider).create({'title': 'Ash'}).id;
    final m = c.read(manuscriptServiceProvider);
    final one = m.create(novel, NodeKind.chapter, title: 'One');
    m.save(novel, one.id, textToDoc('Kael ran. “Kael!” she called.\n\nKaelen did not answer.'), baseRev: 0);
    final two = m.create(novel, NodeKind.chapter, title: 'Two');
    m.save(novel, two.id, textToDoc('Then Kael slept.'), baseRev: 0);
    late String kael;
    c.read(characterServiceProvider).change(novel, (x) => kael = x.create(name: 'Kael').id);
    c.read(openNovelProvider.notifier).open(novel);
    c.read(routerProvider).go('/organize/character/$kael');
    await tester.pumpAndSettle();

    // The figure under its label: counted in the background, then shown.
    final stat = find.ancestor(of: find.text('Name mentions'), matching: find.byType(Column)).first;
    expect(
      find.descendant(of: stat, matching: find.text('3')),
      findsOneWidget,
      reason: 'twice in the first chapter (not in “Kaelen”), once in the second',
    );
  });
}
