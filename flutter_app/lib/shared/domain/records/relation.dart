import '../json.dart';
import '../json_record.dart';

/// One state of a relationship, from one point in the story until the next stage begins. A relationship's history is
/// its list of stages: nothing is overwritten when it changes, a stage is added.
class RelationStage {
  RelationStage(JsonMap raw) : raw = freezeMap(raw);
  final JsonMap raw;

  String get id => str(raw['id']);

  /// The volume, arc or chapter where this state begins, by permanent id; null: from the start of the story.
  String? get startNodeId => idOrNull(raw['startNodeId']);

  /// Where the reader meets this change is not said: it follows the stage recorded before it.
  bool get startUnknown => raw['startUnknown'] == true;
  String get preset => str(raw['preset'], 'custom');
  String get category => str(raw['category'], 'custom');
  String get label => str(raw['label']);

  /// What the first character is to the second, and the second to the first. Equal when mutual.
  String get fromRole => str(raw['fromRole']);
  String get toRole => str(raw['toRole']);
  bool get directional => raw['directional'] == true;
  String get title => str(raw['title']);

  /// `hostile` … `trusting`, as the author set it.
  String get affinity => str(raw['affinity'], 'neutral');

  /// What happened to bring this state about, in the author's words.
  String get event => str(raw['event']);
  String get notes => str(raw['notes']);

  /// Tracked attributes at this stage, each way: how the first feels toward the second (`from`) and back (`to`).
  /// A missing key or null value: not said.
  JsonMap get attributes => mapOrNull(raw['attributes']) ?? const {};

  /// One tracked attribute each way (0–10), or null for "not said".
  ({int? from, int? to}) attribute(String key) {
    final v = mapOrNull(attributes[key]) ?? const {};
    return (from: intOrNull(v['from']), to: intOrNull(v['to']));
  }

  /// When it changes in the story's own time: `{kind: event, eventId}` or `{kind: date, when}`. Null: not said.
  JsonMap? get storyAt => mapOrNull(raw['storyAt']);

  /// A timeline event the author says brought it about, and the chapter where it happens.
  String? get causeEventId => idOrNull(raw['causeEventId']);
  String? get causeNodeId => idOrNull(raw['causeNodeId']);
}

/// A relationship between two codex entries, with its history. It refers to them by id only, and is deleted with
/// either of them. Direction is the author's: A may see B as a rival while B sees A as a friend (two roles, or two
/// relationships), and nothing is ever inferred.
class CharacterRelation extends JsonRecord {
  CharacterRelation(super.raw);

  String get fromId => str(raw['fromId']);
  String get toId => str(raw['toId']);
  List<RelationStage> get stages => [for (final s in maps(raw['stages'])) RelationStage(s)];

  CharacterRelation withFields(JsonMap changes) => CharacterRelation(merged(changes));
}
