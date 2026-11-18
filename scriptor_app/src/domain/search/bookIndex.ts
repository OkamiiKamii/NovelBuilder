// THE INDEX (FEATURES.md #357): the names a book is made of, A to Z, each with the chapters it is in, as the index at
// the back of a printed book sets them. A name is a word (or a run of words) written with a capital where a sentence
// does not begin; a word that only ever begins sentences is not one. Names written two ways ("Mimir" and "Mimmir") are
// set side by side: one of them may be a slip. Reads only. A port of flutter_app/lib/shared/domain/text/book_index.dart.

import { dartToUpperCase } from '../exchange/dartUpperCase';
import { dartSort } from '../manuscript/dartSort';
import { blockTexts } from '../prose';
import { dartToLowerCase, dartTrim } from '../text/dartString';

/** Where a name is in one chapter: the chapter's place in the book (from 1), its id, the first paragraph it is in, and
 * how often it is there. */
export type IndexPlace = { number: number; nodeId: string; block: number; count: number };

/** One line of the index: the name as written, how often in all, and the chapters. */
export type IndexEntry = { term: string; count: number; places: IndexPlace[] };

/** Two names written alike: perhaps one name, spelled two ways. */
export type LookAlike = { a: IndexEntry; b: IndexEntry };

/** The index: its lines A to Z, and the names that look alike. */
export type BookIndex = { entries: IndexEntry[]; lookAlikes: LookAlike[] };

