import '../collation.dart';
import '../json.dart';
import '../json_record.dart';

/// Field types for custom fields. Values are always stored as text, whatever the type, so retyping a field can never
/// destroy what was written: number "42"; toggle "yes"/"no"; date "yyyy-mm-dd"; several choices or tags one per
/// line; a link the linked entry's id; several links their ids, one per line.
enum FieldType {
  text('Short text'),
  longtext('Long text'),
  number('Number'),
  select('Choice (one)'),
  multiselect('Choice (several)'),
  tags('Tags / list'),
  toggle('Yes / No'),
  date('Date'),
  reference('Link to an entry'),
  references('Links to several entries');

  const FieldType(this.label);
  final String label;

  bool get isLink => this == reference || this == references;

  static FieldType? of(Object? value) {
    for (final t in values) {
      if (t.name == value) return t;
    }
    return null;
  }
}

/// One field of a category's field set.
///
/// NON-DESTRUCTIVE SCHEMA RULE: a field is never deleted, only archived. Values entries hold for it stay stored.
class FieldDef {
  FieldDef(JsonMap raw) : raw = freezeMap(raw);
  final JsonMap raw;

  /// Permanent: entries store their value against it, so the field can be renamed or retyped freely.
  String get id => str(raw['id']);
  String get name => str(raw['name']);

  /// Null for a type this version does not know (kept as stored, shown as text).
  FieldType? get type => FieldType.of(raw['type']);
  List<String> get options => strings(raw['options']);
  bool get archived => boolOf(raw['archived']);

  /// Checked and shown, never enforced: an entry can be saved half-done.
  bool get required => boolOf(raw['required']);
  String? get help => strOrNull(raw['help']);
  num? get min => numOrNull(raw['min']);
  num? get max => numOrNull(raw['max']);

  /// For a link: the category key linked entries should have; any when absent.
  String? get target => strOrNull(raw['target']);
}

/// The categories every project starts with. Their keys are fixed; names, colours and fields can change.
const builtinCategoryKeys = ['character', 'location', 'faction', 'item', 'power', 'lore'];

const _builtinNames = {
  'character': ('Characters', 'Character', '#b4532a'),
  'location': ('Locations', 'Location', '#3f7d4e'),
  'faction': ('Factions & Species', 'Faction / Species', '#3d5fa8'),
  'item': ('Items & Artifacts', 'Item / Artifact', '#8a6d1f'),
  'power': ('Power Systems & Rules', 'Power System / Rule', '#7a4fa3'),
  'lore': ('Lore & History', 'Lore / History', '#5c6370'),
};

const _suggestedFields = {
  'character': <String>[],
  'location': ['Type', 'Region', 'Notable features'],
  'faction': ['Type', 'Leader', 'Goals'],
  'item': ['Type', 'Owner', 'Abilities'],
  'power': ['Rules', 'Costs & limits', 'Tiers'],
  'lore': ['When', 'Who was involved', 'Consequences'],
};

/// A codex category with its field set: a built-in (with the project's changes) or one the author created.
/// A project's stored version of one is a row of `loreSchemas`.
class Category extends JsonRecord {
  Category(super.raw);

  /// A built-in category as it is before the author changes anything. Its field ids are fixed
  /// (`builtin-<key>-<n>`), so values written before the project customised anything are still found.
  factory Category.builtin(String key) {
    final (name, singular, color) = _builtinNames[key]!;
    return Category({
      'key': key,
      'name': name,
      'singular': singular,
      'color': color,
      'builtin': true,
      'order': builtinCategoryKeys.indexOf(key),
      'fields': [
        for (final (i, f) in _suggestedFields[key]!.indexed)
          {'id': 'builtin-$key-$i', 'name': f, 'type': 'longtext', 'options': <String>[]},
      ],
    });
  }

  /// Stands in for a category that cannot be found. Nothing is lost if this happens.
  factory Category.unknown(String key) => Category({
    'key': key,
    'name': 'Uncategorised',
    'singular': 'Entry',
    'color': '#5c6370',
    'builtin': false,
    'order': 9999,
    'fields': <Object?>[],
  });

  String get key => str(raw['key']);
  String get name => str(raw['name']);
  String get singular => str(raw['singular']);
  String get color => str(raw['color']);
  bool get builtin => boolOf(raw['builtin']);
  num get order => numOrNull(raw['order']) ?? 0;
  bool get archived => boolOf(raw['archived']);
  List<FieldDef> get fields => [for (final f in maps(raw['fields'])) FieldDef(f)];

  /// Which fields the views read, set by the author and never worked out from field names (`uses` in the file).
  JsonMap get uses => mapOrNull(raw['uses']) ?? const {};
}

/// A project's categories: the built-ins (with any changes) followed by its own, in order.
List<Category> resolveCategories(List<Category> stored) {
  final byKey = {for (final c in stored) c.key: c};
  final builtins = [for (final key in builtinCategoryKeys) byKey[key] ?? Category.builtin(key)];
  final custom = [
    for (final c in stored)
      if (!builtinCategoryKeys.contains(c.key)) c,
  ];
  return [...builtins, ...custom]..sort((a, b) {
    final byOrder = a.order.compareTo(b.order);
    return byOrder != 0 ? byOrder : localeCompare(a.name, b.name);
  });
}
