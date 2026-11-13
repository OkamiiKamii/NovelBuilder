/// THE BACK OF THE JACKET: what a printed novel says on its back, taken from this one. The blurb is the author's
/// synopsis when there is one, else the book's own opening, cut at a sentence; the pull quote is a line someone says in
/// it, short enough to set large, else its first sentence. Only the author's words, nothing written for them.
library;

import 'dart:convert';

import 'prose.dart';

/// The back of the jacket: the quote set large, and the blurb.
typedef JacketCopy = ({String quote, String blurb});

/// The most words the blurb runs to when it is the opening.
const blurbWords = 70;

final _sentence = RegExp(r'[^.!?…]+[.!?…]+["”’]*|[^.!?…]+$');
final _spoken = RegExp(r'[“"]([^”"]{8,160})[”"]');

/// The back of the jacket for a book whose paragraphs (in reading order) are [paragraphs], its synopsis [synopsis].
JacketCopy jacketCopy(List<String> paragraphs, String synopsis) {
  final text = [
    for (final p in paragraphs)
      if (p.trim().isNotEmpty) p.trim(),
  ];
  // A spoken line of five to fourteen words, ending as a sentence.
  var quote = '';
  for (final p in text) {
    for (final m in _spoken.allMatches(p)) {
      final words = m[1]!.trim().split(RegExp(r'\s+'));
      if (words.length >= 5 && words.length <= 14) {
        quote = m[1]!.trim().replaceFirst(RegExp(r'[,;:]$'), '.');
        break;
      }
    }
    if (quote.isNotEmpty) break;
  }
  if (quote.isEmpty && text.isNotEmpty) {
    final first = _sentence.firstMatch(text.first)?[0]?.trim() ?? '';
    if (first.split(RegExp(r'\s+')).length <= 24) quote = first;
  }

  var blurb = synopsis.trim();
  if (blurb.isEmpty && text.isNotEmpty) {
    final out = <String>[];
    var count = 0;
    var cut = false;
    outer:
    for (final p in text) {
      for (final s in _sentence.allMatches(p)) {
        final sentence = s[0]!.trim();
        final n = sentence.split(RegExp(r'\s+')).length;
        if (count > 0 && count + n > blurbWords) {
          cut = true;
          break outer;
        }
        out.add(sentence);
        count += n;
      }
    }
    blurb = '${out.join(' ')}${cut ? ' …' : ''}';
  }
  return (quote: quote, blurb: blurb);
}

/// [jacketCopy] over the chapters as stored (JSON text, as `NovelStore.rawJsonIn` reads them), in reading order
/// [order], as a job for an isolate.
JacketCopy Function() jacketCopyJob(List<String> storedContents, List<String> order, String synopsis) => () {
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
  return jacketCopy([for (final id in order) ...?pages[id]], synopsis);
};
