import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/destinations.dart';
import 'package:novel_builder/app/shell/loose_ends.dart';
import 'package:novel_builder/features/plot/plot_providers.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/novel_store.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';

import '../helpers/pump_app.dart';

final _now = DateTime(2026, 11, 9, 15);

String _day(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// A novel of six chapters, the first five written; a thread that last moved in chapter 1.
Future<({ProviderContainer c, String novel, String thread, List<String> chapters})> _novel(WidgetTester tester) async {
  final c = await pumpApp(tester, size: phone, location: '/write');
  final novel = c.read(libraryServiceProvider).create({'title': 'Ash Road'}).id;
  final m = c.read(manuscriptServiceProvider);
  final store = c.read(novelStoreProvider);
  final chapters = <String>[];
  for (var i = 1; i <= 6; i++) {
    final n = m.create(novel, NodeKind.chapter, title: i == 6 ? 'The River' : 'Part $i');
    if (i < 6) {
      store.writeRows(novel, [
        RowWrite.put('chapters', {...store.row(novel, 'chapters', n.id)!, 'wordCount': 1000}),
      ]);
    }
    chapters.add(n.id);
  }
  late String thread;
  c.read(plotServiceProvider).change(novel, (x) {
    thread = x.createThread('The stolen crown');
    x.updateThread(thread, (_) => {'status': 'active'});
    x.addBeat(thread, title: 'Taken', nodeId: chapters.first);
    // Every chapter but the last planned.
    for (final id in chapters.take(5)) {
      x.updatePlan(id, (stored) => {...stored, 'objective': 'Something happens'});
    }
    return null;
  });
  return (c: c, novel: novel, thread: thread, chapters: chapters);
}

void _sessions(ProviderContainer c, String novel, Map<DateTime, int> words) =>
    c.read(novelStoreProvider).writeRows(novel, [
      for (final e in words.entries)
        RowWrite.put('writingSessions', {
          'id': 'w-${_day(e.key)}',
          'projectId': novel,
          'day': _day(e.key),
          'startedAt': e.key.millisecondsSinceEpoch,
          'lastActiveAt': e.key.millisecondsSinceEpoch,
          'netWords': e.value,
          'added': e.value,
          'removed': 0,
          'saves': 1,
        }),
    ]);

void main() {
  testWidgets('the most pressing first: today’s goal, the quietest thread, the next chapter with no plan', (
    tester,
  ) async {
    final n = await _novel(tester);
    n.c.read(manuscriptServiceProvider).setWordGoal(n.novel, 'daily', 500);
    _sessions(n.c, n.novel, {_now: 200});

    final ends = looseEnds(n.c.read(novelStoreProvider), n.novel, now: _now);
    expect(
      [for (final e in ends) e.text],
      [
        '300 words to today’s goal of 500',
        '“The stolen crown” has been quiet since chapter 1',
        'Chapter 6, “The River”, has no plan yet',
      ],
    );
    expect([for (final e in ends) e.area], [Destination.write, Destination.plan, Destination.plan]);
    expect([for (final e in ends) e.path], ['/write', threadPath(n.thread), chapterPlanPath(n.chapters.last)]);
  });

  testWidgets('a streak today has not kept yet; and nothing at all once everything is tied up', (tester) async {
    final n = await _novel(tester);
    _sessions(n.c, n.novel, {
      _now.subtract(const Duration(days: 1)): 300,
      _now.subtract(const Duration(days: 2)): 250,
      _now.subtract(const Duration(days: 3)): 400,
    });
    final store = n.c.read(novelStoreProvider);
    expect(looseEnds(store, n.novel, now: _now).first.text, 'Write today to keep a 3-day streak');

    // Written today, the thread moved in chapter 4 (only one behind), the last chapter planned: nothing waits.
    _sessions(n.c, n.novel, {_now: 50});
    n.c.read(plotServiceProvider).change(n.novel, (x) {
      x.addBeat(n.thread, title: 'Found', nodeId: n.chapters[3]);
      x.updatePlan(n.chapters.last, (stored) => {...stored, 'objective': 'Cross'});
      return null;
    });
    expect(looseEnds(store, n.novel, now: _now), isEmpty);
  });

  testWidgets('the sample novel: everything planned and resolved, but one hauler tied to nobody', (tester) async {
    final c = await pumpApp(tester, size: phone);
    final novel = addSampleNovel(c.read(novelStoreProvider), now: _now.millisecondsSinceEpoch);
    expect(
      [for (final e in looseEnds(c.read(novelStoreProvider), novel.id, now: _now)) e.text],
      ['Jory has no ties to anyone yet'],
    );
  });

  testWidgets('More shows the loose ends under Search, before the areas; each opens its page', (tester) async {
    final n = await _novel(tester);
    n.c.read(openNovelProvider.notifier).open(n.novel);
    await tester.pumpAndSettle();

    await tester.tap(find.text('More'));
    await tester.pumpAndSettle();
    final sheet = find.byType(BottomSheet);
    Finder inSheet(Finder f) => find.descendant(of: sheet, matching: f);
    expect(inSheet(find.text('Loose ends')), findsOneWidget);
    expect(inSheet(find.textContaining('has been quiet since chapter 1')), findsOneWidget);
    expect(inSheet(find.textContaining('has no plan yet')), findsOneWidget);
    double top(String text) => tester.getTopLeft(inSheet(find.text(text))).dy;
    expect(top('Search the novel'), lessThan(top('Loose ends')), reason: 'Search is still reached first');
    expect(top('Loose ends'), lessThan(top('Plan')));
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(textContrastGuideline));

    await tester.tap(inSheet(find.textContaining('has been quiet since chapter 1')));
    await tester.pumpAndSettle();
    expect(currentLocation(n.c), threadPath(n.thread));
    expect(find.byType(BottomSheet), findsNothing);
  });
}
