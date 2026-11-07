import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/backup_service.dart';
import 'package:novel_builder/shared/data/database.dart';
import 'package:novel_builder/shared/data/draft_store.dart';
import 'package:novel_builder/shared/data/novel_store.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/json.dart';

import '../helpers/large_novel.dart';
import '../helpers/pump_app.dart';

/// Every screen at a realistic size: a large novel loads, each area opens without an error, and totals are right.
/// Timings here are not measurements (tests run without the real engine); `integration_test/perf_test.dart` measures.
const screens = [
  '/',
  '/write',
  '/write/read',
  '/write/book',
  '/organize',
  '/organize/world',
  '/organize/systems',
  '/organize/modules',
  '/plan',
  '/plan/calendar',
  '/plan/threads',
  '/plan/board',
  '/plan/histories',
  '/review',
  '/review/records',
  '/review/timeline',
  '/review/canon',
  '/review/continuity',
  '/review/consequences',
  '/review/team',
  '/visualize',
  '/visualize/timeline',
  '/visualize/order',
  '/visualize/plot',
  '/visualize/structure',
  '/visualize/appearances',
  '/visualize/graph',
  '/visualize/kinds',
  '/visualize/abilities',
  '/visualize/progression',
  '/visualize/places',
  '/visualize/knowledge',
  '/visualize/journeys',
  '/visualize/factions',
  '/visualize/ownership',
  '/visualize/charts',
  '/visualize/history',
  '/progress',
  '/progress/analytics',
  '/settings',
  '/settings/import-export',
];

void main() {
  test('the generated novel has the size it says', () {
    final s = largeNovel();
    int n(String c) => s.rows(c).length;
    expect(
      [n('chapters'), n('chapterContents'), n('loreEntries'), n('loreLinks'), n('characterRelations')],
      [910, 600, 1000, 4000, 600],
    );
    var words = 0;
    for (final r in s.rows('chapters')) {
      words += (numOrNull(r['wordCount']) ?? 0).toInt();
    }
    expect(words, greaterThan(300000));
  });

  for (final size in [desktop, phone]) {
    testWidgets('every screen opens on a large novel (${size.width.toInt()} wide)', (tester) async {
      final c = await pumpApp(tester, size: size);
      final snapshot = largeNovel();
      c.read(novelStoreProvider).putNovel(snapshot);
      c.read(openNovelProvider.notifier).open(snapshot.projectId);
      await tester.pumpAndSettle();
      for (final path in screens) {
        c.read(routerProvider).go(path);
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull, reason: path);
        expect(find.text('Something went wrong'), findsNothing, reason: path);
        expect(currentLocation(c), path);
      }
      await tester.pump(const Duration(seconds: 2));
    }, timeout: const Timeout(Duration(minutes: 10)));
  }

  testWidgets('plot lanes on 300 chapters: cells far along are built when scrolled or moved to', (tester) async {
    final c = await pumpApp(tester);
    final snapshot = largeNovel();
    c.read(novelStoreProvider).putNovel(snapshot);
    c.read(openNovelProvider.notifier).open(snapshot.projectId);
    c.read(routerProvider).go('/visualize/plot');
    await tester.pumpAndSettle();
    expect(find.byTooltip('Chapter 1: Chapter 1'), findsOneWidget);
    expect(find.byTooltip('Chapter 300: Chapter 300'), findsNothing);
    final lanes = tester
        .stateList<ScrollableState>(find.byType(Scrollable))
        .where((s) => s.position.axis == Axis.horizontal)
        .reduce((a, b) => a.position.maxScrollExtent >= b.position.maxScrollExtent ? a : b);
    lanes.position.jumpTo(lanes.position.maxScrollExtent);
    await tester.pumpAndSettle();
    expect(find.byTooltip('Chapter 300: Chapter 300'), findsOneWidget);
    expect(find.byTooltip('Chapter 1: Chapter 1'), findsNothing);
    // The keyboard reaches the start again, and its cells come back.
    lanes.position.jumpTo(0);
    await tester.pumpAndSettle();
    expect(find.byTooltip('Chapter 1: Chapter 1'), findsOneWidget);
    await tester.pump(const Duration(seconds: 2));
  });

  testWidgets('scene board: 300 chapters in one part are built near the screen, and far ones when scrolled to', (
    tester,
  ) async {
    final c = await pumpApp(tester);
    // One volume of 300 chapters: one part, one row of columns.
    final snapshot = largeNovel(volumes: 1, chaptersPerVolume: 300, scenesPerChapter: 1, links: 0, relations: 0);
    c.read(novelStoreProvider).putNovel(snapshot);
    c.read(openNovelProvider.notifier).open(snapshot.projectId);
    c.read(routerProvider).go('/plan/board');
    await tester.pumpAndSettle();
    final columns = find.bySemanticsLabel(RegExp(r'^Chapter: Chapter \d+$'));
    expect(find.bySemanticsLabel('Chapter: Chapter 1'), findsOneWidget);
    expect(find.bySemanticsLabel('Chapter: Chapter 300'), findsNothing);
    expect(columns.evaluate().length, lessThan(40), reason: 'only the columns near the screen are built');
    final row = tester
        .stateList<ScrollableState>(find.byType(Scrollable))
        .where((s) => s.position.axis == Axis.horizontal)
        .reduce((a, b) => a.position.maxScrollExtent >= b.position.maxScrollExtent ? a : b);
    // The row scrolls as far as 300 columns reach, built or not.
    expect(row.position.maxScrollExtent, greaterThan(299 * 292 - 2000));
    row.position.jumpTo(row.position.maxScrollExtent);
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel('Chapter: Chapter 300'), findsOneWidget);
    expect(find.bySemanticsLabel('Chapter: Chapter 1'), findsNothing);
    expect(columns.evaluate().length, lessThan(40));
    row.position.jumpTo(0);
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel('Chapter: Chapter 1'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pump(const Duration(seconds: 2));
  });

  test('a large novel: a backup restores it exactly, and the library file keeps it exactly after a restart', () {
    final dir = Directory.systemTemp.createTempSync('large_novel');
    addTearDown(() => dir.deleteSync(recursive: true));
    final path = '${dir.path}${Platform.pathSeparator}library.sqlite3';
    final original = largeNovel();
    final expected = original.toJson()['collections'];

    final first = AppDatabase.open(path);
    final store = NovelStore(first);
    final backups = BackupService(store, RestorePointStore(first));
    store.putNovel(original);
    final text = backups.exportBackup(original.projectId);
    first.close();

    // After a restart, the novel read back from the file is the novel written.
    final second = AppDatabase.open(path);
    addTearDown(second.close);
    expect(jsonEquals(NovelStore(second).load(original.projectId)!.toJson()['collections'], expected), isTrue);

    // Its backup, read into another library, is the same novel, record for record.
    final other = AppDatabase.inMemory();
    addTearDown(other.close);
    final otherStore = NovelStore(other);
    final otherBackups = BackupService(otherStore, RestorePointStore(other));
    final preview = otherBackups.previewImport(text);
    expect(otherBackups.importBackup(preview), isNull);
    expect(jsonEquals(otherStore.load(original.projectId)!.toJson()['collections'], expected), isTrue);
  });
}
