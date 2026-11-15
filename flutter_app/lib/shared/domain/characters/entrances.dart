/// ENTRANCES: the cast in order of appearance, as a reader meets them. Where each character first steps onto the
/// page (named in the narration, not only spoken of), the sentence they enter in, and what that first moment gives the
/// reader to hold on to: how they look, a line they say, something they do, or a thought of theirs. One who is
/// talked of in dialogue before they appear is marked so, with where. Chapters and paragraphs where many enter at
/// once, and those in the cast the pages have not brought on yet.
///
/// Read from the prose, never guessed at. Reads only.
library;

import 'dart:convert';

import '../manuscript/prose.dart';
import 'cast_names.dart';
import 'pov.dart' show EyesPerson, perceiving;

/// What an entrance gives the reader.
enum Gives { seen, speaks, acts, thinks }

/// A place in the book: the chapter (1 first), its id, the paragraph (as the editor counts its blocks) and the sentence.
typedef EntrancePlace = ({int chapter, String nodeId, int block, String sentence});

/// One character's entrance: who, where, what it gives, and where they were talked of first, if they were. [onStage]
/// is false for one the pages only ever speak of.
typedef Entrance = ({String id, EntrancePlace at, Set<Gives> gives, EntrancePlace? talkedOf, bool onStage});

/// A paragraph several people enter in at once.
typedef Crowd = ({int chapter, String nodeId, int block, List<String> ids});

/// The cast's entrances in reading order; the ids of those the pages never name; how many enter in each chapter (one
/// a chapter, in order); and the crowded paragraphs.
typedef Entrances = ({List<Entrance> order, List<String> unseen, List<int> perChapter, List<Crowd> crowds});

/// A chapter for the reading: its id and its blocks in order, headings marked.
typedef EntranceChapter = ({String id, List<({bool heading, String text})> blocks});

/// How many entering one paragraph make a crowd.
const crowdedParagraph = 3;

/// How many entering one chapter make a crowded chapter.
const crowdedChapter = 5;

final _quoted = RegExp(r'“[^”]*”|"[^"]*"');
final _sentence = RegExp(r'[^.!?…]+[.!?…]+["”’]*|[^.!?…]+$');

/// Words that describe how someone looks.
const _looks = {
  'hair',
  'eyes',
  'eye',
  'face',
  'beard',
  'scar',
  'scarred',
  'freckles',
  'freckled',
  'skin',
  'tall',
  'short',
  'thin',
  'broad',
  'stout',
  'slight',
  'lean',
  'wiry',
  'heavy',
  'old',
  'young',
  'grey',
  'gray',
  'white-haired',
  'bald',
  'braid',
  'braided',
  'cloak',
  'coat',
  'robe',
  'robes',
  'dress',
  'gown',
  'boots',
  'hat',
  'hood',
  'hooded',
  'armour',
  'armor',
  'wore',
  'dressed',
  'clad',
  'smile',
  'smiled',
  'grin',
  'jaw',
  'nose',
  'lips',
  'mouth',
  'brow',
  'shoulders',
  'hands',
  'fingers',
  'beautiful',
  'handsome',
  'plain',
  'pale',
  'tanned',
  'weathered',
  'wrinkled',
  'blond',
  'blonde',
  'red-haired',
  'dark-haired',
  'curls',
  'curly',
  'tattoo',
  'tattooed',
  'spectacles',
  'glasses',
};

/// Words of speaking, after or before a name.
const _speaking = {
  'said',
  'asked',
  'called',
  'shouted',
  'whispered',
  'replied',
  'answered',
  'muttered',
  'cried',
  'snapped',
  'murmured',
  'told',
  'yelled',
  'laughed',
  'sang',
  'began',
  'added',
  'says',
  'asks',
};

/// Doing, in the few common words that do not end in -ed.
const _doing = {
  'ran',
  'drew',
  'took',
  'came',
  'went',
  'stood',
  'sat',
  'held',
  'threw',
  'struck',
  'caught',
  'fell',
  'rose',
  'made',
  'put',
  'kept',
  'left',
  'led',
  'swung',
  'spun',
  'shot',
  'hit',
  'cut',
  'bit',
  'broke',
  'dug',
  'fought',
  'flew',
  'gave',
  'got',
  'grabbed',
  'hid',
  'leapt',
  'lit',
  'met',
  'paid',
  'rode',
  'rang',
  'sent',
  'set',
  'shook',
  'slid',
  'slept',
  'spoke',
  'stole',
  'strode',
  'swam',
  'swore',
  'tore',
  'wrote',
  'woke',
  'won',
  'bent',
  'built',
  'climbed',
  'crossed',
  'dropped',
  'opened',
  'closed',
  'pushed',
  'pulled',
  'turned',
  'walked',
  'stepped',
};

