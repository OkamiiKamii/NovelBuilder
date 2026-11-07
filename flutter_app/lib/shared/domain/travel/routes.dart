import 'dart:math' as math;

import '../collation.dart';
import '../json.dart';
import '../model/story_model.dart';
import '../model/validity.dart';
import '../places/explore.dart' show parentsOf;
import '../places/places.dart';
import '../progression/track.dart' show whenWords;
import '../records/event.dart';
import '../records/journey.dart';
import '../stable_sort.dart';
import '../systems/formula.dart' show jsRound, jsString;
import '../timeline/dates.dart' show formatDuration;
import '../timeline/event_record.dart';
import 'travel.dart';

/// ROUTES AND WHERE EVERYONE WAS (as in the original app)
/// Each journey read against the story: when it leaves and arrives, in story time (an event or a date) or reading
/// order (a chapter or scene), and how long it must take when the author has given a distance and a speed. Each
/// traveller's route, with the stays between journeys, the events they are at, and where they are recorded as located.
/// Possible conflicts are flagged by stated rules, and only when the records settle them: an approximate date counts
/// as all the time it may mean, story time is never compared with reading order, and no speed is assumed.

/// Where a point in the story falls: a stretch of story time ([lo] to [hi]), a place in the reading ([at]), or nowhere
/// it can be placed (no point at all).
class TravelPoint {
  const TravelPoint.story(double this.lo, double this.hi) : at = null;
  const TravelPoint.reading(int this.at) : lo = null, hi = null;
  final double? lo;
  final double? hi;
  final int? at;

  bool get isStory => lo != null;

  JsonMap toJson() => isStory ? {'axis': 'story', 'lo': lo, 'hi': hi} : {'axis': 'reading', 'at': at};
}

TravelPoint? pointOf(Anchor? anchor, StoryModel model) {
  final context = model.timeContext;
  return switch (anchor) {
    null => null,
    NodeAnchor(:final nodeId) => switch (model.order.position[nodeId]) {
      final at? => TravelPoint.reading(at),
      null => null,
    },
    EventAnchor(:final eventId) => switch (spanOfEvent(eventId, context)) {
      final s? => TravelPoint.story(s.lo, s.hi),
      null => null,
    },
    DateAnchor(when: final date) => switch (spanOfDate(date, context)) {
      final s? => TravelPoint.story(s.lo, s.hi),
      null => null,
    },
  };
}

TravelPoint? _story(TravelPoint? p) => p != null && p.isStory ? p : null;

/// A stretch of minutes in words: "3 days", "6 hours".
String minutesWords(double minutes, StoryModel model) {
  final day = model.calendar.durationMinutes(const EventDuration(1, TimeUnit.days));
  double round(double n) => jsRound(n * 10) / 10;
  if (minutes >= day) {
    final n = round(minutes / day);
    return '${jsString(n)} ${n == 1 ? 'day' : 'days'}';
  }
  if (minutes >= 60) {
    final n = round(minutes / 60);
    return '${jsString(n)} ${n == 1 ? 'hour' : 'hours'}';
  }
  final n = jsRound(minutes);
  return '${jsString(n)} ${n == 1 ? 'minute' : 'minutes'}';
}

class JourneyRecord {
  JourneyRecord({
    required this.journey,
    required this.travellers,
    required this.from,
    required this.to,
    required this.leaves,
    required this.arrives,
    required this.leavesWords,
    required this.arrivesWords,
    required this.method,
    required this.methodWords,
    required this.distance,
    required this.leastMinutes,
    required this.words,
  });
  final Journey journey;
  final String travellers;
  final String from;
  final String to;
  final TravelPoint? leaves;
  final TravelPoint? arrives;
  final String leavesWords;
  final String arrivesWords;
  final TravelMethod? method;
  final String methodWords;

  /// How far: the author's distance, or what a map gives between pinned places (in the map's unit).
  final ({double value, String unit, String from})? distance;

  /// The least time it can take, from the distance and the method's speed, in the same unit; null when the records
  /// do not give both.
  final double? leastMinutes;

  /// The journey in one line.
  final String words;
}

bool _same(String a, String b) => a.trim().toLowerCase() == b.trim().toLowerCase();

