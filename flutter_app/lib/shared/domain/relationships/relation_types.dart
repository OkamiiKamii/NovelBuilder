import '../json.dart';

/// RELATIONSHIP TYPES (as in the original app): the built-in kinds, the novel's own, and the attributes it tracks.

enum RelationCategory {
  family('Family'),
  social('Social'),
  mentorship('Mentorship'),
  romance('Romance'),
  hierarchy('Hierarchy'),
  custom('Custom');

  const RelationCategory(this.label);
  final String label;

  static RelationCategory of(Object? value) => values.where((c) => c.name == value).firstOrNull ?? custom;
}

/// A type as a stage uses it: what the first character is to the second, and the second to the first.
class RelationPreset {
  const RelationPreset(this.key, this.category, this.label, this.fromRole, this.toRole, {required this.directional});

  final String key;
  final RelationCategory category;
  final String label;
  final String fromRole;
  final String toRole;

  /// True when the two roles differ (Parent → Child); false when both sides are the same (Friends).
  final bool directional;
}

RelationPreset _pair(String key, RelationCategory c, String from, String to) =>
    RelationPreset(key, c, '$from / $to', from, to, directional: true);
RelationPreset _mutual(String key, RelationCategory c, String label, String role) =>
    RelationPreset(key, c, label, role, role, directional: false);

final relationPresets = <RelationPreset>[
  _pair('parent-child', RelationCategory.family, 'Parent', 'Child'),
  _mutual('siblings', RelationCategory.family, 'Siblings', 'Sibling'),
  _mutual('spouses', RelationCategory.family, 'Spouses', 'Spouse'),
  _mutual('relatives', RelationCategory.family, 'Relatives', 'Relative'),
  _mutual('friends', RelationCategory.social, 'Friends', 'Friend'),
  _mutual('allies', RelationCategory.social, 'Allies', 'Ally'),
  _mutual('rivals', RelationCategory.social, 'Rivals', 'Rival'),
  _mutual('enemies', RelationCategory.social, 'Enemies', 'Enemy'),
  _pair('mentor-student', RelationCategory.mentorship, 'Mentor', 'Student'),
  _mutual('romantic-interest', RelationCategory.romance, 'Romantic interest', 'Romantic interest'),
  _mutual('partners', RelationCategory.romance, 'Partners', 'Partner'),
  _mutual('exes', RelationCategory.romance, 'Exes', 'Ex'),
  _pair('employer-employee', RelationCategory.hierarchy, 'Employer', 'Employee'),
  _pair('master-servant', RelationCategory.hierarchy, 'Master', 'Servant'),
  _pair('ruler-subject', RelationCategory.hierarchy, 'Ruler', 'Subject'),
  _mutual('political', RelationCategory.hierarchy, 'Political tie', 'Political tie'),
  const RelationPreset('custom', RelationCategory.custom, 'Custom', '', '', directional: false),
];

RelationPreset presetFor(String key) => relationPresets.where((p) => p.key == key).firstOrNull ?? relationPresets.last;

/// How the two feel about each other, from coldest to warmest.
enum Affinity {
  hostile('Hostile'),
  reluctant('Reluctant'),
  neutral('Neutral'),
  friendly('Friendly'),
  trusting('Trusting');

  const Affinity(this.label);
  final String label;

  static Affinity? of(Object? value) => values.where((a) => a.name == value).firstOrNull;
}

/// A built-in type's key, or a type of the author's own: `type:<id>`.
const typePrefix = 'type:';

/// A relationship type the author made, offered beside the built-in ones.
class RelationType {
  RelationType(JsonMap raw) : raw = freezeMap(raw);
  final JsonMap raw;

  String get id => str(raw['id']);
  String get label => str(raw['label']);
  RelationCategory get category => RelationCategory.of(raw['category']);
  String get fromRole => str(raw['fromRole']);
  String get toRole => str(raw['toRole']);
  bool get directional => boolOf(raw['directional']);
  String get key => '$typePrefix$id';
}

class TrackedAttribute {
  const TrackedAttribute(this.key, this.label);
  final String key;
  final String label;

  JsonMap toJson() => {'key': key, 'label': label};
}

/// Attributes offered for tracking. None is tracked until the author chooses it.
const suggestedAttributes = [
  TrackedAttribute('trust', 'Trust'),
  TrackedAttribute('affection', 'Affection'),
  TrackedAttribute('fear', 'Fear'),
  TrackedAttribute('loyalty', 'Loyalty'),
  TrackedAttribute('hostility', 'Hostility'),
  TrackedAttribute('respect', 'Respect'),
];

const attributeMax = 10;

/// A novel's own relationship settings (one `relationSettings` row). No row: built-in types only, nothing tracked.
class RelationSettings {
  RelationSettings(JsonMap? raw) : raw = freezeMap(raw ?? const {});
  final JsonMap raw;

  List<RelationType> get types => [for (final t in maps(raw['types'])) RelationType(t)];
  List<String> get hidden => strings(raw['hidden']);
  List<TrackedAttribute> get attributes => [
    for (final a in maps(raw['attributes'])) TrackedAttribute(str(a['key']), str(a['label'])),
  ];
}

/// A type as a stage uses it: built-in, the novel's own, or Custom when it is neither (or no longer exists).
RelationPreset typeFor(String key, [List<RelationType> types = const []]) {
  if (key.startsWith(typePrefix)) {
    final own = types.where((t) => t.key == key).firstOrNull;
    if (own != null) {
      return RelationPreset(key, own.category, own.label, own.fromRole, own.toRole, directional: own.directional);
    }
  }
  return presetFor(key);
}
