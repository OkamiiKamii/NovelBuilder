import 'dart:math' as math;

import 'progress.dart';

/// One day in the day book: its key (`yyyy-mm-dd`), the net words written, whether anything was written at all (a
/// day of cutting still counts), and whether it is today or still to come this week.
typedef BookDay = ({String key, int words, bool written, bool today, bool ahead});

/// THE DAY BOOK: the last few weeks of writing, a row to a week from Monday, as the writing log has them; the days
/// written in a row up to today (or up to yesterday, while today is still to write); and the best day shown.
/// Describes only: a day without writing is simply a day without a mark.
class DayBook {
  const DayBook({required this.days, required this.streak, required this.keptToday, required this.today});

  /// Whole weeks, Monday first, ending with this week's Sunday.
  final List<BookDay> days;

  /// Days written in a row, up to today when today is written, else up to yesterday.
  final int streak;
  final bool keptToday;

  /// Net words written today.
  final int today;

  /// The most net words in one of the days shown (at least 1, for scaling).
  int get most => math.max(1, days.fold(0, (m, d) => math.max(m, d.words)));

  /// Net words written in the week that holds today.
  int get thisWeek => days.skip(days.length - 7).fold(0, (n, d) => n + (d.ahead ? 0 : d.words));
}

DayBook dayBookOf(Iterable<WritingSession> sessions, DateTime now, {int weeks = 5}) {
  final words = <String, int>{};
  final written = <String>{};
  for (final s in sessions) {
    words[s.day] = (words[s.day] ?? 0) + s.netWords;
    if (s.netWords > 0 || s.added > 0) written.add(s.day);
  }
  final today = dayOf(now);
  final first = addDays(weekStart(today), -7 * (weeks - 1));
  final days = [
    for (var i = 0; i < weeks * 7; i++)
      () {
        final key = addDays(first, i);
        return (
          key: key,
          words: math.max(0, words[key] ?? 0),
          written: written.contains(key),
          today: key == today,
          ahead: key.compareTo(today) > 0,
        );
      }(),
  ];
  final kept = written.contains(today);
  var streak = 0;
  for (var d = kept ? today : addDays(today, -1); written.contains(d); d = addDays(d, -1)) {
    streak++;
  }
  return DayBook(days: days, streak: streak, keptToday: kept, today: words[today] ?? 0);
}
