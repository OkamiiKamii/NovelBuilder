import 'dart:convert';

import '../collation.dart';
import '../json.dart';
import '../json_record.dart';
import '../model/story_model.dart';
import '../records/branch.dart';
import '../records/calendar.dart';
import '../records/event.dart';
import '../stable_sort.dart';
import 'chronology.dart';
import 'dates.dart';

/// ALTERNATE HISTORIES. Another course of events for the same novel: an alternate history, a what-if, a changed
/// future, a time-travel branch. A history is never a copy of the timeline. It holds only what is different from the
/// timeline it branches from (its base: the main timeline or another history):
///  - `changed`: base events that go differently, with only the fields that differ;
///  - `removed`: base events that do not happen in it;
///  - `added`: events that happen only in it, kept inside the history, never in the main timeline's records.
/// Every other event is the base's own record, read through, so a change to it in the base shows in the history too.
///
/// The main timeline is the novel's canon and is never touched by a history.
enum HistoryKind {
  alternate('Alternate history'),
  hypothetical('What if'),
  changedFuture('Changed future', key: 'changed-future'),
  timeTravel('Time-travel branch', key: 'time-travel');

  const HistoryKind(this.label, {String? key}) : _key = key;
  final String label;
  final String? _key;
  String get key => _key ?? name;

  static HistoryKind? of(Object? value) => values.where((k) => k.key == value).firstOrNull;
}

/// A history's canon status: the words the story branches use, without "Main Canon", which only the main timeline is.
const historyStatuses = [
  BranchStatus.alternate,
  BranchStatus.nonCanon,
  BranchStatus.experimental,
  BranchStatus.abandoned,
];

BranchStatus? historyStatusOf(Object? value) => historyStatuses.where((s) => s.key == value).firstOrNull;

const mainTimeline = 'The main timeline';

/// The fields of an event a history can have differently, and how each is said.
const changeableFields = {
  'name': 'name',
  'description': 'description',
  'when': 'date',
  'end': 'end',
  'duration': 'length',
  'ongoing': 'still going on',
  'importance': 'importance',
  'locationId': 'place',
  'characters': 'who takes part',
  'entryIds': 'what is involved',
  'afterId': 'what it follows',
};

class AlternateHistory extends JsonRecord {
  AlternateHistory(super.raw);

  String get name => str(raw['name']);

  /// What it branches from: null for the main timeline, or another history's id.
  String? get baseId => idOrNull(raw['baseId']);
  HistoryKind get kind => HistoryKind.of(raw['kind']) ?? HistoryKind.hypothetical;
  BranchStatus get status => historyStatusOf(raw['status']) ?? BranchStatus.experimental;

  /// Where it departs from its base: from this event on. Null: across the whole timeline.
  String? get originEventId => idOrNull(raw['originEventId']);

  /// For a time-travel branch: the event that causes it, often later in story time than where it lands.
  String? get causeEventId => idOrNull(raw['causeEventId']);
  String get note => str(raw['note']);

  /// Base events that go differently here, by id: only the fields that differ.
  Map<String, JsonMap> get changed => {
    for (final e in (mapOrNull(raw['changed']) ?? const {}).entries) e.key: ?mapOrNull(e.value),
  };

  /// Base events that do not happen here.
  List<String> get removed => strings(raw['removed']);

  /// Events that happen only here.
  List<TimelineEvent> get added => [for (final e in maps(raw['added'])) TimelineEvent(e)];
  num get createdAt => numOrNull(raw['createdAt']) ?? 0;
}

/// A history and every history it is based on, nearest first; stops at a loop or a missing base.
List<AlternateHistory> lineage(Map<String, AlternateHistory> histories, String id) {
  final chain = <AlternateHistory>[];
  for (String? at = id; at != null && histories.containsKey(at) && !chain.any((h) => h.id == at);) {
    chain.add(histories[at]!);
    at = histories[at]!.baseId;
  }
  return chain;
}

