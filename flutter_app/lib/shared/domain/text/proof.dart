/// BEFORE A READER SEES IT: the slips a proofreader marks, over the whole book, found by rule and never by guessing,
/// so a draft can go to a beta reader, a writing group or an agent without them. What the red pencil marks (echoes,
/// long sentences, fillers: matters of style, a chapter at a time) and the gaps left to fill (TK) are not here; these
/// are the mistakes no one means:
///
/// - a **name slip**: a word a letter off one of the book's names ("Jmaes" where James is meant);
/// - a **doubled word**: "the the" ("had had" and "that that" are English, and left alone);
/// - **after "didn't"**: a past form where the plain verb belongs ("didn't looked");
/// - an **unclosed quotation**: a paragraph that opens a line of speech and never closes it (unless the next paragraph
///   opens one, as a speech that runs on is written);
/// - **straight quotes** in a book of curly ones (or curly in a book of straight), the few that do not match;
/// - **spacing**: a space before a comma or a full stop, or two between words;
/// - **a small letter** starting a sentence after a full stop, or "i" for "I";
/// - a chapter with **no title**, or **no words**.
///
/// It only reads: each is shown where it is, to be put right by the author in the chapter.
library;

import 'dart:convert';

import '../manuscript/prose.dart';

/// The kinds of slip, each with what it is called.
enum Slip {
  name('Name slips'),
  doubled('Doubled words'),
  didnt('After “didn’t”'),
  unclosed('Unclosed quotations'),
  quotes('Straight and curly quotes'),
  spacing('Spacing'),
  small('Small letters'),
  chapter('Chapters');

  const Slip(this.title);

  /// What the list of them is called.
  final String title;
}

/// A slip: its kind, the chapter (1 first) and its id, the paragraph, the text it is found in (a sentence or so) and
/// where in it the slip is, what is said of it, and the words to find it by.
typedef Proof = ({
  Slip kind,
  int chapter,
  String nodeId,
  int block,
  String text,
  int start,
  int end,
  String note,
  String find,
});

/// A chapter for the proof: its id, its title, and its paragraphs (every block, a heading as `null`).
typedef ProofChapter = ({String id, String title, List<String?> paragraphs});

/// The most slips of one kind that are listed.
const proofsKept = 60;

final _word = RegExp(r"[\p{L}][\p{L}’'\-]*", unicode: true);
final _doubled = RegExp(r"(?<![\p{L}’'])([\p{L}’']+)\s+\1(?![\p{L}’'])", unicode: true, caseSensitive: false);
final _didnt = RegExp(
  r"\b(didn[’']t|doesn[’']t|don[’']t|did not|does not|do not)\s+([a-z]+ed)\b",
  caseSensitive: false,
);
final _spaceBefore = RegExp(r'(?<=\S) +([,.;:!?])(?![.\d])');
final _doubleSpace = RegExp(r'(?<=\S)  +(?=\S)');
final _smallStart = RegExp(r'(?<=[a-z]{2})\. +([a-z])');
final _lowerI = RegExp(r"(?<![\p{L}.])i(?=[ ’',]|$)(?![.])", unicode: true);
const _abbreviations = {'mr', 'mrs', 'ms', 'dr', 'st', 'vs', 'etc', 'eg', 'ie', 'no', 'vol', 'ch', 'cf', 'approx'};
const _doublesAllowed = {'had', 'that', 'is', 'very', 'no', 'bye', 'so', 'knock', 'tick', 'tock', 'ha', 'too'};
const _endsInEd = {
  'need',
  'feed',
  'seed',
  'bleed',
  'speed',
  'proceed',
  'exceed',
  'succeed',
  'shed',
  'red',
  'bed',
  'wed',
  'shred',
  'breed',
  'heed',
  'weed',
  'deed',
  'indeed',
  'embed',
  'sled',
  'fled',
  'led',
  'bred',
  'sped',
  'misled',
};

/// The plain verb of a past form: "looked" is "look", "tried" is "try", "stopped" is "stop".
String plainOf(String past) {
  final w = past.toLowerCase();
  if (w.endsWith('ied') && w.length > 4) return '${w.substring(0, w.length - 3)}y';
  final stem = w.substring(0, w.length - 2);
  if (stem.length >= 3 && stem[stem.length - 1] == stem[stem.length - 2] && !'lsz'.contains(stem[stem.length - 1])) {
    return stem.substring(0, stem.length - 1);
  }
  // "liked", "hoped": the e was the verb's.
  if (RegExp(r'[^aeiou][aeiou][^aeiouwxy]$').hasMatch(stem) && stem.length <= 4) return '${stem}e';
  return stem;
}

