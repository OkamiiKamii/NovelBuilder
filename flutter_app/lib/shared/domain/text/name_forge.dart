/// THE NAME FORGE: names that sound as if they belong. A name generator that knows nothing of the book gives every
/// fantasy the same "Elara"; this one learns the shapes of a set of names (the book's own, or a tradition's) letter by
/// letter, which letters follow which pair, how names begin and end, and forges new ones in that shape. None is a
/// name it learned from. Nothing is saved until the author picks one.
///
/// A small Markov chain over letters; no service and no model. The same seed gives the same names.
library;

import 'dart:math' as math;

/// A tradition to forge in: its people's names, and the endings its places take.
typedef NameFlavour = ({String key, String label, List<String> people, List<String> placeEndings});

/// The traditions on offer, besides the book's own names.
const nameFlavours = <NameFlavour>[
  (
    key: 'saxon',
    label: 'Old English',
    people: [
      'Aelfric', 'Aethelred', 'Alfred', 'Aldhelm', 'Beornwulf', 'Cuthbert', 'Cynewulf', 'Eadric', 'Eadgar', //
      'Eadwig', 'Ealdred', 'Edmund', 'Edwin', 'Godric', 'Godwin', 'Hereward', 'Leofric', 'Leofwin', 'Oswald', //
      'Oswin', 'Osric', 'Wulfstan', 'Wulfric', 'Wynfrith', 'Aelfgifu', 'Aethelflaed', 'Eadgyth', 'Ealdgyth', //
      'Edith', 'Hild', 'Godgifu', 'Leofrun', 'Mildred', 'Wulfrun', 'Cyneburg', 'Aelfwynn', 'Eanflaed', 'Wynflaed', //
      'Osburh', 'Sigeberht', 'Cenwalh', 'Beorhtric', 'Eorcenwald', 'Wiglaf',
    ],
    placeEndings: ['ford', 'bury', 'wick', 'ham', 'ton', 'mere', 'ley', 'stead', 'wold', 'combe', 'hurst', 'worth'],
  ),
  (
    key: 'norse',
    label: 'Norse',
    people: [
      'Asgeir', 'Bjarni', 'Brand', 'Einar', 'Eirik', 'Finnbogi', 'Gunnar', 'Grim', 'Halfdan', 'Hakon', 'Harald', //
      'Ingvar', 'Ivar', 'Ketil', 'Leif', 'Magnus', 'Njal', 'Olaf', 'Orm', 'Ragnar', 'Rolf', 'Sigurd', 'Snorri', //
      'Sven', 'Thorvald', 'Ulf', 'Vigdis', 'Astrid', 'Bergthora', 'Freydis', 'Gudrun', 'Gunnhild', 'Hallgerd', //
      'Helga', 'Ingrid', 'Ragnhild', 'Sigrid', 'Thora', 'Thordis', 'Yrsa', 'Arnbjorn', 'Hrafn', 'Steinar', 'Torfi',
    ],
    placeEndings: ['vik', 'by', 'thorp', 'fjord', 'heim', 'stad', 'holm', 'nes', 'dal', 'gard'],
  ),
  (
    key: 'latin',
    label: 'Latin',
    people: [
      'Aurelius', 'Cassius', 'Decimus', 'Faustus', 'Gaius', 'Lucius', 'Marcus', 'Octavian', 'Quintus', 'Septimus', //
      'Tiberius', 'Valerius', 'Varro', 'Aemilia', 'Aurelia', 'Cornelia', 'Flavia', 'Julia', 'Livia', 'Lucilla', //
      'Octavia', 'Valeria', 'Severina', 'Claudia', 'Drusilla', 'Hadrian', 'Corvinus', 'Maximus', 'Tullia', //
      'Aquila', 'Caelia', 'Fabia', 'Junia', 'Marcella', 'Petronius', 'Silvanus', 'Vitellia', 'Antonia', 'Sabina',
    ],
    placeEndings: ['ium', 'ia', 'um', 'ona', 'entum', 'ana', 'ae'],
  ),
  (
    key: 'lyrical',
    label: 'Lyrical',
    people: [
      'Aelindra', 'Caelith', 'Elowen', 'Ithariel', 'Myrrhen', 'Nimuel', 'Orrelin', 'Saelith', 'Thalanir', //
      'Vaelora', 'Ysolde', 'Aerin', 'Calenwe', 'Eluned', 'Ilvaren', 'Seraphel', 'Lunara', 'Miravel', 'Faelan', //
      'Sylvarin', 'Arannis', 'Liriel', 'Nerys', 'Aeloth', 'Ilyria', 'Merenwe', 'Caladrel', 'Elisande', 'Tirion', //
      'Vaeril', 'Selwen', 'Anariel', 'Eryndor', 'Lethiel', 'Oriwen', 'Quelenna', 'Thaliel', 'Ysmeral',
    ],
    placeEndings: ['ion', 'aris', 'wen', 'eth', 'ara', 'iel', 'ondor', 'esse'],
  ),
  (
    key: 'desert',
    label: 'Desert',
    people: [
      'Amir', 'Azra', 'Darius', 'Farid', 'Hakim', 'Idris', 'Jalal', 'Kasim', 'Layla', 'Malik', 'Nasir', 'Omar', //
      'Qadir', 'Rashid', 'Samira', 'Tariq', 'Yasmin', 'Zahra', 'Zafir', 'Nadia', 'Karim', 'Faisal', 'Leila', //
      'Ramin', 'Soraya', 'Dariush', 'Shirin', 'Anahita', 'Bahram', 'Parisa', 'Roxana', 'Kaveh', 'Arash', 'Mehran', //
      'Navid', 'Simin', 'Tahmina', 'Babak', 'Golnar', 'Javid',
    ],
    placeEndings: ['abad', 'pur', 'ad', 'ar', 'iya', 'an', 'esh'],
  ),
  (
    key: 'steppe',
    label: 'Steppe',
    people: [
      'Arslan', 'Batu', 'Bolat', 'Chagan', 'Dorji', 'Erden', 'Ganbaatar', 'Khulan', 'Mongke', 'Nergui', 'Oyun', //
      'Sarnai', 'Temur', 'Toghrul', 'Yesui', 'Altan', 'Borte', 'Chinua', 'Jochi', 'Kaidu', 'Orda', 'Sorkhan', //
      'Tolui', 'Ulagan', 'Yesugei', 'Khasar', 'Bayan', 'Sukhbat', 'Altai', 'Tumen', 'Odval', 'Saran', 'Narantuya', //
      'Tsetseg', 'Khongor', 'Bataar', 'Delger', 'Enkh', 'Gerel',
    ],
    placeEndings: ['khan', 'tai', 'gan', 'ur', 'tol', 'bulag', 'nur'],
  ),
];

