// The timeline, ported: agreement with the original app on both real files and a generated chronicle, each in the
// standard calendar and in one of its own (tool/golden/timeline.test.ts).
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/characters/character_records.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:novel_builder/shared/domain/model/validity.dart';
import 'package:novel_builder/shared/domain/records/calendar.dart';
import 'package:novel_builder/shared/domain/records/event.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';
import 'package:novel_builder/shared/domain/timeline/ages.dart';
import 'package:novel_builder/shared/domain/timeline/axis.dart';
import 'package:novel_builder/shared/domain/timeline/chronology.dart';
import 'package:novel_builder/shared/domain/timeline/dates.dart';
import 'package:novel_builder/shared/domain/timeline/event_record.dart';
import 'package:novel_builder/shared/domain/timeline/histories.dart';
import 'package:novel_builder/shared/domain/timeline/life_history.dart';
import 'package:novel_builder/shared/domain/timeline/narrative.dart';
import 'package:novel_builder/shared/domain/timeline/overlap.dart';
import 'package:novel_builder/shared/domain/timeline/review.dart';
import 'package:novel_builder/shared/domain/timeline/scale.dart';
import 'package:novel_builder/shared/domain/timeline/tracks.dart';

import 'fixtures.dart';
import 'golden.dart';

/// Infinity has no JSON: the original's outputs write it as a word, and so does this.
Object? _plain(Object? v) => switch (v) {
  double() when v.isInfinite => v > 0 ? 'Infinity' : '-Infinity',
  Map() => {for (final e in v.entries) '${e.key}': _plain(e.value)},
  List() => [for (final x in v) _plain(x)],
  _ => v,
};

/// An event as the original's model hands it out: the stored row with its defaults filled in, as the Dart record's
/// getters read it.
JsonMap _asModelReads(JsonMap e) => {
  ...e,
  'characters': listOf(e['characters']),
  'entryIds': listOf(e['entryIds']),
  'nodeIds': listOf(e['nodeIds']),
  'afterId': e['afterId'],
  'locationId': e['locationId'],
  'end': e['end'],
  'ongoing': e['ongoing'] == true,
  'threadIds': listOf(e['threadIds']),
  'status': e['status'] ?? 'confirmed',
  'canon': e['canon'] ?? 'canon',
  'reveals': listOf(e['reveals']),
};

JsonMap? _span(Span? s) => s == null ? null : {'lo': s.lo, 'hi': s.hi};
JsonMap? _bounds(EventBounds? b) => b == null ? null : {'start': _span(b.start), 'end': _span(b.end), 'open': b.open};

JsonMap _age(AgeAt a) => switch (a) {
  StatedAge(:final age) => {'kind': 'stated', 'age': age},
  KnownAge(:final age) => {'kind': 'known', 'age': age},
  AgeRange(:final min, :final max) => {'kind': 'range', 'min': min, 'max': max},
  Unborn() => {'kind': 'unborn'},
  UnknownAge(:final reason) => {'kind': 'unknown', 'reason': reason},
};

const _shapes = {EventShape.instant: 'instant', EventShape.span: 'span', EventShape.ongoing: 'ongoing'};
const _together = {
  Together.sameTime: 'same-time',
  Together.during: 'during',
  Together.contains: 'contains',
  Together.overlaps: 'overlaps',
  Together.maybe: 'maybe',
};
const _differences = {
  Difference.same: 'same',
  Difference.changed: 'changed',
  Difference.moved: 'moved',
  Difference.onlyA: 'only-a',
  Difference.onlyB: 'only-b',
};

JsonMap _telling(StoryTelling t) => {
  'eventId': t.eventId,
  'nodeId': t.nodeId,
  'role': t.role.name,
  'storyRank': t.storyRank,
  'readingRank': t.readingRank,
  'back': t.back,
  'ahead': t.ahead,
};

const _custom = {
  'kind': 'custom',
  'name': 'The Reckoning',
  'months': [
    {'name': 'Thaw', 'days': 40},
    {'name': 'Bloom', 'days': 40},
    {'name': 'Swelter', 'days': 40},
    {'name': 'Harvest', 'days': 40},
    {'name': 'Fall', 'days': 40},
    {'name': 'Frost', 'days': 40},
    {'name': 'Deep', 'days': 40},
    {'name': 'Dark', 'days': 40},
    {'name': 'Wake', 'days': 40},
    {'name': 'Mud', 'days': 40},
  ],
  'hoursPerDay': 20,
  'daysPerWeek': 6,
  'eras': [
    {'name': 'First Age', 'startYear': 0},
    {'name': 'Second Age', 'startYear': 1000},
  ],
  'seasons': {'spring': 1, 'summer': 3, 'autumn': 6, 'winter': 8},
};

