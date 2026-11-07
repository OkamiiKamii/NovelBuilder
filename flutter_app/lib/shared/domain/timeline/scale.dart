import 'dart:math' as math;

import '../records/calendar.dart';

/// A stretch of story time on screen, in minutes.
typedef TimeWindow = ({double from, double to});

double _monthMinutes(Calendar c) => c.minutesPerYear / c.months.length;

/// Which year, month (0-based), day (0-based) and minute of the day a moment falls in.
({int year, int month, int day, int minute}) partsOf(double t, Calendar c) {
  final year = (t / c.minutesPerYear).floor();
  final inYear = t - year * c.minutesPerYear;
  var month = c.monthStarts.length - 1;
  while (month > 0 && c.monthStarts[month] > inYear) {
    month--;
  }
  final inMonth = inYear - c.monthStarts[month];
  final day = (inMonth / c.minutesPerDay).floor();
  final minute = (inMonth - day * c.minutesPerDay).floor();
  return (year: year, month: month, day: day, minute: minute);
}

/// Units the axis can count in, finest first.
enum ScaleUnit { hour, day, week, month, year }

const _steps = {
  ScaleUnit.hour: [1, 2, 3, 6, 12],
  ScaleUnit.day: [1, 2],
  ScaleUnit.week: [1, 2],
  ScaleUnit.month: [1, 2, 3, 6],
  ScaleUnit.year: [
    1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000, 20000, 50000, //
    100000, 200000, 500000, 1000000, 2000000, 5000000, 10000000,
  ],
};

double _size(ScaleUnit unit, Calendar c) => switch (unit) {
  ScaleUnit.hour => 60,
  ScaleUnit.day => c.minutesPerDay,
  ScaleUnit.week => c.minutesPerDay * c.daysPerWeek,
  ScaleUnit.month => _monthMinutes(c),
  ScaleUnit.year => c.minutesPerYear,
};

/// What a scale is called, for saying it aloud: "Showing decades".
String scaleName(ScaleUnit unit, int step) => switch (unit) {
  ScaleUnit.hour => 'hours',
  ScaleUnit.day => 'days',
  ScaleUnit.week => 'weeks',
  ScaleUnit.month => 'months',
  ScaleUnit.year =>
    step >= 1000
        ? 'millennia'
        : step >= 100
        ? 'centuries'
        : step >= 10
        ? 'decades'
        : 'years',
};

/// The finest unit and step whose marks are at least [minGap] pixels apart at this zoom.
({ScaleUnit unit, int step}) chooseScale(TimeWindow window, double width, Calendar c, [double minGap = 90]) {
  final perPixel = (window.to - window.from) / math.max(1, width);
  for (final unit in ScaleUnit.values) {
    for (final step in _steps[unit]!) {
      if (_size(unit, c) * step / perPixel >= minGap) return (unit: unit, step: step);
    }
  }
  return (unit: ScaleUnit.year, step: _steps[ScaleUnit.year]!.last);
}

/// The marks along the axis for what is on screen, at the chosen scale, on the unit's own boundaries (the start of a
/// day, a month, a year), named the way the calendar names them. Labels say the larger unit where it changes ("March
/// Year 10", then "April").
List<({double t, String label})> ticksFor(TimeWindow window, double width, Calendar c) {
  final (:unit, :step) = chooseScale(window, width, c);
  final ticks = <({double t, String label})>[];
  void push(double t, String label) {
    if (t >= window.from && t <= window.to) ticks.add((t: t, label: label));
  }

  if (unit == ScaleUnit.year) {
    final first = (window.from / c.minutesPerYear / step).ceil() * step;
    for (var y = first; y * c.minutesPerYear <= window.to && ticks.length < 200; y += step) {
      push(y * c.minutesPerYear, c.yearName(y));
    }
    return ticks;
  }
  if (unit == ScaleUnit.month) {
    final start = partsOf(window.from, c);
    final count = c.months.length;
    for (var i = 0; ticks.length < 200; i++) {
      final index = start.year * count + start.month + i;
      final year = (index / count).floor();
      final month = index - year * count;
      if (month % step != 0) continue;
      final t = year * c.minutesPerYear + c.monthStarts[month];
      if (t > window.to) break;
      push(t, month == 0 || ticks.isEmpty ? '${c.months[month]} ${c.yearName(year)}' : c.months[month]);
    }
    return ticks;
  }
  // Hours, days and weeks are counted in whole days from the start of the year (a year is a whole number of days; a
  // month need not be), each labelled with its day of the month.
  final size = switch (unit) {
    ScaleUnit.hour => 60.0 * step,
    ScaleUnit.day => c.minutesPerDay * step,
    _ => c.minutesPerDay * c.daysPerWeek * step,
  };
  for (var t = (window.from / size).floor() * size; t <= window.to && ticks.length < 400; t += size) {
    final p = partsOf(t, c);
    final date = '${c.months[p.month]} ${p.day + 1}';
    push(t, unit == ScaleUnit.hour ? '$date, ${(p.minute ~/ 60).toString().padLeft(2, '0')}:00' : date);
  }
  return ticks;
}

