/// YOUR BOOK SO FAR: the novel told back to its writer as a short story in pages, the way a year in music is: how much
/// is written, the days it was written on, the biggest chapter, who the book is about and who talks most, the words
/// the writer leans on, where it begins and where it stands, and what comes next. Every page is read from the
/// book: nothing is guessed, and nothing is changed.
library;

import 'dart:convert';
import 'dart:math' as math;

import '../characters/voice.dart';
import '../codex/in_chapter.dart';
import '../manuscript/prose.dart';
import 'milestones.dart';
import 'progress.dart';

/// A chapter (or scene), in reading order: its id, title and words.
typedef StoryChapter = ({String id, String title, int words});

/// What the story is told from: the book's title and target, its chapters in order, its days of writing (each day's
/// net words), and its people (each character's id, name and every name they go by).
typedef StoryInputs = ({
  String title,
  int? target,
  List<StoryChapter> chapters,
  List<({String day, int words})> days,
  List<({String id, String name, List<String> names})> people,
});

/// The story's facts, page by page.
typedef BookStory = ({
  String title,
  int words,
  int pages,
  int minutes,
  int chapters,
  int daysWritten,
  int longestRun,
  ({String day, int words})? bestDay,
  String? firstDay,
  StoryChapter? biggest,
  ({String id, String name, int mentions})? lead,
  ({String id, String name, int lines, String line})? talker,
  List<({String word, int count})> leanWords,
  String opening,
  String latest,
  ({String name, int words})? next,
});

/// Words that say nothing of a writer: the glue of English, and the stock of every story.
const _plain = {
  'about', 'after', 'again', 'against', 'almost', 'along', 'already', 'always', 'another', 'around', 'asked', //
  'away', 'back', 'because', 'been', 'before', 'began', 'behind', 'being', 'below', 'between', 'both', 'could', //
  'didn', 'doing', 'down', 'each', 'even', 'ever', 'every', 'everything', 'first', 'from', 'going', 'have', //
  'having', 'here', 'herself', 'himself', 'into', 'just', 'knew', 'know', 'like', 'little', 'looked', 'made', //
  'make', 'might', 'more', 'most', 'much', 'must', 'never', 'nothing', 'once', 'only', 'other', 'over', 'said', //
  'same', 'should', 'since', 'some', 'something', 'still', 'such', 'than', 'that', 'their', 'them', 'then', //
  'there', 'these', 'they', 'thing', 'think', 'this', 'those', 'though', 'thought', 'through', 'time', 'told', //
  'took', 'toward', 'towards', 'under', 'until', 'very', 'want', 'wanted', 'well', 'went', 'were', 'what', //
  'when', 'where', 'which', 'while', 'who', 'whom', 'whose', 'will', 'with', 'without', 'would', 'your', 'yours', //
  'came', 'come', 'does', 'done', 'felt', 'find', 'found', 'gave', 'give', 'good', 'great', 'head', 'hand', //
  'hands', 'face', 'eyes', 'look', 'long', 'last', 'left', 'right', 'turned', 'upon', 'also', 'stood', 'years', //
  'it’s', "it's", 'didn’t', "didn't", 'don’t', "don't", 'couldn’t', "couldn't", 'wasn’t', "wasn't", 'i’m', "i'm",
};

final _word = RegExp(r"[\p{L}][\p{L}'’]*", unicode: true);

/// Tells the story of the book from [inputs] and [pages] (each chapter's paragraphs, by id).
BookStory bookStory(StoryInputs inputs, Map<String, List<String>> pages) {
  final words = inputs.chapters.fold(0, (n, c) => n + c.words);
  // Days written: those with net words added, in order.
  final written = [
    for (final d in inputs.days)
      if (d.words > 0) d,
  ]..sort((a, b) => a.day.compareTo(b.day));
  var longest = 0;
  var run = 0;
  String? previous;
  for (final d in written) {
    run = previous != null && addDays(previous, 1) == d.day ? run + 1 : 1;
    longest = math.max(longest, run);
    previous = d.day;
  }
  final best = written.isEmpty ? null : written.reduce((a, b) => b.words > a.words ? b : a);
  final biggest = inputs.chapters.where((c) => c.words > 0).isEmpty
      ? null
      : inputs.chapters.reduce((a, b) => b.words > a.words ? b : a);

  // Paragraphs in reading order.
  final order = [for (final c in inputs.chapters) c.id];
  final paragraphs = [for (final id in order) ...?pages[id]].where((p) => p.trim().isNotEmpty).toList();

  // Who the book is about: named most.
  final names = {for (final p in inputs.people) p.id: p.names};
  final present = presentIn(paragraphs, names);
  final leadId = present.isEmpty ? null : present.first.id;
  final lead = leadId == null
      ? null
      : (id: leadId, name: inputs.people.firstWhere((p) => p.id == leadId).name, mentions: present.first.mentions);

  // Who talks most, and a line of theirs (one of a few words or more).
  ({String id, String name, int lines, String line})? talker;
  for (final p in inputs.people) {
    final lines = spokenBy(pages, order, p.names, limit: 400);
    if (lines.isEmpty) continue;
    if (talker == null || lines.length > talker.lines) {
      final good = lines.where((l) => l.words.split(' ').length >= 4).firstOrNull ?? lines.first;
      talker = (id: p.id, name: p.name, lines: lines.length, line: good.words);
    }
  }

  // The words leaned on: the longer words used most, not names, not the glue.
  final nameWords = {
    for (final p in inputs.people)
      for (final n in p.names)
        for (final w in n.split(RegExp(r'\s+'))) w.toLowerCase(),
  };
  final counts = <String, int>{};
  for (final p in paragraphs) {
    for (final m in _word.allMatches(p)) {
      final w = m[0]!.toLowerCase();
      if (w.length < 5 || _plain.contains(w) || nameWords.contains(w)) continue;
      counts[w] = (counts[w] ?? 0) + 1;
    }
  }
  final lean = [
    for (final MapEntry(key: w, value: n) in counts.entries)
      if (n >= 3) (word: w, count: n),
  ]..sort((a, b) => b.count != a.count ? b.count - a.count : a.word.compareTo(b.word));

  final sentences = RegExp(r'[^.!?…]+[.!?…]+["”’]*|[^.!?…]+$');
  String firstSentence(String p) => sentences.firstMatch(p)?[0]?.trim() ?? p.trim();
  String lastSentence(String p) {
    final all = sentences.allMatches(p).toList();
    return all.isEmpty ? p.trim() : all.last[0]!.trim();
  }

  final next = milestonesFor(inputs.target).where((m) => m.words > words).firstOrNull;
  return (
    title: inputs.title,
    words: words,
    pages: (words / 250).ceil(),
    minutes: math.max(1, (words / 230).round()),
    chapters: inputs.chapters.length,
    daysWritten: written.length,
    longestRun: longest,
    bestDay: best,
    firstDay: written.isEmpty ? null : written.first.day,
    biggest: biggest,
    lead: lead,
    talker: talker,
    leanWords: lean.take(6).toList(),
    opening: paragraphs.isEmpty ? '' : firstSentence(paragraphs.first),
    latest: paragraphs.isEmpty ? '' : lastSentence(paragraphs.last),
    next: next == null ? null : (name: next.name, words: next.words - words),
  );
}

/// [bookStory] over the chapters as stored (JSON text, as `NovelStore.rawJsonIn` reads them), as a job for an isolate.
BookStory Function() bookStoryJob(StoryInputs inputs, List<String> storedContents) => () {
  final wanted = {for (final c in inputs.chapters) c.id};
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
  return bookStory(inputs, pages);
};
