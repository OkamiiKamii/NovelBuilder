import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/characters/cast_names.dart';
import 'package:novel_builder/shared/domain/characters/character_records.dart';
import 'package:novel_builder/shared/domain/characters/named_in.dart';
import 'package:novel_builder/shared/domain/characters/voice.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/manuscript/best_lines.dart';
import 'package:novel_builder/shared/domain/manuscript/gazette.dart';
import 'package:novel_builder/shared/domain/manuscript/postcards.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/model/story_order.dart';
import 'package:novel_builder/shared/domain/records/entry.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';

import '../../helpers/large_novel.dart';

// The Gazette and the postcards as they were made before: a search a name, a chapter, a sentence. Kept here as the
// reference the faster reading must agree with, word for word.

final _oldSentence = RegExp(r'[^.!?…]+[.!?…]+["”’]*|[^.!?…]+$');
final _oldWord = RegExp(r"[\p{L}][\p{L}’'\-]*", unicode: true);
int _oldCount(String text) => _oldWord.allMatches(text).length;
int _oldMentions(String text, String name) =>
    RegExp(r'(?<![\p{L}])' + RegExp.escape(name) + r'(?![\p{L}])', unicode: true).allMatches(text).length;

Gazette oldGazette(
  String title,
  List<GazetteChapter> chapters,
  List<GazettePerson> people, {
  List<List<String>> places = const [],
}) {
  final pages = {for (final c in chapters) c.id: c.paragraphs};
  final all = [for (final c in chapters) ...c.paragraphs].join('\n');

  // The place named most names the paper.
  final named = <String, int>{};
  for (final names in places) {
    if (names.isEmpty) continue;
    named[names.first] = names.fold(0, (n, name) => n + _oldMentions(all, name));
  }
  for (final p in chapters.expand((c) => c.paragraphs)) {
    for (final name in placesNamedIn(p)) {
      if (!named.keys.any((k) => k.toLowerCase() == name.toLowerCase())) named[name] = _oldMentions(all, name);
    }
  }
  final place = named.entries
      .where((e) => e.value > 0)
      .fold<MapEntry<String, int>?>(null, (best, e) => best == null || e.value > best.value ? e : best);

  final editions = <Edition>[];
  for (final (i, c) in chapters.indexed) {
    final text = c.paragraphs.join('\n');
    final words = _oldCount(text);
    if (words == 0) continue;
    final best = bestLines([(id: c.id, paragraphs: c.paragraphs)]);
    final lead = leadOf(c.paragraphs);
    // The deck is a line the lead story does not already hold, else (a short chapter, all of it in the lead) its best.
    final leadText = lead.lead.join(' ');
    final deck = best
        .map((l) => l.text)
        .firstWhere((l) => !leadText.contains(l), orElse: () => best.isEmpty ? '' : best.first.text);
    final said = <Said>[];
    for (final p in people) {
      for (final s in spokenBy(pages, [c.id], p.names, limit: 12)) {
        final n = _oldCount(s.words);
        if (n < 3 || n > 18) continue;
        said.add((words: s.words.trim(), speaker: p.name));
        break;
      }
    }
    final news = [
      for (final p in people)
        if (p.names.fold(0, (n, name) => n + _oldMentions(text, name)) case final n when n > 0)
          (name: p.name, count: n),
    ]..sort((a, b) => b.count - a.count);
    final weather = weatherOf(text);
    editions.add((
      chapter: i + 1,
      nodeId: c.id,
      headline: c.title.trim().isEmpty ? 'Chapter ${i + 1}' : c.title.trim(),
      deck: deck,
      lead: lead.lead,
      continues: lead.continues,
      said: said.take(3).toList(),
      weather: weather.weather,
      weatherWord: weather.word,
      weatherCount: weather.count,
      inTheNews: news.take(4).toList(),
      words: words,
    ));
  }
  return (name: gazetteName(place?.key, title), editions: editions);
}

