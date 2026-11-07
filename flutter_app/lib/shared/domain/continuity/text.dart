import '../json.dart';
import 'rules.dart';

/// READING THE MANUSCRIPT FOR THE CONTINUITY CHECK (as in the original app). Words are matched, never understood:
/// every finding built on these says "appears to".

class Paragraph {
  Paragraph(this.index);

  /// Paragraph number, counted the way the editor and search count it.
  final int index;
  String text = '';

  /// Words linked to a codex entry in this paragraph.
  final List<({String entryId, String text})> links = [];
}

/// The paragraphs and headings of a saved document, with the entity links inside each. Reads only.
List<Paragraph> paragraphsOf(Object? doc) {
  final out = <Paragraph>[];
  void walk(JsonMap? node) {
    if (node == null) return;
    final type = node['type'];
    if (type == 'paragraph' || type == 'heading') {
      final paragraph = Paragraph(out.length);
      void inline(Object? nodes) {
        for (final child in maps(nodes)) {
          if (child['type'] == 'text') {
            final text = str(child['text']);
            paragraph.text += text;
            for (final mark in maps(child['marks'])) {
              final id = mapOrNull(mark['attrs'])?['entryId'];
              if (mark['type'] != 'entityLink' || id is! String) continue;
              final last = paragraph.links.lastOrNull;
              // A link split by formatting is still one link.
              if (last != null && last.entryId == id && paragraph.text.endsWith(last.text + text)) {
                paragraph.links[paragraph.links.length - 1] = (entryId: id, text: last.text + text);
              } else {
                paragraph.links.add((entryId: id, text: text));
              }
            }
          } else if (child['type'] == 'hardBreak') {
            paragraph.text += '\n';
          } else {
            inline(child['content']);
          }
        }
      }

      inline(node['content']);
      out.add(paragraph);
    } else {
      for (final child in maps(node['content'])) {
        walk(child);
      }
    }
  }

  walk(mapOrNull(doc));
  return out;
}

const _before = r'(?<![\p{L}\p{N}])';
const _after = r'(?![\p{L}\p{N}])';

typedef Found = ({int index, String text});

/// Every place one of [terms] appears as whole words. Names are matched as written; set [loose] for ordinary words.
List<Found> findWords(String text, List<String> terms, {bool loose = false}) {
  final wanted = {
    for (final t in terms)
      if (t.trim().isNotEmpty) t.trim(),
  }.toList()..sort((a, b) => b.length - a.length);
  if (wanted.isEmpty) return const [];
  final pattern = RegExp(
    '$_before(?:${wanted.map(RegExp.escape).join('|')})$_after',
    unicode: true,
    caseSensitive: !loose,
  );
  return [for (final m in pattern.allMatches(text)) (index: m.start, text: m[0]!)];
}

final _sentenceBreak = RegExp(
  r'(?<=[.!?…]["”’'
  "'"
  r']?)\s+',
  unicode: true,
);
List<String> sentencesOf(String text) => [
  for (final s in text.split(_sentenceBreak))
    if (s.trim().isNotEmpty) s,
];

const _speech =
    'said|says|asked|asks|replied|replies|answered|answers|shouted|whispered|muttered|murmured|called|cried|snapped|'
    'growled|hissed|added|continued|agreed|laughed';
const _acts =
    '$_speech|smiled|grinned|nodded|shrugged|sighed|frowned|walked|ran|stepped|stood|sat|turned|looked|glanced|stared|'
    'drew|grabbed|took|reached|opened|closed|entered|left|arrived|came|went|fought|struck|spoke|speaks|waved|pointed|'
    'leaned|raised|lifted|pulled|pushed|kicked|jumped|knelt|bowed|smiles|nods|walks|runs|steps|stands|sits|turns|looks|'
    'draws|grabs|takes|reaches|opens|enters|leaves|arrives|comes|goes|fights|strikes';
final _actsAfter = RegExp(
  r'^,?\s+(?:(?:\p{L}+ly|then|just|only|also|still|now|suddenly)\s+)?(?:'
  '$_acts)$_after',
  unicode: true,
);
final _speechBefore = RegExp('$_before(?:$_speech)\\s+\$', unicode: true);

String _slice(String text, int start, int end) =>
    text.substring(start.clamp(0, text.length), end.clamp(0, text.length));

