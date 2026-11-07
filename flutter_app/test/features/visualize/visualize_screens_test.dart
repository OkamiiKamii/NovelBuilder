import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/timeline/timeline_providers.dart';
import 'package:novel_builder/features/visualize/visualize_providers.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/model/entity_ref.dart';

import '../../helpers/pump_app.dart';

const tall = Size(1400, 4000);

Future<({ProviderContainer c, String novel, String mira, String bren, String siege, String feast})> setUpNovel(
  WidgetTester tester, {
  Size size = tall,
  String location = '/visualize/timeline',
}) async {
  final c = await pumpApp(tester, size: size, location: location);
  final novel = c.read(libraryServiceProvider).create({'title': 'Ashfall'});
  final s = c.read(characterServiceProvider);
  final mira = s.change(novel.id, (x) => x.create(name: 'Mira')).id;
  final bren = s.change(novel.id, (x) => x.create(name: 'Bren')).id;
  final keep = s.change(novel.id, (x) => x.createEntry('location', 'The Keep')).id;
  final docks = s.change(novel.id, (x) => x.createEntry('location', 'The Docks')).id;
  s.change(
    novel.id,
    (x) => x.createConnection(
      from: EntityRef(EntityType.entry, docks),
      to: EntityRef(EntityType.entry, keep),
      type: 'located-in',
    ),
  );
  final (siege, feast) = c.read(timelineServiceProvider).change(novel.id, (x) {
    final siege = x.createEvent('The siege');
    x.updateEvent(
      siege,
      (_) => {
        'when': {'precision': 'exact', 'year': 10},
        'locationId': keep,
        'characters': [
          {'id': mira, 'age': 17},
        ],
      },
    );
    final feast = x.createEvent('The feast');
    x.updateEvent(
      feast,
      (_) => {
        'when': {'precision': 'exact', 'year': 12},
        'characters': [
          {'id': bren, 'age': null},
        ],
      },
    );
    return (siege, feast);
  });
  c.read(openNovelProvider.notifier).open(novel.id);
  await tester.pumpAndSettle();
  return (c: c, novel: novel.id, mira: mira, bren: bren, siege: siege, feast: feast);
}

Future<void> chooseInvolving(WidgetTester tester, String name) async {
  await tester.tap(find.widgetWithText(DropdownButtonFormField<String>, 'Involving character'));
  await tester.pumpAndSettle();
  await tester.tap(find.text(name).last);
  await tester.pumpAndSettle();
}

List<JsonMap> savedRows(ProviderContainer c, String novel) => c.read(novelStoreProvider).rowsIn(novel, 'savedViews');

/// Chooses a view from the View menu, as on every screen.
Future<void> pickView(WidgetTester tester, String label) async {
  await tester.tap(find.widgetWithText(DropdownButtonFormField<String>, 'View'));
  await tester.pumpAndSettle();
  await tester.tap(find.text(label).last);
  await tester.pumpAndSettle();
}

/// Whether the View menu offers a view: opened, looked at, closed.
Future<bool> isOffered(WidgetTester tester, String label) async {
  await tester.tap(find.widgetWithText(DropdownButtonFormField<String>, 'View'));
  await tester.pumpAndSettle();
  final menu = find.byWidgetPredicate((w) => w.runtimeType.toString().startsWith('_DropdownMenu<'));
  final found = find.descendant(of: menu, matching: find.text(label)).evaluate().isNotEmpty;
  await tester.sendKeyEvent(LogicalKeyboardKey.escape);
  await tester.pumpAndSettle();
  return found;
}

