import 'dart:math' as math;

import '../model/validity.dart';
import '../records/calendar.dart';
import '../records/entry.dart';
import '../records/event.dart';
import 'chronology.dart';
import 'scale.dart';

/// A character's age at an event, as exactly as what the author has said allows.
sealed class AgeAt {
  const AgeAt();
}

/// The author's own figure for this event.
final class StatedAge extends AgeAt {
  const StatedAge(this.age);
  final int age;
}

/// Worked out, exactly.
final class KnownAge extends AgeAt {
  const KnownAge(this.age);
  final int age;
}

/// Worked out, as closely as the dates allow.
final class AgeRange extends AgeAt {
  const AgeRange(this.min, this.max);
  final int min;
  final int max;
}

/// The event happens before they are born.
final class Unborn extends AgeAt {
  const Unborn();
}

final class UnknownAge extends AgeAt {
  const UnknownAge(this.reason);
  final String reason;
}

class Birth {
  Birth({required this.span, required this.basis, required this.unread, required this.conflict});

  /// The earliest and latest moment they can have been born. Null when nothing says, or the records disagree.
  final Span? span;

  /// What it is worked out from, in words.
  final List<String> basis;

  /// A date of birth on the profile that could not be read as a date, as written.
  final String? unread;

  /// The records given disagree, so no birth can be worked out from them together.
  final bool conflict;
}

class Ages {
  Ages(this.birth, this.at, this.issues);
  final Birth birth;

  /// The age at each event asked about.
  final Map<String, AgeAt> at;

  /// Things to check, by event: a stated age the other records do not allow, or taking part before being born.
  final Map<String, String> issues;
}

/// The profile fields read as a date of birth.
const birthFields = ['date of birth', 'birth date', 'birthdate', 'born'];

/// A character's date of birth as written on their profile, or null when there is none.
String? birthDateOf(Entry? entry) {
  if (entry == null) return null;
  for (final f in entry.fields) {
    if (birthFields.contains(f.key.trim().toLowerCase()) && f.value.trim().isNotEmpty) return f.value.trim();
  }
  return null;
}

/// The first and last minute of the calendar day a moment falls on. A day ends at its month's end.
Span _dayOf(double t, Calendar c) {
  final p = partsOf(t, c);
  final lo = t - p.minute;
  final monthEnd = p.year * c.minutesPerYear + c.monthStarts[p.month] + c.monthLengths[p.month];
  return Span(lo, math.min(lo + c.minutesPerDay, monthEnd) - 1);
}

/// Whole years from one moment to another, counting birthdays by the calendar's day and month.
int _yearsBetween(double born, double at, Calendar c) {
  final b = partsOf(born, c);
  final a = partsOf(at, c);
  return a.year - b.year - (a.month < b.month || (a.month == b.month && a.day < b.day) ? 1 : 0);
}

/// How old someone born in [birth] is at [at], as exactly as the two stretches allow. On the day they turn 17 they
/// are 17, whatever the hour.
AgeAt ageAt(Span birth, Span at, [Calendar? calendar]) {
  final c = calendar ?? Calendar.standardCalendar;
  final max = _yearsBetween(birth.lo, at.hi, c);
  if (max < 0) return const Unborn();
  final min = math.max(0, _yearsBetween(birth.hi, at.lo, c));
  return min == max ? KnownAge(max) : AgeRange(min, max);
}

/// "Age 26", "Age 25–26", "Before their birth"; empty when unknown.
String ageLabel(AgeAt age) => switch (age) {
  StatedAge(:final age) || KnownAge(:final age) => 'Age $age',
  AgeRange(:final min, :final max) => 'Age $min–$max',
  Unborn() => 'Before their birth',
  UnknownAge() => '',
};

/// The same in a sentence: "26", "25 or 26", "between 30 and 35", "unknown".
String ageWords(AgeAt age) => switch (age) {
  StatedAge(:final age) || KnownAge(:final age) => '$age',
  AgeRange(:final min, :final max) => max - min == 1 ? '$min or $max' : 'between $min and $max',
  Unborn() => 'before their birth',
  UnknownAge() => 'unknown',
};

class _Clue {
  _Clue(this.label, this.span, this.eventId, this.stated);
  final String label;
  final Span span;
  final String? eventId;
  final int? stated;
}

Span? _meet(List<Span> spans) {
  if (spans.isEmpty) return null;
  final lo = spans.map((s) => s.lo).reduce(math.max);
  final hi = spans.map((s) => s.hi).reduce(math.min);
  return lo <= hi ? Span(lo, hi) : null;
}

int? _statedAge(TimelineEvent event, String characterId) {
  for (final c in event.characters) {
    if (c.id == characterId && c.age != null) return c.age!.toInt();
  }
  return null;
}

