import 'dart:convert';

import '../json.dart';
import '../manuscript/prose.dart';

/// IN THEIR OWN WORDS: the lines the manuscript gives a character to say, found by how dialogue is written, never
/// guessed:
///
/// - a quotation followed by a word of speech and their name: “It's going,” Wren said / “Go,” said Nan;
/// - their name and a word of speech before it: Wren said, “Go.” / Ilse whispered: “Close the drawer.”;
/// - and in a paragraph where they are the only one named as speaking, its other quotations too (“Nine days,” Wren
///   said. “Nine days of low water.”).
///
/// "She said" names no one and is left alone; so is any paragraph where two are named as speaking and a line is not
/// tied to either.
typedef Spoken = ({String nodeId, int block, String words});

const _speech = [
  'said',
  'says',
  'asked',
  'asks',
  'whispered',
  'shouted',
  'called',
  'replied',
  'answered',
  'murmured',
  'cried',
  'snapped',
  'muttered',
  'added',
  'told',
  'began',
  'sang',
  'breathed',
  'laughed',
  'sighed',
  'admitted',
  'insisted',
  'demanded',
  'warned',
  'yelled',
  'hissed',
  'growled',
  'went on',
  'agreed',
  'explained',
  'repeated',
  'gasped',
];

final _quote = RegExp(r'“([^”]+)”|"([^"]+)"');

/// Every line [names] speak in [pages] (each chapter's paragraphs), in the order of [nodeIds], at most [limit].
List<Spoken> spokenBy(Map<String, List<String>> pages, List<String> nodeIds, List<String> names, {int limit = 60}) {
  final wanted = {for (final n in names) n.trim()}.where((n) => n.isNotEmpty).toList()
    ..sort((a, b) => b.length - a.length);
  if (wanted.isEmpty) return const [];
  final name = '(?:${wanted.map(RegExp.escape).join('|')})';
  final verb = '(?:${_speech.join('|')})';
  // After a line: “…,” Wren said / “…,” said Wren.
  final after = RegExp(r'^\s*(?:(' + name + r')\s+' + verb + r'\b|' + verb + r'\s+(' + name + r')\b)', unicode: true);
  // Before a line: Wren said, “…” / Ilse whispered: “…”.
  final before = RegExp('($name)\\s+$verb(?:\\s+\\w+)?\\s*[,:]?\\s*\$', unicode: true);
  // Anyone named as speaking at all, for telling a paragraph of one speaker from one of two.
  final anyone = RegExp(r"(\p{Lu}[\p{L}'’-]+)\s+" + verb + r'\b|\b' + verb + r"\s+(\p{Lu}[\p{L}'’-]+)", unicode: true);

  final out = <Spoken>[];
  for (final id in nodeIds) {
    final blocks = pages[id];
    if (blocks == null) continue;
    for (final (i, text) in blocks.indexed) {
      final quotes = _quote.allMatches(text).toList();
      if (quotes.isEmpty) continue;
      var theirs = <int>{};
      for (final (q, m) in quotes.indexed) {
        final tail = text.substring(m.end, (m.end + 80).clamp(0, text.length));
        final head = text.substring(q == 0 ? 0 : quotes[q - 1].end, m.start);
        if (after.hasMatch(tail) || before.hasMatch(head)) theirs.add(q);
      }
      if (theirs.isEmpty) continue;
      // The only one named as speaking here: every line in it is theirs.
      final speakers = {for (final s in anyone.allMatches(text.replaceAll(_quote, ' '))) (s[1] ?? s[2])!};
      final mine = speakers.where((s) => wanted.any((w) => w == s || w.split(' ').contains(s))).toSet();
      if (speakers.length == mine.length) theirs = {for (var q = 0; q < quotes.length; q++) q};
      for (final q in theirs.toList()..sort()) {
        final words = (quotes[q][1] ?? quotes[q][2]!).trim().replaceAll(RegExp(r'[,]$'), '');
        if (words.length < 2) continue;
        out.add((nodeId: id, block: i, words: words));
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}

/// [spokenBy] over the chapters as stored (JSON text, as `NovelStore.rawJsonIn` reads them), as a job for an
/// isolate: decoded and read away from the screen. Only plain data in and out, so it can be sent.
List<Spoken> Function() spokenJob(List<String> storedContents, List<String> nodeIds, List<String> names) => () {
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
  return spokenBy(pages, nodeIds, names);
};
