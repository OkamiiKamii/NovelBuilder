import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/visualize/visualize_providers.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/template_store.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/model/entity_ref.dart';
import 'package:novel_builder/shared/domain/records/category.dart';
import 'package:novel_builder/shared/domain/records/link.dart';

import '../../helpers/pump_app.dart';

const tall = Size(1400, 5000);

typedef World = ({
  ProviderContainer c,
  FakeBackupFiles files,
  String novel,
  String key,
  String mira,
  String orrin,
  String crown,
});

/// A novel with a kind of record of its own (Artifacts, nothing set up yet), two characters, and two artifacts.
Future<World> setUp(WidgetTester tester, {String location = '/visualize/kinds', JsonMap? uses}) async {
  final files = FakeBackupFiles();
  final c = await pumpApp(tester, size: tall, location: location, files: files);
  final novel = c.read(libraryServiceProvider).create({'title': 'Kinds'}).id;
  final s = c.read(characterServiceProvider);
  JsonMap f(String id, String name, String type, [List<String> options = const []]) => {
    'id': id,
    'name': name,
    'type': type,
    'options': options,
  };
  final key = s
      .change(
        novel,
        (x) => x.saveCategory(
          null,
          (_) => {
            'name': 'Artifacts',
            'singular': 'Artifact',
            'fields': [
              f('found', 'Found', 'number'),
              f('east', 'East', 'number'),
              f('north', 'North', 'number'),
              f('tier', 'Tier', 'select', ['Low', 'Mid', 'High']),
              f('keeper', 'Keeper', 'reference'),
            ],
            'uses': ?uses,
          },
        ),
      )
      .key;
  final mira = s.change(novel, (x) => x.create(name: 'Mira')).id;
  final orrin = s.change(novel, (x) => x.create(name: 'Orrin')).id;
  final crown = s.change(novel, (x) => x.createEntry(key, 'Ember Crown')).id;
  final blade = s.change(novel, (x) => x.createEntry(key, 'Ash Blade')).id;
  s.change(novel, (x) {
    for (final (id, values) in [
      (crown, {'found': '1020', 'east': '3', 'north': '4', 'tier': 'High', 'keeper': mira}),
      (blade, {'found': 'long ago', 'east': 'far', 'tier': 'Low'}),
    ]) {
      for (final MapEntry(:key, :value) in values.entries) {
        x.setFieldValue(id, key, value);
      }
    }
  });
  c.read(openNovelProvider.notifier).open(novel);
  await tester.pumpAndSettle();
  return (c: c, files: files, novel: novel, key: key, mira: mira, orrin: orrin, crown: crown);
}

Category kindOf(World w) =>
    Category(w.c.read(novelStoreProvider).rowsIn(w.novel, 'loreSchemas').firstWhere((r) => r['key'] == w.key));

