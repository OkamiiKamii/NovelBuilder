// NAMED IN THE TEXT: where the cast and the world are found in the manuscript by their names, as written, without
// anyone having linked them. A link in the text says for certain that a passage is about an entry; this says that the
// entry's name is on the page. Both together are where it is in the book. A port of
// flutter_app/lib/shared/domain/characters/named_in.dart.
//
// The names looked for, per entry (namesToFind):
//
// - its name ("Ilse Marrow", "The Drowned Road"), and without a leading "The" ("Drowned Road");
// - a character's aliases, as recorded in the profile;
// - each part of a character's name that is the character's alone ("Ilse", "Crane"; not "Marrow" when Kit Marrow is in
//   the cast too), three letters or more and not an everyday word;
// - the capitalised words of a character's epithet ("the Provost" gives "Provost"), when no one else has them.
//
// Names are matched as whole words, capitals as written, so "Wren" is a person and "wren" a bird. Pure TypeScript.

import { isMap, str } from '../json';
import { dartSort } from '../manuscript/dartSort';
import { blockTexts } from '../prose';
import { dartToLowerCase, dartTrim, dartTrimLeft, dartTrimRight } from '../text/dartString';
import { WordIndex } from './wordIndex';

export type NamedEntry = { id: string; name: string; category: string };
export type NamedProfile = { aliases: readonly string[]; epithet: string };

const everyday = new Set([
  'the', 'and', 'but', 'for', 'not', 'you', 'all', 'one', 'two', 'old', 'new', 'young', 'lady', 'lord', 'sir', 'mrs',
  'miss', 'master', 'mister', 'captain', 'king', 'queen', 'prince', 'princess', 'father', 'mother', 'brother', 'sister',
  'uncle', 'aunt', 'doctor', 'saint', 'grand', 'great', 'little', 'big', 'black', 'white', 'red', 'green', 'grey',
  'gray', 'blue', 'gold', 'silver', 'iron', 'stone', 'hope', 'will', 'may', 'june', 'april', 'august', 'grace', 'faith',
  'joy', 'rose', 'lily', 'dawn', 'sky', 'star', 'storm', 'rain', 'snow', 'winter', 'summer', 'autumn', 'spring',
  'north', 'south', 'east', 'west', 'son', 'daughter', 'van', 'von', 'der', 'del', 'des',
]);

function words(text: string): string[] {
  return [...text.matchAll(/[\p{L}\p{N}]+/gu)].map((m) => m[0]);
}

const capital = (w: string) => w[0] !== dartToLowerCase(w[0]);

export function namesToFind(
  entries: readonly NamedEntry[],
  profiles: ReadonlyMap<string, NamedProfile>,
): Record<string, string[]> {
  const out = new Map<string, Set<string>>();
  const parts = new Map<string, Set<string>>(); // part → the characters it belongs to
  for (const e of entries) {
    const name = dartTrim(e.name);
    if (!name) continue;
    if (!out.has(e.id)) out.set(e.id, new Set());
    const names = out.get(e.id)!;
    names.add(name);
    const noThe = name.replace(/^The\s+/, '');
    if (noThe !== name && noThe.length >= 3) names.add(noThe);
    if (e.category !== 'character') continue;
    const profile = profiles.get(e.id);
    for (const a of profile?.aliases ?? []) {
      if (dartTrim(a).length >= 2) names.add(dartTrim(a));
    }
    const epithet = profile?.epithet ?? '';
    const all = [...words(name), ...words(epithet).filter(capital)];
    if (all.length < 2 && !dartTrim(epithet)) continue;
    for (const w of all) {
      if (w.length >= 3 && capital(w) && !everyday.has(dartToLowerCase(w))) {
        if (!parts.has(w)) parts.set(w, new Set());
        parts.get(w)!.add(e.id);
      }
    }
  }
  for (const [part, owners] of parts) {
    if (owners.size === 1) out.get([...owners][0])!.add(part);
  }
  const result: Record<string, string[]> = {};
  for (const [id, names] of out) result[id] = [...names];
  return result;
}

const wordRun = /[\p{L}\p{N}]+/gu;

/** For each entry in `names`, the chapters and scenes (by id) whose text has one of its names, in `texts`' order. */
export function namedIn(
  texts: ReadonlyMap<string, string>,
  names: Readonly<Record<string, readonly string[]>>,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  // Each name read once: a single word is looked up among the page's words; a name of several words is looked for in
  // the text only where every one of its words is on the page.
  const prepared = new Map<string, { name: string; parts: string[]; single: boolean }[]>();
  for (const [id, wanted] of Object.entries(names)) {
    const list: { name: string; parts: string[]; single: boolean }[] = [];
    for (const n of wanted) {
      const parts = words(n);
      if (parts.length > 0) list.push({ name: n, parts, single: parts.length === 1 && parts[0] === n });
    }
    prepared.set(id, list);
  }
  for (const [nodeId, text] of texts) {
    if (text.length === 0) continue;
    const onPage = new Set([...text.matchAll(wordRun)].map((m) => m[0]));
    let index: WordIndex | null = null;
    for (const [entryId, wanted] of prepared) {
      if (
        wanted.some(
          (n) => n.parts.every((p) => onPage.has(p)) && (n.single || (index ??= new WordIndex(text)).has(n.name)),
        )
      ) {
        let list = out.get(entryId);
        if (list === undefined) out.set(entryId, (list = []));
        list.push(nodeId);
      }
    }
  }
  return out;
}

