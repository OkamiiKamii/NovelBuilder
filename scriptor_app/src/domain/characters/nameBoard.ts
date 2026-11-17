// THE NAME BOARD: every name in the book by the letter it starts with, and the names a reader could take for one
// another. Readers know names by their first letter and their shape before they read them through, so the old advice
// holds: spread the names across the alphabet, and keep the look-alikes apart ("Marrow" and "Merrow" on one page).
//
// - **By letter**: each name under the first letter of its first word ("The" and "A" left off: "The Drowned Road" is a
//   D). A letter with three or more is crowded.
// - **Look-alikes**, word by word between different names: one letter apart ("Marrow", "Merrow"; a letter changed,
//   added, dropped, or two swapped); or beginning and ending alike ("Elara", "Elena"); or the same first three letters
//   ("Aldous", "Aldric"). A word two names share whole is a family's, not a slip, and is left alone; so is a word built
//   on another ("Ferry", "Ferrymen").
// - **Free letters**: the ones no name begins with yet, room for the next.
//
// A port of flutter_app/lib/shared/domain/text/name_board.dart (kept here, beside the cast's other readings). Reads
// only.

import { dartToUpperCase } from '../exchange/dartUpperCase';
import { dartSort } from '../manuscript/dartSort';
import { dartToLowerCase, dartTrim } from '../text/dartString';

/** A name on the board: what it is, whose (an entry's id), and what kind of thing it names. */
export type BoardName = { name: string; id: string; kind: string };

/** Two words a reader could take for one another, the names they are in, and why. */
export type LookAlike = { wordA: string; wordB: string; inA: BoardName[]; inB: BoardName[]; why: string };

/** How many names make a letter crowded. */
export const crowded = 3;

const skip = new Set(['the', 'a', 'an', 'of', 'and']);

const byCodeUnits = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The words of `name` a reader goes by: capitalised, three letters or more, "The" and "of" left out. */
export function nameWords(name: string): string[] {
  const out: string[] = [];
  for (const w of dartTrim(name).split(/[\s-]+/)) {
    if (w.length >= 3 && !skip.has(dartToLowerCase(w)) && /^\p{Lu}/u.test(w)) {
      out.push(w.replace(/[’']s$/, '').replace(/[^\p{L}]/gu, ''));
    }
  }
  return out;
}

const accents: Readonly<Record<string, string>> = {
  á: 'a', à: 'a', â: 'a', ä: 'a', ã: 'a', å: 'a', Á: 'A', À: 'A', Â: 'A', Ä: 'A', Å: 'A', é: 'e', è: 'e', ê: 'e',
  ë: 'e', É: 'E', È: 'E', Ê: 'E', í: 'i', î: 'i', ï: 'i', Í: 'I', ó: 'o', ô: 'o', ö: 'o', õ: 'o', Ó: 'O', Ö: 'O',
  ú: 'u', û: 'u', ü: 'u', Ú: 'U', Ü: 'U', ñ: 'n', Ñ: 'N', ç: 'c', Ç: 'C', ø: 'o', Ø: 'O',
};

/** The letter `name` is shelved under: its first word's first letter, "The" and "A" left off; '#' for any other. */
export function initialOf(name: string): string {
  const words = dartTrim(name)
    .split(/\s+/)
    .filter((w) => w.length > 0);
  while (words.length > 1 && skip.has(dartToLowerCase(words[0]))) words.shift();
  if (words.length === 0) return '#';
  const c = words[0][0];
  const first = dartToUpperCase(Object.prototype.hasOwnProperty.call(accents, c) ? accents[c] : c);
  return /^[A-Z]$/.test(first) ? first : '#';
}

/** `name` as it is shelved: lower case, "The" and "A" left off the front. */
function shelved(name: string): string {
  const words = dartToLowerCase(dartTrim(name)).split(/\s+/);
  while (words.length > 1 && skip.has(words[0])) words.shift();
  return words.join(' ');
}

/** The names of `names` by the letter they start with, A to Z (and '#' last, when any), each letter's as shelved. */
export function byLetter(names: readonly BoardName[]): Map<string, BoardName[]> {
  const out = new Map<string, BoardName[]>();
  for (let c = 65; c <= 90; c++) out.set(String.fromCharCode(c), []);
  for (const n of names) {
    if (dartTrim(n.name).length === 0) continue;
    const letter = initialOf(n.name);
    let list = out.get(letter);
    if (list === undefined) out.set(letter, (list = []));
    list.push(n);
  }
  // As shelved: "The Wardens’ Tower" among the W's as "Wardens’ Tower".
  for (const list of out.values()) dartSort(list, (a, b) => byCodeUnits(shelved(a.name), shelved(b.name)));
  return out;
}

/** The letters no name begins with. */
export function freeLetters(board: ReadonlyMap<string, readonly BoardName[]>): string[] {
  const out: string[] = [];
  for (const [letter, names] of board) if (letter !== '#' && names.length === 0) out.push(letter);
  return out;
}

/** Whether `a` and `b` are one letter apart: one changed, added or dropped, or two side by side swapped. */
export function oneApart(a: string, b: string): boolean {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    if (a.substring(i + 1) === b.substring(i + 1)) return true;
    return i + 1 < a.length && a[i] === b[i + 1] && a[i + 1] === b[i] && a.substring(i + 2) === b.substring(i + 2);
  }
  const [long, short] = a.length > b.length ? [a, b] : [b, a];
  return long.substring(i + 1) === short.substring(i);
}

const rank: Readonly<Record<string, number>> = {
  'one letter apart': 0,
  'beginning and ending alike': 1,
  'the same first three letters': 2,
};

/** The look-alikes among `names`, word by word between different names: the closest kind first. */
export function lookAlikes(names: readonly BoardName[]): LookAlike[] {
  // Each word, and the names it is in.
  const words = new Map<string, BoardName[]>();
  for (const n of names) {
    for (const w of new Set(nameWords(n.name))) {
      let list = words.get(w);
      if (list === undefined) words.set(w, (list = []));
      if (!list.some((x) => x.id === n.id)) list.push(n);
    }
  }
  const keys = [...words.keys()].sort(byCodeUnits);
  const out: LookAlike[] = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = keys[i];
      const b = keys[j];
      const la = dartToLowerCase(a);
      const lb = dartToLowerCase(b);
      // The same word, or one built on the other ("Ferry", "Ferrymen"): kin, not look-alikes.
      if (la === lb || la.startsWith(lb) || lb.startsWith(la)) continue;
      // Only between different names: a name is not its own look-alike.
      const ids = new Set(words.get(a)!.map((n) => n.id));
      if (words.get(b)!.every((n) => ids.has(n.id))) continue;
      let why: string | null = null;
      if (la.length >= 4 && lb.length >= 4 && oneApart(la, lb)) {
        why = 'one letter apart';
      } else if (
        la.length >= 4 &&
        lb.length >= 4 &&
        Math.abs(la.length - lb.length) <= 1 &&
        la.substring(0, 2) === lb.substring(0, 2) &&
        la[la.length - 1] === lb[lb.length - 1]
      ) {
        why = 'beginning and ending alike';
      } else if (la.length >= 5 && lb.length >= 5 && la.substring(0, 3) === lb.substring(0, 3)) {
        why = 'the same first three letters';
      }
      if (why !== null) out.push({ wordA: a, wordB: b, inA: words.get(a)!, inB: words.get(b)!, why });
    }
  }
  return dartSort(out, (x, y) => rank[x.why] - rank[y.why]);
}
