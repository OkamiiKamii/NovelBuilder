import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/database.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/records/novel.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';

import 'package:super_text_layout/super_text_layout.dart';

import '../helpers/pump_app.dart';
import '../shared/domain/fixtures.dart';

Future<void> _menu(WidgetTester tester, String title, String action) async {
  await tester.tap(find.byTooltip('More for $title'));
  await tester.pumpAndSettle();
  await tester.tap(find.text(action).last);
  await tester.pumpAndSettle();
}

/// Whether book [a] comes before book [b] on the shelf: in reading order, a row above, or further left on the same row.
bool _before(WidgetTester tester, String a, String b) {
  final pa = tester.getTopLeft(find.text(a)), pb = tester.getTopLeft(find.text(b));
  return pa.dy < pb.dy - 1 || ((pa.dy - pb.dy).abs() <= 1 && pa.dx < pb.dx);
}

Novel _add(ProviderContainer c, String title, {String status = 'drafting', String genre = ''}) =>
    c.read(libraryServiceProvider).create({'title': title, 'status': status, 'primaryGenre': genre});

void main() {
  testWidgets('the title page: a novel begins on its cover, and chapter one opens to write in', (tester) async {
    BlinkController.indeterminateAnimationsEnabled = false;
    addTearDown(() => BlinkController.indeterminateAnimationsEnabled = true);
    final container = await pumpApp(tester);
    ButtonStyleButton begin() => tester.widget<ButtonStyleButton>(
      find.ancestor(of: find.text('Begin chapter one'), matching: find.byWidgetPredicate((w) => w is FilledButton)),
    );
    expect(begin().onPressed, isNull, reason: 'a title first');

    await tester.enterText(find.widgetWithText(TextField, 'Your title'), 'The Ember Road');
    await tester.enterText(find.widgetWithText(TextField, 'Author'), 'R. Gonzalez');
    await tester.tap(find.bySemanticsLabel('Teal cover'));
    await tester.pumpAndSettle();
    expect(container.read(libraryProvider), isEmpty, reason: 'nothing is created before Begin');
    expect(begin().onPressed, isNotNull);

    await tester.tap(find.text('Begin chapter one'));
    await tester.pumpAndSettle();
    final novel = container.read(libraryProvider).single;
    expect((novel.title, novel.author, novel.accent), ('The Ember Road', 'R. Gonzalez', '#2b7a8c'));
    final chapter = container.read(manuscriptServiceProvider).nodes(novel.id).single;
    expect(chapter.kind, NodeKind.chapter);
    expect(container.read(openNovelProvider), novel.id);
    expect(container.read(selectedNodeProvider), chapter.id);
    expect(currentLocation(container), '/write');
    expect(find.text('CHAPTER 1'), findsOneWidget, reason: 'on the writing desk');
  });

  testWidgets('the title page: More details keeps what was typed; a second novel remembers the author', (tester) async {
    BlinkController.indeterminateAnimationsEnabled = false;
    addTearDown(() => BlinkController.indeterminateAnimationsEnabled = true);
    final container = await pumpApp(tester);
    await tester.enterText(find.widgetWithText(TextField, 'Your title'), 'Ash');
    await tester.tap(find.text('More details'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(TextFormField, 'Ash'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextFormField, 'Author'), 'Mira Vale');
    await tester.tap(find.text('Create novel'));
    await tester.pumpAndSettle();
    expect(container.read(libraryProvider).single.title, 'Ash');

    await tester.tap(find.text('New novel').first);
    await tester.pumpAndSettle();
    expect(find.widgetWithText(TextField, 'Mira Vale'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Your title'), 'Ember');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pumpAndSettle();
    expect(container.read(libraryProvider).map((n) => (n.title, n.author)), contains(('Ember', 'Mira Vale')));
    expect(currentLocation(container), '/write');
  });

  testWidgets('creating a novel: the title is required, then it appears with its details', (tester) async {
    final container = await pumpApp(tester);
    await tester.tap(find.text('More details'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Create novel'));
    await tester.pumpAndSettle();
    expect(find.text('Give the novel a title.'), findsOneWidget);

    await tester.enterText(find.widgetWithText(TextFormField, 'Title *'), 'The Ember Road');
    await tester.enterText(find.widgetWithText(TextFormField, 'Author'), 'R. Gonzalez');
    await tester.enterText(find.widgetWithText(TextFormField, 'Target word count'), '80000');
    await tester.tap(find.text('Create novel'));
    await tester.pumpAndSettle();

    final novel = container.read(libraryProvider).single;
    expect((novel.title, novel.author, novel.targetWordCount), ('The Ember Road', 'R. Gonzalez', 80000));
    expect(find.text('The Ember Road'), findsOneWidget);
    // A book's words and target are shown inside the book, never in the library.
    expect(find.textContaining('80,000'), findsNothing);
  });

  testWidgets('editing details from the menu', (tester) async {
    final container = await pumpApp(tester);
    _add(container, 'Ash');
    await tester.pumpAndSettle();
    await _menu(tester, 'Ash', 'Edit details');
    await tester.enterText(find.widgetWithText(TextFormField, 'Title *'), 'Ash and Ember');
    await tester.tap(find.text('Save details'));
    await tester.pumpAndSettle();
    expect(container.read(libraryProvider).single.title, 'Ash and Ember');
    expect(find.text('Ash and Ember'), findsOneWidget);
  });

  testWidgets('duplicating makes a separate copy', (tester) async {
    final container = await pumpApp(tester);
    container.read(novelStoreProvider).putNovel(loadFixture('qa-sample'));
    await tester.pumpAndSettle();
    final title = loadFixture('qa-sample').project['title']! as String;
    await _menu(tester, title, 'Duplicate');
    expect(container.read(libraryProvider).map((n) => n.title), containsAll([title, '$title (Copy)']));
    expect(find.textContaining('a separate copy'), findsOneWidget);
  });

  testWidgets('archiving hides a novel from the list, and the archive shows it again', (tester) async {
    final container = await pumpApp(tester);
    _add(container, 'Ash');
    _add(container, 'Ember');
    await tester.pumpAndSettle();
    await _menu(tester, 'Ash', 'Archive');
    expect(find.text('Ash'), findsNothing);
    expect(find.text('Ember'), findsOneWidget);
    await tester.tap(find.text('Archived (1)'));
    await tester.pumpAndSettle();
    expect(find.text('Ash'), findsOneWidget);
    expect(find.text('Ember'), findsNothing);
    await _menu(tester, 'Ash', 'Restore from archive');
    expect(container.read(libraryProvider).every((n) => !n.archived), isTrue);
  });

  testWidgets('deleting asks first, focuses Cancel, and can be undone', (tester) async {
    final container = await pumpApp(tester);
    container.read(novelStoreProvider).putNovel(loadFixture('qa-sample'));
    await tester.pumpAndSettle();
    final title = loadFixture('qa-sample').project['title']! as String;

    await _menu(tester, title, 'Delete…');
    expect(find.text('Delete “$title”?'), findsOneWidget);
    expect(find.textContaining('restore point'), findsOneWidget);
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(container.read(libraryProvider), hasLength(1));

    await _menu(tester, title, 'Delete…');
    await tester.tap(find.widgetWithText(FilledButton, 'Delete'));
    await tester.pumpAndSettle();
    expect(container.read(libraryProvider), isEmpty);
    await tester.tap(find.text('Undo'));
    await tester.pumpAndSettle();
    expect(container.read(libraryProvider).single.title, title);
    expect(
      container.read(novelStoreProvider).load(loadFixture('qa-sample').projectId)!.rows('loreEntries'),
      hasLength(13),
    );
  });

  testWidgets('search, filters and sorting; a search that finds nothing says so and can be cleared', (tester) async {
    final container = await pumpApp(tester);
    _add(container, 'Zephyr', genre: 'Fantasy');
    _add(container, 'Anvil', status: 'complete', genre: 'Mystery');
    await tester.pumpAndSettle();

    await tester.enterText(find.widgetWithText(TextField, 'Search novels'), 'mystery');
    await tester.pumpAndSettle();
    expect(find.text('Anvil'), findsOneWidget);
    expect(find.text('Zephyr'), findsNothing);

    await tester.enterText(find.widgetWithText(TextField, 'Search novels'), 'nothing like this');
    await tester.pumpAndSettle();
    expect(find.text('Nothing matches “nothing like this”'), findsOneWidget);
    await tester.tap(find.text('Clear search and filters'));
    await tester.pumpAndSettle();
    expect(find.text('Anvil'), findsOneWidget);
    expect(find.text('Zephyr'), findsOneWidget);

    await tester.tap(find.text('Last edited'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Title').last);
    await tester.pumpAndSettle();
    expect(_before(tester, 'Anvil', 'Zephyr'), isTrue);

    // Totals count what is in the library.
    expect(find.text('In progress'), findsOneWidget);
    expect(find.text('Complete'), findsWidgets);
  });

  testWidgets('pinned novels come first', (tester) async {
    final container = await pumpApp(tester);
    _add(container, 'Older');
    final pinned = _add(container, 'Pinned one');
    _add(container, 'Newest');
    container.read(libraryServiceProvider).setPinned(pinned.id, true);
    await tester.pumpAndSettle();
    expect(_before(tester, 'Pinned one', 'Newest'), isTrue);
    expect(find.byIcon(Icons.push_pin), findsOneWidget);
  });

  testWidgets('a backup of a novel already here can be imported as a separate copy', (tester) async {
    final files = FakeBackupFiles()..toPick = (name: 'qa.novel.json', text: jsonEncode(fixtureJson('qa-sample')));
    final container = await pumpApp(tester, files: files);
    container.read(novelStoreProvider).putNovel(loadFixture('qa-sample'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Import backup'));
    await tester.pumpAndSettle();
    expect(find.textContaining('is already in your library'), findsOneWidget);
    await tester.tap(find.text('Import as a copy'));
    await tester.pumpAndSettle();
    expect(container.read(libraryProvider), hasLength(2));
    expect(container.read(restorePointsProvider), isEmpty, reason: 'nothing was replaced');
  });

  testWidgets('the open novel is remembered after a restart, and shown in its areas', (tester) async {
    final db = AppDatabase.inMemory();
    addTearDown(db.close);
    var container = await pumpApp(tester, db: db);
    _add(container, 'Ash');
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ash'));
    await tester.pumpAndSettle();
    expect(currentLocation(container), '/write');
    expect(find.textContaining('Ash · 0 words'), findsOneWidget, reason: 'Write shows which novel is open');
    container.dispose();

    container = await pumpApp(tester, db: db, location: '/write');
    expect(container.read(openNovelProvider), isNotNull);
    expect(find.text('No novel open'), findsNothing);
    expect(find.textContaining('Ash · 0 words'), findsOneWidget);
    expect(container.read(libraryProvider).single.lastOpenedAt, isNotNull);
  });

  testWidgets('a deleted open novel is closed', (tester) async {
    final container = await pumpApp(tester, location: '/write');
    final n = _add(container, 'Ash');
    container.read(openNovelProvider.notifier).open(n.id);
    await tester.pumpAndSettle();
    container.read(libraryServiceProvider).delete(n.id);
    await tester.pumpAndSettle();
    expect(container.read(openNovelProvider), isNull);
    expect(find.text('No novel open'), findsOneWidget);
  });

  testWidgets('the library works on a phone, with large text', (tester) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final container = await pumpApp(tester, size: phone);
    container.read(novelStoreProvider).putNovel(loadFixture('made-in-the-app'));
    _add(container, 'A much longer title that has to wrap on a small screen');
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.tap(find.text('New novel').first);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.ensureVisible(find.text('More details'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('More details'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('Start from'), findsOneWidget, reason: 'with other novels, a setup to start from is offered');
  });

  testWidgets('a message at the bottom of the screen never covers a novel\'s menu', (tester) async {
    WidgetController.hitTestWarningShouldBeFatal = true;
    addTearDown(() => WidgetController.hitTestWarningShouldBeFatal = false);
    final container = await pumpApp(tester, size: phone);
    _add(container, 'Ash');
    await tester.pumpAndSettle();
    await _menu(tester, 'Ash', 'Duplicate');
    expect(find.textContaining('a separate copy'), findsOneWidget, reason: 'the message is showing');
    await _menu(tester, 'Ash (Copy)', 'Delete…');
    expect(find.text('Delete “Ash (Copy)”?'), findsOneWidget);
  });

  testWidgets('a message with Undo goes away on its own, so it never stays over the page', (tester) async {
    final container = await pumpApp(tester);
    _add(container, 'Ash');
    await tester.pumpAndSettle();
    await _menu(tester, 'Ash', 'Archive');
    expect(find.text('Undo'), findsOneWidget);
    await tester.pump(const Duration(seconds: 7));
    await tester.pumpAndSettle();
    expect(find.text('Undo'), findsNothing);
  });

  testWidgets('the book last opened waits at the top, and Continue writing goes back to the chapter left open', (
    tester,
  ) async {
    // The editor's caret blinks forever; the test waits for the screen to settle, so it holds still here.
    BlinkController.indeterminateAnimationsEnabled = false;
    addTearDown(() => BlinkController.indeterminateAnimationsEnabled = true);
    final container = await pumpApp(tester);
    _add(container, 'Untouched');
    final ash = _add(container, 'Ash');
    expect(find.text('Pick up where you left off'), findsNothing, reason: 'nothing opened yet');
    final m = container.read(manuscriptServiceProvider);
    m.create(ash.id, NodeKind.chapter, title: 'The Gate');
    final river = m.create(ash.id, NodeKind.chapter, title: 'The River');
    container.read(openNovelProvider.notifier).open(ash.id);
    container.read(selectedNodeProvider.notifier).select(river.id);
    container.read(openNovelProvider.notifier).close();
    await tester.pumpAndSettle();
    expect(find.text('Pick up where you left off'), findsOneWidget);
    await tester.tap(find.text('Continue writing “The River”'));
    await tester.pumpAndSettle();
    expect(currentLocation(container), '/write');
    expect(container.read(openNovelProvider), ash.id);
    expect(container.read(selectedNodeProvider), river.id);
  });
}