/// Whether a name at this place in the text is doing or saying something: "Mira smiled", "Mira quietly said", "said
/// Mira". "Mira had said" and "they spoke of Mira" are not, which is how the dead are usually written.
bool isActing(String text, Found at) =>
    _actsAfter.hasMatch(_slice(text, at.index + at.text.length, at.index + at.text.length + 40)) ||
    _speechBefore.hasMatch(_slice(text, at.index - 20, at.index));

const _uses =
    'drew|draws|drawing|wielded|wields|wielding|swung|swings|swinging|raised|raises|raising|unsheathed|unsheathes|'
    'gripped|grips|gripping|held|holds|holding|carried|carries|carrying|used|uses|using|brandished|brandishes|lifted|'
    'lifts|fired|fires|wore|wears|wearing|opened|opens|drank|drinks|read|reads|sheathed|pocketed|handed|threw|throws|'
    'clutched|clutching';
final _usedBefore = RegExp(
  '$_before(?:$_uses)'
  r"\s+(?:(?:the|his|her|their|its|my|our|your|a|an|that|this)\s+)?(?:[\p{L}'’-]+\s+){0,2}$",
  unicode: true,
  caseSensitive: false,
);
final _inHandAfter = RegExp(
  r'^\s+(?:in|into)\s+(?:his|her|their|my|its|one|both)\s+(?:hands?|grip|fist)',
  unicode: true,
  caseSensitive: false,
);

/// Whether an item named at this place is being handled: "drew the Sunblade", "the Sunblade in her hand".
bool isUsed(String text, Found at) =>
    _usedBefore.hasMatch(_slice(text, at.index - 60, at.index)) ||
    _inHandAfter.hasMatch(_slice(text, at.index + at.text.length, at.index + at.text.length + 30));

const _numberWords = {
  'a': 1, 'an': 1, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8, //
  'nine': 9, 'ten': 10, 'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15, 'sixteen': 16,
  'seventeen': 17, 'eighteen': 18, 'nineteen': 19, 'twenty': 20, 'thirty': 30, 'forty': 40, 'fifty': 50, //
  'sixty': 60, 'seventy': 70, 'eighty': 80, 'ninety': 90, 'hundred': 100,
};
final _wordNumber =
    '(?:${_numberWords.keys.where((w) => w.length > 2).join('|')})(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?';

/// "19", "nineteen", "twenty-two". Null for anything else.
double? toNumber(String text) {
  final clean = text.trim().toLowerCase();
  if (RegExp(r'^\d+(?:\.\d+)?$').hasMatch(clean)) return double.parse(clean);
  final parts = clean.split(RegExp('[- ]'));
  if (!parts.every(_numberWords.containsKey)) return null;
  return parts.fold<double>(0, (sum, p) => sum + _numberWords[p]!);
}

typedef StatedDuration = ({double amount, String unit, double hours, String text});

final _duration = RegExp(
  '$_before(half an?|\\d+(?:\\.\\d+)?|an?|$_wordNumber)[\\s-]+(minute|hour|day|week|month)s?$_after',
  unicode: true,
  caseSensitive: false,
);

/// Lengths of time stated in a passage: "two hours", "3 days", "half an hour", "a week".
List<StatedDuration> durationsIn(String text) => [
  for (final m in _duration.allMatches(text))
    if ((RegExp('^half', caseSensitive: false).hasMatch(m[1]!) ? 0.5 : toNumber(m[1]!)) case final amount?)
      (
        amount: amount,
        unit: '${m[2]!.toLowerCase()}s',
        hours: amount * hoursIn['${m[2]!.toLowerCase()}s']!,
        text: m[0]!,
      ),
];

const travelWords = [
  'travel', 'travelled', 'traveled', 'travelling', 'journey', 'journeyed', 'rode', 'ride', 'riding', 'walk', //
  'walked', 'sailed', 'sail', 'voyage', 'trip', 'reached', 'arrived', 'flew', 'flight', 'marched', 'march', 'trek',
  'trekked', 'drove', 'crossing', 'crossed', 'road',
];

/// "3 days", "1 hour", as the check words a length of time.
String formatRuleDuration(double amount, String unit) =>
    '${_js(amount)} ${amount == 1 ? unit.substring(0, unit.length - 1) : unit}';

