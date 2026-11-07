import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/progression/progression_providers.dart';
import 'package:novel_builder/features/progression/widgets/progress_chart.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/model/entity_ref.dart';
import 'package:novel_builder/shared/domain/systems/system_presets.dart';

import '../../helpers/pump_app.dart';

typedef Novel = ({ProviderContainer c, String novel, String mira});

Future<Novel> setUp(WidgetTester tester, {required String Function(String mira) location, Size? size}) async {
  final c = await pumpApp(tester, size: size ?? const Size(1400, 900), location: '/library');
  final novel = c.read(libraryServiceProvider).create({'title': 'Growth'}).id;
  final mira = c.read(characterServiceProvider).change(novel, (x) => x.create(name: 'Mira')).id;
  c.read(openNovelProvider.notifier).open(novel);
  await tester.pumpAndSettle();
  c.read(routerProvider).go(location(mira));
  await tester.pumpAndSettle();
  return (c: c, novel: novel, mira: mira);
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
  final field = find.widgetWithText(DropdownButtonFormField<T>, label).first;
  await tester.ensureVisible(field);
  await tester.pumpAndSettle();
  await tester.tap(field);
  await tester.pumpAndSettle();
  await tester.tap(find.textContaining(option).last);
  await tester.pumpAndSettle();
}

/// Two skills, one the other's prerequisite in the blueprint's own requirement rule.
String twoSkills(Novel n) {
  final s = n.c.read(progressionServiceProvider);
  return s.systems(n.novel, (x) {
    final made = x.createSystem({
      'name': 'Ember Arts',
      'groups': [
        {'id': 'g', 'name': 'Skills', 'single': false},
      ],
      'items': [
        {'id': 'spark', 'groupId': 'g', 'name': 'Spark'},
        {'id': 'lance', 'groupId': 'g', 'name': 'Fire Lance', 'requires': 'Skill: Spark'},
        {'id': 'ward', 'groupId': 'g', 'name': 'Ward'},
      ],
    });
    return made.id;
  });
}

