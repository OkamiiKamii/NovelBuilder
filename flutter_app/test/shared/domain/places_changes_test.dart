// The original app's place and travel services (src/modules/places/places.test.ts, src/modules/travel/travel.test.ts)
// ported: levels, what is inside what, maps and pins, journeys and travel methods, and the connections they make.
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/codex/codex_changes.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/model/entity_ref.dart';
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:novel_builder/shared/domain/places/explore.dart';
import 'package:novel_builder/shared/domain/places/place_changes.dart';
import 'package:novel_builder/shared/domain/records/event.dart';
import 'package:novel_builder/shared/domain/relationships/relation_changes.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';
import 'package:novel_builder/shared/domain/travel/routes.dart';
import 'package:novel_builder/shared/domain/travel/travel.dart';

class World {
  NovelSnapshot snapshot = NovelSnapshot(project: {'id': 'novel', 'title': 'Travels'}, collections: const {});
  int clock = 1000;
  int _ids = 0;

  T places<T>(T Function(PlaceChanges c) change) {
    final c = PlaceChanges(snapshot, now: ++clock, createId: () => 'id${++_ids}');
    final result = change(c);
    snapshot = c.snapshot;
    return result;
  }

  T codex<T>(T Function(RelationChanges c) change) {
    final c = RelationChanges(snapshot, now: ++clock, createId: () => 'id${++_ids}');
    final result = change(c);
    snapshot = c.snapshot;
    return result;
  }

  StoryModel get model => StoryModel.fromSnapshot(snapshot);

  String place(String name) => codex((c) => c.createEntry('location', name)).id;
  String person(String name) => codex((c) => c.createEntry('character', name)).id;
  String chapter(String id) {
    snapshot = snapshot.putRow('chapters', {
      'id': id,
      'projectId': 'novel',
      'parentId': null,
      'kind': 'chapter',
      'title': id,
      'order': snapshot.rows('chapters').length,
      'createdAt': 0,
    });
    return id;
  }
}

JsonMap day(int month, int d, [int year = 10]) => {
  'kind': 'date',
  'when': {'precision': 'exact', 'year': year, 'month': month, 'day': d, 'hour': null, 'minute': null},
};

