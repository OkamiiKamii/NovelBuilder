import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/review/review_providers.dart';
import 'package:novel_builder/features/visualize/visualize_providers.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/novel_store.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/records/canon.dart';

import '../../helpers/pump_app.dart';

typedef Novel = ({ProviderContainer c, String novel, String mira, String orrin});

/// A novel with Mira and Orrin, and two chapters: Mira acts in the second.
Future<Novel> setUp(WidgetTester tester, {String location = '/review', Size size = const Size(1400, 2600)}) async {
  final c = await pumpApp(tester, size: size, location: '/library');
  final novel = c.read(libraryServiceProvider).create({'title': 'Canon'}).id;
  final s = c.read(characterServiceProvider);
  final mira = s.change(novel, (x) => x.create(name: 'Mira')).id;
  final orrin = s.change(novel, (x) => x.create(name: 'Orrin')).id;
  JsonMap chapter(String id, String title, int order) => {
    'id': id,
    'projectId': novel,
    'parentId': null,
    'kind': 'chapter',
    'title': title,
    'order': order,
    'createdAt': order,
    'updatedAt': 0,
  };
  c.read(novelStoreProvider).writeRows(novel, [
    RowWrite.put('chapters', chapter('c1', 'Chapter 1', 0)),
    RowWrite.put('chapters', chapter('c2', 'Chapter 2', 1)),
    RowWrite.put('chapterContents', {'id': 'c1', 'projectId': novel, 'doc': textToDoc('The war began.')}),
    RowWrite.put('chapterContents', {'id': 'c2', 'projectId': novel, 'doc': textToDoc('Mira smiled at the guard.')}),
  ]);
  c.read(openNovelProvider.notifier).open(novel);
  await tester.pumpAndSettle();
  c.read(routerProvider).go(location);
  await tester.pumpAndSettle();
  return (c: c, novel: novel, mira: mira, orrin: orrin);
}

List<JsonMap> rows(Novel n, String collection) => n.c.read(novelStoreProvider).rowsIn(n.novel, collection);

Future<void> tapText(WidgetTester tester, String text) async {
  final f = find.text(text).last;
  await tester.ensureVisible(f);
  await tester.pumpAndSettle();
  await tester.tap(f);
  await tester.pumpAndSettle();
}