/// The events of a history: its base's events, with its own differences. A change to an event its base no longer has
/// is left out (and reported by [staleChanges]). The base's records are read, never altered.
Map<String, TimelineEvent> historyEvents(
  Map<String, TimelineEvent> main,
  Map<String, AlternateHistory> histories,
  String? id,
) {
  final events = {...main};
  if (id == null) return events;
  for (final history in lineage(histories, id).reversed) {
    for (final eventId in history.removed) {
      events.remove(eventId);
    }
    for (final MapEntry(key: eventId, value: change) in history.changed.entries) {
      final event = events[eventId];
      if (event != null) events[eventId] = event.withFields(change);
    }
    for (final event in history.added) {
      events[event.id] = event;
    }
  }
  return events;
}

/// The story model as a history has it: everything else in the novel is the same records.
StoryModel withHistory(StoryModel model, Map<String, AlternateHistory> histories, String? id) =>
    id == null ? model : model.withEvents(historyEvents(model.events, histories, id));

/// Changes and removals in a history that point at events its base no longer has.
List<String> staleChanges(
  Map<String, TimelineEvent> main,
  Map<String, AlternateHistory> histories,
  AlternateHistory history,
) {
  final base = historyEvents(main, histories, history.baseId);
  return [
    for (final id in {...history.changed.keys, ...history.removed})
      if (!base.containsKey(id)) id,
  ];
}

enum Difference { same, changed, moved, onlyA, onlyB }

class EventDifference {
  EventDifference({
    required this.id,
    required this.difference,
    required this.fields,
    required this.a,
    required this.b,
    required this.whenA,
    required this.whenB,
    required this.direction,
  });

  final String id;
  final Difference difference;

  /// The fields that differ, in words ("date", "place"), for a changed event.
  final List<String> fields;
  final TimelineEvent? a;
  final TimelineEvent? b;
  final String? whenA;
  final String? whenB;

  /// For a moved event: `earlier` or `later` in B than in A.
  final String? direction;
}

/// A field as compared: rows written before a field existed lack it, and read as its default.
Object? fieldValue(JsonMap event, String field) => field == 'ongoing' ? event['ongoing'] == true : event[field];

String _canonical(Object? value) => jsonEncode(_sortKeys(value));
Object? _sortKeys(Object? value) => switch (value) {
  Map() => {for (final k in value.keys.map((k) => '$k').toList()..sort()) k: _sortKeys(value[k])},
  List() => [for (final v in value) _sortKeys(v)],
  _ => value,
};

bool _same(TimelineEvent a, TimelineEvent b, String field) =>
    _canonical(fieldValue(a.raw, field)) == _canonical(fieldValue(b.raw, field));

