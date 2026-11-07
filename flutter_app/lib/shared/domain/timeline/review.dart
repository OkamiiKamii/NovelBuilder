import '../collation.dart';
import '../json.dart';
import '../model/story_model.dart';
import '../model/validity.dart';
import '../records/event.dart';
import '../records/review.dart';
import '../stable_sort.dart';
import 'ages.dart';
import 'chronology.dart';
import 'dates.dart';
import 'overlap.dart';

/// REVIEWING THE TIMELINE. Deterministic checks of the timeline against itself and against what the author has
/// recorded elsewhere. Each finding comes from one stated rule, says what records it rests on, and is raised only when
/// those records hold the data the rule needs: no date, no place or no recorded travel time means no finding, never a
/// guess. Same records, same findings, every time.
///
/// Findings are suggestions. Nothing here changes an event, a date, a place or canon. The author fixes the records
/// (and the finding goes), or keeps a decision about it, stored with the continuity decisions under a key that starts
/// "timeline|".
enum ReviewRule {
  dates(
    'Ends before it starts',
    'An event cannot end before it begins.',
    'A start date and an end date that can both be worked out.',
  ),
  follows(
    'Dated before what it follows',
    'An event set to come after another (“Comes after”) cannot be dated before it.',
    'Both events dated.',
  ),
  anchor(
    'Dated from an event that is gone',
    'A date given relative to another event (“two days after the siege”) needs that event to exist.',
    'A relative date.',
  ),
  calendar(
    'Date not in the calendar',
    'A date must exist in the novel’s calendar: a month it has, a day that month has, an hour its days have.',
    'A date with a month, day or hour.',
  ),
  ages(
    'Ages that disagree',
    'A character’s age at an event must fit their date of birth and the ages given for them at other events, birthdays counted by the calendar.',
    'At least two of: a date of birth on their profile, their age at a dated event.',
  ),
  born(
    'Takes part before being born',
    'A character cannot take part in an event before they are born.',
    'A birth worked out from their records, and the event dated.',
  ),
  travel(
    'Too little time to travel',
    'When a character is at one place and next at another, the time between the two events must be at least the travel time recorded between those places.',
    'Both events dated with a place, and a travel time recorded between the places.',
  ),
  twoPlaces(
    'In two places at once',
    'A character cannot be at two events at the same time in two different places, unless one place lies inside the other.',
    'Both events dated closely enough to be certainly at the same time, each with a place.',
    key: 'two-places',
  );

  const ReviewRule(this.title, this.rule, this.needs, {String? key}) : _key = key;
  final String title;
  final String rule;
  final String needs;
  final String? _key;
  String get key => _key ?? name;
}

class ReviewFinding {
  ReviewFinding({
    required this.key,
    required this.rule,
    required this.message,
    required this.because,
    required this.eventIds,
    required this.entryIds,
    this.ruleId,
  });

  /// The same for the same finding on every run, built from the records' ids, so a decision about it holds.
  final String key;
  final ReviewRule rule;

  /// What was found, in a sentence.
  final String message;

  /// The facts it rests on, in words.
  final String because;

  /// The records to open to resolve it.
  final List<String> eventIds;
  final List<String> entryIds;

  /// A recorded travel time, for the travel rule.
  final String? ruleId;

  JsonMap toJson() => {
    'key': key,
    'rule': rule.key,
    'message': message,
    'because': because,
    'eventIds': eventIds,
    'entryIds': entryIds,
    'ruleId': ruleId,
  };
}

String _keyOf(ReviewRule rule, List<String> ids) => ['timeline', rule.key, ...ids].join('|');
const _travelUnits = {'minutes', 'hours', 'days', 'weeks', 'months'};

/// A length of time in words, at the largest whole unit: "5 days", "36 hours".
String _lengthWords(double minutes, double dayMinutes) {
  for (final (size, name) in [(dayMinutes, 'day'), (60.0, 'hour'), (1.0, 'minute')]) {
    if (minutes >= size && minutes % size == 0) {
      final n = minutes / size;
      return '${localeNumber(n)} $name${n == 1 ? '' : 's'}';
    }
  }
  return '${localeNumber(jsRound(minutes / 60))} hours';
}