/// The edits between [a] and [b], up to 2 (more is 2).
int _distance(String a, String b) {
  if ((a.length - b.length).abs() > 1) return 2;
  var i = 0;
  while (i < a.length && i < b.length && a[i] == b[i]) {
    i++;
  }
  var j = 0;
  while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] == b[b.length - 1 - j]) {
    j++;
  }
  final restA = a.length - i - j;
  final restB = b.length - i - j;
  if (restA <= 1 && restB <= 1) return (restA == 0 && restB == 0) ? 0 : 1;
  // Two letters the wrong way about.
  if (restA == 2 && restB == 2 && a[i] == b[i + 1] && a[i + 1] == b[i]) return 1;
  return 2;
}

/// The sentence of [text] around [at], as (its start, the sentence).
(int, String) _sentenceAround(String text, int at) {
  var start = at;
  while (start > 0 && !'.!?…'.contains(text[start - 1])) {
    start--;
  }
  // The quote that closes the sentence before is that sentence's ("coming." With that…).
  while (start > 0 && start < at && '"”’ '.contains(text[start])) {
    start++;
  }
  var end = at;
  while (end < text.length && !'.!?…'.contains(text[end])) {
    end++;
  }
  if (end < text.length) end++;
  while (end < text.length && '"”’'.contains(text[end])) {
    end++;
  }
  // Too long to show: the words near it.
  if (end - start > 220) {
    start = (at - 90).clamp(0, text.length);
    end = (at + 110).clamp(0, text.length);
  }
  return (start, text.substring(start, end));
}

