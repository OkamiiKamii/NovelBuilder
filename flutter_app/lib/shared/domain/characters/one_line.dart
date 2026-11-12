/// A CHARACTER IN A LINE: who someone is, as an author jots it ("Mira Vance, 34, a smuggler from Glass River, Kai's
/// sister"), read into what the profile records. Only what the words plainly say, and nothing guessed:
///
/// - the **name**: what comes before the first comma;
/// - an **age**: "34", "aged 34", "34 years old";
/// - a **gender**: woman, man, girl, boy, lady, female, male;
/// - a **species**: elf, dwarf, orc, vampire, android… (a word of a known list);
/// - a **role**: protagonist, hero or heroine; antagonist or villain;
/// - an **epithet**: "called the Fox", "known as the Fox";
/// - an **occupation** and where they are **from**: "a smuggler from Glass River", or "from Glass River" alone;
/// - **ties** to someone already in the cast: "Kai's sister", "Ilse's apprentice", each with who is which;
/// - and anything else, as it was written, for the summary.
library;

/// A tie the line names: to whom (an id of the cast), the kind (a relationship preset), whether the new character is
/// the first of a pair that has a direction (the parent, the mentor), and the words that said so.
typedef LineTie = ({String otherId, String otherName, String preset, bool newIsFrom, String said});

typedef OneLine = ({
  String name,
  String age,
  String gender,
  String species,
  String occupation,
  String origin,
  String role,
  String epithet,
  List<LineTie> ties,
  String summary,
});

const _species = {
  'human',
  'elf',
  'elven',
  'half-elf',
  'dwarf',
  'orc',
  'half-orc',
  'goblin',
  'halfling',
  'hobbit',
  'gnome',
  'troll',
  'ogre',
  'giant',
  'vampire',
  'werewolf',
  'dragon',
  'fae',
  'faerie',
  'fairy',
  'demon',
  'angel',
  'ghost',
  'witch',
  'android',
  'robot',
  'cyborg',
  'alien',
  'mermaid',
  'merman',
  'centaur',
  'nymph',
  'spirit',
  'golem',
  'undead',
};

const _women = {
  'woman',
  'girl',
  'lady',
  'female',
  'heroine',
  'queen',
  'princess',
  'mother',
  'wife',
  'widow',
  'sister',
  'daughter',
  'aunt',
  'niece',
  'mistress',
};
const _men = {
  'man',
  'boy',
  'gentleman',
  'male',
  'king',
  'prince',
  'widower',
  'brother',
  'son',
  'father',
  'husband',
  'uncle',
  'nephew',
};

/// A tie's word, what kind of tie it is, and whether the one named first ("Kai's") is the first of the pair.
const _ties = <String, (String, bool)>{
  'sister': ('siblings', false),
  'brother': ('siblings', false),
  'sibling': ('siblings', false),
  'twin': ('siblings', false),
  'cousin': ('relatives', false),
  'aunt': ('relatives', false),
  'uncle': ('relatives', false),
  'niece': ('relatives', false),
  'nephew': ('relatives', false),
  'mother': ('parent-child', false),
  'father': ('parent-child', false),
  'parent': ('parent-child', false),
  'son': ('parent-child', true),
  'daughter': ('parent-child', true),
  'child': ('parent-child', true),
  'wife': ('spouses', false),
  'husband': ('spouses', false),
  'spouse': ('spouses', false),
  'friend': ('friends', false),
  'ally': ('allies', false),
  'rival': ('rivals', false),
  'enemy': ('enemies', false),
  'nemesis': ('enemies', false),
  'lover': ('partners', false),
  'partner': ('partners', false),
  'mentor': ('mentor-student', false),
  'teacher': ('mentor-student', false),
  'master': ('master-servant', false),
  'student': ('mentor-student', true),
  'apprentice': ('mentor-student', true),
  'pupil': ('mentor-student', true),
  'servant': ('master-servant', true),
  'employer': ('employer-employee', false),
  'boss': ('employer-employee', false),
  'employee': ('employer-employee', true),
};

