/// ARCS: each character's line through the book, read from the words of feeling in the sentences that name them:
/// bright (hope, laughed, safe, proud) above the line, dark (fear, wept, alone, ashamed) below, a negation turning a
/// word over ("not afraid"). A point a chapter they are named in; the shape of the whole named in plain words, with
/// the classic name for it where there is one (the falling and rising again of "a man in a hole"). Nothing is guessed:
/// a chapter with no word of feeling about them has no reading, and one named too little has no line.
///
/// Reads only.
library;

import 'dart:convert';
import 'dart:math' as math;

import '../manuscript/prose.dart';
import 'pov.dart' show EyesPerson;

/// The shape of a line through the book.
enum ArcShape {
  rises('Rises', 'rags to riches'),
  falls('Falls', 'a tragedy'),
  fallsThenRises('Falls, then rises', 'a man in a hole'),
  risesThenFalls('Rises, then falls', 'an Icarus'),
  wavers('Rises and falls, ending where it began', ''),
  flat('Flat: it barely moves', '');

  const ArcShape(this.label, this.classic);

  /// The shape, said plainly.
  final String label;

  /// Its classic name, if it has one.
  final String classic;
}

/// A sentence that carries feeling about a character: the sentence, its paragraph (as the editor counts blocks), and
/// its weight (bright above nought, dark below).
typedef FeelingLine = ({String sentence, int block, int score});

/// A chapter a character is named in: the chapter (1 first), its id, how often they are named, the feeling read from
/// the words around them (from -1, dark, to 1, bright; null when there are none), and the strongest lines.
typedef ArcPoint = ({int chapter, String nodeId, int mentions, double? feeling, List<FeelingLine> lines});

/// One character's line: their chapters, how often named in all, its shape (null when too few readings to say), and
/// its highest and lowest chapters.
typedef CharacterArc = ({
  String id,
  List<ArcPoint> points,
  int mentions,
  ArcShape? shape,
  ArcPoint? high,
  ArcPoint? low,
});

/// The arcs of a book: how many chapters it has, the lines (the most named first), and those named too little to
/// draw.
typedef FeelingArcs = ({int chapters, List<CharacterArc> arcs, List<String> thin});

/// A chapter for the reading: its id and its blocks in order, headings marked.
typedef ArcChapter = ({String id, List<({bool heading, String text})> blocks});

const _bright = {
  'happy',
  'happier',
  'happily',
  'glad',
  'joy',
  'joyful',
  'laughed',
  'laugh',
  'laughing',
  'laughter',
  'smiled',
  'smile',
  'smiling',
  'grinned',
  'grin',
  'hope',
  'hoped',
  'hopeful',
  'love',
  'loved',
  'loving',
  'warm',
  'warmth',
  'safe',
  'safely',
  'relief',
  'relieved',
  'calm',
  'peace',
  'peaceful',
  'proud',
  'pride',
  'delight',
  'delighted',
  'kind',
  'kindly',
  'gentle',
  'gently',
  'grateful',
  'thankful',
  'triumph',
  'triumphant',
  'won',
  'victory',
  'free',
  'freedom',
  'eager',
  'excited',
  'cheer',
  'cheerful',
  'content',
  'comfort',
  'comforted',
  'trust',
  'trusted',
  'brave',
  'courage',
  'confident',
  'tender',
  'tenderly',
  'sweet',
  'beautiful',
  'wonder',
  'wonderful',
  'fond',
  'embraced',
  'hugged',
  'kissed',
  'alive',
  'healed',
  'rescued',
  'saved',
  'together',
  'sang',
  'danced',
  'amused',
  'admired',
  'blessed',
  'lucky',
  'glowed',
  'bliss',
  'hopes',
  'joked',
  'thrilled',
  'elated',
  'soothed',
  'reassured',
  'forgave',
  'forgiven',
  'belonged',
  'welcome',
  'welcomed',
  'beloved',
  'playful',
  'radiant',
  'serene',
  'easy',
};

