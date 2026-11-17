// CHECKED AGAINST YOUR PAGES: a profile says what a character looks like; the chapters say it again, sometimes
// differently. "Her grey eyes" in the profile, "Mira's blue eyes" in chapter 7: the slip readers write in about. This
// reads the colour of a character's eyes and hair where the page gives them, and sets it beside the profile.
//
// Careful about whose eyes they are: a look counts for a character only when the sentence makes it theirs: their
// name's own ("Wren's grey eyes"), or their name the subject, before any she, he or they, and no other person named
// between ("Wren pushed back her black hair"). "She looked at Wren with eyes like stones" is not Wren's.
//
// Reads only. A port of flutter_app/lib/shared/domain/characters/looks.dart.

import { dartSort } from '../manuscript/dartSort';
import { blockTexts } from '../prose';
import { dartToUpperCase } from '../exchange/dartUpperCase';
import { dartToLowerCase, dartTrim } from '../text/dartString';

/** What is looked for: the eyes, and the hair. */
export type Feature = 'eyes' | 'hair';
export const features: readonly Feature[] = ['eyes', 'hair'];

/** The field it is recorded as, by default. */
export const featureLabel: Readonly<Record<Feature, string>> = { eyes: 'Eyes', hair: 'Hair' };

/** The words that name it on the page. */
export const featureWords: Readonly<Record<Feature, readonly string[]>> = {
  eyes: ['eyes', 'eye'],
  hair: ['hair', 'curls', 'locks', 'braid', 'braids', 'plait', 'plaits'],
};

/** The field names it may be recorded under. */
export const featureFieldNames: Readonly<Record<Feature, readonly string[]>> = {
  eyes: ['eyes', 'eye colour', 'eye color', 'eye'],
  hair: ['hair', 'hair colour', 'hair color'],
};

/** Colours as the page says them, by family: "grey", "gray", "steel", "silver" are one family. */
const families: readonly [string, readonly string[]][] = [
  ['black', ['black', 'jet', 'raven', 'ebony', 'inky', 'coal', 'coal-black', 'jet-black', 'pitch']],
  ['brown', ['brown', 'chestnut', 'chocolate', 'mousy', 'mousey', 'umber', 'nut-brown', 'walnut', 'tawny']],
  ['hazel', ['hazel']],
  ['blue', ['blue', 'azure', 'sapphire', 'cobalt', 'cornflower', 'sky-blue', 'ice-blue', 'pale-blue']],
  ['green', ['green', 'emerald', 'jade', 'sea-green']],
  ['grey', ['grey', 'gray', 'steel', 'steely', 'slate', 'pewter', 'ash', 'ashen', 'storm-grey', 'stormy']],
  ['silver', ['silver', 'silvery', 'silvered']],
  ['white', ['white', 'snow-white', 'snowy']],
  ['amber', ['amber', 'golden', 'gold', 'honey', 'honeyed', 'yellow']],
  ['blond', ['blond', 'blonde', 'flaxen', 'fair', 'straw', 'platinum', 'wheaten']],
  ['red', ['red', 'ginger', 'auburn', 'copper', 'coppery', 'russet', 'flame', 'fiery', 'scarlet', 'crimson']],
  ['violet', ['violet', 'purple', 'lavender', 'amethyst']],
  ['dark', ['dark']],
  ['pale', ['pale', 'light']],
];

/** Families that do not contradict each other: dark hair may be black or brown; silver, grey and white hair are one
 * age; golden hair is fair. */
const alike: readonly ReadonlySet<string>[] = [
  new Set(['dark', 'black', 'brown']),
  new Set(['silver', 'grey', 'white']),
  new Set(['amber', 'blond']),
  new Set(['hazel', 'brown', 'amber', 'green']),
];

const colourToFamily = new Map<string, string>();
for (const [family, words] of families) for (const w of words) colourToFamily.set(w, family);

/** The colour family a word or a recorded value names ("Steel grey" → grey), or null. */
export function colourFamily(text: string): string | null {
  const words = dartToLowerCase(text)
    .split(/[^a-z-]+/)
    .filter((w) => w.length > 0);
  // The last colour word is the colour ("pale blue" is blue).
  for (let i = words.length - 1; i >= 0; i--) {
    const w = words[i];
    const parts = w.split('-');
    const f = colourToFamily.get(w) ?? colourToFamily.get(parts[parts.length - 1]);
    if (f !== undefined && f !== 'pale') return f;
  }
  for (let i = words.length - 1; i >= 0; i--) {
    const f = colourToFamily.get(words[i]);
    if (f !== undefined) return f;
  }
  return null;
}

