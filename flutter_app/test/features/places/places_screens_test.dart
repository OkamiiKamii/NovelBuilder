import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/places/places_providers.dart';
import 'package:novel_builder/features/visualize/visualize_providers.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/model/entity_ref.dart';
import 'package:novel_builder/shared/domain/travel/travel.dart';

import '../../helpers/pump_app.dart';

typedef World = ({
  ProviderContainer c,
  String novel,
  String mira,
  String orrin,
  String keep,
  String port,
  String guild,
  String sword,
});

Future<World> setUp(
  WidgetTester tester, {
  String location = '/visualize/places',
  Size size = const Size(1400, 2400),
}) async {
  final c = await pumpApp(tester, size: size, location: '/library');
  final novel = c.read(libraryServiceProvider).create({'title': 'World'}).id;
  final s = c.read(characterServiceProvider);
  final mira = s.change(novel, (x) => x.create(name: 'Mira')).id;
  final orrin = s.change(novel, (x) => x.create(name: 'Orrin')).id;
  final keep = s.change(novel, (x) => x.createEntry('location', 'Greykeep')).id;
  final port = s.change(novel, (x) => x.createEntry('location', 'Saltport')).id;
  final guild = s.change(novel, (x) => x.createEntry('faction', 'Thieves Guild')).id;
  final sword = s.change(novel, (x) => x.createEntry('item', 'Greysword')).id;
  c.read(openNovelProvider.notifier).open(novel);
  await tester.pumpAndSettle();
  c.read(routerProvider).go(location);
  await tester.pumpAndSettle();
  return (c: c, novel: novel, mira: mira, orrin: orrin, keep: keep, port: port, guild: guild, sword: sword);
}

