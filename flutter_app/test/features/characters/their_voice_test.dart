import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/characters/widgets/their_voice.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/novel_store.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';

import '../../helpers/pump_app.dart';

void main() {
  testWidgets('their voice: measured from their lines against the cast; their words; whom they sound like', (
    tester,
  ) async {
    final c = await pumpApp(tester, size: const Size(1200, 4000), location: '/library');
    final store = c.read(novelStoreProvider);
    final novel = addSampleNovel(store, now: DateTime(2026, 11, 13).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    final wren = store.rowsIn(novel.id, 'loreEntries').firstWhere((r) => r['name'] == 'Wren Hollis');
    c.read(routerProvider).go('/organize/character/${wren['id']}');
    await tester.pumpAndSettle();
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 300)));
    await tester.pumpAndSettle();
    Finder inVoice(Finder f) => find.descendant(of: find.byType(TheirVoice), matching: f);
    expect(inVoice(find.text('Their voice')), findsOneWidget);
    expect(inVoice(find.text('How Wren Hollis talks, from 36 lines, against the rest of the cast.')), findsOneWidget);
    expect(
      inVoice(
        find.byWidgetPredicate(
          (w) => w is Semantics && (w.properties.label ?? '').startsWith('Words a line: 6.6; the cast'),
        ),
      ),
      findsOneWidget,
    );
    expect(inVoice(find.text('WORDS THAT ARE THEIRS')), findsOneWidget);
    for (final w in ['master', 'bell', 'tide']) {
      expect(inVoice(find.text('“$w”')), findsOneWidget, reason: w);
    }
    expect(inVoice(find.text('Sounds most like Tobiah Fenn.')), findsOneWidget);
  });

  testWidgets('one who says nothing yet: no card', (tester) async {
    final c = await pumpApp(tester, size: const Size(1200, 4000), location: '/library');
    final store = c.read(novelStoreProvider);
    final novel = addSampleNovel(store, now: DateTime(2026, 11, 13).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    final jory = store.rowsIn(novel.id, 'loreEntries').firstWhere((r) => r['name'] == 'Jory');
    c.read(routerProvider).go('/organize/character/${jory['id']}');
    await tester.pumpAndSettle();
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 300)));
    await tester.pumpAndSettle();
    expect(find.text('Their voice'), findsNothing);
  });

  testWidgets('the only one who speaks enough: measured, with no cast to mark against', (tester) async {
    final c = await pumpApp(tester, size: const Size(1200, 4000), location: '/library');
    final novel = c.read(libraryServiceProvider).create({'title': 'Alone'}).id;
    c.read(openNovelProvider.notifier).open(novel);
    final mira = c.read(characterServiceProvider).change(novel, (x) => x.create(name: 'Mira')).id;
    final chapter = c.read(manuscriptServiceProvider).create(novel, NodeKind.chapter, title: 'One').id;
    final store = c.read(novelStoreProvider);
    final row = store.row(novel, 'chapterContents', chapter) ?? {'id': chapter};
    store.writeRows(novel, [
      RowWrite.put('chapterContents', {
        ...row,
        'id': chapter,
        'doc': textToDoc([for (var i = 0; i < 6; i++) '“Line $i, and on we go,” Mira said.'].join('\n\n')),
      }),
    ]);
    c.read(routerProvider).go('/organize/character/$mira');
    await tester.pumpAndSettle();
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 300)));
    await tester.pumpAndSettle();
    expect(find.textContaining('(no one else speaks enough yet)'), findsOneWidget);
    expect(find.text('the rest of the cast'), findsNothing);
    expect(
      find.byWidgetPredicate((w) => w is Semantics && (w.properties.label ?? '') == 'Words a line: 5.0'),
      findsOneWidget,
      reason: 'no cast figure to set it against',
    );
  });
}
