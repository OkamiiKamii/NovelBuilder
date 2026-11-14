/// THE SAMPLER: a book's opening as a reader's sample, the thing a writer sends to a beta reader, a writing group or
/// an agent: a title page (the title, who wrote it, the best line set apart, the blurb), the first chapters until a
/// reader has enough to judge (as many as reach [samplerWords], three at most, at least one), and a last page that
/// says how much more there is. Made as the same format-neutral document every export is (`compile.dart`), so it is
/// rendered by the PDF writer as it is.
///
/// Reads only.
library;

import 'dart:convert';

import '../manuscript/best_lines.dart';
import '../manuscript/prose.dart';
import 'compile.dart';

/// The words a sample runs to: chapters are added until it reaches this.
const samplerWords = 1500;

/// The most chapters a sample holds.
const samplerChapters = 3;

/// A chapter for the sample: its title and its paragraphs.
typedef SampleChapter = ({String title, List<String> paragraphs});

int _words(String text) => RegExp(r"[\p{L}\p{N}][\p{L}\p{N}’'\-]*", unicode: true).allMatches(text).length;

/// The opening chapters of [chapters] a sample holds.
List<SampleChapter> sampleChapters(List<SampleChapter> chapters) {
  final out = <SampleChapter>[];
  var words = 0;
  for (final c in chapters) {
    final n = c.paragraphs.fold(0, (s, p) => s + _words(p));
    if (n == 0) continue;
    out.add(c);
    words += n;
    if (words >= samplerWords || out.length == samplerChapters) break;
  }
  return out;
}

/// The sample of a book called [title] by [author], its [quote] and [blurb] on the title page, from [chapters] (in
/// reading order); [allChapters] and [allWords] are the whole book's, for the last page.
Compiled samplerOf({
  required String title,
  required String author,
  required String quote,
  required String blurb,
  required List<SampleChapter> chapters,
  required int allChapters,
  required int allWords,
}) {
  final name = title.trim().isEmpty ? 'Untitled' : title.trim();
  final opening = sampleChapters(chapters);
  final words = opening.fold(0, (s, c) => s + c.paragraphs.fold(0, (t, p) => t + _words(p)));
  final more = allChapters - opening.length;
  final blocks = <Block>[
    HeadingBlock(HeadingRole.title, 1, name),
    if (author.trim().isNotEmpty) HeadingBlock(HeadingRole.subtitle, 2, 'by ${author.trim()}'),
    if (quote.trim().isNotEmpty) ...[
      const DividerBlock(),
      ParagraphBlock([Run(quote.trim(), italic: true)], align: Align.center),
    ],
    if (blurb.trim().isNotEmpty) ...[
      const DividerBlock(),
      ParagraphBlock([Run(blurb.trim())], align: Align.center),
    ],
    const ParagraphBlock([Run('A reader’s sample', italic: true)], align: Align.center),
    for (final (i, c) in opening.indexed) ...[
      HeadingBlock(
        HeadingRole.chapter,
        1,
        c.title.trim().isEmpty ? 'Chapter ${i + 1}' : c.title.trim(),
        pageBreak: true,
      ),
      for (final p in c.paragraphs)
        if (p.trim().isNotEmpty) ParagraphBlock([Run(p.trim())]),
    ],
    const DividerBlock(),
    ParagraphBlock([
      Run(
        more > 0
            ? 'End of the sample. $name runs to $allChapters chapters and ${_thousands(allWords)} words so far.'
            : 'End of the sample: all of $name so far, ${_thousands(allWords)} words.',
        italic: true,
      ),
    ], align: Align.center),
    const ParagraphBlock([Run('Made with Novel Builder')], align: Align.center),
  ];
  return Compiled(title: name, author: author.trim(), blocks: blocks, wordCount: words, chapterCount: opening.length);
}

/// The sample of a book, made from its chapters as stored (JSON text, as `NovelStore.rawJsonIn` reads them): [order]
/// is the chapters' ids in reading order, [titles] their titles. The line on the title page is the book's best
/// (`best_lines.dart`); the blurb is only the author's synopsis, since the opening follows it. A job for an isolate.
Compiled Function() samplerJob(
  List<String> storedContents,
  List<String> order,
  Map<String, String> titles, {
  required String title,
  required String author,
  required String synopsis,
}) => () {
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
  final chapters = [
    for (final id in order) (id: id, title: titles[id] ?? '', paragraphs: pages[id] ?? const <String>[]),
  ];
  final best = bestLines([for (final c in chapters) (id: c.id, paragraphs: c.paragraphs)]);
  return samplerOf(
    title: title,
    author: author,
    quote: best.isEmpty ? '' : best.first.text,
    blurb: synopsis,
    chapters: [for (final c in chapters) (title: c.title, paragraphs: c.paragraphs)],
    allChapters: chapters.where((c) => c.paragraphs.any((p) => _words(p) > 0)).length,
    allWords: chapters.fold(0, (s, c) => s + c.paragraphs.fold(0, (t, p) => t + _words(p))),
  );
};

String _thousands(int n) {
  final s = n.toString();
  final out = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) out.write(',');
    out.write(s[i]);
  }
  return out.toString();
}
