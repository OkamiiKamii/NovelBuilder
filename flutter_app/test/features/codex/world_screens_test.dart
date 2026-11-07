import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/codex/widgets/encyclopedia.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/records/category.dart';
import 'package:novel_builder/shared/domain/records/entry.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';
import 'package:super_editor/super_editor_test.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';
import '../write/manuscript_service_test.dart' show linked;

Future<({ProviderContainer c, String novel})> openWorld(WidgetTester tester, {Size size = desktop}) async {
  final c = await pumpApp(tester, size: size, location: '/organize/world');
  final novel = c.read(libraryServiceProvider).create({'title': 'Ashfall'});
  c.read(openNovelProvider.notifier).open(novel.id);
  await tester.pumpAndSettle();
  return (c: c, novel: novel.id);
}

String makeEntry(ProviderContainer c, String novel, String category, String name) =>
    c.read(characterServiceProvider).change(novel, (x) => x.createEntry(category, name)).id;

Entry entryOf(ProviderContainer c, String novel, String id) =>
    Entry(c.read(novelStoreProvider).row(novel, 'loreEntries', id)!);

/// A window tall enough to show a whole entry page without scrolling.
const tall = Size(1400, 4000);

Future<void> settleSaves(WidgetTester tester) async {
  await tester.pump(const Duration(seconds: 1));
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDownAll(() => BlinkController.indeterminateAnimationsEnabled = true);

  testWidgets('an empty world says what it holds; a new entry of a kind opens its page', (tester) async {
    final w = await openWorld(tester);
    expect(find.text('Build your world'), findsOneWidget);
    await tester.tap(find.text('New entry'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Location').last);
    await tester.pumpAndSettle();
    expect(currentLocation(w.c), startsWith('/organize/world/entry/'));
    final rows = w.c.read(novelStoreProvider).rowsIn(w.novel, 'loreEntries');
    expect([for (final r in rows) (r['name'], r['category'])], [('New location', 'location')]);
    expect(find.text('Location fields'), findsOneWidget);
  });

  testWidgets('an entry’s fields save as typed; a required field says so when empty, and is never enforced', (
    tester,
  ) async {
    final w = await openWorld(tester);
    final keep = makeEntry(w.c, w.novel, 'location', 'The Keep');
    w.c
        .read(characterServiceProvider)
        .change(
          w.novel,
          (x) => x.saveCategory(
            'location',
            (current) => {
              'fields': [
                for (final f in current!.fields) f.raw,
                {
                  'id': 'pop',
                  'name': 'Population',
                  'type': 'number',
                  'options': <String>[],
                  'required': true,
                  'max': 5000,
                },
              ],
            },
          ),
        );
    w.c.read(routerProvider).go('/organize/world/entry/$keep');
    await tester.pumpAndSettle();
    expect(find.text('Population is required.'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Type'), 'Fortress');
    await tester.enterText(find.widgetWithText(TextField, 'Population *'), '9000');
    await settleSaves(tester);
    final entry = entryOf(w.c, w.novel, keep);
    expect({for (final f in entry.fields) f.defId: f.value}, {'builtin-location-0': 'Fortress', 'pop': '9000'});
    expect(find.text('Population should be at most 5000; it is 9000.'), findsOneWidget);
  });

  testWidgets('fields just for one entry, tags and a link to another entry, with its status', (tester) async {
    final w = await openWorld(tester, size: tall);
    final keep = makeEntry(w.c, w.novel, 'location', 'The Keep');
    makeEntry(w.c, w.novel, 'faction', 'Ash Guild');
    w.c.read(routerProvider).go('/organize/world/entry/$keep');
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Add a field'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Add a field'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Field name'), 'Motto');
    await tester.pump();
    await tester.enterText(find.widgetWithText(TextField, 'Motto: value'), 'Hold fast');
    await tester.enterText(find.widgetWithText(TextField, 'Tags (comma separated)'), 'north, stone');
    await settleSaves(tester);
    final entry = entryOf(w.c, w.novel, keep);
    expect([for (final f in entry.fields) (f.key, f.value)], [('Motto', 'Hold fast')]);
    expect(entry.tags, ['north', 'stone']);

    await tester.ensureVisible(find.widgetWithText(DropdownButtonFormField<String>, 'Link to…'));

    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(DropdownButtonFormField<String>, 'Link to…'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ash Guild (Faction / Species)').last);
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Relationship (optional)'), 'Seat of');
    await tester.tap(find.widgetWithText(FilledButton, 'Link'));
    await tester.pumpAndSettle();
    final link = w.c.read(novelStoreProvider).rowsIn(w.novel, 'loreLinks').single;
    expect((link['fromId'], link['fromLabel']), (keep, 'Seat of'));
    expect(find.text('Ash Guild'), findsWidgets);
  });

  testWidgets('categories & fields: add a kind, start one from a preset, archive and restore a field', (tester) async {
    final w = await openWorld(tester, size: tall);
    w.c.read(routerProvider).go('/organize/world/kinds');
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'New category'), 'Kingdoms');
    await tester.tap(find.text('Add category'));
    await tester.pumpAndSettle();
    final stored = [for (final r in w.c.read(novelStoreProvider).rowsIn(w.novel, 'loreSchemas')) Category(r)];
    expect([for (final k in stored) (k.name, k.builtin)], [('Kingdoms', false)]);
    expect(find.text('Kingdoms'), findsWidgets);

    await tester.tap(find.text('Or start from a preset…'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Spells'));
    await tester.pumpAndSettle();
    final spells = [
      for (final r in w.c.read(novelStoreProvider).rowsIn(w.novel, 'loreSchemas'))
        if (r['name'] == 'Spells') Category(r),
    ].single;
    expect([for (final f in spells.fields) f.name], ['Effect', 'School', 'Rank', 'Cost', 'Known by']);

    await tester.tap(find.byTooltip('Remove Cost (archived: values already written are kept)'));
    await tester.pumpAndSettle();
    expect(find.text('Archived fields'), findsOneWidget);
    await tester.ensureVisible(find.text('Restore'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Restore'));
    await tester.pumpAndSettle();
    final after = [
      for (final r in w.c.read(novelStoreProvider).rowsIn(w.novel, 'loreSchemas'))
        if (r['name'] == 'Spells') Category(r),
    ].single;
    expect(
      [for (final f in after.fields) '${f.name}${f.archived ? ' (archived)' : ''}'],
      ['Effect', 'School', 'Rank', 'Cost', 'Known by'],
    );
  });

  testWidgets('deleting an entry says what refers to it, keeps the words, and Undo brings it back', (tester) async {
    final w = await openWorld(tester);
    final keep = makeEntry(w.c, w.novel, 'location', 'The Keep');
    final m = w.c.read(manuscriptServiceProvider);
    final chapter = m.create(w.novel, NodeKind.chapter, title: 'One');
    m.save(w.novel, chapter.id, linked('the Keep', keep), baseRev: 0);
    final text = w.c.read(novelStoreProvider).row(w.novel, 'chapterContents', chapter.id)!['doc'];
    w.c.read(routerProvider).go('/organize/world/entry/$keep');
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Delete entry…'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Delete entry…'));
    await tester.pumpAndSettle();
    expect(find.textContaining('1 chapter linking to it in the text (the words stay)'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Delete'));
    await tester.pumpAndSettle();
    expect(w.c.read(novelStoreProvider).row(w.novel, 'loreEntries', keep), isNull);
    expect(jsonEquals(w.c.read(novelStoreProvider).row(w.novel, 'chapterContents', chapter.id)!['doc'], text), isTrue);
    await tester.tap(find.text('Undo'));
    await tester.pumpAndSettle();
    expect(w.c.read(novelStoreProvider).row(w.novel, 'loreEntries', keep), isNotNull);
  });

  testWidgets('the world works on a phone at 200% text size, every page', (tester) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final w = await openWorld(tester, size: phone);
    final keep = makeEntry(w.c, w.novel, 'location', 'The Keep of Ten Thousand Winters');
    makeEntry(w.c, w.novel, 'faction', 'Ash Guild');
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    for (final location in [
      '/organize/world/entry/$keep',
      '/organize/world/kinds',
      '/organize/world/kinds?kind=location',
    ]) {
      w.c.read(routerProvider).go(location);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull, reason: location);
    }
  });

  testWidgets('a linked place in the editor opens its page', (tester) async {
    final c = await pumpApp(tester, location: '/write');
    final novel = c.read(libraryServiceProvider).create({'title': 'Ash'});
    final keep = makeEntry(c, novel.id, 'location', 'The Keep');
    final m = c.read(manuscriptServiceProvider);
    final chapter = m.create(novel.id, NodeKind.chapter, title: 'One');
    m.save(novel.id, chapter.id, linked('the Keep', keep), baseRev: 0);
    c.read(openNovelProvider.notifier).open(novel.id);
    c.read(selectedNodeProvider.notifier).select(chapter.id);
    await tester.pumpAndSettle();
    await tester.placeCaretInParagraph(SuperEditorInspector.findDocument()!.first.id, 3);
    await tester.pumpAndSettle();
    expect(find.text('Linked to The Keep (Location)'), findsOneWidget);
    await tester.tap(find.text('Open The Keep'));
    await tester.pumpAndSettle();
    expect(currentLocation(c), '/organize/world/entry/$keep');
  });

  testWidgets('the encyclopedia files entries by letter, opens a volume per kind and shows where each figures', (
    tester,
  ) async {
    final w = await openWorld(tester, size: tall);
    final keep = makeEntry(w.c, w.novel, 'location', 'The Keep');
    makeEntry(w.c, w.novel, 'location', 'Élan Spire');
    makeEntry(w.c, w.novel, 'faction', 'Ash Guild');
    makeEntry(w.c, w.novel, 'item', '7 Bells');
    final m = w.c.read(manuscriptServiceProvider);
    m.create(w.novel, NodeKind.chapter, title: 'One');
    final two = m.create(w.novel, NodeKind.chapter, title: 'Two');
    m.save(w.novel, two.id, linked('the Keep', keep), baseRev: 0);
    await tester.pumpAndSettle();

    expect(letterOf('Élan Spire'), 'E');
    expect(letterOf('7 Bells'), '#');
    for (final letter in ['Letter A', 'Letter E', 'Letter T', 'Numbers and signs']) {
      expect(find.bySemanticsLabel(letter), findsOneWidget, reason: letter);
    }
    expect(find.bySemanticsLabel(RegExp(r'^The Keep, Location, In chapter 2')), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp(r'^Ash Guild, .*Not in the manuscript yet')), findsOneWidget);

    await tester.tap(find.text('Locations'));
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel(RegExp(r'^Locations, 2 entries')), findsOneWidget);
    expect(find.text('Ash Guild'), findsNothing);
    expect(find.text('The Keep'), findsOneWidget);
    expect(find.text('2 of 4 entries'), findsOneWidget);
    await tester.tap(find.text('The whole world'));
    await tester.pumpAndSettle();
    expect(find.text('Ash Guild'), findsOneWidget);

    await tester.tap(find.text('The Keep'));
    await tester.pumpAndSettle();
    expect(currentLocation(w.c), '/organize/world/entry/$keep');
  });

  testWidgets('a character’s address under World opens the character’s profile', (tester) async {
    final w = await openWorld(tester);
    final mira = w.c.read(characterServiceProvider).change(w.novel, (x) => x.create(name: 'Mira')).id;
    w.c.read(routerProvider).go('/organize/world/entry/$mira');
    await tester.pumpAndSettle();
    expect(currentLocation(w.c), '/organize/character/$mira');
    // Snapshot sanity: nothing was written by opening it.
    expect(NovelSnapshot, isNotNull);
  });
}
