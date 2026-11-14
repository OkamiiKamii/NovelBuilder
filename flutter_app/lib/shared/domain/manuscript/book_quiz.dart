/// THE BOOK QUIZ: how well do you know your own book? Questions made from its pages, never written for it:
///
/// - **Who said it?** A line someone says (`characters/voice.dart` ties it to them), and the cast to choose from.
/// - **Which chapter?** A line worth quoting (`best_lines.dart` scores them), and four chapters.
/// - **The missing word.** A line with its longest word taken out, and four words of the book's own.
/// - **Which comes first?** Two lines from far apart; which the book reaches first.
///
/// The kinds take turns, each line asked once, ten at most; a seed picks them, so every game is new. A book with one
/// chapter and one character still has the last two. Played by the author, or handed to a reader. Reads only.
library;

import 'dart:convert';
import 'dart:math';

import '../characters/voice.dart';
import 'best_lines.dart';
import 'prose.dart';

/// The kinds of question.
enum QuizKind {
  whoSaid('WHO SAID IT?'),
  whichChapter('WHICH CHAPTER?'),
  missingWord('THE MISSING WORD'),
  whichFirst('WHICH COMES FIRST?');

  const QuizKind(this.kicker);

  /// What the card says it asks, in capitals.
  final String kicker;
}

/// A question: its kind, the line shown (with a gap in it for the missing word; empty for which comes first), the
/// choices and which is right, where the line is (a chapter's id and paragraph), and what is said when it is answered
/// ("Chapter 4 · The Bell").
typedef QuizQuestion = ({
  QuizKind kind,
  String line,
  List<String> options,
  int answer,
  String nodeId,
  int block,
  String where,
});

/// A chapter for the quiz: its id, its title, its paragraphs (every block, a heading as `null`, so a paragraph's
/// place is its place in the chapter).
typedef QuizChapter = ({String id, String title, List<String?> paragraphs});

/// A character for the quiz: the name they are known by, and the lines they say.
typedef QuizSpeaker = ({String name, List<Spoken> lines});

/// The most questions in a game.
const quizLength = 10;

/// The fewest questions a game is played with.
const quizAtLeast = 3;

/// The gap left by the missing word.
const quizGap = '_____';

final _sentence = RegExp(r'[^.!?…]+[.!?…]+["”’]*|[^.!?…]+$');
final _word = RegExp(r"[\p{L}][\p{L}’'\-]*", unicode: true);

const _plain = {
  'about',
  'after',
  'again',
  'against',
  'almost',
  'along',
  'already',
  'although',
  'always',
  'another',
  'anything',
  'around',
  'because',
  'before',
  'behind',
  'being',
  'below',
  'between',
  'could',
  'didn’t',
  "didn't",
  'doesn’t',
  "doesn't",
  'during',
  'either',
  'enough',
  'every',
  'everything',
  'nothing',
  'other',
  'others',
  'should',
  'something',
  'still',
  'their',
  'there',
  'these',
  'thing',
  'things',
  'those',
  'though',
  'through',
  'under',
  'until',
  'where',
  'which',
  'while',
  'would',
  'wouldn’t',
  "wouldn't",
  'yourself',
  'himself',
  'herself',
  'itself',
  'themselves',
  'without',
  'within',
  'someone',
  'anyone',
  'everyone',
  'really',
  'little',
  'maybe',
  'perhaps',
};

/// The chapter a line is in, said for the answer.
String chapterLabel(int index, String title) =>
    title.trim().isEmpty ? 'Chapter ${index + 1}' : 'Chapter ${index + 1} · ${title.trim()}';

