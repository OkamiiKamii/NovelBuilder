import '../json.dart';
import '../records/category.dart' show FieldType;
import '../records/entry.dart';
import '../relationships/relation_changes.dart';
import 'character_changes.dart';
import 'character_records.dart';
import 'one_line.dart';

/// Records on a new character what their line said ([readOneLine]): each field in the profile's first section of
/// who they are (Core Identity, or else the first on the overview), a place of origin the world already holds as a
/// link to it, and each tie as a relationship of its kind, who is which as the line said.
void recordFromLine(CharacterChanges c, String entryId, Map<String, String> fields, List<LineTie> ties) {
  if (fields.isNotEmpty) {
    final profile = c.profileOf(c.character(entryId));
    final section =
        profile.sections.where((s) => s.name == 'Core Identity').firstOrNull ??
        profile.sections.where((s) => s.tab == ProfileTab.overview).firstOrNull ??
        profile.sections.firstOrNull;
    if (section != null) {
      for (final MapEntry(key: name, value: value) in fields.entries) {
        final place = name == 'Place of Origin'
            ? c
                  .rows('loreEntries')
                  .where((e) => e['category'] == 'location' && Entry(e).name.toLowerCase() == value.toLowerCase())
                  .firstOrNull
            : null;
        c.addField(
          entryId,
          section.id,
          place == null ? FieldSuggestion(name) : FieldSuggestion(name, FieldType.reference),
          value: place == null ? value : str(place['id']),
        );
      }
    }
  }
  if (ties.isNotEmpty) {
    final r = RelationChanges(c.snapshot, now: c.now, createId: c.newId);
    for (final t in ties) {
      if (r.row('loreEntries', t.otherId) == null) continue;
      if (t.newIsFrom) {
        r.createRelation(entryId, t.otherId, t.preset);
      } else {
        r.createRelation(t.otherId, entryId, t.preset);
      }
    }
    c.snapshot = r.snapshot;
  }
}
