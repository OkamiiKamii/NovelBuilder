// NAME KEYS: a writer's keyboard knows English, not the book. "Mimir Forest", "Ilse Marrow", "Smart Atoms": the names a
// novel is made of are the words its writer types most and the phone's keyboard guesses worst. These are the book's own
// names offered as keys: the ones that complete the word being typed, else the ones already on this page.
//
// Reads only: a key puts a name in only when it is pressed. Pure TypeScript (it also runs in the editor's WebView). A
// port of flutter_app/lib/shared/domain/text/name_keys.dart.

import { dartToLowerCase } from './dartString';

/** One key: whose name it is (the entry's id) and the name as it is to be written. */
export type NameKey = { id: string; name: string };

/** The most keys offered at once. */
export const nameKeysShown = 6;

const wordEnd = /[\p{L}\p{N}'’\-]+$/u;
const letter = /[\p{L}\p{N}]/u;

/** The word being typed: the run of letters that ends at [caret] (a UTF-16 index) in [text], and where it starts. Null
 * when the caret is not at the end of a word (in the middle of one, or after a space). */
export function wordAt(text: string, caret: number): { start: number; word: string } | null {
  if (caret <= 0 || caret > text.length) return null;
  if (caret < text.length && letter.test(text[caret])) return null;
  const m = wordEnd.exec(text.substring(0, caret));
  if (m === null) return null;
  return { start: m.index, word: m[0] };
}

/** The names that complete [partial], best first: two letters or more, a capital first (names are written so, and so
 * "the" and "him" call up nothing), matched without regard to case after it. A name the word already is, whole, is not
 * offered, nor one that begins "The" (its shorter form is). Names of entries in [present] (this chapter's,
 * most-mentioned first) come first, then the shorter name, as prose uses the first name more than the whole one. */
export function completionsFor(
  partial: string,
  names: Readonly<Record<string, readonly string[]>>,
  present: readonly string[] = [],
): NameKey[] {
  if (partial.length < 2 || partial[0] === dartToLowerCase(partial[0])) return [];
  const want = dartToLowerCase(partial);
  const rank = new Map<string, number>();
  present.forEach((id, i) => rank.set(id, i));
  const found = new Map<string, NameKey>();
  for (const [id, list] of Object.entries(names)) {
    for (const name of list) {
      if (name.startsWith('The ') || name === partial || name.length <= partial.length) continue;
      if (!dartToLowerCase(name).startsWith(want)) continue;
      if (!found.has(name)) found.set(name, { id, name });
    }
  }
  const keys = [...found.values()].sort((a, b) => {
    const ra = rank.get(a.id) ?? 1 << 20;
    const rb = rank.get(b.id) ?? 1 << 20;
    if (ra !== rb) return ra - rb;
    if (a.name.length !== b.name.length) return a.name.length - b.name.length;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
  return keys.slice(0, nameKeysShown);
}

/** The names on the page already, as keys, in [present]'s order, for when nothing is being typed: each by its first
 * name when that is a name it goes by ("Wren" for Wren Hollis), otherwise its name. */
export function pageKeys(names: Readonly<Record<string, readonly string[]>>, present: readonly string[]): NameKey[] {
  const out: NameKey[] = [];
  for (const id of present) {
    const list = (Object.hasOwn(names, id) ? names[id] : []).filter((n) => !n.startsWith('The '));
    if (list.length === 0) continue;
    const first = list[0].split(' ')[0];
    out.push({ id, name: list.includes(first) ? first : list[0] });
    if (out.length === nameKeysShown) break;
  }
  return out;
}
