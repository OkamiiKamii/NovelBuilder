import '../json.dart';
import '../json_record.dart';

/// Where a statement stands. Set by the author and by nobody else.
enum CanonStatus {
  canon('Canon', 'Confirmed: officially true in the story as it stands.'),
  provisional('Provisional', 'A working idea, not settled yet.'),
  nonCanon('Non-Canon', 'Deliberately left out: a discarded draft or alternate version.', key: 'non-canon'),
  retconned('Retconned', 'Was true once, and has been officially replaced.'),
  conflicting('Conflicting', 'Contradicts another statement, and is waiting for your decision.');

  const CanonStatus(this.label, this.hint, {String? key}) : _key = key;
  final String label;
  final String hint;
  final String? _key;
  String get key => _key ?? name;

  static CanonStatus? of(Object? value) {
    for (final s in values) {
      if (s.key == value) return s;
    }
    return null;
  }
}

/// A statement about the fictional world and where it stands, with its sources and an append-only history.
/// It points at chapters, entries and events by id; it never holds or changes manuscript text.
class CanonFact extends JsonRecord {
  CanonFact(super.raw);

  String get subject => str(raw['subject']);
  String get statement => str(raw['statement']);

  /// `lore`, `attribute`, `rule` or `story`.
  String get kind => str(raw['kind'], 'lore');
  CanonStatus get status => CanonStatus.of(raw['status']) ?? CanonStatus.provisional;
  List<String> get entryIds => strings(raw['entryIds']);
  List<String> get conflictsWith => strings(raw['conflictsWith']);
  String? get replacedById => idOrNull(raw['replacedById']);

  /// Each change, oldest first. Entries are only ever added.
  List<JsonMap> get history => maps(raw['history']);
  List<JsonMap> get sources => maps(raw['sources']);

  CanonFact withFields(JsonMap changes) => CanonFact(merged(changes));
}