/** Whether two colour families can be the same thing. */
export function sameColour(a: string, b: string): boolean {
  return a === b || alike.some((s) => s.has(a) && s.has(b));
}

/** One sighting: the feature, its colour's family and the words for it, where it is (chapter, paragraph), and the
 * sentence that says it. */
export type LookSighting = {
  feature: Feature;
  family: string;
  said: string;
  nodeId: string;
  block: number;
  sentence: string;
};

const sentencePattern = /[^.!?…]+[.!?…]+["”’]*|[^.!?…]+$/g;
const pronouns = new Set(['she', 'he', 'they', 'i', 'we', 'you', 'it']);

// As Dart's RegExp.escape: the characters with a meaning in a pattern (valid in a pattern with the u flag too).
function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The looks `names` (a character's names) are given in `pages` (each chapter's paragraphs), in reading order
 * `nodeIds`. `others` are every other character's names: a sentence that names one of them between this character's
 * name and the look is not counted. */
export function looksIn(
  pages: ReadonlyMap<string, readonly string[]>,
  nodeIds: readonly string[],
  names: readonly string[],
  options: { others?: readonly string[] } = {},
): LookSighting[] {
  const others = options.others ?? [];
  const wanted = dartSort(
    [...new Set(names.map(dartTrim))].filter((n) => n.length >= 2),
    (a, b) => b.length - a.length,
  );
  if (wanted.length === 0) return [];
  const name = new RegExp(`(?<![\\p{L}])(?:${wanted.map(escape).join('|')})(?![\\p{L}])`, 'u');
  const other = [...new Set(others.map(dartTrim))].filter((o) => o.length >= 2 && !wanted.includes(o));
  const otherName =
    other.length === 0 ? null : new RegExp(`(?<![\\p{L}])(?:${other.map(escape).join('|')})(?![\\p{L}])`, 'u');
  const out: LookSighting[] = [];
  for (const id of nodeIds) {
    const blocks = pages.get(id);
    if (blocks === undefined) continue;
    blocks.forEach((text, b) => {
      for (const s of text.matchAll(sentencePattern)) {
        const sentence = dartTrim(s[0]);
        const at = name.exec(sentence);
        if (at === null) continue;
        for (const f of features) {
          const found = look(sentence, at.index, at.index + at[0].length, f, otherName);
          if (found !== null) out.push({ feature: f, family: found[0], said: found[1], nodeId: id, block: b, sentence });
        }
      }
    });
  }
  return out;
}

/** The colour `feature` is given in `sentence`, as this character's (whose name runs `start` to `end`): its family and
 * the words, or null. */
function look(
  sentence: string,
  start: number,
  end: number,
  feature: Feature,
  otherName: RegExp | null,
): [string, string] | null {
  const lower = dartToLowerCase(sentence);
  const featureWord = new RegExp(`(?<![a-z])(?:${featureWords[feature].join('|')})(?![a-z])`, 'g');
  for (const m of lower.matchAll(featureWord)) {
    const mStart = m.index;
    const mEnd = m.index + m[0].length;
    if (mStart < end) continue; // The look comes after the name.
    const between = lower.substring(end, mStart);
    const possessive = /^[’']s?\b/.test(between);
    // Theirs: the name's own ("Wren's grey eyes"), or the name the subject, with no person between and none before it.
    if (!possessive) {
      const before = lower.substring(0, start);
      const words = new Set([...before.matchAll(/[a-z]+/g)].map((w) => w[0]));
      if ([...words].some((w) => pronouns.has(w))) continue;
      if (otherName !== null && otherName.test(sentence.substring(end, mStart))) continue;
      if (!/\b(her|his|their|my)\b/.test(between)) continue;
    }
    // The colour: in the three words before the feature, or after "was"/"were"/"of"/"like" within four after it.
    // Whole words only: not the "s" of "Wren’s".
    const lead = /(?<![a-z\-’'])([a-z-]+)[ ,]+(?:[a-z-]+[ ,]+){0,2}$/.exec(lower.substring(0, mStart));
    const leading = lead === null ? '' : lower.substring(lead.index, mStart);
    let family = colourFamily(leading);
    // The words as written (the same places in the sentence; lower case keeps them), in the order written.
    const word = sentence.substring(mStart, mEnd);
    let said = lead === null ? word : `${dartTrim(sentence.substring(lead.index, mStart))} ${word}`;
    if (family === null) {
      const after = /^\s*(?:were|was|are|is|of|like|,)\s+(?:[a-z-]+\s*){1,5}/.exec(lower.substring(mEnd));
      if (after !== null) {
        family = colourFamily(after[0]);
        said = dartTrim(`${word}${sentence.substring(mEnd, mEnd + after[0].length)}`);
      }
    }
    // From the possessive, when there is one: "her black hair", not "back her black hair".
    said = said.replace(/^.*?\b(?=(?:her|his|their|my)\b)/i, '');
    if (family === null || family === 'pale') continue;
    // Red eyes are tears or smoke, and white is their whites: not their colour.
    if (feature === 'eyes' && (family === 'red' || family === 'white')) continue;
    return [family, dartTrim(said)];
  }
  return null;
}

/** What the page and the profile say of one feature: agreeing, at odds, or said only on the page. */
export type LookVerdict = 'agrees' | 'differs' | 'unrecorded';
export const lookVerdicts: readonly LookVerdict[] = ['agrees', 'differs', 'unrecorded'];

/** One feature checked: what the profile says (empty when nothing), what the page says (its sightings), and the
 * verdict. `family` is the colour the page gives most. */
export type LookCheck = {
  feature: Feature;
  recorded: string;
  family: string;
  verdict: LookVerdict;
  sightings: LookSighting[];
};

/** The features `sightings` give, checked against `recorded` (each feature's recorded value, empty when none): a
 * recorded colour the page contradicts, the page's colour where nothing is recorded, or agreement. */
export function checkLooks(
  sightings: readonly LookSighting[],
  recorded: ReadonlyMap<Feature, string>,
): LookCheck[] {
  const out: LookCheck[] = [];
  for (const f of features) {
    const seen = sightings.filter((s) => s.feature === f);
    if (seen.length === 0) continue;
    const value = dartTrim(recorded.get(f) ?? '');
    const mine = colourFamily(value);
    if (value.length > 0 && mine !== null) {
      const against = seen.filter((s) => !sameColour(s.family, mine));
      out.push({
        feature: f,
        recorded: value,
        family: against.length === 0 ? mine : against[0].family,
        verdict: against.length === 0 ? 'agrees' : 'differs',
        sightings: against.length === 0 ? seen : against,
      });
      continue;
    }
    if (value.length > 0) continue; // A value the reader cannot place ("like her mother's"): left be.
    const counts = new Map<string, number>();
    for (const s of seen) counts.set(s.family, (counts.get(s.family) ?? 0) + 1);
    let most: [string, number] | null = null;
    for (const e of counts) if (most === null || e[1] > most[1]) most = e;
    const family = most![0];
    out.push({
      feature: f,
      recorded: '',
      family,
      verdict: 'unrecorded',
      sightings: seen.filter((s) => s.family === family),
    });
  }
  return out;
}

/** The value to record for `family` on a feature: "Grey" for eyes, "Black" for hair. */
export function recordAs(family: string): string {
  return `${dartToUpperCase(family[0])}${family.substring(1)}`;
}

/** `looksIn` over the chapters as stored (each `chapterContents` row as JSON text), as a job to run away from the
 * screen. */
export function looksJob(
  storedContents: readonly string[],
  nodeIds: readonly string[],
  names: readonly string[],
  others: readonly string[],
): () => LookSighting[] {
  return () => {
    const wanted = new Set(nodeIds);
    const pages = new Map<string, string[]>();
    for (const json of storedContents) {
      let row: unknown;
      try {
        row = JSON.parse(json);
      } catch {
        continue;
      }
      if (typeof row !== 'object' || row === null || Array.isArray(row)) continue;
      const map = row as Record<string, unknown>;
      if (typeof map['id'] !== 'string' || !wanted.has(map['id'])) continue;
      pages.set(map['id'], blockTexts(map['doc']));
    }
    return looksIn(pages, nodeIds, names, { others });
  };
}