Future<void> choose<T>(WidgetTester tester, String label, String option) async {
  final field = find.widgetWithText(DropdownButtonFormField<T>, label).last;
  await tester.ensureVisible(field);
  await tester.pumpAndSettle();
  await tester.tap(field);
  await tester.pumpAndSettle();
  await tester.tap(find.text(option).last);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('the review gathers every check; a decision is kept with its note, and nothing else changes', (
    tester,
  ) async {
    final n = await setUp(tester);
    n.c.read(canonServiceProvider).canon(n.novel, (x) => x.create(subject: 'Weather', status: CanonStatus.conflicting));
    await tester.pumpAndSettle();
    expect(find.text('Continuity review'), findsWidgets);
    expect(find.textContaining('Conflicting, with nothing paired'), findsOneWidget);
    // One at a time: the note, then the decision, in one press.
    expect(find.text('1 of 1'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Note (optional)'), 'Weather is moody');
    await tapText(tester, 'Intentional');
    final decision = rows(n, 'continuityResolutions').single;
    expect([decision['kind'], decision['note']], ['intentional', 'Weather is moody']);
    expect(find.textContaining('Nothing to look at'), findsWidgets);
    expect(rows(n, 'canonFacts').single['status'], 'conflicting', reason: 'the statement itself is untouched');
    await tapText(tester, 'Decided (1)');
    expect(find.textContaining('Your note: Weather is moody'), findsOneWidget);
  });

  testWidgets('one at a time: a decision brings the next forward, Needs review keeps it, and the whole list is there', (
    tester,
  ) async {
    final n = await setUp(tester);
    final canon = n.c.read(canonServiceProvider);
    for (final subject in ['Weather', 'Tides', 'Moons']) {
      canon.canon(n.novel, (x) => x.create(subject: subject, status: CanonStatus.conflicting));
    }
    await tester.pumpAndSettle();
    final total = n.c.read(reviewDataProvider)!.status.items.length;
    expect(find.text('1 of $total'), findsOneWidget);
    expect(find.text('Set the status…'), findsNothing, reason: 'the list is behind its own toggle');

    // Skip and back move through the queue without deciding anything.
    await tester.tap(find.byTooltip('Skip to the next warning'));
    await tester.pumpAndSettle();
    expect(find.text('2 of $total'), findsOneWidget);
    await tester.tap(find.byTooltip('Previous warning'));
    await tester.pumpAndSettle();

    await tapText(tester, 'Resolved');
    expect(rows(n, 'continuityResolutions').single['kind'], 'resolved');
    expect(find.text('1 of ${total - 1}'), findsOneWidget, reason: 'the next one moved up');

    await tapText(tester, 'Needs review');
    expect(find.text('2 of ${total - 1}'), findsOneWidget, reason: 'flagged, it stays in the queue; the next is shown');

    await tapText(tester, 'The whole list');
    expect(find.text('Set the status…'), findsWidgets);
    expect(find.textContaining('1 need review'), findsOneWidget);
  });

  testWidgets('a statement is set to Canon, then revised: the earlier wording is kept as a retcon', (tester) async {
    final n = await setUp(tester, location: '/review/canon');
    await tapText(tester, 'New statement');
    await tester.enterText(find.widgetWithText(TextField, 'Statement'), 'Founded 1,000 years ago');
    await tester.pump(const Duration(seconds: 2));
    await tester.pumpAndSettle();
    await tapText(tester, 'Canon');
    expect(rows(n, 'canonFacts').single['status'], 'canon');
    expect(find.text('Revise the statement…'), findsOneWidget, reason: 'established wording is revised, not edited');
    await tapText(tester, 'Revise the statement…');
    await tester.enterText(find.widgetWithText(TextField, 'New statement'), 'Founded 500 years ago');
    await tester.enterText(find.widgetWithText(TextField, 'Reason for the change'), 'Book two');
    await tapText(tester, 'Retcon it');
    final fact = rows(n, 'canonFacts').single;
    expect(fact['statement'], 'Founded 500 years ago');
    expect([for (final h in maps(fact['history'])) h['kind']], ['created', 'status', 'retcon']);
    expect(find.textContaining('Retconned: “Founded 1,000 years ago” became “Founded 500 years ago”'), findsOneWidget);
  });

  testWidgets('the manuscript is checked against a tracked death; "Update canon" changes only the rule', (
    tester,
  ) async {
    final n = await setUp(tester, location: '/review/continuity');
    expect(find.text('Tell the checker what must stay true'), findsOneWidget);
    await tapText(tester, 'Choose what to track');
    await tapText(tester, 'Character status');
    await choose<String>(tester, 'Character', 'Mira');
    await choose<String>(tester, 'From', 'Ch 1: Chapter 1');
    await tapText(tester, 'Save');
    expect(rows(n, 'continuityRules').single['state'], 'deceased');
    await tapText(tester, 'Issues (1)');
    expect(
      find.text('Mira is recorded as deceased from Chapter 1, and appears to speak or act in Chapter 2.'),
      findsOneWidget,
    );
    await tapText(tester, 'Update canon…');
    expect(find.textContaining('Record that Mira is no longer deceased from “Chapter 2” onwards.'), findsOneWidget);
    await tapText(tester, 'Update canon');
    expect(rows(n, 'continuityRules').single['untilNodeId'], 'c2');
    expect(find.text('No open issues'), findsOneWidget);
    final text = n.c.read(novelStoreProvider).row(n.novel, 'chapterContents', 'c2')!['doc'];
    expect(blockTexts(text), ['Mira smiled at the guard.'], reason: 'the manuscript is never written to');
  });

  testWidgets('a finding of the manuscript is marked intentional, then reopened', (tester) async {
    final n = await setUp(tester, location: '/review/continuity');
    n.c
        .read(canonServiceProvider)
        .rules(n.novel, (x) => x.createRule('status', {'entryId': n.mira, 'fromNodeId': 'c1'}));
    await tester.pumpAndSettle();
    await tapText(tester, 'Mark as intentional…');
    await tapText(tester, 'Flashback sequence');
    await tapText(tester, 'Save as intentional');
    expect(rows(n, 'continuityResolutions').single['note'], 'Flashback sequence');
    expect(rows(n, 'continuityResolutions').single['nodeId'], 'c2');
    await tapText(tester, 'Reviewed (1)');
    await tapText(tester, 'Reopen');
    expect(rows(n, 'continuityResolutions'), isEmpty);
  });

  testWidgets('knowledge: acting on a secret while recorded as unaware is said, and dismissed', (tester) async {
    final n = await setUp(tester, location: '/library');
    n.c.read(novelStoreProvider).writeRows(n.novel, [
      RowWrite.put('characterSecrets', {
        'id': 's1',
        'projectId': n.novel,
        'entryId': n.mira,
        'title': 'The heir',
        'description': 'Mira is the heir',
        'status': 'Hidden',
        'self': 'knows',
        'knows': <String>[],
        'suspects': <String>[],
        'unaware': <String>[],
        'reader': 'unaware',
        'records': [
          {
            'id': 'k1',
            'characterId': n.orrin,
            'state': 'unaware',
            'belief': '',
            'nodeId': 'c1',
            'eventId': null,
            'how': '',
            'fromId': null,
          },
        ],
        'needs': [
          {'id': 'n1', 'characterId': n.orrin, 'nodeId': 'c2', 'eventId': null, 'note': 'uses it'},
        ],
        'createdAt': 0,
        'updatedAt': 0,
      }),
    ]);
    n.c.read(routerProvider).go('/visualize/knowledge');
    await tester.pumpAndSettle();
    expect(find.text('Who knows what now'), findsOneWidget);
    expect(
      find.textContaining('Orrin acts on “The heir” in Ch 2: Chapter 2, but is recorded as unaware of it there.'),
      findsOneWidget,
    );
    expect(find.bySemanticsLabel(RegExp('Orrin at Ch 1: Chapter 1: Unaware')), findsOneWidget);
    await tapText(tester, 'Dismiss');
    expect(rows(n, 'continuityResolutions').single['kind'], 'dismissed');
    expect(find.text('Reopen'), findsOneWidget);
  });

  testWidgets('canon marks: a retconned event is marked on the timeline, and its findings shown when selected', (
    tester,
  ) async {
    final n = await setUp(tester, location: '/library');
    n.c.read(novelStoreProvider).writeRows(n.novel, [
      RowWrite.put('timelineEvents', {
        'id': 'e1',
        'projectId': n.novel,
        'name': 'The false dawn',
        'description': '',
        'when': {'precision': 'exact', 'year': 10, 'month': null, 'day': null, 'hour': null, 'minute': null},
        'duration': null,
        'importance': 'minor',
        'locationId': null,
        'characters': <Object?>[],
        'entryIds': <Object?>[],
        'nodeIds': ['c1'],
        'afterId': null,
        'canon': 'retconned',
        'createdAt': 0,
      }),
    ]);
    n.c.read(routerProvider).go('/visualize/timeline');
    await tester.pumpAndSettle();
    await tapText(tester, 'Canon & continuity marks');
    expect(find.text('1 record marked here.'), findsOneWidget);
    await tapText(tester, 'Marked records, in words');
    expect(find.text('Canon status: Retconned. 1 to check.'), findsOneWidget);
    await tapText(tester, 'Canon status: Retconned. 1 to check.');
    expect(n.c.read(vizStateProvider).selection?.id, 'e1');
    expect(find.textContaining('Set aside, but still told.'), findsOneWidget);
  });

  testWidgets('every new page works on a phone at 200% text size', (tester) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final n = await setUp(tester, size: phone);
    final s = n.c.read(canonServiceProvider);
    s.canon(n.novel, (x) => x.create(subject: 'Weather', status: CanonStatus.conflicting));
    s.rules(n.novel, (x) => x.createRule('status', {'entryId': n.mira, 'fromNodeId': 'c1'}));
    n.c.read(canonMarksProvider.notifier).set(true);
    for (final location in [
      '/review',
      '/review/canon',
      '/review/continuity',
      '/review/continuity?tab=tracked',
      '/review/records',
      '/visualize/knowledge',
      '/visualize/graph',
    ]) {
      n.c.read(routerProvider).go(location);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull, reason: location);
    }
  });
}
