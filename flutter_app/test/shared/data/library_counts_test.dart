import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/novel_store.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/large_novel.dart';
import '../../helpers/pump_app.dart';

/// The library's numbers (words, chapters…) are counted only while the library shows them, and then only for the books
/// written in since: a save on the page being written on no longer counts every book of the library.
void main() {
  setUp(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDown(() => BlinkController.indeterminateAnimationsEnabled = true);

  testWidgets('counted for one book, the numbers are the ones counted for all', (tester) async {
    final c = await pumpApp(tester, location: '/');
    final store = c.read(novelStoreProvider);
    final a = c.read(libraryServiceProvider).create({'title': 'A'}).id;
    final b = c.read(libraryServiceProvider).create({'title': 'B'}).id;
    store.writeRows(a, [
      RowWrite.put('chapters', {'id': 'c1', 'projectId': a, 'kind': 'chapter', 'title': 'One', 'wordCount': 120}),
    ]);
    final all = store.stats();
    final one = store.stats(only: [a]);
    expect(one.keys, [a]);
    expect((one[a]!.words, one[a]!.chapters), (all[a]!.words, all[a]!.chapters));
    expect((one[a]!.words, one[a]!.chapters), (120, 1));
    expect(store.stats(only: const []), isEmpty);
    expect(store.stats(only: [b]), isEmpty, reason: 'a book with no records has no numbers');
  });

  testWidgets(
    'not counted while writing; back in the library, only the book written in is counted again',
    (tester) async {
      final c = await pumpApp(tester, size: phone, location: '/');
      final store = c.read(novelStoreProvider);
      final s = largeNovel();
      store.putNovel(s);
      final other = c.read(libraryServiceProvider).create({'title': 'Another book'}).id;
      store.writeRows(other, [
        RowWrite.put('chapters', {'id': 'o1', 'projectId': other, 'kind': 'chapter', 'title': 'One', 'wordCount': 50}),
      ]);
      await tester.pumpAndSettle();
      final before = c.read(novelStatsProvider);
      expect(before[s.projectId]!.words, greaterThan(0));

      c.read(openNovelProvider.notifier).open(s.projectId);
      c.read(routerProvider).go('/write');
      await tester.pumpAndSettle();

      final m = c.read(manuscriptServiceProvider);
      final scene = s.rows('chapters').firstWhere((r) => r['kind'] == 'scene')['id']! as String;
      final was = s.rows('chapters').firstWhere((r) => r['id'] == scene)['wordCount']! as int;
      m.save(s.projectId, scene, textToDoc('Five new words, written here.'), baseRev: m.open(s.projectId, scene).rev);
      await tester.pumpAndSettle();
      expect(
        identical(c.read(novelStatsProvider), before),
        isTrue,
        reason: 'nothing counts the library while a page is written: the numbers are as they were',
      );

      c.read(routerProvider).go('/');
      await tester.pumpAndSettle();
      final after = c.read(novelStatsProvider);
      expect(
        after[s.projectId]!.words,
        before[s.projectId]!.words - was + 5,
        reason: 'the book written in, counted again',
      );
      expect(identical(after[other], before[other]), isTrue, reason: 'the other book, as it was counted: not again');

      // A book made and one deleted: the numbers follow.
      final made = c.read(libraryServiceProvider).create({'title': 'New'}).id;
      store.writeRows(made, [
        RowWrite.put('chapters', {'id': 'n1', 'projectId': made, 'kind': 'chapter', 'title': 'One', 'wordCount': 7}),
      ]);
      await tester.pumpAndSettle();
      expect(c.read(novelStatsProvider)[made]!.words, 7);
      store.deleteNovel(other);
      await tester.pumpAndSettle();
      expect(c.read(novelStatsProvider).containsKey(other), isFalse);
      await tester.pump(const Duration(seconds: 3));
    },
    timeout: const Timeout(Duration(minutes: 3)),
  );
}
