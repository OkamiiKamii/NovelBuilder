import '../json.dart';
import '../json_record.dart';
import '../records/event.dart';

/// JOURNEYS (as in the original app)
/// Who goes from where to where, and when, as far as the author says: when they leave and arrive (a chapter or scene,
/// an event, a date, exact or approximate, or not known), or only that one journey comes after another; how they
/// travel, how long it takes, how far it is, and the events it belongs to. Nothing about speed is assumed: a method
/// has a speed only when the author gives it one. Journeys are `records/journey.dart`.

/// A way of travelling, with a speed only if the author sets one: so many units of distance per unit of time.
class TravelMethod {
  const TravelMethod({
    required this.id,
    required this.name,
    this.speed,
    this.distanceUnit = '',
    this.per = TimeUnit.days,
  });

  factory TravelMethod.fromJson(JsonMap m) {
    final speed = numOrNull(m['speed']);
    return TravelMethod(
      id: str(m['id']),
      name: str(m['name']),
      speed: speed == null || !speed.isFinite ? null : speed.toDouble(),
      distanceUnit: str(m['distanceUnit']),
      per: timeUnitOf(m['per']) ?? TimeUnit.days,
    );
  }

  final String id;
  final String name;

  /// Null: no speed set, and nothing is worked out from it.
  final double? speed;
  final String distanceUnit;
  final TimeUnit per;

  JsonMap toJson() => {'id': id, 'name': name, 'speed': speed, 'distanceUnit': distanceUnit, 'per': per.name};
}

/// A novel's travel methods. One row a novel (`travelSettings`).
class TravelSettings extends JsonRecord {
  TravelSettings(super.raw);

  List<TravelMethod> get methods => [for (final m in maps(raw['methods'])) TravelMethod.fromJson(m)];
}

const perLabels = {
  TimeUnit.minutes: 'a minute',
  TimeUnit.hours: 'an hour',
  TimeUnit.days: 'a day',
  TimeUnit.weeks: 'a week',
  TimeUnit.months: 'a month',
  TimeUnit.years: 'a year',
};
