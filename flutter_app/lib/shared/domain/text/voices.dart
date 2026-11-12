/// VOICES: who speaks each line of dialogue in a chapter, found by how dialogue is written (the same rules as "In their
/// own words", `characters/voice.dart`), never guessed:
///
/// - a quotation followed by a word of speech and a name: “It's going,” Wren said / “Go,” said Nan;
/// - a name and a word of speech before it: Wren said, “Go.” / Ilse whispered: “Close the drawer.”;
/// - in a paragraph where one character alone is named as speaking, its other quotations too.
///
/// "She said" names no one: the line is dialogue nobody is named for. So is a line in a paragraph where two are named
/// as speaking and it is tied to neither. Reads the text only; returns places in it.
library;

/// One quotation: the paragraph it is in, where it starts and ends (the quotation marks included, end exclusive), who
/// says it (a character's id, or null when nobody is named for it), and its words.
typedef VoiceLine = ({int block, int start, int end, String? speaker, int words});

/// The chapter's dialogue: every quotation in order, and its words against the chapter's.
class VoiceReport {
  const VoiceReport(this.lines, this.chapterWords);

  static const empty = VoiceReport([], 0);

  final List<VoiceLine> lines;

  /// Every word in the chapter, dialogue and the rest.
  final int chapterWords;

  int get dialogueWords => lines.fold(0, (a, l) => a + l.words);

  /// Words spoken by each speaker (null: nobody named), most first.
  List<({String? speaker, int words, int lines})> get speakers {
    final words = <String?, int>{};
    final count = <String?, int>{};
    for (final l in lines) {
      words[l.speaker] = (words[l.speaker] ?? 0) + l.words;
      count[l.speaker] = (count[l.speaker] ?? 0) + 1;
    }
    final out = [for (final s in words.keys) (speaker: s, words: words[s]!, lines: count[s]!)];
    // Named speakers by how much they say; the unnamed lines last, whatever their length.
    out.sort((a, b) {
      if ((a.speaker == null) != (b.speaker == null)) return a.speaker == null ? 1 : -1;
      return b.words - a.words;
    });
    return out;
  }

  List<VoiceLine> of(String? speaker) => [
    for (final l in lines)
      if (l.speaker == speaker) l,
  ];
}

const speechWords = [
  'said',
  'says',
  'asked',
  'asks',
  'whispered',
  'shouted',
  'called',
  'replied',
  'answered',
  'murmured',
  'cried',
  'snapped',
  'muttered',
  'added',
  'told',
  'began',
  'sang',
  'breathed',
  'laughed',
  'sighed',
  'admitted',
  'insisted',
  'demanded',
  'warned',
  'yelled',
  'hissed',
  'growled',
  'went on',
  'agreed',
  'explained',
  'repeated',
  'gasped',
];

final _quote = RegExp(r'“([^”]+)”|"([^"]+)"');
final _word = RegExp(r"[\p{L}\p{N}][\p{L}\p{N}'’-]*", unicode: true);

int countWords(String text) => _word.allMatches(text).length;

/// The dialogue in [paragraphs], with speakers from [names] (each character's id → the names they go by in the text,
/// as `namesToFind` gives them). A name two characters share speaks for neither.
VoiceReport voicesOf(List<String> paragraphs, Map<String, List<String>> names) {
  final owner = <String, String?>{}; // name → its character, or null when two share it
  for (final MapEntry(key: id, value: list) in names.entries) {
    for (final raw in list) {
      final n = raw.trim();
      if (n.isEmpty) continue;
      owner[n] = owner.containsKey(n) && owner[n] != id ? null : id;
    }
  }
  final wanted = [
    for (final MapEntry(key: n, value: id) in owner.entries)
      if (id != null) n,
  ]..sort((a, b) => b.length - a.length);

  final verb = '(?:${speechWords.join('|')})';
  RegExp? after;
  RegExp? before;
  if (wanted.isNotEmpty) {
    final name = '(?:${wanted.map(RegExp.escape).join('|')})';
    // After a line: “…,” Wren said / “…,” said Wren (a comma or dash left outside the marks is passed over).
    after = RegExp(
      r'^[\s,;:—–-]*(?:(' + name + r')\s+' + verb + r'\b|' + verb + r'\s+(' + name + r')\b)',
      unicode: true,
    );
    // Before a line: Wren said, “…” / Ilse whispered: “…”.
    before = RegExp('($name)\\s+$verb(?:\\s+\\w+)?\\s*[,:]?\\s*\$', unicode: true);
  }
  // Anyone named as speaking at all ("She said" too), for telling a paragraph of one speaker from one of two.
  final anyone = RegExp(r"(\p{Lu}[\p{L}'’-]+)\s+" + verb + r'\b|\b' + verb + r"\s+(\p{Lu}[\p{L}'’-]+)", unicode: true);
  // "she said", "said he": someone else may be speaking, and is not named.
  final pronoun = RegExp(
    r'\b(?:[Hh]e|[Ss]he|[Tt]hey|I|[Ww]e|[Yy]ou)\s+' + verb + r'\b|\b' + verb + r'\s+(?:he|she|they|I|we|you)\b',
  );

  String? idOf(String said) {
    final whole = owner[said];
    if (whole != null) return whole;
    // "Wren" in a paragraph where the name searched for was "Wren Hollis".
    final ids = {
      for (final n in wanted)
        if (n.split(' ').contains(said)) owner[n]!,
    };
    return ids.length == 1 ? ids.single : null;
  }

  final lines = <VoiceLine>[];
  var total = 0;
  for (final (i, text) in paragraphs.indexed) {
    total += countWords(text);
    final quotes = _quote.allMatches(text).toList();
    if (quotes.isEmpty) continue;
    final who = List<String?>.filled(quotes.length, null);
    if (after != null && before != null) {
      for (final (q, m) in quotes.indexed) {
        final tail = text.substring(m.end, (m.end + 80).clamp(0, text.length));
        final head = text.substring(q == 0 ? 0 : quotes[q - 1].end, m.start);
        final a = after.firstMatch(tail);
        final b = a == null ? before.firstMatch(head) : null;
        final said = a != null ? (a[1] ?? a[2]) : b?.group(1);
        if (said != null) who[q] = idOf(said);
      }
      // The only one named as speaking here: every line in it is theirs.
      final tied = {...who.whereType<String>()};
      if (tied.length == 1 && !pronoun.hasMatch(text.replaceAll(_quote, ' '))) {
        final named = [for (final s in anyone.allMatches(text.replaceAll(_quote, ' '))) (s[1] ?? s[2])!];
        if (named.every((s) => idOf(s) == tied.single)) who.fillRange(0, who.length, tied.single);
      }
    }
    for (final (q, m) in quotes.indexed) {
      final words = countWords(m[1] ?? m[2]!);
      if (words == 0) continue;
      lines.add((block: i, start: m.start, end: m.end, speaker: who[q], words: words));
    }
  }
  return VoiceReport(lines, total);
}