/// Ages for one character at the events asked about (by default, every event they take part in). [events] is the
/// whole timeline, so relative dates can be worked out. Reads only.
Ages agesOf(
  String characterId,
  Map<String, TimelineEvent> events, {
  Calendar? calendar,
  String? birthDate,
  List<String>? eventIds,
}) {
  final c = calendar ?? Calendar.standardCalendar;
  final context = TimeContext(position: const {}, events: events, calendar: c);
  final year = c.minutesPerYear;
  Span? startOf(String id) => boundsOfEvent(id, context)?.start;
  final taking = [
    for (final e in events.values)
      if (e.characters.any((x) => x.id == characterId)) e,
  ];
  final clues = <_Clue>[];
  String? unread;
  if (birthDate != null) {
    final read = readDate(birthDate, c);
    if (read != null) {
      clues.add(
        _Clue('the date of birth on their profile ($birthDate)', Span(read.t, read.t + read.length - 1), null, null),
      );
    } else {
      unread = birthDate;
    }
  }
  for (final event in taking) {
    final stated = _statedAge(event, characterId);
    final at = stated == null ? null : startOf(event.id);
    if (stated == null || at == null) continue;
    // Age 0 is their birth. Age a means their a-th birthday has come and their next has not: born from the day after
    // a + 1 years before, to a years before.
    final span = stated == 0
        ? at
        : Span(_dayOf(at.lo - (stated + 1) * year, c).hi + 1, _dayOf(at.hi - stated * year, c).hi);
    clues.add(
      _Clue(stated == 0 ? 'their birth, “${event.name}”' : 'age $stated at “${event.name}”', span, event.id, stated),
    );
  }
  final span = _meet([for (final clue in clues) clue.span]);
  final conflict = clues.isNotEmpty && span == null;

  final issues = <String, String>{};
  // A stated age is checked against all the other clues; each that does not fit them is pointed out.
  for (final clue in clues) {
    if (clue.eventId == null || clue.stated == null) continue;
    final others = [
      for (final o in clues)
        if (!identical(o, clue)) o,
    ];
    final rest = _meet([for (final o in others) o.span]);
    if (rest == null) continue;
    final expected = ageAt(rest, startOf(clue.eventId!)!, c);
    final fits = switch (expected) {
      KnownAge(:final age) => age == clue.stated,
      AgeRange(:final min, :final max) => clue.stated! >= min && clue.stated! <= max,
      _ => false,
    };
    if (!fits) {
      final words = expected is Unborn ? 'before their birth' : ageLabel(expected).replaceFirst('Age ', '');
      issues[clue.eventId!] =
          'Stated as age ${clue.stated}, but the dates make it $words (counting from ${others.map((o) => o.label).join(' and ')}).';
    }
  }

  final at = <String, AgeAt>{};
  for (final id in eventIds ?? [for (final e in taking) e.id]) {
    final event = events[id];
    if (event == null) continue;
    final stated = _statedAge(event, characterId);
    if (stated != null) {
      at[id] = StatedAge(stated);
      continue;
    }
    final when = startOf(id);
    if (when == null) {
      at[id] = const UnknownAge('this event has no date that can be worked out');
    } else if (span == null) {
      at[id] = UnknownAge(
        conflict ? 'the ages and dates given for them disagree' : 'no date of birth or age is given for them yet',
      );
    } else {
      final age = ageAt(span, when, c);
      at[id] = age;
      if (age is Unborn && event.characters.any((x) => x.id == characterId) && !issues.containsKey(id)) {
        issues[id] = 'Takes part here, but the dates put this before their birth.';
      }
    }
  }
  return Ages(
    Birth(span: span, basis: [for (final clue in clues) clue.label], unread: unread, conflict: conflict),
    at,
    issues,
  );
}

class LifeStep {
  LifeStep(this.placed, this.ageAt, this.issue);
  final Placed placed;

  /// The age as exactly as it is known.
  final AgeAt ageAt;
  final String? issue;

  /// Their age here when it is a single number, stated or worked out; null when it is a range or unknown.
  int? get age => switch (ageAt) {
    StatedAge(:final age) || KnownAge(:final age) => age,
    _ => null,
  };
  bool get stated => ageAt is StatedAge;

  /// "Age 26", "Age 25–26", or empty.
  String get label => ageLabel(ageAt);
}

/// A character's life path: every event they are part of, in story order, with their age at each.
List<LifeStep> lifePath(List<Placed> placed, String characterId, {Calendar? calendar, String? birthDate}) {
  final events = {for (final p in placed) p.event.id: p.event};
  final mine = [
    for (final p in placed)
      if (p.event.characters.any((c) => c.id == characterId)) p,
  ];
  final ages = agesOf(
    characterId,
    events,
    calendar: calendar,
    birthDate: birthDate,
    eventIds: [for (final p in mine) p.event.id],
  );
  return [for (final p in mine) LifeStep(p, ages.at[p.event.id] ?? const UnknownAge(''), ages.issues[p.event.id])];
}

/// "Age 0: Mira is born → Age 7–8: Parents disappear → …"
String lifeSummary(List<LifeStep> steps) =>
    steps.map((s) => '${s.label.isNotEmpty ? '${s.label}: ' : ''}${s.placed.event.name}').join(' → ');
