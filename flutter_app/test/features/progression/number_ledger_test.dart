import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/progression/progression_providers.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/novel_store.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/manuscript/outline.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/model/story_order.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:novel_builder/shared/domain/systems/system_presets.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';

void main() {
  setUp(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDown(() => BlinkController.indeterminateAnimationsEnabled = true);

  testWidgets('the ledger: the numbers the pages give, a slip flagged, and read in its chapter', (tester) async {
    final c = await pumpApp(tester, size: const Size(1200, 2400), location: '/library');
    final store = c.read(novelStoreProvider);
    final novel = addSampleNovel(store, now: DateTime(2026, 11, 13).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    final chapters = [
      for (final n in readingOrder([for (final r in store.rowsIn(novel.id, 'chapters')) StoryNode(r)]))
        if (isDocument(n.kind)) n.id,
    ];
    void write(String id, String text) {
      final row = store.row(novel.id, 'chapterContents', id)!;
      store.writeRows(novel.id, [
        RowWrite.put('chapterContents', {...row, 'doc': textToDoc(text)}),
      ]);
    }

    write(chapters[0], 'Wren checked the window. Strength 13. Level 2.');
    write(chapters[1], 'The tide bell rang.\n\n[Strength +2 (12 → 14)]');
    final litrpg = systemPresets.firstWhere((p) => p.id == 'litrpg');
    c.read(progressionServiceProvider).systems(novel.id, (x) => x.createSystem(litrpg.content));
    c.read(routerProvider).go('/organize/systems');
    await tester.pumpAndSettle();

    expect(find.text('THE LEDGER'), findsOneWidget);
    expect(find.text('1 slip'), findsOneWidget);
    expect(find.text('Strength rises from 12 in chapter 2, but it was 13 in chapter 1.'), findsOneWidget);
    Finder line(String label) => find.byWidgetPredicate((w) => w is Semantics && w.properties.label == label);
    expect(line('Strength: 13 in chapter 1, 14 in chapter 2'), findsOneWidget);
    expect(line('Level: 2 in chapter 1'), findsOneWidget);

    final read = find.text('Read it in chapter 2');
    await tester.ensureVisible(read);
    await tester.tap(read);
    await tester.pumpAndSettle();
    expect(currentLocation(c), '/write');
    expect(c.read(selectedNodeProvider), chapters[1]);
    expect(str(store.novel(novel.id)?.title), 'The Drowned Road', reason: 'it only reads');
    await tester.pump(const Duration(seconds: 2));
  });

  testWidgets('pages that give none of its numbers: said so', (tester) async {
    final c = await pumpApp(tester, size: const Size(1200, 2400), location: '/library');
    final store = c.read(novelStoreProvider);
    final novel = addSampleNovel(store, now: DateTime(2026, 11, 13).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    c.read(progressionServiceProvider).systems(novel.id, (x) => x.createSystem({'name': 'Quiet', 'variables': []}));
    c.read(routerProvider).go('/organize/systems');
    await tester.pumpAndSettle();
    expect(find.textContaining('Your pages do not give any of its numbers yet.'), findsOneWidget);
  });
}
