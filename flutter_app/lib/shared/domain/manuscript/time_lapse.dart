import '../text/voices.dart' show countWords;

/// A copy of a chapter's text: when it was saved, and its paragraphs.
typedef LapseCopy = ({int at, List<String> paragraphs});

/// One frame of the time-lapse: the text as it was saved then, its words, and which of its paragraphs (by index) are
/// new or changed since the frame before (every one, on the first).
typedef LapseFrame = ({int at, List<String> paragraphs, int words, Set<int> fresh});

/// TIME-LAPSE: a chapter's saved copies, oldest first, as frames, each marking what it added to the one before.
/// Copies that say the same as the one before are left out (a save with nothing changed); empty paragraphs are not
/// counted as written. Paragraphs are matched in order (the longest common run of them), so a paragraph moved or
/// rewritten is new where it now stands.
List<LapseFrame> timeLapse(List<LapseCopy> copies) {
  final sorted = [...copies]..sort((a, b) => a.at.compareTo(b.at));
  final out = <LapseFrame>[];
  List<String>? before;
  for (final c in sorted) {
    final now = [for (final p in c.paragraphs) p.trim()].where((p) => p.isNotEmpty).toList();
    if (before != null && _sameList(before, now)) continue;
    out.add((at: c.at, paragraphs: now, words: countWords(now.join(' ')), fresh: _fresh(before ?? const [], now)));
    before = now;
  }
  return out;
}

bool _sameList(List<String> a, List<String> b) {
  if (a.length != b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i] != b[i]) return false;
  }
  return true;
}

/// The indexes of [now] outside the longest common subsequence with [before].
Set<int> _fresh(List<String> before, List<String> now) {
  final n = before.length;
  final m = now.length;
  // lcs[i][j]: the longest common run of before[i..] and now[j..].
  final lcs = List.generate(n + 1, (_) => List.filled(m + 1, 0));
  for (var i = n - 1; i >= 0; i--) {
    for (var j = m - 1; j >= 0; j--) {
      lcs[i][j] = before[i] == now[j]
          ? lcs[i + 1][j + 1] + 1
          : (lcs[i + 1][j] > lcs[i][j + 1] ? lcs[i + 1][j] : lcs[i][j + 1]);
    }
  }
  final kept = <int>{};
  var i = 0;
  var j = 0;
  while (i < n && j < m) {
    if (before[i] == now[j]) {
      kept.add(j);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return {
    for (var k = 0; k < m; k++)
      if (!kept.contains(k)) k,
  };
}