/// How far a journey is on a map with every place of it pinned: the legs from, through, to, in a straight line.
({double value, String unit})? _mapDistance(Journey journey, List<WorldMap> maps, List<MapPin> pins) {
  final stops = [journey.fromId, ...journey.via, journey.toId];
  if (stops.any((s) => s == null)) return null;
  for (final map in stableSorted(maps, (a, b) => localeCompare(a.name, b.name))) {
    final at = [for (final id in stops) pins.where((p) => p.mapId == map.id && p.entryId == id).firstOrNull];
    if (at.any((p) => p == null)) continue;
    var value = 0.0;
    for (var i = 1; i < at.length; i++) {
      final dx = at[i]!.x - at[i - 1]!.x;
      final dy = at[i]!.y - at[i - 1]!.y;
      value += math.sqrt(dx * dx + dy * dy);
    }
    return (value: jsRound(value * 100) / 100, unit: map.unit);
  }
  return null;
}

JourneyRecord journeyRecord(
  StoryModel model,
  Journey journey,
  TravelSettings? settings, [
  List<WorldMap> maps = const [],
  List<MapPin> pins = const [],
]) {
  String name(String? id) =>
      id == null ? 'somewhere not recorded' : (model.entries[id]?.name ?? 'a place that is gone');
  final who = [for (final id in journey.travellerIds) model.entries[id]?.name ?? 'someone deleted'];
  final method = journey.methodId == null ? null : settings?.methods.where((m) => m.id == journey.methodId).firstOrNull;
  final methodWords = method != null ? method.name : journey.method.trim();
  final d = journey.distance;
  final given = d != null
      ? (
          value: d,
          unit: journey.distanceUnit.isNotEmpty ? journey.distanceUnit : (method?.distanceUnit ?? ''),
          from: 'author',
        )
      : null;
  final fromMap = given == null ? _mapDistance(journey, maps, pins) : null;
  final distance = given ?? (fromMap == null ? null : (value: fromMap.value, unit: fromMap.unit, from: 'map'));
  // A least time only when the method has a speed in the very unit the distance is in: nothing is converted, nothing
  // assumed.
  final speed = method?.speed;
  final leastMinutes =
      speed != null &&
          speed > 0 &&
          distance != null &&
          distance.unit.isNotEmpty &&
          _same(distance.unit, method!.distanceUnit)
      ? (distance.value / speed) * model.calendar.durationMinutes(EventDuration(1, method.per))
      : null;
  final via = journey.via.isEmpty ? '' : ' by way of ${journey.via.map(name).join(', ')}';
  final travellers = who.isEmpty ? 'Nobody named' : who.join(' and ');
  return JourneyRecord(
    journey: journey,
    travellers: travellers,
    from: name(journey.fromId),
    to: name(journey.toId),
    leaves: pointOf(journey.departure, model),
    arrives: pointOf(journey.arrival, model),
    leavesWords: journey.departure != null ? whenWords(journey.departure, model) : 'when is not known',
    arrivesWords: journey.arrival != null ? whenWords(journey.arrival, model) : 'when is not known',
    method: method,
    methodWords: methodWords,
    distance: distance,
    leastMinutes: leastMinutes,
    words:
        '$travellers: ${name(journey.fromId)} to ${name(journey.toId)}$via${methodWords.isNotEmpty ? ', $methodWords' : ''}',
  );
}

// ---------------------------------------------------------------------------------------------------- a traveller's route

class RouteItem {
  RouteItem({
    required this.key,
    required this.kind,
    required this.title,
    required this.detail,
    required this.when,
    required this.placeIds,
    required this.order,
    this.journeyId,
  });
  final String key;

  /// journey, stay, event or located.
  final String kind;
  final String title;
  final String detail;
  final String when;
  final String? journeyId;
  final List<String> placeIds;
  final double order;

  RouteItem withOrder(double order, {String? when}) => RouteItem(
    key: key,
    kind: kind,
    title: title,
    detail: detail,
    when: when ?? this.when,
    placeIds: placeIds,
    order: order,
    journeyId: journeyId,
  );
}

class TravelRoute {
  TravelRoute(this.story, this.reading, this.unknown);

  /// In story time, by date.
  final List<RouteItem> story;

  /// As the reader meets them, by chapter.
  final List<RouteItem> reading;

  /// With no time that can be placed: journeys in the order the author gives ("after"), then the rest as recorded.
  final List<RouteItem> unknown;
}

int _byCreated(Journey a, Journey b) {
  final c = a.createdAt.compareTo(b.createdAt);
  return c != 0 ? c : localeCompare(a.id, b.id);
}

