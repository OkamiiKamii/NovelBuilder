import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/search/book_index_page.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';

void main() {
  setUpAll(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDownAll(() => BlinkController.indeterminateAnimationsEnabled = true);

  testWidgets('from More, the index: names A to Z, a slip spelled two ways, and a chapter a press away', (
    tester,
  ) async {
    final c = await pumpApp(tester, size: phone, location: '/organize');
    final novel = addSampleNovel(c.read(novelStoreProvider), now: DateTime(2026, 11, 12).millisecondsSinceEpoch);
    final m = c.read(manuscriptServiceProvider);
    final coda = m.create(novel.id, NodeKind.chapter, title: 'Coda');
    m.save(novel.id, coda.id, textToDoc('Then Wren saw that Tobias had come back.'), baseRev: 0);
    c.read(openNovelProvider.notifier).open(novel.id);
    await tester.pumpAndSettle();

    await tester.tap(find.text('More'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('The index'));
    await tester.pumpAndSettle();
    expect(find.byType(BookIndexPage), findsOneWidget);
    expect(find.text('Aldous Crane'), findsOneWidget);
    expect(find.text('SPELLED TWO WAYS?'), findsOneWidget);
    expect(find.text('Tobias (1) · Tobiah (53)'), findsOneWidget);

    // The slip, a press away: its chapter opens with find on it.
    await tester.tap(find.text('See “Tobias”'));
    await tester.pumpAndSettle();
    expect(find.byType(BookIndexPage), findsNothing);
    expect(c.read(selectedNodeProvider), coda.id);
    expect(currentLocation(c), startsWith('/write'));
    expect(find.text('Tobias'), findsWidgets, reason: 'find is open on the name');
  });

  testWidgets('a book with no words has no index line', (tester) async {
    final c = await pumpApp(tester, size: phone, location: '/organize');
    final novel = c.read(libraryServiceProvider).create({'title': 'Blank'});
    c.read(openNovelProvider.notifier).open(novel.id);
    await tester.pumpAndSettle();
    await tester.tap(find.text('More'));
    await tester.pumpAndSettle();
    expect(find.text('The index'), findsNothing);
  });
}