const _dark = {
  'sad',
  'sadly',
  'sadness',
  'sorrow',
  'grief',
  'grieved',
  'grieving',
  'wept',
  'weep',
  'weeping',
  'tears',
  'afraid',
  'fear',
  'feared',
  'fearful',
  'terror',
  'terrified',
  'scared',
  'frightened',
  'dread',
  'dreaded',
  'panic',
  'panicked',
  'anxious',
  'worry',
  'worried',
  'angry',
  'anger',
  'rage',
  'furious',
  'fury',
  'hate',
  'hated',
  'hatred',
  'bitter',
  'bitterly',
  'alone',
  'lonely',
  'loneliness',
  'lost',
  'loss',
  'hurt',
  'pain',
  'painful',
  'wounded',
  'bleeding',
  'dead',
  'death',
  'died',
  'dying',
  'killed',
  'despair',
  'hopeless',
  'shame',
  'ashamed',
  'guilt',
  'guilty',
  'regret',
  'regretted',
  'miserable',
  'misery',
  'cruel',
  'betrayed',
  'betrayal',
  'trapped',
  'failed',
  'failure',
  'defeat',
  'defeated',
  'weak',
  'sick',
  'exhausted',
  'numb',
  'ached',
  'aching',
  'screamed',
  'trembled',
  'trembling',
  'grim',
  'desperate',
  'desperately',
  'horror',
  'horrified',
  'cursed',
  'ruined',
  'suffered',
  'suffering',
  'jealous',
  'resented',
  'disgust',
  'disgusted',
  'nervous',
  'mourned',
  'mourning',
  'frowned',
  'scowled',
  'flinched',
  'winced',
  'sobbed',
  'sobbing',
  'shivered',
  'heartbroken',
  'humiliated',
  'helpless',
  'abandoned',
  'wretched',
  'furiously',
  'snarled',
  'hopelessly',
  'agony',
  'anguish',
  'dreadful',
  'gloom',
  'tormented',
};

const _turning = {'not', 'never', 'no', 'nor', 'without', 'hardly', 'barely'};

final _sentence = RegExp(r'[^.!?…]+[.!?…]+["”’]*|[^.!?…]+$');
final _token = RegExp(r"[\p{L}][\p{L}’'\-]*", unicode: true);

/// How many chapters someone must be named in, with how many readings of feeling, to be drawn.
const arcChapters = 3;
const arcReadings = 2;

/// The arcs of [people] through [chapters] (in reading order).
FeelingArcs feelingArcs(List<ArcChapter> chapters, List<EyesPerson> people) {
  final finders = {
    for (final p in people)
      p.id: [
        for (final name in ({...p.names}.toList()..sort((a, b) => b.length - a.length)))
          if (name.trim().isNotEmpty) RegExp('(?<![\\p{L}])${RegExp.escape(name.trim())}(?![\\p{L}])', unicode: true),
      ],
  };
  final points = {for (final p in people) p.id: <ArcPoint>[]};

  for (final (c, chapter) in chapters.indexed) {
    final mentions = <String, int>{};
    final bright = <String, int>{};
    final dark = <String, int>{};
    final lines = <String, List<FeelingLine>>{};
    for (final (b, block) in chapter.blocks.indexed) {
      if (block.heading || block.text.trim().isEmpty) continue;
      for (final s in _sentence.allMatches(block.text)) {
        final sentence = s[0]!;
        final named = [
          for (final p in people)
            if (finders[p.id]!.any((f) => f.hasMatch(sentence))) p.id,
        ];
        if (named.isEmpty) continue;
        final (up, down) = _weigh(sentence);
        for (final id in named) {
          mentions[id] = (mentions[id] ?? 0) + 1;
          if (up + down == 0) continue;
          bright[id] = (bright[id] ?? 0) + up;
          dark[id] = (dark[id] ?? 0) + down;
          lines.putIfAbsent(id, () => []).add((sentence: sentence.trim(), block: b, score: up - down));
        }
      }
    }
    for (final MapEntry(key: id, value: n) in mentions.entries) {
      final up = bright[id] ?? 0, down = dark[id] ?? 0;
      final strongest = [...?lines[id]]..sort((a, b) => b.score.abs() - a.score.abs());
      points[id]!.add((
        chapter: c + 1,
        nodeId: chapter.id,
        mentions: n,
        // Damped, so one word is not the whole sky: a single "afraid" is -0.33, three of them -0.6.
        feeling: up + down == 0 ? null : (up - down) / (up + down + 2),
        lines: strongest.take(3).toList(),
      ));
    }
  }

  final arcs = <CharacterArc>[];
  final thin = <String>[];
  for (final p in people) {
    final mine = points[p.id]!;
    if (mine.isEmpty) continue;
    final readings = [
      for (final x in mine)
        if (x.feeling != null) x,
    ];
    if (mine.length < arcChapters || readings.length < arcReadings) {
      thin.add(p.id);
      continue;
    }
    ArcPoint? high, low;
    for (final r in readings) {
      if (high == null || r.feeling! > high.feeling!) high = r;
      if (low == null || r.feeling! < low.feeling!) low = r;
    }
    arcs.add((
      id: p.id,
      points: mine,
      mentions: mine.fold(0, (n, x) => n + x.mentions),
      shape: shapeOf([for (final r in readings) r.feeling!]),
      high: high,
      low: low,
    ));
  }
  arcs.sort((a, b) => b.mentions - a.mentions);
  return (chapters: chapters.length, arcs: arcs, thin: thin);
}

