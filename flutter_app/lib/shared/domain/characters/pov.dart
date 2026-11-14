/// WHOSE EYES: the character each chapter is told through, read from the prose and never guessed at: the one the
/// narration (what is not said aloud) shows thinking, feeling and noticing ("Wren knew", "Ilse felt the cold", "Wren
/// saw the band of wet stone"), with the one it names most as the lesser sign. A chapter whose narration says "I" and
/// "me" is told in the first person. One where no one leads clearly is left unclear, not given to anyone.
///
/// And what it means for the book: how much of it each is seen through, the longest run through the same eyes, and
/// how long since each was last.
///
/// Reads only.
library;

import 'dart:convert';

import '../manuscript/prose.dart';

/// How a chapter is told: through someone, in the first person, or unclear.
enum Telling { through, firstPerson, unclear }

/// A chapter's point of view: the chapter (1 first), its id, its title and words; how it is told and through whom
/// (an id, for [Telling.through]); and a sentence that shows it.
typedef ChapterEyes = ({
  int chapter,
  String nodeId,
  String title,
  int words,
  Telling telling,
  String? who,
  String evidence,
});

/// A character for the reading: their id and the names they are found by.
typedef EyesPerson = ({String id, List<String> names});

/// The words of thinking, feeling and noticing that show whose eyes a sentence is behind.
const perceiving = {
  'thought',
  'felt',
  'knew',
  'wondered',
  'saw',
  'heard',
  'noticed',
  'remembered',
  'realised',
  'realized',
  'watched',
  'wanted',
  'hoped',
  'feared',
  'guessed',
  'imagined',
  'smelled',
  'smelt',
  'tasted',
  'sensed',
  'decided',
  'understood',
  'believed',
  'considered',
  'recalled',
  'suspected',
  'worried',
  'longed',
  'dreaded',
  'pictured',
  'could',
  'couldn’t',
  "couldn't",
  'did',
  'didn’t',
  "didn't",
  'had',
};

/// The verbs that only count after "could" / "did" / "had" (so "Wren could see" counts and "Wren could run" does not).
const _helped = {
  'see',
  'hear',
  'feel',
  'tell',
  'smell',
  'taste',
  'remember',
  'think',
  'imagine',
  'understand',
  'not',
  'seen',
  'heard',
  'known',
  'thought',
  'wondered',
  'noticed',
  'remembered',
  'felt',
  'never',
};

final _quoted = RegExp(r'“[^”]*”|"[^"]*"');
final _word = RegExp(r"[\p{L}][\p{L}’'\-]*", unicode: true);
final _sentence = RegExp(r'[^.!?…]+[.!?…]+["”’]*|[^.!?…]+$');
final _firstPerson = RegExp(r"\b(I|me|my|myself|I’m|I'm|I’d|I'd)\b");

