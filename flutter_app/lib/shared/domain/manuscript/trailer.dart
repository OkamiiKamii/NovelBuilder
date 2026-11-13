/// THE TRAILER: the novel cut as a film trailer is cut, from its own words. A card says who it is from; then lines from
/// the book, one at a time, the ones a trailer would choose (short, a question or a cry, something said aloud, a word
/// like "never" or "blood"), in the order the book has them and none from its last pages; the names of the people it
/// is about, the most written first, between them; the line that lands hardest kept for last; and the title. Only the
/// author's words, nothing written for them.
///
/// Reads only.
library;

import 'dart:convert';

import 'prose.dart';

/// What a shot of the trailer shows.
enum ShotKind {
  /// Who it is from ("From RGA").
  from,

  /// A line from the book.
  line,

  /// A name, large.
  name,

  /// The title.
  title,
}

/// One shot: what it shows, and its words.
typedef Shot = ({ShotKind kind, String text});

/// The trailer: its shots in order, the line kept for last (the poster's tagline, or empty), and the names in it.
typedef Trailer = ({List<Shot> shots, String sting, List<String> cast});

/// A character the trailer may name: the name to show, and every name they go by in the pages.
typedef TrailerPerson = ({String name, List<String> names});

/// The most lines a trailer shows.
const trailerLines = 5;

/// The most names it shows.
const trailerNames = 2;

final _sentence = RegExp(r'[^.!?…]+[.!?…]+["”’]*|[^.!?…]+$');
final _quoted = RegExp(r'“([^”]+)”|"([^"]+)"');
final _space = RegExp(r'\s+');

/// Words a trailer leans on.
const _charged = {
  'never', 'always', 'only', 'everything', 'nothing', 'nobody', 'everyone', 'die', 'dies', 'died', 'death', 'dead', //
  'blood', 'kill', 'killed', 'secret', 'truth', 'power', 'war', 'fire', 'dark', 'darkness', 'world', 'lie', 'lies', //
  'alone', 'last', 'end', 'forever', 'gone', 'run', 'fall', 'remember', 'promise', 'monster', 'curse', 'magic', //
  'king', 'queen', 'god', 'gods', 'heart', 'love', 'fear', 'afraid', 'storm', 'shadow', 'shadows', 'mission', //
};

/// A line the book has, where, and how much a trailer wants it.
typedef _Candidate = ({String text, int paragraph, int score});

/// The trailer of a book whose paragraphs (in reading order, without headings) are [paragraphs], by [author], called
/// [title], with [cast] to name.
Trailer trailerOf(
  List<String> paragraphs, {
  required String title,
  required String author,
  List<TrailerPerson> cast = const [],
}) {
  final text = [for (final p in paragraphs) p.trim()];
  final names = _leads(text, cast);
  // None from the last pages: a trailer does not tell the ending. (A short book gives all it has.)
  final reach = text.length < 8 ? text.length : (text.length * 0.85).ceil();
  final found = <_Candidate>[];
  for (var i = 0; i < reach; i++) {
    found.addAll(_candidates(text[i], i, [for (final p in cast) ...p.names]));
  }
  found.sort((a, b) => b.score != a.score ? b.score - a.score : a.paragraph - b.paragraph);
  // A mix, as a trailer cuts it: not all questions, and something told as well as said.
  bool asks(_Candidate c) => RegExp(r'\?["”’]*$').hasMatch(c.text);
  bool said(_Candidate c) => c.text.startsWith('“');
  final chosen = <_Candidate>[];
  for (final c in found) {
    if (chosen.length == trailerLines) break;
    if (c.score <= 0) break;
    if (chosen.any((d) => d.paragraph == c.paragraph || d.text == c.text)) continue;
    if (asks(c) && chosen.where(asks).length >= 2) continue;
    if (said(c) && chosen.where(said).length >= trailerLines - 2) continue;
    chosen.add(c);
  }
  // The strongest last, the rest as the book has them.
  final sting = chosen.isEmpty ? null : chosen.first;
  final rest = [...chosen.skip(1)]..sort((a, b) => a.paragraph - b.paragraph);
  final lines = [...rest, ?sting];

  final shots = <Shot>[(kind: ShotKind.from, text: author.trim().isEmpty ? 'A new novel' : 'From ${author.trim()}')];
  for (final (i, l) in lines.indexed) {
    shots.add((kind: ShotKind.line, text: l.text));
    // A name after the second line, and after the third.
    final n = i - 1;
    if (n >= 0 && n < names.length && i < lines.length - 1) shots.add((kind: ShotKind.name, text: names[n]));
  }
  // Names not yet shown (a book of few lines): before the title.
  final shown = {
    for (final s in shots)
      if (s.kind == ShotKind.name) s.text,
  };
  for (final n in names) {
    if (!shown.contains(n)) shots.add((kind: ShotKind.name, text: n));
  }
  shots.add((kind: ShotKind.title, text: title.trim().isEmpty ? 'Untitled' : title.trim()));
  return (shots: shots, sting: sting?.text ?? '', cast: names);
}

