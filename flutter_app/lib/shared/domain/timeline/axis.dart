import 'dart:math' as math;

import '../collation.dart';
import '../records/calendar.dart';
import '../records/event.dart';
import '../stable_sort.dart';
import 'event_record.dart';

/// How a mark is drawn, saying how much is known:
///  moment     an exact moment, known to the day or better (a dot)
///  uncertain  one moment somewhere in a stretch: a date given only to the month, season or year, drawn across the
///             whole stretch
///  lasting    an event with a length (a duration or an end date): a bar. A start or end known only roughly is drawn
///             hatched over the stretch it falls in; the solid part is when it is certainly going on.
///  ongoing    no end within the story: a bar to the edge of the drawing
///  unended    it lasts, but its end is not given (or cannot be worked out): a bar that fades out after it begins,
///             never claiming an end
/// Overlaps are normal: events that share time are drawn on separate rows, never flagged. Events with no date that
/// can be worked out are not placed at all.
enum MarkKind { moment, uncertain, lasting, ongoing, unended }

class AxisMark {
  AxisMark({
    required this.id,
    required this.title,
    required this.when,
    required this.kind,
    required this.start,
    required this.end,
    required this.startFuzz,
    required this.endFuzz,
    required this.lane,
    required this.x,
    required this.width,
  });

  final String id;
  final String title;

  /// The date as the author would say it.
  final String when;
  final MarkKind kind;

  /// Story time in minutes: the earliest it can start, and the latest it can end (the drawing's edge when ongoing).
  final double start;
  final double end;

  /// The stretch it starts somewhere in, when longer than a day.
  final Span? startFuzz;

  /// The stretch it ends somewhere in, when longer than a day; null when known to the day, or not known at all.
  final Span? endFuzz;

  /// Which row it sits on, so marks never cover one another.
  final int lane;

  /// Where it is drawn, in the drawing's units.
  final double x;
  final double width;
}

typedef Unplaced = ({String id, String title, String reason});

class TimeAxis {
  TimeAxis({
    required this.marks,
    required this.unplaced,
    required this.from,
    required this.to,
    required this.width,
    required this.lanes,
  });

  final List<AxisMark> marks;
  final List<Unplaced> unplaced;

  /// The stretch of story time drawn, in minutes.
  final double from;
  final double to;
  final double width;
  final int lanes;
}

/// The drawing's width before any zoom; marks and labels are laid out for it.
const axisWidth = 1200.0;

/// How much room a mark's label takes, so the lanes keep labels apart as well as marks.
const _label = 150.0;

bool _rough(Span s, double day) => s.hi - s.lo + 1 > day;

MarkKind _kindOf(EventRecord e, double day) {
  if (e.bounds?.open == 'ongoing') return MarkKind.ongoing;
  if (e.bounds?.open == 'unknown') return MarkKind.unended;
  if (e.shape != EventShape.instant) return MarkKind.lasting;
  return e.bounds != null && _rough(e.bounds!.start, day) ? MarkKind.uncertain : MarkKind.moment;
}

String _unplacedReason(EventRecord e, bool Function(String) has) {
  if (e.dateProblem != null) return e.dateProblem!;
  if (e.precision == 'unknown') return 'No date yet';
  if (e.precision == 'relative') {
    final start = e.start;
    final anchor = start is RelativeDate ? start.anchorId : null;
    if (anchor == null || !has(anchor)) return 'Dated from an event that no longer exists';
    return 'Dated from an event that has no date yet';
  }
  return 'Its date cannot be worked out';
}

/// The stretch of story time a set of events covers, with a margin: from the earliest start to the latest end. A
/// single moment, or everything in one instant, still gets a year either side. Null when nothing is dated.
TimeDomain? domainOf(List<EventRecord> events, {double day = 1440, double year = 525600}) {
  final dated = events.where((e) => e.span != null).toList();
  if (dated.isEmpty) return null;
  var from = dated.map((e) => e.span!.lo).reduce(math.min);
  var to = dated.map((e) => e.span!.hi.isFinite ? e.span!.hi : e.span!.lo).reduce(math.max);
  if (to - from < year) {
    from -= year;
    to += year;
  }
  final pad = (to - from) * 0.05;
  return (from: from - pad, to: to + pad);
}

typedef TimeDomain = ({double from, double to});

/// Lays events out along story time. Dated events are ordered by when they begin (ties by name, then id) and packed
/// into as few rows as keep both marks and their labels apart. Undated ones are listed apart, with why. Several
/// timelines drawn together (tracks) pass the same [domain], so an event sits at the same place in every one.
TimeAxis layoutAxis(
  List<EventRecord> events, {
  double width = axisWidth,
  TimeDomain? domain,
  bool useDomain = false,
  double day = 1440,
  double year = 525600,
}) {
  final range = useDomain ? domain : domainOf(events, day: day, year: year);
  final ids = {for (final e in events) e.id};
  final dated = stableSorted(events.where((e) => e.bounds != null), (a, b) {
    final byStart = a.bounds!.start.lo.compareTo(b.bounds!.start.lo);
    if (byStart != 0) return byStart;
    final byTitle = localeCompare(a.title, b.title);
    return byTitle != 0 ? byTitle : localeCompare(a.id, b.id);
  });
  final unplaced = [
    for (final e in stableSorted(events.where((e) => e.bounds == null), (a, b) {
      final byTitle = localeCompare(a.title, b.title);
      return byTitle != 0 ? byTitle : localeCompare(a.id, b.id);
    }))
      (id: e.id, title: e.title, reason: _unplacedReason(e, ids.contains)),
  ];
  if (dated.isEmpty || range == null) {
    return TimeAxis(
      marks: [],
      unplaced: unplaced,
      from: range?.from ?? 0,
      to: range?.to ?? year,
      width: width,
      lanes: 0,
    );
  }
  final (:from, :to) = range;
  double x(double t) => (t - from) / (to - from) * width;

  final laneEnds = <double>[];
  final marks = [
    for (final e in dated)
      () {
        final kind = _kindOf(e, day);
        final begins = e.bounds!.start;
        final ends = e.bounds!.end;
        final start = begins.lo;
        final end = switch (kind) {
          MarkKind.ongoing => to,
          MarkKind.moment => start,
          MarkKind.uncertain || MarkKind.unended => begins.hi,
          MarkKind.lasting => ends == null ? begins.hi : math.max(begins.hi, ends.hi),
        };
        final lasts = kind == MarkKind.lasting || kind == MarkKind.ongoing || kind == MarkKind.unended;
        final startFuzz = lasts && _rough(begins, day) ? Span(begins.lo, begins.hi) : null;
        final endFuzz = kind == MarkKind.lasting && ends != null && _rough(ends, day) ? Span(ends.lo, ends.hi) : null;
        final left = x(start);
        final right = math.max(left, x(end));
        // The first row where this mark and its label fit after what is already there.
        final reach = math.max(right, left + _label);
        var lane = laneEnds.indexWhere((edge) => edge + 8 <= left);
        if (lane == -1) {
          laneEnds.add(reach);
          lane = laneEnds.length - 1;
        } else {
          laneEnds[lane] = reach;
        }
        return AxisMark(
          id: e.id,
          title: e.title,
          when: e.label,
          kind: kind,
          start: start,
          end: end,
          startFuzz: startFuzz,
          endFuzz: endFuzz,
          lane: lane,
          x: left,
          width: right - left,
        );
      }(),
  ];
  return TimeAxis(marks: marks, unplaced: unplaced, from: from, to: to, width: width, lanes: laneEnds.length);
}
