import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/records/relation.dart';
import 'package:novel_builder/shared/domain/relationships/relation_changes.dart';

import '../../helpers/pump_app.dart';

const tall = Size(1400, 4000);

Future<({ProviderContainer c, String novel, String kael, String mira})> setUpPair(
  WidgetTester tester, {
  Size size = tall,
  String location = '/organize',
}) async {
  final c = await pumpApp(tester, size: size, location: location);
  final novel = c.read(libraryServiceProvider).create({'title': 'Ashfall'});
  final s = c.read(characterServiceProvider);
  final kael = s.change(novel.id, (x) => x.create(name: 'Kael')).id;
  final mira = s.change(novel.id, (x) => x.create(name: 'Mira')).id;
  c.read(openNovelProvider.notifier).open(novel.id);
  await tester.pumpAndSettle();
  return (c: c, novel: novel.id, kael: kael, mira: mira);
}

List<CharacterRelation> relationsOf(ProviderContainer c, String novel) => [
  for (final r in c.read(novelStoreProvider).rowsIn(novel, 'characterRelations')) CharacterRelation(r),
];

T relateIn<T>(ProviderContainer c, String novel, T Function(RelationChanges r) f) =>
    c.read(characterServiceProvider).change(novel, (x) {
      final r = RelationChanges(x.snapshot, now: x.now, createId: x.newId);
      final out = f(r);
      x.snapshot = r.snapshot;
      return out;
    });

void main() {
  testWidgets('a relationship is added from a profile, a change is recorded as a new stage, and history is kept', (
    tester,
  ) async {
    final w = await setUpPair(tester);
    w.c.read(routerProvider).go('/organize/character/${w.kael}?tab=relationships');
    await tester.pumpAndSettle();
    expect(find.text('Kael has no relationships recorded yet.'), findsOneWidget);
    await tester.tap(find.text('Add a relationship'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(DropdownButtonFormField<String>, 'With'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Mira').last);
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Add'));
    await tester.pumpAndSettle();
    final rel = relationsOf(w.c, w.novel).single;
    expect(currentLocation(w.c), '/organize/relationship/${rel.id}');
    expect(rel.stages.single.label, 'Friends');

    await tester.tap(find.text('Record a change…'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Add the stage'));
    await tester.pumpAndSettle();
    expect(relationsOf(w.c, w.novel).single.stages, hasLength(2));
    // Change the new stage's feeling: the first stage is untouched.
    final firstBefore = relationsOf(w.c, w.novel).single.stages.first.raw;
    await tester.tap(find.widgetWithText(ChoiceChip, 'Hostile').last);
    await tester.pumpAndSettle();
    final after = relationsOf(w.c, w.novel).single.stages;
    expect([jsonEquals(after.first.raw, firstBefore), after.last.affinity], [true, 'hostile']);
    expect(find.textContaining('changed feeling: Neutral → Hostile'), findsOneWidget);
  });

  testWidgets('a stage is placed on a date in story time, checked against the novel’s calendar', (tester) async {
    final w = await setUpPair(tester);
    final rel = relateIn(w.c, w.novel, (r) => r.createRelation(w.kael, w.mira));
    w.c.read(routerProvider).go('/organize/relationship/${rel.id}');
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(DropdownButtonFormField<String>, 'When in story time'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('On a date…').last);
    await tester.pumpAndSettle();
    final year = find.widgetWithText(TextField, 'Year');
    await tester.ensureVisible(year);
    await tester.pumpAndSettle();
    await tester.enterText(year, '1020');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pumpAndSettle();
    final stored = relationsOf(w.c, w.novel).single.stages.single.storyAt!;
    expect(stored['kind'], 'date');
    expect((stored['when']! as Map)['year'], 1020);
    expect(find.textContaining('in story time Year 1020'), findsOneWidget);
  });

  testWidgets('tracked attributes appear on each stage, each way, only once chosen', (tester) async {
    final w = await setUpPair(tester);
    final rel = relateIn(w.c, w.novel, (r) => r.createRelation(w.kael, w.mira));
    w.c.read(routerProvider).go('/organize/relationships/settings');
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilterChip, 'Trust'));
    await tester.pumpAndSettle();
    w.c.read(routerProvider).go('/organize/relationship/${rel.id}');
    await tester.pumpAndSettle();
    expect(find.text('Kael toward Mira'), findsOneWidget);
    expect(find.text('Mira toward Kael'), findsOneWidget);
    await tester.tap(find.widgetWithText(DropdownButtonFormField<int?>, 'Kael toward Mira'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('7').last);
    await tester.pumpAndSettle();
    expect(relationsOf(w.c, w.novel).single.stages.single.attribute('trust'), (from: 7, to: null));
  });

  testWidgets('the map draws the shared records, filters them, opens what is selected, and lists them', (tester) async {
    final w = await setUpPair(tester, location: '/visualize');
    final s = w.c.read(characterServiceProvider);
    final orrin = s.change(w.novel, (x) => x.create(name: 'Orrin')).id;
    final one = relateIn(w.c, w.novel, (r) => r.createRelation(w.kael, w.mira, 'rivals'));
    relateIn(w.c, w.novel, (r) => r.createRelation(orrin, w.kael, 'mentor-student'));
    await tester.pumpAndSettle();
    expect(find.text('Relationship map'), findsWidgets, reason: 'the title, and its place in the view switch');
    expect(find.textContaining('Showing 3 characters and 2 of 2 relationships'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilterChip, 'Mentorship'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Showing 2 characters and 1 of 2 relationships'), findsOneWidget);
    await tester.tap(find.text('List'));
    await tester.pumpAndSettle();
    expect(find.text('Kael · Rivals · Mira'), findsOneWidget);
    await tester.tap(find.text('Kael · Rivals · Mira'));
    await tester.pumpAndSettle();
    expect(currentLocation(w.c), '/organize/relationship/${one.id}');
  });

  testWidgets('on a phone the map’s filters fold away, and the map fits itself to its box', (tester) async {
    final w = await setUpPair(tester, size: phone, location: '/visualize');
    relateIn(w.c, w.novel, (r) => r.createRelation(w.kael, w.mira, 'rivals'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(FilterChip, 'Family'), findsNothing);
    final viewer = tester.widget<InteractiveViewer>(find.byType(InteractiveViewer));
    final fitted = viewer.transformationController!.value.clone();
    expect(fitted.isIdentity(), isFalse, reason: 'centred in the box');
    viewer.transformationController!.value = Matrix4.identity();
    await tester.ensureVisible(find.byTooltip('Fit to view'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Fit to view'));
    await tester.pumpAndSettle();
    expect(viewer.transformationController!.value, fitted);
    await tester.ensureVisible(find.text('Filters'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Filters'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.widgetWithText(FilterChip, 'Family'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilterChip, 'Family'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Hide filters'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Hide filters'));
    await tester.pumpAndSettle();
    expect(find.text('Filters (some on)'), findsOneWidget);
  });

  testWidgets('relationship pages and the map work on a phone at 200% text size', (tester) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final w = await setUpPair(tester, size: phone);
    final rel = relateIn(w.c, w.novel, (r) => r.createRelation(w.kael, w.mira, 'mentor-student'));
    relateIn(w.c, w.novel, (r) => r.trackAttribute('trust'));
    for (final location in [
      '/organize/relationship/${rel.id}',
      '/organize/relationships/settings',
      '/organize/character/${w.kael}?tab=relationships',
      '/visualize',
    ]) {
      w.c.read(routerProvider).go(location);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull, reason: location);
    }
  });
}