/// Journeys with no time, in the order the author gives: each after the one it says it comes after, when that is
/// among them.
List<Journey> _relativeOrder(List<Journey> journeys) {
  final left = stableSorted(journeys, _byCreated);
  final out = <Journey>[];
  final placed = <String>{};
  while (left.isNotEmpty) {
    final i = left.indexWhere(
      (j) => j.afterId == null || placed.contains(j.afterId) || !left.any((o) => o.id == j.afterId),
    );
    final next = left.removeAt(i < 0 ? 0 : i);
    out.add(next);
    placed.add(next.id);
  }
  return out;
}

bool _takesPart(TimelineEvent event, String id) =>
    event.characters.any((c) => c.id == id) || event.entryIds.contains(id);

/// Everywhere one traveller is recorded as being, and every journey they make, in order.
TravelRoute routeOf(
  StoryModel model,
  String travellerId,
  List<Journey> journeys,
  TravelSettings? settings, [
  List<WorldMap> maps = const [],
  List<MapPin> pins = const [],
]) {
  String name(String? id) =>
      id == null ? 'somewhere not recorded' : (model.entries[id]?.name ?? 'a place that is gone');
  final story = <RouteItem>[];
  final reading = <RouteItem>[];
  final unknown = <RouteItem>[];
  final mine = [
    for (final j in journeys)
      if (j.travellerIds.contains(travellerId)) journeyRecord(model, j, settings, maps, pins),
  ];
  RouteItem item(JourneyRecord r) {
    final j = r.journey;
    final d = r.distance;
    return RouteItem(
      key: 'journey:${j.id}',
      kind: 'journey',
      title: '${r.from} to ${r.to}${j.via.isEmpty ? '' : ' by way of ${j.via.map(name).join(', ')}'}',
      detail: [
        r.methodWords,
        if (j.duration case final duration?) 'takes ${formatDuration(duration)}' else '',
        if (d != null) '${jsString(d.value)} ${d.unit}${d.from == 'map' ? ' on the map' : ''}'.trim() else '',
        if (j.eventIds.isNotEmpty)
          'part of ${j.eventIds.map((id) => '“${model.events[id]?.name ?? 'a deleted event'}”').join(', ')}'
        else
          '',
      ].where((s) => s.isNotEmpty).join(' · '),
      when: 'leaves ${r.leavesWords}, arrives ${r.arrivesWords}',
      journeyId: j.id,
      placeIds: [
        for (final p in [j.fromId, ...j.via, j.toId])
          if (p != null && p.isNotEmpty) p,
      ],
      order: 0,
    );
  }

  final undated = <Journey>[];
  for (final r in mine) {
    final at = _story(r.leaves) ?? _story(r.arrives);
    if (at != null) {
      story.add(item(r).withOrder(at.lo!));
    } else if (r.leaves?.at != null || r.arrives?.at != null) {
      reading.add(item(r).withOrder((r.leaves?.at ?? r.arrives!.at!).toDouble()));
    } else {
      undated.add(r.journey);
    }
  }
  for (final (i, j) in _relativeOrder(undated).indexed) {
    final before = j.afterId == null ? null : journeys.where((o) => o.id == j.afterId).firstOrNull;
    unknown.add(
      item(mine.firstWhere((r) => r.journey.id == j.id)).withOrder(
        i.toDouble(),
        when: before != null ? 'when is not known; after the journey to ${name(before.toId)}' : 'when is not known',
      ),
    );
  }
  // Stays: from arriving somewhere to leaving again, between journeys dated in story time.
  final dated = stableSorted(
    mine.where((r) => _story(r.leaves) != null && _story(r.arrives) != null),
    (a, b) => _story(a.leaves)!.lo!.compareTo(_story(b.leaves)!.lo!),
  );
  for (var i = 0; i < dated.length - 1; i++) {
    final here = dated[i];
    final next = dated[i + 1];
    final toId = here.journey.toId;
    if (toId != null && _story(here.arrives)!.hi! <= _story(next.leaves)!.lo!) {
      story.add(
        RouteItem(
          key: 'stay:${here.journey.id}',
          kind: 'stay',
          title: 'At ${here.to}',
          detail: 'between journeys',
          when: 'from ${here.arrivesWords} until ${next.leavesWords}',
          placeIds: [toId],
          order: _story(here.arrives)!.lo! + 0.5,
        ),
      );
    }
  }
  // Events they are at, where the event has a place.
  for (final event in model.events.values) {
    final locationId = event.locationId;
    if (locationId == null || !_takesPart(event, travellerId)) continue;
    final span = spanOfEvent(event.id, model.timeContext);
    final it = RouteItem(
      key: 'event:${event.id}',
      kind: 'event',
      title: 'At ${name(locationId)}',
      detail: 'takes part in “${event.name}”',
      when: span != null ? (eventRecord(model, event.id)?.label ?? 'when is not known') : 'when is not known',
      placeIds: [locationId],
      order: span?.lo ?? 0,
    );
    (span != null ? story : unknown).add(it);
  }
  // Where they are recorded as located, by a "Located in" connection, from when it holds.
  for (final link in model.links) {
    if (link.type != 'located-in' || link.fromId != travellerId || model.entries[link.toId]?.category != 'location') {
      continue;
    }
    final from = link.validity?.from;
    final until = link.validity?.until;
    final p = pointOf(from, model);
    final it = RouteItem(
      key: 'located:${link.id}',
      kind: 'located',
      title: 'Located in ${name(link.toId)}',
      detail: until != null ? 'until ${whenWords(until, model)}' : 'still',
      when: from != null ? 'from ${whenWords(from, model)}' : 'from the start',
      placeIds: [link.toId],
      order: _story(p)?.lo ?? (p?.at?.toDouble() ?? double.negativeInfinity),
    );
    if (_story(p) != null) {
      story.add(it);
    } else if (p?.at != null) {
      reading.add(it);
    } else {
      unknown.add(it);
    }
  }
  List<RouteItem> sort(List<RouteItem> list) => stableSorted(list, (a, b) {
    final c = a.order.compareTo(b.order);
    return c != 0 ? c : localeCompare(a.title, b.title);
  });
  return TravelRoute(sort(story), sort(reading), unknown);
}