/// Every finding for a novel's timeline. [rules] are the continuity rules rows (only travel times are read).
List<ReviewFinding> reviewTimeline(StoryModel model, [List<JsonMap> rules = const []]) {
  final findings = <ReviewFinding>[];
  final context = model.timeContext;
  final calendar = model.calendar;
  final events = model.events;
  String name(String id) => events[id]?.name ?? 'an event';
  String? entry(String? id) => id == null ? null : model.entries[id]?.name;
  String? nameOf(String id) => events[id]?.name;
  String dateOf(String id) => formatDate(events[id]!.when, nameOf, calendar);
  final calendarName = calendar.standard ? 'the calendar' : calendar.name;

  // Dates: each event against itself, the event it follows, and the calendar.
  final placed = {for (final p in resolveChronology(events.values, calendar)) p.event.id: p};
  for (final event in events.values) {
    for (final (which, date) in [('start', event.when), ('end', event.end)]) {
      if (date == null) continue;
      final words = which == 'start' ? 'date' : 'end date';
      final problem = calendar.dateProblem(date);
      if (problem != null) {
        findings.add(
          ReviewFinding(
            key: _keyOf(ReviewRule.calendar, [event.id, which]),
            rule: ReviewRule.calendar,
            message: '“${event.name}”: its $words is not in $calendarName.',
            because: problem,
            eventIds: [event.id],
            entryIds: [],
          ),
        );
      }
      if (date is RelativeDate && (date.anchorId == null || !events.containsKey(date.anchorId))) {
        findings.add(
          ReviewFinding(
            key: _keyOf(ReviewRule.anchor, [event.id, which]),
            rule: ReviewRule.anchor,
            message: '“${event.name}”: its $words is given from an event that no longer exists.',
            because:
                'It reads “about ${jsNum(date.amount)} ${date.unit.name} ${date.before ? 'before' : 'after'}” an event that has been deleted, so it cannot be placed.',
            eventIds: [event.id],
            entryIds: [],
          ),
        );
      }
    }
    if (event.raw['end'] != null) {
      final start = spanOfDate(event.when, context, {event.id});
      final end = spanOfDate(event.end, context, {event.id});
      if (start != null && end != null && end.hi < start.lo) {
        findings.add(
          ReviewFinding(
            key: _keyOf(ReviewRule.dates, [event.id]),
            rule: ReviewRule.dates,
            message: '“${event.name}” ends before it starts.',
            because: 'It starts ${dateOf(event.id)} and ends ${formatDate(event.end, nameOf, calendar)}.',
            eventIds: [event.id],
            entryIds: [],
          ),
        );
      }
    }
    final afterId = event.afterId;
    if (afterId != null && events.containsKey(afterId)) {
      final mine = placed[event.id]?.value;
      final theirs = placed[afterId]?.value;
      if (mine != null && theirs != null && mine < theirs) {
        findings.add(
          ReviewFinding(
            key: _keyOf(ReviewRule.follows, [event.id, afterId]),
            rule: ReviewRule.follows,
            message: '“${event.name}” is set to come after “${name(afterId)}”, but is dated before it.',
            because: '“${event.name}”: ${dateOf(event.id)}. “${name(afterId)}”: ${dateOf(afterId)}.',
            eventIds: [event.id, afterId],
            entryIds: [],
          ),
        );
      }
    }
  }

  // Characters: ages, and where they are when.
  final within = _containment(model);
  final travel = <String, JsonMap>{};
  for (final r in rules) {
    final from = idOrNull(r['entryId']);
    final to = idOrNull(r['toEntryId']);
    if (r['kind'] != 'travel' || from == null || to == null || numOrNull(r['amount']) == null) continue;
    if (!_travelUnits.contains(r['unit'])) continue;
    for (final pair in ['$from|$to', '$to|$from']) {
      travel.putIfAbsent(pair, () => r);
    }
  }
  for (final character in model.entries.values) {
    if (character.category != 'character') continue;
    final theirs = [
      for (final e in events.values)
        if (e.characters.any((c) => c.id == character.id)) e,
    ];
    if (theirs.isEmpty) continue;
    final ages = agesOf(
      character.id,
      events,
      calendar: calendar,
      birthDate: birthDateOf(character),
      eventIds: [for (final e in theirs) e.id],
    );
    for (final MapEntry(key: eventId, value: issue) in ages.issues.entries) {
      final born = issue.startsWith('Takes part');
      final basis = ages.birth.basis;
      findings.add(
        ReviewFinding(
          key: _keyOf(born ? ReviewRule.born : ReviewRule.ages, [character.id, eventId]),
          rule: born ? ReviewRule.born : ReviewRule.ages,
          message: born
              ? '${character.name} takes part in “${name(eventId)}”, which the dates put before their birth.'
              : '${character.name}’s age at “${name(eventId)}” does not fit the other records.',
          because: born
              ? 'Born ${basis.isNotEmpty ? 'as worked out from ${basis.join(' and ')}' : 'as recorded'}; “${name(eventId)}” is ${dateOf(eventId)}.'
              : issue.replaceFirst(RegExp('^Stated'), '${character.name} is stated'),
          eventIds: [eventId],
          entryIds: [character.id],
        ),
      );
    }

    // Where they are: the dated events they take part in that have a place, in story order.
    final located = stableSorted(
      [
        for (final e in theirs)
          if (e.locationId != null && model.entries.containsKey(e.locationId))
            if (boundsOfEvent(e.id, context) case final bounds?) (e: e, bounds: bounds),
      ],
      (a, b) {
        final byStart = a.bounds.start.lo.compareTo(b.bounds.start.lo);
        return byStart != 0 ? byStart : localeCompare(a.e.id, b.e.id);
      },
    );
    for (var i = 0; i < located.length; i++) {
      for (var j = i + 1; j < located.length; j++) {
        final a = located[i];
        final b = located[j];
        final placeA = a.e.locationId!;
        final placeB = b.e.locationId!;
        if (placeA == placeB || within(placeA, placeB) || within(placeB, placeA)) continue;
        final how = together(a.bounds, b.bounds, calendar.minutesPerDay);
        final certain = how != null && how.certain;
        final route = travel['$placeA|$placeB'];
        final amount = route == null ? null : numOrNull(route['amount']);
        if (certain && !(route != null && amount == 0)) {
          final pair = [a.e.id, b.e.id]..sort();
          findings.add(
            ReviewFinding(
              key: _keyOf(ReviewRule.twoPlaces, [character.id, ...pair]),
              rule: ReviewRule.twoPlaces,
              message: '${character.name} is at ${entry(placeA)} and at ${entry(placeB)} at the same time.',
              because:
                  '“${a.e.name}” (${dateOf(a.e.id)}) is at ${entry(placeA)}; “${b.e.name}” (${dateOf(b.e.id)}) is at ${entry(placeB)}; the dates put both at once, and neither place lies inside the other.',
              eventIds: [a.e.id, b.e.id],
              entryIds: [character.id, placeA, placeB],
              ruleId: route == null ? null : str(route['id']),
            ),
          );
          continue;
        }
        // Travel between consecutive places: only the next located event after this one.
        if (j != i + 1 || route == null || amount == null) continue;
        if (a.bounds.open != null) continue;
        final endA = a.bounds.end!;
        // The most time there can be between leaving the first and arriving for the second.
        final longest = b.bounds.start.hi - endA.lo;
        final unit = str(route['unit']);
        final needed = amount * calendar.unitMinutes(timeUnitOf(unit)!);
        if (longest >= 0 && longest < needed) {
          findings.add(
            ReviewFinding(
              key: _keyOf(ReviewRule.travel, [character.id, a.e.id, b.e.id]),
              rule: ReviewRule.travel,
              message:
                  '${character.name} cannot get from ${entry(placeA)} to ${entry(placeB)} in time for “${b.e.name}”.',
              because:
                  '“${a.e.name}” (${dateOf(a.e.id)}) is at ${entry(placeA)}; “${b.e.name}” (${dateOf(b.e.id)}) is at ${entry(placeB)}, at most ${_lengthWords(longest + 1 < 0 ? 0 : longest + 1, calendar.minutesPerDay)} later. The travel time recorded between them is ${jsNum(amount)} ${amount == 1 ? unit.substring(0, unit.length - 1) : unit}.',
              eventIds: [a.e.id, b.e.id],
              entryIds: [character.id, placeA, placeB],
              ruleId: str(route['id']),
            ),
          );
        }
      }
    }
  }
  return findings;
}

