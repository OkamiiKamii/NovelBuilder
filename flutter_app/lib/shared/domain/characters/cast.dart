import 'dart:convert';

import '../collation.dart';
import '../manuscript/prose.dart' show docBlocks;
import '../records/category.dart';
import '../records/entry.dart';
import '../records/link.dart';
import '../records/story_node.dart';
import '../stable_sort.dart';
import '../text/fold.dart';
import 'character_records.dart';

/// A character as the library shows it: the record, its profile, and what is known of where it appears.
class Listed {
  Listed({
    required this.entry,
    required this.profile,
    required this.linkedIn,
    required this.first,
    required this.latest,
    required this.factions,
    this.namedIn = const [],
  });

  final Entry entry;
  final CharacterProfile profile;

  /// Chapters and scenes whose text has a link to this character, in reading order. These are certain.
  final List<String> linkedIn;

  /// Chapters and scenes whose text has the character's name (or alias) where it is not linked (`named_in.dart`).
  final List<String> namedIn;

  /// Where the character is in the book: linked or named (not in reading order across the two; [first] and [latest]
  /// say where).
  late final List<String> seenIn = [...linkedIn, ...namedIn.where((id) => !linkedIn.contains(id))];

  /// Position in the story of the first and latest of [seenIn], or -1.
  final int first;
  final int latest;

  /// Names of the factions and organisations it is linked to.
  final List<String> factions;
}

enum CastSort {
  name('Name'),
  updated('Recently updated'),
  created('Recently created'),
  first('First appearance'),
  appearances('Most appearances'),
  latest('Most recent appearance'),
  custom('My order');

  const CastSort(this.label);
  final String label;

  static CastSort of(Object? value) => values.where((s) => s.name == value).firstOrNull ?? name;
}

class CastFilters {
  const CastFilters({
    this.role = '',
    this.status = '',
    this.tag = '',
    this.species = '',
    this.occupation = '',
    this.faction = '',
    this.firstBy,
    this.archived = false,
  });

  final String role;
  final String status;
  final String tag;
  final String species;
  final String occupation;
  final String faction;

  /// Only characters first linked at or before this chapter (its position in the story).
  final int? firstBy;
  final bool archived;

  static const none = CastFilters();

  /// How many filters beyond the role tabs and the archive are set.
  int get active =>
      [status, tag, species, occupation, faction].where((v) => v.isNotEmpty).length + (firstBy == null ? 0 : 1);

  CastFilters copyWith({
    String? role,
    String? status,
    String? tag,
    String? species,
    String? occupation,
    String? faction,
    int? Function()? firstBy,
    bool? archived,
  }) => CastFilters(
    role: role ?? this.role,
    status: status ?? this.status,
    tag: tag ?? this.tag,
    species: species ?? this.species,
    occupation: occupation ?? this.occupation,
    faction: faction ?? this.faction,
    firstBy: firstBy == null ? this.firstBy : firstBy(),
    archived: archived ?? this.archived,
  );

  /// The same role and archive choice, with every other filter cleared.
  CastFilters cleared() => CastFilters(role: role, archived: archived);
}

/// The value of a field of this name on the entry, if it has one.
String fieldNamed(Entry entry, String name) =>
    entry.fields.where((f) => f.key.trim().toLowerCase() == name.toLowerCase()).firstOrNull?.value.trim() ?? '';

/// Puts each character together with where it appears and what it belongs to. Reads only what it is given.
List<Listed> listCharacters(
  List<Entry> entries,
  Map<String, CharacterProfile> profiles,
  List<Link> links,
  Iterable<StoryNode> nodes,
  Map<String, int> position,
  CharacterProfile Function(Entry entry) fallback, {
  Map<String, List<String>> named = const {},
}) {
  final byId = {for (final e in entries) e.id: e};
  final ordered = stableSorted(
    nodes.where((n) => n.mentions.isNotEmpty),
    (a, b) => (position[a.id] ?? 0) - (position[b.id] ?? 0),
  );
  return [
    for (final entry in entries)
      if (entry.category == 'character') _listed(entry, byId, ordered, links, position, profiles, fallback, named),
  ];
}

