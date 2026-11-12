/// THE RED PENCIL: what an editor's pencil marks on a page of prose, found by counting, never by guessing. Three marks:
///
/// - an **echo**: a distinctive word used again within a few lines of itself ("the stone… the stone");
/// - a **long sentence**: more than [longSentenceWords] words between full stops;
/// - a **filler**: a word that usually weakens what it leans on ("very", "really", "suddenly", "began to").
///
/// It only reads. Nothing here changes text, and nothing is a rule: a mark is a place to look again.
library;

enum PencilMark {
  echo('Echoes', 'A word used again close to itself'),
  long('Long sentences', 'More than $longSentenceWords words in one sentence'),
  filler('Fillers', 'Very, really, just, suddenly, began to…');

  const PencilMark(this.label, this.meaning);
  final String label;
  final String meaning;
}

/// A sentence longer than this many words is marked.
const longSentenceWords = 40;

/// How near a word must come again, in words, to be an echo.
const echoWindow = 40;

/// One mark: in paragraph [block], from [start] to [end] (exclusive), on [word] (lower case; a sentence's first words
/// for a long sentence).
class PencilFinding {
  const PencilFinding(this.kind, this.block, this.start, this.end, this.word);
  final PencilMark kind;
  final int block;
  final int start;
  final int end;
  final String word;

  @override
  bool operator ==(Object other) =>
      other is PencilFinding && other.kind == kind && other.block == block && other.start == start && other.end == end;

  @override
  int get hashCode => Object.hash(kind, block, start, end);

  @override
  String toString() => '${kind.name}[$block:$start-$end "$word"]';
}

class PencilReport {
  const PencilReport(this.findings, this.leanedOn);

  static const empty = PencilReport([], []);

  /// Every mark, in reading order.
  final List<PencilFinding> findings;

  /// The distinctive words used most in the text, most first, each at least [leanedOnAtLeast] times.
  final List<({String word, int count})> leanedOn;

  Iterable<PencilFinding> of(PencilMark kind) => findings.where((f) => f.kind == kind);
  int count(PencilMark kind) => of(kind).length;
  bool get isEmpty => findings.isEmpty && leanedOn.isEmpty;
}

const leanedOnAtLeast = 5;

/// Marks [paragraphs] (one string each, in reading order).
PencilReport redPencil(List<String> paragraphs) {
  final findings = <PencilFinding>{};
  final counts = <String, int>{};
  final shown = <String, String>{};
  final lastAt = <String, ({int index, int block, int start, int end})>{};
  var index = 0;
  final all = [for (final p in paragraphs) _words(p)];
  // A word written with a capital in the middle of a sentence anywhere is a name, everywhere: names come back by
  // right ("Wren ran. Wren stopped." is no echo).
  final names = {
    for (final words in all)
      for (final w in words)
        if (w.name) _stem(w.key),
  };

  for (final (block, text) in paragraphs.indexed) {
    final words = all[block];

    // Fillers, and "began to" / "started to".
    for (final (i, w) in words.indexed) {
      if (_fillers.contains(w.key)) findings.add(PencilFinding(PencilMark.filler, block, w.start, w.end, w.key));
      if (_beginnings.contains(w.key) && i + 1 < words.length && words[i + 1].key == 'to') {
        final to = words[i + 1];
        if (text.substring(w.end, to.start).trim().isEmpty) {
          findings.add(PencilFinding(PencilMark.filler, block, w.start, to.end, '${w.key} to'));
        }
      }
    }

    // Echoes: a distinctive word again within [echoWindow] words, across paragraphs too.
    for (final w in words) {
      final at = index++;
      final key = _stem(w.key);
      if (!w.distinctive || names.contains(key)) continue;
      counts[key] = (counts[key] ?? 0) + 1;
      shown.putIfAbsent(key, () => w.key);
      final before = lastAt[key];
      if (before != null && at - before.index <= echoWindow) {
        findings
          ..add(PencilFinding(PencilMark.echo, before.block, before.start, before.end, shown[key]!))
          ..add(PencilFinding(PencilMark.echo, block, w.start, w.end, shown[key]!));
      }
      lastAt[key] = (index: at, block: block, start: w.start, end: w.end);
    }

    // Long sentences.
    for (final s in _sentences(text)) {
      final inside = words.where((w) => w.start >= s.start && w.end <= s.end).toList();
      if (inside.length > longSentenceWords) {
        findings.add(PencilFinding(PencilMark.long, block, s.start, s.end, inside.take(4).map((w) => w.key).join(' ')));
      }
    }
  }

  final ordered = findings.toList()
    ..sort((a, b) {
      final byBlock = a.block.compareTo(b.block);
      if (byBlock != 0) return byBlock;
      final byStart = a.start.compareTo(b.start);
      return byStart != 0 ? byStart : a.kind.index.compareTo(b.kind.index);
    });
  final leaned = [
    for (final e in counts.entries)
      if (e.value >= leanedOnAtLeast) (word: shown[e.key]!, count: e.value),
  ]..sort((a, b) => b.count != a.count ? b.count.compareTo(a.count) : a.word.compareTo(b.word));
  return PencilReport(ordered, leaned.take(5).toList());
}