final _tie = RegExp(
  r"(\p{Lu}[\p{L}'’-]*(?:\s+\p{Lu}[\p{L}'’-]*)*)['’]s\s+(" + _ties.keys.join('|') + r')\b',
  unicode: true,
  caseSensitive: false,
);
final _age = RegExp(r'^(?:aged\s+)?(\d{1,3})(?:\s*(?:years?|yrs?)(?:\s+old)?)?$', caseSensitive: false);
final _ageIn = RegExp(r'\b(\d{1,3})\s*(?:years?|yrs?)\s+old\b|\baged\s+(\d{1,3})\b', caseSensitive: false);
final _called = RegExp(r'^(?:called|known as|nicknamed|named)\s+(.+)$', caseSensitive: false);
final _what = RegExp(r'^(?:an?|the)\s+(.+?)(?:\s+(?:from|of)\s+(\p{Lu}.*))?$', unicode: true, caseSensitive: false);
final _from = RegExp(r'^(?:from|born in|of)\s+(\p{Lu}.*)$', unicode: true);
final _word = RegExp(r"[\p{L}'’-]+", unicode: true);

/// Reads [line] into a character. [cast] are the characters already in the novel (id and name), for ties.
OneLine readOneLine(String line, {List<({String id, String name})> cast = const []}) {
  final parts = [
    for (final p in line.split(RegExp(r'[,;]|\s+[—–-]\s+')))
      if (p.trim().isNotEmpty) p.trim(),
  ];
  var name = parts.isEmpty ? '' : parts.first;
  var age = '';
  var gender = '';
  var species = '';
  var occupation = '';
  var origin = '';
  var role = '';
  var epithet = '';
  final ties = <LineTie>[];
  final rest = <String>[];

  String? castId(String said) {
    final s = said.trim().toLowerCase();
    final whole = cast.where((c) => c.name.toLowerCase() == s).toList();
    if (whole.length == 1) return whole.single.id;
    // A part of a name that is one character's alone ("Kai" for Kai Doyle).
    final part = cast.where((c) => c.name.toLowerCase().split(RegExp(r'\s+')).contains(s)).toList();
    return part.length == 1 ? part.single.id : null;
  }

  void words(String text) {
    for (final m in _word.allMatches(text)) {
      final w = m[0]!.toLowerCase();
      if (gender.isEmpty && _women.contains(w)) gender = 'Female';
      if (gender.isEmpty && _men.contains(w)) gender = 'Male';
      if (species.isEmpty && _species.contains(w)) species = w[0].toUpperCase() + w.substring(1);
      if (role.isEmpty && (w == 'protagonist' || w == 'hero' || w == 'heroine')) role = 'Protagonist';
      if (role.isEmpty && (w == 'antagonist' || w == 'villain')) role = 'Antagonist';
    }
  }

  for (final part in parts.skip(1)) {
    var used = false;
    for (final m in _tie.allMatches(part)) {
      final id = castId(m[1]!);
      if (id == null) continue;
      final (preset, namedFirst) = _ties[m[2]!.toLowerCase()]!;
      ties.add((
        otherId: id,
        otherName: cast.firstWhere((c) => c.id == id).name,
        preset: preset,
        newIsFrom: namedFirst,
        said: m[0]!,
      ));
      words(m[2]!);
      used = true;
    }
    if (used) continue;
    if (_age.firstMatch(part) case final m?) {
      age = m[1]!;
      continue;
    }
    if (_called.firstMatch(part) case final m?) {
      epithet = m[1]!.trim();
      continue;
    }
    if (_from.firstMatch(part) case final m?) {
      origin = m[1]!.trim();
      continue;
    }
    if (_ageIn.firstMatch(part) case final m?) age = m[1] ?? m[2]!;
    words(part);
    if (_what.firstMatch(part) case final m?) {
      final what = m[1]!.replaceAll(_ageIn, '').trim();
      final plain = what.toLowerCase();
      // "a woman", "an elf", "the villain" say who they are, not what they do.
      final onlyWho = _word
          .allMatches(plain)
          .every(
            (w) => _women.contains(w[0]) || _men.contains(w[0]) || _species.contains(w[0]) || _roleWords.contains(w[0]),
          );
      if (!onlyWho && occupation.isEmpty) occupation = what;
      if (m[2] case final from?) origin = from.trim();
      continue;
    }
    rest.add(part);
  }
  // "Mira Vance the Fox": an epithet written on the name.
  if (epithet.isEmpty) {
    final the = RegExp(r'^(.+?)\s+(the\s+\p{Lu}.*)$', unicode: true).firstMatch(name);
    if (the != null) {
      name = the[1]!.trim();
      epithet = the[2]!.trim();
    }
  }
  return (
    name: name,
    age: age,
    gender: gender,
    species: species,
    occupation: occupation,
    origin: origin,
    role: role,
    epithet: epithet,
    ties: ties,
    summary: rest.join(', '),
  );
}

const _roleWords = {'protagonist', 'hero', 'heroine', 'antagonist', 'villain', 'young', 'old'};
