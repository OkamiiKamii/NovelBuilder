/// THE GAZETTE: each chapter of the book as the front page of its world's newspaper, an edition a chapter. The paper
/// is named for the place the book names most ("The Vell Gazette"), else for the book ("The Ash Road Herald"). Each
/// front page: the chapter's title as the headline, its best line beneath (`best_lines.dart`), its opening as the lead
/// story, the lines said in it and who said them (`characters/voice.dart`), the weather the chapter's own words give,
/// and who is in the news (the names it says most). The last edition looks ahead: tomorrow's paper is not written yet.
///
/// Only the author's words, cut and set; nothing written for them. Reads only.
library;

import 'dart:convert';

import '../characters/cast_names.dart';
import '../characters/voice.dart';
import 'best_lines.dart';
import 'postcards.dart' show placesNamedIn;
import 'prose.dart';

/// What the sky is doing in a chapter, by the words it uses.
enum Weather {
  storm('Storms. Stay off the roads.', ['storm', 'thunder', 'lightning', 'gale', 'tempest']),
  rain('Rain, and more of it.', ['rain', 'drizzle', 'downpour', 'raining', 'rained', 'wet']),
  snow('Snow; the roads are white.', ['snow', 'frost', 'sleet', 'ice', 'icy', 'blizzard']),
  fog('Fog by morning, lifting late.', ['fog', 'mist', 'haze', 'murk', 'foggy', 'misty']),
  wind('High winds; hold on to your hat.', ['wind', 'gust', 'gusts', 'windy', 'breeze']),
  sun('Bright and warm.', ['sun', 'sunlight', 'sunny', 'heat', 'warm', 'bright']),
  night('A long night, and a clear one.', ['night', 'moon', 'stars', 'dark', 'darkness', 'midnight']),
  fair('Fair, for now.', []);

  const Weather(this.forecast, this.words);

  /// What the paper says of it.
  final String forecast;

  /// The words in a chapter that bring it.
  final List<String> words;
}

/// A line said in a chapter, and who said it.
typedef Said = ({String words, String speaker});

/// One front page: the chapter it is (1 first) and its id; the headline and the line beneath it; the lead story (the
/// chapter's opening, cut at a sentence) and whether there is more of it; the lines said; the weather and the word
/// that brought it and how often; who is in the news and how often named; the words the chapter runs to.
typedef Edition = ({
  int chapter,
  String nodeId,
  String headline,
  String deck,
  List<String> lead,
  bool continues,
  List<Said> said,
  Weather weather,
  String weatherWord,
  int weatherCount,
  List<({String name, int count})> inTheNews,
  int words,
});

/// The paper: its name and its editions, a chapter each in reading order.
typedef Gazette = ({String name, List<Edition> editions});

/// A chapter for the paper: its id, title and paragraphs (headings left out).
typedef GazetteChapter = ({String id, String title, List<String> paragraphs});

/// A character for the paper: the name they go by (first) and every name they are found by.
typedef GazettePerson = ({String name, List<String> names});

/// The words the lead story runs to, at most.
const leadWords = 120;

final _sentence = RegExp(r'[^.!?…]+[.!?…]+["”’]*|[^.!?…]+$');
final _word = RegExp(r"[\p{L}][\p{L}’'\-]*", unicode: true);

int _count(String text) => _word.allMatches(text).length;

/// The paper's name: for [place] when there is one ("The Vell Gazette"), else for the book [title].
String gazetteName(String? place, String title) {
  if (place != null && place.trim().isNotEmpty) {
    return 'The ${place.trim().replaceFirst(RegExp(r'^The\s+'), '')} Gazette';
  }
  final book = title.trim().replaceFirst(RegExp(r'^The\s+'), '');
  return book.isEmpty ? 'The Morning Herald' : 'The $book Herald';
}

/// The lead story of [paragraphs]: the opening, cut at the end of a sentence near [leadWords]; and whether it goes on.
({List<String> lead, bool continues}) leadOf(List<String> paragraphs) {
  final out = <String>[];
  var words = 0;
  for (final p in paragraphs) {
    final text = p.trim();
    if (text.isEmpty) continue;
    final n = _count(text);
    if (words + n <= leadWords) {
      out.add(text);
      words += n;
      continue;
    }
    // The paragraph that crosses the line, cut at its last sentence that fits (one sentence at least, when nothing
    // has been set yet).
    final kept = StringBuffer();
    for (final m in _sentence.allMatches(text)) {
      final s = m[0]!;
      if (words + _count(s) > leadWords && (out.isNotEmpty || kept.isNotEmpty)) break;
      kept.write(s);
      words += _count(s);
    }
    if (kept.isNotEmpty) out.add(kept.toString().trim());
    return (lead: out, continues: true);
  }
  return (lead: out, continues: false);
}

/// The weather of a chapter's [text]: the kind its words bring most (a storm over rain, rain over fair skies), the
/// word, and how often it is said.
({Weather weather, String word, int count}) weatherOf(String text) {
  final counts = <String, int>{};
  for (final m in _word.allMatches(text.toLowerCase())) {
    counts.update(m[0]!, (n) => n + 1, ifAbsent: () => 1);
  }
  ({Weather weather, String word, int count})? best;
  for (final w in Weather.values) {
    var total = 0;
    String? top;
    var topCount = 0;
    for (final word in w.words) {
      final n = counts[word] ?? 0;
      total += n;
      if (n > topCount) {
        top = word;
        topCount = n;
      }
    }
    // Twice is weather; once is a word.
    if (top != null && total >= 2 && (best == null || total > best.count)) {
      best = (weather: w, word: top, count: total);
    }
  }
  return best ?? (weather: Weather.fair, word: '', count: 0);
}

