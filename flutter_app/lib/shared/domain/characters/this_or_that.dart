/// THIS OR THAT: a character's temperament, a quick choice at a time: quiet or loud, planner or improviser, head or
/// heart. Each choice is a trait, kept in their **Core Traits** (one to a line, as a list field keeps them), so the
/// deck and the profile are one: what is already there is where the deck starts, and choosing again puts the other
/// word in its place. Traits not on the deck are left as they are.
///
/// A choice is pressed by what it says ("Heart", "Break them"), and kept as the trait it makes them ("Emotional",
/// "Rebellious"): a profile's traits are traits. What an earlier deck kept (the words pressed) is still read as the
/// choice, and becomes the trait when the deck is next saved.
///
/// Reads only; `record_look.dart` writes.
library;

/// One choice: a question, what either side says, and the trait either side keeps.
typedef TraitAxis = ({String id, String question, String left, String right, String leftTrait, String rightTrait});

/// The deck, in the order it is dealt.
const traitAxes = <TraitAxis>[
  (
    id: 'room',
    question: 'In a crowded room, {name} is…',
    left: 'Quiet',
    right: 'Loud',
    leftTrait: 'Quiet',
    rightTrait: 'Loud',
  ),
  (
    id: 'plan',
    question: 'Faced with a journey, {name} is…',
    left: 'A planner',
    right: 'An improviser',
    leftTrait: 'Methodical',
    rightTrait: 'Spontaneous',
  ),
  (
    id: 'head',
    question: 'When it matters, {name} follows their…',
    left: 'Head',
    right: 'Heart',
    leftTrait: 'Rational',
    rightTrait: 'Emotional',
  ),
  (
    id: 'risk',
    question: 'At the edge of something dangerous, {name} is…',
    left: 'Cautious',
    right: 'Bold',
    leftTrait: 'Cautious',
    rightTrait: 'Bold',
  ),
  (
    id: 'truth',
    question: 'When the truth would cost them, {name} is…',
    left: 'Honest',
    right: 'A liar',
    leftTrait: 'Honest',
    rightTrait: 'Deceitful',
  ),
  (
    id: 'grudge',
    question: 'Wronged, {name} is…',
    left: 'Forgiving',
    right: 'Unforgiving',
    leftTrait: 'Forgiving',
    rightTrait: 'Unforgiving',
  ),
  (
    id: 'lead',
    question: 'In a group, {name} would rather…',
    left: 'Lead',
    right: 'Follow',
    leftTrait: 'Commanding',
    rightTrait: 'Deferential',
  ),
  (
    id: 'hope',
    question: 'About tomorrow, {name} is…',
    left: 'An optimist',
    right: 'A pessimist',
    leftTrait: 'Optimistic',
    rightTrait: 'Pessimistic',
  ),
  (
    id: 'trust',
    question: 'Meeting a stranger, {name} is…',
    left: 'Trusting',
    right: 'Suspicious',
    leftTrait: 'Trusting',
    rightTrait: 'Suspicious',
  ),
  (
    id: 'rules',
    question: 'When the rules are in the way, {name} would…',
    left: 'Keep them',
    right: 'Break them',
    leftTrait: 'Law-abiding',
    rightTrait: 'Rebellious',
  ),
  (
    id: 'fight',
    question: 'Cornered, {name} would…',
    left: 'Fight',
    right: 'Run',
    leftTrait: 'Combative',
    rightTrait: 'Evasive',
  ),
  (
    id: 'pride',
    question: 'About themselves, {name} is…',
    left: 'Proud',
    right: 'Humble',
    leftTrait: 'Proud',
    rightTrait: 'Humble',
  ),
  (
    id: 'give',
    question: 'With what they have, {name} is…',
    left: 'Generous',
    right: 'Grasping',
    leftTrait: 'Generous',
    rightTrait: 'Grasping',
  ),
  (
    id: 'talk',
    question: 'In a conversation, {name} is…',
    left: 'A talker',
    right: 'A listener',
    leftTrait: 'Talkative',
    rightTrait: 'Attentive',
  ),
  (
    id: 'hour',
    question: '{name} is…',
    left: 'An early riser',
    right: 'A night owl',
    leftTrait: 'An early riser',
    rightTrait: 'A night owl',
  ),
  (
    id: 'feel',
    question: 'What they feel, {name} would rather…',
    left: 'Show',
    right: 'Hide',
    leftTrait: 'Expressive',
    rightTrait: 'Reserved',
  ),
];

/// The traits a stored list (one to a line) holds.
List<String> traitsIn(String stored) => [
  for (final t in stored.split(RegExp(r'[\n,]')))
    if (t.trim().isNotEmpty) t.trim(),
];

/// The words that put an axis on its left side, and on its right: the trait kept, and what an earlier deck kept.
({Set<String> left, Set<String> right}) _wordsOf(TraitAxis a) => (
  left: {a.leftTrait.toLowerCase(), a.left.toLowerCase()},
  right: {a.rightTrait.toLowerCase(), a.right.toLowerCase()},
);

/// The side each axis is on in [traits]: -1 the left, 1 the right; an axis with neither (or both) is not in it.
Map<String, int> sidesOf(List<String> traits) {
  final lower = {for (final t in traits) t.toLowerCase()};
  return {
    for (final a in traitAxes)
      if (_wordsOf(a) case (left: final l, right: final r) when lower.any(l.contains) != lower.any(r.contains))
        a.id: lower.any(l.contains) ? -1 : 1,
  };
}

/// [stored] with the deck's [sides] in it: each axis chosen holds its trait and not the other (nor what an earlier deck
/// kept for either); an axis left unchosen (null) keeps neither; traits not on the deck stay, first, in their order.
String traitsAfter(String stored, Map<String, int?> sides) {
  final deckWords = {for (final a in traitAxes) ..._wordsOf(a).left, for (final a in traitAxes) ..._wordsOf(a).right};
  final kept = [
    for (final t in traitsIn(stored))
      if (!deckWords.contains(t.toLowerCase())) t,
  ];
  final chosen = [
    for (final a in traitAxes)
      if (sides[a.id] case final s?) s < 0 ? a.leftTrait : a.rightTrait,
  ];
  return [...kept, ...chosen].join('\n');
}

/// [axis]'s question, asked of [name].
String askOf(TraitAxis axis, String name) => axis.question.replaceAll('{name}', name);
