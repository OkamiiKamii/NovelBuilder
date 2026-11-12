import '../json.dart';
import 'system_presets.dart';

/// YOUR BOOK'S OWN SYSTEM: the system a novel's pages already describe, put together from them, ready to begin.
///
/// - **Which kind**: the preset whose words the chapters use most ("skill", "level", "class" for a game system;
///   "qi", "realm", "sect" for cultivation; "spell", "mana", "rune" for hard magic; "hero", "powers", "villain" for
///   superheroes), counted as whole words, any case.
/// - **What it already holds**: the novel's powers (its Power System entries, and those its chapters call a skill or
///   a spell, `world_finder.dart`), set as the preset's own kind of ability (Skills, Techniques, Spells, Powers) in
///   place of the preset's examples there.
/// - **Who holds them**: the protagonist (or, with none named so, the character most in the book) gets a sheet
///   holding every one of them.
///
/// Only what is counted. Nothing is made until the author begins it, and everything in it can be changed after.
typedef PagesSystem = ({
  SystemPreset preset,
  List<({String word, int times})> signs,
  List<String> powers,
  String abilityGroup,
  JsonMap content,
});

const _words = {
  'litrpg': [
    'level',
    'levels',
    'leveled',
    'skill',
    'skills',
    'class',
    'stats',
    'stat',
    'xp',
    'experience',
    'quest',
    'dungeon',
    'status',
    'system',
    'title',
    'hp',
    'party',
    'loot',
    'boss',
    'rank',
  ],
  'cultivation': [
    'qi',
    'realm',
    'realms',
    'cultivation',
    'cultivate',
    'cultivator',
    'sect',
    'dao',
    'meridian',
    'meridians',
    'breakthrough',
    'elder',
    'pill',
    'pills',
    'disciple',
    'tribulation',
    'dantian',
    'technique',
    'techniques',
  ],
  'hard-magic': [
    'spell',
    'spells',
    'mana',
    'rune',
    'runes',
    'sigil',
    'sigils',
    'wizard',
    'mage',
    'magic',
    'sorcery',
    'ward',
    'wards',
    'incantation',
    'arcane',
    'caster',
    'enchantment',
    'grimoire',
  ],
  'superhero': [
    'hero',
    'heroes',
    'villain',
    'villains',
    'superpower',
    'superpowers',
    'powers',
    'mutant',
    'mask',
    'cape',
    'suit',
    'vigilante',
    'sidekick',
    'origin',
  ],
};

/// Each preset's own kind of ability, where the novel's powers go.
const _abilityGroup = {'litrpg': 'Skills', 'cultivation': 'Techniques', 'hard-magic': 'Spells', 'superhero': 'Powers'};

/// This many words of a kind, or a power the novel already has, is enough to offer a system.
const pagesSystemAtLeast = 3;

final _word = RegExp(r'\p{L}+', unicode: true);

/// The system [texts] (every paragraph of the book) describe, with [powers] (the novel's power names, in the order
/// they are first met), or null when the pages say nothing of one.
PagesSystem? systemFromPages(Iterable<String> texts, List<String> powers) {
  final lookup = <String, String>{
    for (final MapEntry(key: preset, value: words) in _words.entries)
      for (final w in words) w: preset,
  };
  final counts = <String, Map<String, int>>{};
  for (final text in texts) {
    for (final m in _word.allMatches(text)) {
      final w = m[0]!.toLowerCase();
      final preset = lookup[w];
      if (preset == null) continue;
      final byWord = counts.putIfAbsent(preset, () => {});
      // "skills" is counted as "skill", "realms" as "realm": one word to the reader.
      final one = w.endsWith('s') && lookup[w.substring(0, w.length - 1)] == preset ? w.substring(0, w.length - 1) : w;
      byWord[one] = (byWord[one] ?? 0) + 1;
    }
  }
  int total(String preset) => (counts[preset] ?? const {}).values.fold(0, (a, b) => a + b);
  final ranked = [for (final p in systemPresets) p]..sort((a, b) => total(b.id).compareTo(total(a.id)));
  final preset = ranked.firstOrNull;
  if (preset == null) return null;
  final unique = <String>[];
  for (final p in powers) {
    final name = p.trim();
    if (name.isNotEmpty && !unique.any((u) => u.toLowerCase() == name.toLowerCase())) unique.add(name);
  }
  if (total(preset.id) < pagesSystemAtLeast && unique.isEmpty) return null;

  final content = deepCopy(preset.content) as JsonMap;
  final groups = maps(content['groups']);
  final wanted = _abilityGroup[preset.id];
  final group =
      groups.where((g) => str(g['name']) == wanted).firstOrNull ??
      groups.where((g) => g['single'] != true).firstOrNull ??
      groups.firstOrNull;
  if (group != null && unique.isNotEmpty) {
    final groupId = str(group['id']);
    content['items'] = [
      // The preset's examples of this kind make way for the novel's own; its other kinds stay as examples.
      for (final i in maps(content['items']))
        if (i['groupId'] != groupId) i,
      for (final (n, name) in unique.indexed)
        {
          'id': 'i-pages-$n',
          'groupId': groupId,
          'name': name,
          'description': 'From your pages.',
          'parentId': null,
          'rankId': null,
          'requires': '',
          'modifiers': <Object?>[],
          'costs': <Object?>[],
          'cooldown': '',
          'affinity': '',
          'evolution': '',
        },
    ];
  }
  final signs = [
    for (final MapEntry(key: word, value: times) in (counts[preset.id] ?? const <String, int>{}).entries)
      (word: word, times: times),
  ]..sort((a, b) => b.times != a.times ? b.times.compareTo(a.times) : a.word.compareTo(b.word));
  return (
    preset: preset,
    signs: signs,
    powers: unique,
    abilityGroup: group == null ? '' : str(group['name']),
    content: content,
  );
}