/// The shortest and longest stretches the timeline will show: an hour, and a thousand times everything.
({double shortest, double longest}) limitsFor(TimeWindow all) =>
    (shortest: 60, longest: math.max(525600, (all.to - all.from) * 1000));

/// Zooms by [factor] (above 1 closer) keeping the moment [at] where it is on screen.
TimeWindow zoomWindow(TimeWindow window, double factor, double at, TimeWindow all) {
  final (:shortest, :longest) = limitsFor(all);
  final span = math.min(longest, math.max(shortest, (window.to - window.from) / factor));
  final width = window.to - window.from;
  final share = (at - window.from) / (width == 0 ? 1 : width);
  return (from: at - share * span, to: at - share * span + span);
}

/// Slides the view by a share of what is on screen: -0.25 a quarter back in time, 0.25 a quarter on.
TimeWindow panWindow(TimeWindow window, double share) {
  final shift = (window.to - window.from) * share;
  return (from: window.from + shift, to: window.to + shift);
}

/// Brings a moment to the middle of the screen, keeping the zoom.
TimeWindow centreOn(TimeWindow window, double t) {
  final half = (window.to - window.from) / 2;
  return (from: t - half, to: t + half);
}

const _maxSafe = 9007199254740991;

/// Reads a date typed by the author, in the calendar's own terms: "10", "Year -500", "10-6" (year and month),
/// "10-6-14", "June 10" with a month named as the calendar names it, and in a calendar with eras "Second Age 4" or
/// "Thaw Second Age 4". Gives the start of that year, month or day and how long it lasts, or null when it cannot be
/// read.
({double t, double length})? readDate(String text, Calendar c) {
  var clean = text.trim();
  int? year;
  // An era's year, longest names first so "Second Age" is not read as "Age".
  final eras = [...c.eras]..sort((a, b) => b.name.length.compareTo(a.name.length));
  for (final era in eras) {
    final found = RegExp('^(.*?)\\s*${RegExp.escape(era.name)}\\s+(-?\\d+)\$', caseSensitive: false).firstMatch(clean);
    if (found != null) {
      year = era.startYear + int.parse(found[2]!) - 1;
      clean = found[1]!.trim();
      break;
    }
  }
  clean = clean.replaceFirst(RegExp(r'^year\s+', caseSensitive: false), '');
  int? month;
  int? day;
  final numbers = RegExp(r'^(-?\d+)(?:\s*[-/.]\s*(\d+))?(?:\s*[-/.]\s*(\d+))?$').firstMatch(clean);
  int monthNamed(String name) => c.months.indexWhere((m) => m.toLowerCase() == name.trim().toLowerCase());
  if (year != null) {
    // What is left of an era date is a month's name, or nothing.
    if (clean.isNotEmpty) {
      month = monthNamed(clean);
      if (month < 0) return null;
    }
  } else if (numbers != null) {
    year = int.tryParse(numbers[1]!);
    month = numbers[2] != null ? int.parse(numbers[2]!) - 1 : null;
    day = numbers[3] != null ? int.parse(numbers[3]!) - 1 : null;
  } else {
    final named = RegExp(r'^(.+?)\s+(?:year\s+)?(-?\d+)$', caseSensitive: false).firstMatch(clean);
    final index = named == null ? -1 : monthNamed(named[1]!);
    if (named == null || index < 0) return null;
    year = int.tryParse(named[2]!);
    month = index;
  }
  if (year == null || year.abs() > _maxSafe || (month != null && (month < 0 || month >= c.months.length))) return null;
  final monthLength = month != null ? c.monthLengths[month] : 0.0;
  if (day != null && (day < 0 || day * c.minutesPerDay >= monthLength)) return null;
  final t = year * c.minutesPerYear + (month != null ? c.monthStarts[month] : 0) + (day ?? 0) * c.minutesPerDay;
  return (
    t: t,
    length: day != null
        ? c.minutesPerDay
        : month != null
        ? monthLength
        : c.minutesPerYear,
  );
}
