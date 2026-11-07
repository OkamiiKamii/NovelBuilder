import '../json.dart';
import '../json_record.dart';
import 'category.dart';

/// One attribute of an entry. `defId` ties it to a field of the entry's category; without it, the field belongs to
/// this entry alone. Values are text whatever the type (see [FieldType]).
class EntryField {
  EntryField(JsonMap raw) : raw = freezeMap(raw);
  final JsonMap raw;

  String get id => str(raw['id']);
  String get key => str(raw['key']);
  String get value => str(raw['value']);
  FieldType? get type => FieldType.of(raw['type']);
  List<String> get options => strings(raw['options']);
  String? get defId => idOrNull(raw['defId']);
}

/// A codex entry: a character, location, faction, item, power, piece of lore, or a record of a kind the author made.
/// They are told apart by [category], so there is one place for all of them and one way to link them.
class Entry extends JsonRecord {
  Entry(super.raw);

  /// A category key: a built-in one or `custom-…`.
  String get category => str(raw['category']);
  String get name => str(raw['name']);
  String get summary => str(raw['summary']);
  String get description => str(raw['description']);

  /// An http(s) image URL, or an uploaded image stored as a data URL.
  String? get image => strOrNull(raw['image']);

  /// Private to the author.
  String get notes => str(raw['notes']);
  List<String> get tags => strings(raw['tags']);
  List<EntryField> get fields => [for (final f in maps(raw['fields'])) EntryField(f)];

  /// For a place: its level in the novel's place hierarchy.
  String? get placeLevel => idOrNull(raw['placeLevel']);
  num get createdAt => numOrNull(raw['createdAt']) ?? 0;
  num get updatedAt => numOrNull(raw['updatedAt']) ?? 0;

  Entry withFields(JsonMap changes) => Entry(merged(changes));

  Entry renamed(String name) => withFields({'name': name});
}

/// An entry's stored values lined up with its category's field set. Nothing is ever dropped: a value whose field was
/// archived is in [archived]; a value whose field is gone, or belongs to another category, is in [own].
class FieldView {
  FieldView(this.category, this.own, this.archived);

  final List<(FieldDef def, EntryField? field)> category;
  final List<EntryField> own;
  final List<(FieldDef def, EntryField field)> archived;
}

FieldView viewFields(Entry entry, Category category) {
  final claimed = <String>{};
  final fields = entry.fields;
  final byDef = {
    for (final f in fields)
      if (f.defId != null) f.defId!: f,
  };
  final forCategory = <(FieldDef, EntryField?)>[];
  for (final def in category.fields.where((d) => !d.archived)) {
    // A value written before the field set existed is matched by name, once.
    final field =
        byDef[def.id] ??
        fields
            .where(
              (f) =>
                  f.defId == null &&
                  !claimed.contains(f.id) &&
                  f.key.trim().toLowerCase() == def.name.trim().toLowerCase(),
            )
            .firstOrNull;
    if (field != null) claimed.add(field.id);
    forCategory.add((def, field));
  }
  final archived = <(FieldDef, EntryField)>[];
  for (final def in category.fields.where((d) => d.archived)) {
    final field = byDef[def.id];
    if (field == null || field.value.trim().isEmpty) continue;
    claimed.add(field.id);
    archived.add((def, field));
  }
  final known = {for (final d in category.fields) d.id};
  final own = [
    for (final f in fields)
      if (!claimed.contains(f.id) && (f.defId == null || !known.contains(f.defId))) f,
  ];
  return FieldView(forCategory, own, archived);
}