Listed _listed(
  Entry entry,
  Map<String, Entry> byId,
  List<StoryNode> ordered,
  List<Link> links,
  Map<String, int> position,
  Map<String, CharacterProfile> profiles,
  CharacterProfile Function(Entry entry) fallback,
  Map<String, List<String>> nameFinds,
) {
  final linkedIn = [
    for (final node in ordered)
      if (node.mentions.contains(entry.id)) node.id,
  ];
  // Named but not linked, in reading order; only chapters and scenes still in the book.
  final namedIn = stableSorted([
    for (final id in nameFinds[entry.id] ?? const <String>[])
      if (position.containsKey(id) && !linkedIn.contains(id)) id,
  ], (a, b) => position[a]! - position[b]!);
  final seen = stableSorted([...linkedIn, ...namedIn], (a, b) => (position[a] ?? 0) - (position[b] ?? 0));
  final factions = <String>[
    for (final link in links)
      if (byId[link.fromId == entry.id ? link.toId : (link.toId == entry.id ? link.fromId : '')] case final other?
          when other.category == 'faction')
        other.name,
  ];
  final value = fieldNamed(entry, 'Faction');
  final named = byId[value]?.name ?? value;
  return Listed(
    entry: entry,
    profile: profiles[entry.id] ?? fallback(entry),
    linkedIn: linkedIn,
    namedIn: namedIn,
    first: seen.isEmpty ? -1 : (position[seen.first] ?? -1),
    latest: seen.isEmpty ? -1 : (position[seen.last] ?? -1),
    factions: {...factions, if (named.isNotEmpty && !byId.containsKey(named)) named}.toList(),
  );
}

/// Whether a character matches what was typed. Every word has to be found somewhere in the character's name,
/// aliases, epithet, summary, roles, status, tags, factions or field values (so "The Oathbreaker" finds the character
/// who carries that title). Long passages are left to project search. It only ever finds records that exist.
bool matchesQuery(Listed listed, String query, [String? Function(String id)? nameOf]) {
  final words = foldText(query).split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toList();
  if (words.isEmpty) return true;
  final entry = listed.entry;
  final profile = listed.profile;
  final haystack = foldText(
    [
      entry.name,
      profile.epithet,
      ...profile.aliases,
      entry.summary,
      ...profile.roles,
      profile.status,
      ...entry.tags,
      ...listed.factions,
      for (final f in entry.fields)
        f.type == FieldType.reference ? (nameOf?.call(f.value) ?? '') : (f.type == FieldType.longtext ? '' : f.value),
    ].join('\n'),
  );
  return words.every(haystack.contains);
}

bool passesFilters(Listed listed, CastFilters filters) {
  final entry = listed.entry;
  final profile = listed.profile;
  bool same(String a, String b) => foldText(a) == foldText(b);
  bool fits(String value, String wanted) => wanted.isEmpty || same(value, wanted);
  if (profile.archived != filters.archived) return false;
  if (filters.role.isNotEmpty && !profile.roles.any((r) => same(r, filters.role))) return false;
  if (!fits(profile.status, filters.status)) return false;
  if (filters.tag.isNotEmpty && !entry.tags.any((t) => same(t, filters.tag))) return false;
  if (!fits(fieldNamed(entry, 'Species'), filters.species)) return false;
  if (!fits(fieldNamed(entry, 'Occupation'), filters.occupation)) return false;
  if (filters.faction.isNotEmpty && !listed.factions.any((f) => same(f, filters.faction))) return false;
  final firstBy = filters.firstBy;
  if (firstBy != null && (listed.first < 0 || listed.first > firstBy)) return false;
  return true;
}

int _sign(num n) => n < 0 ? -1 : (n > 0 ? 1 : 0);