List<Postcard> oldPostcards(List<PostcardChapter> chapters, List<KeptPlace> kept) {
  // Every sentence, where it is.
  final sentences = <({String text, int chapter, int block})>[];
  for (final (c, chapter) in chapters.indexed) {
    for (final (b, text) in chapter.paragraphs.indexed) {
      if (text == null) continue;
      for (final m in _oldSentence.allMatches(text)) {
        final s = m[0]!.trim();
        if (s.isNotEmpty) sentences.add((text: s, chapter: c, block: b));
      }
    }
  }
  final places = <({String name, List<String> names, String about, bool kept})>[
    for (final p in kept)
      if (p.names.isNotEmpty) (name: p.names.first, names: p.names, about: p.about, kept: true),
  ];
  final known = {
    for (final p in places)
      for (final n in p.names) n.toLowerCase(),
  };
  for (final s in sentences) {
    for (final name in placesNamedIn(s.text)) {
      if (known.add(name.toLowerCase())) places.add((name: name, names: [name], about: '', kept: false));
    }
  }

  final out = <({Postcard card, int first})>[];
  for (final p in places) {
    final finds = [for (final n in p.names) RegExp('(?<![\\p{L}])${RegExp.escape(n)}(?![\\p{L}])', unicode: true)];
    ({String text, int chapter, int block})? best;
    var bestScore = 0;
    int? first;
    for (final (i, s) in sentences.indexed) {
      if (!finds.any((f) => f.hasMatch(s.text))) continue;
      first ??= i;
      final n = _oldWord.allMatches(s.text).length;
      if (n < 5 || n > 35) continue;
      if ('“'.allMatches(s.text).length != '”'.allMatches(s.text).length) continue;
      final score = lineScore(s.text);
      if (best == null || score > bestScore) {
        best = s;
        bestScore = score;
      }
    }
    if (best == null || first == null) continue;
    out.add((
      card: (
        place: p.name,
        line: best.text,
        chapter: best.chapter + 1,
        chapterTitle: chapters[best.chapter].title,
        nodeId: chapters[best.chapter].id,
        block: best.block,
        scenery: sceneryOf('${p.name} ${p.about} ${p.kept ? '' : best.text}'),
        light: lightOf(p.name),
        kept: p.kept,
      ),
      first: first,
    ));
  }
  out.sort((a, b) => a.first - b.first);
  return [for (final o in out.take(postcardsKept)) o.card];
}

