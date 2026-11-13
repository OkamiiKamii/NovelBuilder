import 'character_changes.dart';
import 'character_records.dart';
import 'looks.dart';

/// Records [value] as the character's [feature] (`looks.dart`): in the field they keep it in already ("Eyes", "Eye
/// colour"), else as a new field in the profile's appearance section (or its first of who they are).
void recordLook(CharacterChanges c, String entryId, Feature feature, String value) {
  final entry = c.character(entryId);
  final field = entry.fields.where((f) => feature.fieldNames.contains(f.key.trim().toLowerCase())).firstOrNull;
  if (field != null) {
    c.updateField(entryId, field.id, value: value);
    return;
  }
  final profile = c.profileOf(entry);
  final section =
      profile.sections.where((s) => s.name.toLowerCase().contains('appearance')).firstOrNull ??
      profile.sections.where((s) => s.name == 'Core Identity').firstOrNull ??
      profile.sections.where((s) => s.tab == ProfileTab.overview).firstOrNull ??
      profile.sections.firstOrNull;
  if (section == null) return;
  c.addField(entryId, section.id, FieldSuggestion(feature.label), value: value);
}
