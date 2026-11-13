/// CHECKED AGAINST YOUR PAGES: a profile says what a character looks like; the chapters say it again, sometimes
/// differently. "Her grey eyes" in the profile, "Mira's blue eyes" in chapter 7: the slip readers write in about. This
/// reads the colour of a character's eyes and hair where the page gives them, and sets it beside the profile.
///
/// Careful about whose eyes they are: a look counts for a character only when the sentence makes it theirs: their
/// name's own ("Wren's grey eyes"), or their name the subject, before any she, he or they, and no other person named
/// between ("Wren pushed back her black hair"). "She looked at Wren with eyes like stones" is not Wren's.
///
/// Reads only.
library;

import 'dart:convert';

import '../manuscript/prose.dart';

/// What is looked for: the eyes, and the hair.
enum Feature {
  eyes('Eyes', ['eyes', 'eye']),
  hair('Hair', ['hair', 'curls', 'locks', 'braid', 'braids', 'plait', 'plaits']);

  const Feature(this.label, this.words);

  /// The field it is recorded as, by default.
  final String label;

  /// The words that name it on the page.
  final List<String> words;

  /// The field names it may be recorded under.
  List<String> get fieldNames => switch (this) {
    Feature.eyes => const ['eyes', 'eye colour', 'eye color', 'eye'],
    Feature.hair => const ['hair', 'hair colour', 'hair color'],
  };
}

/// Colours as the page says them, by family: "grey", "gray", "steel", "silver" are one family.
const _families = <String, List<String>>{
  'black': ['black', 'jet', 'raven', 'ebony', 'inky', 'coal', 'coal-black', 'jet-black', 'pitch'],
  'brown': ['brown', 'chestnut', 'chocolate', 'mousy', 'mousey', 'umber', 'nut-brown', 'walnut', 'tawny'],
  'hazel': ['hazel'],
  'blue': ['blue', 'azure', 'sapphire', 'cobalt', 'cornflower', 'sky-blue', 'ice-blue', 'pale-blue'],
  'green': ['green', 'emerald', 'jade', 'sea-green'],
  'grey': ['grey', 'gray', 'steel', 'steely', 'slate', 'pewter', 'ash', 'ashen', 'storm-grey', 'stormy'],
  'silver': ['silver', 'silvery', 'silvered'],
  'white': ['white', 'snow-white', 'snowy'],
  'amber': ['amber', 'golden', 'gold', 'honey', 'honeyed', 'yellow'],
  'blond': ['blond', 'blonde', 'flaxen', 'fair', 'straw', 'platinum', 'wheaten'],
  'red': ['red', 'ginger', 'auburn', 'copper', 'coppery', 'russet', 'flame', 'fiery', 'scarlet', 'crimson'],
  'violet': ['violet', 'purple', 'lavender', 'amethyst'],
  'dark': ['dark'],
  'pale': ['pale', 'light'],
};

/// Families that do not contradict each other: dark hair may be black or brown; silver, grey and white hair are one
/// age; golden hair is fair.
const _alike = <Set<String>>[
  {'dark', 'black', 'brown'},
  {'silver', 'grey', 'white'},
  {'amber', 'blond'},
  {'hazel', 'brown', 'amber', 'green'},
];

final _colourToFamily = {
  for (final MapEntry(key: family, value: words) in _families.entries)
    for (final w in words) w: family,
};

/// The colour family a word or a recorded value names ("Steel grey" → grey), or null.
String? colourFamily(String text) {
  final words = text.toLowerCase().split(RegExp(r'[^a-z\-]+')).where((w) => w.isNotEmpty).toList();
  // The last colour word is the colour ("pale blue" is blue).
  for (final w in words.reversed) {
    final f = _colourToFamily[w] ?? _colourToFamily[w.split('-').last];
    if (f != null && f != 'pale') return f;
  }
  for (final w in words.reversed) {
    if (_colourToFamily[w] case final f?) return f;
  }
  return null;
}

