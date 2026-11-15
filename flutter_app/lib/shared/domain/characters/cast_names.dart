/// THE CAST'S NAMES, FOUND: every place the cast's names stand in a text, found in one reading of it.
///
/// Reading a book for its cast used to mean a search per character, per name they go by, over every paragraph: a cost
/// that grew with the cast times the book (four hundred characters, a thousand names, three hundred thousand words: a
/// thousand readings of the book). Here the text is read once, word by word; each word is looked up among the words
/// the cast's names begin with, and only a name that begins with it is checked, where it stands. The cost grows with
/// the book alone.
///
/// A name is found as a word of its own: no letter just before it, none just after it ("Kade" in "Kade’s" and "Kade,"
/// but not in "Kaden"), and matched exactly, case and all: what the searches it replaces found, the same places.
///
/// Reads only.
library;

import 'pov.dart' show EyesPerson;

/// A name found: where it starts and ends in the text, whose it is, and which of their names (its place in their list).
typedef NameHit = ({int start, int end, String id, int name});

final _letters = RegExp(r'\p{L}+', unicode: true);
final _letter = RegExp(r'\p{L}', unicode: true);

/// The cast's names, ready to be found in any text.
class CastNames {
  CastNames(List<EyesPerson> people) {
    for (final p in people) {
      for (final (i, raw) in p.names.indexed) {
        final name = raw.trim();
        if (name.isEmpty) continue;
        final first = _letters.matchAsPrefix(name);
        if (first == null) {
          // A name that does not begin with a letter ("3PO"): found the slow way, as before.
          _slow.add((
            id: p.id,
            index: i,
            find: RegExp('(?<![\\p{L}])${RegExp.escape(name)}(?![\\p{L}])', unicode: true),
          ));
        } else {
          _byFirst.putIfAbsent(first[0]!, () => []).add((id: p.id, index: i, name: name));
        }
      }
    }
  }

  /// The names, by the run of letters each begins with.
  final _byFirst = <String, List<({String id, int index, String name})>>{};
  final _slow = <({String id, int index, RegExp find})>[];

  /// Whether there is any name to find.
  bool get isEmpty => _byFirst.isEmpty && _slow.isEmpty;

  /// Every place in [text] where a name of the cast stands as a word of its own, in the order they stand (at one place,
  /// the longest name first). Every name is found where it stands, so one place may hold several (a longer name and a
  /// shorter one in it, or two characters who share a name).
  List<NameHit> all(String text) {
    final out = <NameHit>[];
    if (_byFirst.isNotEmpty) {
      for (final word in _letters.allMatches(text)) {
        final candidates = _byFirst[word[0]!];
        if (candidates == null) continue;
        final at = word.start;
        for (final c in candidates) {
          final end = at + c.name.length;
          if (!text.startsWith(c.name, at)) continue;
          if (end < text.length && _letter.matchAsPrefix(text, end) != null) continue;
          out.add((start: at, end: end, id: c.id, name: c.index));
        }
      }
    }
    for (final s in _slow) {
      for (final m in s.find.allMatches(text)) {
        out.add((start: m.start, end: m.end, id: s.id, name: s.index));
      }
    }
    out.sort((a, b) => a.start != b.start ? a.start - b.start : (b.end - b.start) - (a.end - a.start));
    return out;
  }

  /// The ids of everyone named in [text].
  Set<String> named(String text) => {for (final h in all(text)) h.id};
}
