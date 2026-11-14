/// THIS OR THAT: a character's temperament, a quick choice at a time: quiet or loud, planner or improviser, head or
/// heart. Each choice is a trait, kept in their **Core Traits** (one to a line, as a list field keeps them), so the
/// deck and the profile are one: what is already there is where the deck starts, and choosing again puts the other
/// word in its place. Traits not on the deck are left as they are.
///
/// Reads only; `record_look.dart` writes.
library;

/// One choice: a question, and the trait on either side.
typedef TraitAxis = ({String id, String question, String left, String right});

/// The deck, in the order it is dealt.
const traitAxes = <TraitAxis>[
  (id: 'room', question: 'In a crowded room, {name} is…', left: 'Quiet', right: 'Loud'),
  (id: 'plan', question: 'Faced with a journey, {name} is…', left: 'A planner', right: 'An improviser'),
  (id: 'head', question: 'When it matters, {name} follows their…', left: 'Head', right: 'Heart'),
  (id: 'risk', question: 'At the edge of something dangerous, {name} is…', left: 'Cautious', right: 'Bold'),
  (id: 'truth', question: 'When the truth would cost them, {name} is…', left: 'Honest', right: 'A liar'),
  (id: 'grudge', question: 'Wronged, {name} is…', left: 'Forgiving', right: 'Unforgiving'),
  (id: 'lead', question: 'In a group, {name} would rather…', left: 'Lead', right: 'Follow'),
  (id: 'hope', question: 'About tomorrow, {name} is…', left: 'An optimist', right: 'A pessimist'),
  (id: 'trust', question: 'Meeting a stranger, {name} is…', left: 'Trusting', right: 'Suspicious'),
  (id: 'rules', question: 'When the rules are in the way, {name} would…', left: 'Keep them', right: 'Break them'),
  (id: 'fight', question: 'Cornered, {name} would…', left: 'Fight', right: 'Run'),
  (id: 'pride', question: 'About themselves, {name} is…', left: 'Proud', right: 'Humble'),
  (id: 'give', question: 'With what they have, {name} is…', left: 'Generous', right: 'Grasping'),
  (id: 'talk', question: 'In a conversation, {name} is…', left: 'A talker', right: 'A listener'),
  (id: 'hour', question: '{name} is…', left: 'An early riser', right: 'A night owl'),
  (id: 'feel', question: 'What they feel, {name} would rather…', left: 'Show', right: 'Hide'),
];

/// The traits a stored list (one to a line) holds.
List<String> traitsIn(String stored) => [
  for (final t in stored.split(RegExp(r'[\n,]')))
    if (t.trim().isNotEmpty) t.trim(),
];

/// The side each axis is on in [traits]: -1 the left, 1 the right; an axis with neither (or both) is not in it.
Map<String, int> sidesOf(List<String> traits) {
  final lower = {for (final t in traits) t.toLowerCase()};
  return {
    for (final a in traitAxes)
      if (lower.contains(a.left.toLowerCase()) != lower.contains(a.right.toLowerCase()))
        a.id: lower.contains(a.left.toLowerCase()) ? -1 : 1,
  };
}

/// [stored] with the deck's [sides] in it: each axis chosen holds its word and not the other; an axis left unchosen
/// (null) keeps neither of its words; traits not on the deck stay, first, in their order.
String traitsAfter(String stored, Map<String, int?> sides) {
  final deckWords = {
    for (final a in traitAxes) ...[a.left.toLowerCase(), a.right.toLowerCase()],
  };
  final kept = [
    for (final t in traitsIn(stored))
      if (!deckWords.contains(t.toLowerCase())) t,
  ];
  final chosen = [
    for (final a in traitAxes)
      if (sides[a.id] case final s?) s < 0 ? a.left : a.right,
  ];
  return [...kept, ...chosen].join('\n');
}

/// [axis]'s question, asked of [name].
String askOf(TraitAxis axis, String name) => axis.question.replaceAll('{name}', name);
