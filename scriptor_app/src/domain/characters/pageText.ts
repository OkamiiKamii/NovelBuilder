// What the readings of the cast in the pages share (castNames.ts, pov.ts, entrances.ts, feelingArcs.ts, voice.ts,
// voicePrint.ts, tableRead.ts, unnamedRoles.ts): the matches of a pattern with where each starts and ends, a pattern
// matched at a place only, a name escaped for a pattern as Dart's `RegExp.escape` does, the sentence at a place, and the
// chapters as stored read for their blocks (each Dart file's job reads them the same way). Pure TypeScript.

import { isMap } from '../json';
import { docBlocks } from '../prose';
import { dartTrim } from '../text/dartString';

/** A match: where it starts and ends, and its groups (undefined for a group that took no part, Dart's null). */
export type Found = { start: number; end: number; text: string; groups: (string | undefined)[] };

/** Every match of `re` in `text`, in order (Dart's `allMatches`). `re` needs the `g` flag. */
export function allMatches(re: RegExp, text: string): Found[] {
  const out: Found[] = [];
  // As `text.matchAll(re)` does (a copy of the pattern from the start; past an empty match, on by one character, a
  // whole code point with the u flag), without the iterator the phone's build makes of it. Counted: each turn moves on.
  if (!re.global) throw new TypeError('allMatches needs a pattern with the g flag, as matchAll does.');
  const copy = new RegExp(re);
  copy.lastIndex = 0;
  const unicode = copy.unicode || copy.flags.includes('v');
  for (let turn = 0; turn <= text.length + 1; turn++) {
    const m = copy.exec(text);
    if (m === null) break;
    out.push({ start: m.index, end: m.index + m[0].length, text: m[0], groups: m.slice(1) });
    if (m[0].length === 0) copy.lastIndex = stepOn(text, copy.lastIndex, unicode);
  }
  return out;
}

/** The place after `at`: one code unit on, or a whole code point with the u flag (the spec's AdvanceStringIndex). */
function stepOn(text: string, at: number, unicode: boolean): number {
  if (!unicode || at + 1 >= text.length) return at + 1;
  const c = text.charCodeAt(at);
  if (c < 0xd800 || c > 0xdbff) return at + 1;
  const d = text.charCodeAt(at + 1);
  return d >= 0xdc00 && d <= 0xdfff ? at + 2 : at + 1;
}

/** The first match of `re` in `text`, or null (Dart's `firstMatch`). */
export function firstMatch(re: RegExp, text: string): Found | null {
  const flags = re.flags.replace(/[gy]/g, '');
  const m = new RegExp(re.source, flags).exec(text);
  return m === null ? null : { start: m.index, end: m.index + m[0].length, text: m[0], groups: m.slice(1) };
}

/** `re` matched only where it starts at `at` (Dart's `matchAsPrefix(text, at)`). `re` needs the `y` flag. */
export function matchAt(re: RegExp, text: string, at: number): Found | null {
  re.lastIndex = at;
  const m = re.exec(text);
  return m === null ? null : { start: m.index, end: m.index + m[0].length, text: m[0], groups: m.slice(1) };
}

/** `text` with every character a pattern reads as syntax escaped, as Dart's `RegExp.escape` escapes them: `$()*+.?[\]^{|}`
 * and nothing else (so a pattern of it is also valid with the `u` flag). */
export function dartEscape(text: string): string {
  return text.replace(/[$()*+.?[\\\]^{|}]/g, (c) => `\\${c}`);
}

/** Dart's `clamp` on numbers. */
export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** A sentence: a run up to its end marks (and the quotes closing after them), or the rest of the text. */
export const sentencePattern = /[^.!?…]+[.!?…]+["”’]*|[^.!?…]+$/g;

/** The sentence of `text` that ends after `at` (the first one), trimmed; the whole text when none does. */
export function sentenceAt(text: string, at: number): string {
  for (const m of allMatches(sentencePattern, text)) {
    if (m.end > at) return dartTrim(m.text);
  }
  return dartTrim(text);
}

/** A stored chapter row read from its JSON text, or null when it is not JSON (Dart's FormatException) or not a map. */
function rowOf(json: string): Record<string, unknown> | null {
  try {
    const row: unknown = JSON.parse(json);
    return isMap(row) ? row : null;
  } catch (e) {
    if (e instanceof SyntaxError) return null;
    throw e;
  }
}

/** The stored chapters (each record as JSON text, as `CharacterService.storedChapters` gives them) that are among
 * `wanted`, read with `read` from their `doc`, by id (a later record of the same id in place of an earlier one). */
export function storedPages<T>(
  storedContents: readonly string[],
  wanted: ReadonlySet<string>,
  read: (doc: unknown) => T,
): Map<string, T> {
  const pages = new Map<string, T>();
  for (const json of storedContents) {
    const row = rowOf(json);
    if (row === null) continue;
    const id = row['id'];
    if (typeof id !== 'string' || !wanted.has(id)) continue;
    pages.set(id, read(row['doc']));
  }
  return pages;
}

/** A chapter's paragraphs, headings left out. */
export function paragraphsOf(doc: unknown): string[] {
  return docBlocks(doc)
    .filter((b) => !b.heading)
    .map((b) => b.text);
}

/** A chapter's blocks, headings marked. */
export function blocksOf(doc: unknown): { heading: boolean; text: string }[] {
  return docBlocks(doc);
}
