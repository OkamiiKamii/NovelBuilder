import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/app/shell/trail.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/novel_store.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';
import 'package:novel_builder/shared/domain/json.dart';

import '../helpers/pump_app.dart';

void main() {
  test('walking: the newest first, a place once (by where it is), the oldest let go', () {
    var trail = <TrailStep>[];
    for (var i = 0; i < trailKept + 3; i++) {
      trail = walkedTo(trail, '/plan/thread/t$i', i);
    }
    expect(trail, hasLength(trailKept));
    expect(trail.first.location, '/plan/thread/t${trailKept + 2}');
    trail = walkedTo(trail, '/plan/thread/t5?x=1', 99);
    expect(trail.first, (location: '/plan/thread/t5?x=1', at: 99));
    expect(trail.where((s) => s.location.startsWith('/plan/thread/t5')), hasLength(1));
    expect(
      trailFrom([
        {'location': '/plan/board', 'at': 3},
        {'location': 4},
        'x',
      ]),
      [(location: '/plan/board', at: 3)],
    );
  });

  testWidgets('More shows where you were by name, newest first; a press goes back; renamed and deleted followed', (
    tester,
  ) async {
    final c = await pumpApp(tester, size: phone);
    final store = c.read(novelStoreProvider);
    final novel = addSampleNovel(store, now: DateTime(2026, 11, 12).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    final wren = store.rowsIn(novel.id, 'loreEntries').firstWhere((r) => r['name'] == 'Wren Hollis');
    final thread = store.rowsIn(novel.id, 'plotThreads').first;
    final router = c.read(routerProvider);

    // The bar's own pages are not kept; deep ones are.
    for (final at in [
      '/write',
      '/organize/character/${wren['id']}',
      '/visualize/plot',
      '/plan/thread/${thread['id']}',
    ]) {
      router.go(at);
      await tester.pumpAndSettle();
    }
    expect(
      [for (final s in c.read(trailProvider)) s.location],
      ['/plan/thread/${thread['id']}', '/visualize/plot', '/organize/character/${wren['id']}'],
    );
    expect(c.read(settingsStoreProvider).read(trailSettingKey(novel.id)), hasLength(3), reason: 'kept on the device');

    router.go('/write');
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.more_horiz));
    await tester.pumpAndSettle();
    expect(find.text('WHERE YOU WERE'), findsOneWidget);
    expect(find.text(str(thread['title'])), findsOneWidget);
    expect(find.text('Plot lanes'), findsOneWidget);
    expect(find.text('Wren Hollis'), findsWidgets);
    final back = find.bySemanticsLabel(RegExp('^Back to Wren Hollis, character'));
    await tester.ensureVisible(back);
    await tester.pumpAndSettle();
    await tester.tap(back);
    await tester.pumpAndSettle();
    expect(currentLocation(c), '/organize/character/${wren['id']}');

    // Here now: left off the trail in More. Renamed: shown by the new name. Deleted: gone.
    await tester.tap(find.byIcon(Icons.more_horiz));
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel(RegExp('^Back to Wren Hollis')), findsNothing, reason: 'the page open now');
    Navigator.of(tester.element(find.byType(BottomSheet))).pop();
    await tester.pumpAndSettle();
    router.go('/write');
    await tester.pumpAndSettle();
    store.writeRows(novel.id, [
      RowWrite.put('loreEntries', {...wren, 'name': 'Wren Hollis-Vane'}),
    ]);
    await tester.tap(find.byIcon(Icons.more_horiz));
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel(RegExp('^Back to Wren Hollis-Vane, character')), findsOneWidget);
    Navigator.of(tester.element(find.byType(BottomSheet))).pop();
    await tester.pumpAndSettle();
    store.writeRows(novel.id, [RowWrite.delete('plotThreads', str(thread['id']))]);
    await tester.tap(find.byIcon(Icons.more_horiz));
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel(RegExp('^Back to ${RegExp.escape(str(thread['title']))}')), findsNothing);
  });

  testWidgets('a book with no trail yet: no row', (tester) async {
    final c = await pumpApp(tester, size: phone);
    final novel = addSampleNovel(c.read(novelStoreProvider), now: DateTime(2026, 11, 12).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    c.read(routerProvider).go('/write');
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.more_horiz));
    await tester.pumpAndSettle();
    expect(find.text('WHERE YOU WERE'), findsNothing);
  });
}
