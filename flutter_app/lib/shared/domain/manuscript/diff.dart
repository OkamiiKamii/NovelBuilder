import 'dart:math' as math;
import 'dart:typed_data';

import 'prose.dart';

/// Comparing two versions of a chapter, as the original app did (`manuscript/diff.ts`): unchanged paragraphs are
/// matched first, then each replaced stretch is examined word by word. Formatting-only changes are not shown.

enum DiffOp { same, add, del }

class DiffPart {
  DiffPart(this.op, this.text);
  final DiffOp op;
  String text;

  Map<String, Object?> toJson() => {'op': op.name, 'text': text};
}

/// One paragraph of a comparison: same, added, removed, changed (with word-level parts), or moved (identical
/// paragraph somewhere else; [side] says which copy this is).
class DiffBlock {
  DiffBlock.text(this.kind, this.text) : parts = const [], side = null;
  DiffBlock.changed(this.parts) : kind = 'changed', text = null, side = null;
  DiffBlock.moved(String this.side, this.text) : kind = 'moved', parts = const [];

  final String kind;
  final String? text;
  final List<DiffPart> parts;
  final String? side;

  Map<String, Object?> toJson() => switch (kind) {
    'changed' => {
      'kind': kind,
      'parts': [for (final p in parts) p.toJson()],
    },
    'moved' => {'kind': kind, 'side': side, 'text': text},
    _ => {'kind': kind, 'text': text},
  };
}

class DiffResult {
  DiffResult(this.blocks, this.stats, {required this.identical});
  final List<DiffBlock> blocks;
  final Map<String, int> stats;
  final bool identical;

  Map<String, Object?> toJson() => {
    'blocks': [for (final b in blocks) b.toJson()],
    'stats': stats,
    'identical': identical,
  };
}

/// Above this many table cells a comparison falls back to a coarser result instead of stalling.
const _maxCells = 4000000;

/// Two paragraphs sharing at least this fraction of their words are shown as one edited paragraph.
const _similar = 0.4;