/// Two timelines side by side, event by event: the same, changed (and which fields), moved (unchanged itself, but its
/// date depends on one that changed), or found in only one of them. Reads only: comparing changes and merges nothing.
List<EventDifference> compareTimelines(
  Map<String, TimelineEvent> a,
  Map<String, TimelineEvent> b, [
  Calendar? calendar,
]) {
  final c = calendar ?? Calendar.standardCalendar;
  final placedA = {for (final (i, p) in resolveChronology(a.values, c).indexed) p.event.id: (p: p, i: i)};
  final placedB = {for (final (i, p) in resolveChronology(b.values, c).indexed) p.event.id: (p: p, i: i)};
  final ids = {...a.keys, ...b.keys};
  final out = <(EventDifference, double)>[];
  for (final id in ids) {
    final ea = a[id];
    final eb = b[id];
    final pa = placedA[id];
    final pb = placedB[id];
    final whenA = ea == null ? null : formatDate(ea.when, (x) => a[x]?.name, c);
    final whenB = eb == null ? null : formatDate(eb.when, (x) => b[x]?.name, c);
    // In the first timeline's story time; what only the second has, by its own date there.
    final order = pa?.p.value ?? pb?.p.value ?? double.infinity;
    if (ea == null || eb == null) {
      out.add((
        EventDifference(
          id: id,
          difference: ea != null ? Difference.onlyA : Difference.onlyB,
          fields: const [],
          a: ea,
          b: eb,
          whenA: whenA,
          whenB: whenB,
          direction: null,
        ),
        order,
      ));
      continue;
    }
    final fields = [
      for (final f in changeableFields.keys)
        if (!_same(ea, eb, f)) changeableFields[f]!,
    ];
    if (fields.isNotEmpty) {
      out.add((
        EventDifference(
          id: id,
          difference: Difference.changed,
          fields: fields,
          a: ea,
          b: eb,
          whenA: whenA,
          whenB: whenB,
          direction: null,
        ),
        order,
      ));
      continue;
    }
    final va = pa?.p.value;
    final vb = pb?.p.value;
    if (va != vb) {
      out.add((
        EventDifference(
          id: id,
          difference: Difference.moved,
          fields: const [],
          a: ea,
          b: eb,
          whenA: pa?.p.label ?? whenA,
          whenB: pb?.p.label ?? whenB,
          direction: va == null || vb == null ? null : (vb < va ? 'earlier' : 'later'),
        ),
        order,
      ));
      continue;
    }
    out.add((
      EventDifference(
        id: id,
        difference: Difference.same,
        fields: const [],
        a: ea,
        b: eb,
        whenA: whenA,
        whenB: whenB,
        direction: null,
      ),
      order,
    ));
  }
  double index(EventDifference d) => (placedA[d.id]?.i ?? placedB[d.id]?.i)?.toDouble() ?? double.infinity;
  return [
    for (final (d, _) in stableSorted(out, (x, y) {
      final byOrder = x.$2.compareTo(y.$2);
      if (byOrder != 0 && !(x.$2.isInfinite && y.$2.isInfinite)) return byOrder;
      final byIndex = index(x.$1).compareTo(index(y.$1));
      if (byIndex != 0 && !(index(x.$1).isInfinite && index(y.$1).isInfinite)) return byIndex;
      return localeCompare((x.$1.a ?? x.$1.b)!.name, (y.$1.a ?? y.$1.b)!.name);
    }))
      d,
  ];
}

/// A comparison in one sentence.
String comparisonSummary(List<EventDifference> diffs, String nameA, String nameB) {
  int count(Difference d) => diffs.where((x) => x.difference == d).length;
  final differ = diffs.where((d) => d.difference != Difference.same).length;
  if (differ == 0) return '$nameA and $nameB have the same events.';
  final parts = [
    if (count(Difference.changed) > 0) '${count(Difference.changed)} changed',
    if (count(Difference.moved) > 0) '${count(Difference.moved)} moved by a change they depend on',
    if (count(Difference.onlyB) > 0) '${count(Difference.onlyB)} only in $nameB',
    if (count(Difference.onlyA) > 0) '${count(Difference.onlyA)} only in $nameA',
  ];
  return '$differ ${differ == 1 ? 'event differs' : 'events differ'}: ${parts.join(', ')}.';
}

/// Where a history departs from its base, in words.
String originWords(
  AlternateHistory history,
  Map<String, TimelineEvent> base,
  Map<String, AlternateHistory> histories, [
  Calendar? calendar,
]) {
  final from = history.baseId != null
      ? '“${histories[history.baseId]?.name ?? 'a history since deleted'}”'
      : mainTimeline.toLowerCase();
  final origin = history.originEventId;
  final event = origin == null ? null : base[origin];
  final at = origin == null
      ? ', across the whole timeline'
      : event != null
      ? ' at “${event.name}” (${formatDate(event.when, (id) => base[id]?.name, calendar)})'
      : ' at an event since deleted';
  return 'Branches from $from$at.';
}