/// Every slip in the book of [chapters] (in reading order); [names] are the names it holds (its people's and places'),
/// for the name slips. In the book's order, each kind at most [proofsKept].
List<Proof> proofsOf(List<ProofChapter> chapters, {Set<String> names = const {}}) {
  // Each slip with where it is in its paragraph, to put them in the book's order at the end.
  final out = <(Proof, int)>[];
  final counts = <Slip, int>{};
  void add(Slip kind, int c, int b, String paragraph, int start, int end, String note) {
    if ((counts[kind] = (counts[kind] ?? 0) + 1) > proofsKept) return;
    final (from, sentence) = _sentenceAround(paragraph, start);
    final s = (start - from).clamp(0, sentence.length);
    final e = (end - from).clamp(s, sentence.length);
    out.add((
      (
        kind: kind,
        chapter: c + 1,
        nodeId: chapters[c].id,
        block: b,
        text: sentence,
        start: s,
        end: e,
        note: note,
        find: paragraph.substring(start, end).trim().isEmpty ? sentence.trim() : paragraph.substring(start, end),
      ),
      start,
    ));
  }

  // The book's words, counted, for the name slips: a known name said often, a word a letter off it said rarely.
  final counted = <String, int>{};
  var straight = 0;
  var curly = 0;
  for (final c in chapters) {
    for (final p in c.paragraphs) {
      if (p == null) continue;
      for (final m in _word.allMatches(p)) {
        counted.update(m[0]!, (n) => n + 1, ifAbsent: () => 1);
      }
      straight += '"'.allMatches(p).length;
      curly += '“'.allMatches(p).length + '”'.allMatches(p).length;
    }
  }
  final known = {
    for (final n in names)
      for (final w in n.split(RegExp(r'\s+')))
        if (w.length >= 4 && w[0] != w[0].toLowerCase()) w,
  };
  final slips = <String, String>{};
  for (final MapEntry(key: w, value: n) in counted.entries) {
    if (w.length < 4 || w[0] == w[0].toLowerCase() || known.contains(w) || n > 2) continue;
    // A word the book also writes small is a word ("Well?" by Vell), not a name gone wrong.
    if ((counted[w.toLowerCase()] ?? 0) > 0) continue;
    for (final k in known) {
      // The name's plural or its possessive is the name ("the Fenns", "Fenn’s").
      final same = w == '${k}s' || w == '${k}es' || w == '$k’s' || w == "$k's";
      if (!same && (counted[k] ?? 0) >= 3 && _distance(w, k) == 1) {
        slips[w] = k;
        break;
      }
    }
  }
  // The quotes of the book are the ones it uses most; the others stand out.
  final odd = straight > 0 && curly > 0 ? (straight <= curly ? '"' : '“') : null;

  for (final (c, chapter) in chapters.indexed) {
    final words = chapter.paragraphs.whereType<String>().fold(0, (n, p) => n + _word.allMatches(p).length);
    if (words == 0) {
      out.add((
        (
          kind: Slip.chapter,
          chapter: c + 1,
          nodeId: chapter.id,
          block: 0,
          text: chapter.title.trim().isEmpty ? 'Chapter ${c + 1}' : chapter.title.trim(),
          start: 0,
          end: 0,
          note: 'This chapter has no words yet.',
          find: '',
        ),
        -1,
      ));
      continue;
    }
    if (chapter.title.trim().isEmpty) {
      final first = chapter.paragraphs.whereType<String>().firstWhere((p) => p.trim().isNotEmpty, orElse: () => '');
      out.add((
        (
          kind: Slip.chapter,
          chapter: c + 1,
          nodeId: chapter.id,
          block: 0,
          text: first.length > 120 ? '${first.substring(0, 120)}…' : first,
          start: 0,
          end: 0,
          note: 'Chapter ${c + 1} has no title.',
          find: '',
        ),
        -1,
      ));
    }
    for (final (b, p) in chapter.paragraphs.indexed) {
      if (p == null || p.trim().isEmpty) continue;
      for (final m in _word.allMatches(p)) {
        final known = slips[m[0]];
        if (known != null) add(Slip.name, c, b, p, m.start, m.end, '“${m[0]}”: is it $known?');
      }
      for (final m in _doubled.allMatches(p)) {
        if (_doublesAllowed.contains(m[1]!.toLowerCase())) continue;
        add(Slip.doubled, c, b, p, m.start, m.end, '“${m[1]}” twice.');
      }
      for (final m in _didnt.allMatches(p)) {
        final past = m[2]!;
        if (_endsInEd.contains(past.toLowerCase())) continue;
        add(Slip.didnt, c, b, p, m.start, m.end, 'After “${m[1]}”, the plain verb: “${plainOf(past)}”?');
      }
      // A speech opened and not closed, unless the next paragraph opens one (a speech that runs on).
      final opens = '“'.allMatches(p).length;
      final closes = '”'.allMatches(p).length;
      final straightHere = '"'.allMatches(p).length;
      if (opens > closes || straightHere.isOdd) {
        final next = chapter.paragraphs
            .skip(b + 1)
            .whereType<String>()
            .firstWhere((q) => q.trim().isNotEmpty, orElse: () => '');
        final runsOn = next.trimLeft().startsWith('“') || next.trimLeft().startsWith('"');
        if (!runsOn) {
          final at = opens > closes ? p.lastIndexOf('“') : p.lastIndexOf('"');
          add(Slip.unclosed, c, b, p, at, at + 1, 'A line of speech opened here is not closed.');
        }
      }
      if (odd != null) {
        for (final m in RegExp(RegExp.escape(odd) + (odd == '“' ? '|”' : '')).allMatches(p)) {
          add(
            Slip.quotes,
            c,
            b,
            p,
            m.start,
            m.end,
            odd == '"' ? 'A straight quote in a book of curly ones.' : 'A curly quote in a book of straight ones.',
          );
          break;
        }
      }
      for (final m in _spaceBefore.allMatches(p)) {
        add(Slip.spacing, c, b, p, m.start, m.end, 'A space before the “${m[1]}”.');
      }
      for (final m in _doubleSpace.allMatches(p)) {
        add(Slip.spacing, c, b, p, m.start, m.end, 'Two spaces between words.');
      }
      for (final m in _smallStart.allMatches(p)) {
        final before = RegExp(r'([A-Za-z]+)\.$').firstMatch(p.substring(0, m.start + 1))?[1]?.toLowerCase() ?? '';
        if (_abbreviations.contains(before)) continue;
        add(Slip.small, c, b, p, m.start + m[0]!.length - 1, m.end, 'A sentence starting with a small letter.');
      }
      for (final m in _lowerI.allMatches(p)) {
        add(Slip.small, c, b, p, m.start, m.end, '“i” for “I”.');
      }
    }
  }
  // In the book's order: chapter, paragraph, and where in it.
  out.sort((a, b) {
    if (a.$1.chapter != b.$1.chapter) return a.$1.chapter - b.$1.chapter;
    if (a.$1.block != b.$1.block) return a.$1.block - b.$1.block;
    return a.$2 - b.$2;
  });
  return [for (final (p, _) in out) p];
}

/// [proofsOf] over the chapters as stored (JSON text, as `NovelStore.rawJsonIn` reads them): [order] is the chapters'
/// ids in reading order, [titles] their titles. A job for an isolate.
List<Proof> Function() proofsJob(
  List<String> storedContents,
  List<String> order,
  Map<String, String> titles,
  Set<String> names,
) => () {
  final wanted = order.toSet();
  final blocks = <String, List<({bool heading, String text})>>{};
  for (final json in storedContents) {
    try {
      final row = jsonDecode(json);
      if (row is! Map || !wanted.contains(row['id'])) continue;
      blocks['${row['id']}'] = docBlocks(row['doc']);
    } on FormatException {
      continue;
    }
  }
  return proofsOf([
    for (final id in order)
      (
        id: id,
        title: titles[id] ?? '',
        paragraphs: [for (final b in blocks[id] ?? const <({bool heading, String text})>[]) b.heading ? null : b.text],
      ),
  ], names: names);
};
