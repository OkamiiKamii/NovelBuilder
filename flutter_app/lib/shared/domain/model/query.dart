import 'dart:math' as math;

import '../collation.dart';
import '../json.dart';
import 'connections.dart';
import 'entity_ref.dart';
import 'story_model.dart';
import 'validity.dart';

/// WHAT A VIEW ASKS FOR. Every field narrows the result; fields combine with AND, values inside one field with OR
/// ("Mira or Orrin"). An absent or empty field narrows nothing. Shared by every list, timeline, map and graph, so
/// they all filter the same way.
class Filter {
  const Filter({
    this.types = const [],
    this.ids = const [],
    this.categories = const [],
    this.text,
    this.chaptersFrom,
    this.chaptersTo,
    this.timeFrom,
    this.timeUntil,
    this.characters = const [],
    this.locations = const [],
    this.factions = const [],
    this.threads = const [],
    this.canon = const [],
    this.status = const [],
    this.significance = const [],
  });

  final List<EntityType> types;
  final List<String> ids;

  /// Codex categories (`character`, `custom-…`). Only entries have one.
  final List<String> categories;

  /// Words in the record's name, any case.
  final String? text;

  /// Reading order, from one chapter or scene to another, both included. Either end may be open.
  final String? chaptersFrom;
  final String? chaptersTo;

  /// Story time, from one point (included) until another (not included). Either end may be open.
  final Anchor? timeFrom;
  final Anchor? timeUntil;

  /// The record is one of these, or has a recorded connection to one.
  final List<String> characters;
  final List<String> locations;
  final List<String> factions;
  final List<String> threads;
  final List<String> canon;
  final List<String> status;
  final List<String> significance;

  factory Filter.fromJson(JsonMap json) {
    final chapters = mapOrNull(json['chapters']);
    final time = mapOrNull(json['time']);
    return Filter(
      types: [for (final t in strings(json['types'])) ?entityTypeOf(t)],
      ids: strings(json['ids']),
      categories: strings(json['categories']),
      text: strOrNull(json['text']),
      chaptersFrom: idOrNull(chapters?['from']),
      chaptersTo: idOrNull(chapters?['to']),
      timeFrom: Anchor.fromJson(time?['from']),
      timeUntil: Anchor.fromJson(time?['until']),
      characters: strings(json['characters']),
      locations: strings(json['locations']),
      factions: strings(json['factions']),
      threads: strings(json['threads']),
      canon: strings(json['canon']),
      status: strings(json['status']),
      significance: strings(json['significance']),
    );
  }
}

/// Records a filter could not decide about, with the reason, never dropped without a word.
class Undecided {
  Undecided(this.filter, this.reason, this.refs);
  final String filter;
  final String reason;
  final List<EntityRef> refs;
}

class QueryResult {
  QueryResult(this.items, this.undecided, this.considered);

  /// Records that definitely match every filter: by type, then name, then id.
  final List<EntityView> items;

  /// Records no filter ruled out but at least one could not decide about, grouped by filter and reason.
  final List<Undecided> undecided;

  /// How many records were looked at: those of the asked-for types.
  final int considered;
}

final _neighbourhoods = Expando<Map<String, Set<String>>>();

Map<String, Set<String>> _neighboursOf(StoryModel model) {
  return _neighbourhoods[model] ??= () {
    final index = <String, Set<String>>{};
    void touch(String a, String b) => (index[a] ??= {}).add(b);
    for (final c in deriveConnections(model).connections) {
      touch(c.from.id, c.to.id);
      touch(c.to.id, c.from.id);
    }
    // A relationship, as a record, is connected to the two characters it joins.
    for (final r in model.relations.values) {
      for (final end in [r.fromId, r.toId]) {
        touch(r.id, end);
        touch(end, r.id);
      }
    }
    return index;
  }();
}

List<EntityRef> _universe(StoryModel model, List<EntityType> types) => [
  for (final type in types)
    for (final id in switch (type) {
      EntityType.node => model.nodes.keys,
      EntityType.entry => model.entries.keys,
      EntityType.event => model.events.keys,
      EntityType.thread => model.threads.keys,
      EntityType.relation => model.relations.keys,
      EntityType.ability => model.abilities.keys,
    })
      EntityRef(type, id),
];

/// Where a record sits in reading order: a node's own place; an event, entry or thread by the chapters it is told,
/// mentioned, present or developed in. Null for records with no place in reading order.
List<int>? _readingPlaces(StoryModel model, EntityRef ref) {
  List<int> at(Iterable<String> ids) => [for (final id in ids) ?model.order.position[id]];
  return switch (ref.type) {
    EntityType.node => at([ref.id]),
    EntityType.event => at(model.events[ref.id]!.nodeIds),
    EntityType.thread => at([for (final b in model.threads[ref.id]!.beats) ?b.nodeId]),
    EntityType.entry => at([
      for (final n in model.nodes.values)
        if (n.mentions.contains(ref.id)) n.id,
      for (final p in model.plans.values)
        if (p.entityIds.contains(ref.id)) p.id,
    ]),
    _ => null,
  };
}

