import '../json.dart';
import '../json_record.dart';

enum NovelStatus {
  planning('Planning'),
  drafting('Drafting'),
  revising('Revising'),
  complete('Complete'),
  onHold('On hold', key: 'on-hold');

  const NovelStatus(this.label, {String? key}) : _key = key;
  final String label;
  final String? _key;
  String get key => _key ?? name;

  static NovelStatus of(Object? value) => values.firstWhere((s) => s.key == value, orElse: () => planning);
}

/// A novel (the original app's `Project`): its metadata. Everything else it owns lives in its own collections,
/// each row naming it by `projectId`.
class Novel extends JsonRecord {
  Novel(super.raw);

  /// A novel's own id is `id`; [projectId] reads the same, so code can treat it like any other row.
  @override
  String get projectId => id;

  String get title => str(raw['title']);
  String get subtitle => str(raw['subtitle']);
  String get author => str(raw['author']);
  String get primaryGenre => str(raw['primaryGenre']);
  List<String> get secondaryGenres => strings(raw['secondaryGenres']);
  List<String> get tags => strings(raw['tags']);
  String get synopsis => str(raw['synopsis']);
  NovelStatus get status => NovelStatus.of(raw['status']);
  int? get targetWordCount => intOrNull(raw['targetWordCount']);

  /// yyyy-mm-dd, or null.
  String? get deadline => strOrNull(raw['deadline']);
  String get language => str(raw['language']);
  String get accent => str(raw['accent'], '#b4532a');
  bool get pinned => boolOf(raw['pinned']);
  bool get archived => boolOf(raw['archived']);
  num get createdAt => numOrNull(raw['createdAt']) ?? 0;
  num get updatedAt => numOrNull(raw['updatedAt']) ?? 0;

  /// When it was last opened. Null: never, on this or any device it came from.
  num? get lastOpenedAt => numOrNull(raw['lastOpenedAt']);

  /// An http(s) image URL, or an uploaded image stored as a data URL.
  String? get cover => strOrNull(raw['cover']);

  /// Visualize views this novel has turned off, by key. Keys this version does not know are kept.
  List<String> get viewsOff => strings(raw['viewsOff']);

  Novel withFields(JsonMap changes) => Novel(merged(changes));
}

/// Colours a novel can be marked with in the library, as in the original app.
const novelAccents = ['#b4532a', '#8a6d1f', '#3f7d4e', '#2b7a8c', '#3d5fa8', '#7a4fa3', '#a8436b', '#5c6370'];

/// The accent colours' names, so a colour is never told apart by colour alone.
const novelAccentNames = ['Rust', 'Ochre', 'Moss', 'Teal', 'Blue', 'Violet', 'Rose', 'Slate'];

/// Genres offered while typing. Only suggestions: any genre can be typed, and none is assumed.
const genreSuggestions = [
  'Fantasy', 'Sci-Fi', 'LitRPG', 'Action', 'Adventure', 'Progression Fantasy', 'Cultivation', 'Romance', //
  'Mystery', 'Thriller', 'Horror', 'Historical', 'Slice of Life', 'Comedy', 'Drama', 'Dystopian',
];

/// The fields of a novel the author edits, cleaned the way the original app's `normalizeInput` cleaned them (from
/// forms and from imported files alike). Other fields of the novel are not part of this and are kept as they are.
JsonMap normalizeNovelDetails(JsonMap input) {
  List<String> list(Object? v) {
    final seen = <String>{};
    return [
      for (final s in strings(v).map((s) => s.trim()))
        if (s.isNotEmpty && seen.add(s)) s,
    ];
  }

  final primary = str(input['primaryGenre']).trim().isNotEmpty
      ? str(input['primaryGenre']).trim()
      : str(input['genre']).trim();
  final target = input['targetWordCount'] is num
      ? input['targetWordCount']! as num
      : num.tryParse(str(input['targetWordCount']));
  final deadline = str(input['deadline']);
  final cover = str(input['cover']);
  final accent = str(input['accent']);
  final status = NovelStatus.values.where((s) => s.key == input['status']).firstOrNull ?? NovelStatus.planning;
  return {
    'title': str(input['title']).trim().isEmpty ? 'Untitled novel' : str(input['title']).trim(),
    'subtitle': str(input['subtitle']).trim(),
    'author': str(input['author']).trim(),
    'primaryGenre': primary,
    'secondaryGenres': [
      for (final g in list(input['secondaryGenres']))
        if (g.toLowerCase() != primary.toLowerCase()) g,
    ],
    'cover':
        cover.length <= 2000000 &&
            RegExp(r'^(https?://\S+$|data:image/(png|jpeg|webp|gif);base64,)', caseSensitive: false).hasMatch(cover)
        ? cover
        : null,
    'tags': list(input['tags']),
    'synopsis': str(input['synopsis']).trim(),
    'status': status.key,
    'targetWordCount': target != null && target.isFinite && target > 0 ? target.round() : null,
    'deadline': RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(deadline) ? deadline : null,
    'language': str(input['language']).trim().isEmpty ? 'en' : str(input['language']).trim(),
    'accent': RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(accent) ? accent : novelAccents.first,
  };
}

/// Splits "LitRPG, Action" into its parts, as the form's comma-separated fields are typed.
List<String> splitList(String text) => [
  for (final s in text.split(','))
    if (s.trim().isNotEmpty) s.trim(),
];
