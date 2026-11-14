/// A LIKENESS: what a character looks like, read from the words of their profile (Hair, Eyes, Skin, Build,
/// Distinguishing Features, Scars, Clothing), for drawing their cameo (`features/characters/widgets/cameo.dart`).
/// Nothing is guessed: what the words do not say is left unsaid, and the cameo draws it plainly. "No beard" is no beard.
///
/// Reads only.
library;

import 'looks.dart' show colourFamily;

/// How the hair is worn, when the profile says.
enum HairCut { bald, cropped, short, shoulder, long, braid }

/// A skin tone, when the profile says one (by the words a writer uses; another colour, a creature's, by its family).
enum SkinTone { fair, light, olive, brown, deep }

/// What can be drawn of someone: hair (its colour's family, its cut, curled or not), eyes (their colour's family),
/// skin, marks on the face, what is on the head, and the build.
typedef Likeness = ({
  String? hair,
  HairCut? cut,
  bool curly,
  String? eyes,
  SkinTone? skin,
  String? skinFamily,
  bool beard,
  bool moustache,
  bool glasses,
  bool scar,
  bool eyepatch,
  bool freckles,
  bool hood,
  bool crown,
  bool broad,
  bool slight,
});

const Likeness unsaid = (
  hair: null,
  cut: null,
  curly: false,
  eyes: null,
  skin: null,
  skinFamily: null,
  beard: false,
  moustache: false,
  glasses: false,
  scar: false,
  eyepatch: false,
  freckles: false,
  hood: false,
  crown: false,
  broad: false,
  slight: false,
);

/// Whether [l] says anything that can be painted (a colour or a mark), beyond the cut of the hair.
bool painted(Likeness l) =>
    l.hair != null ||
    l.eyes != null ||
    l.skin != null ||
    l.skinFamily != null ||
    l.beard ||
    l.moustache ||
    l.glasses ||
    l.scar ||
    l.eyepatch ||
    l.freckles ||
    l.hood ||
    l.crown;

/// A value that says nothing ("none", "n/a", "-").
bool _nothing(String v) =>
    RegExp(r'^\s*(none|n/?a|-+|no|nil|nothing|unknown|\?)\s*\.?$', caseSensitive: false).hasMatch(v);

/// Whether [text] names one of [words] (as words), and not after a "no" or "without".
bool _says(String text, List<String> words) {
  for (final w in words) {
    for (final m in RegExp('\\b$w\\b', caseSensitive: false).allMatches(text)) {
      final before = text.substring(0, m.start).toLowerCase();
      if (RegExp(r'\b(no|without|never|not)\s+(\w+\s+)?$').hasMatch(before)) continue;
      return true;
    }
  }
  return false;
}

const _skinWords = <SkinTone, List<String>>{
  SkinTone.fair: ['pale', 'porcelain', 'ivory', 'alabaster', 'fair', 'milky', 'pallid'],
  SkinTone.light: ['light', 'peach', 'rosy', 'pink', 'freckled'],
  SkinTone.olive: ['olive', 'golden', 'tan', 'tanned', 'sun-browned', 'sunburnt', 'weathered', 'sallow'],
  SkinTone.brown: ['brown', 'bronze', 'bronzed', 'copper', 'caramel', 'umber', 'russet', 'chestnut'],
  SkinTone.deep: ['dark', 'deep', 'ebony', 'black', 'mahogany', 'onyx'],
};

