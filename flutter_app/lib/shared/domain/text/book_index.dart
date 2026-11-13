/// THE INDEX: the names a book is made of, A to Z, each with the chapters it is in, as the index at the back of a
/// printed book sets them. A name is a word (or a run of words) written with a capital where a sentence does not begin
/// ("the Mimir Forest", "Wren Hollis"); a word that only ever begins sentences is not one. And names written two ways
/// ("Mimir" and "Mimmir", "Hollis" and "Holis") are set side by side: one of them may be a slip.
///
/// Reads only.
library;

import 'dart:convert';
import 'dart:math' as math;

import '../manuscript/prose.dart';

/// Where a name is in one chapter: the chapter's place in the book (from 1), its id, the first paragraph it is in, and
/// how often it is there.
typedef IndexPlace = ({int number, String nodeId, int block, int count});

/// One line of the index: the name as written, how often in all, and the chapters.
typedef IndexEntry = ({String term, int count, List<IndexPlace> places});

/// Two names written alike: perhaps one name, spelled two ways.
typedef LookAlike = ({IndexEntry a, IndexEntry b});

/// The index: its lines A to Z, and the names that look alike.
typedef BookIndex = ({List<IndexEntry> entries, List<LookAlike> lookAlikes});

final _word = RegExp(r"[\p{L}][\p{L}’'\-]*", unicode: true);
final _sentenceEnd = RegExp(r'[.!?…:]["”’)\]]*\s*$|^\s*$|["“(\[]\s*$');

/// Words that join a name's parts ("Order of the Lamp", "Isle of Vell").
const _joins = {'of', 'the', 'de', 'du', 'von', 'van', 'del', 'la', 'le'};

/// Words that are written with a capital mid-sentence without being names: I, and the words that begin a sentence
/// after a line of dialogue ("“Go.” He turned").
const _notNames = {
  'I', 'I’m', "I'm", 'I’d', "I'd", 'I’ll', "I'll", 'I’ve', "I've", 'OK', 'Mr', 'Mrs', 'Ms', 'Dr', //
  'He', 'She', 'It', 'They', 'We', 'You', 'His', 'Her', 'Its', 'Their', 'Our', 'Your', 'My', 'The', 'A', 'An', //
  'And', 'But', 'Or', 'So', 'Then', 'When', 'Where', 'What', 'Who', 'Why', 'How', 'If', 'In', 'On', 'At', 'As', //
  'This', 'That', 'These', 'Those', 'There', 'Here', 'No', 'Yes', 'Not', 'Now', 'Still', 'Just', 'All', 'One', //
  'For', 'With', 'From', 'To', 'Of', 'By', 'After', 'Before', 'Once', 'Even', 'Only', 'Well', 'Oh', 'Ah',
};

/// A word as an index sets it: without a possessive ("Wren’s", "the Wardens’"), and not a word of shouting ("NINE").
String? _asName(String word) {
  final w = word.replaceAll(RegExp(r"[’']s?$"), '');
  if (w.length >= 2 && w == w.toUpperCase()) return null;
  if (_notNames.contains(w)) return null;
  return _capital(w) ? w : null;
}

/// The capitalised runs in [paragraph], and whether each starts a sentence.
List<({String term, bool start})> _runs(String paragraph) {
  final words = _word.allMatches(paragraph).toList();
  final out = <({String term, bool start})>[];
  var i = 0;
  while (i < words.length) {
    final w = words[i];
    final text = _asName(w[0]!);
    if (text == null) {
      i++;
      continue;
    }
    final start = _sentenceEnd.hasMatch(paragraph.substring(0, w.start));
    final parts = [text];
    var j = i + 1;
    while (j < words.length) {
      final gap = paragraph.substring(words[j - 1].end, words[j].start);
      if (gap.trim().isNotEmpty) break; // Punctuation between: the name ends.
      final next = _asName(words[j][0]!);
      if (next != null) {
        parts.add(next);
        j++;
        continue;
      }
      // "of the": a join, when a capital follows it.
      if (_joins.contains(words[j][0])) {
        var k = j + 1;
        while (k < words.length && _joins.contains(words[k][0])) {
          k++;
        }
        if (k < words.length &&
            paragraph.substring(words[k - 1].end, words[k].start).trim().isEmpty &&
            _asName(words[k][0]!) != null) {
          for (var n = j; n < k; n++) {
            parts.add(words[n][0]!);
          }
          j = k;
          continue;
        }
      }
      break;
    }
    out.add((term: parts.join(' '), start: start));
    i = j;
  }
  return out;
}