/// Whether two colour families can be the same thing.
bool sameColour(String a, String b) => a == b || _alike.any((s) => s.contains(a) && s.contains(b));

/// One sighting: the feature, its colour's family and the words for it, where it is (chapter, paragraph), and the
/// sentence that says it.
typedef LookSighting = ({Feature feature, String family, String said, String nodeId, int block, String sentence});

final _sentence = RegExp(r'[^.!?…]+[.!?…]+["”’]*|[^.!?…]+$');
const _pronouns = {'she', 'he', 'they', 'i', 'we', 'you', 'it'};

/// The looks [names] (a character's names) are given in [pages] (each chapter's paragraphs), in reading order
/// [nodeIds]. [others] are every other character's names: a sentence that names one of them between this character's
/// name and the look is not counted.
List<LookSighting> looksIn(
  Map<String, List<String>> pages,
  List<String> nodeIds,
  List<String> names, {
  List<String> others = const [],
}) {
  final wanted = {for (final n in names) n.trim()}.where((n) => n.length >= 2).toList()
    ..sort((a, b) => b.length - a.length);
  if (wanted.isEmpty) return const [];
  final name = RegExp('(?<![\\p{L}])(?:${wanted.map(RegExp.escape).join('|')})(?![\\p{L}])', unicode: true);
  final other = {for (final o in others) o.trim()}.where((o) => o.length >= 2 && !wanted.contains(o)).toList();
  final otherName = other.isEmpty
      ? null
      : RegExp('(?<![\\p{L}])(?:${other.map(RegExp.escape).join('|')})(?![\\p{L}])', unicode: true);
  final out = <LookSighting>[];
  for (final id in nodeIds) {
    final blocks = pages[id];
    if (blocks == null) continue;
    for (final (b, text) in blocks.indexed) {
      for (final s in _sentence.allMatches(text)) {
        final sentence = s[0]!.trim();
        final at = name.firstMatch(sentence);
        if (at == null) continue;
        for (final f in Feature.values) {
          final found = _look(sentence, at.start, at.end, f, otherName);
          if (found != null) {
            out.add((feature: f, family: found.$1, said: found.$2, nodeId: id, block: b, sentence: sentence));
          }
        }
      }
    }
  }
  return out;
}

/// The colour [feature] is given in [sentence], as this character's (whose name runs [start] to [end]): its family
/// and the words, or null.
(String, String)? _look(String sentence, int start, int end, Feature feature, RegExp? otherName) {
  final lower = sentence.toLowerCase();
  final featureWord = RegExp('(?<![a-z])(?:${feature.words.join('|')})(?![a-z])');
  for (final m in featureWord.allMatches(lower)) {
    if (m.start < end) continue; // The look comes after the name.
    final between = lower.substring(end, m.start);
    final possessive = RegExp(r'^[’\x27]s?\b').hasMatch(between);
    // Theirs: the name's own ("Wren's grey eyes"), or the name the subject, with no person between and none before it.
    if (!possessive) {
      final before = lower.substring(0, start);
      final words = RegExp('[a-z]+').allMatches(before).map((w) => w[0]!).toSet();
      if (words.any(_pronouns.contains)) continue;
      if (otherName != null && otherName.hasMatch(sentence.substring(end, m.start))) continue;
      if (!RegExp(r'\b(her|his|their|my)\b').hasMatch(between)) continue;
    }
    // The colour: in the three words before the feature, or after "was"/"were"/"of"/"like" within four after it.
    // Whole words only: not the "s" of "Wren’s".
    final lead = RegExp(
      r"(?<![a-z\-’'])([a-z\-]+)[ ,]+(?:[a-z\-]+[ ,]+){0,2}$",
    ).firstMatch(lower.substring(0, m.start));
    final leading = lead == null ? '' : lower.substring(lead.start, m.start);
    var family = colourFamily(leading);
    // The words as written (the same places in the sentence; lower case keeps them), in the order written.
    final word = sentence.substring(m.start, m.end);
    var said = lead == null ? word : '${sentence.substring(lead.start, m.start).trim()} $word';
    if (family == null) {
      final after = RegExp(
        r'^\s*(?:were|was|are|is|of|like|,)\s+(?:[a-z\-]+\s*){1,5}',
      ).firstMatch(lower.substring(m.end));
      if (after != null) {
        family = colourFamily(after[0]!);
        said = '$word${sentence.substring(m.end, m.end + after.end)}'.trim();
      }
    }
    // From the possessive, when there is one: "her black hair", not "back her black hair".
    said = said.replaceFirst(RegExp(r'^.*?\b(?=(?:her|his|their|my)\b)', caseSensitive: false), '');
    if (family == null || family == 'pale') continue;
    // Red eyes are tears or smoke, and white is their whites: not their colour.
    if (feature == Feature.eyes && (family == 'red' || family == 'white')) continue;
    return (family, said.trim());
  }
  return null;
}