typedef _Word = ({int start, int end, String key, bool distinctive, bool name});

final _wordPattern = RegExp(r"[\p{L}\p{M}][\p{L}\p{M}\p{Nd}'’-]*", unicode: true);
final _sentenceEnd = RegExp(r'[.!?…]+', unicode: true);
final _closers = RegExp(r'''^["”’')\]»]*''');

List<_Word> _words(String text) {
  final out = <_Word>[];
  var sentenceStart = true;
  var from = 0;
  for (final m in _wordPattern.allMatches(text)) {
    // Between the last word and this one: did a sentence end?
    final gap = text.substring(from, m.start);
    if (_sentenceEnd.hasMatch(gap) || (gap.contains(':') && gap.contains(RegExp('["“]')))) sentenceStart = true;
    var raw = m.group(0)!;
    // A trailing apostrophe or dash is punctuation, not part of the word.
    while (raw.isNotEmpty && "'’-".contains(raw[raw.length - 1])) {
      raw = raw.substring(0, raw.length - 1);
    }
    if (raw.isEmpty) continue;
    final key = raw.toLowerCase().replaceAll("'", '’');
    final capital = raw[0] != raw[0].toLowerCase();
    // A capital not at the start of a sentence is a name.
    final name = capital && !sentenceStart;
    final base = key.replaceAll(RegExp(r"['’]s$"), '');
    final distinctive = !name && base.length >= 4 && !_common.contains(base) && !_fillers.contains(base);
    out.add((start: m.start, end: m.start + raw.length, key: key, distinctive: distinctive, name: name));
    sentenceStart = false;
    from = m.start + raw.length;
  }
  return out;
}

/// "stones" and "stone", "Ilse’s" and "Ilse" are the same word to the ear.
String _stem(String key) {
  var k = key.replaceAll(RegExp(r"['’]s$"), '');
  if (k.length > 4 && k.endsWith('s') && !k.endsWith('ss') && !k.endsWith('us') && !k.endsWith('is')) {
    k = k.substring(0, k.length - 1);
  }
  return k;
}

/// Each sentence's start and end (end exclusive, after its full stop and any closing quote).
List<({int start, int end})> _sentences(String text) {
  final out = <({int start, int end})>[];
  var start = 0;
  for (final m in _sentenceEnd.allMatches(text)) {
    var end = m.end;
    final close = _closers.firstMatch(text.substring(end));
    if (close != null) end += close.end;
    // Only a full stop followed by a space or the end of the paragraph ends a sentence ("3.5", "Mr.Fenn" do not).
    if (end < text.length && text[end] != ' ') continue;
    final s = _trimmed(text, start, end);
    if (s != null) out.add(s);
    start = end;
  }
  final last = _trimmed(text, start, text.length);
  if (last != null) out.add(last);
  return out;
}

