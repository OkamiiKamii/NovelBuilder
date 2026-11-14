/// POSTCARDS FROM YOUR WORLD: each place in the book as a postcard, "Greetings from" on a painted front and on the
/// back a line the book sets there. The places are the world's locations, and the places the pages name that are not
/// kept yet (a capitalised name ending in Forest, City, Tower, Bay…, or "the Kingdom of …"). A place the book never
/// names in a sentence has no postcard: a postcard needs a line.
///
/// The painting is chosen from what the place is (its name and what is said of it): the sea, trees, peaks, roofs, a
/// tower, dunes, or fields when nothing says; its light (dawn, noon, dusk, night, storm) from its name, so a place
/// always looks the same. Reads only.
library;

import 'dart:convert';

import 'best_lines.dart';
import 'prose.dart';

/// What a postcard's painting shows.
typedef Scenery = ({bool water, bool trees, bool peaks, bool roofs, bool tower, bool beacon, bool dunes});

/// A postcard: the place, the line on the back and where it is (the chapter, 1 first, its title, its id and the
/// paragraph), what the front shows, its light (0–4), and whether the place is kept in the world.
typedef Postcard = ({
  String place,
  String line,
  int chapter,
  String chapterTitle,
  String nodeId,
  int block,
  Scenery scenery,
  int light,
  bool kept,
});

/// A place the world keeps: what it is called (the first the name on the card), and what is said of it.
typedef KeptPlace = ({List<String> names, String about});

/// A chapter for the postcards: its id, its title, its paragraphs (every block, a heading as `null`).
typedef PostcardChapter = ({String id, String title, List<String?> paragraphs});

/// The most postcards a book is sent.
const postcardsKept = 16;

/// The lights a postcard can be painted in.
const postcardLights = ['dawn', 'noon', 'dusk', 'night', 'storm'];

const _placeNouns = [
  'Forest',
  'Woods',
  'Wood',
  'Grove',
  'City',
  'Town',
  'Village',
  'Hamlet',
  'Mountains',
  'Mountain',
  'Peak',
  'Peaks',
  'River',
  'Lake',
  'Sea',
  'Ocean',
  'Bay',
  'Coast',
  'Shore',
  'Isle',
  'Island',
  'Islands',
  'Valley',
  'Vale',
  'Desert',
  'Plains',
  'Fields',
  'Road',
  'Street',
  'Lane',
  'Tower',
  'Castle',
  'Keep',
  'Fortress',
  'Fort',
  'Palace',
  'Temple',
  'Abbey',
  'Monastery',
  'Academy',
  'Inn',
  'Tavern',
  'Harbour',
  'Harbor',
  'Port',
  'Gate',
  'Bridge',
  'Hall',
  'Kingdom',
  'Empire',
  'Realm',
  'Marsh',
  'Swamp',
  'Fen',
  'Hills',
  'Cliffs',
  'Falls',
  'Canyon',
  'Caverns',
  'Cave',
  'Caves',
  'Ruins',
  'Square',
  'Market',
  'Wastes',
  'Jungle',
  'Glacier',
  'Pass',
];

final _named = RegExp(
  "\\b((?:[A-Z][\\p{L}’'\\-]+ ){1,3}(?:${_placeNouns.join('|')}))\\b"
  "|\\b((?:Kingdom|Empire|Realm|City|Isle|Isles|Forest|Duchy|Republic) of (?:the )?[A-Z][\\p{L}’'\\-]+)",
  unicode: true,
);

const _leading = {
  'The',
  'A',
  'An',
  'In',
  'At',
  'On',
  'To',
  'From',
  'Into',
  'Through',
  'Across',
  'Near',
  'Beyond',
  'Then',
  'When',
  'And',
  'But',
  'As',
  'Of',
  'Towards',
  'Toward',
  'By',
  'Past',
  'Over',
  'Under',
  'Inside',
  'Outside',
  'So',
  'If',
};

final _sentence = RegExp(r'[^.!?…]+[.!?…]+["”’]*|[^.!?…]+$');
final _word = RegExp(r"[\p{L}][\p{L}’'\-]*", unicode: true);

/// The places the pages name by the look of the name (see the library comment), without a "the" or "in" before.
List<String> placesNamedIn(String text) => [for (final m in _named.allMatches(text)) ?_trim(m[1] ?? m[2]!)];

String? _trim(String name) {
  final words = name.split(' ');
  while (words.isNotEmpty && _leading.contains(words.first)) {
    words.removeAt(0);
  }
  // One word left is no name of a place: "Forest" alone is only a forest.
  return words.length < 2 ? null : words.join(' ');
}

bool _has(String text, List<String> words) {
  final lower = text.toLowerCase();
  return words.any((w) => RegExp('\\b$w', unicode: true).hasMatch(lower));
}

/// What the painting of a place shows, from [text]: its name and what is said of it.
Scenery sceneryOf(String text) {
  final water = _has(text, [
    'sea',
    'bay',
    'harbou?r',
    'coast',
    'quay',
    'shore',
    'ship',
    'wreck',
    'lighthouse',
    'causeway',
    'island',
    'isle',
    'lake',
    'river',
    'ocean',
    'port',
    'tide',
    'beach',
    'falls',
    'water',
    'drowned',
  ]);
  final trees = _has(text, ['forest', 'wood', 'tree', 'grove', 'jungle', 'orchard', 'glade']);
  final peaks = _has(text, ['mountain', 'peak', 'cliff', 'pass', 'ridge', 'summit', 'glacier', 'crag']);
  final roofs = _has(text, [
    'town',
    'city',
    'street',
    'village',
    'market',
    'square',
    'house',
    'shop',
    'lane',
    'quarter',
    'inn',
    'tavern',
    'hamlet',
    'roof',
    'capital',
  ]);
  final tower = _has(text, ['tower', 'keep', 'castle', 'lighthouse', 'fortress', 'fort', 'palace', 'citadel', 'spire']);
  final dunes = _has(text, ['desert', 'sand', 'dune', 'wastes']);
  final beacon = _has(text, ['lighthouse', 'beacon', 'lamp']);
  return (water: water, trees: trees, peaks: peaks, roofs: roofs, tower: tower || beacon, beacon: beacon, dunes: dunes);
}

/// The light a place is painted in (an index of [postcardLights]): always the same for the same name.
int lightOf(String place) => place.codeUnits.fold(7, (h, c) => (h * 31 + c) & 0x7fffffff) % postcardLights.length;

/// The postcards of the book of [chapters] (in reading order): the world's [kept] places, and the places its pages
/// name that are not kept; in the order the book first names them.
List<Postcard> postcards(List<PostcardChapter> chapters, List<KeptPlace> kept) {
  // Every sentence, where it is.
  final sentences = <({String text, int chapter, int block})>[];
  for (final (c, chapter) in chapters.indexed) {
    for (final (b, text) in chapter.paragraphs.indexed) {
      if (text == null) continue;
      for (final m in _sentence.allMatches(text)) {
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
      final n = _word.allMatches(s.text).length;
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

/// [postcards] over the chapters as stored (JSON text, as `NovelStore.rawJsonIn` reads them): [order] is the chapters'
/// ids in reading order, [titles] their titles. A job for an isolate.
List<Postcard> Function() postcardsJob(
  List<String> storedContents,
  List<String> order,
  Map<String, String> titles,
  List<KeptPlace> kept,
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
  return postcards([
    for (final id in order)
      (
        id: id,
        title: titles[id] ?? '',
        paragraphs: [for (final b in blocks[id] ?? const <({bool heading, String text})>[]) b.heading ? null : b.text],
      ),
  ], kept);
};