Future<void> tapText(WidgetTester tester, String text) async {
  final f = find.text(text).last;
  await tester.ensureVisible(f);
  await tester.pumpAndSettle();
  await tester.tap(f);
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
  testWidgets('the views a kind is shown in are chosen field by field, and what is missing is said', (tester) async {
    final w = await setUp(tester, location: '/organize/world/kinds');
    await choose(tester, 'Category', 'Artifacts');
    expect(find.text('Visualizations'), findsOneWidget);
    expect(find.text('Add a Link to an entry field to set this up.'), findsNothing, reason: 'Keeper is one');

    await choose(tester, 'Date on the timeline', 'Found (Number)');
    expect(mapOrNull(kindOf(w).uses['timeline'])?['start'], 'found');
    expect(find.text('Set up: shown under Visualize → Records by kind.'), findsOneWidget);

    await choose(tester, 'Across on the map', 'East (Number)');
    expect(find.text('Up on the map is not set: choose a Number field.'), findsOneWidget);
    await choose(tester, 'Up on the map', 'East (Number)');
    expect(find.text('The same field is chosen for across and up: choose two different fields.'), findsOneWidget);

    await choose(tester, 'Connection that means holding it', 'Owns');
    await choose(tester, 'Current holder field (optional)', 'Keeper');
    expect(mapOrNull(kindOf(w).uses['ownership']), {'type': 'owns', 'field': 'keeper'});

    final graph = find.widgetWithText(FilterChip, 'Show in the knowledge graph');
    await tester.ensureVisible(graph);
    await tester.tap(graph);
    await tester.pumpAndSettle();
    expect(kindOf(w).raw['graph'], false);
  });

  testWidgets('kinds are saved as templates, added from them only where missing, and deleted', (tester) async {
    final w = await setUp(tester, location: '/organize/world/kinds');
    await choose(tester, 'Category', 'Artifacts');
    await tapText(tester, 'Save Artifacts as a template');
    final saved = w.c.read(templatesProvider);
    expect([saved.single.name, saved.single.categories.single['name']], ['Artifacts', 'Artifacts']);

    await tester.enterText(find.widgetWithText(TextField, 'Template name'), 'My world');
    await tester.pumpAndSettle();
    await tapText(tester, 'Save template');
    expect(w.c.read(templatesProvider).map((t) => t.name), ['Artifacts', 'My world']);

    await tapText(tester, 'Add categories and fields from a template…');
    await tapText(tester, 'Detective Case');
    final names = [for (final r in w.c.read(novelStoreProvider).rowsIn(w.novel, 'loreSchemas')) r['name']];
    expect(names, containsAll(['Clues', 'Cases']));
    final count = w.c.read(novelStoreProvider).rowsIn(w.novel, 'loreSchemas').length;
    await tapText(tester, 'Add categories and fields from a template…');
    await tapText(tester, 'Detective Case');
    expect(w.c.read(novelStoreProvider).rowsIn(w.novel, 'loreSchemas'), hasLength(count), reason: 'only adds');

    await tester.tap(find.bySemanticsLabel('Delete template My world'));
    await tester.pumpAndSettle();
    expect(w.c.read(templatesProvider).map((t) => t.name), ['Artifacts']);
    expect(w.c.read(templateStoreProvider).list().map((t) => t.name), ['Artifacts'], reason: 'kept in the library');
  });

  testWidgets('a new novel can start from a worldbuilding template', (tester) async {
    final c = await pumpApp(tester, size: const Size(1400, 900), location: '/');
    await tapText(tester, 'More details');
    final template = find.widgetWithText(DropdownButtonFormField<String?>, 'Worldbuilding template');
    await tester.ensureVisible(template);
    await tester.pumpAndSettle();
    await tester.tap(template);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Science Fiction').last);
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextFormField, 'Title *'), 'Starfall');
    await tester.pumpAndSettle();
    await tapText(tester, 'Create novel');
    final novel = c.read(novelStoreProvider).listNovels().single;
    final names = [for (final r in c.read(novelStoreProvider).rowsIn(novel.id, 'loreSchemas')) r['name']];
    expect(names, containsAll(['Starships', 'Planets & Stations', 'Technologies']));
  });

  testWidgets('records by kind: a table to download, the ways it is set up for, and what is missing', (tester) async {
    final w = await setUp(
      tester,
      uses: {
        'rank': 'tier',
        'map': {'x': 'east'},
      },
    );
    expect(find.text('Records by kind'), findsWidgets);
    expect(find.text('Ember Crown'), findsOneWidget);
    await tapText(tester, 'Download the table (CSV)');
    expect(w.files.saved.single.name, 'artifacts.csv');
    expect(w.files.saved.single.text.split('\r\n').first, 'Name,Found,East,North,Tier,Keeper');

    await tester.tap(find.widgetWithText(ChoiceChip, 'By rank'));
    await tester.pumpAndSettle();
    expect(find.text('High'), findsOneWidget);
    expect(find.text('Mid'), findsOneWidget, reason: 'every rung, held or not');

    await tester.tap(find.widgetWithText(ChoiceChip, 'On a map · not set up'));
    await tester.pumpAndSettle();
    expect(find.text('Artifacts can’t be shown on a map yet:'), findsOneWidget);
    expect(find.text('• Up on the map is not set: choose a Number field.'), findsOneWidget);
    expect(find.text('Ember Crown'), findsOneWidget, reason: 'the table instead');
  });

  testWidgets('who holds a record is recorded beside the view, and passing it on keeps the history', (tester) async {
    final w = await setUp(
      tester,
      uses: {
        'ownership': {'type': 'owns', 'field': 'keeper'},
      },
    );
    await tester.tap(find.widgetWithText(ChoiceChip, 'By who holds it'));
    await tester.pumpAndSettle();
    expect(find.text('Keeper: Mira'), findsOneWidget);
    w.c.read(vizStateProvider.notifier).select(EntityRef(EntityType.entry, w.crown));
    await tester.pumpAndSettle();
    expect(find.text('Nobody is recorded as holding it now.'), findsOneWidget);

    await choose(tester, 'Holder', 'Mira');
    await tapText(tester, 'Record it');
    List<Link> links() => [for (final r in w.c.read(novelStoreProvider).rowsIn(w.novel, 'loreLinks')) Link(r)];
    expect([links().single.fromId, links().single.toId, links().single.type], [w.mira, w.crown, 'owns']);

    final chapter = w.c.read(novelStoreProvider).rowsIn(w.novel, 'chapters');
    expect(chapter, isEmpty);
    await choose(tester, 'Holder', 'Orrin');
    await tapText(tester, 'Record it');
    expect(find.textContaining('Choose when it passes to them'), findsOneWidget);
    expect(links(), hasLength(1), reason: 'nothing changed');
  });

  testWidgets('the record check lists views set up on fields that no longer suit', (tester) async {
    final w = await setUp(tester, location: '/review/records', uses: {'rank': 'found', 'graphLabel': 'east'});
    expect(find.textContaining('Views set up on fields that no longer suit (0)'), findsOneWidget);
    w.c
        .read(characterServiceProvider)
        .change(
          w.novel,
          (x) => x.saveCategory(
            w.key,
            (current) => {
              'fields': [
                for (final f in current!.fields)
                  if (f.id != 'east') f.id == 'found' ? {...f.raw, 'type': 'text'} : f.raw,
              ],
            },
          ),
        );
    await tester.pumpAndSettle();
    expect(find.textContaining('Views set up on fields that no longer suit (1)'), findsOneWidget);
    expect(find.textContaining('Found, chosen for the rank, is now Short text'), findsOneWidget);
    expect(
      find.textContaining('East, chosen for the label in the knowledge graph, was removed (archived)'),
      findsOneWidget,
    );
    expect(kindOf(w).uses['rank'], 'found', reason: 'the setting is kept');
  });
}
