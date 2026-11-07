import '../collation.dart';
import '../json.dart';
import '../records/calendar.dart';
import '../records/event.dart';
import '../stable_sort.dart';
import 'dates.dart';

/// An event placed in story time.
class Placed {
  Placed({
    required this.event,
    required this.value,
    required this.year,
    required this.anchored,
    required this.label,
    required this.issues,
  });

  final TimelineEvent event;

  /// Minutes from year 0, or null when the event has no date that can be worked out.
  final double? value;

  /// The year heading it falls under, or null when undated.
  final int? year;

  /// False only for an undated event that nothing ties into the order yet.
  final bool anchored;
  final String label;

  /// Continuity problems found for this event, in plain words.
  final List<String> issues;
}

int _stable(TimelineEvent a, TimelineEvent b) {
  final ca = numOrNull(a.raw['createdAt']);
  final cb = numOrNull(b.raw['createdAt']);
  // As the original: a missing creation time compares as no difference, so the id decides.
  final byTime = ca == null || cb == null ? 0 : ca.compareTo(cb);
  return byTime != 0 ? byTime : localeCompare(a.id, b.id);
}

/// Works out when every event happens and puts them in story order.
///
///  1. Exact and approximate dates give a value directly.
///  2. Relative dates take their anchor's value plus or minus the offset (chains are followed; a loop or a missing
///     anchor leaves it undated).
///  3. Dated events are sorted by value. Events at the same moment, and undated events, are placed by their "comes
///     after" link.
///  4. Anything left has no place in time yet and goes at the end.
///
/// Contradictions are reported, never silently fixed.
List<Placed> resolveChronology(Iterable<TimelineEvent> all, [Calendar? calendar]) {
  final c = calendar ?? Calendar.standardCalendar;
  final events = all.toList();
  final byId = {for (final e in events) e.id: e};
  final values = <String, double?>{};
  final issues = {for (final e in events) e.id: <String>[]};
  void note(String id, String text) => issues[id]!.add(text);

  double? valueOf(TimelineEvent event, Set<String> trail) {
    if (values.containsKey(event.id)) return values[event.id];
    final when = event.when;
    double? value;
    if (when is ExactDate || when is ApproximateDate) {
      // A date the calendar does not have is not placed, and says why; the stored date is left as it is.
      final problem = c.dateProblem(when!);
      if (problem != null) note(event.id, '$problem It is not placed in time until its date or the calendar changes.');
      value = c.spanOf(when)?.lo;
    } else if (when is RelativeDate) {
      final anchor = when.anchorId == null ? null : byId[when.anchorId];
      if (anchor == null) {
        note(event.id, 'Its date is relative to an event that no longer exists.');
      } else if (trail.contains(anchor.id) || anchor.id == event.id) {
        note(event.id, 'Its date depends on itself through a chain of relative dates.');
      } else {
        final base = valueOf(anchor, {...trail, event.id});
        if (base == null) {
          note(event.id, 'Its date is relative to “${anchor.name}”, which has no date yet.');
        } else {
          value = base + (when.before ? -1 : 1) * when.amount * c.unitMinutes(when.unit);
        }
      }
    }
    values[event.id] = value;
    return value;
  }

  for (final event in events) {
    valueOf(event, {});
  }

  final dated = stableSorted(events.where((e) => values[e.id] != null), (a, b) {
    final byValue = values[a.id]!.compareTo(values[b.id]!);
    return byValue != 0 ? byValue : _stable(a, b);
  });
  final order = [...dated];

  // Within a tie (same moment), honour "comes after".
  for (var pass = 0; pass < order.length; pass++) {
    var moved = false;
    for (var i = 0; i < order.length; i++) {
      final event = order[i];
      final after = event.afterId == null ? -1 : order.indexWhere((e) => e.id == event.afterId);
      if (after > i && values[order[after].id] == values[event.id]) {
        order.removeAt(i);
        order.insert(after, event);
        moved = true;
      }
    }
    if (!moved) break;
  }

  // Undated events take their place right after the event they follow.
  var waiting = stableSorted(events.where((e) => values[e.id] == null), _stable);
  for (var progress = true; progress && waiting.isNotEmpty;) {
    progress = false;
    for (final event in [...waiting]) {
      final at = event.afterId == null ? -1 : order.indexWhere((e) => e.id == event.afterId);
      if (at == -1) continue;
      var insert = at + 1;
      while (insert < order.length && values[order[insert].id] == null && order[insert].afterId == event.afterId) {
        insert++;
      }
      order.insert(insert, event);
      waiting = [
        for (final w in waiting)
          if (!identical(w, event)) w,
      ];
      progress = true;
    }
  }
  final floating = {for (final e in waiting) e.id};
  order.addAll(waiting);

  for (final event in events) {
    final previous = event.afterId == null ? null : byId[event.afterId];
    if (event.afterId != null && previous == null) {
      note(event.id, 'It is set to follow an event that no longer exists.');
    }
    final mine = values[event.id];
    final theirs = previous == null ? null : values[previous.id];
    if (previous != null && mine != null && theirs != null && mine < theirs) {
      note(event.id, 'It is dated before “${previous.name}”, which it is set to follow.');
    }
  }

  String? nameOf(String id) => byId[id]?.name;
  return [
    for (final event in order)
      Placed(
        event: event,
        value: values[event.id],
        year: values[event.id] == null ? null : (values[event.id]! / c.minutesPerYear).floor(),
        anchored: !floating.contains(event.id),
        label: formatDate(event.when, nameOf, c),
        issues: issues[event.id]!,
      ),
  ];
}