JsonMap _report(NovelSnapshot s) {
  final model = StoryModel.fromSnapshot(s);
  final cal = model.calendar;
  String? nameOf(String id) => model.events[id]?.name;
  final chronology = [
    for (final p in resolveChronology(model.events.values, cal))
      {
        'id': p.event.id,
        'value': p.value,
        'year': p.year,
        'anchored': p.anchored,
        'label': p.label,
        'issues': p.issues,
      },
  ];
  final records = eventRecords(model);
  final events = {
    for (final r in records)
      r.id: {
        'label': r.label,
        'shape': _shapes[r.shape],
        'precision': r.precision,
        'span': _span(r.span),
        'bounds': _bounds(r.bounds),
        'dateProblem': r.dateProblem,
        'told': [
          for (final t in r.told) {'nodeId': t.nodeId, 'role': t.role.name, 'position': t.position},
        ],
        'problems': validateEvent(model, r.event),
      },
  };
  final domain = domainOf(records, day: cal.minutesPerDay, year: cal.minutesPerYear);
  final axis = layoutAxis(records, domain: domain, useDomain: true, day: cal.minutesPerDay, year: cal.minutesPerYear);
  final windows = domain == null
      ? <TimeWindow>[]
      : [
          for (final share in [1, 0.2, 0.01, 0.0005, 0.00001, 0.0000002])
            (from: domain.from, to: domain.from + (domain.to - domain.from) * share),
        ];
  List<JsonMap> ticks(List<({double t, String label})> list) => [
    for (final t in list) {'t': t.t, 'label': t.label},
  ];
  final scales = [
    for (final w in windows)
      {
        'window': {'from': w.from, 'to': w.to},
        'scale': () {
          final s = chooseScale(w, 1200, cal);
          return {'unit': s.unit.name, 'step': s.step};
        }(),
        'ticks': ticks(ticksFor(w, 1200, cal)),
        'narrow': ticks(ticksFor(w, 320, cal)),
      },
  ];
  const typed = [
    '10', 'Year -500', '1020-5', '1020-5-4', '1020-13', '1020-5-45', 'June 1020', 'Thaw 1005', 'Second Age 4', //
    'Bloom Second Age 4', 'First Age 12', 'year of the comet', ' 1000 / 3 / 1 ',
  ];
  final readDates = {
    for (final t in typed)
      t: switch (readDate(t, cal)) {
        final r? => {'t': r.t, 'length': r.length},
        null => null,
      },
  };
  final sameTime = {
    for (final r in records)
      r.id: [
        for (final x in atTheSameTime(records, r.id, cal.minutesPerDay)) {'id': x.record.id, 'how': _together[x.how]},
      ],
  };
  final tracks = {
    for (final g in groupings(model))
      g.value: () {
        final list = tracksFor(model, records, Grouping.decode(g.value));
        final ids = [for (final t in list) t.id];
        final arranged = arrange(
          list,
          TrackPrefs(
            order: ids.reversed.take(2).toList(),
            hidden: ids.skip(1).take(1).toList(),
            folded: ids.take(1).toList(),
          ),
        );
        final focused = arrange(list, TrackPrefs(focus: ids.isEmpty ? null : ids.last));
        return {
          'label': g.label,
          'tracks': [
            for (final t in list) {'id': t.id, 'label': t.label, 'eventIds': t.eventIds},
          ],
          'arranged': {
            'shown': [
              for (final t in arranged.shown) [t.id, t.folded],
            ],
            'hidden': [for (final t in arranged.hidden) t.id],
          },
          'focused': [for (final t in focused.shown) t.id],
        };
      }(),
  };
  final orders = twoOrders(model);
  final characters = [
    for (final e in model.entries.values)
      if (e.category == 'character') e.id,
  ]..sort();
  final ages = {
    for (final id in characters)
      id: () {
        final a = agesOf(id, model.events, calendar: cal, birthDate: birthDateOf(model.entries[id]));
        return {
          'birth': {
            'span': _span(a.birth.span),
            'basis': a.birth.basis,
            'unread': a.birth.unread,
            'conflict': a.birth.conflict,
          },
          'at': {for (final e in a.at.entries) e.key: _age(e.value)},
          'issues': a.issues,
        };
      }(),
  };
  final placed = resolveChronology(model.events.values, cal);
  final lifePaths = {
    for (final id in characters)
      id: [
        for (final step in lifePath(placed, id, calendar: cal, birthDate: birthDateOf(model.entries[id])))
          {
            'id': step.placed.event.id,
            'label': step.label,
            'age': step.age,
            'stated': step.stated,
            'issue': step.issue,
          },
      ],
  };
  final snapshots = s.rows('progressSnapshots');
  final milestones = [for (final r in s.rows('characterHistory')) CharacterHistoryLine(r)];
  JsonMap item(HistoryItem i) => {
    'key': i.key,
    'kind': i.kind.name,
    'ref': i.ref?.toJson(),
    'to': i.to == null ? null : {'page': i.to!.page, 'id': i.to!.id},
    'title': i.title,
    'detail': i.detail,
    'when': i.when,
    'age': i.age == null ? null : _age(i.age!),
  };
  final lives = {
    for (final id in characters)
      id: () {
        final life = lifeHistory(model, id, snapshots: snapshots, milestones: milestones)!;
        return {
          'born': life.born,
          'story': [for (final i in life.story) item(i)],
          'reading': [for (final i in life.reading) item(i)],
          'throughout': [for (final i in life.throughout) item(i)],
          'issues': life.issues,
        };
      }(),
  };
  final review = [
    for (final f in reviewTimeline(model, s.rows('continuityRules'))) {...f.toJson(), 'severity': 'warning'},
  ];
  final histories = {for (final r in s.rows('alternateHistories')) str(r['id']): AlternateHistory(r)};
  final historyOut = {
    for (final h in histories.values)
      h.id: () {
        final events = historyEvents(model.events, histories, h.id);
        final diffs = compareTimelines(model.events, events, cal);
        return {
          // The main timeline's events come through the model; those a history adds are kept as written.
          'events': {
            for (final e in events.entries)
              e.key: model.events.containsKey(e.key) ? _asModelReads(e.value.raw) : e.value.raw,
          },
          'diffs': [
            for (final d in diffs)
              {
                'id': d.id,
                'difference': _differences[d.difference],
                'fields': d.fields,
                'whenA': d.whenA,
                'whenB': d.whenB,
                'direction': d.direction,
              },
          ],
          'summary': comparisonSummary(diffs, 'The main timeline', h.name),
          'origin': originWords(h, historyEvents(model.events, histories, h.baseId), histories, cal),
          'stale': staleChanges(model.events, histories, h),
        };
      }(),
  };
  final samples = <Object?>[
    {'precision': 'exact', 'year': 10, 'month': 2, 'day': 31, 'hour': 25, 'minute': 70},
    {'precision': 'exact', 'year': '12', 'month': '13', 'day': 3},
    {'precision': 'exact', 'year': 2.5, 'month': 2.5, 'day': 1.5, 'hour': 0.5},
    {'precision': 'exact', 'year': -2.5, 'month': 1, 'day': 40, 'hour': 19, 'minute': null},
    {'precision': 'approximate', 'year': 7, 'month': 0, 'season': 'winter'},
    {'precision': 'approximate', 'year': 7, 'month': 3, 'season': 'winter'},
    {'precision': 'approximate', 'year': null},
    {'precision': 'relative', 'anchorId': '', 'amount': -3, 'unit': 'fortnights', 'direction': 'sideways'},
    {'precision': 'relative', 'anchorId': 'x', 'amount': '2.5', 'unit': 'weeks', 'direction': 'after'},
    {'precision': 'nonsense'},
    null,
  ];
  final normalized = [for (final x in samples) normalizeDate(x, cal)];
  final formatted = [
    for (final d in [
      ...normalized,
      {'precision': 'exact', 'year': 1020, 'month': 5, 'day': 4, 'hour': 0, 'minute': 5},
      {'precision': 'exact', 'year': 1020, 'month': 5, 'day': 4, 'hour': 13, 'minute': null},
      {'precision': 'approximate', 'year': 1001, 'month': 2, 'season': null},
      {
        'precision': 'relative',
        'anchorId': records.firstOrNull?.id,
        'amount': 1.5,
        'unit': 'years',
        'direction': 'before',
      },
      {'precision': 'relative', 'anchorId': 'gone', 'amount': 1, 'unit': 'days', 'direction': 'after'},
    ])
      formatDate(EventDate.fromJson(d), nameOf, cal),
  ];
  return _plain({
        'calendar': describeCalendar(cal),
        'chronology': chronology,
        'events': events,
        'axis': {
          'marks': [
            for (final m in axis.marks)
              {
                'id': m.id,
                'title': m.title,
                'when': m.when,
                'kind': m.kind.name,
                'start': m.start,
                'end': m.end,
                'startFuzz': _span(m.startFuzz),
                'endFuzz': _span(m.endFuzz),
                'lane': m.lane,
                'x': m.x,
                'width': m.width,
              },
          ],
          'unplaced': [
            for (final u in axis.unplaced) {'id': u.id, 'title': u.title, 'reason': u.reason},
          ],
          'from': axis.from,
          'to': axis.to,
          'width': axis.width,
          'lanes': axis.lanes,
        },
        'scales': scales,
        'readDates': readDates,
        'sameTime': sameTime,
        'tracks': tracks,
        'orders': {
          'events': [
            for (final e in orders.events)
              {
                'id': e.id,
                'title': e.title,
                'when': e.when,
                'storyRank': e.storyRank,
                'tellings': [for (final t in e.tellings) _telling(t)],
              },
          ],
          'nodes': [
            for (final n in orders.nodes)
              {
                'id': n.id,
                'label': n.label,
                'readingRank': n.readingRank,
                'tellings': [for (final t in n.tellings) '${t.eventId}@${t.nodeId}'],
              },
          ],
          'tellings': [for (final t in orders.tellings) _telling(t)],
          'placed': orders.placed,
          'linear': orders.linear,
        },
        'notes': [
          for (final n in tellingNotes(orders, model))
            {'telling': '${n.telling.eventId}@${n.telling.nodeId}', 'note': n.note},
        ],
        'summary': orderSummary(orders),
        'ages': ages,
        'lifePaths': lifePaths,
        'lives': lives,
        'review': review,
        'histories': historyOut,
        'normalized': normalized,
        'formatted': formatted,
      })!
      as JsonMap;
}

