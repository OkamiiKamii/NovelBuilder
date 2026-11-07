// Places, travel, factions and ownership, ported: agreement with the original app on the place tree, what a place is
// tied to, places on maps, journeys read against the story, routes, possible travel conflicts, faction ties at every
// point, the faction map, and who held each item (tool/golden/world.test.ts).
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/factions/ownership.dart';
import 'package:novel_builder/shared/domain/factions/ties.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:novel_builder/shared/domain/model/validity.dart';
import 'package:novel_builder/shared/domain/places/explore.dart';
import 'package:novel_builder/shared/domain/places/places.dart';
import 'package:novel_builder/shared/domain/records/journey.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';
import 'package:novel_builder/shared/domain/travel/routes.dart';
import 'package:novel_builder/shared/domain/travel/travel.dart';

import 'fixtures.dart';
import 'golden.dart';

/// A number as the golden writes it: non-finite ones as words.
Object? js(Object? v) => switch (v) {
  final double d when d.isNaN => 'NaN',
  final double d when d.isInfinite => d > 0 ? 'Infinity' : '-Infinity',
  _ => v,
};

JsonMap _item(RouteItem i) => {
  'key': i.key,
  'kind': i.kind,
  'title': i.title,
  'detail': i.detail,
  'when': i.when,
  'journeyId': ?i.journeyId,
  'placeIds': i.placeIds,
  'order': js(i.order),
};

