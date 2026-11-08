import '../text/fold.dart';

/// The words that say a story is of a module's kind, by module id: a plain list, matched as whole words in the
/// novel's genres, tags, summary and chapters. Nothing is guessed about meaning; a word is there or it is not.
const moduleWords = <String, List<String>>{
  'high-fantasy': [
    'fantasy',
    'magic',
    'mage',
    'wizard',
    'sorcerer',
    'dragon',
    'elf',
    'elves',
    'dwarf',
    'spell',
    'kingdom',
    'sword',
  ],
  'progression': [
    'litrpg',
    'progression',
    'cultivation',
    'level',
    'levels',
    'skill',
    'skills',
    'rank',
    'ranks',
    'stats',
    'experience',
    'evolution',
    'class',
    'dungeon',
    'system',
  ],
  'scifi': [
    'science fiction',
    'sci-fi',
    'scifi',
    'space',
    'starship',
    'spaceship',
    'planet',
    'galaxy',
    'alien',
    'android',
    'robot',
    'cyberpunk',
  ],
  'mystery': ['mystery', 'detective', 'murder', 'clue', 'clues', 'suspect', 'investigation', 'crime', 'thriller'],
  'romance': ['romance', 'love', 'lover', 'kiss', 'wedding', 'heart', 'romantic'],
  'horror': ['horror', 'ghost', 'monster', 'haunted', 'demon', 'curse', 'nightmare', 'blood', 'vampire', 'vampirism'],
  'superhero': ['superhero', 'superpower', 'superpowers', 'powers', 'hero', 'villain', 'mutant', 'vigilante'],
  'historical': ['historical', 'history', 'century', 'war', 'empire', 'medieval', 'victorian', 'ancient'],
  'contemporary': ['contemporary', 'family', 'school', 'college', 'friendship', 'coming of age', 'slice of life'],
  'politics': [
    'politics',
    'political',
    'court',
    'throne',
    'faction',
    'factions',
    'council',
    'senate',
    'intrigue',
    'king',
    'queen',
  ],
};

/// A module the story seems to call for: which, and the words found that say so (at most four, most found first).
typedef ModuleFit = ({String moduleId, List<String> words, int score});

/// The modules whose words the story uses, best first, those already on left out, at most [limit]. A word in the
/// genres or tags counts five times, in the summary twice, in the chapters once per chapter it is in (so one word
/// repeated in one chapter does not decide). A module needs a score of at least 2.
List<ModuleFit> fittingModules({
  required List<String> genres,
  required List<String> tags,
  required String synopsis,
  required List<String> chapters,
  Set<String> on = const {},
  int limit = 2,
}) {
  final label = foldText([...genres, ...tags].join(' · ')).toLowerCase();
  final summary = foldText(synopsis).toLowerCase();
  final texts = [for (final c in chapters) foldText(c).toLowerCase()];
  bool has(String text, String word) =>
      RegExp('(^|[^\\p{L}\\p{N}])${RegExp.escape(word)}(\$|[^\\p{L}\\p{N}])', unicode: true).hasMatch(text);

  final fits = <ModuleFit>[];
  for (final MapEntry(key: id, value: words) in moduleWords.entries) {
    if (on.contains(id)) continue;
    final found = <String, int>{};
    for (final w in words) {
      var s = 0;
      if (has(label, w)) s += 5;
      if (has(summary, w)) s += 2;
      for (final t in texts) {
        if (has(t, w)) s += 1;
      }
      if (s > 0) found[w] = s;
    }
    final score = found.values.fold(0, (a, b) => a + b);
    if (score < 2) continue;
    final ranked = found.keys.toList()..sort((a, b) => found[b]!.compareTo(found[a]!));
    // One form of a word: "skills" said, "skill" left out.
    final said = <String>[];
    for (final w in ranked) {
      if (said.any((s) => s == '${w}s' || w == '${s}s')) continue;
      said.add(w);
    }
    fits.add((moduleId: id, words: said.take(4).toList(), score: score));
  }
  fits.sort((a, b) => b.score.compareTo(a.score));
  return fits.take(limit).toList();
}
