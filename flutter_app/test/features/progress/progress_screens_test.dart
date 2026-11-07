import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/progress/journal_view.dart';
import 'package:novel_builder/features/progress/progress_providers.dart';
import 'package:novel_builder/features/visualize/visualize_providers.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/novel_store.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/analytics/goal_changes.dart';
import 'package:novel_builder/shared/domain/analytics/progress.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';

import '../../helpers/pump_app.dart';

typedef Novel = ({ProviderContainer c, String novel, String mira, String kai, FakeBackupFiles files});

/// A novel with Mira and Kai, three chapters (the second with a scene), points of view and labels, and a writing log
/// of today and yesterday.
Future<Novel> setUp(WidgetTester tester, {String location = '/progress', Size size = const Size(1400, 2600)}) async {
  final files = FakeBackupFiles();
  final c = await pumpApp(tester, size: size, location: '/library', files: files);
  final novel = c.read(libraryServiceProvider).create({'title': 'Ash Road', 'targetWordCount': '10000'}).id;
  final s = c.read(characterServiceProvider);
  final mira = s.change(novel, (x) => x.create(name: 'Mira')).id;
  final kai = s.change(novel, (x) => x.create(name: 'Kai')).id;
  JsonMap node(String id, String title, int order, int words, {String kind = 'chapter', String? parent}) => {
    'id': id,
    'projectId': novel,
    'parentId': parent,
    'kind': kind,
    'title': title,
    'order': order,
    'status': 'drafting',
    'wordCount': words,
    'createdAt': order,
    'updatedAt': 0,
  };
  JsonMap plan(String id, {List<String> pov = const [], List<String> labels = const []}) => {
    'id': id,
    'projectId': novel,
    'objective': '',
    'beats': <Object?>[],
    'entityIds': <Object?>[],
    'labels': labels,
    'povIds': pov,
    'updatedAt': 0,
  };
  final now = DateTime.now();
  final today = dayOf(now);
  final yesterday = addDays(today, -1);
  JsonMap session(String id, String day, int added) => {
    'id': id,
    'projectId': novel,
    'day': day,
    'startedAt': parseDay(day).add(const Duration(hours: 9)).millisecondsSinceEpoch,
    'lastActiveAt': parseDay(day).add(const Duration(hours: 9, minutes: 40)).millisecondsSinceEpoch,
    'netWords': added,
    'added': added,
    'removed': 0,
    'saves': 2,
  };
  c.read(novelStoreProvider).writeRows(novel, [
    RowWrite.put('chapters', node('c1', 'The Call', 0, 1200)),
    RowWrite.put('chapters', node('c2', 'Crossing', 1, 0)),
    RowWrite.put('chapters', node('s2', 'At the river', 2, 800, kind: 'scene', parent: 'c2')),
    RowWrite.put('chapters', node('c3', 'Ashes', 3, 3000)),
    RowWrite.put('chapterContents', {'id': 'c1', 'projectId': novel, 'doc': textToDoc('Mira woke early.')}),
    RowWrite.put('chapterContents', {'id': 's2', 'projectId': novel, 'doc': textToDoc('Mira and Kai crossed.')}),
    RowWrite.put('chapterPlans', plan('c1', pov: [mira], labels: ['Action'])),
    RowWrite.put('chapterPlans', plan('s2', pov: [kai], labels: ['action', 'Dialogue'])),
    RowWrite.put('chapterPlans', plan('c3', pov: [mira])),
    RowWrite.put('writingSessions', session('w1', yesterday, 900)),
    RowWrite.put('writingSessions', session('w2', today, 350)),
  ]);
  c.read(openNovelProvider.notifier).open(novel);
  await tester.pumpAndSettle();
  c.read(routerProvider).go(location);
  await tester.pumpAndSettle();
  return (c: c, novel: novel, mira: mira, kai: kai, files: files);
}

List<JsonMap> rows(Novel n, String collection) => n.c.read(novelStoreProvider).rowsIn(n.novel, collection);