NovelSnapshot _withCalendar(NovelSnapshot s) => s.withRows('storyCalendars', [
  {..._custom, 'id': 'cal', 'projectId': s.projectId, 'updatedAt': 0},
]);

void main() {
  final golden = readGolden('timeline.golden.json');
  final sources = {
    for (final name in fixtureNames) name: loadFixture(name),
    'chronicle': NovelSnapshot.fromJson(jsonDecode(File('test/fixtures/chronicle.novel.json').readAsStringSync())),
  };
  for (final MapEntry(key: name, value: snapshot) in sources.entries) {
    for (final (suffix, s) in [('', snapshot), ('+calendar', _withCalendar(snapshot))]) {
      group('$name$suffix agrees with the original', () {
        final expected = golden['$name$suffix']! as JsonMap;
        final actual = _report(s);
        for (final part in expected.keys) {
          test(part, () => expectJson(actual[part], expected[part], '$name$suffix.$part'));
        }
      });
    }
  }

  test('calendar settings are checked and cleaned as the original does', () {
    final inputs = <JsonMap>[
      _custom,
      {..._custom, 'kind': 'standard'},
      {
        ..._custom,
        'name': ' ',
        'months': [
          {'name': 'A', 'days': 0},
          {'name': 'a', 'days': 1.5},
        ],
        'hoursPerDay': 0,
        'daysPerWeek': 200,
        'eras': [
          {'name': '', 'startYear': 5},
          {'name': 'B', 'startYear': 5},
        ],
        'seasons': {'spring': 0, 'summer': 3, 'autumn': 1, 'winter': 1},
      },
      {'kind': 'standard', 'name': 'x', 'months': [], 'hoursPerDay': 0, 'daysPerWeek': 0, 'eras': [], 'seasons': {}},
    ];
    final actual = [
      for (final i in inputs)
        {
          'problems': calendarProblems(i),
          'cleaned': () {
            try {
              return cleanCalendar(i);
            } on Object {
              return null;
            }
          }(),
        },
    ];
    expectJson(actual, golden['calendars'], 'calendars');
  });
}