void main() {
  testWidgets('the filters are shared: set on the timeline, they narrow the next view too', (tester) async {
    final w = await setUpNovel(tester);
    expect(find.textContaining('Timeline of 2 dated events'), findsOneWidget);
    await chooseInvolving(tester, 'Mira');
    expect(find.textContaining('Timeline of 1 dated event'), findsOneWidget);
    expect(find.text('Clear filters (1)'), findsOneWidget);
    await pickView(tester, 'Story vs reading order');
    await tester.pumpAndSettle();
    expect(currentLocation(w.c), '/visualize/order');
    await tester.tap(find.text('List'));
    await tester.pumpAndSettle();
    expect(find.text('The siege'), findsOneWidget);
    expect(find.text('The feast'), findsNothing);
    await tester.tap(find.text('Clear filters (1)'));
    await tester.pumpAndSettle();
    expect(find.text('The feast'), findsOneWidget);
  });

  testWidgets('a saved view keeps the filters and the tracks, says when it changed, and is kept up to date', (
    tester,
  ) async {
    final w = await setUpNovel(tester);
    await chooseInvolving(tester, 'Mira');
    await tester.tap(find.widgetWithText(DropdownButtonFormField<String>, 'Tracks by'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Characters').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Saved views (0)'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save view as…'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).last, 'Mira’s war');
    await tester.tap(find.widgetWithText(FilledButton, 'Save'));
    await tester.pumpAndSettle();
    final row = savedRows(w.c, w.novel).single;
    expect([row['view'], row['name'], row['mode']], ['timeline', 'Mira’s war', 'visual']);
    expect(row['filter'], {
      'characters': [w.mira],
    });
    expect(mapOrNull(row['layout'])!['group'], 'category:character');
    expect(find.text('Saved view: Mira’s war'), findsOneWidget);

    // Back to the plain view, then the saved one again: everything it kept comes back.
    await tester.tap(find.text('Saved view: Mira’s war'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Close the saved view'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Timeline of 2 dated events, in the order they happen.'), findsOneWidget);
    await tester.tap(find.text('Saved views (1)'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Mira’s war').last);
    await tester.pumpAndSettle();
    expect(find.textContaining('Timeline of 1 dated event, in the order they happen, on 1 track'), findsOneWidget);

    // A change shows “Save changes”, which keeps the name.
    await tester.tap(find.text('List'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(TextButton, 'Save changes to “Mira’s war”'));
    await tester.pumpAndSettle();
    expect([savedRows(w.c, w.novel).single['mode'], savedRows(w.c, w.novel).single['name']], ['list', 'Mira’s war']);
    expect(find.widgetWithText(TextButton, 'Save changes to “Mira’s war”'), findsNothing);
  });

  testWidgets('a saved view naming a record deleted since opens without it, and says so; the view is not changed', (
    tester,
  ) async {
    final w = await setUpNovel(tester);
    final id = w.c
        .read(visualizeServiceProvider)
        .change(
          w.novel,
          (x) => x.save('timeline', 'Bren', {
            'filter': {
              'characters': [w.bren],
            },
          }),
        );
    final kept = savedRows(w.c, w.novel).single;
    w.c.read(characterServiceProvider).delete(w.novel, w.bren, name: 'Bren');
    await tester.pumpAndSettle();
    await tester.tap(find.text('Saved views (1)'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Bren').last);
    await tester.pumpAndSettle();
    expect(find.text('1 record this saved view names no longer exists; it shows the rest.'), findsOneWidget);
    expect(find.textContaining('Timeline of 2 dated events'), findsOneWidget);
    expect(jsonEquals(savedRows(w.c, w.novel).single, kept), isTrue);
    expect(savedRows(w.c, w.novel).single['id'], id);
  });

  testWidgets('selecting a record shows its details in every view, and what it is connected to can be selected', (
    tester,
  ) async {
    final w = await setUpNovel(tester);
    await tester.tap(find.text('List'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('The siege'));
    await tester.pumpAndSettle();
    expect(find.text('When: Year 10'), findsOneWidget);
    expect(find.text('Who takes part'), findsOneWidget);
    expect(find.text('Mira · Age 17'), findsOneWidget);
    await pickView(tester, 'Places');
    await tester.pumpAndSettle();
    expect(find.text('When: Year 10'), findsOneWidget, reason: 'the selection is kept across views');
    expect(find.textContaining('Connected to the selection'), findsOneWidget, reason: 'The Keep, where it happens');
    await tester.tap(find.text('Mira · Age 17'));
    await tester.pumpAndSettle();
    expect(find.text('Kind: Character'), findsOneWidget);
    await tester.tap(find.text('Open character profile'));
    await tester.pumpAndSettle();
    expect(currentLocation(w.c), '/organize/character/${w.mira}');
  });

  testWidgets('a view turned off is hidden and says so; nothing is deleted, and turning it on brings it back', (
    tester,
  ) async {
    final w = await setUpNovel(tester, location: '/visualize/places');
    final before = w.c.read(novelStoreProvider).load(w.novel)!.collections;
    expect(find.text('The Docks'), findsOneWidget);
    expect(await isOffered(tester, 'Journeys'), isTrue, reason: 'offered while on');
    await tester.tap(find.byTooltip('Turn views on or off'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(SwitchListTile, 'Places'));
    await tester.pumpAndSettle();
    // As in the original: Journeys draws on the maps made in Places, so Places goes off only with it.
    expect(find.textContaining('Places stays on while Journeys is on'), findsOneWidget);
    await tester.tap(find.text('Turn off Journeys and Places'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Done'));
    await tester.pumpAndSettle();
    expect(find.text('This view is turned off in this novel'), findsOneWidget);
    expect(await isOffered(tester, 'Journeys'), isFalse, reason: 'not offered once off');
    expect(w.c.read(novelStoreProvider).load(w.novel)!.project['viewsOff'], ['journeys', 'places']);
    final after = w.c.read(novelStoreProvider).load(w.novel)!.collections;
    expect(jsonEquals(after, before), isTrue, reason: 'no record changes');
    await tester.tap(find.text('Turn this view on'));
    await tester.pumpAndSettle();
    expect(find.text('The Docks'), findsOneWidget);
    expect(w.c.read(novelStoreProvider).load(w.novel)!.project['viewsOff'], ['journeys']);
  });

  testWidgets('every view lists everything in words, drawn or not', (tester) async {
    final w = await setUpNovel(tester, location: '/visualize/places');
    expect(find.text('The Keep'), findsOneWidget);
    expect(find.textContaining('1 event here'), findsOneWidget);
    expect(find.textContaining('no events here yet'), findsOneWidget, reason: 'The Docks, inside the Keep');
    w.c.read(routerProvider).go('/visualize/graph');
    await tester.pumpAndSettle();
    expect(find.textContaining(RegExp(r'^Showing \d+ of \d+ records')), findsOneWidget, reason: 'drawn since Phase 13');
    w.c.read(routerProvider).go('/visualize/plot');
    await tester.pumpAndSettle();
    expect(find.text('No plot threads yet'), findsOneWidget);
    w.c.read(routerProvider).go('/visualize/progression');
    await tester.pumpAndSettle();
    expect(find.text('Nothing tracked yet'), findsOneWidget);
  });

  testWidgets('the drawings can be moved through from the keyboard', (tester) async {
    final w = await setUpNovel(tester);
    final viz = w.c.read(vizStateProvider.notifier);
    FocusNode drawing(String label) =>
        tester.widget<Focus>(find.byWidgetPredicate((x) => x is Focus && x.focusNode?.debugLabel == label)).focusNode!;
    viz.select(EntityRef(EntityType.event, w.siege));
    await tester.pumpAndSettle();
    drawing('timeline drawing').requestFocus();
    await tester.pumpAndSettle();
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowRight);
    await tester.pumpAndSettle();
    expect(w.c.read(vizStateProvider).selection, EntityRef(EntityType.event, w.feast), reason: 'the next in time');
    await tester.sendKeyEvent(LogicalKeyboardKey.home);
    await tester.pumpAndSettle();
    expect(w.c.read(vizStateProvider).selection, EntityRef(EntityType.event, w.siege));
    await tester.sendKeyEvent(LogicalKeyboardKey.escape);
    await tester.pumpAndSettle();
    expect(w.c.read(vizStateProvider).selection, isNull);

    w.c.read(characterServiceProvider).change(w.novel, (x) {
      x.createConnection(
        from: EntityRef(EntityType.entry, w.mira),
        to: EntityRef(EntityType.entry, w.bren),
        type: 'allied-with',
      );
    });
    w.c.read(routerProvider).go('/visualize');
    await tester.pumpAndSettle();
    drawing('relationship map').requestFocus();
    await tester.pumpAndSettle();
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowRight);
    await tester.pumpAndSettle();
    expect(w.c.read(vizStateProvider).selection, EntityRef(EntityType.entry, w.bren), reason: 'first by name');
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowRight);
    await tester.pumpAndSettle();
    expect(w.c.read(vizStateProvider).selection, EntityRef(EntityType.entry, w.mira));
  });

  testWidgets('on a phone the views are a menu, and the details of the selection open in a sheet', (tester) async {
    final w = await setUpNovel(tester, size: phone);
    await tester.tap(find.widgetWithText(DropdownButtonFormField<String>, 'View'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Places').last);
    await tester.pumpAndSettle();
    expect(currentLocation(w.c), '/visualize/places');
    await tester.tap(find.text('The Keep'));
    await tester.pumpAndSettle();
    expect(find.text('Selected: The Keep'), findsOneWidget);
    expect(find.text('Kind: Location'), findsNothing, reason: 'not at the bottom of the page');
    await tester.tap(find.text('Details'));
    await tester.pumpAndSettle();
    expect(find.text('Kind: Location'), findsOneWidget);
    expect(find.descendant(of: find.byType(BottomSheet), matching: find.text('Events here')), findsOneWidget);
  });

  testWidgets('every view works on a phone at 200% text size', (tester) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final w = await setUpNovel(tester, size: phone);
    w.c.read(vizStateProvider.notifier).select(EntityRef(EntityType.event, w.siege));
    for (final location in [
      '/visualize',
      '/visualize/timeline',
      '/visualize/order',
      '/visualize/history?who=${w.mira}',
      '/visualize/plot',
      '/visualize/graph',
      '/visualize/places',
      '/visualize/progression',
    ]) {
      w.c.read(routerProvider).go(location);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull, reason: location);
    }
  });
}
