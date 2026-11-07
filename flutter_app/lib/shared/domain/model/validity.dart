import 'dart:math' as math;

import 'package:flutter/foundation.dart';

import '../json.dart';
import '../records/calendar.dart';
import '../records/event.dart';

/// A point in the story, one of:
///
///  node   a chapter or scene: "from chapter 12 on", in READING order
///  event  a timeline event: "from the Siege on", in STORY time
///  date   a date in story time, as precise as the story is (exact, a month, a season, "around Year 10", relative, or
///         unknown)
///
/// Reading order and story time are different axes (a flashback is read late and happened early), so a point on one
/// is never compared with a point on the other: the answer is "unknown", not a guess.
@immutable
sealed class Anchor {
  const Anchor(this.raw);

  /// The anchor as stored, kept whole so nothing in it is lost.
  final JsonMap raw;

  static Anchor? fromJson(Object? json) {
    final m = mapOrNull(json);
    if (m == null) return null;
    final frozen = freezeMap(m);
    switch (m['kind']) {
      case 'node':
        final id = idOrNull(m['nodeId']);
        return id == null ? null : NodeAnchor._(id, frozen);
      case 'event':
        final id = idOrNull(m['eventId']);
        return id == null ? null : EventAnchor._(id, frozen);
      case 'date':
        return DateAnchor._(EventDate.fromJson(m['when']), frozen);
    }
    return null;
  }

  factory Anchor.node(String nodeId) => NodeAnchor._(nodeId, freezeMap({'kind': 'node', 'nodeId': nodeId}));
  factory Anchor.event(String eventId) => EventAnchor._(eventId, freezeMap({'kind': 'event', 'eventId': eventId}));
  static Anchor date(JsonMap when) => DateAnchor._(EventDate.fromJson(when), freezeMap({'kind': 'date', 'when': when}));

  @override
  bool operator ==(Object other) => other is Anchor && jsonEquals(other.raw, raw);

  @override
  int get hashCode => raw.length;
}

final class NodeAnchor extends Anchor {
  const NodeAnchor._(this.nodeId, super.raw);
  final String nodeId;
}

final class EventAnchor extends Anchor {
  const EventAnchor._(this.eventId, super.raw);
  final String eventId;
}

final class DateAnchor extends Anchor {
  const DateAnchor._(this.when, super.raw);

  /// Null when the stored date cannot be read: it is then never placed.
  final EventDate? when;
}

/// When something holds: from a point (included) until another (not included). `from: null` holds from the start;
/// `until: null` still holds. An unknown date is different: the change happened, but when is not known.
@immutable
class Validity {
  const Validity(this.from, this.until);

  static const always = Validity(null, null);

  final Anchor? from;
  final Anchor? until;

  static Validity? fromJson(Object? json) {
    final m = mapOrNull(json);
    return m == null ? null : Validity(Anchor.fromJson(m['from']), Anchor.fromJson(m['until']));
  }
}

/// A three-way answer: only true or false when the recorded data settles it.
enum Truth {
  yes,
  no,
  unknown;

  static Truth of(bool value) => value ? yes : no;

  /// The JSON the original app used: true, false or "unknown".
  Object toJson() => switch (this) {
    yes => true,
    no => false,
    unknown => 'unknown',
  };
}

Truth _both(Truth a, Truth b) =>
    a == Truth.no || b == Truth.no ? Truth.no : (a == Truth.yes && b == Truth.yes ? Truth.yes : Truth.unknown);

/// What points are compared against: where nodes are in reading order, the events dates can lean on, and the calendar.
class TimeContext {
  TimeContext({required this.position, required this.events, Calendar? calendar})
    : calendar = calendar ?? Calendar.standardCalendar;

  final Map<String, int> position;
  final Map<String, TimelineEvent> events;
  final Calendar calendar;
}

/// How much story time a date covers: a day for a day, a year for "Year 10". Null when it cannot be placed.
Span? spanOfDate(EventDate? when, TimeContext context, [Set<String> trail = const {}]) {
  switch (when) {
    case ExactDate() || ApproximateDate():
      return context.calendar.spanOf(when!);
    case RelativeDate(:final anchorId, :final amount, :final unit, :final before):
      if (anchorId == null || trail.contains(anchorId)) return null;
      final anchor = spanOfEvent(anchorId, context, {...trail, anchorId});
      if (anchor == null) return null;
      final offset = amount * context.calendar.unitMinutes(unit) * (before ? -1 : 1);
      return Span(anchor.lo + offset, anchor.hi + offset);
    case UnknownDate() || null:
      return null;
  }
}

/// When an event begins and ends, each as the stretch it is known to fall in. [end] is null when there is no known
/// end; [open] says why: `ongoing` (still going on at the end of the story) or `unknown` (ends at a date not given).
@immutable
class EventBounds {
  const EventBounds(this.start, this.end, this.open);
  final Span start;
  final Span? end;
  final String? open;
}

EventBounds? boundsOfEvent(String eventId, TimeContext context, [Set<String>? trail]) {
  final path = trail ?? {eventId};
  final event = context.events[eventId];
  if (event == null) return null;
  final start = spanOfDate(event.when, context, path);
  if (start == null) return null;
  if (event.ongoing) return EventBounds(start, null, 'ongoing');
  if (event.raw['end'] != null) {
    final end = spanOfDate(event.end, context, path);
    if (end == null) return EventBounds(start, null, 'unknown');
    // An end before the start is a mistake for the author to see, not a reason to move the event.
    return EventBounds(start, end.hi >= start.lo ? end : start, null);
  }
  final calendar = context.calendar;
  final length = calendar.durationMinutes(event.duration);
  if (length <= 0) return EventBounds(start, start, null);
  // Known to the day or better, it starts with that day; known only to a longer stretch, it ends that long after.
  if (start.hi - start.lo < calendar.minutesPerDay) {
    final at = math.max(start.hi, start.lo + length - 1);
    return EventBounds(start, Span(at, at), null);
  }
  return EventBounds(start, Span(start.lo + length - 1, start.hi + length - 1), null);
}

