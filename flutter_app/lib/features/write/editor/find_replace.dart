import 'package:flutter/foundation.dart';
import 'package:super_editor/super_editor.dart';

/// One place the searched-for text appears: a paragraph and the characters [start] (included) to [end] (excluded).
@immutable
class TextMatch {
  const TextMatch(this.nodeId, this.start, this.end);
  final String nodeId;
  final int start;
  final int end;

  DocumentRange get range => DocumentRange(
    start: DocumentPosition(
      nodeId: nodeId,
      nodePosition: TextNodePosition(offset: start),
    ),
    end: DocumentPosition(
      nodeId: nodeId,
      nodePosition: TextNodePosition(offset: end),
    ),
  );

  @override
  bool operator ==(Object other) =>
      other is TextMatch && other.nodeId == nodeId && other.start == start && other.end == end;

  @override
  int get hashCode => Object.hash(nodeId, start, end);
}

final _wordChar = RegExp(r'[\p{L}\p{N}_]', unicode: true);

/// Lower case that keeps every character in place, so positions found in it are positions in the text (a few
/// characters, like the Turkish dotted I, become two when lower-cased; those are compared as they are).
String _fold(String s) => s.split('').map((c) {
  final l = c.toLowerCase();
  return l.length == c.length ? l : c;
}).join();

/// Every place [query] appears in the document, in reading order. Finding never changes anything.
List<TextMatch> findInDocument(Document document, String query, {bool matchCase = false, bool wholeWords = false}) {
  if (query.isEmpty) return const [];
  final needle = matchCase ? query : _fold(query);
  final matches = <TextMatch>[];
  for (final node in document) {
    if (node is! TextNode) continue;
    final text = node.text.toPlainText();
    final haystack = matchCase ? text : _fold(text);
    var from = 0;
    while (true) {
      final at = haystack.indexOf(needle, from);
      if (at < 0) break;
      final end = at + needle.length;
      final bounded =
          !wholeWords ||
          ((at == 0 || !_wordChar.hasMatch(text[at - 1])) && (end == text.length || !_wordChar.hasMatch(text[end])));
      if (bounded) matches.add(TextMatch(node.id, at, end));
      from = end > at ? end : at + 1;
    }
  }
  return matches;
}

/// The edits that replace [matches] with [replacement], each keeping the formatting of the text it replaces. Later
/// matches come first, so earlier positions stay valid. Run them in one `editor.execute` so one Undo reverts them all.
List<EditRequest> replaceRequests(Document document, List<TextMatch> matches, String replacement) {
  final ordered = [...matches]
    ..sort((a, b) {
      final na = document.getNodeIndexById(a.nodeId);
      final nb = document.getNodeIndexById(b.nodeId);
      return na != nb ? nb.compareTo(na) : b.start.compareTo(a.start);
    });
  return [
    for (final m in ordered) ...[
      DeleteContentRequest(documentRange: m.range),
      if (replacement.isNotEmpty)
        InsertTextRequest(
          documentPosition: m.range.start,
          textToInsert: replacement,
          attributions: (document.getNodeById(m.nodeId)! as TextNode).text.getAllAttributionsAt(m.start),
        ),
    ],
  ];
}
