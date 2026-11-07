import '../codex/codex_changes.dart' show ChangeRefused;
import '../json.dart';
import '../records/calendar.dart';
import '../records/event.dart';

/// A number as the original app writes it (`toLocaleString`): thousands grouped, at most three decimals.
String localeNumber(num n) {
  final rounded = (n * 1000).round() / 1000;
  final whole = rounded.truncate().abs();
  final digits = whole.toString();
  final out = StringBuffer(rounded < 0 ? '-' : '');
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) out.write(',');
    out.write(digits[i]);
  }
  final fraction = ((rounded.abs() - whole) * 1000).round();
  if (fraction > 0) out.write('.${fraction.toString().padLeft(3, '0').replaceFirst(RegExp(r'0+$'), '')}');
  return out.toString();
}

/// A number as JavaScript prints it in a template: 10, not 10.0.
String jsNum(num n) => n.isFinite && n == n.truncate() ? n.truncate().toString() : n.toString();

/// JavaScript's `Math.round`: halves go up, also below zero.
int jsRound(num n) => (n + 0.5).floor();

const seasonLabels = {
  Season.spring: 'Spring',
  Season.summer: 'Summer',
  Season.autumn: 'Autumn',
  Season.winter: 'Winter',
};

/// How exact a date is, as the editor offers it.
const precisionLabels = {'exact': 'Exact', 'approximate': 'Approximate', 'relative': 'Relative', 'unknown': 'Undated'};
const precisions = ['exact', 'approximate', 'relative', 'unknown'];

/// "1 day", "3 weeks", "1.5 years".
String unitLabel(num amount, TimeUnit unit) =>
    '${localeNumber(amount)} ${amount == 1 ? unit.name.substring(0, unit.name.length - 1) : unit.name}';

/// A time of day: "8:30 PM" in a 24-hour day, "27:30" in a calendar whose days are longer or shorter.
String _clock(int hour, int? minute, Calendar c) {
  final mm = (minute ?? 0).toString().padLeft(2, '0');
  if (c.hoursPerDay != 24) return '$hour:$mm';
  return '${hour % 12 == 0 ? 12 : hour % 12}:$mm ${hour >= 12 ? 'PM' : 'AM'}';
}

String _yearName(num year, Calendar c) => year == year.truncate() ? c.yearName(year.toInt()) : 'Year ${jsNum(year)}';

/// A date as the author would read it, in the novel's calendar: "Year 1026, October 14 — 8:30 PM", "Summer of Year
/// 10", "About 20 years before the Siege", "Second Age 4, Thaw 3".
String formatDate(EventDate? when, [String? Function(String eventId)? nameOf, Calendar? calendar]) {
  final c = calendar ?? Calendar.standardCalendar;
  switch (when) {
    case ExactDate(:final year, :final month, :final day, :final hour, :final minute):
      final date = month != null && month != 0
          ? ', ${c.monthName(month)}${day != null && day != 0 ? ' $day' : ''}'
          : '';
      final time = hour != null && month != null && month != 0 && day != null && day != 0
          ? ' — ${_clock(hour, minute, c)}'
          : '';
      return '${_yearName(year, c)}$date$time';
    case ApproximateDate(:final year, :final month, :final season):
      // The standard calendar has always said "June 10" for June of Year 10; a calendar of the novel's own says it in
      // full.
      if (month != null && month != 0) {
        return c.standard ? '${c.monthName(month)} ${jsNum(year)}' : '${c.monthName(month)}, ${_yearName(year, c)}';
      }
      if (season != null) return '${seasonLabels[season]} of ${_yearName(year, c)}';
      return 'Around ${_yearName(year, c)}';
    case RelativeDate(:final anchorId, :final amount, :final unit, :final before):
      final anchor = anchorId == null ? null : nameOf?.call(anchorId);
      return 'About ${unitLabel(amount, unit)} ${before ? 'before' : 'after'} ${anchor ?? 'an event that no longer exists'}';
    case UnknownDate() || null:
      return 'Undated';
  }
}

String formatDuration(EventDuration? duration) => duration == null ? '' : unitLabel(duration.amount, duration.unit);

int? _whole(Object? value, int min, int max) {
  final n = value is num ? value : (value is String && value.trim().isNotEmpty ? num.tryParse(value.trim()) : null);
  if (n == null || !n.isFinite) return null;
  final r = jsRound(n);
  return r >= min && r <= max ? r : null;
}

TimeUnit _unit(Object? value) => timeUnitOf(value) ?? TimeUnit.years;

