import '../json.dart';
import '../json_record.dart';
import '../model/validity.dart';

/// Something the novel tracks about how characters change: a value, a named value, things held, or moments.
class ProgressCategory extends JsonRecord {
  ProgressCategory(super.raw);

  String get name => str(raw['name']);

  /// `value`, `named`, `held` or `moment`.
  String get shape => str(raw['shape'], 'value');
  List<String> get ladder => strings(raw['ladder']);
  List<String> get characterIds => strings(raw['characterIds']);
  num get order => numOrNull(raw['order']) ?? 0;

  /// No new changes; those recorded are kept and shown.
  bool get archived => raw['archived'] == true;
}

/// One change to one character, at a point in the story (or before it).
class ProgressChange extends JsonRecord {
  ProgressChange(super.raw);

  String get entryId => str(raw['entryId']);
  String get categoryId => str(raw['categoryId']);

  /// `set`, `gain`, `lose` or `happen`.
  String get action => str(raw['action']);
  String get subject => str(raw['subject']);
  String get value => str(raw['value']);

  /// A codex entry the thing is (the sword gained), when there is one.
  String? get refId => idOrNull(raw['refId']);

  /// An ability it gains, loses or names (`<systemId>/<itemId>`).
  String? get abilityId => idOrNull(raw['abilityId']);

  /// When it happens. Null: before the story begins.
  Anchor? get at => Anchor.fromJson(raw['at']);
  num get createdAt => numOrNull(raw['createdAt']) ?? 0;

  /// What it cost, in the author's words.
  String get cost => str(raw['cost']);
  String get note => str(raw['note']);
}
