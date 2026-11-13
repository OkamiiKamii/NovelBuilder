import 'dart:convert';

import '../codex/in_chapter.dart';
import 'prose.dart';

/// THE STORYBOARD: the book as its writer revises it, a reverse outline read from the text itself. For each chapter and
/// scene, how it opens (its first sentence), how it ends (its last), and who and what is on its pages, most present
/// first. Editors ask for exactly this in revision: does each chapter open on something, and end on something?
///
/// Reads only. Nothing is guessed: the lines are the author's own, whole or cut at a word.

/// One chapter's (or scene's) card: its first sentence and its last (empty when it has only one), and the entries on
/// its pages, most mentioned first.
typedef StoryCard = ({String opening, String closing, List<String> present});

/// The longest a line on the card runs before it is cut, at a word, with an ellipsis.
const storyLineChars = 150;

/// How many of those present a card shows.
const storyPresentShown = 5;

final _sentenceEnd = RegExp(r'[.!?…]+["”’»)\]]*(?=\s|$)');

/// The sentences of [paragraph], each trimmed.
List<String> _sentences(String paragraph) {
  final out = <String>[];
  var from = 0;
  for (final m in _sentenceEnd.allMatches(paragraph)) {
    final s = paragraph.substring(from, m.end).trim();
    if (s.isNotEmpty) out.add(s);
    from = m.end;
  }
  final rest = paragraph.substring(from).trim();
  if (rest.isNotEmpty) out.add(rest);
  return out;
}

String _cutEnd(String s) {
  if (s.length <= storyLineChars) return s;
  final cut = s.lastIndexOf(' ', storyLineChars - 1);
  return '${s.substring(0, cut < 40 ? storyLineChars - 1 : cut)}…';
}

String _cutStart(String s) {
  if (s.length <= storyLineChars) return s;
  final cut = s.indexOf(' ', s.length - storyLineChars + 1);
  return '…${s.substring(cut < 0 || cut > s.length - 40 ? s.length - storyLineChars + 1 : cut + 1)}';
}

/// The card for one chapter's [blocks] (its paragraphs and headings, in order); [names] say who and what to look for
/// (`named_in.dart`'s names to find).
StoryCard storyCardOf(List<({bool heading, String text})> blocks, Map<String, List<String>> names) {
  final paragraphs = [
    for (final b in blocks)
      if (!b.heading && b.text.trim().isNotEmpty) b.text.trim(),
  ];
  if (paragraphs.isEmpty) return (opening: '', closing: '', present: const []);
  final first = _sentences(paragraphs.first);
  final last = _sentences(paragraphs.last);
  final opening = first.isEmpty ? '' : first.first;
  final closingRaw = last.isEmpty ? '' : last.last;
  final only = paragraphs.length == 1 && first.length <= 1;
  return (
    opening: _cutEnd(opening),
    closing: only || closingRaw == opening ? '' : _cutStart(closingRaw),
    present: [for (final p in presentIn(paragraphs, names).take(storyPresentShown)) p.id],
  );
}

/// The cards for every chapter and scene stored (each record as JSON text, as `NovelStore.rawJsonIn` reads them), by
/// id, as a job for an isolate: decoded and read away from the screen. Only plain data in and out.
Map<String, StoryCard> Function() storyboardJob(List<String> storedContents, Map<String, List<String>> names) => () {
  final out = <String, StoryCard>{};
  for (final json in storedContents) {
    try {
      final row = jsonDecode(json);
      if (row is! Map) continue;
      out['${row['id']}'] = storyCardOf(docBlocks(row['doc']), names);
    } on FormatException {
      continue;
    }
  }
  return out;
};