/// When an event may start and end, in minutes. An approximate date is a range of possible moments, not a length;
/// its length (a duration, an end date, or none) is added on top.
({double startLo, double startHi, double endLo, double endHi})? _bounds(
  String eventId,
  StoryModel model,
  TimeContext context,
) {
  final event = model.events[eventId]!;
  final start = spanOfDate(event.when, context, {event.id});
  if (start == null) return null;
  const inf = double.infinity;
  if (event.ongoing) return (startLo: start.lo, startHi: start.hi, endLo: inf, endHi: inf);
  if (event.raw['end'] != null) {
    final end = spanOfDate(event.end, context, {event.id});
    return end == null
        ? (startLo: start.lo, startHi: start.hi, endLo: start.lo, endHi: inf)
        : (startLo: start.lo, startHi: start.hi, endLo: math.max(end.lo, start.lo), endHi: math.max(end.hi, start.hi));
  }
  final length = context.calendar.durationMinutes(event.duration);
  return (startLo: start.lo, startHi: start.hi, endLo: start.lo + length, endHi: start.hi + length);
}

/// Where a range given by a point begins. `(false, …)`: the point is a chapter, not story time.
(bool, double?) _edge(Anchor anchor, TimeContext context) => switch (anchor) {
  NodeAnchor() => (false, null),
  EventAnchor(:final eventId) => (true, spanOfEvent(eventId, context)?.lo),
  DateAnchor(when: final date) => (true, spanOfDate(date, context)?.lo),
};

/// true / false, or the reason it cannot tell.
Object _inRange(String eventId, StoryModel model, Anchor? fromAnchor, Anchor? untilAnchor, TimeContext context) {
  final (fromIsTime, fromAt) = fromAnchor == null ? (true, -double.infinity) : _edge(fromAnchor, context);
  final (untilIsTime, untilAt) = untilAnchor == null ? (true, double.infinity) : _edge(untilAnchor, context);
  if (!fromIsTime || !untilIsTime) return 'the range is given in chapters, not story time';
  if (fromAt == null) return 'the start of the range no date that can be worked out';
  if (untilAt == null) return 'the end of the range no date that can be worked out';
  final event = _bounds(eventId, model, context);
  if (event == null) return 'no date that can be worked out';
  // Every possible start begins before the range ends and runs into it.
  if (event.startHi < untilAt && event.endLo >= fromAt) return true;
  // No possible start reaches into the range.
  if (event.startLo >= untilAt || event.endHi < fromAt) return false;
  return 'date too broad to tell against the range';
}

int _compareRefs(EntityRef a, EntityRef b) =>
    a.type.index != b.type.index ? a.type.index.compareTo(b.type.index) : localeCompare(a.id, b.id);

/// The records that match a filter. Deterministic: the same model and filter give the same result in the same order.
/// A record the filter cannot decide about is reported in [QueryResult.undecided]; one that definitely does not match
/// is left out.
QueryResult select(StoryModel model, Filter filter) {
  final types = filter.types.isEmpty ? EntityType.values : filter.types;
  final refs = _universe(model, types);
  final context = model.timeContext;
  final near = _neighboursOf(model);
  bool linked(EntityRef ref, List<String> targets) =>
      targets.contains(ref.id) || targets.any((t) => near[ref.id]?.contains(t) ?? false);

  final tests = <(String, Object Function(EntityRef))>[];
  if (filter.ids.isNotEmpty) tests.add(('ids', (ref) => filter.ids.contains(ref.id)));
  if (filter.categories.isNotEmpty) {
    tests.add((
      'categories',
      (ref) => ref.type == EntityType.entry
          ? filter.categories.contains(model.entries[ref.id]!.category)
          : 'no codex category',
    ));
  }
  final words = filter.text?.trim().toLowerCase() ?? '';
  if (words.isNotEmpty) tests.add(('text', (ref) => model.resolve(ref)!.label.toLowerCase().contains(words)));
  if (filter.chaptersFrom != null || filter.chaptersTo != null) {
    final lo = filter.chaptersFrom == null ? -1 << 31 : model.order.position[filter.chaptersFrom];
    final hi = filter.chaptersTo == null ? 1 << 31 : model.order.position[filter.chaptersTo];
    tests.add((
      'chapters',
      (ref) {
        if (lo == null || hi == null) return 'the chapter range names a chapter that no longer exists';
        final places = _readingPlaces(model, ref);
        if (places == null) return 'no place in reading order';
        if (places.isEmpty) {
          return switch (ref.type) {
            EntityType.event => 'not told in any chapter',
            EntityType.thread => 'no development placed in a chapter',
            _ => 'not linked to any chapter',
          };
        }
        return places.any((p) => p >= lo && p <= hi);
      },
    ));
  }
  if (filter.timeFrom != null || filter.timeUntil != null) {
    tests.add((
      'time',
      (ref) => ref.type == EntityType.event
          ? _inRange(ref.id, model, filter.timeFrom, filter.timeUntil, context)
          : 'no place in story time (only events have one)',
    ));
  }
  for (final (key, wanted) in [
    ('characters', filter.characters),
    ('locations', filter.locations),
    ('factions', filter.factions),
    ('threads', filter.threads),
  ]) {
    if (wanted.isNotEmpty) tests.add((key, (ref) => linked(ref, wanted)));
  }
  if (filter.canon.isNotEmpty) {
    tests.add((
      'canon',
      (ref) => ref.type == EntityType.event
          ? filter.canon.contains(model.events[ref.id]!.canonKey)
          : 'no canon status of its own',
    ));
  }
  if (filter.status.isNotEmpty) {
    tests.add((
      'status',
      (ref) =>
          ref.type == EntityType.event ? filter.status.contains(model.events[ref.id]!.statusKey) : 'no event status',
    ));
  }
  if (filter.significance.isNotEmpty) {
    tests.add((
      'significance',
      (ref) => ref.type == EntityType.event
          ? filter.significance.contains(model.events[ref.id]!.importanceKey)
          : 'no significance',
    ));
  }

  final items = <EntityView>[];
  final undecided = <String, Undecided>{};
  for (final ref in refs) {
    final verdicts = [for (final (key, test) in tests) (key, test(ref))];
    if (verdicts.any((v) => v.$2 == false)) continue;
    final open = [
      for (final v in verdicts)
        if (v.$2 is String) (v.$1, v.$2 as String),
    ];
    if (open.isEmpty) {
      items.add(model.resolve(ref)!);
      continue;
    }
    for (final (key, reason) in open) {
      (undecided['$key|$reason'] ??= Undecided(key, reason, [])).refs.add(ref);
    }
  }
  items.sort((a, b) {
    if (a.ref.type != b.ref.type) return a.ref.type.index.compareTo(b.ref.type.index);
    final byLabel = localeCompare(a.label, b.label);
    return byLabel != 0 ? byLabel : localeCompare(a.ref.id, b.ref.id);
  });
  for (final group in undecided.values) {
    group.refs.sort(_compareRefs);
  }
  final groups = undecided.values.toList()
    ..sort((a, b) {
      final byFilter = localeCompare(a.filter, b.filter);
      return byFilter != 0 ? byFilter : localeCompare(a.reason, b.reason);
    });
  return QueryResult(items, groups, refs.length);
}

