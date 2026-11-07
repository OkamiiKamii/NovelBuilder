import '../json.dart';
import '../json_record.dart';
import '../records/category.dart';

/// WHERE A CHARACTER LIVES (as in the original app)
/// A character is a codex entry of the Characters category: one record, with one id, used by every feature that
/// refers to a character (links in the manuscript, relationships, events, plot threads, sheets, progression, search).
/// Its name, summary, portrait, tags and field values are that entry's.
///
/// Everything here hangs off that entry by its id and adds what a profile needs on top: how the profile is laid out,
/// the character's secrets, the author's notes on them, and a record of changes. Nothing here is a second copy of the
/// character.

/// Roles offered by default. A character may have several, and any text is accepted as a role of the author's own.
const characterRoles = ['Protagonist', 'Antagonist', 'Supporting', 'Minor', 'Background'];
const characterStatuses = ['Alive', 'Deceased', 'Missing', 'Unknown'];

enum ProfileTab {
  overview('Overview'),
  details('Details');

  const ProfileTab(this.label);
  final String label;

  /// Anything but `details` is the overview, as the original reads it.
  static ProfileTab of(Object? value) => value == 'details' ? details : overview;
}

/// A named group of fields on a profile. The fields are the entry's own; a section only says which, and in what order.
class ProfileSection {
  ProfileSection(JsonMap raw) : raw = freezeMap(raw);
  final JsonMap raw;

  String get id => str(raw['id']);
  String get name => str(raw['name']);
  ProfileTab get tab => ProfileTab.of(raw['tab']);
  bool get hidden => boolOf(raw['hidden']);

  /// Ids of the entry's fields, in display order.
  List<String> get fieldIds => strings(raw['fieldIds']);

  JsonMap toJson() => deepCopy(raw)! as JsonMap;
  ProfileSection merged(JsonMap changes) => ProfileSection({...toJson(), ...deepCopy(changes)! as JsonMap});
}

/// The point of the portrait to keep in view when it is cropped, as percentages from the left and top.
typedef Focal = ({double x, double y});

class CharacterProfile extends JsonRecord {
  CharacterProfile(super.raw);

  /// The codex entry this is the profile of.
  String get entryId => str(raw['entryId']);

  /// A title or epithet: "The Oathbreaker".
  String get epithet => str(raw['epithet']);
  List<String> get aliases => strings(raw['aliases']);
  List<String> get roles => strings(raw['roles']);

  /// Alive, Deceased… or the author's own word. Empty when not recorded.
  String get status => str(raw['status']);

  /// Put away: out of the library unless asked for, but nothing about it is removed and every reference still works.
  bool get archived => boolOf(raw['archived']);
  Focal get focal {
    final f = mapOrNull(raw['focal']) ?? const {};
    return (x: (numOrNull(f['x']) ?? 50).toDouble(), y: (numOrNull(f['y']) ?? 30).toDouble());
  }

  /// Place in the author's own ordering of the library.
  num get order => numOrNull(raw['order']) ?? 0;
  List<ProfileSection> get sections => [for (final s in maps(raw['sections'])) ProfileSection(s)];

  /// How each link to another entry stands (an affiliation that is Former, or Secret), by link id.
  Map<String, String> get linkStatus => {
    for (final e in (mapOrNull(raw['linkStatus']) ?? const {}).entries)
      if (e.value is String) e.key: e.value! as String,
  };
  num get createdAt => numOrNull(raw['createdAt']) ?? 0;
  num get updatedAt => numOrNull(raw['updatedAt']) ?? 0;

  CharacterProfile withFields(JsonMap changes) => CharacterProfile(merged(changes));
}

/// Whether someone knows a secret, in the simple form a secret keeps for the character and the reader.
enum Knowledge {
  knows('Knows'),
  suspects('Suspects'),
  unaware('Unaware');

  const Knowledge(this.label);
  final String label;

  static Knowledge? of(Object? value) => values.where((k) => k.name == value).firstOrNull;
}

