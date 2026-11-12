/// An entry found in a chapter, and how many times: by its names in the text, or by links to it, whichever is more.
typedef Present = ({String id, int mentions});

/// IN THIS CHAPTER: the entries a chapter names, most-mentioned first (ties in the order of [names]). Names are matched
/// as whole words, capitals as written (`named_in.dart` gives them: "Wren" a person, "wren" a bird). A text that says
/// "Wren Hollis" counts once for Wren, not once for each of the names she goes by. [links] counts the links to each
/// entry in the text; an entry linked and never named still counts.
List<Present> presentIn(List<String> paragraphs, Map<String, List<String>> names, {Map<String, int> links = const {}}) {
  final text = paragraphs.join('\n');
  final counts = <String, int>{};
  for (final MapEntry(key: id, value: list) in names.entries) {
    final wanted = {for (final n in list) n.trim()}.where((n) => n.isNotEmpty).toList()
      ..sort((a, b) => b.length - a.length);
    if (wanted.isEmpty) continue;
    final pattern = RegExp(
      '(?<![\\p{L}\\p{N}])(?:${wanted.map(RegExp.escape).join('|')})(?![\\p{L}\\p{N}])',
      unicode: true,
    );
    final n = pattern.allMatches(text).length;
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