/// What the page and the profile say of one feature: agreeing, at odds, or said only on the page.
enum LookVerdict { agrees, differs, unrecorded }

/// One feature checked: what the profile says (empty when nothing), what the page says (its sightings), and the
/// verdict. [family] is the colour the page gives most.
typedef LookCheck = ({
  Feature feature,
  String recorded,
  String family,
  LookVerdict verdict,
  List<LookSighting> sightings,
});

/// The features [sightings] give, checked against [recorded] (each feature's recorded value, empty when none):
/// a recorded colour the page contradicts, the page's colour where nothing is recorded, or agreement.
List<LookCheck> checkLooks(List<LookSighting> sightings, Map<Feature, String> recorded) {
  final out = <LookCheck>[];
  for (final f in Feature.values) {
    final seen = [
      for (final s in sightings)
        if (s.feature == f) s,
    ];
    if (seen.isEmpty) continue;
    final value = recorded[f]?.trim() ?? '';
    final mine = colourFamily(value);
    if (value.isNotEmpty && mine != null) {
      final against = [
        for (final s in seen)
          if (!sameColour(s.family, mine)) s,
      ];
      out.add((
        feature: f,
        recorded: value,
        family: against.isEmpty ? mine : against.first.family,
        verdict: against.isEmpty ? LookVerdict.agrees : LookVerdict.differs,
        sightings: against.isEmpty ? seen : against,
      ));
      continue;
    }
    if (value.isNotEmpty) continue; // A value the reader cannot place ("like her mother's"): left be.
    final counts = <String, int>{};
    for (final s in seen) {
      counts[s.family] = (counts[s.family] ?? 0) + 1;
    }
    final most = counts.entries.reduce((a, b) => b.value > a.value ? b : a).key;
    out.add((
      feature: f,
      recorded: '',
      family: most,
      verdict: LookVerdict.unrecorded,
      sightings: [
        for (final s in seen)
          if (s.family == most) s,
      ],
    ));
  }
  return out;
}

/// The value to record for [family] on [feature]: "Grey" for eyes, "Black" for hair.
String recordAs(String family) => '${family[0].toUpperCase()}${family.substring(1)}';

/// [looksIn] over the chapters as stored (JSON text, as `NovelStore.rawJsonIn` reads them), as a job for an isolate.
List<LookSighting> Function() looksJob(
  List<String> storedContents,
  List<String> nodeIds,
  List<String> names,
  List<String> others,
) => () {
  final wanted = nodeIds.toSet();
  final pages = <String, List<String>>{};
  for (final json in storedContents) {
    try {
      final row = jsonDecode(json);
      if (row is! Map || !wanted.contains(row['id'])) continue;
      pages['${row['id']}'] = blockTexts(row['doc']);
    } on FormatException {
      continue;
    }
  }
  return looksIn(pages, nodeIds, names, others: others);
};