String _js(double v) => v == v.truncateToDouble() ? v.toInt().toString() : '$v';

const _colours = {
  'blue': 'blue', 'green': 'green', 'brown': 'brown', 'grey': 'grey', 'gray': 'grey', 'black': 'black', //
  'hazel': 'hazel', 'amber': 'amber', 'violet': 'violet', 'red': 'red', 'golden': 'golden', 'gold': 'golden',
  'silver': 'silver', 'white': 'white', 'blond': 'blonde', 'blonde': 'blonde', 'auburn': 'auburn', //
  'copper': 'copper', 'chestnut': 'chestnut', 'purple': 'purple', 'yellow': 'yellow', 'pink': 'pink',
  'orange': 'orange',
};
final _colour = _colours.keys.join('|');

/// The colours named in a piece of text, with spelling variants folded together ("gray" is "grey").
List<String> coloursIn(String text) =>
    {for (final f in findWords(text, _colours.keys.toList(), loose: true)) _colours[f.text.toLowerCase()]!}.toList();

/// The colour a sentence gives to someone's eyes or hair: "her grey eyes", "Alex's hair was black".
Found? colourOf(String sentence, String feature, List<String> names) {
  final owner = "(?:${names.map(RegExp.escape).join('|')})['’]s|his|her|their|whose";
  final before = RegExp(
    '$_before(?:$owner)\\s+(?:[\\p{L}-]+,?\\s+){0,2}?($_colour)(?:[\\s-]+[\\p{L}-]+)?\\s+$feature$_after',
    unicode: true,
    caseSensitive: false,
  ).firstMatch(sentence);
  final after = RegExp(
    '$_before(?:$owner)\\s+$feature\\s+(?:were|was|are|is)\\s+(?:[\\p{L}-]+\\s+)?($_colour)$_after',
    unicode: true,
    caseSensitive: false,
  ).firstMatch(sentence);
  final hit = before ?? after;
  return hit == null ? null : (index: hit.start, text: hit[0]!);
}

/// The age a sentence gives for one of [names]: "Alex was nineteen years old", "nineteen-year-old Alex", "Alex, 19,".
({double age, String text})? ageOf(String sentence, List<String> names) {
  final name = '(?:${names.map(RegExp.escape).join('|')})';
  final number = '(\\d{1,3}|$_wordNumber)';
  final patterns = [
    RegExp(
      '$_before$name\\s+(?:was|is|had just turned|had turned|turned|turns)\\s+(?:only\\s+|just\\s+|now\\s+|barely\\s+)?'
      '$number\\s+years?[\\s-]+old',
      unicode: true,
    ),
    RegExp(
      '$_before$name\\s+(?:was|is|had just turned|had turned|turned|turns)\\s+(?:only\\s+|just\\s+|now\\s+|barely\\s+)?'
      '(\\d{1,3})(?=[.,;!?]|\\s+(?:and|when|then|but)\\b|\$)',
      unicode: true,
    ),
    RegExp('$_before$number[\\s-]+years?[\\s-]+old\\s+$name$_after', unicode: true, caseSensitive: false),
    RegExp('$_before$name,\\s+(?:aged?\\s+)?(\\d{1,3}),', unicode: true),
  ];
  for (final pattern in patterns) {
    final hit = pattern.firstMatch(sentence);
    final age = hit == null ? null : toNumber(hit[1]!);
    if (hit != null && age != null && age < 1000) return (age: age, text: hit[0]!);
  }
  return null;
}

/// A short, stable fingerprint of a passage. The same words give the same value on every run (FNV-1a, as the
/// original).
String fingerprint(String text) {
  var hash = 0x811c9dc5;
  for (final rune in text.toLowerCase().replaceAll(RegExp(r'\s+'), ' ').trim().runes) {
    hash = (hash ^ rune) & 0xffffffff;
    hash = (hash * 0x01000193) & 0xffffffff;
  }
  return hash.toRadixString(36);
}

/// Keeps an excerpt readable: the sentence around the match, trimmed to a sensible length.
String excerptAround(String text, int at, [int length = 220]) {
  if (text.length <= length) return text;
  final start = (at - length ~/ 3).clamp(0, text.length - length);
  final cut = text.substring(start, start + length).trim();
  return '${start > 0 ? '…' : ''}$cut${start + length < text.length ? '…' : ''}';
}