/// The Gazette and the postcards read every chapter, sentence and name once, not a search a name: the same paper and
/// the same cards as before, over a long book and a book of the hard cases.
void main() {
  // A long book: its chapters in reading order, its cast and places by their own names, and the first names its pages
  // call people by (so the news and who said what are not empty).
  final s = largeNovel();
  final entries = [for (final r in s.rows('loreEntries')) Entry(r)];
  final profiles = {for (final r in s.rows('characterProfiles')) str(r['entryId']): CharacterProfile(r)};
  final names = namesToFind(entries, profiles);
  final docs = {for (final r in s.rows('chapterContents')) str(r['id']): r['doc']};
  final nodes = [
    for (final n in readingOrder([for (final r in s.rows('chapters')) StoryNode(r)]))
      if (n.kind != NodeKind.volume) n,
  ].take(90).toList();
  final chapters = [
    for (final n in nodes)
      (
        id: n.id,
        title: n.title,
        paragraphs: [
          for (final b in docBlocks(docs[n.id]))
            if (!b.heading) b.text,
        ],
      ),
  ];
  final people = [
    for (final e in entries)
      if (e.category == 'character' && (names[e.id] ?? []).isNotEmpty) (name: e.name, names: names[e.id]!),
    for (final n in ['Mira', 'Kai', 'Ren', 'Tamsin', 'Oren', 'Lise', 'Bram', 'Ysolde', 'Corin', 'Ada', 'Hale', 'Nadia'])
      (name: n, names: [n]),
  ];
  final places = [
    for (final e in entries)
      if (e.category == 'location' && (names[e.id] ?? []).isNotEmpty) names[e.id]!,
  ];

  // The hard cases: names in names, names said as speaking, marks, a name with spaces round it, places by the look.
  final hard = [
    (
      id: 'h1',
      title: 'The Ferry',
      paragraphs: [
        '“We cross at dawn,” said Wren Hollis. Wren looked at the water; a wren sang on the rail.',
        'Kai whispered: “Not before the tide.” Kai2 laughed. Mikai said nothing.',
        "O'Brien and O’Brien met at Port Salt. The Drowned Road ran past the Port Salt harbour.",
        '“Is it far?” asked Mary-Jane. “Far enough,” Wren said.',
      ],
    ),
    (
      id: 'h2',
      title: '',
      paragraphs: [
        'They came to Ashfall Keep at night. In Ashfall Keep the lamps were out, and the Drowned Road was quiet.',
        '“I know this place,” said  Kai. 3PO did not answer. R3PO did.',
        '',
      ],
    ),
  ];
  final hardPeople = [
    (name: 'Wren Hollis', names: ['Wren Hollis', 'Wren']),
    (name: 'Kai', names: ['Kai']),
    (name: "O'Brien", names: ["O'Brien", 'O’Brien']),
    (name: 'Mary-Jane', names: ['Mary-Jane']),
    (name: '3PO', names: ['3PO']),
    (name: 'Spaced', names: [' Wren ']),
    (name: 'Nobody', names: ['Nobody Here']),
  ];
  final hardPlaces = [
    ['Port Salt'],
    ['the Drowned Road', 'Drowned Road'],
    [' Ashfall Keep'],
  ];

  // The old search's look behind is not always honoured by the regular expressions here: for a name that does not
  // begin with a letter ("3PO") or has spaces round it (" Wren "), the old paper's counts were not the rule it states.
  // Those are compared with the rule below; everything else with the old paper, word for word.
  bool reliable(List<String> names) =>
      names.every((n) => n == n.trim() && RegExp(r'^\p{L}', unicode: true).hasMatch(n));
  final sure = [
    for (final p in hardPeople)
      if (reliable(p.names)) p,
  ];
  final surePlaces = [
    for (final p in hardPlaces)
      if (reliable(p)) p,
  ];

  test('the Gazette: the same paper, edition for edition', () {
    expect(
      gazette('The Long Book', chapters, people, places: places).toString(),
      oldGazette('The Long Book', chapters, people, places: places).toString(),
    );
    final hardPaper = gazette('The Ferry', hard, sure, places: surePlaces);
    expect(hardPaper.toString(), oldGazette('The Ferry', hard, sure, places: surePlaces).toString());
    expect(hardPaper.editions.first.said, isNotEmpty, reason: 'the hard book has lines said: the test compares them');
    expect(hardPaper.editions.first.inTheNews, isNotEmpty);
  });

  test('a name that is not a word of letters is counted by the rule: no letter just before it, none just after', () {
    final paper = gazette('The Ferry', hard, hardPeople, places: hardPlaces);
    int news(int edition, String who) =>
        paper.editions[edition].inTheNews.where((n) => n.name == who).firstOrNull?.count ?? 0;
    expect(news(1, '3PO'), 1, reason: '3PO did not answer; R3PO is another');
    // " Wren " ends in a space, so a letter after that space keeps it from standing: in these pages a word always
    // follows it ("Wren looked", "Wren said"). By the rule, never (the old search counted it 3 times).
    expect(news(0, 'Spaced'), 0);
    expect(standingAt('“ 3PO R3PO', '3PO'), [2], reason: 'the text the old search counted twice');
    expect(standingAt('Kai said. Mikai said. Kai2.', 'Kai'), [0, 22]);
    expect(standingAt('Ölaf and Olaf, Olafsson', 'Olaf'), [9]);
    expect(standingAt('anything', ''), isEmpty);
  });

  test('the postcards: the same cards, in the same order', () {
    final kept = [for (final p in places) (names: p, about: '')];
    expect(postcards(chapters, kept).toString(), oldPostcards(chapters, kept).toString());
    final hardKept = [for (final p in surePlaces) (names: p, about: 'A harbour town by the sea')];
    final hardCards = postcards(hard, hardKept);
    expect(hardCards.length, greaterThan(1));
    expect(hardCards.toString(), oldPostcards(hard, hardKept).toString());
    // A place with a space before its name stands only where no letter comes before that space: here, "to" and "In"
    // come before it, so there is no card; the same place without the space has one.
    final spaced = postcards(hard, [
      (names: const [' Ashfall Keep'], about: ''),
    ]);
    expect(spaced.where((c) => c.place == ' Ashfall Keep'), isEmpty);
    final plain = postcards(hard, [
      (names: const ['Ashfall Keep'], about: ''),
    ]);
    expect(plain.where((c) => c.place == 'Ashfall Keep'), isNotEmpty);
  });
}
