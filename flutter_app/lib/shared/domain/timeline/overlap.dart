import '../collation.dart';
import '../model/validity.dart';
import '../records/calendar.dart';
import '../stable_sort.dart';
import 'event_record.dart';

/// EVENTS THAT SHARE TIME. Stories are full of things happening at once, and none of it is a mistake, so nothing here
/// is a warning: it is how two events stand to each other in time, said as honestly as the dates allow.
enum Together {
  /// Two moments at the same time (to the day, or closer).
  sameTime('at the same time'),

  /// The other happens while this one is certainly going on.
  during('while this is going on'),

  /// This one happens while the other is certainly going on.
  contains('going on at the time'),

  /// Both are certainly going on at some moment.
  overlaps('overlaps with this'),

  /// They could share time, but the dates are too rough, or an end is not given, so it cannot be told.
  maybe('may be at the same time; the dates are too rough to tell');

  const Together(this.words);
  final String words;

  /// Certainly at the same time, one way or another.
  bool get certain => this != maybe;
}

bool _rough(Span s, double day) => s.hi - s.lo + 1 > day;
bool _meets(Span a, Span b) => a.lo <= b.hi && b.lo <= a.hi;
bool _inside(Span a, Span b) => a.lo >= b.lo && a.hi <= b.hi;
bool _isMoment(EventBounds b) => b.open == null && b.end != null && b.end!.lo == b.start.lo && b.end!.hi == b.start.hi;

/// Every moment the event could be going on: from the earliest start to the latest end, forever with no known end.
Span possibleTime(EventBounds b) =>
    Span(b.start.lo, b.open != null ? double.infinity : (b.start.hi > b.end!.hi ? b.start.hi : b.end!.hi));

/// The time it is certainly going on, or null when there is none to be sure of: from when it has certainly begun to
/// when it has certainly not yet ended. A moment known only to the month is certain at no moment.
Span? certainTime(EventBounds b, [double day = 1440]) {
  final lo = _rough(b.start, day) ? b.start.hi : b.start.lo;
  double hi;
  if (b.open == 'ongoing') {
    hi = double.infinity;
  } else if (b.open == 'unknown' || _isMoment(b)) {
    // It may end the moment it begins: only its start, and only when that is known to the day.
    if (_rough(b.start, day)) return null;
    hi = b.start.hi;
  } else {
    hi = _rough(b.end!, day) ? b.end!.lo : b.end!.hi;
  }
  return hi >= lo ? Span(lo, hi) : null;
}

/// How [other] stands to [event] in time, from [event]'s point of view; null when they cannot share any time.
Together? together(EventBounds event, EventBounds other, [double day = 1440]) {
  final pa = possibleTime(event);
  final pb = possibleTime(other);
  if (!_meets(pa, pb)) return null;
  final ca = certainTime(event, day);
  final cb = certainTime(other, day);
  if (ca != null && cb != null && _meets(ca, cb)) {
    if (_isMoment(event) && _isMoment(other)) return Together.sameTime;
    if (_inside(pb, ca)) return Together.during;
    if (_inside(pa, cb)) return Together.contains;
    return Together.overlaps;
  }
  // A rough moment can still be certainly within something long ("Summer of Year 10", during a war from 9 to 12).
  if (ca != null && _inside(pb, ca)) return Together.during;
  if (cb != null && _inside(pa, cb)) return Together.contains;
  return Together.maybe;
}

/// The events sharing time with one, each with how, in the order they begin: the certain ones first, then the maybes.
List<({EventRecord record, Together how})> atTheSameTime(
  List<EventRecord> records,
  String eventId, [
  double day = 1440,
]) {
  final me = records.where((r) => r.id == eventId).firstOrNull;
  if (me?.bounds == null) return [];
  final out = <({EventRecord record, Together how})>[];
  for (final record in records) {
    if (record.id == eventId || record.bounds == null) continue;
    final how = together(me!.bounds!, record.bounds!, day);
    if (how != null) out.add((record: record, how: how));
  }
  return stableSorted(out, (a, b) {
    final maybe = (a.how == Together.maybe ? 1 : 0) - (b.how == Together.maybe ? 1 : 0);
    if (maybe != 0) return maybe;
    final start = a.record.bounds!.start.lo.compareTo(b.record.bounds!.start.lo);
    return start != 0 ? start : localeCompare(a.record.title, b.record.title);
  });
}
