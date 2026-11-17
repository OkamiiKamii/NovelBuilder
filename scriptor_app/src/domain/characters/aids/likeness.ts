// A LIKENESS: what a character looks like, read from the words of their profile (Hair, Eyes, Skin, Build,
// Distinguishing Features, Scars, Clothing), for drawing their cameo (cameo.ts). Nothing is guessed: what the words do
// not say is left unsaid, and the cameo draws it plainly. "No beard" is no beard.
//
// Reads only. A port of flutter_app/lib/shared/domain/characters/likeness.dart, kept here for the writing aids (the
// cameo, "Draw their face", recordFace): another port of the cast's views owns the name likeness.ts beside the domain
// modules, so this copy is private to the aids and must be kept the same as the Dart.

import { dartToUpperCase } from '../../exchange/dartUpperCase';
import { dartToLowerCase, dartTrim } from '../../text/dartString';
import { colourFamily } from '../looks';

/** How the hair is worn, when the profile says. */
export type HairCut = 'bald' | 'cropped' | 'short' | 'shoulder' | 'long' | 'braid';
export const hairCuts: readonly HairCut[] = ['bald', 'cropped', 'short', 'shoulder', 'long', 'braid'];

/** A skin tone, when the profile says one (by the words a writer uses; another colour, a creature's, by its family). */
export type SkinTone = 'fair' | 'light' | 'olive' | 'brown' | 'deep';
export const skinTones: readonly SkinTone[] = ['fair', 'light', 'olive', 'brown', 'deep'];

/** What can be drawn of someone: hair (its colour's family, its cut, curled or not), eyes (their colour's family),
 * skin, marks on the face, what is on the head, and the build. */
export type Likeness = {
  readonly hair: string | null;
  readonly cut: HairCut | null;
  readonly curly: boolean;
  readonly eyes: string | null;
  readonly skin: SkinTone | null;
  readonly skinFamily: string | null;
  readonly beard: boolean;
  readonly moustache: boolean;
  readonly glasses: boolean;
  readonly scar: boolean;
  readonly eyepatch: boolean;
  readonly freckles: boolean;
  readonly hood: boolean;
  readonly crown: boolean;
  readonly broad: boolean;
  readonly slight: boolean;
};

export const unsaid: Likeness = {
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
};

const likenessKeys = Object.keys(unsaid) as (keyof Likeness)[];

/** Whether two likenesses are the same (Dart's record equality). */
export function sameLikeness(a: Likeness, b: Likeness): boolean {
  return likenessKeys.every((k) => a[k] === b[k]);
}

/** Whether `l` says anything that can be painted (a colour or a mark), beyond the cut of the hair. */
export function painted(l: Likeness): boolean {
  return (
    l.hair !== null ||
    l.eyes !== null ||
    l.skin !== null ||
    l.skinFamily !== null ||
    l.beard ||
    l.moustache ||
    l.glasses ||
    l.scar ||
    l.eyepatch ||
    l.freckles ||
    l.hood ||
    l.crown
  );
}

/** A value that says nothing ("none", "n/a", "-"). */
function nothing(v: string): boolean {
  return /^\s*(none|n\/?a|-+|no|nil|nothing|unknown|\?)\s*\.?$/i.test(v);
}

/** Whether `text` names one of `words` (as words), and not after a "no" or "without". */
function says(text: string, words: readonly string[]): boolean {
  for (const w of words) {
    for (const m of text.matchAll(new RegExp(`\\b${w}\\b`, 'gi'))) {
      const before = dartToLowerCase(text.substring(0, m.index));
      if (/\b(no|without|never|not)\s+(\w+\s+)?$/.test(before)) continue;
      return true;
    }
  }
  return false;
}

const skinWords: readonly [SkinTone, readonly string[]][] = [
  ['fair', ['pale', 'porcelain', 'ivory', 'alabaster', 'fair', 'milky', 'pallid']],
  ['light', ['light', 'peach', 'rosy', 'pink', 'freckled']],
  ['olive', ['olive', 'golden', 'tan', 'tanned', 'sun-browned', 'sunburnt', 'weathered', 'sallow']],
  ['brown', ['brown', 'bronze', 'bronzed', 'copper', 'caramel', 'umber', 'russet', 'chestnut']],
  ['deep', ['dark', 'deep', 'ebony', 'black', 'mahogany', 'onyx']],
];

const humanFamilies = new Set(['brown', 'dark', 'pale', 'amber', 'black', 'white', 'red']);