void main() {
  testWidgets('a system starts from a preset, and its parts are named by the author', (tester) async {
    final n = await setUp(tester, location: (_) => '/organize/systems');
    expect(find.text('No systems yet'), findsOneWidget);
    await tapText(tester, 'Or start from a preset…');
    await tapText(tester, systemPresets.first.name);
    final systems = rows(n, 'systems');
    expect(systems.single['name'], systemPresets.first.content['name']);

    await tapText(tester, 'Attributes & resources (${maps(systems.single['variables']).length})');
    final before = maps(systems.single['variables']).length;
    await tapText(tester, 'Attribute');
    expect(maps(rows(n, 'systems').single['variables']).length, before + 1);
    expect(maps(rows(n, 'systems').single['variables']).last['name'], 'New attribute');
  });

  testWidgets('a character is put on a system from its Sheets tab, and taken off again', (tester) async {
    final n = await setUp(tester, location: (_) => '/organize/systems');
    await tapText(tester, 'A blank system');
    await tapText(tester, 'Sheets (0)');
    await tapText(tester, 'Add a character or entry…');
    await tapText(tester, 'Mira');
    expect(rows(n, 'systemSheets').single['entryId'], n.mira);
    expect(find.text('Open profile'), findsOneWidget);
  });

  testWidgets('deleting a system asks first and names what goes with it', (tester) async {
    final n = await setUp(tester, location: (_) => '/organize/systems');
    await tapText(tester, 'A blank system');
    await tapText(tester, 'Delete this system…');
    expect(find.textContaining('Characters and entries are not changed'), findsOneWidget);
    await tapText(tester, 'Delete the system');
    expect(rows(n, 'systems'), isEmpty);
    expect(find.text('No systems yet'), findsOneWidget);
  });

  testWidgets('the Progression tab records a change only once something is tracked', (tester) async {
    final n = await setUp(tester, location: (mira) => '/organize/character/$mira?tab=progression');
    expect(find.text('This novel tracks nothing about how characters change yet.'), findsOneWidget);
    await tapText(tester, 'Choose what to track…');
    await tapText(tester, 'Level');
    await tapText(tester, 'Done');
    expect(rows(n, 'progressCategories').single['name'], 'Level');

    await tester.enterText(find.widgetWithText(TextField, 'Set to'), '4');
    await tapText(tester, 'Record the change');
    final change = rows(n, 'progressChanges').single;
    expect([change['entryId'], change['value'], change['action']], [n.mira, '4', 'set']);
    expect(find.text('Changes, in order'), findsOneWidget);
    expect(find.text('4', findRichText: true), findsOneWidget);
  });

  testWidgets('a character with nothing recorded is shown nothing, not empty rows', (tester) async {
    final n = await setUp(tester, location: (mira) => '/organize/character/$mira?tab=progression');
    expect(find.text('This novel has no system blueprints.'), findsOneWidget);
    expect(rows(n, 'systemSheets'), isEmpty);
    expect(rows(n, 'progressSnapshots'), isEmpty);
  });

  testWidgets('ability paths draw a blueprint rule as a path, and a recorded path is added and removed', (
    tester,
  ) async {
    final n = await setUp(tester, location: (_) => '/library', size: const Size(1400, 2400));
    twoSkills(n);
    n.c.read(routerProvider).go('/visualize/abilities');
    await tester.pumpAndSettle();
    expect(find.text('Ability paths'), findsWidgets);
    // Ward has no path, so it is left out of the drawing until asked for.
    expect(find.text('Also draw the 1 with no paths'), findsOneWidget);
    expect(find.text('Ward'), findsNothing);
    await tapText(tester, 'Also draw the 1 with no paths');
    expect(find.text('Ward'), findsOneWidget);

    await tapText(tester, 'Ward');
    expect(find.text('Nobody is recorded as holding it.'), findsOneWidget);
    await choose<String>(tester, 'The other ability', 'Spark');
    await tapText(tester, 'Add the path');
    final link = rows(n, 'loreLinks').single;
    expect(link['type'], 'prerequisite-for');
    expect(find.text('Prerequisite for Spark'), findsOneWidget);

    await tapText(tester, 'List');
    expect(find.textContaining('Its requirement rule names Spark'), findsOneWidget);
    await tapText(tester, 'Tree');
    await tapText(tester, 'Remove');
    expect(rows(n, 'loreLinks'), isEmpty);
  });

  testWidgets('a cycle of prerequisites is said, never fixed', (tester) async {
    final n = await setUp(tester, location: (_) => '/library', size: const Size(1400, 2400));
    final id = twoSkills(n);
    final items = maps(rows(n, 'systems').single['items']);
    EntityRef item(String name) =>
        EntityRef(EntityType.ability, abilityId(id, str(items.firstWhere((i) => i['name'] == name)['id'])));
    n.c.read(characterServiceProvider).change(n.novel, (x) {
      x.createConnection(from: item('Fire Lance'), to: item('Spark'), type: 'prerequisite-for');
    });
    n.c.read(routerProvider).go('/visualize/abilities');
    await tester.pumpAndSettle();
    expect(find.text('Problem'), findsWidgets);
    expect(rows(n, 'loreLinks').length, 1, reason: 'nothing is changed to fix it');
  });

  testWidgets('the progression list says each character’s state at the end', (tester) async {
    final n = await setUp(tester, location: (_) => '/library');
    final s = n.c.read(progressionServiceProvider);
    final level = s.track(n.novel, (x) => x.saveCategory(null, name: 'Level', shape: 'value'));
    s.track(n.novel, (x) => x.record({'entryId': n.mira, 'categoryId': level.id, 'action': 'set', 'value': '7'}));
    n.c.read(routerProvider).go('/visualize/progression');
    await tester.pumpAndSettle();
    expect(find.textContaining('Level 7'), findsOneWidget);
    expect(find.textContaining('the drawing comes in phase'), findsNothing);
  });

  testWidgets('removing a group says first that its items and their paths go with it', (tester) async {
    final n = await setUp(tester, location: (_) => '/library', size: const Size(1400, 2400));
    final id = twoSkills(n);
    final items = maps(rows(n, 'systems').single['items']);
    EntityRef item(String name) =>
        EntityRef(EntityType.ability, abilityId(id, str(items.firstWhere((i) => i['name'] == name)['id'])));
    n.c.read(characterServiceProvider).change(n.novel, (x) {
      x.createConnection(from: item('Ward'), to: item('Spark'), type: 'excludes');
    });
    n.c.read(routerProvider).go('/organize/systems?tab=kits');
    await tester.pumpAndSettle();
    await tapText(tester, 'Remove Skills');
    expect(find.text('Remove the group Skills?'), findsOneWidget);
    expect(find.textContaining('3 items go with it. 1 recorded path goes with them.'), findsOneWidget);
    await tapText(tester, 'Cancel');
    expect(maps(rows(n, 'systems').single['items']).length, 3, reason: 'nothing changed when cancelled');
    await tapText(tester, 'Remove Skills');
    await tapText(tester, 'Remove');
    expect(maps(rows(n, 'systems').single['items']), isEmpty);
    expect(rows(n, 'loreLinks'), isEmpty);
  });

  testWidgets('a value set more than once is drawn over the story; words that are not numbers or steps are not', (
    tester,
  ) async {
    final n = await setUp(tester, location: (_) => '/library', size: const Size(1400, 2400));
    final s = n.c.read(progressionServiceProvider);
    final level = s.track(n.novel, (x) => x.saveCategory(null, name: 'Level', shape: 'value'));
    final rank = s.track(
      n.novel,
      (x) => x.saveCategory(null, name: 'Rank', shape: 'value', ladder: ['Squire', 'Knight', 'Lord']),
    );
    final mood = s.track(n.novel, (x) => x.saveCategory(null, name: 'Mood', shape: 'value'));
    for (final (category, value) in [
      (level, '3'),
      (level, '7'),
      (rank, 'Squire'),
      (rank, 'Lord'),
      (mood, 'Calm'),
      (mood, 'Grim'),
    ]) {
      s.track(
        n.novel,
        (x) => x.record({'entryId': n.mira, 'categoryId': category.id, 'action': 'set', 'value': value}),
      );
      // Changes with no time are in the order recorded: a millisecond apart, as a person records them.
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 3)));
    }
    final model = n.c.read(castProvider)!.model;
    final series = chartSeries(model, n.mira);
    expect([for (final x in series) x.name], ['Level', 'Rank']);
    expect([for (final p in series.first.points) p.y], [3, 7]);
    expect([for (final p in series.last.points) p.y], [0, 2], reason: 'read as steps of its own ladder');

    n.c.read(routerProvider).go('/organize/character/${n.mira}?tab=progression');
    await tester.pumpAndSettle();
    expect(find.text('Over the story'), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp('Level over the story, 2 settings')), findsOneWidget);
    await tapText(tester, 'Rank');
    expect(find.bySemanticsLabel(RegExp('Rank over the story, 2 settings: Squire')), findsOneWidget);
  });
}
