import 'dart:convert';
import 'dart:typed_data';

import '../json.dart';
import '../manuscript/prose.dart' show docBlocks;

/// One change a suggestion makes: these paragraphs out, those in, at this place in the text it was written against.
/// As the original app's `src/modules/collab/hunks.ts`.
class Hunk {
  const Hunk({required this.id, required this.at, required this.remove, required this.insert, required this.before});

  final String id;

  /// Where in the original it starts (a paragraph number).
  final int at;
  final List<Object?> remove;
  final List<Object?> insert;

  /// The paragraph just before, for placing a pure addition. Null at the very start.
  final Object? before;
}

List<Object?> _blocksOf(Object? doc) => [...?(mapOrNull(doc)?['content'] as List?)];
String _sig(Object? block) => jsonEncode(block);

/// The words of some paragraphs, for showing what a change says.
String textOf(List<Object?> blocks) => [
  for (final b in docBlocks({'type': 'doc', 'content': blocks})) b.text,
].join('\n');

/// The original's 32-bit string hash (djb2 with xor over UTF-16 units), written in base 36.
String _hash(String text) {
  var h = 5381;
  for (final unit in text.codeUnits) {
    h = ((h * 33) & 0xFFFFFFFF) ^ unit;
  }
  return (h & 0xFFFFFFFF).toRadixString(36);
}

/// The separate changes between a chapter as someone found it and as they would have it, paragraph by paragraph, so
/// that each can be accepted or rejected on its own. Unchanged paragraphs are matched up first (longest common run);
/// each stretch between matches is one change.
List<Hunk> textHunks(Object? base, Object? proposed) {
  final a = _blocksOf(base);
  final b = _blocksOf(proposed);
  final sa = a.map(_sig).toList();
  final sb = b.map(_sig).toList();
  final n = a.length;
  final m = b.length;
  final width = m + 1;
  final table = Uint32List((n + 1) * width);
  for (var i = n - 1; i >= 0; i--) {
    for (var j = m - 1; j >= 0; j--) {
      table[i * width + j] = sa[i] == sb[j]
          ? table[(i + 1) * width + j + 1] + 1
          : (table[(i + 1) * width + j] > table[i * width + j + 1]
                ? table[(i + 1) * width + j]
                : table[i * width + j + 1]);
    }
  }
  final hunks = <Hunk>[];
  var i = 0;
  var j = 0;
  ({int at, List<Object?> remove, List<Object?> insert})? open;
  void close() {
    final o = open;
    if (o == null) return;
    // Named by where it is and what it says, not by how the document happens to be stored: the same change has the
    // same name on every device, so a verdict given on one is recognised on another.
    hunks.add(
      Hunk(
        id: _hash('${o.at}|${o.remove.length}|${textOf(o.remove)}|${o.insert.length}|${textOf(o.insert)}'),
        at: o.at,
        remove: o.remove,
        insert: o.insert,
        before: o.at > 0 ? a[o.at - 1] : null,
      ),
    );
    open = null;
  }

  while (i < n || j < m) {
    if (i < n && j < m && sa[i] == sb[j]) {
      close();
      i++;
      j++;
    } else {
      open ??= (at: i, remove: <Object?>[], insert: <Object?>[]);
      if (j < m && (i == n || table[i * width + j + 1] >= table[(i + 1) * width + j])) {
        open!.insert.add(b[j++]);
      } else {
        open!.remove.add(a[i++]);
      }
    }
  }
  close();
  return hunks;
}

bool _runAt(List<String> content, List<String> run, int from) {
  for (var k = 0; k < run.length; k++) {
    if (content[from + k] != run[k]) return false;
  }
  return true;
}

/// Where a run of paragraphs sits in a text, nearest to where it was expected. -1 when it is not there as it was.
int _locate(List<String> content, List<String> run, int near) {
  var best = -1;
  for (var from = 0; from + run.length <= content.length; from++) {
    if (_runAt(content, run, from) && (best < 0 || (from - near).abs() < (best - near).abs())) best = from;
  }
  return best;
}

/// The outcome of applying one change.
sealed class Applied {
  const Applied();
}

/// The text with the change made.
class AppliedTo extends Applied {
  const AppliedTo(this.doc);
  final JsonMap doc;
}

/// The change is already in the text (accepted before, or the author made the same change): nothing to do.
class AlreadyThere extends Applied {
  const AlreadyThere();
}

/// The passage has been rewritten since the suggestion was written: nothing is changed.
class Rewritten extends Applied {
  const Rewritten();
}

/// Makes one accepted change to the chapter as it is NOW, which may have moved on since the suggestion was written.
/// The paragraphs it replaces are found by what they say, not by counting; if they are no longer there as the
/// suggester saw them, nothing is changed, so that an author's later writing is never overwritten by an older proposal.
Applied applyHunk(Object? current, Hunk hunk) {
  final doc = mapOrNull(current) ?? const <String, Object?>{'type': 'doc', 'content': <Object?>[]};
  final content = _blocksOf(doc);
  final sigs = content.map(_sig).toList();
  final remove = hunk.remove.map(_sig).toList();
  final insert = hunk.insert.map(_sig).toList();
  AppliedTo put(int from, int count) => AppliedTo({
    ...doc,
    'content': [...content.sublist(0, from), ...hunk.insert, ...content.sublist(from + count)],
  });
  if (remove.isNotEmpty) {
    final from = _locate(sigs, remove, hunk.at);
    if (from >= 0) return put(from, remove.length);
    return insert.isNotEmpty && _locate(sigs, insert, hunk.at) >= 0 ? const AlreadyThere() : const Rewritten();
  }
  if (hunk.before == null) return put(0, 0);
  final anchor = _locate(sigs, [_sig(hunk.before)], hunk.at - 1);
  return anchor >= 0 ? put(anchor + 1, 0) : const Rewritten();
}