/// A game of questions about the book of [chapters] (in reading order) and [speakers] (by id), chosen by [seed].
List<QuizQuestion> bookQuiz(List<QuizChapter> chapters, Map<String, QuizSpeaker> speakers, {required int seed}) {
  final random = Random(seed);
  // Every sentence worth asking about, where it is and in what order.
  final lines = <({String text, int chapter, int block, int at})>[];
  for (final (c, chapter) in chapters.indexed) {
    for (final (b, text) in chapter.paragraphs.indexed) {
      if (text == null) continue;
      for (final m in _sentence.allMatches(text)) {
        final s = m[0]!.trim();
        final n = _word.allMatches(s).length;
        if (n < 6 || n > 26) continue;
        if ('“'.allMatches(s).length != '”'.allMatches(s).length || '"'.allMatches(s).length.isOdd) continue;
        if (lineScore(s) <= 0) continue;
        lines.add((text: s, chapter: c, block: b, at: lines.length));
      }
    }
  }
  final used = <String>{};
  String where(int c) => chapterLabel(c, chapters[c].title);

  // Who said it: a line of a speaker's, among the others with names.
  final names = {for (final s in speakers.values) s.name};
  final said = [
    for (final MapEntry(value: s) in speakers.entries)
      for (final l in s.lines)
        if (_word.allMatches(l.words).length >= 4 && _word.allMatches(l.words).length <= 22) (speaker: s.name, line: l),
  ]..shuffle(random);
  final index = {for (final (i, c) in chapters.indexed) c.id: i};
  QuizQuestion? whoSaid() {
    if (names.length < 2) return null;
    for (final s in said) {
      final words = s.line.words.toLowerCase();
      // Not a line already asked, nor one inside a sentence already asked.
      if (used.any((u) => u.contains(words)) || !used.add(words)) continue;
      final others = (names.toList()..remove(s.speaker))..shuffle(random);
      final options = [s.speaker, ...others.take(3)]..shuffle(random);
      final c = index[s.line.nodeId] ?? 0;
      return (
        kind: QuizKind.whoSaid,
        line: '“${s.line.words.trim()}”',
        options: options,
        answer: options.indexOf(s.speaker),
        nodeId: s.line.nodeId,
        block: s.line.block,
        where: '${s.speaker}, in ${where(c).replaceFirst('Chapter', 'chapter')}',
      );
    }
    return null;
  }

  final shuffled = [...lines]..shuffle(random);
  ({String text, int chapter, int block, int at})? fresh() {
    for (final l in shuffled) {
      if (!_taken(used, l.text) && used.add(l.text.toLowerCase())) return l;
    }
    return null;
  }

  // Which chapter: a line, among its chapter and three others.
  final withLines = {for (final l in lines) l.chapter};
  QuizQuestion? whichChapter() {
    if (withLines.length < 2) return null;
    final l = fresh();
    if (l == null) return null;
    final others = ([for (var i = 0; i < chapters.length; i++) i]..remove(l.chapter))..shuffle(random);
    final picked = [l.chapter, ...others.take(3)]..sort();
    final options = [for (final c in picked) where(c)];
    return (
      kind: QuizKind.whichChapter,
      line: l.text,
      options: options,
      answer: picked.indexOf(l.chapter),
      nodeId: chapters[l.chapter].id,
      block: l.block,
      where: where(l.chapter),
    );
  }

  // The missing word: its longest word out, among three of the book's own of about its length.
  final pool = <String>{
    for (final l in lines)
      for (final m in _word.allMatches(l.text))
        if (_content(m[0]!)) m[0]!.toLowerCase(),
  };
  QuizQuestion? missingWord() {
    for (var tries = 0; tries < 6; tries++) {
      final l = fresh();
      if (l == null) return null;
      final words = [
        for (final m in _word.allMatches(l.text))
          if (_content(m[0]!)) m,
      ];
      if (words.isEmpty) continue;
      final gone = words.reduce((a, b) => b[0]!.length > a[0]!.length ? b : a);
      final word = gone[0]!.toLowerCase();
      final like = [
        for (final w in pool)
          if (w != word && (w.length - word.length).abs() <= 2 && !l.text.toLowerCase().contains(w)) w,
      ]..shuffle(random);
      if (like.length < 3) continue;
      final options = [word, ...like.take(3)]..shuffle(random);
      return (
        kind: QuizKind.missingWord,
        line: l.text.replaceRange(gone.start, gone.end, quizGap),
        options: options,
        answer: options.indexOf(word),
        nodeId: chapters[l.chapter].id,
        block: l.block,
        where: '“$word”, ${where(l.chapter).replaceFirst('Chapter', 'chapter')}',
      );
    }
    return null;
  }

  // Which comes first: two lines a fair way apart.
  QuizQuestion? whichFirst() {
    if (lines.length < 6) return null;
    final a = fresh();
    if (a == null) return null;
    final gap = max(3, lines.length ~/ 4);
    final far = [
      for (final l in shuffled)
        if ((l.at - a.at).abs() >= gap && !_taken(used, l.text)) l,
    ];
    if (far.isEmpty) return null;
    final b = far.first;
    used.add(b.text.toLowerCase());
    final pair = [a, b]..shuffle(random);
    final first = pair[0].at < pair[1].at ? 0 : 1;
    final early = pair[first];
    return (
      kind: QuizKind.whichFirst,
      line: '',
      options: [for (final l in pair) l.text],
      answer: first,
      nodeId: chapters[early.chapter].id,
      block: early.block,
      where: early.chapter == pair[1 - first].chapter
          ? 'Both in ${where(early.chapter).replaceFirst('Chapter', 'chapter')}; this one first'
          : 'This one is in ${where(early.chapter).replaceFirst('Chapter', 'chapter')}',
    );
  }

  final makers = [whoSaid, missingWord, whichChapter, whichFirst];
  final out = <QuizQuestion>[];
  final spent = <int>{};
  for (var turn = 0; out.length < quizLength && spent.length < makers.length; turn++) {
    final k = turn % makers.length;
    if (spent.contains(k)) continue;
    final q = makers[k]();
    if (q == null) {
      spent.add(k);
    } else {
      out.add(q);
    }
  }
  return out.length < quizAtLeast ? const [] : out;
}

