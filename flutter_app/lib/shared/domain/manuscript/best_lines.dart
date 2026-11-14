/// THE BEST LINES: the sentences of a book most worth quoting, the ones an author posts and a reader underlines. Read
/// from the prose, sentence by sentence, and scored for what makes a line stay with a reader:
///
/// - **a length to hold in the mind**: eight to sixteen words best, six to twenty-two at all;
/// - **a turn**: a contrast ("but", "yet", "not… but"), a dash, a semicolon;
/// - **the sound of a truth**: "never", "always", "every", "no one", "nothing", or the present tense of a saying;
/// - **the senses**: words of light, salt, stone, bells, smoke, cold (two at most counted);
/// - **an echo**: a word said twice ("Nine days. Nine days of low water.");
///
/// and marked down for starting mid-thought ("And…", "Then…"), for numbers, and for the plain business of a scene
/// ("he said", "she walked to"). Twelve, the best first, never two from one paragraph. Only the author's words.
library;

import 'dart:convert';

import 'prose.dart';

/// A line: its words, its chapter (the place from 1, the id), its paragraph, and its score.
typedef BestLine = ({String text, int chapter, String nodeId, int block, int score});

/// How many lines are kept.
const bestLinesKept = 12;

final _sentence = RegExp(r'[^.!?…]+[.!?…]+["”’]*|[^.!?…]+$');
final _word = RegExp(r"[\p{L}][\p{L}’'\-]*", unicode: true);

const _truths = {'never', 'always', 'every', 'everyone', 'nothing', 'nobody', 'everything', 'forever', 'only'};
const _sayings = {'is', 'are', 'was', 'were'};
const _senses = {
  'light', 'dark', 'darkness', 'shadow', 'shadows', 'salt', 'sea', 'tide', 'water', 'stone', 'stones', 'bell', //
  'bells', 'smoke', 'fire', 'ash', 'ashes', 'cold', 'warm', 'wind', 'rain', 'snow', 'blood', 'bone', 'bones', //
  'silver', 'gold', 'iron', 'glass', 'dust', 'moon', 'sun', 'star', 'stars', 'night', 'dawn', 'dusk', 'silence', //
  'quiet', 'song', 'voice', 'breath', 'ink', 'paper', 'map', 'road', 'river', 'storm', 'mist', 'fog', 'flame',
};
const _business = [' said', ' asked', ' replied', ' walked', ' turned to', ' looked at', ' nodded', ' sat down'];

/// How much [line] stays with a reader: below one, not a line to quote.
int lineScore(String line) {
  final words = [for (final m in _word.allMatches(line)) m[0]!.toLowerCase()];
  if (words.length < 6 || words.length > 22) return 0;
  final first = line.replaceFirst(RegExp(r'^[“"‘(]+'), '');
  if (first.isEmpty || first[0] == first[0].toLowerCase()) return 0;
  // Broken off ("if you knew the tables were wrong—"): not a whole thought.
  if (RegExp(r'[—–-]["”’]*$').hasMatch(line.trim())) return 0;
  var score = 1;
  if (words.length >= 8 && words.length <= 16) score += 2;
  final lower = ' ${line.toLowerCase()} ';
  if (RegExp(r'\b(but|yet)\b').hasMatch(lower) || line.contains('—') || line.contains(';') || lower.contains(' not ')) {
    score += 2;
  }
  if (words.any(_truths.contains)) score += 2;
  if (words.length <= 14 && words.any(_sayings.contains) && !words.contains('i')) score += 1;
  score += words.where(_senses.contains).toSet().length.clamp(0, 2);
  final counted = <String, int>{};
  for (final w in words) {
    if (w.length >= 4) counted[w] = (counted[w] ?? 0) + 1;
  }
  if (counted.values.any((n) => n >= 2)) score += 1;
  if (RegExp(r'^(And|But|Then|So|Or|Also)\b').hasMatch(first)) score -= 2;
  if (RegExp(r'\d').hasMatch(line)) score -= 2;
  if (_business.any(lower.contains)) score -= 2;
  return score;
}

/// The best lines of [chapters] (in reading order, each its id and paragraphs).
List<BestLine> bestLines(List<({String id, List<String> paragraphs})> chapters) {
  final found = <BestLine>[];
  for (final (c, chapter) in chapters.indexed) {
    for (final (b, text) in chapter.paragraphs.indexed) {
      BestLine? best;
      for (final m in _sentence.allMatches(text)) {
        final s = m[0]!.trim();
        // A sentence cut by a quotation is not whole.
        if ('“'.allMatches(s).length != '”'.allMatches(s).length) continue;
        final score = lineScore(s);
        if (score > 0 && (best == null || score > best.score)) {
          best = (text: s, chapter: c + 1, nodeId: chapter.id, block: b, score: score);
        }
      }
      if (best != null) found.add(best);
    }
  }
  found.sort((a, b) => b.score != a.score ? b.score - a.score : a.chapter - b.chapter);
  final seen = <String>{};
  return [
    for (final l in found)
      if (seen.add(l.text.toLowerCase())) l,
  ].take(bestLinesKept).toList();
}

/// [bestLines] over the chapters as stored (JSON text, as `NovelStore.rawJsonIn` reads them), in reading order
/// [order], as a job for an isolate.
List<BestLine> Function() bestLinesJob(List<String> storedContents, List<String> order) => () {
  final wanted = order.toSet();
  final pages = <String, List<String>>{};
  for (final json in storedContents) {
    try {
      final row = jsonDecode(json);
      if (row is! Map || !wanted.contains(row['id'])) continue;
      pages['${row['id']}'] = [
        for (final b in docBlocks(row['doc']))
          if (!b.heading) b.text,
      ];
    } on FormatException {
      continue;
    }
  }
  return bestLines([for (final id in order) (id: id, paragraphs: pages[id] ?? const [])]);
};