/// The people most written about, up to [trailerNames], each written at least twice.
List<String> _leads(List<String> text, List<TrailerPerson> cast) {
  final all = text.join('\n');
  final counted = <(String, int)>[];
  for (final p in cast) {
    var n = 0;
    for (final name in {...p.names, p.name}) {
      if (name.trim().isEmpty) continue;
      n += RegExp(
        '(?<![\\p{L}\\p{N}])${RegExp.escape(name.trim())}(?![\\p{L}\\p{N}])',
        unicode: true,
      ).allMatches(all).length;
    }
    if (n >= 2) counted.add((p.name, n));
  }
  counted.sort((a, b) => b.$2 - a.$2);
  return [for (final (name, _) in counted.take(trailerNames)) name];
}

/// The lines of one paragraph a trailer could use, each scored: what is said aloud, and the sentences around it.
List<_Candidate> _candidates(String paragraph, int at, List<String> names) {
  final out = <_Candidate>[];
  for (final m in _quoted.allMatches(paragraph)) {
    final said = (m[1] ?? m[2] ?? '').trim().replaceFirst(RegExp(r'[,;:—–-]+$'), '.');
    if (said.isEmpty) continue;
    final ended = RegExp(r'[.!?…]$').hasMatch(said) ? said : '$said.';
    out.add((text: '“$ended”', paragraph: at, score: _score(ended, names, spoken: true)));
  }
  final told = paragraph.replaceAll(_quoted, ' ¶ ');
  for (final m in _sentence.allMatches(told)) {
    final s = m[0]!.trim();
    if (s.contains('¶') || s.isEmpty) continue;
    out.add((text: s, paragraph: at, score: _score(s, names, spoken: false)));
  }
  return out;
}

/// How much a trailer wants [line]: below one, not at all.
int _score(String line, List<String> names, {required bool spoken}) {
  final words = line.split(_space).where((w) => w.isNotEmpty).toList();
  if (words.length < 3 || words.length > 16) return 0;
  final first = line.replaceFirst(RegExp(r'^[“"‘(]+'), '');
  if (first.isEmpty || first[0] == first[0].toLowerCase()) return 0; // A piece of a sentence.
  if (RegExp(r'[;:()\[\]{}/\\#*_]').hasMatch(line)) return 0;
  var score = 1;
  if (line.endsWith('?') || line.endsWith('?”')) score += 3;
  if (line.endsWith('!') || line.endsWith('!”')) score += 2;
  if (spoken) score += 2;
  if (words.length >= 4 && words.length <= 11) score += 2;
  final lower = {for (final w in words) w.toLowerCase().replaceAll(RegExp(r'[^\p{L}]', unicode: true), '')};
  if (lower.any(_charged.contains)) score += 2;
  if (names.any((n) => n.isNotEmpty && line.contains(n))) score += 1;
  if (RegExp(r'^(And|But|Then|So|Or)\b').hasMatch(first)) score -= 1;
  if (RegExp(r'\d').hasMatch(line)) score -= 1;
  return score;
}

/// [trailerOf] over the chapters as stored (JSON text, as `NovelStore.rawJsonIn` reads them), in reading order
/// [order], as a job for an isolate.
Trailer Function() trailerJob(
  List<String> storedContents,
  List<String> order, {
  required String title,
  required String author,
  List<TrailerPerson> cast = const [],
}) => () {
  final wanted = order.toSet();
  final pages = <String, List<String>>{};
  for (final json in storedContents) {
    try {
      final row = jsonDecode(json);
      if (row is! Map || !wanted.contains(row['id'])) continue;
      pages['${row['id']}'] = [
        for (final b in docBlocks(row['doc']))
          if (!b.heading && b.text.trim().isNotEmpty) b.text,
      ];
    } on FormatException {
      continue;
    }
  }
  return trailerOf([for (final id in order) ...?pages[id]], title: title, author: author, cast: cast);
};
