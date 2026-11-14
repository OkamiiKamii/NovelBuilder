/// THEIR VOICE: how a character talks, measured from the lines the book gives them (`voice.dart` ties each line to
/// its speaker) and set against the rest of the cast: how long their lines run, how often they ask or exclaim, how
/// formally they speak (contractions), how long their words are, the words they use and no one else does, and whom
/// they sound most like. The craft trouble it answers is the commonest: "all my characters sound the same".
///
/// Reads only.
library;

import 'dart:convert';
import 'dart:math' as math;

import '../json.dart';
import '../manuscript/prose.dart';
import 'voice.dart';

/// How someone talks, in numbers: their lines, words a line, the shares of lines that ask and that exclaim,
/// contractions in a hundred words, letters a word, and their signature words.
typedef VoicePrint = ({
  String id,
  int lines,
  double wordsPerLine,
  double questions,
  double cries,
  double contractions,
  double wordLength,
  List<String> signature,
});

/// What is said of one voice: the traits that set it apart, and whom it sounds most like (and whether too alike).
typedef VoiceReading = ({List<String> traits, String? soundsLike, bool alike});

/// The fewest lines a voice is measured from.
const voiceLinesAtLeast = 5;

final _word = RegExp(r"[\p{L}][\p{L}’']*", unicode: true);
final _contraction = RegExp(r"\b\w+(?:n[’']t|[’'](?:re|ll|ve|m|d|s))\b", caseSensitive: false);

const _common = {
  'the', 'and', 'you', 'that', 'was', 'for', 'are', 'with', 'his', 'her', 'they', 'this', 'have', 'from', 'not', //
  'but', 'what', 'all', 'were', 'when', 'your', 'can', 'there', 'she', 'him', 'had', 'has', 'one', 'our', 'out', //
  'who', 'will', 'would', 'about', 'them', 'then', 'some', 'into', 'just', 'like', 'know', 'now', 'here', 'yes', //
  'did', 'does', 'don’t', "don't", 'it’s', "it's", 'i’m', "i'm", 'can’t', "can't", 'how', 'why', 'where', 'come', //
  'go', 'get', 'got', 'see', 'say', 'said', 'too', 'very', 'well', 'back', 'only', 'their', 'over', 'been', 'any', //
};

/// The voice of each of [lines] (by id, the words they say), those with at least [voiceLinesAtLeast] lines.
List<VoicePrint> voicePrints(Map<String, List<String>> lines) {
  final counts = <String, Map<String, int>>{};
  final totals = <String, int>{};
  final prints = <VoicePrint>[];
  for (final MapEntry(key: id, value: said) in lines.entries) {
    if (said.length < voiceLinesAtLeast) continue;
    final words = [for (final l in said) ..._word.allMatches(l).map((m) => m[0]!.toLowerCase())];
    if (words.isEmpty) continue;
    final mine = <String, int>{};
    for (final w in words) {
      mine[w] = (mine[w] ?? 0) + 1;
    }
    counts[id] = mine;
    totals[id] = words.length;
    final contractions = said.fold(0, (n, l) => n + _contraction.allMatches(l).length);
    prints.add((
      id: id,
      lines: said.length,
      wordsPerLine: words.length / said.length,
      questions: said.where((l) => l.trimRight().endsWith('?')).length / said.length,
      cries: said.where((l) => l.trimRight().endsWith('!')).length / said.length,
      contractions: contractions * 100 / words.length,
      wordLength: words.fold(0, (n, w) => n + w.replaceAll(RegExp(r"[’']"), '').length) / words.length,
      signature: const [],
    ));
  }
  // Signature words: said at least twice, at three times the rate the rest of the cast says them (or never by them).
  return [
    for (final p in prints)
      (
        id: p.id,
        lines: p.lines,
        wordsPerLine: p.wordsPerLine,
        questions: p.questions,
        cries: p.cries,
        contractions: p.contractions,
        wordLength: p.wordLength,
        signature: () {
          final mine = counts[p.id]!;
          final othersTotal = totals.entries.where((e) => e.key != p.id).fold(0, (n, e) => n + e.value);
          final scored = <(String, double)>[];
          for (final MapEntry(key: w, value: n) in mine.entries) {
            if (n < 2 || w.length < 4 || _common.contains(w) || w.contains(RegExp(r"[’']"))) continue;
            final others = counts.entries.where((e) => e.key != p.id).fold(0, (s, e) => s + (e.value[w] ?? 0));
            final rate = n / totals[p.id]!;
            final otherRate = othersTotal == 0 ? 0 : others / othersTotal;
            if (otherRate > 0 && rate < otherRate * 3) continue;
            scored.add((w, n * (otherRate == 0 ? 3.0 : rate / otherRate)));
          }
          scored.sort((a, b) => b.$2.compareTo(a.$2));
          return [for (final s in scored.take(5)) s.$1];
        }(),
      ),
  ];
}

