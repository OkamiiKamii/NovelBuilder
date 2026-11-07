import 'package:flutter/foundation.dart';

import '../json.dart';
import 'event.dart';

/// A stretch of story time in minutes from the start of year 0, both ends included.
@immutable
class Span {
  const Span(this.lo, this.hi);
  final double lo;
  final double hi;

  @override
  bool operator ==(Object other) => other is Span && other.lo == lo && other.hi == hi;

  @override
  int get hashCode => Object.hash(lo, hi);

  @override
  String toString() => 'Span($lo, $hi)';
}

const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June', //
  'July', 'August', 'September', 'October', 'November', 'December',
];

const _minutesPerDay = 1440.0;
const _minutesPerYear = 525600.0;
const _standardSeasons = {Season.spring: 3, Season.summer: 6, Season.autumn: 9, Season.winter: 12};

@immutable
class CalendarEra {
  const CalendarEra(this.name, this.startYear);
  final String name;

  /// The first year of the era, counted as "Name 1".
  final int startYear;
}

/// A NOVEL'S CALENDAR, worked out into minutes. Most novels use the standard one (twelve even months, 24-hour days,
/// years numbered plainly). A novel can have its own months, day length, week length and eras.
///
/// Changing the calendar never changes a stored date. A date that does not fit the calendar in use is not placed,
/// and says why, so switching back loses nothing.
@immutable
class Calendar {
  const Calendar._({
    required this.standard,
    required this.name,
    required this.months,
    required this.monthStarts,
    required this.monthLengths,
    required this.minutesPerYear,
    required this.minutesPerDay,
    required this.hoursPerDay,
    required this.daysPerWeek,
    required this.eras,
    required this.seasons,
  });

  final bool standard;
  final String name;
  final List<String> months;
  final List<double> monthStarts;
  final List<double> monthLengths;
  final double minutesPerYear;
  final double minutesPerDay;
  final int hoursPerDay;
  final int daysPerWeek;
  final List<CalendarEra> eras;

  /// When each season begins and how long it lasts, in minutes from the start of the year.
  final Map<Season, Span> seasons;

  static final Calendar standardCalendar = _standard();

  static Calendar _standard() {
    final starts = [for (var i = 0; i < 12; i++) i * _minutesPerYear / 12];
    return Calendar._(
      standard: true,
      name: 'Standard calendar',
      months: monthNames,
      monthStarts: starts,
      monthLengths: List.filled(12, _minutesPerYear / 12),
      minutesPerYear: _minutesPerYear,
      minutesPerDay: _minutesPerDay,
      hoursPerDay: 24,
      daysPerWeek: 7,
      eras: const [],
      seasons: _seasonSpans(_standardSeasons, starts, _minutesPerYear),
    );
  }

  /// The calendar a novel uses, from its `storyCalendars` row. No row, a standard one, or a custom one that cannot be
  /// read (a damaged import) gives the standard calendar, so dates always have somewhere to go.
  static Calendar fromJson(JsonMap? row) {
    if (row == null || row['kind'] != 'custom' || calendarProblems(row).isNotEmpty) return standardCalendar;
    final hoursPerDay = intOrNull(row['hoursPerDay'])!;
    final minutesPerDay = hoursPerDay * 60.0;
    final months = maps(row['months']);
    final lengths = [for (final m in months) intOrNull(m['days'])! * minutesPerDay];
    final starts = <double>[];
    var at = 0.0;
    for (final l in lengths) {
      starts.add(at);
      at += l;
    }
    final seasonsRow = mapOrNull(row['seasons'])!;
    final eras = [for (final e in maps(row['eras'])) CalendarEra(str(e['name']).trim(), intOrNull(e['startYear'])!)]
      ..sort((a, b) => a.startYear.compareTo(b.startYear));
    return Calendar._(
      standard: false,
      name: str(row['name']).trim(),
      months: [for (final m in months) str(m['name']).trim()],
      monthStarts: starts,
      monthLengths: lengths,
      minutesPerYear: at,
      minutesPerDay: minutesPerDay,
      hoursPerDay: hoursPerDay,
      daysPerWeek: intOrNull(row['daysPerWeek'])!,
      eras: eras,
      seasons: _seasonSpans({for (final s in Season.values) s: intOrNull(seasonsRow[s.name])!}, starts, at),
    );
  }