bool _capital(String w) => w.isNotEmpty && w[0] != w[0].toLowerCase() && w[0] == w[0].toUpperCase();

/// The index of [chapters] (in reading order, each its id and paragraphs).
BookIndex bookIndex(List<({String id, List<String> paragraphs})> chapters) {
  // First, every run and where; names are the runs ever written mid-sentence.
  final midSentence = <String>{};
  final seen = <({String term, bool start, int chapter, int block})>[];
  for (final (c, chapter) in chapters.indexed) {
    for (final (b, p) in chapter.paragraphs.indexed) {
      for (final r in _runs(p)) {
        seen.add((term: r.term, start: r.start, chapter: c, block: b));
        if (!r.start) midSentence.add(r.term);
      }
    }
  }
  final places = <String, Map<int, ({int block, int count})>>{};
  for (final s in seen) {
    // A run beginning a sentence is a name only when it is one elsewhere; else, without its first word ("Then Wren").
    var term = s.term;
    if (s.start && !midSentence.contains(term)) {
      final rest = term.split(' ').skip(1).join(' ');
      if (rest.isEmpty || !midSentence.contains(rest)) continue;
      term = rest;
    }
    final byChapter = places.putIfAbsent(term, () => {});
    final at = byChapter[s.chapter];
    byChapter[s.chapter] = at == null ? (block: s.block, count: 1) : (block: at.block, count: at.count + 1);
  }
  final entries = [
    for (final MapEntry(key: term, value: byChapter) in places.entries)
      (
        term: term,
        count: byChapter.values.fold(0, (n, p) => n + p.count),
        places: [
          for (final MapEntry(key: c, value: p) in (byChapter.entries.toList()..sort((a, b) => a.key - b.key)))
            (number: c + 1, nodeId: chapters[c].id, block: p.block, count: p.count),
        ],
      ),
  ]..sort((a, b) => _sortKey(a.term).compareTo(_sortKey(b.term)));
  return (entries: entries, lookAlikes: lookAlikes(entries));
}

/// Sorted as an index is: without a leading "The", ignoring case.
String _sortKey(String term) => term.replaceFirst(RegExp(r'^The\s+'), '').toLowerCase();

/// Names of one word, five letters or more, a letter apart (two apart, from eight letters): perhaps one name spelled two
/// ways. A plural or a possessive is not a second spelling.
List<LookAlike> lookAlikes(List<IndexEntry> entries) {
  final words = [
    for (final e in entries)
      if (!e.term.contains(' ') && e.term.length >= 5) e,
  ];
  final out = <LookAlike>[];
  for (var i = 0; i < words.length; i++) {
    for (var j = i + 1; j < words.length; j++) {
      final a = words[i].term;
      final b = words[j].term;
      if ((a.length - b.length).abs() > 2) continue;
      final la = a.toLowerCase();
      final lb = b.toLowerCase();
      if (la == '${lb}s' || lb == '${la}s' || la == '${lb}es' || lb == '${la}es') continue;
      final most = math.min(a.length, b.length) >= 8 ? 2 : 1;
      if (_distance(la, lb) <= most) out.add((a: words[i], b: words[j]));
    }
  }
  return out;
}

/// How many letters must change to make [a] into [b] (adding, removing, replacing, or swapping two side by side).
int _distance(String a, String b) {
  final d = List.generate(a.length + 1, (i) => List.filled(b.length + 1, 0));
  for (var i = 0; i <= a.length; i++) {
    d[i][0] = i;
  }
  for (var j = 0; j <= b.length; j++) {
    d[0][j] = j;
  }
  for (var i = 1; i <= a.length; i++) {
    for (var j = 1; j <= b.length; j++) {
      final cost = a[i - 1] == b[j - 1] ? 0 : 1;
      d[i][j] = math.min(math.min(d[i - 1][j] + 1, d[i][j - 1] + 1), d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] == b[j - 2] && a[i - 2] == b[j - 1]) {
        d[i][j] = math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/// [bookIndex] over the chapters as stored (JSON text, as `NovelStore.rawJsonIn` reads them), in reading order
/// [order], as a job for an isolate.
BookIndex Function() bookIndexJob(List<String> storedContents, List<String> order) => () {
  final wanted = order.toSet();
  final pages = <String, List<String>>{};
  for (final json in storedContents) {
    try {
      final row = jsonDecode(json);
      if (row is! Map || !wanted.contains(row['id'])) continue;
      pages['${row['id']}'] = blockTexts(row['doc']);
    } on FormatException {
      continue;
    }
  }
  return bookIndex([for (final id in order) (id: id, paragraphs: pages[id] ?? const [])]);
};