/// From the earliest an event can start to the latest it can end. Still going on, or ending at an unknown time: no
/// known end ([Span.hi] is infinite), so nothing is ever definitely after it.
Span? spanOfEvent(String eventId, TimeContext context, [Set<String>? trail]) {
  final bounds = boundsOfEvent(eventId, context, trail ?? {eventId});
  if (bounds == null) return null;
  return Span(bounds.start.lo, bounds.open != null ? double.infinity : math.max(bounds.start.hi, bounds.end!.hi));
}

sealed class _Placed {}

class _Reading extends _Placed {
  _Reading(this.at);
  final int at;
}

class _Story extends _Placed {
  _Story(this.span);
  final Span span;
}

_Placed? _place(Anchor anchor, TimeContext context) {
  switch (anchor) {
    case NodeAnchor(:final nodeId):
      final at = context.position[nodeId];
      return at == null ? null : _Reading(at);
    case EventAnchor(:final eventId):
      final span = spanOfEvent(eventId, context);
      return span == null ? null : _Story(span);
    case DateAnchor(when: final date):
      final span = spanOfDate(date, context);
      return span == null ? null : _Story(span);
  }
}

Truth _atOrAfter(_Placed? point, _Placed? start) => switch ((point, start)) {
  (_Reading(at: final p), _Reading(at: final s)) => Truth.of(p >= s),
  (_Story(span: final p), _Story(span: final s)) => p.lo >= s.hi ? Truth.yes : (p.hi < s.lo ? Truth.no : Truth.unknown),
  _ => Truth.unknown,
};

Truth _before(_Placed? point, _Placed? end) => switch ((point, end)) {
  (_Reading(at: final p), _Reading(at: final e)) => Truth.of(p < e),
  (_Story(span: final p), _Story(span: final e)) => p.hi < e.lo ? Truth.yes : (p.lo >= e.hi ? Truth.no : Truth.unknown),
  _ => Truth.unknown,
};

/// Whether something with this validity holds at a point. Yes or no only when the data settles it: a missing date, a
/// date on the other axis, or a change inside the stretch the point covers all give unknown.
Truth validAt(Validity validity, Anchor at, TimeContext context) {
  final point = _place(at, context);
  final from = validity.from;
  final until = validity.until;
  final started = from == null ? Truth.yes : _atOrAfter(point, _place(from, context));
  final ongoing = until == null ? Truth.yes : _before(point, _place(until, context));
  return _both(started, ongoing);
}

/// Whether two validities share any moment. Touching ends (one stops where the other starts) do not overlap.
Truth overlaps(Validity a, Validity b, TimeContext context) {
  Truth endsBeforeStart(Validity x, Validity y) {
    final until = x.until;
    final from = y.from;
    if (until == null || from == null) return Truth.no;
    // One stops at the very point the other starts: a handover, whenever exactly it was.
    if (jsonEquals(until.raw, from.raw)) return Truth.yes;
    return switch ((_place(until, context), _place(from, context))) {
      (_Reading(at: final e), _Reading(at: final s)) => Truth.of(e <= s),
      (_Story(span: final e), _Story(span: final s)) =>
        e.hi <= s.lo ? Truth.yes : (e.lo > s.hi ? Truth.no : Truth.unknown),
      _ => Truth.unknown,
    };
  }

  final apart = [endsBeforeStart(a, b), endsBeforeStart(b, a)];
  if (apart.contains(Truth.yes)) return Truth.no;
  return apart.every((x) => x == Truth.no) ? Truth.yes : Truth.unknown;
}

/// States in the order they began: open starts, then story-time starts by date, then reading-order starts by
/// position, then starts that cannot be placed. Ties keep the recorded order. Nothing is dropped.
List<T> historyOf<T>(List<T> states, Validity Function(T) validity, TimeContext context) {
  (int, double) key(T state) {
    final from = validity(state).from;
    if (from == null) return (0, 0);
    return switch (_place(from, context)) {
      null => (3, 0),
      _Story(:final span) => (1, span.lo),
      _Reading(:final at) => (2, at.toDouble()),
    };
  }

  final keyed = [for (final (i, s) in states.indexed) (s, i, key(s))];
  keyed.sort((a, b) {
    final g = a.$3.$1.compareTo(b.$3.$1);
    if (g != 0) return g;
    final v = a.$3.$2.compareTo(b.$3.$2);
    return v != 0 ? v : a.$2.compareTo(b.$2);
  });
  return [for (final k in keyed) k.$1];
}

/// Of a history, the states that hold at a point, each with its answer; only definite "no"s are left out.
List<(T state, Truth holds)> statesAt<T>(
  List<T> states,
  Validity Function(T) validity,
  Anchor at,
  TimeContext context,
) => [
  for (final s in historyOf(states, validity, context))
    if (validAt(validity(s), at, context) case final holds when holds != Truth.no) (s, holds),
];

/// Every chapter, scene and event a validity points at, for checking they exist and for rewriting them in copies.
List<String> anchorIds(Validity? validity) {
  if (validity == null) return const [];
  return [
    for (final a in [validity.from, validity.until])
      ...switch (a) {
        NodeAnchor(:final nodeId) => [nodeId],
        EventAnchor(:final eventId) => [eventId],
        DateAnchor(when: RelativeDate(:final anchorId?)) => [anchorId],
        _ => const <String>[],
      },
  ];
}