({int start, int end})? _trimmed(String text, int start, int end) {
  while (start < end && text[start] == ' ') {
    start++;
  }
  while (end > start && text[end - 1] == ' ') {
    end--;
  }
  return end > start ? (start: start, end: end) : null;
}

const _fillers = {
  'very',
  'really',
  'just',
  'suddenly',
  'quite',
  'rather',
  'somewhat',
  'actually',
  'basically',
  'literally',
  'totally',
  'definitely',
  'simply',
  'truly',
};

const _beginnings = {'began', 'begin', 'begins', 'beginning', 'started', 'start', 'starts', 'starting'};

/// Words every sentence needs, which repeat without anyone hearing them.
const _common = {
  'about',
  'above',
  'after',
  'again',
  'against',
  'almost',
  'along',
  'also',
  'always',
  'among',
  'another',
  'anyone',
  'anything',
  'around',
  'away',
  'back',
  'because',
  'been',
  'before',
  'behind',
  'being',
  'below',
  'beside',
  'between',
  'both',
  'came',
  'come',
  'comes',
  'could',
  'didn',
  'does',
  'doesn',
  'doing',
  'done',
  'down',
  'each',
  'even',
  'ever',
  'every',
  'everyone',
  'everything',
  'from',
  'gave',
  'give',
  'goes',
  'going',
  'gone',
  'good',
  'got',
  'great',
  'had',
  'hadn',
  'have',
  'having',
  'he’d',
  'he’s',
  'hers',
  'herself',
  'here',
  'himself',
  'into',
  'it’s',
  'know',
  'knew',
  'last',
  'left',
  'less',
  'like',
  'little',
  'long',
  'look',
  'looked',
  'made',
  'make',
  'many',
  'might',
  'more',
  'most',
  'much',
  'must',
  'myself',
  'never',
  'next',
  'nothing',
  'once',
  'only',
  'onto',
  'other',
  'others',
  'ours',
  'over',
  'own',
  'perhaps',
  'said',
  'same',
  'says',
  'seemed',
  'shall',
  'she’d',
  'she’s',
  'should',
  'since',
  'some',
  'something',
  'still',
  'such',
  'take',
  'than',
  'that',
  'that’s',
  'their',
  'theirs',
  'them',
  'themselves',
  'then',
  'there',
  'there’s',
  'these',
  'they',
  'they’d',
  'they’re',
  'thing',
  'things',
  'think',
  'this',
  'those',
  'though',
  'thought',
  'through',
  'till',
  'time',
  'told',
  'took',
  'toward',
  'towards',
  'under',
  'until',
  'upon',
  'want',
  'wanted',
  'wasn',
  'well',
  'went',
  'were',
  'weren',
  'what',
  'when',
  'where',
  'whether',
  'which',
  'while',
  'whom',
  'whose',
  'will',
  'with',
  'within',
  'without',
  'won’t',
  'would',
  'wouldn',
  'yes',
  'yet',
  'your',
  'yours',
  'yourself',
  'can’t',
  'don’t',
  'didn’t',
  'wasn’t',
  'i’m',
  'i’ve',
  'i’ll',
  'you’re',
  'you’ll',
  'we’re',
  'it’ll',
  'let’s',
  'isn’t',
  'aren’t',
  'haven’t',
  'hasn’t',
  'couldn’t',
  'wouldn’t',
  'shouldn’t',
  'one',
  'two',
  'first',
  'second',
  'three',
  'four',
  'five',
  'half',
  'enough',
  'turned',
  'turn',
  'felt',
  'feel',
  'seen',
  'saw',
  'heard',
  'hear',
  'asked',
  'ask',
  'tell',
  'right',
  'it’d',
  'can',
  'cannot',
};
