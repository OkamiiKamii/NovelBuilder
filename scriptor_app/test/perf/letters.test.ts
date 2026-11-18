// The fast readers of text/letters.ts give exactly what the patterns they replace give: on every fixture novel's text,
// the sample, and strings made of hard characters (letters beyond ASCII, marks, apostrophes, hyphens, digits, lone
// surrogates, characters beyond the 16-bit range).

import { docBlocks } from '../../src/domain/prose';
import { wordPattern, wordsOf } from '../../src/domain/manuscript/bestLines';
import { apostropheOrHyphen, countStanding, isLetter, isLetterOrNumber, isNumber, letterRuns, lettersOnly, runsOf } from '../../src/domain/text/letters';
import { standingPattern } from '../../src/domain/manuscript/trailer';
import { printPatterns } from '../../src/domain/analytics/bookPrint';
import { povWordPattern } from '../../src/domain/characters/pov';
import { allMatches } from '../../src/domain/characters/pageText';
import { flutterFixtures, sampleJson } from '../fixtures';

function textsOf(json: unknown): string[] {
  const contents = ((json as { collections?: Record<string, unknown[]> }).collections?.['chapterContents'] ?? []) as { doc?: unknown }[];
  return contents.flatMap((r) => docBlocks(r.doc).map((b) => b.text));
}

const plain = (ms: RegExpMatchArray[]) => ms.map((m) => [m[0], m.index]);

test('wordsOf finds the words the pattern finds, where it finds them, in every book', () => {
  const texts = [...flutterFixtures().flatMap((f) => textsOf(f.json)), ...textsOf(sampleJson())];
  expect(texts.length).toBeGreaterThan(100);
  for (const t of texts) expect(plain(wordsOf(t))).toEqual(plain([...t.matchAll(wordPattern)]));
});

test('…and in strings of hard characters', () => {
  const pieces = ['a', 'Z', 'é', 'ß', 'Ω', 'ж', '中', 'ا', '’', "'", '-', '—', ' ', '1', '.', '“', '̈', '\u{1D400}', '\u{10400}', '\uD800', '\uDC00', 'ª', 'µ', 'İ', '\t'];
  let seed = 7;
  const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648);
  for (let k = 0; k < 3000; k++) {
    let s = '';
    const len = next() % 24;
    for (let i = 0; i < len; i++) s += pieces[next() % pieces.length];
    expect([s, plain(wordsOf(s))]).toEqual([s, plain([...s.matchAll(wordPattern)])]);
  }
});

test('isLetter is \\p{L}, over every code point to U+FFFF and a sample above', () => {
  const p = /^\p{L}$/u;
  for (let cp = 0; cp <= 0xffff; cp++) {
    if (cp >= 0xd800 && cp <= 0xdfff) continue;
    if (isLetter(cp) !== p.test(String.fromCodePoint(cp))) throw new Error(`U+${cp.toString(16)}`);
  }
  for (let cp = 0x10000; cp <= 0x10ffff; cp += 97) expect([cp, isLetter(cp)]).toEqual([cp, p.test(String.fromCodePoint(cp))]);
});

test('allMatches gives what matchAll gives, empty matches and code points beyond 16 bits included', () => {
  const viaMatchAll = (re: RegExp, text: string) =>
    [...text.matchAll(re)].map((m) => ({ start: m.index, end: m.index + m[0].length, text: m[0], groups: m.slice(1) }));
  const patterns = [/\b/g, /a*/g, /(x)|(y)/g, /\p{L}*/gu, /(?:)/gu, /“([^”]+)”|"([^"]+)"/g, /[\p{L}][\p{L}’'-]*/gu, /\s+/g];
  const texts = ['', 'abc', 'xay yx', 'a\u{1D400}b\u{1D401}', '“Hi,” she said. "Go."', 'naïve café — ok', '\uD800x\uDC00'];
  for (const re of patterns) for (const t of texts) expect([String(re), t, allMatches(re, t)]).toEqual([String(re), t, viaMatchAll(re, t)]);
  expect(() => allMatches(/a/, 'a')).toThrow(TypeError);
});