void main() {
  group('levels of place', () {
    test('named, renamed and ordered by the author; a level in use is never dropped', () {
      final w = World();
      final settings = w.places((c) => c.applyPreset('today'));
      expect(settings.levels.map((l) => l.name), [
        'Country',
        'State or province',
        'City',
        'Neighbourhood',
        'Building',
        'Room',
      ]);
      final city = settings.levels[2];
      final paris = w.place('Paris');
      w.places((c) => c.setLevel(paris, city.id));
      expect(
        () => w.places(
          (c) => c.setLevels([
            for (final l in settings.levels)
              if (l.id != city.id) (id: l.id, name: l.name),
          ]),
        ),
        throwsA(isA<ChangeRefused>().having((e) => e.message, 'message', contains('1 place is a City'))),
      );
      // Adding a preset again adds only what is missing, after what is there.
      final more = w.places((c) => c.applyPreset('world'));
      expect(more.levels.take(6).map((l) => l.name), settings.levels.map((l) => l.name));
      expect(more.levels.skip(6).map((l) => l.name), ['World', 'Continent', 'Kingdom', 'Region', 'District']);
      expect(() => w.places((c) => c.setLevel(paris, 'nope')), throwsA(isA<ChangeRefused>()));
    });
  });

  group('what is inside what', () {
    test('a place cannot go inside itself or inside what is inside it; an ended connection stays as history', () {
      final w = World();
      final france = w.place('France');
      final paris = w.place('Paris');
      final louvre = w.place('Louvre');
      w.places((c) => c.setParent(paris, france));
      w.places((c) => c.setParent(louvre, paris));
      expect(() => w.places((c) => c.setParent(france, louvre)), throwsA(isA<ChangeRefused>()));
      expect(() => w.places((c) => c.setParent(paris, paris)), throwsA(isA<ChangeRefused>()));
      final mira = w.person('Mira');
      expect(() => w.places((c) => c.setParent(mira, paris)), throwsA(isA<ChangeRefused>()));
      final tree = placeTree(w.model);
      expect([for (final r in tree) '${'  ' * r.depth}${r.entry.name}'], ['France', '  Paris', '    Louvre']);
      // Moving the Louvre to the top removes its current "Located in", not one that has ended.
      final ended = w.codex(
        (c) => c.createConnection(
          from: EntityRef(EntityType.entry, louvre),
          to: EntityRef(EntityType.entry, france),
          type: 'located-in',
          startsAt: day(1, 1),
        ),
      );
      w.codex((c) => c.endConnection(ended.id, day(2, 1)));
      w.places((c) => c.setParent(louvre, null));
      final links = w.snapshot.rows('loreLinks').where((l) => l['fromId'] == louvre && l['type'] == 'located-in');
      expect([for (final l in links) l['id']], [ended.id]);
      expect(placeTree(w.model).firstWhere((r) => r.entry.id == louvre).depth, 0);
    });
  });

  group('maps', () {
    test('coordinates must be numbers; outside the edges is allowed and said; a map removed takes only its pins', () {
      final w = World();
      final paris = w.place('Paris');
      final lyon = w.place('Lyon');
      final map = w.places((c) => c.saveMap(null, name: 'France', width: 100, height: 80, unit: 'km'));
      expect([map.width, map.height, map.grid, map.unit], [100, 80, 10, 'km']);
      expect(() => w.places((c) => c.saveMap(null, name: '  ')), throwsA(isA<ChangeRefused>()));
      expect(() => w.places((c) => c.pin(map.id, paris, double.nan, 1)), throwsA(isA<ChangeRefused>()));
      w.places((c) => c.pin(map.id, paris, 10, 10));
      w.places((c) => c.pin(map.id, paris, 120, 10));
      expect(w.snapshot.rows('mapPins').length, 1, reason: 'one pin a place on a map, moved');
      final on = mapPlaces(
        placeTree(w.model, pins: w.places((c) => c.pins())),
        w.places((c) => c.maps().single),
        w.places((c) => c.pins()),
      );
      expect([for (final p in on.pinned) (p.entry.name, p.outside)], [('Paris', true)]);
      expect([for (final e in on.missing) e.name], ['Lyon']);
      expect(() => w.places((c) => c.setImage(map.id, 'https://example.com/x.png')), throwsA(isA<ChangeRefused>()));
      w.places((c) => c.setImage(map.id, 'data:image/png;base64,AAAA'));
      w.places((c) => c.removeMap(map.id));
      expect([w.snapshot.rows('worldMaps'), w.snapshot.rows('mapPins')], [isEmpty, isEmpty]);
      expect(w.snapshot.rows('loreEntries').map((e) => e['name']), containsAll(['Paris', 'Lyon']));
      expect(lyon, isNotEmpty);
    });
  });

  group('journeys', () {
    test('only who travels is needed; a time "not known" is stored as none', () {
      final w = World();
      final mira = w.person('Mira');
      final paris = w.place('Paris');
      final lyon = w.place('Lyon');
      expect(
        () => w.places((c) => c.saveJourney(null, {'toId': lyon})),
        throwsA(isA<ChangeRefused>().having((e) => e.message, 'm', 'Say who travels.')),
      );
      expect(
        () => w.places(
          (c) => c.saveJourney(null, {
            'travellerIds': [mira],
            'toId': mira,
          }),
        ),
        throwsA(isA<ChangeRefused>()),
      );
      expect(
        () => w.places(
          (c) => c.saveJourney(null, {
            'travellerIds': [paris],
          }),
        ),
        throwsA(isA<ChangeRefused>()),
      );
      final j = w.places(
        (c) => c.saveJourney(null, {
          'travellerIds': [mira],
          'departure': {
            'kind': 'date',
            'when': {'precision': 'unknown'},
          },
        }),
      );
      expect(
        [j.raw['departure'], j.fromId, j.toId, journeyRecord(w.model, j, null).words],
        [null, null, null, 'Mira: somewhere not recorded to somewhere not recorded'],
      );
    });

    test('a journey cannot come after itself; removing one keeps the order of the rest', () {
      final w = World();
      final mira = w.person('Mira');
      final a = w.places(
        (c) => c.saveJourney(null, {
          'travellerIds': [mira],
        }),
      );
      final b = w.places(
        (c) => c.saveJourney(null, {
          'travellerIds': [mira],
          'afterId': a.id,
        }),
      );
      final c = w.places(
        (x) => x.saveJourney(null, {
          'travellerIds': [mira],
          'afterId': b.id,
        }),
      );
      expect(() => w.places((x) => x.saveJourney(a.id, {'afterId': c.id})), throwsA(isA<ChangeRefused>()));
      w.places((x) => x.removeJourney(b.id));
      expect(w.places((x) => x.journeys()).firstWhere((j) => j.id == c.id).afterId, a.id);
    });

    test('no speed is assumed; a method in use cannot be removed; with a speed, a journey too fast is flagged', () {
      final w = World();
      final mira = w.person('Mira');
      final paris = w.place('Paris');
      final lyon = w.place('Lyon');
      final methods = w.places(
        (c) => c.setMethods(const [TravelMethod(id: '', name: 'By horse', distanceUnit: 'leagues')]),
      );
      final horse = methods.methods.single;
      expect(horse.speed, isNull);
      final j = w.places(
        (c) => c.saveJourney(null, {
          'travellerIds': [mira],
          'fromId': paris,
          'toId': lyon,
          'departure': day(1, 1),
          'arrival': day(1, 2),
          'methodId': horse.id,
          'distance': 100,
          'distanceUnit': 'leagues',
        }),
      );
      List<String> problems() => [
        for (final p in travelProblems(w.model, w.places((c) => c.journeys()), w.places((c) => c.travelSettings())))
          p.kind,
      ];
      expect(problems(), isEmpty);
      w.places(
        (c) => c.setMethods([
          TravelMethod(id: horse.id, name: 'By horse', speed: 30, distanceUnit: 'leagues', per: TimeUnit.days),
        ]),
      );
      expect(problems(), ['too-fast']);
      expect(() => w.places((c) => c.setMethods(const [])), throwsA(isA<ChangeRefused>()));
      expect(j.methodId, horse.id);
    });

    test('a connection can start at a date, with how it began; a date that is not one is refused', () {
      final w = World();
      final mira = w.person('Mira');
      final sword = w.codex((c) => c.createEntry('item', 'Sword')).id;
      final link = w.codex(
        (c) => c.createConnection(
          from: EntityRef(EntityType.entry, mira),
          to: EntityRef(EntityType.entry, sword),
          type: 'owns',
          startsAt: day(3, 1),
          how: 'found',
        ),
      );
      expect([link.validity?.from?.raw, link.how], [day(3, 1), 'found']);
      expect(
        () => w.codex(
          (c) => c.createConnection(
            from: EntityRef(EntityType.entry, mira),
            to: EntityRef(EntityType.entry, sword),
            type: 'owns',
            startsAt: const {
              'kind': 'date',
              'when': {'precision': 'someday'},
            },
          ),
        ),
        throwsA(isA<ChangeRefused>()),
      );
      final orrin = w.person('Orrin');
      final next = w.codex((c) => c.changeConnection(link.id, day(5, 1), fromId: orrin, how: 'stolen'));
      final rows = {for (final l in w.snapshot.rows('loreLinks')) l['id']: l};
      expect(rows[next]!['how'], 'stolen');
      expect(mapOrNull(rows[link.id]!['validity'])!['until'], day(5, 1));
    });
  });
}
