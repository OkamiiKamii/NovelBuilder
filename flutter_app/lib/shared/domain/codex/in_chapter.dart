/// An entry found in a chapter, and how many times: by its names in the text, or by links to it, whichever is more.
typedef Present = ({String id, int mentions});

/// Runs of letters and digits: a name matched as whole words has each of its own runs as a whole run of the text.
final _runs = RegExp(r'[\p{L}\p{N}]+', unicode: true);

/// An entry's pattern, by its names: kept, so a page read again after each pause in typing does not build again the
/// patterns of the few entries it names. The most recently used [_kept] are kept.
final _patterns = <String, RegExp>{};
const _kept = 512;

RegExp _patternFor(List<String> wanted) {
  final key = wanted.join('\u0000');
  final kept = _patterns.remove(key);
  if (kept != null) return _patterns[key] = kept;
  if (_patterns.length >= _kept) _patterns.remove(_patterns.keys.first);
  return _patterns[key] = RegExp(
    '(?<![\\p{L}\\p{N}])(?:${wanted.map(RegExp.escape).join('|')})(?![\\p{L}\\p{N}])',
    unicode: true,
  );
}

/// IN THIS CHAPTER: the entries a chapter names, most-mentioned first (ties in the order of [names]). Names are matched
/// as whole words, capitals as written (`named_in.dart` gives them: "Wren" a person, "wren" a bird). A text that says
/// "Wren Hollis" counts once for Wren, not once for each of the names she goes by. [links] counts the links to each
/// entry in the text; an entry linked and never named still counts.
///
/// The text is read once for the words it holds; an entry none of whose names has all its words there cannot be named
/// in it, and is passed over without a search (a book's codex has hundreds of entries; a chapter names a few). The rest
/// are searched as before: the same places, the same counts.
List<Present> presentIn(List<String> paragraphs, Map<String, List<String>> names, {Map<String, int> links = const {}}) {
  final text = paragraphs.join('\n');
  final words = {for (final m in _runs.allMatches(text)) m[0]!};
  final counts = <String, int>{};
  for (final MapEntry(key: id, value: list) in names.entries) {
    final wanted = {for (final n in list) n.trim()}.where((n) => n.isNotEmpty).toList()
      ..sort((a, b) => b.length - a.length);
    if (wanted.isEmpty) continue;
    if (!wanted.any((n) => _runs.allMatches(n).every((m) => words.contains(m[0])))) continue;
    final n = _patternFor(wanted).allMatches(text).length;
    if (n > 0) counts[id] = n;
  }
  for (final MapEntry(key: id, value: n) in links.entries) {
    if (n > (counts[id] ?? 0)) counts[id] = n;
  }
  final order = [...names.keys, ...links.keys.where((k) => !names.containsKey(k))];
  final out = [
    for (final id in order)
      if (counts[id] case final n?) (id: id, mentions: n),
  ];
  // Most first; the same count keeps the given order.
  final at = {for (final (i, id) in order.indexed) id: i};
  out.sort((a, b) => a.mentions != b.mentions ? b.mentions - a.mentions : at[a.id]! - at[b.id]!);
  return out;
}
