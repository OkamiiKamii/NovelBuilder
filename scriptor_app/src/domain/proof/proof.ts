// BEFORE A READER SEES IT: the slips a proofreader marks, over the whole book, found by rule and never by guessing, so
// a draft can go to a beta reader, a writing group or an agent without them. What the red pencil marks (echoes, long
// sentences, fillers) and the gaps left to fill are not here; these are the mistakes no one means: a name slip ("Jmaes"
// where James is meant), a doubled word, a past form after "didn't", an unclosed quotation, the odd straight or curly
// quote, spacing, a small letter starting a sentence or "i" for "I", and a chapter with no title or no words. It only
// reads: each is shown where it is, to be put right by the author in the chapter. A port of
// flutter_app/lib/shared/domain/text/proof.dart.

import { dartEscape } from '../characters/pageText';
import { isMap } from '../json';
import { dartSort } from '../manuscript/dartSort';
import { docBlocks } from '../prose';
import { dartToLowerCase, dartTrim, dartTrimLeft } from '../text/dartString';

/** The kinds of slip, in the order they are listed. */
export type Slip = 'name' | 'doubled' | 'didnt' | 'unclosed' | 'quotes' | 'spacing' | 'small' | 'chapter';
export const slips: readonly Slip[] = ['name', 'doubled', 'didnt', 'unclosed', 'quotes', 'spacing', 'small', 'chapter'];
/** What the list of each is called. */
export const slipTitle: Readonly<Record<Slip, string>> = {
  name: 'Name slips',
  doubled: 'Doubled words',
  didnt: 'After “didn’t”',
  unclosed: 'Unclosed quotations',
  quotes: 'Straight and curly quotes',
  spacing: 'Spacing',
  small: 'Small letters',
  chapter: 'Chapters',
};

/** A slip: its kind, the chapter (1 first) and its id, the paragraph, the text it is found in (a sentence or so) and
 * where in it the slip is, what is said of it, and the words to find it by. */
export type Proof = {
  kind: Slip;
  chapter: number;
  nodeId: string;
  block: number;
  text: string;
  start: number;
  end: number;
  note: string;
  find: string;
};

/** A chapter for the proof: its id, its title, and its paragraphs (every block, a heading as `null`). */
export type ProofChapter = { id: string; title: string; paragraphs: readonly (string | null)[] };

/** The most slips of one kind that are listed. */
export const proofsKept = 60;

