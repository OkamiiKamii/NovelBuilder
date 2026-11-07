import 'package:flutter/foundation.dart';

import '../json.dart';
import '../json_record.dart';
import 'canon.dart';

enum TimeUnit { minutes, hours, days, weeks, months, years }

TimeUnit? timeUnitOf(Object? value) => TimeUnit.values.where((u) => u.name == value).firstOrNull;

enum Season { spring, summer, autumn, winter }

Season? seasonOf(Object? value) => Season.values.where((s) => s.name == value).firstOrNull;

/// When something happens in the story's own world, at whatever precision the author knows it. Years are plain numbers
/// in the novel's calendar (negative years are fine). Never forced into a real-world timestamp.
@immutable
sealed class EventDate {
  const EventDate();

  /// How exact it is, as stored: `exact`, `approximate`, `relative` or `unknown`.
  String get precision;

  /// The date as the original app stores it, every field present.
  JsonMap toJson();

  /// Null when the value is not a date this version can read (an unknown precision, a missing year).
  static EventDate? fromJson(Object? json) {
    final m = mapOrNull(json);
    if (m == null) return null;
    switch (m['precision']) {
      case 'exact':
        final year = numOrNull(m['year']);
        return year == null
            ? null
            : ExactDate(
                year,
                month: intOrNull(m['month']),
                day: intOrNull(m['day']),
                hour: intOrNull(m['hour']),
                minute: intOrNull(m['minute']),
              );
      case 'approximate':
        final year = numOrNull(m['year']);
        return year == null ? null : ApproximateDate(year, month: intOrNull(m['month']), season: seasonOf(m['season']));
      case 'relative':
        final unit = timeUnitOf(m['unit']);
        final amount = numOrNull(m['amount']);
        if (unit == null || amount == null) return null;
        return RelativeDate(
          anchorId: idOrNull(m['anchorId']),
          amount: amount,
          unit: unit,
          before: m['direction'] == 'before',
        );
      case 'unknown':
        return const UnknownDate();
    }
    return null;
  }
}

/// A year, optionally narrowed to month, day and time.
final class ExactDate extends EventDate {
  const ExactDate(this.year, {this.month, this.day, this.hour, this.minute});
  final num year;
  final int? month;
  final int? day;
  final int? hour;
  final int? minute;

  @override
  String get precision => 'exact';

  @override
  JsonMap toJson() => {'precision': 'exact', 'year': year, 'month': month, 'day': day, 'hour': hour, 'minute': minute};
}

/// A year, optionally a month or a season ("Summer of Year 10").
final class ApproximateDate extends EventDate {
  const ApproximateDate(this.year, {this.month, this.season});
  final num year;
  final int? month;
  final Season? season;

  @override
  String get precision => 'approximate';

  @override
  JsonMap toJson() => {'precision': 'approximate', 'year': year, 'month': month, 'season': season?.name};
}

/// An offset before or after another event ("about 20 years before the Siege").
final class RelativeDate extends EventDate {
  const RelativeDate({required this.anchorId, required this.amount, required this.unit, required this.before});
  final String? anchorId;
  final num amount;
  final TimeUnit unit;
  final bool before;

  @override
  String get precision => 'relative';

  @override
  JsonMap toJson() => {
    'precision': 'relative',
    'anchorId': anchorId,
    'amount': amount,
    'unit': unit.name,
    'direction': before ? 'before' : 'after',
  };
}

/// No date: its place comes from the event it follows, if any.
final class UnknownDate extends EventDate {
  const UnknownDate();

  @override
  String get precision => 'unknown';

  @override
  JsonMap toJson() => {'precision': 'unknown'};
}

@immutable
class EventDuration {
  const EventDuration(this.amount, this.unit);
  final num amount;
  final TimeUnit unit;

  static EventDuration? fromJson(Object? json) {
    final m = mapOrNull(json);
    final amount = numOrNull(m?['amount']);
    final unit = timeUnitOf(m?['unit']);
    return amount == null || unit == null ? null : EventDuration(amount, unit);
  }

  JsonMap toJson() => {'amount': amount, 'unit': unit.name};
}

/// How a chapter or scene brings an event to the reader. `told` is the plain case; the others are the author's own
/// account of how the telling departs from chronology.
enum RevealRole {
  told('Told in'),
  flashback('Flashback in'),
  flashforward('Flash-forward in'),
  foreshadowed('Foreshadowed in'),
  mentioned('Mentioned in'),
  revealed('Revealed in');

  const RevealRole(this.label);
  final String label;

  static RevealRole? of(Object? value) => values.where((r) => r.name == value).firstOrNull;
}

enum Importance { minor, major, climax }

enum EventStatus { idea, planned, confirmed }

/// INDEPENDENT CHRONOLOGY RULE: an event in the story's own time. Its dates, durations and "comes after" links are
/// explicit values; it points at chapters and scenes ([nodeIds]) only to say where it is told. Reordering chapters
/// cannot change when it happens: the manuscript is the order the reader meets the story in, this is the order it
/// happened in.
class TimelineEvent extends JsonRecord {
  TimelineEvent(super.raw);

  String get name => str(raw['name']);
  String get description => str(raw['description']);
  EventDate? get when => EventDate.fromJson(raw['when']);
  EventDuration? get duration => EventDuration.fromJson(raw['duration']);
  Importance get importance =>
      Importance.values.where((i) => i.name == raw['importance']).firstOrNull ?? Importance.minor;
  String get importanceKey => str(raw['importance'], 'minor');

  /// A location entry.
  String? get locationId => idOrNull(raw['locationId']);

  /// Characters at the event (codex entry ids), each with an age when the author states one.
  List<({String id, num? age})> get characters => [
    for (final c in maps(raw['characters']))
      if (idOrNull(c['id']) != null) (id: c['id']! as String, age: numOrNull(c['age'])),
  ];

  /// Other entries involved: factions, items, lore.
  List<String> get entryIds => strings(raw['entryIds']);

  /// Chapters and scenes where it is told or mentioned.
  List<String> get nodeIds => strings(raw['nodeIds']);

  /// The event this one comes after.
  String? get afterId => idOrNull(raw['afterId']);

  /// When it ends, as a date in its own right. An event has an end date or a duration, never both.
  EventDate? get end => EventDate.fromJson(raw['end']);

  /// Still going on at the end of the story.
  bool get ongoing => raw['ongoing'] == true;
  List<String> get threadIds => strings(raw['threadIds']);
  List<String> get labels => strings(raw['labels']);
  String get statusKey => str(raw['status'], 'confirmed');
  CanonStatus? get canon => CanonStatus.of(raw['canon']);
  String get canonKey => str(raw['canon'], 'canon');

  /// How some chapters in [nodeIds] tell it, when not plainly.
  Map<String, RevealRole> get reveals => {
    for (final r in maps(raw['reveals']))
      if (idOrNull(r['nodeId']) != null) r['nodeId']! as String: RevealRole.of(r['role']) ?? RevealRole.told,
  };

  TimelineEvent withFields(JsonMap changes) => TimelineEvent(merged(changes));
}