/// The bright and dark words of [sentence], a word turned over by a "not" or "never" just before it.
(int, int) _weigh(String sentence) {
  final words = [for (final m in _token.allMatches(sentence)) m[0]!.toLowerCase()];
  var up = 0, down = 0;
  for (final (i, w) in words.indexed) {
    final isBright = _bright.contains(w), isDark = _dark.contains(w);
    if (!isBright && !isDark) continue;
    final turned = [
      for (var j = math.max(0, i - 2); j < i; j++) words[j],
    ].any((t) => _turning.contains(t) || t.endsWith('n’t') || t.endsWith("n't"));
    if (isBright != turned) {
      up++;
    } else {
      down++;
    }
  }
  return (up, down);
}

/// The shape of a line of [feelings] (in the book's order), or null with fewer than four.
ArcShape? shapeOf(List<double> feelings) {
  if (feelings.length < 4) return null;
  // Smoothed over its neighbours, so one dark chapter in a bright book is not a fall; a short line is read as drawn,
  // since smoothing four points blurs the turn at its end.
  final smooth = feelings.length < 6
      ? feelings
      : [
          for (var i = 0; i < feelings.length; i++)
            [
                  for (var j = math.max(0, i - 1); j <= math.min(feelings.length - 1, i + 1); j++) feelings[j],
                ].reduce((a, b) => a + b) /
                (math.min(feelings.length - 1, i + 1) - math.max(0, i - 1) + 1),
        ];
  final n = smooth.length;
  final third = math.max(1, n ~/ 3);
  double mean(Iterable<double> xs) => xs.reduce((a, b) => a + b) / xs.length;
  final start = mean(smooth.take(third));
  final end = mean(smooth.skip(n - third));
  final top = smooth.reduce(math.max), bottom = smooth.reduce(math.min);
  const step = 0.2;
  if (top - bottom < step) return ArcShape.flat;
  final lowAt = smooth.indexOf(bottom), highAt = smooth.indexOf(top);
  bool middle(int i) => i >= n * 0.2 && i <= n * 0.8;
  if (middle(lowAt) && start - bottom >= step && end - bottom >= step) return ArcShape.fallsThenRises;
  if (middle(highAt) && top - start >= step && top - end >= step) return ArcShape.risesThenFalls;
  if (end - start >= step) return ArcShape.rises;
  if (start - end >= step) return ArcShape.falls;
  return ArcShape.wavers;
}

/// [feelingArcs] over the chapters as stored (JSON text, as `NovelStore.rawJsonIn` reads them): [order] is the
/// chapters' ids in reading order. A job for an isolate.
FeelingArcs Function() feelingArcsJob(List<String> storedContents, List<String> order, List<EyesPerson> people) => () {
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
  return feelingArcs([for (final id in order) (id: id, blocks: pages[id] ?? const [])], people);
};