/// Whether a place lies inside another, through "Located in" links, at any depth.
bool Function(String inner, String outer) _containment(StoryModel model) {
  final parents = <String, List<String>>{};
  for (final link in model.links) {
    if (link.type != 'located-in') continue;
    if (model.entries[link.fromId]?.category != 'location' || model.entries[link.toId]?.category != 'location') {
      continue;
    }
    (parents[link.fromId] ??= []).add(link.toId);
  }
  return (inner, outer) {
    final seen = <String>{};
    final stack = [...?parents[inner]];
    while (stack.isNotEmpty) {
      final at = stack.removeLast();
      if (at == outer) return true;
      if (!seen.add(at)) continue;
      stack.addAll(parents[at] ?? const []);
    }
    return false;
  };
}

/// Findings split by the author's decisions: still open, decided (with the decision), and decisions whose finding is
/// no longer raised (the records changed since).
({List<ReviewFinding> open, List<({ReviewFinding finding, ReviewItem decision})> decided, List<ReviewItem> gone})
withDecisions(List<ReviewFinding> findings, List<ReviewItem> decisions, {String prefix = 'timeline|'}) {
  final mine = [
    for (final d in decisions)
      if (d.key.startsWith(prefix)) d,
  ];
  // "Needs review" keeps a finding open; every other decision closes it.
  final decided = {
    for (final d in mine)
      if (d.decision.closes) d.key: d,
  };
  final keys = {for (final f in findings) f.key};
  return (
    open: [
      for (final f in findings)
        if (!decided.containsKey(f.key)) f,
    ],
    decided: [
      for (final f in findings)
        if (decided[f.key] case final d?) (finding: f, decision: d),
    ],
    gone: [
      for (final d in mine)
        if (!keys.contains(d.key)) d,
    ],
  );
}
