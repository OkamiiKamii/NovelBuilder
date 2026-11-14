import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/characters/widgets/manuscript_names.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';

import '../../helpers/pump_app.dart';

void main() {
  testWidgets('names written in the manuscript are offered to the cast: added in one press, or set aside', (
    tester,
  ) async {
    final c = await pumpApp(tester, location: '/organize');
    final novel = c.read(libraryServiceProvider).create({'title': 'Ash'}).id;
    final m = c.read(manuscriptServiceProvider);
    final one = m.create(novel, NodeKind.chapter, title: 'The Gate');
    const text = 'Then Mira looked at Kai. Later Mira turned, and Kai waited. So Mira went, and Kai followed.';
    m.save(novel, one.id, textToDoc(text), baseRev: 0);
    final before = m.open(novel, one.id).doc;
    c.read(openNovelProvider.notifier).open(novel);
    await tester.pumpAndSettle();

    expect(find.text('In your manuscript'), findsOneWidget);
    expect(find.text('3 times · in chapter 1'), findsNWidgets(2));
    await tester.tap(find.text('Add Mira'));
    await tester.pumpAndSettle();
    final names = [for (final r in c.read(novelStoreProvider).rowsIn(novel, 'loreEntries')) r['name']];
    expect(names, ['Mira']);
    expect(find.text('Add Mira'), findsNothing, reason: 'now in the cast');
    expect(find.text('Mira is in the cast.'), findsOneWidget);

    // Under the cast, now that there is one.
    await tester.ensureVisible(find.text('Not a character'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Not a character'));
    await tester.pumpAndSettle();
    expect(find.text('In your manuscript'), findsNothing, reason: 'nothing left to offer');
    expect(c.read(settingsStoreProvider).read(notCharactersKey(novel)), ['kai']);
    expect(m.open(novel, one.id).doc, before, reason: 'the text is never changed');
  });
}
