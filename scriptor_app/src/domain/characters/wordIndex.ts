// A text read once into the words it holds, to ask of many names whether it names them. A port of `WordIndex` from
// flutter_app/lib/shared/domain/continuity/text.dart (the rest of that file is not ported yet), kept here for
// namedIn.ts.

import { dartTrim } from '../text/dartString';

const wordRun = /[\p{L}\p{N}]+/gu;
const wordAtStart = /[\p{L}\p{N}]+/uy;
const letterOrDigit = /^[\p{L}\p{N}]$/u;

/** `has` answers exactly as the original's `findWords(text, [term]).isNotEmpty` does (whole words, as written), but a
 * one-word name is a look-up rather than a search of the text. For asking a thousand names of the same chapter (who is
 * named where). */
export class WordIndex {
  private readonly words = new Set<string>();

  constructor(readonly text: string) {
    for (const m of text.matchAll(wordRun)) this.words.add(m[0]);
  }

  has(term: string): boolean {
    const t = dartTrim(term);
    if (t.length === 0) return false;
    wordAtStart.lastIndex = 0;
    const start = wordAtStart.exec(t);
    if (start !== null && start[0].length === t.length) return this.words.has(t);
    // A name of more than one word ("Mira Vance", "O'Brien"): found where nothing of a word touches either end.
    for (let at = this.text.indexOf(t); at >= 0; at = this.text.indexOf(t, at + 1)) {
      if (!this.wordCharBefore(at) && !this.wordCharAt(at + t.length)) return true;
    }
    return false;
  }

  private wordCharBefore(i: number): boolean {
    if (i <= 0) return false;
    const low = this.text.charCodeAt(i - 1);
    // A character outside the first plane is two code units: read it whole.
    const start =
      (low & 0xfc00) === 0xdc00 && i >= 2 && (this.text.charCodeAt(i - 2) & 0xfc00) === 0xd800 ? i - 2 : i - 1;
    return letterOrDigit.test(this.text.substring(start, i));
  }

  private wordCharAt(i: number): boolean {
    if (i >= this.text.length) return false;
    const high = this.text.charCodeAt(i);
    const end = (high & 0xfc00) === 0xd800 && i + 1 < this.text.length ? i + 2 : i + 1;
    return letterOrDigit.test(this.text.substring(i, end));
  }
}
