// Letters, read fast. Patterns like /[\p{L}]…/u are turned by the app's build (Babel's unicode-regex transform, for the
// phone's engine) into one huge character class, and running one over a whole book is most of what reading it costs
// (measured on the 300,000-word test novel: test/perf). These read the same letters a character at a time: ASCII by
// its code, anything else once by the same `\p{L}` and then from a table. Results are exactly the patterns' results
// (test/perf/letters.test.ts checks them against the patterns).

const letterPattern = /^\p{L}$/u;
const seen = new Map<number, boolean>();

/** Whether the code point `cp` is a letter (`\p{L}`). */
export function isLetter(cp: number): boolean {
  if (cp < 0x80) return (cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a);
  let is = seen.get(cp);
  if (is === undefined) {
    is = letterPattern.test(String.fromCodePoint(cp));
    seen.set(cp, is);
  }
  return is;
}

/** A match as `String.matchAll` gives it (`[0]` the words, `index` where they start), without the pattern's cost. */
function matchOf(text: string, start: number, end: number): RegExpMatchArray {
  const m = [text.slice(start, end)] as unknown as RegExpMatchArray;
  m.index = start;
  m.input = text;
  return m;
}

/** The runs of `text` that `/[\p{L}][\p{L}…]*` + "gu" would match, where after the first letter `alsoInside` says which
 * other characters (by code point) a word may hold: each run a letter, then letters and those, as long as it goes. */
export function letterRuns(text: string, alsoInside: (cp: number) => boolean): RegExpMatchArray[] {
  const out: RegExpMatchArray[] = [];
  const n = text.length;
  let i = 0;
  // Counted: `i` moves on by at least one each turn.
  while (i < n) {
    const cp = text.codePointAt(i)!;
    const width = cp > 0xffff ? 2 : 1;
    if (!isLetter(cp)) {
      i += width;
      continue;
    }
    let j = i + width;
    while (j < n) {
      const c = text.codePointAt(j)!;
      if (!isLetter(c) && !alsoInside(c)) break;
      j += c > 0xffff ? 2 : 1;
    }
    out.push(matchOf(text, i, j));
    i = j;
  }
  return out;
}

const numberPattern = /^\p{N}$/u;
const numbers = new Map<number, boolean>();

/** Whether the code point `cp` is a number (`\p{N}`: digits, and the numerals of other scripts). */
export function isNumber(cp: number): boolean {
  if (cp < 0x80) return cp >= 0x30 && cp <= 0x39;
  let is = numbers.get(cp);
  if (is === undefined) {
    is = numberPattern.test(String.fromCodePoint(cp));
    numbers.set(cp, is);
  }
  return is;
}

/** A letter or a number (`[\p{L}\p{N}]`). */
export const isLetterOrNumber = (cp: number): boolean => isLetter(cp) || isNumber(cp);

/** What a word may hold after its first letter besides letters (the pattern `[\p{L}][\p{L}’'\-]*`): ’ ' -. */
export const apostropheOrHyphen = (cp: number): boolean => cp === 0x2019 || cp === 0x27 || cp === 0x2d;

/** The runs of `text` that `/[…]+/gu` matches, where `inRun` says which characters (by code point) are in the class:
 * each run as long as it goes. */
export function runsOf(text: string, inRun: (cp: number) => boolean): RegExpMatchArray[] {
  const out: RegExpMatchArray[] = [];
  const n = text.length;
  let i = 0;
  // Counted: `i` moves on by at least one each turn.
  while (i < n) {
    const cp = text.codePointAt(i)!;
    if (!inRun(cp)) {
      i += cp > 0xffff ? 2 : 1;
      continue;
    }
    let j = i;
    while (j < n) {
      const c = text.codePointAt(j)!;
      if (!inRun(c)) break;
      j += c > 0xffff ? 2 : 1;
    }
    out.push(matchOf(text, i, j));
    i = j;
  }
  return out;
}

/** `text` with every character that is not a letter taken out (as `.replace(/[^\p{L}]/gu, '')`). */
export function lettersOnly(text: string): string {
  let out = '';
  const n = text.length;
  for (let i = 0; i < n; ) {
    const cp = text.codePointAt(i)!;
    const width = cp > 0xffff ? 2 : 1;
    if (isLetter(cp)) out += text.slice(i, i + width);
    i += width;
  }
  return out;
}

const isHigh = (c: number) => c >= 0xd800 && c <= 0xdbff;
const isLow = (c: number) => c >= 0xdc00 && c <= 0xdfff;

/** How many times `name` stands in `text` as words of its own, no letter or digit right before or after it: the matches
 * of `/(?<![\p{L}\p{N}])name(?![\p{L}\p{N}])/gu` (name taken literally), found with indexOf and a look at the two
 * characters around, not by running the pattern over the whole text. */
export function countStanding(text: string, name: string): number {
  if (name.length === 0) return 0;
  let n = 0;
  // Counted: each turn moves `from` on by at least one.
  for (let from = 0; from <= text.length; ) {
    const at = text.indexOf(name, from);
    if (at < 0) break;
    const end = at + name.length;
    let ok = true;
    // With the u flag a match never starts or ends inside a pair of surrogates (one character).
    if (at > 0 && isLow(text.charCodeAt(at)) && isHigh(text.charCodeAt(at - 1))) ok = false;
    if (ok && end < text.length && isLow(text.charCodeAt(end)) && isHigh(text.charCodeAt(end - 1))) ok = false;
    if (ok && at > 0) {
      const last = text.charCodeAt(at - 1);
      const before = isLow(last) && at >= 2 && isHigh(text.charCodeAt(at - 2)) ? text.codePointAt(at - 2)! : last;
      if (isLetterOrNumber(before)) ok = false;
    }
    if (ok && end < text.length && isLetterOrNumber(text.codePointAt(end)!)) ok = false;
    if (ok) {
      n++;
      from = end;
    } else {
      from = at + 1;
    }
  }
  return n;
}