/// The paper for the book called [title], of [chapters] (in reading order) and [people]; [places] are the world's
/// places (each its names), the places the pages name besides.
Gazette gazette(
  String title,
  List<GazetteChapter> chapters,
  List<GazettePerson> people, {
  List<List<String>> places = const [],
}) {
  final pages = {for (final c in chapters) c.id: c.paragraphs};
  final all = [for (final c in chapters) ...c.paragraphs].join('\n');

  // The place named most names the paper: the world's places, then the places the pages name (a name not already
  // there, whatever its capitals), all counted over the book in one reading.
  final placeNames = <(String, List<String>)>[
    for (final names in places)
      if (names.isNotEmpty) (names.first, names),
  ];
  final known = {for (final (key, _) in placeNames) key.toLowerCase()};
  for (final p in chapters.expand((c) => c.paragraphs)) {
    for (final name in placesNamedIn(p)) {
      if (known.add(name.toLowerCase())) placeNames.add((name, [name]));
    }
  }
  final placeCounts = _NameCounts([for (final (_, names) in placeNames) names]).inText(all);
  final named = <String, int>{for (final (i, (key, _)) in placeNames.indexed) key: placeCounts[i]};
  final place = named.entries
      .where((e) => e.value > 0)
      .fold<MapEntry<String, int>?>(null, (best, e) => best == null || e.value > best.value ? e : best);

  final editions = <Edition>[];
  final peopleCounts = _NameCounts([for (final p in people) p.names]);
  for (final (i, c) in chapters.indexed) {
    final text = c.paragraphs.join('\n');
    final words = _count(text);
    if (words == 0) continue;
    final best = bestLines([(id: c.id, paragraphs: c.paragraphs)]);
    final lead = leadOf(c.paragraphs);
    // The deck is a line the lead story does not already hold, else (a short chapter, all of it in the lead) its best.
    final leadText = lead.lead.join(' ');
    final deck = best
        .map((l) => l.text)
        .firstWhere((l) => !leadText.contains(l), orElse: () => best.isEmpty ? '' : best.first.text);
    final said = <Said>[];
    // Every run of three characters the chapter holds: a name with a run of three that is not among them is not
    // written in it, and is not looked for.
    final grams = {for (var k = 0; k + 3 <= text.length; k++) text.substring(k, k + 3)};
    bool written(String name) {
      for (var k = 0; k + 3 <= name.length; k++) {
        if (!grams.contains(name.substring(k, k + 3))) return false;
      }
      return text.contains(name);
    }

    for (final p in people) {
      // A line is someone's only where one of their names is written by it: a chapter without any is passed over.
      if (!p.names.any((n) => n.trim().isNotEmpty && written(n.trim()))) continue;
      for (final s in spokenBy(pages, [c.id], p.names, limit: 12)) {
        final n = _count(s.words);
        if (n < 3 || n > 18) continue;
        said.add((words: s.words.trim(), speaker: p.name));
        break;
      }
    }
    final mentions = peopleCounts.inText(text);
    final news = [
      for (final (i, p) in people.indexed)
        if (mentions[i] case final n when n > 0) (name: p.name, count: n),
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

/// How many times [name] stands in [text] as a word of its own (`standingAt`: checked by hand).
int _mentions(String text, String name) => standingAt(text, name).length;

/// Counts, for each of some lists of names, how many times its names stand in a text (each name counted where it
/// stands, as [_mentions] counts it): the text read once for all of them (`cast_names.dart`) instead of a search a name,
/// with the finder made once for every text it reads. A list holding a name with spaces round it, or an empty one, is
/// counted name by name, as before.
class _NameCounts {
  _NameCounts(this.lists)
    : _plain = [for (final names in lists) names.every((n) => n.isNotEmpty && n == n.trim())],
      _finder = CastNames([
        for (final (i, names) in lists.indexed)
          if (names.every((n) => n.isNotEmpty && n == n.trim())) (id: '$i', names: names),
      ]);

  final List<List<String>> lists;
  final List<bool> _plain;
  final CastNames _finder;

  List<int> inText(String text) {
    final counts = List.filled(lists.length, 0);
    for (final h in _finder.all(text)) {
      counts[int.parse(h.id)]++;
    }
    for (final (i, names) in lists.indexed) {
      if (!_plain[i]) {
        counts[i] = names.fold(0, (n, name) => n + _mentions(text, name));
      }
    }
    return counts;
  }
}

/// [gazette] over the chapters as stored (JSON text, as `NovelStore.rawJsonIn` reads them): [order] is the chapters'
/// ids in reading order, [titles] their titles. A job for an isolate.
Gazette Function() gazetteJob(
  String title,
  List<String> storedContents,
  List<String> order,
  Map<String, String> titles,
  List<GazettePerson> people,
  List<List<String>> places,
) => () {
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
  return gazette(
    title,
    [for (final id in order) (id: id, title: titles[id] ?? '', paragraphs: pages[id] ?? const <String>[])],
    people,
    places: places,
  );
};