  /// How many minutes one of a unit lasts. A month is the average month.
  double unitMinutes(TimeUnit unit) => switch (unit) {
    TimeUnit.minutes => 1,
    TimeUnit.hours => 60,
    TimeUnit.days => minutesPerDay,
    TimeUnit.weeks => minutesPerDay * daysPerWeek,
    TimeUnit.months => minutesPerYear / months.length,
    TimeUnit.years => minutesPerYear,
  };

  double durationMinutes(EventDuration? duration) =>
      duration == null ? 0 : duration.amount * unitMinutes(duration.unit);

  /// How many days a month (1-based) has. The standard calendar's even months hold up to 31.
  int daysIn(int month) => standard
      ? 31
      : ((month >= 1 && month <= monthLengths.length ? monthLengths[month - 1] : 0) / minutesPerDay).round();

  String monthName(int month) => month >= 1 && month <= months.length ? months[month - 1] : 'Month $month';

  /// A year as the calendar names it: "Year 10", or in an era, "Second Age 4".
  String yearName(int year) {
    final era = eras.reversed.where((e) => year >= e.startYear).firstOrNull;
    return era == null ? 'Year $year' : '${era.name} ${year - era.startYear + 1}';
  }

  /// Why a date is not in this calendar, or null when it is.
  String? dateProblem(EventDate when) {
    final (month, day, hour) = switch (when) {
      ExactDate(:final month, :final day, :final hour) => (month, day, hour),
      ApproximateDate(:final month) => (month, null, null),
      _ => (null, null, null),
    };
    if (when is! ExactDate && when is! ApproximateDate) return null;
    if (month != null && (month < 1 || month > months.length)) {
      return 'Month $month is not in ${standard ? 'the calendar' : '$name, which has ${months.length} ${months.length == 1 ? 'month' : 'months'}'}.';
    }
    if (when is! ExactDate || standard) return null;
    if (month != null && day != null && (day < 1 || day > daysIn(month))) {
      return '${monthName(month)} has ${daysIn(month)} days in $name; day $day is not one of them.';
    }
    if (hour != null && (hour < 0 || hour >= hoursPerDay)) {
      return 'A day in $name has $hoursPerDay hours; hour $hour is not one of them.';
    }
    return null;
  }

  /// How much story time a dated year, month, season, day or time covers. Null for relative and undated dates, and for
  /// dates not in this calendar.
  Span? spanOf(EventDate when) {
    Span stretch(double lo, double length) => Span(lo, lo + (length - 1 < 0 ? 0 : length - 1));
    if ((when is! ExactDate && when is! ApproximateDate) || dateProblem(when) != null) return null;
    if (when is ApproximateDate) {
      final base = when.year * minutesPerYear;
      final month = when.month;
      final season = when.season;
      if (month != null) return stretch(base + monthStarts[month - 1], monthLengths[month - 1]);
      if (season != null) return Span(base + seasons[season]!.lo, base + seasons[season]!.hi);
      return stretch(base, minutesPerYear);
    }
    final exact = when as ExactDate;
    final base = exact.year * minutesPerYear;
    final m = exact.month;
    if (m == null) return stretch(base, minutesPerYear);
    final month = base + monthStarts[m - 1];
    final d = exact.day;
    if (d == null) return stretch(month, monthLengths[m - 1]);
    final day = month + (d - 1) * minutesPerDay;
    // The standard calendar's months are even twelfths of a year, so its 31st days are short: a day ends with its month.
    final monthEnd = month + monthLengths[m - 1];
    final h = exact.hour;
    if (h == null) {
      return stretch(
        day,
        day < monthEnd ? (minutesPerDay < monthEnd - day ? minutesPerDay : monthEnd - day) : minutesPerDay,
      );
    }
    final hour = day + h * 60;
    final min = exact.minute;
    return min == null ? stretch(hour, 60) : Span(hour + min, hour + min);
  }
}