/// The point of view of each of [chapters] (each its id, title and paragraphs, in reading order), among [people].
List<ChapterEyes> chapterEyes(
  List<({String id, String title, List<String> paragraphs})> chapters,
  List<EyesPerson> people,
) {
  final out = <ChapterEyes>[];
  for (final (c, chapter) in chapters.indexed) {
    final words = chapter.paragraphs.fold(0, (n, p) => n + _word.allMatches(p).length);
    if (words == 0) continue;
    // The narration: everything not said aloud.
    final narration = [for (final p in chapter.paragraphs) p.replaceAll(_quoted, ' ')];
    final narrated = narration.fold(0, (n, p) => n + _word.allMatches(p).length);
    final firstPerson = narration.fold(0, (n, p) => n + _firstPerson.allMatches(p).length);

    final scores = <String, double>{};
    final shows = <String, String>{};
    for (final person in people) {
      var perceives = 0;
      var named = 0;
      String? shown;
      for (final paragraph in narration) {
        for (final name in person.names) {
          final find = RegExp(
            '(?<![\\p{L}])${RegExp.escape(name)}(?![\\p{L}’\'])\\s+([\\p{L}’\']+)(?:\\s+([\\p{L}’\']+))?',
            unicode: true,
          );
          for (final m in find.allMatches(paragraph)) {
            named++;
            final verb = m[1]!.toLowerCase();
            final next = m[2]?.toLowerCase() ?? '';
            final helped = {'could', 'couldn’t', "couldn't", 'did', 'didn’t', "didn't", 'had'}.contains(verb);
            if (perceiving.contains(verb) && (!helped || _helped.contains(next) || perceiving.contains(next))) {
              perceives++;
              shown ??= _sentenceAt(paragraph, m.start);
            }
          }
        }
      }
      final score = perceives * 3 + named * 0.5;
      if (score > 0) scores[person.id] = score;
      if (shown != null) shows[person.id] = shown;
    }
    final ranked = scores.entries.toList()..sort((a, b) => b.value.compareTo(a.value));
    final top = ranked.firstOrNull;
    final second = ranked.length > 1 ? ranked[1].value : 0.0;

    Telling telling;
    String? who;
    var evidence = '';
    if (narrated > 0 && firstPerson / narrated >= 0.015) {
      telling = Telling.firstPerson;
      final m = narration.expand((p) => [for (final m in _firstPerson.allMatches(p)) (p, m.start)]).firstOrNull;
      if (m != null) evidence = _sentenceAt(m.$1, m.$2);
    } else if (top != null && top.value >= 3 && top.value >= second * 1.5 && shows.containsKey(top.key)) {
      telling = Telling.through;
      who = top.key;
      evidence = shows[top.key]!;
    } else {
      telling = Telling.unclear;
    }
    out.add((
      chapter: c + 1,
      nodeId: chapter.id,
      title: chapter.title,
      words: words,
      telling: telling,
      who: who,
      evidence: evidence,
    ));
  }
  return out;
}

String _sentenceAt(String text, int at) {
  for (final m in _sentence.allMatches(text)) {
    if (m.end > at) return m[0]!.trim();
  }
  return text.trim();
}

/// What the eyes mean for the book: each one's chapters and share of its words, the longest run through the same eyes,
/// and how many chapters since each was last seen through.
typedef EyesSummary = ({
  Map<String, ({int chapters, int words})> each,
  int words,
  ({String who, int from, int to})? longestRun,
  Map<String, int> since,
});

EyesSummary eyesSummary(List<ChapterEyes> eyes) {
  final each = <String, ({int chapters, int words})>{};
  final last = <String, int>{};
  ({String who, int from, int to})? longest;
  ({String who, int from, int to})? run;
  for (final (i, e) in eyes.indexed) {
    final who = e.who;
    if (who == null) {
      run = null;
      continue;
    }
    final had = each[who];
    each[who] = (chapters: (had?.chapters ?? 0) + 1, words: (had?.words ?? 0) + e.words);
    last[who] = i;
    run = run != null && run.who == who
        ? (who: who, from: run.from, to: e.chapter)
        : (who: who, from: e.chapter, to: e.chapter);
    if (longest == null || run.to - run.from > longest.to - longest.from) longest = run;
  }
  return (
    each: each,
    words: eyes.fold(0, (n, e) => n + e.words),
    longestRun: longest,
    since: {for (final MapEntry(key: who, value: i) in last.entries) who: eyes.length - 1 - i},
  );
}

/// [chapterEyes] over the chapters as stored (JSON text, as `NovelStore.rawJsonIn` reads them): [order] is the
/// chapters' ids in reading order, [titles] their titles. A job for an isolate.
List<ChapterEyes> Function() chapterEyesJob(
  List<String> storedContents,
  List<String> order,
  Map<String, String> titles,
  List<EyesPerson> people,
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
  return chapterEyes([
    for (final id in order) (id: id, title: titles[id] ?? '', paragraphs: pages[id] ?? const <String>[]),
  ], people);
};