const word = /[\p{L}][\p{L}’'\-]*/gu;
const doubled = /(?<![\p{L}’'])([\p{L}’']+)\s+\1(?![\p{L}’'])/giu;
const didnt = /\b(didn[’']t|doesn[’']t|don[’']t|did not|does not|do not)\s+([a-z]+ed)\b/gi;
const spaceBefore = /(?<=\S) +([,.;:!?])(?![.\d])/g;
const doubleSpace = /(?<=\S) {2,}(?=\S)/g;
const smallStart = /(?<=[a-z]{2})\. +([a-z])/g;
const lowerI = /(?<![\p{L}.])i(?=[ ’',]|$)(?![.])/gu;
const abbreviations = new Set(['mr', 'mrs', 'ms', 'dr', 'st', 'vs', 'etc', 'eg', 'ie', 'no', 'vol', 'ch', 'cf', 'approx']);
const doublesAllowed = new Set(['had', 'that', 'is', 'very', 'no', 'bye', 'so', 'knock', 'tick', 'tock', 'ha', 'too']);
const endsInEd = new Set([
  'need', 'feed', 'seed', 'bleed', 'speed', 'proceed', 'exceed', 'succeed', 'shed', 'red', 'bed', 'wed', 'shred',
  'breed', 'heed', 'weed', 'deed', 'indeed', 'embed', 'sled', 'fled', 'led', 'bred', 'sped', 'misled',
]); // prettier-ignore

/** The plain verb of a past form: "looked" is "look", "tried" is "try", "stopped" is "stop". */
export function plainOf(past: string): string {
  const w = dartToLowerCase(past);
  if (w.endsWith('ied') && w.length > 4) return `${w.substring(0, w.length - 3)}y`;
  const stem = w.substring(0, w.length - 2);
  if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2] && !'lsz'.includes(stem[stem.length - 1])) {
    return stem.substring(0, stem.length - 1);
  }
  // "liked", "hoped": the e was the verb's.
  if (/[^aeiou][aeiou][^aeiouwxy]$/.test(stem) && stem.length <= 4) return `${stem}e`;
  return stem;
}

/** The edits between `a` and `b`, up to 2 (more is 2). */
function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 1) return 2;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  let j = 0;
  while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  const restA = a.length - i - j;
  const restB = b.length - i - j;
  if (restA <= 1 && restB <= 1) return restA === 0 && restB === 0 ? 0 : 1;
  // Two letters the wrong way about.
  if (restA === 2 && restB === 2 && a[i] === b[i + 1] && a[i + 1] === b[i]) return 1;
  return 2;
}

const clampInt = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** The sentence of `text` around `at`, as [its start, the sentence]. Each walk is bounded by the text's length. */
function sentenceAround(text: string, at: number): [number, string] {
  let start = at;
  while (start > 0 && '.!?…'.includes(text[start - 1]) === false) start--;
  // The quote that closes the sentence before is that sentence's ("coming." With that…).
  while (start > 0 && start < at && '"”’ '.includes(text[start])) start++;
  let end = at;
  while (end < text.length && !'.!?…'.includes(text[end])) end++;
  if (end < text.length) end++;
  while (end < text.length && '"”’'.includes(text[end])) end++;
  // Too long to show: the words near it.
  if (end - start > 220) {
    start = clampInt(at - 90, 0, text.length);
    end = clampInt(at + 110, 0, text.length);
  }
  return [start, text.substring(start, end)];
}

/** How many times `of` (one character) is in `text`. */
function countOf(text: string, of: string): number {
  let n = 0;
  for (let i = text.indexOf(of); i >= 0; i = text.indexOf(of, i + 1)) n++;
  return n;
}

/** Whether a word's first letter is a capital: Dart's `w[0] != w[0].toLowerCase()`. */
const capitalised = (w: string): boolean => w[0] !== dartToLowerCase(w[0]);

/** Every slip in the book of `chapters` (in reading order); `names` are the names it holds (its people's and
 * places'), for the name slips. In the book's order, each kind at most `proofsKept`. */
export function proofsOf(chapters: readonly ProofChapter[], options: { names?: Iterable<string> } = {}): Proof[] {
  // Each slip with where it is in its paragraph, to put them in the book's order at the end.
  const out: [Proof, number][] = [];
  const counts = new Map<Slip, number>();
  const add = (kind: Slip, c: number, b: number, paragraph: string, start: number, end: number, note: string): void => {
    const n = (counts.get(kind) ?? 0) + 1;
    counts.set(kind, n);
    if (n > proofsKept) return;
    const [from, sentence] = sentenceAround(paragraph, start);
    const s = clampInt(start - from, 0, sentence.length);
    const e = clampInt(end - from, s, sentence.length);
    const marked = paragraph.substring(start, end);
    out.push([
      {
        kind,
        chapter: c + 1,
        nodeId: chapters[c].id,
        block: b,
        text: sentence,
        start: s,
        end: e,
        note,
        find: dartTrim(marked).length === 0 ? dartTrim(sentence) : marked,
      },
      start,
    ]);
  };

  // The book's words, counted, for the name slips: a known name said often, a word a letter off it said rarely.
  const counted = new Map<string, number>();
  let straight = 0;
  let curly = 0;
  for (const c of chapters) {
    for (const p of c.paragraphs) {
      if (p === null) continue;
      for (const m of p.matchAll(word)) counted.set(m[0], (counted.get(m[0]) ?? 0) + 1);
      straight += countOf(p, '"');
      curly += countOf(p, '“') + countOf(p, '”');
    }
  }
  const known = new Set<string>();
  for (const n of options.names ?? []) {
    for (const w of n.split(/\s+/)) if (w.length >= 4 && capitalised(w)) known.add(w);
  }
  const slipped = new Map<string, string>();
  for (const [w, n] of counted) {
    if (w.length < 4 || !capitalised(w) || known.has(w) || n > 2) continue;
    // A word the book also writes small is a word ("Well?" by Vell), not a name gone wrong.
    if ((counted.get(dartToLowerCase(w)) ?? 0) > 0) continue;
    for (const k of known) {
      // The name's plural or its possessive is the name ("the Fenns", "Fenn’s").
      const same = w === `${k}s` || w === `${k}es` || w === `${k}’s` || w === `${k}'s`;
      if (!same && (counted.get(k) ?? 0) >= 3 && distance(w, k) === 1) {
        slipped.set(w, k);
        break;
      }
    }
  }
  // The quotes of the book are the ones it uses most; the others stand out.
  const odd = straight > 0 && curly > 0 ? (straight <= curly ? '"' : '“') : null;
  const oddPattern = odd === null ? null : new RegExp(dartEscape(odd) + (odd === '“' ? '|”' : ''), 'g');

  chapters.forEach((chapter, c) => {
    let words = 0;
    for (const p of chapter.paragraphs) if (p !== null) words += [...p.matchAll(word)].length;
    if (words === 0) {
      out.push([
        {
          kind: 'chapter',
          chapter: c + 1,
          nodeId: chapter.id,
          block: 0,
          text: dartTrim(chapter.title).length === 0 ? `Chapter ${c + 1}` : dartTrim(chapter.title),
          start: 0,
          end: 0,
          note: 'This chapter has no words yet.',
          find: '',
        },
        -1,
      ]);
      return;
    }
    if (dartTrim(chapter.title).length === 0) {
      const first = chapter.paragraphs.find((p): p is string => p !== null && dartTrim(p).length > 0) ?? '';
      out.push([
        {
          kind: 'chapter',
          chapter: c + 1,
          nodeId: chapter.id,
          block: 0,
          text: first.length > 120 ? `${first.substring(0, 120)}…` : first,
          start: 0,
          end: 0,
          note: `Chapter ${c + 1} has no title.`,
          find: '',
        },
        -1,
      ]);
    }
    chapter.paragraphs.forEach((p, b) => {
      if (p === null || dartTrim(p).length === 0) return;
      for (const m of p.matchAll(word)) {
        const k = slipped.get(m[0]);
        if (k !== undefined) add('name', c, b, p, m.index, m.index + m[0].length, `“${m[0]}”: is it ${k}?`);
      }
      for (const m of p.matchAll(doubled)) {
        if (doublesAllowed.has(dartToLowerCase(m[1]))) continue;
        add('doubled', c, b, p, m.index, m.index + m[0].length, `“${m[1]}” twice.`);
      }
      for (const m of p.matchAll(didnt)) {
        const past = m[2];
        if (endsInEd.has(dartToLowerCase(past))) continue;
        add('didnt', c, b, p, m.index, m.index + m[0].length, `After “${m[1]}”, the plain verb: “${plainOf(past)}”?`);
      }
      // A speech opened and not closed, unless the next paragraph opens one (a speech that runs on).
      const opens = countOf(p, '“');
      const closes = countOf(p, '”');
      const straightHere = countOf(p, '"');
      if (opens > closes || straightHere % 2 === 1) {
        const next = chapter.paragraphs.slice(b + 1).find((q): q is string => q !== null && dartTrim(q).length > 0) ?? '';
        const runsOn = dartTrimLeft(next).startsWith('“') || dartTrimLeft(next).startsWith('"');
        if (!runsOn) {
          const at = opens > closes ? p.lastIndexOf('“') : p.lastIndexOf('"');
          add('unclosed', c, b, p, at, at + 1, 'A line of speech opened here is not closed.');
        }
      }
      if (oddPattern !== null) {
        oddPattern.lastIndex = 0;
        const m = oddPattern.exec(p);
        if (m !== null) {
          add(
            'quotes',
            c,
            b,
            p,
            m.index,
            m.index + m[0].length,
            odd === '"' ? 'A straight quote in a book of curly ones.' : 'A curly quote in a book of straight ones.',
          );
        }
      }
      for (const m of p.matchAll(spaceBefore)) add('spacing', c, b, p, m.index, m.index + m[0].length, `A space before the “${m[1]}”.`);
      for (const m of p.matchAll(doubleSpace)) add('spacing', c, b, p, m.index, m.index + m[0].length, 'Two spaces between words.');
      for (const m of p.matchAll(smallStart)) {
        const before = dartToLowerCase(/([A-Za-z]+)\.$/.exec(p.substring(0, m.index + 1))?.[1] ?? '');
        if (abbreviations.has(before)) continue;
        add('small', c, b, p, m.index + m[0].length - 1, m.index + m[0].length, 'A sentence starting with a small letter.');
      }
      for (const m of p.matchAll(lowerI)) add('small', c, b, p, m.index, m.index + m[0].length, '“i” for “I”.');
    });
  });
  // In the book's order: chapter, paragraph, and where in it (Dart's own sort, which does not keep ties in order).
  dartSort(out, (a, b) => {
    if (a[0].chapter !== b[0].chapter) return a[0].chapter - b[0].chapter;
    if (a[0].block !== b[0].block) return a[0].block - b[0].block;
    return a[1] - b[1];
  });
  return out.map(([p]) => p);
}

/** `proofsOf` over the chapters as stored (JSON text, as `CharacterService.storedChapters` reads them): `order` is the
 * chapters' ids in reading order, `titles` their titles. A job to run away from the screen. */
export function proofsJob(
  storedContents: readonly string[],
  order: readonly string[],
  titles: ReadonlyMap<string, string>,
  names: Iterable<string>,
): () => Proof[] {
  return () => {
    const wanted = new Set(order);
    const blocks = new Map<string, { heading: boolean; text: string }[]>();
    for (const json of storedContents) {
      let row: unknown;
      try {
        row = JSON.parse(json);
      } catch {
        continue;
      }
      if (!isMap(row) || !wanted.has(row['id'] as string)) continue;
      blocks.set(String(row['id']), docBlocks(row['doc']));
    }
    return proofsOf(
      order.map((id) => ({
        id,
        title: titles.get(id) ?? '',
        paragraphs: (blocks.get(id) ?? []).map((b) => (b.heading ? null : b.text)),
      })),
      { names },
    );
  };
}