const secretStatuses = ['Hidden', 'Hinted', 'Partly revealed', 'Revealed'];

/// What a character holds about a secret, kept apart from what is true. "Not recorded" is not one of these: it is the
/// absence of a record, and nothing is assumed from it.
enum Awareness {
  knows('Knows'),
  partial('Knows part of it'),
  believes('Believes it, unconfirmed'),
  suspects('Suspects'),
  falseBelief('Believes something false', key: 'false'),
  unaware('Unaware');

  const Awareness(this.label, {String? key}) : _key = key;
  final String label;
  final String? _key;

  /// The stored word (`false` for [falseBelief]).
  String get key => _key ?? name;

  static Awareness? of(Object? value) => values.where((a) => a.key == value).firstOrNull;
}

/// One thing the author records about what one character holds of a secret, at one point. A change is a new record:
/// earlier ones stay.
class KnowledgeRecord {
  KnowledgeRecord(JsonMap raw) : raw = freezeMap(raw);
  final JsonMap raw;

  String get id => str(raw['id']);
  String get characterId => str(raw['characterId']);

  /// Null for a state this version does not know; the record is kept as stored.
  Awareness? get state => Awareness.of(raw['state']);

  /// Their version: the part they know, what they suspect, or the false thing they believe instead.
  String get belief => str(raw['belief']);
  String? get nodeId => idOrNull(raw['nodeId']);
  String? get eventId => idOrNull(raw['eventId']);
  String get how => str(raw['how']);
  String? get fromId => idOrNull(raw['fromId']);
}

/// The author's mark that a character acts on knowing the secret at a point.
class KnowledgeNeed {
  KnowledgeNeed(JsonMap raw) : raw = freezeMap(raw);
  final JsonMap raw;

  String get id => str(raw['id']);
  String get characterId => str(raw['characterId']);
  String? get nodeId => idOrNull(raw['nodeId']);
  String? get eventId => idOrNull(raw['eventId']);
  String get note => str(raw['note']);
}

/// Something true in the story that is not common knowledge. Kept apart: what is true ([description]), whether the
/// character themself knows it ([self]), which other characters know or suspect it, and what the reader knows.
class CharacterSecret extends JsonRecord {
  CharacterSecret(super.raw);

  String get entryId => str(raw['entryId']);
  String get title => str(raw['title']);
  String get description => str(raw['description']);
  String get status => str(raw['status'], 'Hidden');
  Knowledge get self => Knowledge.of(raw['self']) ?? Knowledge.knows;
  List<String> get knows => strings(raw['knows']);
  List<String> get suspects => strings(raw['suspects']);
  List<String> get unaware => strings(raw['unaware']);
  List<String> listed(Knowledge k) => switch (k) {
    Knowledge.knows => knows,
    Knowledge.suspects => suspects,
    Knowledge.unaware => unaware,
  };
  Knowledge get reader => Knowledge.of(raw['reader']) ?? Knowledge.unaware;
  String? get readerNodeId => idOrNull(raw['readerNodeId']);
  String? get firstNodeId => idOrNull(raw['firstNodeId']);
  String? get revealNodeId => idOrNull(raw['revealNodeId']);
  String? get revealEventId => idOrNull(raw['revealEventId']);
  List<String> get nodeIds => strings(raw['nodeIds']);
  List<String> get threadIds => strings(raw['threadIds']);
  String get notes => str(raw['notes']);

  /// How knowledge of it spreads, when the author records it. Missing on older rows.
  List<KnowledgeRecord> get records => [for (final r in maps(raw['records'])) KnowledgeRecord(r)];
  List<KnowledgeNeed> get needs => [for (final n in maps(raw['needs'])) KnowledgeNeed(n)];
  num get createdAt => numOrNull(raw['createdAt']) ?? 0;
  num get updatedAt => numOrNull(raw['updatedAt']) ?? 0;