test('runsOf and letterRuns give the runs each replaced pattern gives, in every book and in hard strings', () => {
  const texts = [...flutterFixtures().flatMap((f) => textsOf(f.json)), ...textsOf(sampleJson())];
  const pieces = ['a', 'Z', 'é', 'ß', 'Ω', 'ж', '中', '’', "'", '-', ' ', '1', '٣', 'Ⅻ', '½', '.', '“', '̈', '\u{1D400}', '\u{1D7D9}', '\uD800', 'ª'];
  let seed = 11;
  const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648);
  for (let k = 0; k < 2000; k++) {
    let t = '';
    const len = next() % 20;
    for (let i = 0; i < len; i++) t += pieces[next() % pieces.length];
    texts.push(t);
  }
  const inWordRun = (cp: number) => isLetterOrNumber(cp) || cp === 0x2019 || cp === 0x27;
  const cases: [string, RegExp, (t: string) => RegExpMatchArray[]][] = [
    ['letters (castNames)', /\p{L}+/gu, (t) => runsOf(t, isLetter)],
    ['runs (bookPrint, namedIn)', printPatterns.runs, (t) => runsOf(t, isLetterOrNumber)],
    ['wordRun (bookPrint)', printPatterns.wordRun, (t) => runsOf(t, inWordRun)],
    ['word (pov)', povWordPattern, (t) => letterRuns(t, apostropheOrHyphen)],
  ];
  for (const [name, re, fast] of cases) {
    for (const t of texts) expect([name, t, plain(fast(t))]).toEqual([name, t, plain([...t.matchAll(re)])]);
  }
});

test('isNumber is \\p{N}, over every code point to U+FFFF', () => {
  const p = /^\p{N}$/u;
  for (let cp = 0; cp <= 0xffff; cp++) {
    if (cp >= 0xd800 && cp <= 0xdfff) continue;
    if (isNumber(cp) !== p.test(String.fromCodePoint(cp))) throw new Error(`U+${cp.toString(16)}`);
  }
});

test('lettersOnly and countStanding give what their patterns give', () => {
  const books = [...flutterFixtures().flatMap((f) => textsOf(f.json)), ...textsOf(sampleJson())];
  for (const t of books) expect(lettersOnly(t)).toBe(t.replace(/[^\p{L}]/gu, ''));
  const all = books.join('\n');
  const names = ['Wren', 'Wren Hollis', 'Ilse', 'Marrow', 'the', 'a', 'Vell', 'Kit', '1131', 'Hollow Light', 'é', 'Old Merrow'];
  for (const name of names) expect([name, countStanding(all, name)]).toEqual([name, Array.from(all.matchAll(standingPattern(name))).length]);
  const pieces = ['Ab', 'b', 'é', '1', '٣', ' ', '-', '’', '\u{1D400}', '\uD835', '\uDC00', 'aa', 'Ab Ab', '.'];
  let seed = 3;
  const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648);
  for (let k = 0; k < 3000; k++) {
    let t = '';
    for (let i = next() % 16; i > 0; i--) t += pieces[next() % pieces.length];
    const name = pieces[next() % pieces.length] + (next() % 2 === 0 ? '' : pieces[next() % pieces.length]);
    expect([t, name, countStanding(t, name)]).toEqual([t, name, Array.from(t.matchAll(standingPattern(name))).length]);
    // A lone surrogate (half a character: never in typed text or JSON) is the one place the two part: the build's
    // rewriting of the negated class keeps it, \p{L} itself (and lettersOnly) does not. Checked on whole characters.
    if (!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(t)) {
      expect(lettersOnly(t)).toBe(t.replace(/[^\p{L}]/gu, ''));
    }
  }
});
