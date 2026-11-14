import '../records/category.dart' show FieldType;
import 'character_changes.dart';
import 'character_records.dart';
import 'likeness.dart';
import 'looks.dart';
import 'stakes.dart';
import 'this_or_that.dart';

/// Records [value] as the character's [feature] (`looks.dart`): in the field they keep it in already ("Eyes", "Eye
/// colour"), else as a new field in the profile's appearance section (or its first of who they are).
void recordLook(CharacterChanges c, String entryId, Feature feature, String value) =>
    recordAppearance(c, entryId, feature.label, feature.fieldNames, value);

/// Records [value] in the field named [label] (or one of [names], in lower case, that they keep it in already), else
/// as a new field [label] in the profile's appearance section (or its first of who they are).
void recordAppearance(CharacterChanges c, String entryId, String label, List<String> names, String value) =>
    recordIn(c, entryId, label, names, value, sections: const ['appearance'], newSection: 'Appearance');

/// Records [value] in the field named [label] (or one of [names], in lower case, that they keep it in already), else
/// as a new field [label] in the first section whose name holds one of [sections] (or their first of who they are).
/// A profile with no section at all is given one, [newSection], so what was chosen is never lost.
void recordIn(
  CharacterChanges c,
  String entryId,
  String label,
  List<String> names,
  String value, {
  required List<String> sections,
  required String newSection,
  FieldType type = FieldType.text,
}) {
  final entry = c.character(entryId);
  final field = entry.fields.where((f) => names.contains(f.key.trim().toLowerCase())).firstOrNull;
  if (field != null) {
    c.updateField(entryId, field.id, value: value);
    return;
  }
  ProfileSection? sectionOf(CharacterProfile profile) =>
      [
        for (final want in sections) ...profile.sections.where((s) => s.name.toLowerCase().contains(want)),
      ].firstOrNull ??
      profile.sections.where((s) => s.name == 'Core Identity').firstOrNull ??
      profile.sections.where((s) => s.tab == ProfileTab.overview).firstOrNull ??
      profile.sections.firstOrNull;
  var section = sectionOf(c.profileOf(entry));
  if (section == null) {
    c.addSection(entryId, newSection);
    section = sectionOf(c.profileOf(c.character(entryId)));
    if (section == null) return;
  }
  c.addField(entryId, section.id, FieldSuggestion(label, type), value: value);
}

/// Records the face drawn in "Draw their face": the hair, the eyes and the skin in their fields (only what was chosen,
/// and only where it changed), and each mark not already written added to Distinguishing Features, after what is
/// there. Nothing written is taken away.
void recordFace(CharacterChanges c, String entryId, Likeness was, Likeness now) {
  final before = wordsFor(was);
  final after = wordsFor(now);
  if (after.hair != null && (now.hair != was.hair || now.cut != was.cut || now.curly != was.curly)) {
    recordAppearance(c, entryId, 'Hair', const ['hair', 'hair colour', 'hair color'], after.hair!);
  }
  if (after.eyes != null && now.eyes != was.eyes) {
    recordAppearance(c, entryId, 'Eyes', const ['eyes', 'eye colour', 'eye color', 'eye'], after.eyes!);
  }
  if (after.skin != null && (now.skin != was.skin || now.skinFamily != was.skinFamily)) {
    recordAppearance(c, entryId, 'Skin', const ['skin', 'skin tone', 'complexion'], after.skin!);
  }
  final added = [
    for (final m in after.marks)
      if (!before.marks.contains(m)) m,
  ];
  if (added.isEmpty) return;
  final entry = c.character(entryId);
  final field = entry.fields
      .where((f) => const ['distinguishing features', 'features'].contains(f.key.trim().toLowerCase()))
      .firstOrNull;
  final text = added.join(', ');
  final written = field?.value.trim() ?? '';
  final value = written.isEmpty
      ? '${text[0].toUpperCase()}${text.substring(1)}.'
      : '${written.replaceFirst(RegExp(r'[.\s]*$'), '')}; $text.';
  recordAppearance(c, entryId, 'Distinguishing Features', const ['distinguishing features', 'features'], value);
}

/// Records [value] as the character's answer to [stake] (`stakes.dart`): in the field that answers it already, else as
/// a new field of the stake's own name in their goals, stakes, arc or role in the story.
void recordStake(CharacterChanges c, String entryId, Stake stake, String value) => recordIn(
  c,
  entryId,
  stake.field,
  stake.fieldNames,
  value,
  sections: const ['goals', 'stakes', 'opposition', 'role in the story', 'arc'],
  newSection: 'Goals & Stakes',
);

/// Records the deck's choices (`this_or_that.dart`) in the character's Core Traits (or the traits field they keep),
/// one to a line; else a new Core Traits list in their personality.
void recordTraits(CharacterChanges c, String entryId, Map<String, int?> sides) {
  const names = ['core traits', 'traits', 'personality traits', 'personality'];
  final entry = c.character(entryId);
  final stored = entry.fields.where((f) => names.contains(f.key.trim().toLowerCase())).firstOrNull?.value ?? '';
  recordIn(
    c,
    entryId,
    'Core Traits',
    names,
    traitsAfter(stored, sides),
    sections: const ['personality', 'psychology'],
    newSection: 'Personality & Psychology',
    type: FieldType.tags,
  );
}