/// Words after a name that are not doing ("Kade was", "Kade and", "Kade’s").
const _notDoing = {'was', 'were', 'is', 'are', 'had', 'has', 'and', 'or', 'but', 'of', 'the', 'a', 'to', 'in', 'on'};

const _helpers = {'could', 'couldn’t', "couldn't", 'did', 'didn’t', "didn't", 'had'};

final _wordAfter = RegExp(r"^\s+(?:([\p{L}]+ly)\s+)?([\p{L}’'\-]+)(?:\s+([\p{L}’'\-]+))?", unicode: true);

/// "-ing" words after "was" that are not doing ("was nothing", "was something").
const _notActing = {'nothing', 'something', 'anything', 'everything', 'being', 'king', 'spring', 'thing'};

/// Past participles of doing that do not end in -ed, after "had".
const _participles = {
  'fallen',
  'gone',
  'taken',
  'broken',
  'driven',
  'ridden',
  'thrown',
  'drawn',
  'run',
  'come',
  'done',
  'given',
  'stolen',
  'swum',
  'written',
  'woken',
  'beaten',
  'begun',
  'bitten',
  'chosen',
  'eaten',
  'flown',
  'hidden',
  'risen',
  'shaken',
  'sworn',
  'torn',
  'worn',
  'struck',
  'fought',
  'caught',
  'brought',
  'bought',
  'built',
  'held',
  'kept',
  'left',
};
final _wordBefore = RegExp(r"([\p{L}’'\-]+)[\s,]*$", unicode: true);
final _anyWord = RegExp(r"[\p{L}][\p{L}’'\-]*", unicode: true);

/// The cast's entrances over [chapters] (in reading order) among [people].
Entrances entrancesIn(List<EntranceChapter> chapters, List<EyesPerson> people) {
  // The cast's names, found in one reading of each paragraph (`cast_names.dart`), not a search per name per character.
  final names = CastNames(people);
  final order = {for (final (i, p) in people.indexed) p.id: i};
  final entered = <String, Entrance>{};
  final talked = <String, EntrancePlace>{};
  final perChapter = List.filled(chapters.length, 0);
  final crowds = <Crowd>[];
  // The position of each entrance, for the reading order: chapter, block, offset.
  final where = <String, (int, int, int)>{};

  for (final (c, chapter) in chapters.indexed) {
    for (final (b, block) in chapter.blocks.indexed) {
      if (block.heading || block.text.trim().isEmpty) continue;
      final text = block.text;
      final quotes = [for (final q in _quoted.allMatches(text)) (q.start, q.end)];
      bool quoted(int at) => quotes.any((q) => at > q.$1 && at < q.$2);
      final here = <String>[];
      // The first time a name of each is in the narration of this paragraph, and the first time in its speech: the
      // names are found in the order they stand (at one place, the longest first), so the first of each is the one.
      final onPages = <String, ({int start, int end})>{};
      final spokens = <String, int>{};
      for (final h in names.all(text)) {
        if (entered.containsKey(h.id)) continue;
        if (quoted(h.start)) {
          spokens.putIfAbsent(h.id, () => h.start);
        } else {
          onPages.putIfAbsent(h.id, () => (start: h.start, end: h.end));
        }
      }
      for (final id in ({...onPages.keys, ...spokens.keys}.toList()..sort((a, b) => order[a]! - order[b]!))) {
        final onPage = onPages[id];
        final spoken = spokens[id];
        if (spoken != null && !talked.containsKey(id) && (onPage == null || spoken < onPage.start)) {
          talked[id] = (chapter: c + 1, nodeId: chapter.id, block: b, sentence: _sentenceAt(text, spoken));
        }
        if (onPage == null) continue;
        final at = (chapter: c + 1, nodeId: chapter.id, block: b, sentence: _sentenceAt(text, onPage.start));
        entered[id] = (id: id, at: at, gives: _gives(text, onPage, quotes), talkedOf: talked[id], onStage: true);
        where[id] = (c, b, onPage.start);
        here.add(id);
      }
      perChapter[c] += here.length;
      if (here.length >= crowdedParagraph) {
        here.sort((a, b) => where[a]!.$3 - where[b]!.$3);
        crowds.add((chapter: c + 1, nodeId: chapter.id, block: b, ids: here));
      }
    }
  }

  // Those only ever spoken of: their entrance is where they were first talked of, and they are not on the page.
  for (final p in people) {
    if (entered.containsKey(p.id)) continue;
    final t = talked[p.id];
    if (t == null) continue;
    entered[p.id] = (id: p.id, at: t, gives: const {}, talkedOf: t, onStage: false);
    where[p.id] = (t.chapter - 1, t.block, 0);
  }

  int byPlace(Entrance a, Entrance b) {
    final x = where[a.id]!, y = where[b.id]!;
    if (x.$1 != y.$1) return x.$1 - y.$1;
    if (x.$2 != y.$2) return x.$2 - y.$2;
    return x.$3 - y.$3;
  }

  return (
    order: entered.values.toList()..sort(byPlace),
    unseen: [
      for (final p in people)
        if (!entered.containsKey(p.id)) p.id,
    ],
    perChapter: perChapter,
    crowds: crowds,
  );
}