/// The likeness [fields] (each profile field's name, in lower case, and its value) describe.
Likeness likenessOf(Map<String, String> fields) {
  String f(List<String> names) {
    for (final n in names) {
      final v = fields[n]?.trim() ?? '';
      if (v.isNotEmpty && !_nothing(v)) return v;
    }
    return '';
  }

  // A paragraph of their looks ("Physical Appearance"): where Hair or Eyes is not its own field, the words before
  // "hair" or "eyes" in it ("dark curly hair", "grey eyes").
  final looks = f(['physical appearance', 'appearance', 'description', 'looks']);
  String before(String noun) =>
      RegExp(r'([\w\-]+(?:[ ,]+[\w\-]+){0,3})\s+' + noun + r'\b', caseSensitive: false).firstMatch(looks)?[1] ?? '';
  final hairField = f(['hair', 'hair colour', 'hair color']);
  final hair = hairField.isNotEmpty ? hairField : before('hair');
  final eyesField = f(['eyes', 'eye colour', 'eye color', 'eye']);
  final eyes = eyesField.isNotEmpty ? eyesField : before('eyes');
  final skin = f(['skin', 'skin tone', 'complexion']);
  final build = f(['build', 'body', 'physique']);
  final marks = [
    f(['distinguishing features', 'features']),
    looks,
    f(['clothing', 'clothes', 'attire', 'dress']),
  ].join('. ');
  final scars = f(['scars', 'scar']);
  final all = '$hair. $marks';

  HairCut? cut;
  if (_says(hair, ['bald', 'shaved', 'shaven', 'hairless'])) {
    cut = HairCut.bald;
  } else if (_says(hair, ['braid', 'braids', 'braided', 'plait', 'plaits', 'plaited', 'pigtails?'])) {
    cut = HairCut.braid;
  } else if (_says(hair, ['long', 'flowing', 'waist-length', 'mane', 'tresses'])) {
    cut = HairCut.long;
  } else if (_says(hair, ['shoulder', 'shoulder-length', 'bob', 'bobbed', 'chin-length'])) {
    cut = HairCut.shoulder;
  } else if (_says(hair, ['cropped', 'close-cropped', 'buzzed', 'buzz', 'shorn', 'crew'])) {
    cut = HairCut.cropped;
  } else if (_says(hair, ['short'])) {
    cut = HairCut.short;
  }
  final hairFamily = cut == HairCut.bald ? null : colourFamily(hair);

  SkinTone? tone;
  String? skinFamily;
  if (skin.isNotEmpty) {
    for (final MapEntry(key: t, value: words) in _skinWords.entries) {
      if (_says(skin, words)) {
        tone = t;
        // "Pale" with a colour is that colour ("pale green"): a creature's.
        if (t != SkinTone.fair && t != SkinTone.light) break;
      }
    }
    final family = colourFamily(skin);
    const humanFamilies = {'brown', 'dark', 'pale', 'amber', 'black', 'white', 'red'};
    if (family != null && !humanFamilies.contains(family)) {
      skinFamily = family;
      tone = null;
    }
  }

  return (
    hair: hairFamily,
    cut: cut,
    curly: _says(hair, ['curly', 'curls', 'curled', 'ringlets', 'wavy', 'coiled', 'coils', 'kinky', 'frizzy']),
    eyes: colourFamily(eyes),
    skin: tone,
    skinFamily: skinFamily,
    beard: _says(all, ['beard', 'bearded', 'goatee']),
    moustache: _says(all, ['moustache', 'mustache', 'moustached', 'mustached']),
    glasses: _says(all, ['glasses', 'spectacles', 'eyeglasses', 'specs', 'pince-nez']),
    scar: scars.isNotEmpty || _says(all, ['scar', 'scarred', 'scars']),
    eyepatch: _says(all, ['eyepatch', 'eye-patch', 'eye patch']),
    freckles: _says('$all. $skin', ['freckles', 'freckled', 'freckle']),
    hood: _says(all, ['hood', 'hooded', 'cowl']),
    crown: _says(all, ['crown', 'crowned', 'circlet', 'tiara', 'diadem', 'coronet']),
    broad: _says(build, ['broad', 'stocky', 'burly', 'muscular', 'heavy', 'heavyset', 'brawny', 'large', 'big']),
    slight: _says(build, ['slight', 'slim', 'thin', 'wiry', 'willowy', 'slender', 'lean', 'petite', 'small', 'gaunt']),
  );
}

/// The words a likeness is written in, field by field, for the profile: what "Draw their face" records.
({String? hair, String? eyes, String? skin, List<String> marks}) wordsFor(Likeness l) {
  String cap(String s) => s.isEmpty ? s : '${s[0].toUpperCase()}${s.substring(1)}';
  final cut = switch (l.cut) {
    HairCut.bald => 'bald',
    HairCut.cropped => 'cropped',
    HairCut.short => 'short',
    HairCut.shoulder => 'shoulder-length',
    HairCut.long => 'long',
    HairCut.braid => 'braided',
    null => null,
  };
  final hair = l.cut == HairCut.bald
      ? 'Bald'
      : [?cut, if (l.curly) 'curly', ?l.hair].isEmpty
      ? null
      : cap([?cut, if (l.curly) 'curly', ?l.hair].join(', ').replaceFirst(RegExp(r', (?=[a-z]+$)'), ' '));
  return (
    hair: hair,
    eyes: l.eyes == null ? null : cap(l.eyes!),
    skin: l.skin == null ? (l.skinFamily == null ? null : cap(l.skinFamily!)) : cap(l.skin!.name),
    marks: [
      if (l.beard) 'beard',
      if (l.moustache) 'moustache',
      if (l.glasses) 'glasses',
      if (l.scar) 'a scar',
      if (l.eyepatch) 'an eyepatch',
      if (l.freckles) 'freckles',
      if (l.hood) 'a hood',
      if (l.crown) 'a crown',
    ],
  );
}
