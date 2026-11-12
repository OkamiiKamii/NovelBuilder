import 'dart:math' as math;

import 'voices.dart' show countWords;

/// One sentence of a chapter: its paragraph, where it starts and ends in it (end exclusive), its words, and whether it
/// holds dialogue (a quotation mark).
typedef RhythmSentence = ({int block, int start, int end, int words, bool spoken});

/// A run of sentences, by their indexes in [RhythmReport.sentences] (end exclusive).
typedef RhythmRun = ({int from, int to});

/// How many sentences of nearly one length in a row make a run that keeps one beat.
const sameBeatRun = 5;

/// How far apart (in words) the sentences of such a run may be.
const sameBeatSpread = 3;

/// THE CHAPTER'S RHYTHM: its sentences in order with their lengths, the runs of five or more that keep one beat (all
/// within three words of each other, and of four words or more), and the shortest, longest and middle lengths. Reads
/// only; describes, never judges: a run may be just what the scene wants.
class RhythmReport {
  RhythmReport(this.sentences) : runs = _runs(sentences);

  static final empty = RhythmReport(const []);

  final List<RhythmSentence> sentences;
  final List<RhythmRun> runs;

  int get shortest => sentences.isEmpty ? 0 : sentences.map((s) => s.words).reduce(math.min);
  int get longest => sentences.isEmpty ? 0 : sentences.map((s) => s.words).reduce(math.max);

  /// The middle length (the median): what a sentence here usually runs to.
  int get usual {
    if (sentences.isEmpty) return 0;
    final sorted = [for (final s in sentences) s.words]..sort();
    return sorted[sorted.length ~/ 2];
  }

  static List<RhythmRun> _runs(List<RhythmSentence> s) {
    final out = <RhythmRun>[];
    var from = 0;
    while (from < s.length) {
      var lo = s[from].words;
      var hi = lo;
      var to = from + 1;
      while (to < s.length) {
        final w = s[to].words;
        final nlo = math.min(lo, w);
        final nhi = math.max(hi, w);
        if (nhi - nlo > sameBeatSpread) break;
        lo = nlo;
        hi = nhi;
        to++;
      }
      if (to - from >= sameBeatRun && lo >= 4) {
        out.add((from: from, to: to));
        from = to;
      } else {
        from++;
      }
    }
    return out;
  }
}

// A sentence ends at . ! ? or … (with any closing quotes or brackets after), before a space or the paragraph's end.
final _end = RegExp(r'''[.!?…]+["”’')\]]*(?=\s|$)''');

/// The sentences of [paragraphs], in order.
RhythmReport rhythmOf(List<String> paragraphs) {
  final out = <RhythmSentence>[];
  for (final (i, text) in paragraphs.indexed) {
    var start = 0;
    void add(int end) {
      // Leading spaces are not the sentence's.
      var s = start;
      while (s < end && text[s].trim().isEmpty) {
        s++;
      }
      final piece = text.substring(s, end);
      final words = countWords(piece);
      if (words > 0) {
        out.add((block: i, start: s, end: end, words: words, spoken: RegExp('[“”"]').hasMatch(piece)));
      }
      start = end;
    }

    for (final m in _end.allMatches(text)) {
      add(m.end);
    }
    if (start < text.length) add(text.length);
  }
  return RhythmReport(out);
}
