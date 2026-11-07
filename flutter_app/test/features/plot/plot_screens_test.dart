import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/plot/plot_providers.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/plot/lanes.dart';
import 'package:novel_builder/shared/domain/plot/plot_changes.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:novel_builder/shared/domain/records/thread.dart';

import '../../helpers/pump_app.dart';

const tall = Size(1400, 4000);

typedef Novel = ({ProviderContainer c, String novel, String mira, String one, String two, String a, String b});

/// A novel with Mira, two chapters, and two scenes in the first.
Future<Novel> setUpNovel(WidgetTester tester, {String location = '/plan/threads', Size size = tall}) async {
  final c = await pumpApp(tester, size: size, location: location);
  final novel = c.read(libraryServiceProvider).create({'title': 'Ashfall'}).id;
  final mira = c.read(characterServiceProvider).change(novel, (x) => x.create(name: 'Mira')).id;
  final ms = c.read(manuscriptServiceProvider);
  final one = ms.create(novel, NodeKind.chapter, title: 'The Gate').id;
  final two = ms.create(novel, NodeKind.chapter, title: 'The River').id;
  final a = ms.create(novel, NodeKind.scene, parentId: one, title: 'Arrival').id;
  final b = ms.create(novel, NodeKind.scene, parentId: one, title: 'Bargain').id;
  c.read(openNovelProvider.notifier).open(novel);
  await tester.pumpAndSettle();
  return (c: c, novel: novel, mira: mira, one: one, two: two, a: a, b: b);
}

List<PlotThread> threadsOf(Novel w) => [
  for (final r in w.c.read(novelStoreProvider).rowsIn(w.novel, 'plotThreads')) PlotThread(r),
];

List<StoryNode> nodesOf(Novel w) => w.c.read(manuscriptServiceProvider).nodes(w.novel);

JsonMap? planOf(Novel w, String nodeId) =>
    w.c.read(novelStoreProvider).rowsIn(w.novel, 'chapterPlans').where((r) => r['id'] == nodeId).firstOrNull;

T plotIn<T>(Novel w, T Function(PlotChanges x) f) => w.c.read(plotServiceProvider).change(w.novel, f);

/// The scenes of a chapter, in order.
List<String> scenesOf(Novel w, String chapterId) => [
  for (final n in [...nodesOf(w).where((n) => n.parentId == chapterId)]..sort((a, b) => a.order.compareTo(b.order)))
    n.title,
];

Future<void> go(WidgetTester tester, ProviderContainer c, String location) async {
  c.read(routerProvider).go(location);
  await tester.pumpAndSettle();
}

Future<void> tapText(WidgetTester tester, String text) async {
  final f = find.text(text).last;
  await tester.ensureVisible(f);
  await tester.pumpAndSettle();
  await tester.tap(f);
  await tester.pumpAndSettle();
}

Future<void> typeInto(WidgetTester tester, String label, String text) async {
  final field = find.widgetWithText(TextField, label).first;
  await tester.ensureVisible(field);
  await tester.pumpAndSettle();
  await tester.enterText(field, text);
  await tester.pump(const Duration(seconds: 1));
  await tester.pumpAndSettle();
}

