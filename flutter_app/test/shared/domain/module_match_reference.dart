// THE MATCHING AS IT WAS before 2026-11-08 (a pattern per word, run over every text): kept only as the reference the
// new matching must agree with (`module_match_test.dart`). It is far too slow for a long book; never call it in the app.
import 'package:novel_builder/shared/domain/modules/module_match.dart' show moduleWords;
import 'package:novel_builder/shared/domain/text/fold.dart';

/// A module the story seems to call for: which, and the words found that say so (at most four, most found first).
typedef ReferenceFit = ({String moduleId, List<String> words, int score});

/// The modules whose words the story uses, best first, those already on left out, at most [limit]. A word in the
/// genres or tags counts five times, in the summary twice, in the chapters once per chapter it is in (so one word
/// repeated in one chapter does not decide). A module needs a score of at least 2.
List<ReferenceFit> referenceFittingModules({
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
  // The same pattern as before, compiled once per word for the test's sake (the answers do not change).
  bool has(String text, String word) => _patterns
      .putIfAbsent(word, () => RegExp('(^|[^\\p{L}\\p{N}])${RegExp.escape(word)}(\$|[^\\p{L}\\p{N}])', unicode: true))
      .hasMatch(text);

  final fits = <ReferenceFit>[];
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

final _patterns = <String, RegExp>{};
