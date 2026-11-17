// THE NAME FORGE: names that sound as if they belong. A name generator that knows nothing of the book gives every
// fantasy the same "Elara"; this one learns the shapes of a set of names (the book's own, or a tradition's) letter by
// letter, which letters follow which pair, how names begin and end, and forges new ones in that shape. None is a name
// it learned from. Nothing is saved until the author picks one.
//
// A small Markov chain over letters; no service and no model. The same seed gives the same names, the same as in the
// Flutter app (Dart's Random, desk/dartRandom.ts). A port of flutter_app/lib/shared/domain/text/name_forge.dart.

import { DartRandom } from '../desk/dartRandom';
import { dartToUpperCase } from '../exchange/dartUpperCase';
import { dartToLowerCase, dartTrim } from '../text/dartString';

/** A tradition to forge in: its people's names, and the endings its places take. */
export type NameFlavour = {
  readonly key: string;
  readonly label: string;
  readonly people: readonly string[];
  readonly placeEndings: readonly string[];
};

/** The traditions on offer, besides the book's own names. */
export const nameFlavours: readonly NameFlavour[] = [
  {
    key: 'saxon',
    label: 'Old English',
    people: [
      'Aelfric', 'Aethelred', 'Alfred', 'Aldhelm', 'Beornwulf', 'Cuthbert', 'Cynewulf', 'Eadric', 'Eadgar',
      'Eadwig', 'Ealdred', 'Edmund', 'Edwin', 'Godric', 'Godwin', 'Hereward', 'Leofric', 'Leofwin', 'Oswald',
      'Oswin', 'Osric', 'Wulfstan', 'Wulfric', 'Wynfrith', 'Aelfgifu', 'Aethelflaed', 'Eadgyth', 'Ealdgyth',
      'Edith', 'Hild', 'Godgifu', 'Leofrun', 'Mildred', 'Wulfrun', 'Cyneburg', 'Aelfwynn', 'Eanflaed', 'Wynflaed',
      'Osburh', 'Sigeberht', 'Cenwalh', 'Beorhtric', 'Eorcenwald', 'Wiglaf',
    ],
    placeEndings: ['ford', 'bury', 'wick', 'ham', 'ton', 'mere', 'ley', 'stead', 'wold', 'combe', 'hurst', 'worth'],
  },
  {
    key: 'norse',
    label: 'Norse',
    people: [
      'Asgeir', 'Bjarni', 'Brand', 'Einar', 'Eirik', 'Finnbogi', 'Gunnar', 'Grim', 'Halfdan', 'Hakon', 'Harald',
      'Ingvar', 'Ivar', 'Ketil', 'Leif', 'Magnus', 'Njal', 'Olaf', 'Orm', 'Ragnar', 'Rolf', 'Sigurd', 'Snorri',
      'Sven', 'Thorvald', 'Ulf', 'Vigdis', 'Astrid', 'Bergthora', 'Freydis', 'Gudrun', 'Gunnhild', 'Hallgerd',
      'Helga', 'Ingrid', 'Ragnhild', 'Sigrid', 'Thora', 'Thordis', 'Yrsa', 'Arnbjorn', 'Hrafn', 'Steinar', 'Torfi',
    ],
    placeEndings: ['vik', 'by', 'thorp', 'fjord', 'heim', 'stad', 'holm', 'nes', 'dal', 'gard'],
  },
  {
    key: 'latin',
    label: 'Latin',
    people: [
      'Aurelius', 'Cassius', 'Decimus', 'Faustus', 'Gaius', 'Lucius', 'Marcus', 'Octavian', 'Quintus', 'Septimus',
      'Tiberius', 'Valerius', 'Varro', 'Aemilia', 'Aurelia', 'Cornelia', 'Flavia', 'Julia', 'Livia', 'Lucilla',
      'Octavia', 'Valeria', 'Severina', 'Claudia', 'Drusilla', 'Hadrian', 'Corvinus', 'Maximus', 'Tullia',
      'Aquila', 'Caelia', 'Fabia', 'Junia', 'Marcella', 'Petronius', 'Silvanus', 'Vitellia', 'Antonia', 'Sabina',
    ],
    placeEndings: ['ium', 'ia', 'um', 'ona', 'entum', 'ana', 'ae'],
  },
  {
    key: 'lyrical',
    label: 'Lyrical',
    people: [
      'Aelindra', 'Caelith', 'Elowen', 'Ithariel', 'Myrrhen', 'Nimuel', 'Orrelin', 'Saelith', 'Thalanir',
      'Vaelora', 'Ysolde', 'Aerin', 'Calenwe', 'Eluned', 'Ilvaren', 'Seraphel', 'Lunara', 'Miravel', 'Faelan',
      'Sylvarin', 'Arannis', 'Liriel', 'Nerys', 'Aeloth', 'Ilyria', 'Merenwe', 'Caladrel', 'Elisande', 'Tirion',
      'Vaeril', 'Selwen', 'Anariel', 'Eryndor', 'Lethiel', 'Oriwen', 'Quelenna', 'Thaliel', 'Ysmeral',
    ],
    placeEndings: ['ion', 'aris', 'wen', 'eth', 'ara', 'iel', 'ondor', 'esse'],
  },
  {
    key: 'desert',
    label: 'Desert',
    people: [
      'Amir', 'Azra', 'Darius', 'Farid', 'Hakim', 'Idris', 'Jalal', 'Kasim', 'Layla', 'Malik', 'Nasir', 'Omar',
      'Qadir', 'Rashid', 'Samira', 'Tariq', 'Yasmin', 'Zahra', 'Zafir', 'Nadia', 'Karim', 'Faisal', 'Leila',
      'Ramin', 'Soraya', 'Dariush', 'Shirin', 'Anahita', 'Bahram', 'Parisa', 'Roxana', 'Kaveh', 'Arash', 'Mehran',
      'Navid', 'Simin', 'Tahmina', 'Babak', 'Golnar', 'Javid',
    ],
    placeEndings: ['abad', 'pur', 'ad', 'ar', 'iya', 'an', 'esh'],
  },
  {
    key: 'steppe',
    label: 'Steppe',
    people: [
      'Arslan', 'Batu', 'Bolat', 'Chagan', 'Dorji', 'Erden', 'Ganbaatar', 'Khulan', 'Mongke', 'Nergui', 'Oyun',
      'Sarnai', 'Temur', 'Toghrul', 'Yesui', 'Altan', 'Borte', 'Chinua', 'Jochi', 'Kaidu', 'Orda', 'Sorkhan',
      'Tolui', 'Ulagan', 'Yesugei', 'Khasar', 'Bayan', 'Sukhbat', 'Altai', 'Tumen', 'Odval', 'Saran', 'Narantuya',
      'Tsetseg', 'Khongor', 'Bataar', 'Delger', 'Enkh', 'Gerel',
    ],
    placeEndings: ['khan', 'tai', 'gan', 'ur', 'tol', 'bulag', 'nur'],
  },
];