Future<void> choose(WidgetTester tester, String label, String option) async {
  final field = find.widgetWithText(DropdownButtonFormField<String>, label).first;
  await tester.ensureVisible(field);
  await tester.pumpAndSettle();
  await tester.tap(field);
  await tester.pumpAndSettle();
  await tester.tap(find.textContaining(option).last);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('a new thread is named, given developments in chapters, and deleted with Undo', (tester) async {
    final w = await setUpNovel(tester);
    expect(find.text('Plot threads'), findsWidgets);
    await tapText(tester, 'New thread');
    final id = threadsOf(w).single.id;
    expect(currentLocation(w.c), '/plan/thread/$id');

    await typeInto(tester, 'Thread title', 'The stolen key');
    expect(threadsOf(w).single.title, 'The stolen key');
    await typeInto(tester, 'Objective or premise', 'Who took the key?');
    expect(threadsOf(w).single.premise, 'Who took the key?');

    await choose(tester, 'Chapter or scene', 'The Gate');
    await choose(tester, 'Role', 'Introduction');
    await typeInto(tester, 'New development', 'The key is missing');
    await tapText(tester, 'Add development');
    final beat = threadsOf(w).single.beats.single;
    expect((beat.title, beat.nodeId, roleKey(beat)), ('The key is missing', w.one, 'introduction'));
    expect(find.text('Open Ch 1: The Gate'), findsOneWidget);

    // Someone appearing needs no words of the author's.
    await choose(tester, 'Chapter or scene', 'Bargain');
    await choose(tester, 'Role', 'Appears');
    await tapText(tester, 'Add development');
    expect(threadsOf(w).single.beats.map<String>(roleKey), ['introduction', 'appears']);

    await tester.tap(find.byTooltip('Remove development 2'));
    await tester.pumpAndSettle();
    expect(threadsOf(w).single.beats, hasLength(1));

    await tapText(tester, 'Delete thread…');
    expect(find.textContaining('Chapters, scenes and entries are not changed'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Delete'));
    await tester.pumpAndSettle();
    expect(threadsOf(w), isEmpty);
    expect(currentLocation(w.c), '/plan/threads');
    await tester.tap(find.text('Undo'));
    await tester.pumpAndSettle();
    expect(threadsOf(w).single.beats.single.title, 'The key is missing');
    expect(nodesOf(w), hasLength(4), reason: 'the manuscript is never touched');
  });

  testWidgets('each thread is a strand on the loom, knotted where it develops and said in words', (tester) async {
    final w = await setUpNovel(tester);
    plotIn(w, (x) {
      final crown = x.createThread('The stolen crown');
      x.updateThread(crown, (_) => {'status': 'resolved'});
      x.addBeat(crown, title: 'Missing', nodeId: w.one, role: 'introduction');
      x.addBeat(crown, title: 'Unmasked', nodeId: w.b, role: 'resolution');
      x.addBeat(crown, title: 'After', nodeId: w.two);
      final comet = x.createThread('The red comet');
      x.addBeat(comet, title: 'Not placed yet');
      return crown;
    });
    await tester.pumpAndSettle();
    expect(find.text('Long gap'), findsOneWidget, reason: 'the legend says what the marks mean');
    expect(
      find.bySemanticsLabel(RegExp('Developments in chapters 1, 2 of 2; tied off at chapter 2')),
      findsOneWidget,
      reason: 'a scene’s development sits on its chapter',
    );
    expect(find.text('Chapters 1–2 · tied off'), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp('No developments placed in chapters')), findsOneWidget);
    expect(find.text('Not placed in any chapter yet'), findsOneWidget);
    await tester.tap(find.text('The red comet'));
    await tester.pumpAndSettle();
    expect(currentLocation(w.c), startsWith('/plan/thread/'));
  });

  testWidgets('the scene board moves scenes and sets statuses, and undoes each, newest first', (tester) async {
    final w = await setUpNovel(tester, location: '/plan/board');
    expect(find.text('Scene board'), findsWidgets);
    expect(find.text('2 chapters · 2 scenes · 0 words'), findsOneWidget);
    expect(scenesOf(w, w.one), ['Arrival', 'Bargain']);

    await tester.tap(find.byTooltip('Move Arrival later'));
    await tester.pumpAndSettle();
    expect(scenesOf(w, w.one), ['Bargain', 'Arrival']);
    expect(find.text('Undo move of “Arrival”'), findsOneWidget);

    // Into the other chapter, by its menu.
    await tester.tap(find.byTooltip('Move Bargain to chapter'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('The River').last);
    await tester.pumpAndSettle();
    expect(scenesOf(w, w.two), ['Bargain']);

    final status = find.byWidgetPredicate((x) => x is DropdownButton<NodeStatus>).first;
    await tester.tap(status);
    await tester.pumpAndSettle();
    await tester.tap(find.text(NodeStatus.values.last.label).last);
    await tester.pumpAndSettle();
    final changed = nodesOf(w).where((n) => n.status == NodeStatus.values.last).single;

    await tapText(tester, 'Undo status of “${changed.title}”');
    expect(nodesOf(w).where((n) => n.status == NodeStatus.values.last), isEmpty);
    await tapText(tester, 'Undo move of “Bargain”');
    expect(scenesOf(w, w.one), ['Bargain', 'Arrival']);
    await tapText(tester, 'Undo move of “Arrival”');
    expect(scenesOf(w, w.one), ['Arrival', 'Bargain']);

    // Filtered, moving is off.
    await tester.enterText(find.widgetWithText(TextField, 'Search cards'), 'Arr');
    await tester.pumpAndSettle();
    expect(find.textContaining('Moving is off while the board is filtered'), findsOneWidget);
    expect(find.byTooltip('Move Arrival later'), findsNothing);
    expect(find.text('Bargain'), findsNothing);
  });

  testWidgets('a card is added to a thread as an appearance only, and taken out again', (tester) async {
    final w = await setUpNovel(tester, location: '/plan/board');
    plotIn(w, (x) => x.createThread('The stolen key'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Add Arrival to a plot thread'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('The stolen key').last);
    await tester.pumpAndSettle();
    final beat = threadsOf(w).single.beats.single;
    expect((beat.nodeId, roleKey(beat), beat.title), (w.a, 'appears', ''));
    expect(find.text('The stolen key · appears'), findsOneWidget);

    await tester.tap(find.byTooltip('Take Arrival out of The stolen key'));
    await tester.pumpAndSettle();
    expect(threadsOf(w).single.beats, isEmpty);

    // Showing one thread narrows the board to where it is recorded.
    plotIn(w, (x) => x.addBeat(threadsOf(w).single.id, title: 'Clue', nodeId: w.two, role: 'development'));
    await go(tester, w.c, '/plan/board?thread=${threadsOf(w).single.id}');
    expect(find.textContaining('Showing where “The stolen key” is recorded: 1 chapter or scene'), findsOneWidget);
    expect(find.text('Arrival'), findsNothing);
    expect(find.text('The River'), findsWidgets);
  });

  testWidgets('moving a chapter with its scenes into a volume asks first', (tester) async {
    final w = await setUpNovel(tester, location: '/plan/board');
    w.c.read(manuscriptServiceProvider).create(w.novel, NodeKind.volume, title: 'Book One');
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Move The Gate into'));
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining('Book One').last);
    await tester.pumpAndSettle();
    expect(find.text('Move a chapter with its scenes'), findsOneWidget);
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(nodesOf(w).firstWhere((n) => n.id == w.one).parentId, isNull);

    await tester.tap(find.byTooltip('Move The Gate into'));
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining('Book One').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Move them'));
    await tester.pumpAndSettle();
    final volume = nodesOf(w).firstWhere((n) => n.title == 'Book One').id;
    expect(nodesOf(w).firstWhere((n) => n.id == w.one).parentId, volume);
    expect(scenesOf(w, w.one), ['Arrival', 'Bargain']);
  });

  testWidgets('the plan page keeps its own fields, beats and who appears, and never the text', (tester) async {
    final w = await setUpNovel(tester, location: '/plan/board');
    await tester.tap(find.byTooltip('Plan for The Gate'));
    await tester.pumpAndSettle();
    expect(currentLocation(w.c), '/plan/chapter/${w.one}');
    expect(find.text('Plan: The Gate'), findsOneWidget);

    await typeInto(tester, 'Objective', 'Get them inside');
    expect(planOf(w, w.one)?['objective'], 'Get them inside');
    await typeInto(tester, 'Summary', 'They reach the gate.');
    expect(nodesOf(w).firstWhere((n) => n.id == w.one).summary, 'They reach the gate.');

    await typeInto(tester, 'New beat', 'The guard refuses');
    await tapText(tester, 'Add beat');
    await typeInto(tester, 'New beat', 'Mira bribes him');
    await tapText(tester, 'Add beat');
    expect([for (final b in maps(planOf(w, w.one)?['beats'])) b['text']], ['The guard refuses', 'Mira bribes him']);
    await tester.tap(find.byTooltip('Move beat 2 up'));
    await tester.pumpAndSettle();
    expect([for (final b in maps(planOf(w, w.one)?['beats'])) b['text']], ['Mira bribes him', 'The guard refuses']);

    await tester.tap(find.byTooltip('Add to Appears'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Mira').last);
    await tester.pumpAndSettle();
    expect(planOf(w, w.one)?['appearIds'], [w.mira]);
    // Recording her as mentioned moves her from the other list.
    await tester.tap(find.byTooltip('Add to Mentioned, not on the page'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Mira (moves from the other list)').last);
    await tester.pumpAndSettle();
    expect(planOf(w, w.one)?['appearIds'], isEmpty);
    expect(planOf(w, w.one)?['mentionIds'], [w.mira]);

    await tester.tap(find.byTooltip('Add a label to this chapter'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Action').last);
    await tester.pumpAndSettle();
    expect(planOf(w, w.one)?['labels'], ['Action']);
  });

  testWidgets('the plot board draws each thread as a lane and tells what a cell holds', (tester) async {
    final handle = tester.ensureSemantics();
    final w = await setUpNovel(tester, location: '/visualize/plot');
    final id = plotIn(w, (x) => x.createThread('The stolen key'));
    plotIn(w, (x) => x.addBeat(id, title: 'Missing', nodeId: w.a, role: 'introduction'));
    plotIn(w, (x) => x.addBeat(id, title: 'Found', nodeId: w.two, role: 'resolution'));
    plotIn(w, (x) => x.addBeat(id, title: 'Someday'));
    await tester.pumpAndSettle();
    expect(find.text('Plot board'), findsWidgets);
    final cell = find.bySemanticsLabel(RegExp(r'^The stolen key, Ch 1: introduction “Missing” in “Arrival”'));
    expect(cell, findsOneWidget);
    await tester.tap(cell);
    await tester.pumpAndSettle();
    expect(find.text('Open Ch 1, scene: Arrival'), findsWidgets);

    await tester.tap(find.text('List'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Introduced: Ch 1'), findsOneWidget);
    expect(find.text('Not placed in a chapter: development “Someday”.'), findsOneWidget);
    handle.dispose();
  });

  testWidgets('structure and pacing counts lengths and keeps the author’s markers', (tester) async {
    final w = await setUpNovel(tester, location: '/visualize/structure');
    expect(find.text('Structure and pacing'), findsWidgets);
    expect(find.textContaining('2 chapters · 0 words'), findsOneWidget);
    expect(find.text('No markers yet.'), findsOneWidget);

    await typeInto(tester, 'Kind of marker', 'Turning point');
    await choose(tester, 'Chapter or scene', 'The River');
    await tapText(tester, 'Add marker');
    final markers = w.c.read(novelStoreProvider).rowsIn(w.novel, 'structureMarkers');
    expect((markers.single['kind'], markers.single['nodeId']), ('Turning point', w.two));
    expect(find.text('Turning point'), findsWidgets);

    await tester.tap(find.byTooltip('Remove the marker Turning point'));
    await tester.pumpAndSettle();
    expect(w.c.read(novelStoreProvider).rowsIn(w.novel, 'structureMarkers'), isEmpty);
  });

  testWidgets('character appearances records who appears from a cell, in the plan only', (tester) async {
    final handle = tester.ensureSemantics();
    final w = await setUpNovel(tester, location: '/visualize/appearances');
    expect(find.text('Character appearances'), findsWidgets);
    expect(find.textContaining('Nothing is recorded for anyone in these chapters'), findsOneWidget);
    await tapText(tester, 'Show every character');
    final cell = find.bySemanticsLabel(RegExp(r'^Mira, .*The River: not recorded'));
    expect(cell, findsOneWidget);
    await tester.tap(cell);
    await tester.pumpAndSettle();
    expect(find.text('Mira in Ch 2: The River'), findsOneWidget);

    await tapText(tester, 'Record: appears here');
    expect(planOf(w, w.two)?['appearIds'], [w.mira]);
    await tapText(tester, 'Remove my record');
    expect(planOf(w, w.two)?['appearIds'], isEmpty);
    handle.dispose();
  });
}
