import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/analytics/book_print.dart';
import 'package:novel_builder/shared/domain/characters/character_records.dart';
import 'package:novel_builder/shared/domain/characters/named_in.dart';
import 'package:novel_builder/shared/domain/characters/voice.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/records/entry.dart';

import '../../helpers/large_novel.dart';

// Who said what, as it was found before (every line of every paragraph looked at, whoever is named): kept as the
// reference the faster reading must agree with.
const _oldSpeech = [
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

final _oldQuote = RegExp(r'“([^”]+)”|"([^"]+)"');

List<Spoken> oldSpokenBy(Map<String, List<String>> pages, List<String> nodeIds, List<String> names, {int limit = 60}) {
  final wanted = {for (final n in names) n.trim()}.where((n) => n.isNotEmpty).toList()
    ..sort((a, b) => b.length - a.length);
  if (wanted.isEmpty) return const [];
  final name = '(?:${wanted.map(RegExp.escape).join('|')})';
  final verb = '(?:${_oldSpeech.join('|')})';
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
      final quotes = _oldQuote.allMatches(text).toList();
      if (quotes.isEmpty) continue;
      var theirs = <int>{};
      for (final (q, m) in quotes.indexed) {
        final tail = text.substring(m.end, (m.end + 80).clamp(0, text.length));
        final head = text.substring(q == 0 ? 0 : quotes[q - 1].end, m.start);
        if (after.hasMatch(tail) || before.hasMatch(head)) theirs.add(q);
      }
      if (theirs.isEmpty) continue;
      // The only one named as speaking here: every line in it is theirs.
      final speakers = {for (final s in anyone.allMatches(text.replaceAll(_oldQuote, ' '))) (s[1] ?? s[2])!};
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

/// The book's fingerprint and who said what read with far fewer searches: the same threads and the same lines as
/// before, over a long book (its thousand names, and the first names its pages use) and a book of the hard cases.
void main() {
  final s = largeNovel();
  final entries = [for (final r in s.rows('loreEntries')) Entry(r)];
  final profiles = {for (final r in s.rows('characterProfiles')) str(r['entryId']): CharacterProfile(r)};
  final names = {
    ...namesToFind(entries, profiles),
    for (final n in ['Mira', 'Kai', 'Ren', 'Tamsin', 'Oren', 'Lise', 'Bram', 'Ysolde', 'Corin', 'Ada', 'Hale', 'Nadia'])
      'called $n': [n],
  };
  final pages = {
    for (final r in s.rows('chapterContents').take(120))
      str(r['id']): [
        for (final b in docBlocks(r['doc']))
          if (!b.heading) b.text,
      ],
  };
  final chapters = [for (final id in pages.keys) (id: id, title: id)];

  final hard = {
    'h1': [
      '“We cross at dawn,” said Wren Hollis. Wren looked at the water; a wren sang on the rail.',
      'Kai whispered: “Not before the tide.” Kai2 laughed. Mikai said nothing.',
      '“Is it far?” asked Mary-Jane. “Far enough,” Wren said. Wren and Kai went on.',
      'Nobody spoke.',
      '',
      'Ren Vane said, “Rank one is D tier.” Ren said nothing more.',
    ],
  };
  final hardNames = {
    'wren': ['Wren Hollis', 'Wren'],
    'kai': ['Kai'],
    'mj': ['Mary-Jane'],
    'ren': ['Ren Vane', 'Ren'],
    'short': ['W'],
  };

  test('the fingerprint: the same threads, paragraph for paragraph', () {
    final patterns = namePatterns(names);
    final print = bookPrint(chapters, pages, names);
    var given = 0;
    for (final c in print.chapters) {
      final searched = printLines(pages[c.id]!, patterns);
      expect(c.lines.toString(), searched.toString(), reason: c.id);
      given += c.lines.where((l) => l.who != null).length;
    }
    expect(given, greaterThan(100), reason: 'paragraphs are given to people: the test compares something');
    final hardPrint = bookPrint([(id: 'h1', title: 'Ferry')], hard, hardNames);
    expect(hardPrint.chapters.single.lines.toString(), printLines(hard['h1']!, namePatterns(hardNames)).toString());
    expect(hardPrint.shares, isNotEmpty);
  });
  test('who said what: the same lines, in the same order', () {
    // The long book's pages are narration (no lines in quotes): no one is given a line, before or now.
    for (final list in [...names.values.take(200), ...names.values.skip(names.length - 12)]) {
      final found = spokenBy(pages, pages.keys.toList(), list, limit: 400);
      expect(found.toString(), oldSpokenBy(pages, pages.keys.toList(), list, limit: 400).toString(), reason: '$list');
    }
    // The book of hard cases is all talk: the same lines for each, and lines there are.
    var said = 0;
    for (final list in hardNames.values) {
      final found = spokenBy(hard, ['h1'], list);
      expect(found.toString(), oldSpokenBy(hard, ['h1'], list).toString(), reason: '$list');
      said += found.length;
    }
    expect(said, greaterThanOrEqualTo(4), reason: 'Wren, Kai, Mary-Jane and Ren Vane speak');
  });

  test('everyone’s lines in one reading: for each, the same lines as asking for them alone', () {
    // The long book: its names and the first names its pages use, all at once.
    final everyone = {
      for (final (i, list) in [...names.values.take(300), ...names.values.skip(names.length - 12)].indexed) i: list,
    };
    final each = spokenByEach(pages, pages.keys.toList(), everyone, limit: 400);
    for (final MapEntry(key: i, value: list) in everyone.entries) {
      expect(each[i].toString(), oldSpokenBy(pages, pages.keys.toList(), list, limit: 400).toString(), reason: '$list');
    }
    // The book of hard cases, all talk; and with a limit that stops part way.
    for (final limit in [1, 2, 60]) {
      final hardEach = spokenByEach(hard, ['h1'], hardNames, limit: limit);
      for (final MapEntry(key: who, value: list) in hardNames.entries) {
        expect(
          hardEach[who].toString(),
          oldSpokenBy(hard, ['h1'], list, limit: limit).toString(),
          reason: '$who $limit',
        );
      }
    }
    expect(spokenByEach(hard, ['h1'], hardNames)['wren'], isNotEmpty);
    expect(spokenByEach(hard, ['missing'], hardNames)['wren'], isEmpty, reason: 'a chapter with no pages');
  });
}