bool _content(String w) => w.length >= 5 && w[0] == w[0].toLowerCase() && !_plain.contains(w.toLowerCase());

/// What a score says: [right] of [of].
String quizVerdict(int right, int of) {
  final share = of == 0 ? 0 : right / of;
  if (share >= 0.9) return 'Every word of it. You know this book by heart.';
  if (share >= 0.7) return 'You know it well. A few lines slipped by.';
  if (share >= 0.4) return 'Some of it has gone quiet. A reread would bring it back.';
  return 'Time to read it again, the way a reader would.';
}

/// [bookQuiz] over the chapters as stored (JSON text, as `NovelStore.rawJsonIn` reads them): [order] is the chapters'
/// ids in reading order, [titles] their titles, [people] each character's names to find (the first the one they are
/// known by). A job for an isolate.
List<QuizQuestion> Function() bookQuizJob(
  List<String> storedContents,
  List<String> order,
  Map<String, String> titles,
  Map<String, List<String>> people, {
  required int seed,
}) => () {
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
  final pages = {
    for (final id in order) id: [for (final b in blocks[id] ?? const <({bool heading, String text})>[]) b.text],
  };
  final speakers = <String, QuizSpeaker>{
    for (final MapEntry(key: id, value: names) in people.entries)
      if (names.isNotEmpty) id: (name: names.first, lines: spokenBy(pages, order, names, limit: 60)),
  };
  return bookQuiz(
    [
      for (final id in order)
        (
          id: id,
          title: titles[id] ?? '',
          paragraphs: [
            for (final b in blocks[id] ?? const <({bool heading, String text})>[]) b.heading ? null : b.text,
          ],
        ),
    ],
    speakers,
    seed: seed,
  );
};

/// Whether [text] has been asked already, or holds a line someone says that has.
bool _taken(Set<String> used, String text) {
  final t = text.toLowerCase();
  return used.contains(t) || used.any(t.contains);
}