const word = /[\p{L}][\p{L}’'-]*/gu;
const sentenceEnd = /[.!?…:]["”’)\]]*\s*$|^\s*$|["“([]\s*$/u;

/** Words that join a name's parts ("Order of the Lamp", "Isle of Vell"). */
const joins = new Set(['of', 'the', 'de', 'du', 'von', 'van', 'del', 'la', 'le']);

/** Words written with a capital mid-sentence without being names. */
const notNames = new Set([
  'I', 'I’m', "I'm", 'I’d', "I'd", 'I’ll', "I'll", 'I’ve', "I've", 'OK', 'Mr', 'Mrs', 'Ms', 'Dr',
  'He', 'She', 'It', 'They', 'We', 'You', 'His', 'Her', 'Its', 'Their', 'Our', 'Your', 'My', 'The', 'A', 'An',
  'And', 'But', 'Or', 'So', 'Then', 'When', 'Where', 'What', 'Who', 'Why', 'How', 'If', 'In', 'On', 'At', 'As',
  'This', 'That', 'These', 'Those', 'There', 'Here', 'No', 'Yes', 'Not', 'Now', 'Still', 'Just', 'All', 'One',
  'For', 'With', 'From', 'To', 'Of', 'By', 'After', 'Before', 'Once', 'Even', 'Only', 'Well', 'Oh', 'Ah',
]);

/** Dart's `w[0] != w[0].toLowerCase() && w[0] == w[0].toUpperCase()`, on the first UTF-16 unit. */
function capital(w: string): boolean {
  if (w.length === 0) return false;
  const c = w[0];
  return c !== dartToLowerCase(c) && c === dartToUpperCase(c);
}

/** A word as an index sets it: without a possessive, and not a word of shouting ("NINE"). */
function asName(w0: string): string | null {
  const w = w0.replace(/[’']s?$/, '');
  if (w.length >= 2 && w === dartToUpperCase(w)) return null;
  if (notNames.has(w)) return null;
  return capital(w) ? w : null;
}

type Word = { start: number; end: number; text: string };

/** The capitalised runs in `paragraph`, and whether each starts a sentence. */
function runs(paragraph: string): { term: string; start: boolean }[] {
  const words: Word[] = [];
  for (const m of paragraph.matchAll(word)) words.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
  const out: { term: string; start: boolean }[] = [];
  let i = 0;
  while (i < words.length) {
    const w = words[i];
    const text = asName(w.text);
    if (text === null) {
      i++;
      continue;
    }
    const start = sentenceEnd.test(paragraph.substring(0, w.start));
    const parts = [text];
    let j = i + 1;
    while (j < words.length) {
      const gap = paragraph.substring(words[j - 1].end, words[j].start);
      if (dartTrim(gap).length > 0) break; // Punctuation between: the name ends.
      const next = asName(words[j].text);
      if (next !== null) {
        parts.push(next);
        j++;
        continue;
      }
      // "of the": a join, when a capital follows it.
      if (joins.has(words[j].text)) {
        let k = j + 1;
        while (k < words.length && joins.has(words[k].text)) k++;
        if (
          k < words.length &&
          dartTrim(paragraph.substring(words[k - 1].end, words[k].start)).length === 0 &&
          asName(words[k].text) !== null
        ) {
          for (let n = j; n < k; n++) parts.push(words[n].text);
          j = k;
          continue;
        }
      }
      break;
    }
    out.push({ term: parts.join(' '), start });
    i = j;
  }
  return out;
}

/** Sorted as an index is: without a leading "The", ignoring case. */
function sortKey(term: string): string {
  return dartToLowerCase(term.replace(/^The\s+/, ''));
}

const compareCodeUnits = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The index of `chapters` (in reading order, each its id and paragraphs). */
export function bookIndex(chapters: readonly { id: string; paragraphs: readonly string[] }[]): BookIndex {
  // First, every run and where; names are the runs ever written mid-sentence.
  const midSentence = new Set<string>();
  const seen: { term: string; start: boolean; chapter: number; block: number }[] = [];
  chapters.forEach((chapter, c) => {
    chapter.paragraphs.forEach((p, b) => {
      for (const r of runs(p)) {
        seen.push({ term: r.term, start: r.start, chapter: c, block: b });
        if (!r.start) midSentence.add(r.term);
      }
    });
  });
  const places = new Map<string, Map<number, { block: number; count: number }>>();
  for (const s of seen) {
    // A run beginning a sentence is a name only when it is one elsewhere; else, without its first word ("Then Wren").
    let term = s.term;
    if (s.start && !midSentence.has(term)) {
      const rest = term.split(' ').slice(1).join(' ');
      if (rest.length === 0 || !midSentence.has(rest)) continue;
      term = rest;
    }
    let byChapter = places.get(term);
    if (byChapter === undefined) places.set(term, (byChapter = new Map()));
    const at = byChapter.get(s.chapter);
    byChapter.set(s.chapter, at === undefined ? { block: s.block, count: 1 } : { block: at.block, count: at.count + 1 });
  }
  const entries: IndexEntry[] = [...places].map(([term, byChapter]) => ({
    term,
    count: [...byChapter.values()].reduce((n, p) => n + p.count, 0),
    places: [...byChapter]
      .sort((a, b) => a[0] - b[0])
      .map(([c, p]) => ({ number: c + 1, nodeId: chapters[c].id, block: p.block, count: p.count })),
  }));
  dartSort(entries, (a, b) => compareCodeUnits(sortKey(a.term), sortKey(b.term)));
  return { entries, lookAlikes: lookAlikes(entries) };
}

/** Names of one word, five letters or more, a letter apart (two apart, from eight letters): perhaps one name spelled two
 * ways. A plural or a possessive is not a second spelling. */
export function lookAlikes(entries: readonly IndexEntry[]): LookAlike[] {
  const words = entries.filter((e) => !e.term.includes(' ') && e.term.length >= 5);
  const out: LookAlike[] = [];
  for (let i = 0; i < words.length; i++) {
    for (let j = i + 1; j < words.length; j++) {
      const a = words[i].term;
      const b = words[j].term;
      if (Math.abs(a.length - b.length) > 2) continue;
      const la = dartToLowerCase(a);
      const lb = dartToLowerCase(b);
      if (la === `${lb}s` || lb === `${la}s` || la === `${lb}es` || lb === `${la}es`) continue;
      const most = Math.min(a.length, b.length) >= 8 ? 2 : 1;
      if (distance(la, lb) <= most) out.push({ a: words[i], b: words[j] });
    }
  }
  return out;
}

/** How many letters must change to make `a` into `b` (adding, removing, replacing, or swapping two side by side). */
function distance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) d[i][0] = i;
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1), d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/** `bookIndex` over the chapters as stored (JSON text), in reading order `order`, as a job to run off the screen. */
export function bookIndexJob(storedContents: readonly string[], order: readonly string[]): () => BookIndex {
  return () => {
    const wanted = new Set(order);
    const pages = new Map<string, string[]>();
    for (const json of storedContents) {
      let row: unknown;
      try {
        row = JSON.parse(json);
      } catch {
        continue;
      }
      if (row === null || typeof row !== 'object' || Array.isArray(row)) continue;
      const r = row as Record<string, unknown>;
      if (!wanted.has(r['id'] as string)) continue;
      pages.set(`${String(r['id'])}`, blockTexts(r['doc']));
    }
    return bookIndex(order.map((id) => ({ id, paragraphs: pages.get(id) ?? [] })));
  };
}