// ---------------------------------------------------------------------------------------------------- possible conflicts

const travelProblemKinds = [
  'backwards',
  'too-fast',
  'duration',
  'order',
  'two-journeys',
  'event-during',
  'two-places',
  'departure',
  'elsewhere',
];

class TravelProblem {
  TravelProblem(this.key, this.kind, this.severity, this.message, this.journeyIds);
  final String key;
  final String kind;

  /// A problem is the records contradicting each other; a note may well have an explanation the records do not give.
  final String severity;
  final String message;
  final List<String> journeyIds;

  JsonMap toJson() => {'key': key, 'kind': kind, 'severity': severity, 'message': message, 'journeyIds': journeyIds};
}

/// Possible conflicts, each from one rule, flagged only when the records settle it. Times are taken at their widest
/// (an approximate date is all the time it may mean), so a journey is "too fast" only if even the most generous
/// reading of its dates is too short. Nothing is flagged from a time that is not known, from a chapter against an
/// event, or from a speed the author has not set.
List<TravelProblem> travelProblems(
  StoryModel model,
  List<Journey> journeys,
  TravelSettings? settings, [
  List<WorldMap> maps = const [],
  List<MapPin> pins = const [],
]) {
  final out = <TravelProblem>[];
  final records = [for (final j in journeys) journeyRecord(model, j, settings, maps, pins)];
  final byId = {for (final r in records) r.journey.id: r};
  String span(double m) => minutesWords(m, model);
  final parent = parentsOf(model).parent;
  Set<String> around(String id) {
    final out = {id};
    var n = 0;
    for (var at = parent[id]; at != null && n < 1000; at = parent[at], n++) {
      out.add(at);
    }
    return out;
  }

  /// Two places one of which lies in the other (or the same place): being at one is being at the other.
  bool nested(String a, String b) => around(a).contains(b) || around(b).contains(a);
  String speedWords(JourneyRecord r) =>
      '${jsString(r.distance!.value)} ${r.distance!.unit} ${r.methodWords} at ${jsString(r.method!.speed!)} '
      '${r.method!.distanceUnit} ${perLabels[r.method!.per]}';
  double? said(Journey j) => j.duration == null ? null : model.calendar.durationMinutes(j.duration);

  for (final r in records) {
    final dep = _story(r.leaves);
    final arr = _story(r.arrives);
    final id = r.journey.id;
    final label = '${r.travellers}, ${r.from} to ${r.to}';
    final duration = said(r.journey);
    if (dep != null && arr != null) {
      if (arr.hi! < dep.lo!) {
        out.add(
          TravelProblem(
            'travel|backwards|$id',
            'backwards',
            'problem',
            '$label: arrives (${r.arrivesWords}) before leaving (${r.leavesWords}).',
            [id],
          ),
        );
      } else {
        // Spans count whole minutes, ends included: leaving at the first minute and arriving at the last allows the
        // most; the other way round, the least.
        final most = arr.hi! - dep.lo! + 1;
        final least = math.max(0.0, arr.lo! - dep.hi! - 1);
        if (r.leastMinutes != null && r.leastMinutes! > most) {
          out.add(
            TravelProblem(
              'travel|too-fast|$id',
              'too-fast',
              'problem',
              '$label: ${speedWords(r)} takes at least ${span(r.leastMinutes!)}, but leaving ${r.leavesWords} and '
                  'arriving ${r.arrivesWords} allows at most ${span(most)}.',
              [id],
            ),
          );
        }
        if (duration != null && duration > most) {
          out.add(
            TravelProblem(
              'travel|duration-long|$id',
              'duration',
              'problem',
              '$label: said to take ${formatDuration(r.journey.duration)}, but its dates allow at most ${span(most)}.',
              [id],
            ),
          );
        }
        if (duration != null && duration < least) {
          out.add(
            TravelProblem(
              'travel|duration-short|$id',
              'duration',
              'problem',
              '$label: said to take ${formatDuration(r.journey.duration)}, but its dates put at least ${span(least)} '
                  'between leaving and arriving.',
              [id],
            ),
          );
        }
      }
    }
    if (duration != null && r.leastMinutes != null && duration < r.leastMinutes!) {
      out.add(
        TravelProblem(
          'travel|duration-speed|$id',
          'too-fast',
          'problem',
          '$label: said to take ${formatDuration(r.journey.duration)}, but ${speedWords(r)} takes at least '
              '${span(r.leastMinutes!)}.',
          [id],
        ),
      );
    }
    final before = r.journey.afterId == null ? null : byId[r.journey.afterId];
    if (before != null && dep != null && _story(before.leaves) != null && dep.hi! < _story(before.leaves)!.lo!) {
      out.add(
        TravelProblem(
          'travel|order|$id',
          'order',
          'problem',
          '$label: said to come after the journey ${before.from} to ${before.to}, but it leaves (${r.leavesWords}) '
              'before that one does (${before.leavesWords}).',
          [id, before.journey.id],
        ),
      );
    }
  }

  // Per traveller: two journeys at once; an event elsewhere during a journey, or during a stay; leaving from somewhere
  // else than last arrived at.
  final travellers = {for (final j in journeys) ...j.travellerIds};
  for (final t in travellers) {
    final who = model.entries[t]?.name ?? 'Someone deleted';
    final theirs = stableSorted(
      records.where((r) => r.journey.travellerIds.contains(t) && _story(r.leaves) != null && _story(r.arrives) != null),
      (a, b) {
        final c = _story(a.leaves)!.lo!.compareTo(_story(b.leaves)!.lo!);
        return c != 0 ? c : localeCompare(a.journey.id, b.journey.id);
      },
    );
    for (var i = 0; i < theirs.length; i++) {
      for (var k = i + 1; k < theirs.length; k++) {
        final a = theirs[i];
        final b = theirs[k];
        if (_story(a.leaves)!.hi! < _story(b.arrives)!.lo! && _story(b.leaves)!.hi! < _story(a.arrives)!.lo!) {
          out.add(
            TravelProblem(
              'travel|two|$t|${a.journey.id}|${b.journey.id}',
              'two-journeys',
              'problem',
              '$who is on two journeys at once: ${a.from} to ${a.to} (${a.leavesWords} to ${a.arrivesWords}) and '
                  '${b.from} to ${b.to} (${b.leavesWords} to ${b.arrivesWords}).',
              [a.journey.id, b.journey.id],
            ),
          );
        }
      }
    }
    final events = [
      for (final e in model.events.values)
        if (e.locationId != null && _takesPart(e, t)) e,
    ];
    for (final r in theirs) {
      final stops = [
        for (final s in [r.journey.fromId, ...r.journey.via, r.journey.toId])
          if (s != null && s.isNotEmpty) s,
      ];
      for (final e in events) {
        final s = spanOfEvent(e.id, model.timeContext);
        if (s == null || r.journey.eventIds.contains(e.id) || stops.any((p) => nested(p, e.locationId!))) continue;
        if (s.lo > _story(r.leaves)!.hi! && s.hi < _story(r.arrives)!.lo!) {
          out.add(
            TravelProblem(
              'travel|event-during|$t|${r.journey.id}|${e.id}',
              'event-during',
              'problem',
              '$who takes part in “${e.name}” at ${model.entries[e.locationId]?.name} while on the journey ${r.from} '
                  'to ${r.to} (${r.leavesWords} to ${r.arrivesWords}).',
              [r.journey.id],
            ),
          );
        }
      }
    }
    for (var i = 0; i < theirs.length - 1; i++) {
      final here = theirs[i];
      final next = theirs[i + 1];
      final arrived = _story(here.arrives)!;
      final leaves = _story(next.leaves)!;
      final toId = here.journey.toId;
      if (toId == null || arrived.hi! > leaves.lo!) continue;
      final fromId = next.journey.fromId;
      if (fromId != null && !nested(fromId, toId)) {
        out.add(
          TravelProblem(
            'travel|departure|$t|${next.journey.id}',
            'departure',
            'note',
            '$who leaves from ${next.from} (${next.leavesWords}), but last arrived at ${here.to} (${here.arrivesWords}): '
                'a journey may be missing.',
            [here.journey.id, next.journey.id],
          ),
        );
      }
      for (final e in events) {
        final s = spanOfEvent(e.id, model.timeContext);
        if (s == null || nested(e.locationId!, toId)) continue;
        if (s.lo > arrived.hi! && s.hi < leaves.lo!) {
          out.add(
            TravelProblem(
              'travel|elsewhere|$t|${here.journey.id}|${e.id}',
              'elsewhere',
              'note',
              '$who takes part in “${e.name}” at ${model.entries[e.locationId]?.name}, while staying at ${here.to} '
                  'between journeys (${here.arrivesWords} to ${next.leavesWords}): a journey may be missing.',
              [here.journey.id, next.journey.id],
            ),
          );
        }
      }
    }
  }

  // Located in two places over the same time, by "Located in" connections that each hold for a while.
  final located = [
    for (final l in model.links)
      if (l.type == 'located-in' &&
          model.entries[l.fromId]?.category != 'location' &&
          model.entries[l.toId]?.category == 'location')
        l,
  ];
  for (var i = 0; i < located.length; i++) {
    for (var k = i + 1; k < located.length; k++) {
      final a = located[i];
      final b = located[k];
      if (a.fromId != b.fromId || nested(a.toId, b.toId)) continue;
      final both = overlaps(a.validity ?? Validity.always, b.validity ?? Validity.always, model.timeContext);
      if (both == Truth.yes && (a.validity != null || b.validity != null)) {
        // Named in alphabetical order, so the same records always read the same.
        final names = [model.entries[a.toId]?.name ?? '', model.entries[b.toId]?.name ?? '']..sort(localeCompare);
        final ids = [a.id, b.id]..sort();
        out.add(
          TravelProblem(
            'travel|two-places|${ids.join('|')}',
            'two-places',
            'note',
            '${model.entries[a.fromId]?.name ?? 'Someone'} is recorded as located in both ${names[0]} and ${names[1]} '
                'over the same time.',
            const [],
          ),
        );
      }
    }
  }
  return stableSorted(out, (a, b) {
    final c = travelProblemKinds.indexOf(a.kind).compareTo(travelProblemKinds.indexOf(b.kind));
    return c != 0 ? c : localeCompare(a.message, b.message);
  });
}

/// A journey with one reference taken out, and everything else kept: a traveller, place or event that is gone drops
/// out; a time at a deleted chapter or event becomes not known.
JsonMap withoutJourneyReference(Journey journey, String id) {
  bool gone(Anchor? a) => switch (a) {
    NodeAnchor(:final nodeId) => nodeId == id,
    EventAnchor(:final eventId) => eventId == id,
    DateAnchor(when: final date) => date is RelativeDate && date.anchorId == id,
    null => false,
  };
  final raw = journey.toJson();
  return {
    ...raw,
    'travellerIds': [
      for (final t in journey.travellerIds)
        if (t != id) t,
    ],
    'fromId': journey.fromId == id ? null : raw['fromId'],
    'toId': journey.toId == id ? null : raw['toId'],
    'via': [
      for (final v in journey.via)
        if (v != id) v,
    ],
    'eventIds': [
      for (final e in journey.eventIds)
        if (e != id) e,
    ],
    'departure': gone(journey.departure) ? null : raw['departure'],
    'arrival': gone(journey.arrival) ? null : raw['arrival'],
    'afterId': journey.afterId == id ? null : raw['afterId'],
  };
}