/** Ordinary words that name places in English ("Lantern Street", "Hollow Light"): nothing to learn a name's sound
 * from. */
export const ordinaryPlaceWords: ReadonlySet<string> = new Set([
  'street', 'road', 'lane', 'way', 'tower', 'light', 'ship', 'bell', 'salt', 'hill', 'river', 'forest', 'wood',
  'woods', 'city', 'town', 'gate', 'bridge', 'castle', 'house', 'hall', 'lake', 'sea', 'bay', 'mountain', 'mount',
  'island', 'isle', 'old', 'new', 'north', 'south', 'east', 'west', 'great', 'little', 'high', 'low', 'upper',
  'lower', 'market', 'square', 'harbour', 'harbor', 'port', 'keep', 'temple', 'church', 'inn', 'tavern', 'valley',
  'plain', 'plains', 'desert', 'marsh', 'field', 'fields', 'garden', 'palace', 'court', 'academy', 'school',
  'guild', 'company', 'order', 'drowned', 'lantern', 'wardens', 'hollow', 'black', 'white', 'red', 'green',
]);

const smallWords = new Set(['the', 'of', 'and', 'a', 'an', 'de', 'du', 'von', 'van', 'in', 'on', 'at']);

/** The words of `names` a forge can learn from: whole words of three letters or more, written with a capital, letters
 * only, without "The", "Of" and the like. */
