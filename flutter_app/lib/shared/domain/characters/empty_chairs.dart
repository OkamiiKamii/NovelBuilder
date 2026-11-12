import '../records/relation.dart';
import 'cast.dart';

/// One empty chair: which part of a story it is, the question it asks about the lead (by name, never a pronoun), and
/// the line a new character's card begins with, after their name, which says so ("…, Wren's rival").
typedef EmptyChair = ({String key, String question, String line});

/// THE EMPTY CHAIRS: the people a story usually has round its lead that this cast does not have yet. Who stands
/// against them (while no one in the cast is an antagonist), who taught them, their rival, a friend, someone they
/// love, their family: each only while the lead has no tie of that kind recorded. Only what is recorded is read; a
/// chair is a question for the author, never a guess about the book.
List<EmptyChair> emptyChairs(Listed lead, List<Listed> cast, Iterable<CharacterRelation> relations) {
  final name = lead.entry.name.trim();
  final first = name.split(RegExp(r'\s+')).first;
  final kinds = <String>{
    for (final r in relations)
      if (r.fromId == lead.entry.id || r.toId == lead.entry.id)
        for (final s in r.stages) s.preset,
  };
  bool has(List<String> any) => any.any(kinds.contains);
  final antagonist = cast.any((l) => l.profile.roles.contains('Antagonist'));
  return [
    if (!antagonist && !has(['enemies']))
      (key: 'against', question: 'Who stands against $first?', line: ', the villain, $name’s enemy'),
    if (!has(['mentor-student'])) (key: 'mentor', question: 'Who taught $first?', line: ', $name’s mentor'),
    if (!has(['rivals'])) (key: 'rival', question: 'Who is $first’s rival?', line: ', $name’s rival'),
    if (!has(['friends', 'allies'])) (key: 'friend', question: 'Who stands with $first?', line: ', $name’s friend'),
    if (!has(['partners', 'spouses'])) (key: 'love', question: 'Who does $first love?', line: ', $name’s lover'),
    if (!has(['siblings', 'parent-child', 'relatives']))
      (key: 'family', question: 'Who is $first’s family?', line: ', $name’s sibling'),
  ];
}

/// Whose story the chairs are set round: the protagonist (the one most in the book when there are several); with
/// none, the one character in the book most. Null when no one is a protagonist and no one is on the page yet.
Listed? chairsLead(List<Listed> cast) {
  int bySeen(Listed a, Listed b) => b.seenIn.length.compareTo(a.seenIn.length);
  final leads = [
    for (final l in cast)
      if (l.profile.roles.contains('Protagonist')) l,
  ]..sort(bySeen);
  if (leads.isNotEmpty) return leads.first;
  final seen = [
    for (final l in cast)
      if (l.seenIn.isNotEmpty) l,
  ]..sort(bySeen);
  return seen.firstOrNull;
}
