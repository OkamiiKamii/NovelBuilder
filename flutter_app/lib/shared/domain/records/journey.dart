import '../json.dart';
import '../json_record.dart';
import '../model/validity.dart';
import 'event.dart';

/// A journey: who travels from where to where, by way of where, and when (as far as the author has said).
class Journey extends JsonRecord {
  Journey(super.raw);

  List<String> get travellerIds => strings(raw['travellerIds']);
  String? get fromId => idOrNull(raw['fromId']);
  String? get toId => idOrNull(raw['toId']);
  List<String> get via => strings(raw['via']);
  Anchor? get departure => Anchor.fromJson(raw['departure']);
  Anchor? get arrival => Anchor.fromJson(raw['arrival']);
  String? get afterId => idOrNull(raw['afterId']);
  List<String> get eventIds => strings(raw['eventIds']);

  /// How they travel, in the author's words ("on foot", "by airship"), and one of the novel's travel methods when
  /// chosen.
  String get method => str(raw['method']);
  String? get methodId => idOrNull(raw['methodId']);
  EventDuration? get duration => EventDuration.fromJson(raw['duration']);

  /// How far, in the author's unit ("120 leagues").
  double? get distance {
    final d = numOrNull(raw['distance']);
    return d == null || !d.isFinite ? null : d.toDouble();
  }

  String get distanceUnit => str(raw['distanceUnit']);
  String get note => str(raw['note']);
  num get createdAt => numOrNull(raw['createdAt']) ?? 0;
}
