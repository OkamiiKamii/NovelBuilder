/// THE STAKES: what drives a cast, read from the profiles. Every layout asks it in its own words ("What they want",
/// "Initial Goals", "Motivations"; "What stands in the way", "External Conflict"; "Intended Resolution", "How they
/// change, if they do"), and here they are one question each: what they **want**, what they **need**, what **stands in
/// the way**, what is **at stake**, and how they **end**. And where the wants of two of them **collide**: one wants
/// what names the other, or both want the same thing.
///
/// Reads only.
library;

/// A question every character's profile answers, or does not yet.
enum Stake {
  wants('Wants', 'What they want', ['what they want', 'initial goals', 'goals', 'goal', 'want', 'wants', 'desires']),
  needs('Needs', 'What they need', ['what they need', 'need', 'needs']),
  inTheWay('In the way', 'What stands in the way', [
    'what stands in the way',
    'obstacles',
    'obstacle',
    'external conflict',
    'internal conflict',
    'internal conflicts',
  ]),
  atStake('At stake', 'What they stand to lose', ['what they stand to lose', 'stakes', 'at stake']),
  ends('Ends', 'Intended Resolution', [
    'intended resolution',
    'how they change, if they do',
    'what would make them stop',
    'resolution',
    'ending',
  ]);

  const Stake(this.label, this.field, this.fieldNames);

  /// What it is called on the board.
  final String label;

  /// The field it is written in when the profile has none of [fieldNames].
  final String field;

  /// The fields that answer it, in lower case, the first written answering.
  final List<String> fieldNames;

  /// The question, of [name].
  String ask(String name) => switch (this) {
    Stake.wants => 'What does $name want?',
    Stake.needs => 'What does $name need, without knowing it?',
    Stake.inTheWay => 'What stands in $name’s way?',
    Stake.atStake => 'What could $name lose?',
    Stake.ends => 'Where does $name end?',
  };
}

/// The stakes [fields] (each field's name in lower case, and its value) answer, by question; and the motivation, when
/// nothing answers what they want ("Motivations").
Map<Stake, String> stakesOf(Map<String, String> fields) {
  final out = <Stake, String>{};
  for (final s in Stake.values) {
    for (final n in s.fieldNames) {
      final v = fields[n]?.trim() ?? '';
      if (v.isNotEmpty) {
        out[s] = v;
        break;
      }
    }
  }
  if (!out.containsKey(Stake.wants)) {
    final m = fields['motivations']?.trim() ?? '';
    if (m.isNotEmpty) out[Stake.wants] = m;
  }
  return out;
}

/// The stakes that make the board: what they want, what is in the way, what is at stake, how they end.
const boardStakes = [Stake.wants, Stake.inTheWay, Stake.atStake, Stake.ends];

/// One of the cast, for finding where wants collide: their id, name, every name they go by, and their stakes.
typedef StakeHolder = ({String id, String name, List<String> names, Map<Stake, String> stakes});

/// Two whose wants collide, and why, in words.
typedef Collision = ({String a, String b, String why});

const _stop = {
  'that', 'this', 'with', 'from', 'they', 'them', 'their', 'what', 'when', 'where', 'which', 'would', 'could', //
  'should', 'about', 'into', 'over', 'have', 'been', 'being', 'make', 'made', 'keep', 'kept', 'want', 'wants', //
  'wanted', 'more', 'most', 'some', 'only', 'never', 'ever', 'once', 'again', 'there', 'here', 'than', 'then', //
  'like', 'just', 'also', 'even', 'still', 'other', 'others', 'every', 'each', 'own', 'your', 'yours', 'whom', //
  'whose', 'will', 'shall', 'must', 'very', 'much', 'many', 'such', 'after', 'before', 'without', 'within', //
  'because', 'while', 'until', 'know', 'knows', 'find', 'finds', 'take', 'takes', 'give', 'gives', 'come', 'back', //
  'something', 'anything', 'nothing', 'everything', 'someone', 'anyone', 'everyone', 'people', 'place', 'thing', //
  'things', 'world',
};

List<String> _words(String text) => [
  for (final m in RegExp(r'[\p{L}’\x27]+', unicode: true).allMatches(text.toLowerCase()))
    m[0]!.replaceAll(RegExp(r'[’\x27]s?$'), ''),
];

bool _names(String text, List<String> names) => names.any(
  (n) =>
      n.trim().length >= 2 &&
      RegExp('(?<![\\p{L}])${RegExp.escape(n.trim())}(?![\\p{L}])', unicode: true, caseSensitive: false).hasMatch(text),
);

/// Where the wants of [cast] collide, the strongest first, at most [most]: one's want (or what stands in their way)
/// names the other; or both want something called the same ("the chart" and "the chart"), a word of five letters
/// or more that is not a common one, alike in its first five letters.
List<Collision> collisions(List<StakeHolder> cast, {int most = 4}) {
  final named = <Collision>[];
  final shared = <Collision>[];
  final seen = <String>{};
  for (var i = 0; i < cast.length; i++) {
    for (var j = 0; j < cast.length; j++) {
      if (i == j) continue;
      final a = cast[i];
      final b = cast[j];
      final pair = ([a.id, b.id]..sort()).join('|');
      if (seen.contains(pair)) continue;
      final aWants = a.stakes[Stake.wants] ?? '';
      final aWay = a.stakes[Stake.inTheWay] ?? '';
      if (_names(aWants, b.names)) {
        named.add((a: a.id, b: b.id, why: '${a.name}’s want names ${b.name}'));
        seen.add(pair);
      } else if (_names(aWay, b.names)) {
        named.add((a: a.id, b: b.id, why: '${b.name} stands in ${a.name}’s way'));
        seen.add(pair);
      }
    }
  }
  for (var i = 0; i < cast.length; i++) {
    for (var j = i + 1; j < cast.length; j++) {
      final a = cast[i];
      final b = cast[j];
      final pair = ([a.id, b.id]..sort()).join('|');
      if (seen.contains(pair)) continue;
      final wa = {
        for (final w in _words(a.stakes[Stake.wants] ?? ''))
          if (w.length >= 5 && !_stop.contains(w)) w,
      };
      final wb = _words(b.stakes[Stake.wants] ?? '');
      String? common;
      for (final w in wb) {
        if (w.length < 5 || _stop.contains(w)) continue;
        if (wa.any((x) => x.substring(0, 5) == w.substring(0, 5))) {
          common = w;
          break;
        }
      }
      if (common != null) {
        shared.add((a: a.id, b: b.id, why: 'Both want “$common”'));
        seen.add(pair);
      }
    }
  }
  return [...named, ...shared].take(most).toList();
}