/// A date made valid for its precision, in the novel's calendar: a month it has, a day that month has, an hour its
/// days have. Detail that makes no sense is dropped; a date that needs a year and has none becomes undated. Checked
/// only when a date is saved: changing the calendar later never rewrites a stored date.
JsonMap normalizeDate(Object? input, [Calendar? calendar]) {
  final c = calendar ?? Calendar.standardCalendar;
  final when = mapOrNull(input) ?? const <String, Object?>{};
  final year = _whole(when['year'], -9999999, 9999999);
  if (when['precision'] == 'exact' && year != null) {
    final month = _whole(when['month'], 1, c.months.length);
    final day = month != null ? _whole(when['day'], 1, c.daysIn(month)) : null;
    final hour = day != null ? _whole(when['hour'], 0, c.hoursPerDay - 1) : null;
    return {
      'precision': 'exact',
      'year': year,
      'month': month,
      'day': day,
      'hour': hour,
      'minute': hour != null ? (_whole(when['minute'], 0, 59) ?? 0) : null,
    };
  }
  if (when['precision'] == 'approximate' && year != null) {
    final month = _whole(when['month'], 1, c.months.length);
    final season = seasonOf(when['season']);
    return {'precision': 'approximate', 'year': year, 'month': month, 'season': month == null ? season?.name : null};
  }
  if (when['precision'] == 'relative') {
    final raw = when['amount'];
    final amount = raw is num ? raw : (raw is String ? num.tryParse(raw.trim()) : null);
    return {
      'precision': 'relative',
      'anchorId': idOrNull(when['anchorId']),
      'amount': amount == null || !amount.isFinite ? 0 : amount.abs(),
      'unit': _unit(when['unit']).name,
      'direction': when['direction'] == 'after' ? 'after' : 'before',
    };
  }
  return {'precision': 'unknown'};
}

/// Real-world month lengths, the starting point for a calendar of one's own.
const _monthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const _standardSeasons = {'spring': 3, 'summer': 6, 'autumn': 9, 'winter': 12};

/// What a new calendar of the author's own starts from: the real-world months, ready to rename and resize.
JsonMap startingCalendar() => {
  'name': 'My calendar',
  'months': [
    for (final (i, name) in monthNames.indexed) {'name': name, 'days': _monthDays[i]},
  ],
  'hoursPerDay': 24,
  'daysPerWeek': 7,
  'eras': <Object?>[],
  'seasons': {..._standardSeasons},
};

/// The settings a novel with no calendar row has: the standard calendar, with a calendar of its own ready to fill in.
JsonMap defaultCalendarSettings() => {'kind': 'standard', ...startingCalendar()};

/// Settings as they can be stored: names trimmed, eras in order. Refused with the problems when they cannot be.
JsonMap cleanCalendar(JsonMap input) {
  final problems = calendarProblems(input);
  if (problems.isNotEmpty) throw ChangeRefused(problems.join(' '));
  final custom = input['kind'] == 'custom';
  // A standard calendar keeps whatever custom settings it was given that are usable, for switching back.
  final usable = custom || calendarProblems({...input, 'kind': 'custom'}).isEmpty;
  final from = usable ? input : startingCalendar();
  final eras = [
    for (final e in maps(from['eras'])) {'name': str(e['name']).trim(), 'startYear': e['startYear']},
  ]..sort((a, b) => (a['startYear']! as int).compareTo(b['startYear']! as int));
  return {
    'kind': custom ? 'custom' : 'standard',
    'name': str(from['name']).trim(),
    'months': [
      for (final m in maps(from['months'])) {'name': str(m['name']).trim(), 'days': m['days']},
    ],
    'hoursPerDay': from['hoursPerDay'],
    'daysPerWeek': from['daysPerWeek'],
    'eras': eras,
    'seasons': {...?mapOrNull(from['seasons'])},
  };
}

/// The settings as the author last saved them, or the defaults. A damaged row reads as the standard calendar.
JsonMap calendarSettingsOf(JsonMap? row) {
  if (row == null) return defaultCalendarSettings();
  try {
    return cleanCalendar(row);
  } on ChangeRefused {
    return defaultCalendarSettings();
  } on Object {
    return defaultCalendarSettings();
  }
}

/// A calendar described in a few words: "Standard calendar", "The Reckoning: 10 months, 400 days a year".
String describeCalendar(Calendar c) {
  if (c.standard) return 'Standard calendar';
  final days = c.minutesPerYear / c.minutesPerDay;
  final months = c.months.length;
  return '${c.name}: $months ${months == 1 ? 'month' : 'months'}, ${localeNumber(days)} ${days == 1 ? 'day' : 'days'} a year'
      '${c.hoursPerDay != 24 ? ', ${c.hoursPerDay}-hour days' : ''}'
      '${c.eras.isNotEmpty ? ', ${c.eras.length} ${c.eras.length == 1 ? 'era' : 'eras'}' : ''}';
}