/** A stored chapter row read from its JSON text, or null when it cannot be read. */
function rowOf(json: string): Record<string, unknown> | null {
  try {
    const row: unknown = JSON.parse(json);
    return isMap(row) ? row : null;
  } catch (e) {
    if (e instanceof SyntaxError) return null;
    throw e;
  }
}

/** namedIn over the chapters as stored (each record as JSON text), as a job to run away from the screen: the book is
 * decoded and read in the job. Holding only plain data. A record that cannot be read is an empty page. */
export function namedInJob(
  storedContents: readonly string[],
  names: Readonly<Record<string, readonly string[]>>,
): () => Map<string, string[]> {
  return () => {
    const texts = new Map<string, string>();
    for (const json of storedContents) {
      const row = rowOf(json);
      if (row === null) continue;
      texts.set(str(row['id']), blockTexts(row['doc']).join('\n'));
    }
    return namedIn(texts, names);
  };
}

/** One place an entry is on the page: the chapter or scene, the paragraph (its index in the text), and the sentence it
 * is in, cut around `name` as found (`before`, `name`, `after`). */
export type Sighting = { nodeId: string; block: number; before: string; name: string; after: string };

/** The longest a sentence is shown; a longer one is cut around the name. */
export const sightingChars = 220;

// As Dart's RegExp.escape.
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** IN THEIR PAGES: for each of `nodeIds` (in reading order) with one of `names` on its page, the first sentence the
 * name is in. `pages` are each chapter's paragraphs. Names are whole words, capitals as written, the longest first
 * where two start together ("Ilse Marrow" before "Ilse"). */
export function sightings(
  pages: ReadonlyMap<string, readonly string[]>,
  nodeIds: readonly string[],
  names: readonly string[],
): Sighting[] {
  const wanted = dartSort(
    [...new Set(names.map((n) => dartTrim(n)))].filter((n) => n.length > 0),
    (a, b) => b.length - a.length,
  );
  if (wanted.length === 0) return [];
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(?:${wanted.map(escape).join('|')})(?![\\p{L}\\p{N}])`, 'u');
  const out: Sighting[] = [];
  for (const id of nodeIds) {
    const blocks = pages.get(id);
    if (blocks === undefined) continue;
    for (let i = 0; i < blocks.length; i++) {
      const text = blocks[i];
      const m = pattern.exec(text);
      if (m === null) continue;
      out.push(around(id, i, text, m.index, m.index + m[0].length));
      break;
    }
  }
  return out;
}

const stop = () => /[.!?…]["”’)]*\s/g;

function around(nodeId: string, block: number, text: string, start: number, end: number): Sighting {
  // The sentence: from just after the last full stop before the name to just after the first one after it.
  let from = 0;
  for (const m of text.matchAll(stop())) {
    if (m.index + m[0].length <= start) from = m.index + m[0].length;
  }
  const next = stop().exec(text.substring(end));
  let to = next === null ? text.length : end + next.index + next[0].length - 1;
  // Too long to show whole: as much either side of the name as fits, cut at a space.
  let lead = '';
  let tail = '';
  if (to - from > sightingChars) {
    const side = Math.trunc((sightingChars - (end - start)) / 2);
    if (start - from > side) {
      const cut = text.lastIndexOf(' ', start - side);
      from = cut < from ? start - side : cut + 1;
      lead = '…';
    }
    if (to - end > side) {
      const cut = text.indexOf(' ', end + side);
      to = cut < 0 || cut > to ? end + side : cut;
      tail = '…';
    }
  }
  return {
    nodeId,
    block,
    before: `${lead}${dartTrimLeft(text.substring(from, start))}`,
    name: text.substring(start, end),
    after: `${dartTrimRight(text.substring(end, to))}${tail}`,
  };
}

/** sightings over the chapters as stored (JSON text), as a job to run away from the screen. Only plain data in and
 * out. */
export function sightingsJob(
  storedContents: readonly string[],
  nodeIds: readonly string[],
  names: readonly string[],
): () => Sighting[] {
  return () => {
    const wanted = new Set(nodeIds);
    const pages = new Map<string, string[]>();
    for (const json of storedContents) {
      const row = rowOf(json);
      if (row === null || !wanted.has(row['id'] as string)) continue;
      pages.set(str(row['id']), blockTexts(row['doc']));
    }
    return sightings(pages, nodeIds, names);
  };
}
