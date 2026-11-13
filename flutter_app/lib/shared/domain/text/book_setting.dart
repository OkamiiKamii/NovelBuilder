/// SET LIKE A BOOK: how a printed novel opens a chapter and breaks a scene, as rules over the author's own text. Reads
/// only: the page is drawn so, and the words are never changed.
library;

final _breakMarks = RegExp(r'^[\s*#~•·⁂❦✦◆◇§=_\-–—]+$');
final _markChar = RegExp(r'[*#~•·⁂❦✦◆◇§]');

/// Whether a paragraph is a scene break as writers type one: nothing but marks (`***`, `* * *`, `#`, `~~~`, `⁂`), and at
/// least one of them a star, a hash, a tilde or an ornament (a line of dashes alone is a dash, not a break).
bool isSceneBreak(String text) {
  final t = text.trim();
  return t.isNotEmpty && t.length <= 24 && _breakMarks.hasMatch(t) && _markChar.hasMatch(t);
}

final _opener = RegExp('^[“"‘\'(«\\[]*[\\p{L}\\p{N}]', unicode: true);
final _wordRun = RegExp(r'[\p{L}\p{N}’\x27\-]+', unicode: true);

/// The words set in small capitals after the initial: up to this many.
const smallCapWords = 4;

/// How a chapter's first paragraph opens: the raised initial (any opening quotation marks with the first letter) ends
/// at [initialEnd]; the small capitals run on from there to [capsEnd], through the rest of the first word and up to
/// [smallCapWords] words, stopping at the first comma, stop, colon, dash or quotation. Null when the paragraph does
/// not begin with a letter or a figure (after any opening quotation marks).
({int initialEnd, int capsEnd})? chapterOpening(String text) {
  final m = _opener.firstMatch(text);
  if (m == null) return null;
  final initialEnd = m.end;
  var capsEnd = initialEnd;
  var words = 0;
  for (final w in _wordRun.allMatches(text)) {
    if (w.end <= initialEnd) continue;
    // Stop at the first break in the sense: punctuation between the last word and this one.
    // (The first word may begin inside the initial: "T|he".)
    final between = w.start > capsEnd ? text.substring(capsEnd, w.start) : '';
    if (RegExp(r'[,.;:!?…—–"“”]').hasMatch(between)) break;
    capsEnd = w.end;
    words++;
    if (words >= smallCapWords) break;
  }
  return (initialEnd: initialEnd, capsEnd: capsEnd);
}