List<DiffOp>? _align<T>(List<T> a, List<T> b, bool Function(T, T) equal) {
  final n = a.length;
  final m = b.length;
  if (n * m > _maxCells) return null;
  final width = m + 1;
  final table = Uint32List((n + 1) * width);
  for (var i = n - 1; i >= 0; i--) {
    for (var j = m - 1; j >= 0; j--) {
      table[i * width + j] = equal(a[i], b[j])
          ? table[(i + 1) * width + j + 1] + 1
          : math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  final ops = <DiffOp>[];
  var i = 0;
  var j = 0;
  while (i < n && j < m) {
    if (equal(a[i], b[j])) {
      ops.add(DiffOp.same);
      i++;
      j++;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      ops.add(DiffOp.del);
      i++;
    } else {
      ops.add(DiffOp.add);
      j++;
    }
  }
  while (i++ < n) {
    ops.add(DiffOp.del);
  }
  while (j++ < m) {
    ops.add(DiffOp.add);
  }
  return ops;
}

final _token = RegExp(r"^\s+|[\p{L}\p{N}'’_-]+\s*|[^\s\p{L}\p{N}]\s*", unicode: true);

List<({String word, String space})> _tokens(String text) => [
  for (final m in _token.allMatches(text))
    () {
      final raw = m.group(0)!;
      final word = raw.trimRight();
      return (word: word, space: raw.substring(word.length));
    }(),
];

int _wordsIn(List<DiffPart> parts, DiffOp op) =>
    parts.where((p) => p.op == op).fold(0, (n, p) => n + countWords(p.text));

/// Word-level changes between two versions of a paragraph. Joining the same and add parts gives the newer text
/// exactly; same and del, the older.
List<DiffPart> diffWords(String before, String after) {
  final a = _tokens(before);
  final b = _tokens(after);
  final ops =
      _align(a, b, (x, y) => x.word == y.word) ?? [for (final _ in a) DiffOp.del, for (final _ in b) DiffOp.add];
  final parts = <DiffPart>[];
  void push(DiffOp op, String text) {
    if (text.isEmpty) return;
    if (parts.isNotEmpty && parts.last.op == op) {
      parts.last.text += text;
    } else {
      parts.add(DiffPart(op, text));
    }
  }

  var i = 0;
  var j = 0;
  for (final op in ops) {
    switch (op) {
      case DiffOp.del:
        push(DiffOp.del, a[i].word + a[i++].space);
      case DiffOp.add:
        push(DiffOp.add, b[j].word + b[j++].space);
      case DiffOp.same:
        final x = a[i++];
        final y = b[j++];
        if (x.space == y.space) {
          push(DiffOp.same, y.word + y.space);
        } else {
          // Same word, different spacing after it: show exactly that.
          push(DiffOp.same, y.word);
          push(DiffOp.del, x.space);
          push(DiffOp.add, y.space);
        }
    }
  }
  return parts;
}

final _simWord = RegExp(r"[\p{L}\p{N}']+", unicode: true);

double _similarity(String a, String b) {
  final x = [for (final m in _simWord.allMatches(a.toLowerCase())) m.group(0)!];
  final y = [for (final m in _simWord.allMatches(b.toLowerCase())) m.group(0)!];
  if (x.isEmpty || y.isEmpty) return 0;
  final bag = <String, int>{};
  for (final w in x) {
    bag[w] = (bag[w] ?? 0) + 1;
  }
  var shared = 0;
  for (final w in y) {
    final left = bag[w] ?? 0;
    if (left > 0) {
      shared++;
      bag[w] = left - 1;
    }
  }
  return (2 * shared) / (x.length + y.length);
}

List<DiffBlock> _pairChanged(List<String> removed, List<String> added) {
  final ops =
      _align(removed, added, (x, y) => _similarity(x, y) >= _similar) ??
      [for (final _ in removed) DiffOp.del, for (final _ in added) DiffOp.add];
  final blocks = <DiffBlock>[];
  var i = 0;
  var j = 0;
  for (final op in ops) {
    switch (op) {
      case DiffOp.same:
        blocks.add(DiffBlock.changed(diffWords(removed[i++], added[j++])));
      case DiffOp.del:
        blocks.add(DiffBlock.text('removed', removed[i++]));
      case DiffOp.add:
        blocks.add(DiffBlock.text('added', added[j++]));
    }
  }
  return blocks;
}

/// Compares two texts given as lists of paragraphs.
DiffResult diffParagraphs(List<String> before, List<String> after) {
  var start = 0;
  while (start < before.length && start < after.length && before[start] == after[start]) {
    start++;
  }
  var end = 0;
  while (end < before.length - start &&
      end < after.length - start &&
      before[before.length - 1 - end] == after[after.length - 1 - end]) {
    end++;
  }
  final a = before.sublist(start, before.length - end);
  final b = after.sublist(start, after.length - end);
  final ops = _align(a, b, (x, y) => x == y) ?? [for (final _ in a) DiffOp.del, for (final _ in b) DiffOp.add];

  final blocks = [for (final t in before.sublist(0, start)) DiffBlock.text('same', t)];
  var i = 0;
  var removed = <String>[];
  var added = <String>[];
  void flush() {
    if (removed.isNotEmpty || added.isNotEmpty) blocks.addAll(_pairChanged(removed, added));
    removed = [];
    added = [];
  }

  var j = 0;
  for (final op in ops) {
    switch (op) {
      case DiffOp.same:
        flush();
        blocks.add(DiffBlock.text('same', a[i++]));
        j++;
      case DiffOp.del:
        removed.add(a[i++]);
      case DiffOp.add:
        added.add(b[j++]);
    }
  }
  flush();
  blocks.addAll([for (final t in before.sublist(before.length - end)) DiffBlock.text('same', t)]);

  // A paragraph removed in one place and added, word for word, in another has been moved.
  final waiting = <String, List<int>>{};
  for (final (index, block) in blocks.indexed) {
    if (block.kind == 'removed' && block.text!.trim().isNotEmpty) (waiting[block.text!] ??= []).add(index);
  }
  for (final (index, block) in blocks.indexed) {
    if (block.kind != 'added') continue;
    final from = waiting[block.text!];
    if (from == null || from.isEmpty) continue;
    final f = from.removeAt(0);
    blocks[f] = DiffBlock.moved('from', block.text!);
    blocks[index] = DiffBlock.moved('to', block.text!);
  }

  var wordsAdded = 0;
  var wordsRemoved = 0;
  var paragraphsChanged = 0;
  for (final block in blocks) {
    if (block.kind == 'same') continue;
    paragraphsChanged++;
    switch (block.kind) {
      case 'added':
        wordsAdded += countWords(block.text!);
      case 'removed':
        wordsRemoved += countWords(block.text!);
      case 'changed':
        wordsAdded += _wordsIn(block.parts, DiffOp.add);
        wordsRemoved += _wordsIn(block.parts, DiffOp.del);
    }
  }
  int length(List<String> ps) => ps.fold(0, (n, p) => n + p.runes.length);
  return DiffResult(blocks, {
    'wordsBefore': before.fold(0, (n, p) => n + countWords(p)),
    'wordsAfter': after.fold(0, (n, p) => n + countWords(p)),
    'charactersBefore': length(before),
    'charactersAfter': length(after),
    'wordsAdded': wordsAdded,
    'wordsRemoved': wordsRemoved,
    'paragraphsChanged': paragraphsChanged,
  }, identical: paragraphsChanged == 0);
}

/// Compares two saved documents by their text.
DiffResult diffDocs(Object? before, Object? after) => diffParagraphs(blockTexts(before), blockTexts(after));