export function learnableNames(names: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const n of names) {
    for (const w of n.split(/[\s\-’']+/)) {
      const t = dartTrim(w);
      const lower = dartToLowerCase(t);
      if (t.length < 3 || smallWords.has(lower) || ordinaryPlaceWords.has(lower)) continue;
      if (!/^\p{Lu}\p{Ll}+$/u.test(t)) continue;
      out.add(t);
    }
  }
  return [...out];
}

/** The fewest names the book must have before the forge learns from it. */
export const forgeMinNames = 6;

/** A model of names: for each pair of letters (and each single letter), the letters that follow, as often as they
 * do. */
export class NameModel {
  private readonly two = new Map<string, string[]>();
  private readonly one = new Map<string, string[]>();
  private readonly known = new Set<string>();

  constructor(names: Iterable<string>) {
    const add = (map: Map<string, string[]>, key: string, c: string) => {
      let list = map.get(key);
      if (list === undefined) map.set(key, (list = []));
      list.push(c);
    };
    for (const raw of names) {
      const name = dartToLowerCase(raw);
      if (name.length < 2) continue;
      this.known.add(name);
      const s = `^^${name}$`;
      for (let i = 2; i < s.length; i++) {
        add(this.two, s.substring(i - 2, i), s[i]);
        add(this.one, s[i - 1], s[i]);
      }
    }
  }

  get isEmpty(): boolean {
    return this.two.size === 0;
  }

  /** Whether `name` is one the model learned. */
  knows(name: string): boolean {
    return this.known.has(dartToLowerCase(name));
  }

  /** One name, `min` to `max` letters, beginning with `start` (lower case) when given; null when none comes out
   * right. */
  forge(random: DartRandom, options: { min?: number; max?: number; start?: string } = {}): string | null {
    const min = options.min ?? 4;
    const max = options.max ?? 10;
    let s = `^^${options.start ?? ''}`;
    for (let guard = 0; guard < 40; guard++) {
      const next = this.two.get(s.substring(s.length - 2)) ?? this.one.get(s[s.length - 1]);
      if (next === undefined || next.length === 0) return null;
      const c = next[random.nextInt(next.length)];
      if (c === '$') break;
      s += c;
      if (s.length - 2 > max) return null;
    }
    const name = s.substring(2);
    if (name.length < min || name.length > max) return null;
    return name;
  }
}

const vowels = /[aeiouy]/;

const rude = [
  'shit', 'fuck', 'cunt', 'piss', 'nigg', 'fag', 'cock', 'dick', 'twat', 'slut', 'whore', 'rape', 'nazi', 'anus',
  'arse', 'tit', 'cum', 'jizz', 'wank', 'bitch', 'bastard', 'porn', 'sex', 'puss', 'kike', 'spic', 'retard',
];

/** Whether a forged name can be said: no four consonants or three of one vowel running together, no letter three
 * times over, and a vowel somewhere. */
export function sayable(name: string): boolean {
  const n = dartToLowerCase(name);
  if (!vowels.test(n)) return false;
  if (/[^aeiouy]{4}/.test(n)) return false;
  if (/(.)\1\1/.test(n)) return false;
  if (/[aeiou]{3}/.test(n)) return false;
  // Never a word no one wants on a character.
  if (rude.some((r) => n.includes(r))) return false;
  return true;
}

function capital(s: string): string {
  return s.length === 0 ? s : `${dartToUpperCase(s[0])}${s.substring(1)}`;
}

/** `count` new names in the shape of `source` (none of them in it, none twice), for a person, or for a place with one
 * of `placeEndings` (when given) on a shorter stem, itself never a name it learned. `start` puts a letter or two
 * first: names that begin so where the shape allows, else a forged name with its first sound swapped for them. The
 * same `seed` gives the same names. */
export function forgeNames(options: {
  source: readonly string[];
  count?: number;
  seed?: number;
  place?: boolean;
  placeEndings?: readonly string[];
  start?: string;
}): string[] {
  const count = options.count ?? 12;
  const placeEndings = options.placeEndings ?? [];
  const model = new NameModel(options.source);
  if (model.isEmpty) return [];
  const random = new DartRandom(options.seed ?? 0);
  const begin = dartToLowerCase(dartTrim(options.start ?? '')).replace(/[^a-z]/g, '');
  const endings = (options.place ?? false) && placeEndings.length > 0;
  const out: string[] = [];
  const seen = new Set<string>();

  const take = (forged: string | null) => {
    if (forged === null || out.length >= count) return;
    let name = forged;
    if (endings) {
      if (model.knows(name)) return;
      // A stem and an ending, the stem's last vowel run dropped when the ending begins with one, and no letter doubled
      // at the seam.
      const ending = placeEndings[random.nextInt(placeEndings.length)];
      let stem = name;
      if (vowels.test(ending[0])) stem = stem.replace(/[aeiouy]+$/, '');
      if (stem.length > 0 && stem[stem.length - 1] === ending[0]) stem = stem.substring(0, stem.length - 1);
      if (stem.length < 2) return;
      name = `${stem}${ending}`;
    }
    if (!sayable(name) || model.knows(name) || seen.has(name)) return;
    seen.add(name);
    out.push(capital(name));
  };

  const min = endings ? 3 : 4;
  const max = endings ? 6 : 10;
  for (let tries = 0; tries < count * 60 && out.length < count; tries++) {
    take(model.forge(random, { min, max, start: begin }));
  }
  // Too few begin with those letters: forged names with their first sound (the letters before the first vowel)
  // swapped for them.
  if (begin.length > 0) {
    for (let tries = 0; tries < count * 60 && out.length < count; tries++) {
      const forged = model.forge(random, { min, max });
      if (forged === null) continue;
      const firstVowel = forged.search(vowels);
      if (firstVowel < 0) continue;
      const beginsWithVowel = vowels.test(begin[begin.length - 1]);
      const rest = beginsWithVowel ? forged.substring(firstVowel).replace(vowels, '') : forged.substring(firstVowel);
      take(`${begin}${rest}`);
    }
  }
  return out;
}
