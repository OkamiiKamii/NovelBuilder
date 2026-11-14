/// THE NAME BOARD: every name in the book by the letter it starts with, and the names a reader could take for one
/// another. Readers know names by their first letter and their shape before they read them through, so the old advice
/// holds: spread the names across the alphabet, and keep the look-alikes apart ("Marrow" and "Merrow" on one page).
///
/// - **By letter**: each name under the first letter of its first word ("The" and "A" left off: "The Drowned Road" is
///   a D). A letter with three or more is crowded.
/// - **Look-alikes**, word by word between different names: one letter apart ("Marrow", "Merrow"; a letter changed,
///   added, dropped, or two swapped); or beginning and ending alike ("Elara", "Elena"); or the same first three letters
///   ("Aldous", "Aldric"). A word two names share whole is a family's, not a slip, and is left alone; so is a word
///   built on another ("Ferry", "Ferrymen").
/// - **Free letters**: the ones no name begins with yet, room for the next.
///
/// Reads only.
library;

/// A name on the board: what it is, whose (an entry's id), and what kind of thing it names.
typedef BoardName = ({String name, String id, String kind});

/// Two words a reader could take for one another, the names they are in, and why.
typedef LookAlike = ({String wordA, String wordB, List<BoardName> inA, List<BoardName> inB, String why});

/// How many names make a letter crowded.
const crowded = 3;

const _skip = {'the', 'a', 'an', 'of', 'and'};

/// The words of [name] a reader goes by: capitalised, three letters or more, "The" and "of" left out.
List<String> nameWords(String name) => [
  for (final w in name.trim().split(RegExp(r'[\s\-]+')))
    if (w.length >= 3 && !_skip.contains(w.toLowerCase()) && RegExp(r'^\p{Lu}', unicode: true).hasMatch(w))
      w.replaceAll(RegExp(r'[’\x27]s$'), '').replaceAll(RegExp(r'[^\p{L}]', unicode: true), ''),
];

/// The letter [name] is shelved under: its first word's first letter, "The" and "A" left off; '#' for any other.
String initialOf(String name) {
  final words = name.trim().split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toList();
  while (words.length > 1 && _skip.contains(words.first.toLowerCase())) {
    words.removeAt(0);
  }
  if (words.isEmpty) return '#';
  final first = _plain(words.first[0]).toUpperCase();
  return RegExp('^[A-Z]\$').hasMatch(first) ? first : '#';
}

/// A letter without its accent, as far as the common ones go.
String _plain(String c) {
  const accents = {
    'á': 'a',
    'à': 'a',
    'â': 'a',
    'ä': 'a',
    'ã': 'a',
    'å': 'a',
    'Á': 'A',
    'À': 'A',
    'Â': 'A',
    'Ä': 'A',
    'Å': 'A',
    'é': 'e',
    'è': 'e',
    'ê': 'e',
    'ë': 'e',
    'É': 'E',
    'È': 'E',
    'Ê': 'E',
    'í': 'i',
    'î': 'i',
    'ï': 'i',
    'Í': 'I',
    'ó': 'o',
    'ô': 'o',
    'ö': 'o',
    'õ': 'o',
    'Ó': 'O',
    'Ö': 'O',
    'ú': 'u',
    'û': 'u',
    'ü': 'u',
    'Ú': 'U',
    'Ü': 'U',
    'ñ': 'n',
    'Ñ': 'N',
    'ç': 'c',
    'Ç': 'C',
    'ø': 'o',
    'Ø': 'O',
  };
  return accents[c] ?? c;
}

/// The names of [names] by the letter they start with, A to Z (and '#' last, when any).
Map<String, List<BoardName>> byLetter(List<BoardName> names) {
  final out = {for (var c = 65; c <= 90; c++) String.fromCharCode(c): <BoardName>[]};
  for (final n in names) {
    if (n.name.trim().isEmpty) continue;
    out.putIfAbsent(initialOf(n.name), () => []).add(n);
  }
  for (final list in out.values) {
    // As shelved: "The Wardens’ Tower" among the W's as "Wardens’ Tower".
    list.sort((a, b) => _shelved(a.name).compareTo(_shelved(b.name)));
  }
  return out;
}

/// The letters no name begins with.
List<String> freeLetters(Map<String, List<BoardName>> board) => [
  for (final MapEntry(key: letter, value: names) in board.entries)
    if (letter != '#' && names.isEmpty) letter,
];

/// Whether [a] and [b] are one letter apart: one changed, added or dropped, or two side by side swapped.
bool oneApart(String a, String b) {
  if (a == b || (a.length - b.length).abs() > 1) return false;
  var i = 0;
  while (i < a.length && i < b.length && a[i] == b[i]) {
    i++;
  }
  if (a.length == b.length) {
    if (a.substring(i + 1) == b.substring(i + 1)) return true;
    return i + 1 < a.length && a[i] == b[i + 1] && a[i + 1] == b[i] && a.substring(i + 2) == b.substring(i + 2);
  }
  final (long, short) = a.length > b.length ? (a, b) : (b, a);
  return long.substring(i + 1) == short.substring(i);
}

/// The look-alikes among [names], word by word between different names.
List<LookAlike> lookAlikes(List<BoardName> names) {
  // Each word, and the names it is in.
  final words = <String, List<BoardName>>{};
  for (final n in names) {
    for (final w in nameWords(n.name).toSet()) {
      final list = words.putIfAbsent(w, () => []);
      if (!list.any((x) => x.id == n.id)) list.add(n);
    }
  }
  final keys = words.keys.toList()..sort();
  final out = <LookAlike>[];
  for (var i = 0; i < keys.length; i++) {
    for (var j = i + 1; j < keys.length; j++) {
      final a = keys[i];
      final b = keys[j];
      final la = a.toLowerCase();
      final lb = b.toLowerCase();
      // The same word, or one built on the other ("Ferry", "Ferrymen"): kin, not look-alikes.
      if (la == lb || la.startsWith(lb) || lb.startsWith(la)) continue;
      // Only between different names: a name is not its own look-alike.
      final ids = {for (final n in words[a]!) n.id};
      if (words[b]!.every((n) => ids.contains(n.id))) continue;
      String? why;
      if (la.length >= 4 && lb.length >= 4 && oneApart(la, lb)) {
        why = 'one letter apart';
      } else if (la.length >= 4 &&
          lb.length >= 4 &&
          (la.length - lb.length).abs() <= 1 &&
          la.substring(0, 2) == lb.substring(0, 2) &&
          la[la.length - 1] == lb[lb.length - 1]) {
        why = 'beginning and ending alike';
      } else if (la.length >= 5 && lb.length >= 5 && la.substring(0, 3) == lb.substring(0, 3)) {
        why = 'the same first three letters';
      }
      if (why != null) out.add((wordA: a, wordB: b, inA: words[a]!, inB: words[b]!, why: why));
    }
  }
  const rank = {'one letter apart': 0, 'beginning and ending alike': 1, 'the same first three letters': 2};
  out.sort((x, y) => rank[x.why]! - rank[y.why]!);
  return out;
}

/// [name] as it is shelved: lower case, "The" and "A" left off the front.
String _shelved(String name) {
  final words = name.trim().toLowerCase().split(RegExp(r'\s+'));
  while (words.length > 1 && _skip.contains(words.first)) {
    words.removeAt(0);
  }
  return words.join(' ');
}
