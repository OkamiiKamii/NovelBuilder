/// IN ONE SENTENCE: a character's logline, the sentence writers pitch a character in, made from their profile: who they
/// are, what they want, what is in their way, what they would lose. "Mark, 21, a locksmith's apprentice, wants to open
/// the last door, but the Architect stands in his way. If he fails, he loses his sister." What the profile does not say
/// is left as a gap to fill, never guessed; each gap is one field of the profile.
///
/// Reads only.
library;

import 'stakes.dart';

/// A part of the sentence that comes from the profile, and so can be a gap.
enum LoglinePart { who, wants, inTheWay, atStake }

/// A piece of the sentence: plain words, or a part (filled, or a gap with what it asks for).
typedef LoglinePiece = ({String text, LoglinePart? part, bool gap});

/// The fields that say who someone is, beside the title they go by.
const whoFields = ['occupation', 'job', 'profession', 'trade'];

/// The pronouns for a profile's gender: he, his; she, her; else they, their.
({String they, String their, String fails}) pronounsFor(String gender) => switch (gender.trim().toLowerCase()) {
  'male' || 'man' || 'm' || 'boy' => (they: 'he', their: 'his', fails: 'fails'),
  'female' || 'woman' || 'f' || 'girl' => (they: 'she', their: 'her', fails: 'fails'),
  _ => (they: 'they', their: 'their', fails: 'fail'),
};

/// The sentence for [name], from what their profile says: [age] (left out when blank), [who] (their title or trade),
/// and their [stakes]; the pronouns from [gender]. A part the profile does not give is a gap.
List<LoglinePiece> loglineOf({
  required String name,
  required String age,
  required String gender,
  required String who,
  required Map<Stake, String> stakes,
}) {
  final p = pronounsFor(gender);
  LoglinePiece words(String text) => (text: text, part: null, gap: false);
  LoglinePiece part(LoglinePart part, String value, String ask) =>
      value.trim().isEmpty ? (text: ask, part: part, gap: true) : (text: inSentence(value), part: part, gap: false);
  return [
    words(age.trim().isEmpty ? '$name, ' : '$name, ${age.trim()}, '),
    part(LoglinePart.who, who, 'who ${p.they} ${p.they == 'they' ? 'are' : 'is'}'),
    words(', wants '),
    part(LoglinePart.wants, stakes[Stake.wants] ?? '', 'what ${p.they} ${p.they == 'they' ? 'want' : 'wants'}'),
    words(', but '),
    part(LoglinePart.inTheWay, stakes[Stake.inTheWay] ?? '', 'what is in the way'),
    words(' stands in ${p.their} way. If ${p.they} ${p.fails}, ${p.they} ${p.they == 'they' ? 'lose' : 'loses'} '),
    part(LoglinePart.atStake, stakes[Stake.atStake] ?? '', 'what is at stake'),
    words('.'),
  ];
}

/// The sentence as plain text, when it has no gaps; else null.
String? loglineText(List<LoglinePiece> pieces) =>
    pieces.any((p) => p.gap) ? null : pieces.map((p) => p.text).join().replaceAll(RegExp(r'\s+'), ' ').trim();

const _lowered = {'the', 'a', 'an', 'to', 'his', 'her', 'their', 'its', 'my', 'being', 'that', 'what', 'how', 'some'};

/// An answer as it reads inside the sentence: one line, its last stop dropped, and its first word in lower case when
/// it is an ordinary word ("To open the last door." reads "to open the last door"; "Revenge on his father" reads
/// "revenge on his father"), but not a name ("Kai's betrayal", "Old Tam").
String inSentence(String value) {
  var t = value.trim().replaceAll(RegExp(r'\s+'), ' ');
  t = t.replaceFirst(RegExp(r'[.;!]+$'), '');
  final words = t.split(' ');
  if (words.isEmpty || words.first.isEmpty) return t;
  final first = words.first;
  final second = words.length > 1 ? words[1] : '';
  final ordinary =
      _lowered.contains(first.toLowerCase()) ||
      (second.isNotEmpty && second[0] == second[0].toLowerCase() && !first.contains(RegExp(r"[’']s$")));
  // An acronym ("NASA") keeps its capitals; "A" is the article.
  final acronym = first.length > 1 && first.toUpperCase() == first;
  if (!ordinary || acronym || (first.length < 2 && !_lowered.contains(first.toLowerCase()))) return t;
  return '${first[0].toLowerCase()}${first.substring(1)}${t.substring(first.length)}';
}