  CharacterSecret withFields(JsonMap changes) => CharacterSecret(merged(changes));
}

/// A loose note about a character. It is not part of the character's established record until the author copies it
/// there.
class CharacterNote extends JsonRecord {
  CharacterNote(super.raw);

  String get entryId => str(raw['entryId']);
  String get title => str(raw['title']);
  String get content => str(raw['content']);
  List<String> get tags => strings(raw['tags']);
  bool get pinned => boolOf(raw['pinned']);

  /// Chapters and scenes it is about.
  List<String> get nodeIds => strings(raw['nodeIds']);
  num get createdAt => numOrNull(raw['createdAt']) ?? 0;
  num get updatedAt => numOrNull(raw['updatedAt']) ?? 0;
}

/// One line of a character's history. Two kinds, never mixed up:
///  - `record`: something the author did to the record ("changed Occupation from Soldier to Commander"), written by
///    the app when it happens;
///  - `story`: something that happens to the character in the story ("became commander"), which the author writes
///    down and may tie to a chapter.
class CharacterHistoryLine extends JsonRecord {
  CharacterHistoryLine(super.raw);

  String get entryId => str(raw['entryId']);
  num get at => numOrNull(raw['at']) ?? 0;
  bool get isStory => raw['kind'] == 'story';
  String get kind => str(raw['kind'], 'record');

  /// For a record line: `created`, `field`, `identity`, `section`, `archived`, `restored`, `portrait`, `template`,
  /// `note`.
  String get action => str(raw['action']);
  String get label => str(raw['label']);
  String get from => str(raw['from']);
  String get to => str(raw['to']);

  /// A story line's own words.
  String get text => str(raw['text']);
  String? get nodeId => idOrNull(raw['nodeId']);
}

/// A field a section suggests. Only a suggestion: nothing is stored until the author adds it.
class FieldSuggestion {
  const FieldSuggestion(this.name, [this.type = FieldType.text, this.options = const []]);

  factory FieldSuggestion.fromJson(JsonMap json) =>
      FieldSuggestion(str(json['name']), FieldType.of(json['type']) ?? FieldType.text, strings(json['options']));

  final String name;
  final FieldType type;
  final List<String> options;

  JsonMap toJson() => {
    'name': name,
    'type': type.name,
    if (options.isNotEmpty) 'options': [...options],
  };
}

class TemplateSection {
  const TemplateSection(this.name, this.tab, this.fields);

  factory TemplateSection.fromJson(JsonMap json) => TemplateSection(str(json['name']), ProfileTab.of(json['tab']), [
    for (final f in maps(json['fields'])) FieldSuggestion.fromJson(f),
  ]);

  final String name;
  final ProfileTab tab;
  final List<FieldSuggestion> fields;

  JsonMap toJson() => {
    'name': name,
    'tab': tab.name,
    'fields': [for (final f in fields) f.toJson()],
  };
}

/// A starting layout for a profile: its sections, and the fields each one offers. The built-in ones have no project.
class CharacterTemplate {
  const CharacterTemplate({
    required this.id,
    required this.projectId,
    required this.name,
    required this.description,
    required this.sections,
    this.createdAt = 0,
    this.raw,
  });

  /// A project's saved layout (a row of `characterTemplates`).
  factory CharacterTemplate.fromJson(JsonMap json) => CharacterTemplate(
    id: str(json['id']),
    projectId: strOrNull(json['projectId']),
    name: str(json['name']),
    description: str(json['description']),
    sections: [for (final s in maps(json['sections'])) TemplateSection.fromJson(s)],
    createdAt: numOrNull(json['createdAt']) ?? 0,
    raw: freezeMap(json),
  );

  final String id;

  /// Null for the ones that come with the app.
  final String? projectId;
  final String name;
  final String description;
  final List<TemplateSection> sections;
  final num createdAt;

  /// The stored row, for a saved one.
  final JsonMap? raw;

  bool get builtin => projectId == null;
}