List<double> _features(VoicePrint p) => [p.wordsPerLine, p.questions, p.cries, p.contractions, p.wordLength];

String _n(double v) => v >= 10 || v == v.roundToDouble() ? v.round().toString() : v.toStringAsFixed(1);
String _pc(double v) => '${(v * 100).round()}%';

/// What sets [id]'s voice apart among [prints], and whom it sounds most like ([names] by id).
VoiceReading? readVoice(String id, List<VoicePrint> prints, Map<String, String> names) {
  final me = prints.where((p) => p.id == id).firstOrNull;
  if (me == null) return null;
  final others = prints.where((p) => p.id != id).toList();
  if (others.isEmpty) return (traits: const [], soundsLike: null, alike: false);
  double mean(double Function(VoicePrint) f) => others.fold(0.0, (n, p) => n + f(p)) / others.length;
  final traits = <String>[];
  void compare(double mine, double theirs, String more, String less, String Function(double) say, {double floor = 0}) {
    if (math.max(mine, theirs) <= floor) return;
    if (mine >= theirs * 1.4 && mine - theirs > floor) {
      traits.add('$more (${say(mine)}, the others ${say(theirs)}).');
    } else if (mine <= theirs * 0.7 && theirs - mine > floor) {
      traits.add('$less (${say(mine)}, the others ${say(theirs)}).');
    }
  }

  compare(
    me.wordsPerLine,
    mean((p) => p.wordsPerLine),
    'Longer lines than the others',
    'Shorter lines than the others',
    (v) => '${_n(v)} words a line',
    floor: 1,
  );
  compare(
    me.questions,
    mean((p) => p.questions),
    'Asks more than the others',
    'Asks less than the others',
    _pc,
    floor: 0.05,
  );
  compare(
    me.cries,
    mean((p) => p.cries),
    'Exclaims more than the others',
    'Exclaims less than the others',
    _pc,
    floor: 0.05,
  );
  compare(
    me.contractions,
    mean((p) => p.contractions),
    'Speaks loosely: more contractions',
    'Speaks formally: fewer contractions',
    (v) => '${_n(v)} in 100 words',
    floor: 1,
  );
  compare(
    me.wordLength,
    mean((p) => p.wordLength),
    'Longer words than the others',
    'Plainer words than the others',
    (v) => '${_n(v)} letters a word',
    floor: 0.3,
  );

  // Whom they sound most like: the nearest voice, each measure weighed by how much the cast's voices differ in it.
  final all = [for (final p in prints) _features(p)];
  final spread = [
    for (var i = 0; i < 5; i++)
      () {
        final values = [for (final f in all) f[i]];
        final m = values.reduce((a, b) => a + b) / values.length;
        final sd = math.sqrt(values.fold(0.0, (n, v) => n + (v - m) * (v - m)) / values.length);
        return sd > 1e-9 ? sd : 1.0;
      }(),
  ];
  // The spread a measure must clear to matter: for a cast of two, the spread is the gap itself, so a fixed scale.
  const scale = [3.0, 0.12, 0.12, 2.0, 0.4];
  double distance(VoicePrint a, VoicePrint b) {
    final fa = _features(a);
    final fb = _features(b);
    var d = 0.0;
    for (var i = 0; i < 5; i++) {
      final s = prints.length >= 4 ? spread[i] : scale[i];
      d += math.pow((fa[i] - fb[i]) / s, 2);
    }
    return math.sqrt(d / 5);
  }

  VoicePrint? nearest;
  var best = double.infinity;
  for (final o in others) {
    final d = distance(me, o);
    if (d < best) {
      best = d;
      nearest = o;
    }
  }
  final alike = best < 0.5 && me.lines >= 8 && nearest!.lines >= 8 && traits.isEmpty;
  return (traits: traits, soundsLike: nearest == null ? null : names[nearest.id], alike: alike);
}

/// The voices of [people] (by id, the names they go by), from the chapters as stored (JSON text, as
/// `NovelStore.rawJsonIn` reads them) in reading order [nodeIds], as a job for an isolate.
List<VoicePrint> Function() voicePrintsJob(
  List<String> storedContents,
  List<String> nodeIds,
  Map<String, List<String>> people,
) => () {
  final wanted = nodeIds.toSet();
  final pages = <String, List<String>>{};
  for (final json in storedContents) {
    try {
      final row = jsonDecode(json);
      if (row is! Map || !wanted.contains(row['id'])) continue;
      pages[str(row['id'])] = blockTexts(row['doc']);
    } on FormatException {
      continue;
    }
  }
  return voicePrints({
    for (final MapEntry(key: id, value: names) in people.entries)
      id: [for (final s in spokenBy(pages, nodeIds, names, limit: 400)) s.words],
  });
};