/// What a view asks of connections. Fields combine with AND, values within one with OR.
class ConnectionFilter {
  const ConnectionFilter({
    this.kinds = const [],
    this.types = const [],
    this.involving = const [],
    this.canon = const [],
    this.timeFrom,
    this.timeUntil,
  });

  final List<ConnectionKind> kinds;

  /// Stored connections' own kinds: `member-of`, `owns`, the author's words.
  final List<String> types;

  /// Connections with any of these records at either end.
  final List<String> involving;
  final List<String> canon;

  /// Connections that hold at some moment in this stretch of story time.
  final Anchor? timeFrom;
  final Anchor? timeUntil;

  factory ConnectionFilter.fromJson(JsonMap json) {
    final time = mapOrNull(json['time']);
    return ConnectionFilter(
      kinds: [for (final k in strings(json['kinds'])) ?ConnectionKind.of(k)],
      types: strings(json['types']),
      involving: strings(json['involving']),
      canon: strings(json['canon']),
      timeFrom: Anchor.fromJson(time?['from']),
      timeUntil: Anchor.fromJson(time?['until']),
    );
  }
}

/// The connections that match, and those the filter could not decide about, with the reason. Same order every time.
({List<Connection> items, List<({String reason, List<Connection> connections})> undecided}) selectConnections(
  StoryModel model,
  ConnectionFilter filter,
) {
  final context = model.timeContext;
  final range = filter.timeFrom != null || filter.timeUntil != null
      ? Validity(filter.timeFrom, filter.timeUntil)
      : null;
  final items = <Connection>[];
  final undecided = <String, List<Connection>>{};
  for (final c in deriveConnections(model).connections) {
    if (filter.kinds.isNotEmpty && !filter.kinds.contains(c.kind)) continue;
    if (filter.types.isNotEmpty && !filter.types.contains(c.type ?? '')) continue;
    if (filter.involving.isNotEmpty && !filter.involving.any((id) => c.from.id == id || c.to.id == id)) continue;
    final reasons = <String>[];
    if (filter.canon.isNotEmpty) {
      if (c.kind != ConnectionKind.link) {
        reasons.add('no canon status of its own');
      } else if (!filter.canon.contains(c.canon ?? 'canon')) {
        continue;
      }
    }
    if (range != null) {
      final holds = overlaps(c.validity ?? Validity.always, range, context);
      if (holds == Truth.no) continue;
      if (holds == Truth.unknown) reasons.add('when it holds cannot be compared with the range');
    }
    if (reasons.isEmpty) {
      items.add(c);
    } else {
      for (final r in reasons) {
        (undecided[r] ??= []).add(c);
      }
    }
  }
  int byId(Connection a, Connection b) => localeCompare(a.id, b.id);
  items.sort(byId);
  final groups = undecided.entries.toList()..sort((a, b) => localeCompare(a.key, b.key));
  return (items: items, undecided: [for (final g in groups) (reason: g.key, connections: g.value..sort(byId))]);
}