/// What a character's first moment on the page gives: read from the sentence they enter in and the one after it, and
/// the paragraph's speech.
Set<Gives> _gives(String text, ({int start, int end}) name, List<(int, int)> quotes) {
  final gives = <Gives>{};
  // The sentence they enter in and the next.
  final sentences = _sentence.allMatches(text).toList();
  final i = sentences.indexWhere((s) => s.end > name.start);
  final from = i < 0 ? 0 : sentences[i].start;
  final to = i < 0 ? text.length : (i + 1 < sentences.length ? sentences[i + 1].end : sentences[i].end);
  // Their own name is not a description of them ("the Grey Abbot").
  final unnamed = text.replaceRange(name.start, name.end, ' ' * (name.end - name.start));
  final near = unnamed.substring(from, to).replaceAll(_quoted, ' ');
  final words = {for (final m in _anyWord.allMatches(near)) m[0]!.toLowerCase()};
  if (words.any(_looks.contains)) gives.add(Gives.seen);

  final after = _wordAfter.firstMatch(text.substring(name.end));
  final next = after?[2]?.toLowerCase() ?? '';
  final before = _wordBefore.firstMatch(text.substring(0, name.start))?[1]?.toLowerCase() ?? '';
  // Speaking: a quotation in the paragraph, with a word of speech beside the name or the name beside the quotation.
  final quotedNear = quotes.any((q) => (name.start - q.$2).abs() <= 3 || (q.$1 - name.end).abs() <= 12);
  if (quotes.isNotEmpty && (_speaking.contains(next) || _speaking.contains(before) || quotedNear)) {
    gives.add(Gives.speaks);
  }
  if (perceiving.contains(next) && !_helpers.contains(next)) gives.add(Gives.thinks);
  if (next.isNotEmpty &&
      !_notDoing.contains(next) &&
      !perceiving.contains(next) &&
      !_speaking.contains(next) &&
      (_doing.contains(next) || (next.endsWith('ed') && next.length > 3))) {
    gives.add(Gives.acts);
  }
  // "Tobiah was mending a net", "Jory had fallen": doing, a word later.
  final then = after?[3]?.toLowerCase() ?? '';
  if ((({'was', 'were'}.contains(next) && then.endsWith('ing') && then.length > 4 && !_notActing.contains(then)) ||
      (next == 'had' &&
          (_doing.contains(then) || _participles.contains(then) || (then.endsWith('ed') && then.length > 3))))) {
    gives.add(Gives.acts);
  }
  return gives;
}

String _sentenceAt(String text, int at) {
  for (final m in _sentence.allMatches(text)) {
    if (m.end > at) return m[0]!.trim();
  }
  return text.trim();
}

/// [entrancesIn] over the chapters as stored (JSON text, as `NovelStore.rawJsonIn` reads them): [order] is the
/// chapters' ids in reading order. A job for an isolate.
Entrances Function() entrancesJob(List<String> storedContents, List<String> order, List<EyesPerson> people) => () {
  final wanted = order.toSet();
  final pages = <String, List<({bool heading, String text})>>{};
  for (final json in storedContents) {
    try {
      final row = jsonDecode(json);
      if (row is! Map || !wanted.contains(row['id'])) continue;
      pages['${row['id']}'] = docBlocks(row['doc']);
    } on FormatException {
      continue;
    }
  }
  return entrancesIn([for (final id in order) (id: id, blocks: pages[id] ?? const [])], people);
};