/// The words of [names] a forge can learn from: whole words of three letters or more, written with a capital, letters
/// only, without "The", "Of" and the like.
List<String> learnableNames(Iterable<String> names) {
  const small = {'the', 'of', 'and', 'a', 'an', 'de', 'du', 'von', 'van', 'in', 'on', 'at'};
  final out = <String>{};
  for (final n in names) {
    for (final w in n.split(RegExp(r"[\s\-’']+"))) {
      final t = w.trim();
      if (t.length < 3 || small.contains(t.toLowerCase()) || ordinaryPlaceWords.contains(t.toLowerCase())) continue;
      if (!RegExp(r'^\p{Lu}\p{Ll}+$', unicode: true).hasMatch(t)) continue;
      out.add(t);
    }
  }
  return out.toList();
}

/// The fewest names the book must have before the forge learns from it.
const forgeMinNames = 6;

/// A model of names: for each pair of letters (and each single letter), the letters that follow, as often as they do.
class NameModel {
  NameModel(Iterable<String> names) {
    for (final raw in names) {
      final name = raw.toLowerCase();
      if (name.length < 2) continue;
      _known.add(name);
      final s = '^^$name\$';
      for (var i = 2; i < s.length; i++) {
        (_two[s.substring(i - 2, i)] ??= []).add(s[i]);
        (_one[s[i - 1]] ??= []).add(s[i]);
      }
    }
  }

  final _two = <String, List<String>>{};
  final _one = <String, List<String>>{};
  final _known = <String>{};

  bool get isEmpty => _two.isEmpty;

  /// Whether [name] is one the model learned.
  bool knows(String name) => _known.contains(name.toLowerCase());

  /// One name, [min] to [max] letters, beginning with [start] (lower case) when given; null when none comes out right.
  String? forge(math.Random random, {int min = 4, int max = 10, String start = ''}) {
    var s = '^^$start';
    for (var guard = 0; guard < 40; guard++) {
      final next = _two[s.substring(s.length - 2)] ?? _one[s[s.length - 1]];
      if (next == null || next.isEmpty) return null;
      final c = next[random.nextInt(next.length)];
      if (c == r'$') break;
      s += c;
      if (s.length - 2 > max) return null;
    }
    final name = s.substring(2);
    if (name.length < min || name.length > max) return null;
    return name;
  }
}

final _vowels = RegExp('[aeiouy]');

