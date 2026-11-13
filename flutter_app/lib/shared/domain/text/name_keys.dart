/// NAME KEYS: a writer's keyboard knows English, not the book. "Mimir Forest", "Ilse Marrow", "Smart Atoms": the names
/// a novel is made of are the words its writer types most and the phone's keyboard guesses worst. These are the book's
/// own names offered as keys: the ones that complete the word being typed, else the ones already on this page.
///
/// Reads only: a key puts a name in only when it is pressed.
library;

/// One key: whose name it is (the entry's id) and the name as it is to be written.
typedef NameKey = ({String id, String name});

/// The most keys offered at once.
const nameKeysShown = 6;

final _wordEnd = RegExp(r"[\p{L}\p{N}'’\-]+$", unicode: true);
final _letter = RegExp(r'[\p{L}\p{N}]', unicode: true);

/// The word being typed: the run of letters that ends at [caret] in [text], and where it starts. Null when the caret is
/// not at the end of a word (in the middle of one, or after a space).
({int start, String word})? wordAt(String text, int caret) {
  if (caret <= 0 || caret > text.length) return null;
  if (caret < text.length && _letter.hasMatch(text[caret])) return null;
  final m = _wordEnd.firstMatch(text.substring(0, caret));
  if (m == null) return null;
  return (start: m.start, word: m[0]!);
}

/// The names that complete [partial], best first: two letters or more, a capital first (names are written so, and so
/// "the" and "him" call up nothing), matched without regard to case after it. A name the word already is, whole, is
/// not offered, nor one that begins "The" (its shorter form is). Names of entries in [present] (this chapter's,
/// most-mentioned first) come first, then the shorter name, as prose uses the first name more than the whole one.
List<NameKey> completionsFor(String partial, Map<String, List<String>> names, {List<String> present = const []}) {
  if (partial.length < 2 || partial[0] == partial[0].toLowerCase()) return const [];
  final want = partial.toLowerCase();
  final rank = {for (final (i, id) in present.indexed) id: i};
  final found = <String, NameKey>{};
  for (final MapEntry(key: id, value: list) in names.entries) {
    for (final name in list) {
      if (name.startsWith('The ') || name == partial || name.length <= partial.length) continue;
      if (!name.toLowerCase().startsWith(want)) continue;
      found.putIfAbsent(name, () => (id: id, name: name));
    }
  }
  final keys = found.values.toList()
    ..sort((a, b) {
      final ra = rank[a.id] ?? 1 << 20;
      final rb = rank[b.id] ?? 1 << 20;
      if (ra != rb) return ra - rb;
      if (a.name.length != b.name.length) return a.name.length - b.name.length;
      return a.name.compareTo(b.name);
    });
  return keys.take(nameKeysShown).toList();
}

/// The names on the page already, as keys, in [present]'s order, for when nothing is being typed: each by its first
/// name when that is a name it goes by ("Wren" for Wren Hollis), otherwise its name.
List<NameKey> pageKeys(Map<String, List<String>> names, List<String> present) {
  final out = <NameKey>[];
  for (final id in present) {
    final list = [
      for (final n in names[id] ?? const <String>[])
        if (!n.startsWith('The ')) n,
    ];
    if (list.isEmpty) continue;
    final first = list.first.split(' ').first;
    out.add((id: id, name: list.contains(first) ? first : list.first));
    if (out.length == nameKeysShown) break;
  }
  return out;
}