JsonMap _report(NovelSnapshot s) {
  final model = StoryModel.fromSnapshot(s);
  final settingsRow = s.rows('placeSettings').firstOrNull;
  final settings = settingsRow == null ? null : PlaceSettings(settingsRow);
  final worldMaps = [for (final r in s.rows('worldMaps')) WorldMap(r)];
  final pins = [for (final r in s.rows('mapPins')) MapPin(r)];
  final travelRow = s.rows('travelSettings').firstOrNull;
  final travel = travelRow == null ? null : TravelSettings(travelRow);
  final journeys = [for (final r in s.rows('journeys')) Journey(r)];
  final tree = placeTree(model, settings: settings, pins: pins);
  final (:parent, :others) = parentsOf(model);
  final anchors = <(String, Anchor?)>[
    ('end', null),
    for (final id in model.nodes.keys) ('node:$id', Anchor.node(id)),
    for (final id in model.events.keys) ('event:$id', Anchor.event(id)),
    (
      'date:11',
      Anchor.date({'precision': 'exact', 'year': 11, 'month': null, 'day': null, 'hour': null, 'minute': null}),
    ),
  ];
  JsonMap tieOut(Tie t) => {
    'link': t.link.id,
    'role': t.role.name,
    'other': t.other.toJson(),
    'otherName': t.otherName,
    'words': t.words,
    'when': t.when,
    'timeless': t.timeless,
    'holds': t.holds.toJson(),
  };
  JsonMap record(Journey j) {
    final r = journeyRecord(model, j, travel, worldMaps, pins);
    return {
      'travellers': r.travellers,
      'from': r.from,
      'to': r.to,
      'leaves': r.leaves?.toJson(),
      'arrives': r.arrives?.toJson(),
      'leavesWords': r.leavesWords,
      'arrivesWords': r.arrivesWords,
      'method': r.method?.id,
      'methodWords': r.methodWords,
      'distance': r.distance == null
          ? null
          : {'value': r.distance!.value, 'unit': r.distance!.unit, 'from': r.distance!.from},
      'leastMinutes': r.leastMinutes,
      'words': r.words,
    };
  }

  final travellers = {for (final j in journeys) ...j.travellerIds}.toList()..sort();
  final factions = factionsOf(model);
  final items = ownedItems(model);
  List<JsonMap> tied(List<Tied> list) => [
    for (final x in list) {'id': x.entry.id, 'how': x.how},
  ];
  return {
    'parents': {'parent': parent, 'others': others},
    'tree': [
      for (final r in tree)
        {
          'id': r.entry.id,
          'depth': r.depth,
          'parentId': r.parentId,
          'childIds': r.childIds,
          'level': r.level?.id,
          'levelWords': r.levelWords,
          'events': r.events,
          'eventsWithin': r.eventsWithin,
          'characters': r.characters,
          'factions': r.factions,
          'chapters': r.chapters,
          'maps': r.maps,
          'notes': r.notes,
        },
    ],
    'within': {for (final r in tree) r.entry.id: placesWithin(tree, r.entry.id)},
    'links': {
      for (final r in tree)
        r.entry.id: () {
          final l = placeLinks(model, r.entry.id);
          return {
            'characters': tied(l.characters),
            'factions': tied(l.factions),
            'others': tied(l.others),
            'events': [for (final e in l.events) e.id],
            'chapters': [
              for (final x in l.chapters) {'id': x.node.id, 'how': x.how},
            ],
          };
        }(),
    },
    'maps': {
      for (final m in worldMaps)
        m.id: () {
          final on = mapPlaces(tree, m, pins);
          return {
            'pinned': [
              for (final p in on.pinned) {'id': p.entry.id, 'pin': p.pin.id, 'outside': p.outside},
            ],
            'missing': [for (final e in on.missing) e.id],
          };
        }(),
    },
    'journeys': {for (final j in journeys) j.id: record(j)},
    'noSettings': {for (final j in journeys) j.id: journeyRecord(model, j, null).words},
    'routes': {
      for (final t in travellers)
        t: () {
          final r = routeOf(model, t, journeys, travel, worldMaps, pins);
          return {
            'story': [for (final i in r.story) _item(i)],
            'reading': [for (final i in r.reading) _item(i)],
            'unknown': [for (final i in r.unknown) _item(i)],
          };
        }(),
    },
    'problems': [for (final p in travelProblems(model, journeys, travel, worldMaps, pins)) p.toJson()],
    'minutes': [
      for (final m in [0, 1, 59, 60, 61, 90, 1439, 1440, 2160, 10000, 525600]) minutesWords(m.toDouble(), model),
    ],
    'without': [
      for (final j in journeys.take(8))
        for (final id in ['keep', 'mira', 'e1', 'n1', 'j3', 'north']) withoutJourneyReference(j, id),
    ],
    'factions': [for (final f in factions) f.id],
    'ties': {
      for (final f in factions)
        f.id: {
          for (final (k, a) in anchors) k: [for (final t in factionTies(model, f.id, a)) tieOut(t)],
        },
    },
    'factionAt': {
      for (final f in factions)
        f.id: {
          for (final (k, a) in anchors)
            k: () {
              final x = factionAt(model, f.id, a);
              return {
                'byRole': {
                  for (final MapEntry(key: role, value: ties) in x.byRole.entries)
                    role.name: [for (final t in ties) t.link.id],
                },
                'notNow': x.notNow,
              };
            }(),
        },
    },
    'network': {
      for (final (k, a) in anchors)
        k: () {
          final n = factionNetwork(model, a);
          return {
            'factions': [for (final f in n.factions) f.id],
            'edges': [
              for (final e in n.edges) {'link': e.link.id, 'role': e.role.name, 'holds': e.holds.toJson()},
            ],
            'territories': [for (final t in n.territories) t.id],
          };
        }(),
    },
    'held': [for (final l in model.links.take(40)) whenHeld(l, model)],
    'items': [for (final i in items) i.id],
    'ownership': {
      for (final i in items)
        i.id: {
          for (final (k, a) in anchors)
            k: () {
              final o = ownershipOf(model, i.id, a)!;
              return {
                'makers': [
                  for (final m in o.makers) {'name': m.name, 'when': m.when},
                ],
                'holdings': [
                  for (final h in o.holdings)
                    {
                      'link': h.link.id,
                      'holderId': h.holderId,
                      'holderName': h.holderName,
                      'how': h.how,
                      'began': h.began,
                      'ended': h.ended,
                      'endHow': h.endHow,
                      'timeless': h.timeless,
                      'inThisTimeline': h.inThisTimeline,
                    },
                ],
                'unknown': o.unknown,
                'now': {'state': o.now.state, 'holders': o.now.holders, 'words': o.now.words},
              };
            }(),
        },
    },
  };
}

void main() {
  final golden = readGolden('world.golden.json');
  final sources = {for (final name in fixtureNames) name: loadFixture(name), 'world': loadFixture('world')};
  for (final MapEntry(key: name, value: snapshot) in sources.entries) {
    group('$name agrees with the original', () {
      final expected = golden[name]! as JsonMap;
      final actual = _report(snapshot);
      for (final part in expected.keys) {
        test(part, () => expectJson(actual[part], expected[part], '$name.$part'));
      }
    });
  }
}