Map<Season, Span> _seasonSpans(Map<Season, int> starts, List<double> monthStarts, double year) {
  double at(Season s) => monthStarts[starts[s]!.clamp(1, monthStarts.length) - 1];
  final sorted = [...Season.values]..sort((a, b) => at(a).compareTo(at(b)));
  return {
    for (final s in Season.values)
      s: () {
        final next = sorted[(sorted.indexOf(s) + 1) % sorted.length];
        // Until the next season begins, rounding into next year when it begins earlier; a season alone lasts the year.
        final raw = (at(next) - at(s) + year) % year;
        final length = raw == 0 ? year : raw;
        return Span(at(s), at(s) + length - 1);
      }(),
  };
}

/// Limits that keep a calendar usable.
const calendarLimits = (months: 100, days: 1000, hours: 1000, week: 100, eras: 50);

/// What is wrong with calendar settings, in words; empty when they can be used. A standard calendar is always fine.
List<String> calendarProblems(JsonMap input) {
  if (input['kind'] != 'custom') return const [];
  int? whole(Object? v, int min, int max) {
    final n = v is int ? v : null;
    return n != null && n >= min && n <= max ? n : null;
  }

  String text(Object? v) => str(v).trim();
  final problems = <String>[];
  final months = listOf(input['months']);
  if (text(input['name']).isEmpty) problems.add('Give the calendar a name.');
  if (months.isEmpty) problems.add('A calendar needs at least one month.');
  if (months.length > calendarLimits.months) problems.add('A calendar can have up to ${calendarLimits.months} months.');
  for (final (i, raw) in months.indexed) {
    final m = mapOrNull(raw);
    if (text(m?['name']).isEmpty) problems.add('Month ${i + 1} needs a name.');
    if (whole(m?['days'], 1, calendarLimits.days) == null) {
      final label = text(m?['name']).isEmpty ? 'Month ${i + 1}' : text(m?['name']);
      problems.add('$label needs a whole number of days, from 1 to ${calendarLimits.days}.');
    }
  }
  final names = [
    for (final m in months)
      if (text(mapOrNull(m)?['name']).isNotEmpty) text(mapOrNull(m)?['name']).toLowerCase(),
  ];
  if (names.toSet().length < names.length) problems.add('Two months have the same name.');
  if (whole(input['hoursPerDay'], 1, calendarLimits.hours) == null) {
    problems.add('A day needs a whole number of hours, from 1 to ${calendarLimits.hours}.');
  }
  if (whole(input['daysPerWeek'], 1, calendarLimits.week) == null) {
    problems.add('A week needs a whole number of days, from 1 to ${calendarLimits.week}.');
  }
  final eras = listOf(input['eras']);
  if (eras.length > calendarLimits.eras) problems.add('A calendar can have up to ${calendarLimits.eras} eras.');
  for (final (i, raw) in eras.indexed) {
    final e = mapOrNull(raw);
    if (text(e?['name']).isEmpty) problems.add('Era ${i + 1} needs a name.');
    if (e?['startYear'] is! int) {
      problems.add('${text(e?['name']).isEmpty ? 'Era ${i + 1}' : text(e?['name'])} needs a whole year to begin in.');
    }
  }
  if ({for (final e in eras) mapOrNull(e)?['startYear']}.length < eras.length) {
    problems.add('Two eras begin in the same year.');
  }
  final seasons = mapOrNull(input['seasons']);
  for (final s in Season.values) {
    if (whole(seasons?[s.name], 1, months.isEmpty ? 1 : months.length) == null) {
      problems.add('Choose the month ${s.name} begins in.');
    }
  }
  return problems;
}