Future<void> tapText(WidgetTester tester, String text) async {
  final f = find.text(text).last;
  await tester.ensureVisible(f);
  await tester.pumpAndSettle();
  await tester.tap(f);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('progress: the writing log is described, and a daily target is set and removed', (tester) async {
    final n = await setUp(tester);
    expect(find.textContaining('5,000 / 10,000 words • 50% complete'), findsOneWidget);
    expect(find.text('+350'), findsWidgets, reason: 'the tile, and the session in the table');
    // Today's session alone; on a Monday yesterday's falls in last week, so "This week" says the same, and on the
    // first of a month it falls in last month, so "This month" does too.
    final today = dayOf(DateTime.now());
    final monday = weekStart(addDays(today, -1)) != weekStart(today);
    final firstOfMonth = DateTime.now().day == 1;
    expect(find.text('words in 1 session'), findsNWidgets(1 + (monday ? 1 : 0) + (firstOfMonth ? 1 : 0)));
    // The journal: the run, the year, the milestones.
    expect(find.bySemanticsLabel('2 days in a row. Best: 2 days.'), findsOneWidget);
    expect(find.bySemanticsLabel('A year of writing: 2 days written'), findsOneWidget);
    expect(find.bySemanticsLabel('1,000 words, reached'), findsOneWidget);
    expect(find.bySemanticsLabel('Your target: 10,000, not yet: 5,000 words to go'), findsOneWidget);
    expect(find.textContaining('+350 words in 1 session'), findsOneWidget, reason: 'today, under the year');
    expect(find.text('Finished around'), findsOneWidget, reason: '1,250 words in 30 days, 5,000 to go');
    // Tapping yesterday's square says what was written that day.
    final grid = find.descendant(of: find.byType(YearOfWriting), matching: find.byType(CustomPaint)).first;
    final step = (tester.getSize(grid).width - 30) / 53;
    final yesterday = addDays(today, -1);
    final col = 52 - daysBetween(weekStart(yesterday), weekStart(today)) ~/ 7;
    final row = parseDay(yesterday).weekday - 1;
    await tester.tapAt(tester.getTopLeft(grid) + Offset(30 + col * step + step / 2 - 1.5, 18 + row * step + step / 2));
    await tester.pumpAndSettle();
    expect(find.textContaining('+900 words in 1 session'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Words per day'), '500');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pumpAndSettle();
    expect([for (final g in rows(n, 'goals')) (g['kind'], g['targetWords'])], [('daily', 500)]);
    expect(find.text('70% of 500'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Words per day'), '');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pumpAndSettle();
    expect(rows(n, 'goals'), isEmpty, reason: 'a blank target removes it');
    expect(rows(n, 'writingSessions'), hasLength(2), reason: 'the writing log is never changed here');
  });

  testWidgets('tasks and deadlines: added, checked off and deleted only when confirmed', (tester) async {
    final n = await setUp(tester);
    await tapText(tester, 'Add task');
    await tester.enterText(find.widgetWithText(TextField, 'Task name'), 'Map the river');
    await tapText(tester, 'Planning');
    await tapText(tester, 'Worldbuilding');
    await tester.tap(find.widgetWithText(FilledButton, 'Add task'));
    await tester.pumpAndSettle();
    final task = rows(n, 'goals').single;
    expect(
      [task['kind'], task['title'], task['category'], task['dueDate']],
      ['task', 'Map the river', 'worldbuilding', null],
    );
    expect(find.text('0 of 1 done'), findsOneWidget);
    await tester.tap(find.byType(Checkbox));
    await tester.pumpAndSettle();
    expect(rows(n, 'goals').single['done'], isTrue);
    expect(rows(n, 'goals').single['doneAt'], isA<num>());

    await tapText(tester, 'Add deadline');
    await tester.enterText(find.widgetWithText(TextField, 'Deadline name'), 'Draft');
    await tester.tap(find.widgetWithText(FilledButton, 'Add deadline'));
    await tester.pumpAndSettle();
    expect(find.text('Pick a date for the deadline.'), findsOneWidget);
    expect(rows(n, 'goals'), hasLength(1), reason: 'nothing is added without a date');
    await tapText(tester, 'Cancel');

    final due = addDays(dayOf(DateTime.now()), 10);
    n.c
        .read(goalServiceProvider)
        .change(
          n.novel,
          (c) =>
              c.addGoal('deadline', GoalInput(title: 'Crossing done', dueDate: due, targetWords: 1800, nodeId: 'c2')),
        );
    await tester.pumpAndSettle();
    expect(find.text('${mediumDay(due)} · Crossing'), findsOneWidget);
    expect(find.text('800 / 1,800 words · 10 days to go · about 100 a day gets there'), findsOneWidget);
    await tester.tap(find.byTooltip('Delete Crossing done'));
    await tester.pumpAndSettle();
    await tapText(tester, 'Cancel');
    expect(rows(n, 'goals'), hasLength(2), reason: 'cancelled: nothing removed');
    await tester.tap(find.byTooltip('Delete Crossing done'));
    await tester.pumpAndSettle();
    await tapText(tester, 'Delete');
    expect([for (final g in rows(n, 'goals')) g['kind']], ['task']);
  });

  testWidgets('analytics: counts stated as they are, and a character opens from its row', (tester) async {
    final n = await setUp(tester, location: '/progress/analytics');
    expect(find.text('Observations'), findsOneWidget);
    expect(find.textContaining('The longest chapter with text (“Ashes”, 3,000 words) is 3.8 times'), findsOneWidget);
    expect(find.text('Words per chapter, in reading order'), findsWidgets);
    expect(
      find.bySemanticsLabel(RegExp(r'^Mira: appears in 2 chapters, first: Ch\. 1, latest: Ch\. 2')),
      findsOneWidget,
    );
    await tapText(tester, 'Mira');
    expect(currentLocation(n.c), contains(n.mira));
  });

  testWidgets('charts: filters narrow every chart, and the data is a table and a file', (tester) async {
    final n = await setUp(tester, location: '/visualize/charts');
    expect(find.text('3 chapters, 5,000 words in all; the most words: Ch 3: Ashes (3,000).'), findsOneWidget);
    expect(
      find.text('2 points of view across 3 chapters and scenes; the most: Mira, 2 chapters and scenes.'),
      findsOneWidget,
    );
    expect(
      find.text('2 labels on 2 chapters and scenes; the most used: Action, on 2 chapters and scenes.'),
      findsOneWidget,
    );

    await tapText(tester, 'Anyone’s, or none recorded');
    await tapText(tester, 'Kai');
    expect(find.text('1 chapter, 800 words in all; the most words: Ch 2: Crossing (800).'), findsOneWidget);
    expect(find.text('Clear filters'), findsOneWidget);

    await tester.tap(find.bySemanticsLabel(RegExp('^Kai: 1 chapter or scene')));
    await tester.pumpAndSettle();
    expect(n.c.read(vizStateProvider).selection?.id, n.kai);

    await tapText(tester, 'Clear filters');
    await tapText(tester, 'List');
    expect(find.text('Chapter'), findsOneWidget, reason: 'the words chart as a table');
    expect(find.text('Show as table'), findsNothing);

    await tester.tap(find.bySemanticsLabel('Download the data of “Words per chapter” as a CSV file'));
    await tester.pumpAndSettle();
    final file = n.files.saved.single;
    expect(file.name, 'ash-road-words.csv');
    expect(file.text, '﻿Chapter,Words\r\nCh 1: The Call,1200\r\nCh 2: Crossing,800\r\nCh 3: Ashes,3000');
  });

  testWidgets('every new page works on a phone at 200% text size', (tester) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final n = await setUp(tester, size: phone);
    for (final location in ['/progress', '/progress/analytics', '/visualize/charts']) {
      n.c.read(routerProvider).go(location);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull, reason: location);
    }
  });
}