/// Whether a forged name can be said: no four consonants or three of one vowel running together, no letter three
/// times over, and a vowel somewhere.
bool sayable(String name) {
  final n = name.toLowerCase();
  if (!_vowels.hasMatch(n)) return false;
  if (RegExp('[^aeiouy]{4}').hasMatch(n)) return false;
  if (RegExp(r'(.)\1\1').hasMatch(n)) return false;
  if (RegExp('[aeiou]{3}').hasMatch(n)) return false;
  // Never a word no one wants on a character.
  if (_rude.any(n.contains)) return false;
  return true;
}

const _rude = [
  'shit', 'fuck', 'cunt', 'piss', 'nigg', 'fag', 'cock', 'dick', 'twat', 'slut', 'whore', 'rape', 'nazi', 'anus', //
  'arse', 'tit', 'cum', 'jizz', 'wank', 'bitch', 'bastard', 'porn', 'sex', 'puss', 'kike', 'spic', 'retard',
];

String _capital(String s) => s.isEmpty ? s : '${s[0].toUpperCase()}${s.substring(1)}';

/// [count] new names in the shape of [source] (none of them in it, none twice), for a person, or for a place with one
/// of [placeEndings] (when given) on a shorter stem, itself never a name it learned. [start] puts a letter or two
/// first: names that begin so where the shape allows, else a forged name with its first sound swapped for them. The
/// same [seed] gives the same names.
List<String> forgeNames({
  required List<String> source,
  int count = 12,
  int seed = 0,
  bool place = false,
  List<String> placeEndings = const [],
  String start = '',
}) {
  final model = NameModel(source);
  if (model.isEmpty) return const [];
  final random = math.Random(seed);
  final begin = start.trim().toLowerCase().replaceAll(RegExp('[^a-z]'), '');
  final endings = place && placeEndings.isNotEmpty;
  final out = <String>[];
  final seen = <String>{};

  void take(String? forged) {
    if (forged == null || out.length >= count) return;
    var name = forged;
    if (endings) {
      if (model.knows(name)) return;
      // A stem and an ending, the stem's last vowel run dropped when the ending begins with one, and no letter doubled
      // at the seam.
      final ending = placeEndings[random.nextInt(placeEndings.length)];
      var stem = name;
      if (_vowels.hasMatch(ending[0])) stem = stem.replaceFirst(RegExp(r'[aeiouy]+$'), '');
      if (stem.isNotEmpty && stem[stem.length - 1] == ending[0]) stem = stem.substring(0, stem.length - 1);
      if (stem.length < 2) return;
      name = '$stem$ending';
    }
    if (!sayable(name) || model.knows(name) || !seen.add(name)) return;
    out.add(_capital(name));
  }

  int min() => endings ? 3 : 4;
  int max() => endings ? 6 : 10;
  for (var tries = 0; tries < count * 60 && out.length < count; tries++) {
    take(model.forge(random, min: min(), max: max(), start: begin));
  }
  // Too few begin with those letters: forged names with their first sound (the letters before the first vowel) swapped
  // for them.
  if (begin.isNotEmpty) {
    for (var tries = 0; tries < count * 60 && out.length < count; tries++) {
      final forged = model.forge(random, min: min(), max: max());
      if (forged == null) continue;
      final firstVowel = forged.indexOf(_vowels);
      if (firstVowel < 0) continue;
      final beginsWithVowel = _vowels.hasMatch(begin[begin.length - 1]);
      final rest = beginsWithVowel
          ? forged.substring(firstVowel).replaceFirst(_vowels, '')
          : forged.substring(firstVowel);
      take('$begin$rest');
    }
  }
  return out;
}

/// Ordinary words that name places in English ("Lantern Street", "Hollow Light"): nothing to learn a name's sound from.
const ordinaryPlaceWords = {
  'street', 'road', 'lane', 'way', 'tower', 'light', 'ship', 'bell', 'salt', 'hill', 'river', 'forest', 'wood', //
  'woods', 'city', 'town', 'gate', 'bridge', 'castle', 'house', 'hall', 'lake', 'sea', 'bay', 'mountain', 'mount', //
  'island', 'isle', 'old', 'new', 'north', 'south', 'east', 'west', 'great', 'little', 'high', 'low', 'upper', //
  'lower', 'market', 'square', 'harbour', 'harbor', 'port', 'keep', 'temple', 'church', 'inn', 'tavern', 'valley', //
  'plain', 'plains', 'desert', 'marsh', 'field', 'fields', 'garden', 'palace', 'court', 'academy', 'school', //
  'guild', 'company', 'order', 'drowned', 'lantern', 'wardens', 'hollow', 'black', 'white', 'red', 'green',
};