List<Listed> sortCharacters(List<Listed> list, CastSort sort) {
  int name(Listed a, Listed b) => localeCompare(a.entry.name, b.entry.name);
  // Characters that never appear go after those that do, whichever way appearances are ordered.
  int Function(Listed, Listed) seen(int Function(Listed) pick, int direction) => (a, b) {
    final unseen = (pick(a) < 0 ? 1 : 0) - (pick(b) < 0 ? 1 : 0);
    if (unseen != 0) return unseen;
    final by = direction * (pick(a) - pick(b));
    return by != 0 ? by : name(a, b);
  };
  num touched(Listed l) => l.entry.updatedAt > l.profile.updatedAt ? l.entry.updatedAt : l.profile.updatedAt;
  int then(num difference, Listed a, Listed b) => difference != 0 ? _sign(difference) : name(a, b);
  final compare = switch (sort) {
    CastSort.name => name,
    CastSort.updated => (Listed a, Listed b) => then(touched(b) - touched(a), a, b),
    CastSort.created => (Listed a, Listed b) => then(b.entry.createdAt - a.entry.createdAt, a, b),
    CastSort.first => seen((l) => l.first, 1),
    CastSort.latest => seen((l) => l.latest, -1),
    CastSort.appearances => (Listed a, Listed b) => then(b.seenIn.length - a.seenIn.length, a, b),
    CastSort.custom => (Listed a, Listed b) {
      final byOrder = a.profile.order - b.profile.order;
      if (byOrder != 0) return _sign(byOrder);
      return then(a.entry.createdAt - b.entry.createdAt, a, b);
    },
  };
  return stableSorted(list, compare);
}

/// The values in use across the cast for each thing that can be filtered on, for the filter menus.
class Facets {
  Facets(this.roles, this.statuses, this.tags, this.species, this.occupations, this.factions);

  final List<String> roles;
  final List<String> statuses;
  final List<String> tags;
  final List<String> species;
  final List<String> occupations;
  final List<String> factions;

  bool get isEmpty => [statuses, tags, species, occupations, factions].every((l) => l.isEmpty);
}

Facets facetsOf(List<Listed> list) {
  List<String> distinct(Iterable<String> values) {
    final byFold = <String, String>{};
    for (final v in values) {
      if (v.trim().isNotEmpty) byFold[foldText(v)] = v.trim();
    }
    return stableSorted(byFold.values, localeCompare);
  }

  return Facets(
    distinct(list.expand((l) => l.profile.roles)),
    distinct(list.map((l) => l.profile.status)),
    distinct(list.expand((l) => l.entry.tags)),
    distinct(list.map((l) => fieldNamed(l.entry, 'Species'))),
    distinct(list.map((l) => fieldNamed(l.entry, 'Occupation'))),
    distinct(list.expand((l) => l.factions)),
  );
}

String _escape(String text) => text.replaceAllMapped(RegExp(r'[.*+?^${}()|[\]\\]'), (m) => '\\${m[0]}');

/// How many times a character's name, aliases or epithet occur in some text, as whole words. A count of words on the
/// page and nothing more: a name spoken in someone else's dialogue is counted, and it says nothing about whether the
/// character is present. Links are what record that.
int countMentions(Iterable<String> texts, Iterable<String> names) {
  final wanted = stableSorted(
    {for (final n in names) n.trim()}.where((n) => n.length >= 2),
    (a, b) => b.length - a.length,
  );
  if (wanted.isEmpty) return 0;
  final pattern = RegExp(
    '(?<![\\p{L}\\p{N}_])(?:${wanted.map(_escape).join('|')})(?![\\p{L}\\p{N}_])',
    caseSensitive: false,
    unicode: true,
  );
  return texts.fold(0, (n, text) => n + pattern.allMatches(text).length);
}

/// [countMentions] over the chapters as stored ([storedContents]: each chapter's record as JSON text, as
/// `NovelStore.rawJsonIn` reads them), as a job for an isolate (`background.dart`): decoding the book and reading out
/// its text is done there, away from the screen. Made at the top level and holding only plain data, so it can be sent.
/// A record that cannot be read counts as an empty chapter.
int Function() mentionsJob(List<String> storedContents, List<String> names) =>
    () => countMentions([
      for (final json in storedContents)
        for (final block in docBlocks(_docOf(json))) block.text,
    ], names);

Object? _docOf(String json) {
  try {
    final row = jsonDecode(json);
    return row is Map ? row['doc'] : null;
  } on FormatException {
    return null;
  }
}
