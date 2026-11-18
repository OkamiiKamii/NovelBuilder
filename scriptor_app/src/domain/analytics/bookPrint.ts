// THE BOOK'S FINGERPRINT: the whole novel as a print, every paragraph a thread. Each paragraph is given to the
// character it is about (the one named most in it, or, when none is named, whoever the scene was with), and marked
// when someone speaks in it. Drawn chapter by chapter, it shows at a glance whose book it is, where each one's scenes
// fall, and how much of it is talk; no two books make the same print. Reads only.
//
// A port of flutter_app/lib/shared/domain/analytics/book_print.dart.

import { dartEscape } from '../characters/pageText';
import { storedParagraphs } from '../manuscript/bestLines';
import { dartSort } from '../manuscript/dartSort';
import { dartTrim } from '../text/dartString';

/** One paragraph: its words, whose it is (a character's id, or null), and whether anyone speaks in it. */
export type PrintLine = { words: number; who: string | null; spoken: boolean };

/** One chapter (or scene): its id, title and paragraphs. */
export type PrintChapter = { id: string; title: string; lines: PrintLine[] };

/** The print: its chapters in reading order, and for each character how many paragraphs are theirs. */
export type BookPrint = { chapters: PrintChapter[]; shares: Map<string, number> };

const wordRun = /[\p{L}\p{N}’']+/gu;
const speech = /[“”"]/;

/** Runs of letters and digits: a name matched as whole words has each of its own runs as a whole run of the text. */
const runs = /[\p{L}\p{N}]+/gu;

const count = (re: RegExp, text: string): number => Array.from(text.matchAll(re)).length;

/** The paragraphs of one chapter as threads: each given to the character named most in it, else to the one the scene
 * was with (the last named before it in the chapter), else to no one. `names` are each character's name patterns;
 * with `words` (`nameWords`), a character none of whose names has all its words in a paragraph is passed over without
 * a search. The same threads, far fewer searches. */
export function printLines(
  paragraphs: readonly string[],
  names: ReadonlyMap<string, RegExp>,
  options: { words?: ReadonlyMap<string, string[][]> } = {},
): PrintLine[] {
  const words = options.words ?? null;
  const out: PrintLine[] = [];
  let scene: string | null = null;
  for (const p of paragraphs) {
    if (dartTrim(p).length === 0) continue;
    let who: string | null = null;
    let most = 0;
    const held = words === null ? null : new Set(Array.from(p.matchAll(runs), (m) => m[0]));
    for (const [id, pattern] of names) {
      if (held !== null && !(words!.get(id) ?? []).some((w) => w.every((x) => held.has(x)))) continue;
      const n = count(pattern, p);
      if (n > most) {
        most = n;
        who = id;
      }
    }
    if (who !== null) scene = who;
    out.push({ words: count(wordRun, p), who: who ?? scene, spoken: speech.test(p) });
  }
  return out;
}

/** A pattern for each character's names, whole words, capitals as written. */
export function namePatterns(names: ReadonlyMap<string, readonly string[]>): Map<string, RegExp> {
  const out = new Map<string, RegExp>();
  for (const [id, list] of names) {
    const kept = list.filter((n) => dartTrim(n).length >= 2);
    if (kept.length === 0) continue;
    const sorted = dartSort([...kept], (a, b) => b.length - a.length);
    out.set(id, new RegExp(`(?<![\\p{L}\\p{N}])(?:${sorted.map(dartEscape).join('|')})(?![\\p{L}\\p{N}])`, 'gu'));
  }
  return out;
}

/** Each character's names (those `namePatterns` looks for) as their runs of letters and digits. */
export function nameWords(names: ReadonlyMap<string, readonly string[]>): Map<string, string[][]> {
  const out = new Map<string, string[][]>();
  for (const [id, list] of names) {
    out.set(
      id,
      list.filter((n) => dartTrim(n).length >= 2).map((n) => Array.from(n.matchAll(runs), (m) => m[0])),
    );
  }
  return out;
}

/** The print of `chapters` (in reading order) from `pages` (each chapter's paragraphs), `names` each character's names. */
export function bookPrint(
  chapters: readonly { id: string; title: string }[],
  pages: ReadonlyMap<string, readonly string[]>,
  names: ReadonlyMap<string, readonly string[]>,
): BookPrint {
  const patterns = namePatterns(names);
  const words = nameWords(names);
  const out: PrintChapter[] = [];
  const shares = new Map<string, number>();
  for (const c of chapters) {
    const lines = printLines(pages.get(c.id) ?? [], patterns, { words });
    for (const l of lines) {
      if (l.who !== null) shares.set(l.who, (shares.get(l.who) ?? 0) + 1);
    }
    out.push({ id: c.id, title: c.title, lines });
  }
  return { chapters: out, shares };
}

/** `bookPrint` over the chapters as stored (JSON text, a row each), as a job to run away from the screen. */
export function bookPrintJob(
  chapters: readonly { id: string; title: string }[],
  storedContents: readonly string[],
  names: ReadonlyMap<string, readonly string[]>,
): () => BookPrint {
  return () => bookPrint(chapters, storedParagraphs(storedContents, chapters.map((c) => c.id)), names);
}