List<JsonMap> rows(World w, String collection) => w.c.read(novelStoreProvider).rowsIn(w.novel, collection);

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
  testWidgets('levels of place start from a preset; a place gets its level and what it is inside', (tester) async {
    final w = await setUp(tester);
    await tapText(tester, 'Levels of place…');
    await tapText(tester, 'Start from “One world”');
    await tapText(tester, 'Done');
    expect(rows(w, 'placeSettings').single['levels'], hasLength(8));

    await tapText(tester, 'Saltport');
    await choose<String>(tester, 'Level of place', 'City');
    await choose<String>(tester, 'Located in', 'Greykeep');
    final port = rows(w, 'loreEntries').firstWhere((e) => e['id'] == w.port);
    expect(port['placeLevel'], isNotNull);
    final link = rows(w, 'loreLinks').single;
    expect([link['fromId'], link['toId'], link['type']], [w.port, w.keep, 'located-in']);
    expect(find.textContaining('City · no events here yet'), findsOneWidget);
  });

  testWidgets('a map is made, a place given coordinates, and the places not on it are listed', (tester) async {
    final w = await setUp(tester);
    await tapText(tester, 'Maps…');
    await tester.enterText(find.widgetWithText(TextField, 'New map name'), 'The Known World');
    await tester.pumpAndSettle();
    await tapText(tester, 'Make the map');
    await tapText(tester, 'Done');
    expect(rows(w, 'worldMaps').single['name'], 'The Known World');
    expect(find.text('Not on this map (2), still in the tree:'), findsOneWidget);

    await tapText(tester, 'Greykeep');
    await tester.enterText(find.widgetWithText(TextField, 'Across').last, '10');
    await tester.enterText(find.widgetWithText(TextField, 'Down').last, '20');
    await tester.pumpAndSettle();
    await tapText(tester, 'Place');
    final pin = rows(w, 'mapPins').single;
    expect([pin['entryId'], pin['x'], pin['y']], [w.keep, 10, 20]);
    expect(find.text('Not on this map (1), still in the tree:'), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp('Greykeep: 10 across, 20 down')), findsOneWidget);
  });

  testWidgets('a journey is recorded with who travels, from and to; a conflict is said, never fixed', (tester) async {
    final w = await setUp(tester, location: '/visualize/journeys');
    expect(find.text('No journeys yet'), findsOneWidget);
    await tapText(tester, 'Record a journey');
    await tapText(tester, 'Mira');
    await choose<String>(tester, 'From', 'Greykeep');
    await choose<String>(tester, 'To', 'Saltport');
    await tapText(tester, 'Save the journey');
    final j = rows(w, 'journeys').single;
    expect(
      [j['travellerIds'], j['fromId'], j['toId'], j['departure']],
      [
        [w.mira],
        w.keep,
        w.port,
        null,
      ],
    );
    expect(find.text('Mira: Greykeep to Saltport'), findsOneWidget);
    expect(find.text('None.'), findsOneWidget);

    // Arriving before leaving is said; the journey is kept as it is.
    final places = w.c.read(placesServiceProvider);
    JsonMap day(int m) => {
      'kind': 'date',
      'when': {'precision': 'exact', 'year': 10, 'month': m, 'day': 1, 'hour': null, 'minute': null},
    };
    places.change(w.novel, (x) => x.saveJourney(j['id'] as String, {'departure': day(3), 'arrival': day(2)}));
    await tester.pumpAndSettle();
    expect(find.textContaining('arrives (Year 10, February 1) before leaving (Year 10, March 1)'), findsOneWidget);
    expect(rows(w, 'journeys').single['arrival'], day(2));
  });

  testWidgets('travel methods are the author’s: none has a speed until given one', (tester) async {
    final w = await setUp(tester, location: '/visualize/journeys');
    await tapText(tester, 'Travel methods…');
    await tester.enterText(find.widgetWithText(TextField, 'New travel method'), 'By horse');
    await tester.pumpAndSettle();
    await tapText(tester, 'Add');
    final methods = TravelSettings(rows(w, 'travelSettings').single).methods;
    expect([methods.single.name, methods.single.speed], ['By horse', null]);
  });

  testWidgets('a tie is recorded for a faction, shown as it stands, and ended with how', (tester) async {
    final w = await setUp(tester, location: '/visualize/factions');
    await tapText(tester, 'Record a tie');
    await choose<String>(tester, 'Who or what', 'Mira');
    await choose<String>(tester, 'Tied to', 'Thieves Guild');
    await tester.enterText(find.widgetWithText(TextField, 'How it began'), 'joined');
    await tapText(tester, 'Record the tie');
    final link = rows(w, 'loreLinks').single;
    expect([link['fromId'], link['toId'], link['type'], link['how']], [w.mira, w.guild, 'member-of', 'joined']);
    expect(find.textContaining('Mira (no time given)'), findsOneWidget);

    await choose<String>(tester, 'Faction looked at', 'Thieves Guild');
    expect(find.text('How Thieves Guild changed'), findsOneWidget);
    await tapText(tester, 'End…');
    await choose<String>(tester, 'Ends', 'On a date');
    await tester.enterText(find.widgetWithText(TextField, 'Ends: year'), '12');
    await tester.enterText(find.widgetWithText(TextField, 'How it ends'), 'expelled');
    await tester.pumpAndSettle();
    await tapText(tester, 'End it');
    final ended = rows(w, 'loreLinks').single;
    expect(ended['endHow'], 'expelled');
    expect(mapOrNull(mapOrNull(ended['validity'])!['until'])!['kind'], 'date');
    expect(find.textContaining('until Year 12 (expelled)'), findsOneWidget);
  });

  testWidgets('an item passes from hand to hand, each holding kept as history, and is lost', (tester) async {
    final w = await setUp(tester, location: '/visualize/ownership');
    expect(find.textContaining('No owner recorded.'), findsOneWidget);
    await tapText(tester, 'Record what happens to it');
    await choose<String>(tester, 'What happens', 'Made (it passes to someone)');
    await choose<String>(tester, 'Who has it next', 'Mira');
    await tapText(tester, 'Record it');
    expect(rows(w, 'loreLinks').single['how'], 'made');
    expect(find.textContaining('Held by Mira.'), findsOneWidget);

    await tapText(tester, 'Record what happens to it');
    await choose<String>(tester, 'What happens', 'Stolen (it passes to someone)');
    await choose<String>(tester, 'Who has it next', 'Orrin');
    await tapText(tester, 'Record it');
    expect(rows(w, 'loreLinks'), hasLength(1), reason: 'it needs a point in the story to pass on, and says so');
    await choose<String>(tester, 'When', 'On a date');
    await tester.enterText(find.widgetWithText(TextField, 'When: year'), '11');
    await tester.pumpAndSettle();
    await tapText(tester, 'Record it');
    expect(rows(w, 'loreLinks'), hasLength(2));
    expect(find.textContaining('Held by Orrin.'), findsOneWidget);
    expect(find.text('until Year 11 (stolen by Orrin)'), findsOneWidget);
  });

  testWidgets('every new view works on a phone at 200% text size', (tester) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final w = await setUp(tester, size: phone);
    final s = w.c.read(characterServiceProvider);
    s.change(w.novel, (x) {
      x.createConnection(
        from: EntityRef(EntityType.entry, w.mira),
        to: EntityRef(EntityType.entry, w.guild),
        type: 'member-of',
      );
      x.createConnection(
        from: EntityRef(EntityType.entry, w.orrin),
        to: EntityRef(EntityType.entry, w.sword),
        type: 'owns',
      );
    });
    final p = w.c.read(placesServiceProvider);
    final map = p.change(w.novel, (x) => x.saveMap(null, name: 'World'));
    p.change(w.novel, (x) => x.pin(map.id, w.keep, 10, 10));
    p.change(w.novel, (x) => x.pin(map.id, w.port, 80, 70));
    p.change(
      w.novel,
      (x) => x.saveJourney(null, {
        'travellerIds': [w.mira],
        'fromId': w.keep,
        'toId': w.port,
      }),
    );
    w.c.read(vizStateProvider.notifier).select(EntityRef(EntityType.entry, w.keep));
    for (final location in [
      '/visualize/places',
      '/visualize/journeys',
      '/visualize/factions',
      '/visualize/ownership',
    ]) {
      w.c.read(routerProvider).go(location);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull, reason: location);
    }
  });
}