/** The likeness `fields` (each profile field's name, in lower case, and its value) describe. */
export function likenessOf(fields: ReadonlyMap<string, string>): Likeness {
  const f = (names: readonly string[]): string => {
    for (const n of names) {
      const v = dartTrim(fields.get(n) ?? '');
      if (v.length > 0 && !nothing(v)) return v;
    }
    return '';
  };

  // A paragraph of their looks ("Physical Appearance"): where Hair or Eyes is not its own field, the words before
  // "hair" or "eyes" in it ("dark curly hair", "grey eyes").
  const looks = f(['physical appearance', 'appearance', 'description', 'looks']);
  const before = (noun: string) => new RegExp(`([\\w\\-]+(?:[ ,]+[\\w\\-]+){0,3})\\s+${noun}\\b`, 'i').exec(looks)?.[1] ?? '';
  const hairField = f(['hair', 'hair colour', 'hair color']);
  const hair = hairField.length > 0 ? hairField : before('hair');
  const eyesField = f(['eyes', 'eye colour', 'eye color', 'eye']);
  const eyes = eyesField.length > 0 ? eyesField : before('eyes');
  const skin = f(['skin', 'skin tone', 'complexion']);
  const build = f(['build', 'body', 'physique']);
  const marks = [f(['distinguishing features', 'features']), looks, f(['clothing', 'clothes', 'attire', 'dress'])].join(
    '. ',
  );
  const scars = f(['scars', 'scar']);
  const all = `${hair}. ${marks}`;

  let cut: HairCut | null = null;
  if (says(hair, ['bald', 'shaved', 'shaven', 'hairless'])) {
    cut = 'bald';
  } else if (says(hair, ['braid', 'braids', 'braided', 'plait', 'plaits', 'plaited', 'pigtails?'])) {
    cut = 'braid';
  } else if (says(hair, ['long', 'flowing', 'waist-length', 'mane', 'tresses'])) {
    cut = 'long';
  } else if (says(hair, ['shoulder', 'shoulder-length', 'bob', 'bobbed', 'chin-length'])) {
    cut = 'shoulder';
  } else if (says(hair, ['cropped', 'close-cropped', 'buzzed', 'buzz', 'shorn', 'crew'])) {
    cut = 'cropped';
  } else if (says(hair, ['short'])) {
    cut = 'short';
  }
  const hairFamily = cut === 'bald' ? null : colourFamily(hair);

  let tone: SkinTone | null = null;
  let skinFamily: string | null = null;
  if (skin.length > 0) {
    for (const [t, words] of skinWords) {
      if (says(skin, words)) {
        tone = t;
        // "Pale" with a colour is that colour ("pale green"): a creature's.
        if (t !== 'fair' && t !== 'light') break;
      }
    }
    const family = colourFamily(skin);
    if (family !== null && !humanFamilies.has(family)) {
      skinFamily = family;
      tone = null;
    }
  }

  return {
    hair: hairFamily,
    cut,
    curly: says(hair, ['curly', 'curls', 'curled', 'ringlets', 'wavy', 'coiled', 'coils', 'kinky', 'frizzy']),
    eyes: colourFamily(eyes),
    skin: tone,
    skinFamily,
    beard: says(all, ['beard', 'bearded', 'goatee']),
    moustache: says(all, ['moustache', 'mustache', 'moustached', 'mustached']),
    glasses: says(all, ['glasses', 'spectacles', 'eyeglasses', 'specs', 'pince-nez']),
    scar: scars.length > 0 || says(all, ['scar', 'scarred', 'scars']),
    eyepatch: says(all, ['eyepatch', 'eye-patch', 'eye patch']),
    freckles: says(`${all}. ${skin}`, ['freckles', 'freckled', 'freckle']),
    hood: says(all, ['hood', 'hooded', 'cowl']),
    crown: says(all, ['crown', 'crowned', 'circlet', 'tiara', 'diadem', 'coronet']),
    broad: says(build, ['broad', 'stocky', 'burly', 'muscular', 'heavy', 'heavyset', 'brawny', 'large', 'big']),
    slight: says(build, ['slight', 'slim', 'thin', 'wiry', 'willowy', 'slender', 'lean', 'petite', 'small', 'gaunt']),
  };
}

/** The words a likeness is written in, field by field, for the profile: what "Draw their face" records. */
export function wordsFor(l: Likeness): { hair: string | null; eyes: string | null; skin: string | null; marks: string[] } {
  const cap = (s: string) => (s.length === 0 ? s : `${dartToUpperCase(s[0])}${s.substring(1)}`);
  const cutWords: Record<HairCut, string> = {
    bald: 'bald',
    cropped: 'cropped',
    short: 'short',
    shoulder: 'shoulder-length',
    long: 'long',
    braid: 'braided',
  };
  const cut = l.cut === null ? null : cutWords[l.cut];
  const parts = [...(cut !== null ? [cut] : []), ...(l.curly ? ['curly'] : []), ...(l.hair !== null ? [l.hair] : [])];
  const hair =
    l.cut === 'bald' ? 'Bald' : parts.length === 0 ? null : cap(parts.join(', ').replace(/, (?=[a-z]+$)/, ' '));
  const marks: string[] = [];
  if (l.beard) marks.push('beard');
  if (l.moustache) marks.push('moustache');
  if (l.glasses) marks.push('glasses');
  if (l.scar) marks.push('a scar');
  if (l.eyepatch) marks.push('an eyepatch');
  if (l.freckles) marks.push('freckles');
  if (l.hood) marks.push('a hood');
  if (l.crown) marks.push('a crown');
  return {
    hair,
    eyes: l.eyes === null ? null : cap(l.eyes),
    skin: l.skin === null ? (l.skinFamily === null ? null : cap(l.skinFamily)) : cap(l.skin),
    marks,
  };
}
