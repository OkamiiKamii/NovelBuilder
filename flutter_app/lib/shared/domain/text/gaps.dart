import 'dart:convert';

import '../manuscript/prose.dart';

/// GAPS: the places a writer has left to fill, so as to write past them and keep going. Two marks, both long-standing
/// habits of writers rather than anything of this app's making: "TK" (printers' shorthand for "to come", chosen
/// because those two letters almost never meet in a real word), and a note in double square brackets ("[[the name of
/// the pass]]"). Single brackets are left alone: a LitRPG page is full of them ("[Skill acquired]").
///
/// Reads only. A gap is the author's own text, found where it is written; nothing is ever added, removed or stored.

/// One gap in a paragraph: where it starts and ends, and the note in it (empty for a bare TK, or for "[[ ]]").
typedef GapSpan = ({int start, int end, String note});

final _gap = RegExp(r'\[\[([^\[\]\n]*)\]\]|(?<![\p{L}\p{N}])TK(?:TK)*(?![\p{L}\p{N}])', unicode: true);

/// The gaps in one paragraph, in order.
List<GapSpan> gapsIn(String text) {
  if (!text.contains('TK') && !text.contains('[[')) return const [];
  return [for (final m in _gap.allMatches(text)) (start: m.start, end: m.end, note: (m[1] ?? '').trim())];
}

/// One gap in the book: the chapter or scene, the paragraph (its index among the chapter's paragraphs), where it is in
/// that paragraph, the gap as written, the note in it, and the words either side of it ([before] and [after]), cut to
/// [gapContextChars] each.
typedef Gap = ({
  String nodeId,
  int block,
  int start,
  int end,
  String written,
  String note,
  String before,
  String after,
});

/// The most of the words either side of a gap that are shown.
const gapContextChars = 60;

/// Every gap in [nodeIds] (in reading order), paragraph by paragraph. [pages] are each chapter's paragraphs.
List<Gap> bookGaps(Map<String, List<String>> pages, List<String> nodeIds) {
  final out = <Gap>[];
  for (final id in nodeIds) {
    final blocks = pages[id];
    if (blocks == null) continue;
    for (final (i, text) in blocks.indexed) {
      for (final g in gapsIn(text)) {
        out.add((
          nodeId: id,
          block: i,
          start: g.start,
          end: g.end,
          written: text.substring(g.start, g.end),
          note: g.note,
          before: _before(text, g.start),
          after: _after(text, g.end),
        ));
      }
    }
  }
  return out;
}

/// The words before [at], back to the paragraph's start or about [gapContextChars], cut at a space.
String _before(String text, int at) {
  final from = at - gapContextChars;
  if (from <= 0) return text.substring(0, at).trimLeft();
  final space = text.indexOf(' ', from);
  final cut = space < 0 || space >= at ? from : space + 1;
  return '…${text.substring(cut, at)}';
}

/// The words after [at], on to the paragraph's end or about [gapContextChars], cut at a space.
String _after(String text, int at) {
  final to = at + gapContextChars;
  if (to >= text.length) return text.substring(at).trimRight();
  final space = text.lastIndexOf(' ', to);
  final cut = space <= at ? to : space;
  return '${text.substring(at, cut)}…';
}

/// [bookGaps] over the chapters as stored (each record as JSON text, as `NovelStore.rawJsonIn` reads them), as a job
/// for an isolate: decoded and read away from the screen. Only plain data in and out, so it can be sent.
List<Gap> Function() gapsJob(List<String> storedContents, List<String> nodeIds) => () {
  final wanted = nodeIds.toSet();
  final pages = <String, List<String>>{};
  for (final json in storedContents) {
    // Most chapters hold no gap: those are passed over before they are decoded.
    if (!json.contains('TK') && !json.contains('[[')) continue;
    try {
      final row = jsonDecode(json);
      if (row is! Map || !wanted.contains(row['id'])) continue;
      pages['${row['id']}'] = blockTexts(row['doc']);
    } on FormatException {
      continue;
    }
  }
  return bookGaps(pages, nodeIds);
};
