// SET LIKE A BOOK: how a printed novel opens a chapter and breaks a scene, as rules over the author's own text. Reads
// only: the page is drawn so, and the words are never changed. Pure TypeScript (it also runs in the editor's
// WebView). A port of flutter_app/lib/shared/domain/text/book_setting.dart.

import { dartTrim } from './dartString';

// These two have no unicode flag in the Dart either: every character in them is a single UTF-16 unit.
const breakMarks = /^[\s*#~•·⁂❦✦◆◇§=_\-–—]+$/;
const markChar = /[*#~•·⁂❦✦◆◇§]/;

/** Whether a paragraph is a scene break as writers type one: nothing but marks (`***`, `* * *`, `#`, `~~~`, `⁂`), and
 * at least one of them a star, a hash, a tilde or an ornament (a line of dashes alone is a dash, not a break). */
export function isSceneBreak(text: string): boolean {
  const t = dartTrim(text);
  return t.length > 0 && t.length <= 24 && breakMarks.test(t) && markChar.test(t);
}

const opener = /^[“"‘'(«\[]*[\p{L}\p{N}]/u;
const wordRun = /[\p{L}\p{N}’\x27\-]+/gu;
const senseBreak = /[,.;:!?…—–"“”]/;

/** The words set in small capitals after the initial: up to this many. */
export const smallCapWords = 4;

/** Where a chapter's opening is set apart: the raised initial ends at `initialEnd`, the small capitals at `capsEnd`
 * (UTF-16 indices into the paragraph). */
export type ChapterOpening = { initialEnd: number; capsEnd: number };

/** How a chapter's first paragraph opens: the raised initial (any opening quotation marks with the first letter) ends
 * at `initialEnd`; the small capitals run on from there to `capsEnd`, through the rest of the first word and up to
 * `smallCapWords` words, stopping at the first comma, stop, colon, dash or quotation. Null when the paragraph does
 * not begin with a letter or a figure (after any opening quotation marks). */
export function chapterOpening(text: string): ChapterOpening | null {
  const m = opener.exec(text);
  if (m === null) return null;
  const initialEnd = m.index + m[0].length;
  let capsEnd = initialEnd;
  let words = 0;
  for (const w of text.matchAll(wordRun)) {
    const wStart = w.index;
    const wEnd = wStart + w[0].length;
    if (wEnd <= initialEnd) continue;
    // Stop at the first break in the sense: punctuation between the last word and this one.
    // (The first word may begin inside the initial: "T|he".)
    const between = wStart > capsEnd ? text.substring(capsEnd, wStart) : '';
    if (senseBreak.test(between)) break;
    capsEnd = wEnd;
    words++;
    if (words >= smallCapWords) break;
  }
  return { initialEnd, capsEnd };
}
