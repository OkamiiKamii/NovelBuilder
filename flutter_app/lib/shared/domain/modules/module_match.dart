import 'dart:convert';

import '../manuscript/prose.dart' show blockTexts;
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

/// A run of letters and digits: a word, as the matching counts words.
final _wordRun = RegExp(r'[\p{L}\p{N}]+', unicode: true);
final _letterOrDigit = RegExp(r'^[\p{L}\p{N}]$', unicode: true);

/// One text made ready to ask about words: the words it holds, read once, and the text itself for the few phrases
/// with a space or a hyphen in them ("science fiction", "sci-fi").
///
/// Asking a word is a look-up, not a search through the text. Before (one pattern built and run over every chapter
/// for every one of the hundred-odd words, on every build of the Modules page) a long book took seconds and froze the
/// app: the two "app not responding" reports of 2026-11-08 were here.
class _Words {
  _Words(String text) : _text = foldText(text) {
    for (final m in _wordRun.allMatches(_text)) {
      _words.add(m[0]!);
    }
  }

  final String _text;
  final _words = <String>{};

  /// Whether [word] (lower case) is in the text as a whole word: not inside a longer word, as `(^|[^\p{L}\p{N}])` and
  /// `($|[^\p{L}\p{N}])` around it would say.
  bool has(String word) {
    if (_wordRun.matchAsPrefix(word)?.end == word.length) return _words.contains(word);
    for (var at = _text.indexOf(word); at >= 0; at = _text.indexOf(word, at + 1)) {
      if (!_wordCharBefore(at) && !_wordCharAt(at + word.length)) return true;
    }
    return false;
  }

  bool _wordCharBefore(int i) {
    if (i <= 0) return false;
    final low = _text.codeUnitAt(i - 1);
    // A character outside the first plane is two code units: read it whole.
    final start = (low & 0xFC00) == 0xDC00 && i >= 2 && (_text.codeUnitAt(i - 2) & 0xFC00) == 0xD800 ? i - 2 : i - 1;
    return _letterOrDigit.hasMatch(_text.substring(start, i));
  }

  bool _wordCharAt(int i) {
    if (i >= _text.length) return false;
    final high = _text.codeUnitAt(i);
    final end = (high & 0xFC00) == 0xD800 && i + 1 < _text.length ? i + 2 : i + 1;
    return _letterOrDigit.hasMatch(_text.substring(i, end));
  }
}

/// The modules whose words the story uses, best first, those already on left out, at most [limit]. A word in the
/// genres or tags counts five times, in the summary twice, in the chapters once per chapter it is in (so one word
/// repeated in one chapter does not decide). A module needs a score of at least 2.
///
/// Each text is read once into its words ([_Words]); each module's words are then looked up, so the time grows with
/// the length of the book once, not with the book times the number of words.
List<ModuleFit> fittingModules({
  required List<String> genres,
  required List<String> tags,
  required String synopsis,
  required List<String> chapters,
  Set<String> on = const {},
  int limit = 2,
}) {
  final label = _Words([...genres, ...tags].join(' · '));
  final summary = _Words(synopsis);
  final texts = [for (final c in chapters) _Words(c)];

  final fits = <ModuleFit>[];
  for (final MapEntry(key: id, value: words) in moduleWords.entries) {
    if (on.contains(id)) continue;
    final found = <String, int>{};
    for (final w in words) {
      var s = 0;
      if (label.has(w)) s += 5;
      if (summary.has(w)) s += 2;
      for (final t in texts) {
        if (t.has(w)) s += 1;
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

/// [fittingModules] from the chapters as stored ([storedContents]: each chapter's record as JSON text, as
/// `NovelStore.rawJsonIn` reads them). Decodes and reads them itself, so the whole job (decoding, reading out the text,
/// matching) can run away from the screen (`background.dart`). A record that cannot be read counts as an empty chapter.
List<ModuleFit> fittingModulesFromStored({
  required List<String> genres,
  required List<String> tags,
  required String synopsis,
  required List<String> storedContents,
  Set<String> on = const {},
}) {
  final chapters = <String>[];
  for (final json in storedContents) {
    try {
      final row = jsonDecode(json);
      chapters.add(row is Map ? blockTexts(row['doc']).join('\n') : '');
    } on FormatException {
      chapters.add('');
    }
  }
  return fittingModules(genres: genres, tags: tags, synopsis: synopsis, chapters: chapters, on: on);
}

/// The job [fittingModulesFromStored] as a function holding only what it is given: plain lists and strings, which a
/// separate isolate can be sent. Made here, at the top level, so it never holds the page that asks (a closure made in
/// a widget's method keeps the widget, and with it the open database, which cannot be sent).
List<ModuleFit> Function() modulesSuggestionJob({
  required List<String> genres,
  required List<String> tags,
  required String synopsis,
  required List<String> storedContents,
  required Set<String> on,
}) =>
    () => fittingModulesFromStored(
      genres: genres,
      tags: tags,
      synopsis: synopsis,
      storedContents: storedContents,
      on: on,
    );
