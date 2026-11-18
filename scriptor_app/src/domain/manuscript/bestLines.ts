// THE BEST LINES: the sentences of a book most worth quoting, the ones an author posts and a reader underlines. Read
// from the prose, sentence by sentence, and scored for what makes a line stay with a reader: a length to hold in the
// mind (eight to sixteen words best, six to twenty-two at all); a turn ("but", "yet", "not… but", a dash, a
// semicolon); the sound of a truth ("never", "always", "no one"…, or a saying's present tense); the senses (light,
// salt, stone, bells…, two at most counted); an echo (a word said twice); and marked down for starting mid-thought
// ("And…", "Then…"), for numbers, and for the plain business of a scene ("he said", "she walked to"). Twelve, the best
// first, never two from one paragraph. Only the author's words.
//
// A port of flutter_app/lib/shared/domain/manuscript/best_lines.dart.

import { paragraphsOf, storedPages } from '../characters/pageText';
import { dartToLowerCase, dartTrim } from '../text/dartString';
import { dartSort } from './dartSort';

/** A line: its words, its chapter (the place from 1, the id), its paragraph, and its score. */
export type BestLine = { text: string; chapter: number; nodeId: string; block: number; score: number };

/** How many lines are kept. */
export const bestLinesKept = 12;

/** A sentence: a run up to its end marks (and the quotes closing after them), or the rest of the text. */
export const sentencePattern = /[^.!?…]+[.!?…]+["”’]*|[^.!?…]+$/g;
const word = /[\p{L}][\p{L}’'\-]*/gu;

const truths = new Set(['never', 'always', 'every', 'everyone', 'nothing', 'nobody', 'everything', 'forever', 'only']);
const sayings = new Set(['is', 'are', 'was', 'were']);
const senses = new Set([
  'light', 'dark', 'darkness', 'shadow', 'shadows', 'salt', 'sea', 'tide', 'water', 'stone', 'stones', 'bell',
  'bells', 'smoke', 'fire', 'ash', 'ashes', 'cold', 'warm', 'wind', 'rain', 'snow', 'blood', 'bone', 'bones',
  'silver', 'gold', 'iron', 'glass', 'dust', 'moon', 'sun', 'star', 'stars', 'night', 'dawn', 'dusk', 'silence',
  'quiet', 'song', 'voice', 'breath', 'ink', 'paper', 'map', 'road', 'river', 'storm', 'mist', 'fog', 'flame',
]);
const business = [' said', ' asked', ' replied', ' walked', ' turned to', ' looked at', ' nodded', ' sat down'];

/** How many times `of` (one character) occurs in `text`. */
export function countOf(text: string, of: string): number {
  let n = 0;
  for (let i = text.indexOf(of); i >= 0; i = text.indexOf(of, i + of.length)) n++;
  return n;
}

/** The words of `text` (letters, then letters, apostrophes and hyphens), as matched. */
export function wordsOf(text: string): RegExpMatchArray[] {
  return Array.from(text.matchAll(word));
}

/** Whether the first code unit of `text` is already lower case (Dart's `s[0] == s[0].toLowerCase()`). */
export function startsLower(text: string): boolean {
  const c = text[0];
  return c === dartToLowerCase(c);
}

/** How much `line` stays with a reader: below one, not a line to quote. */
export function lineScore(line: string): number {
  const words = wordsOf(line).map((m) => dartToLowerCase(m[0]));
  if (words.length < 6 || words.length > 22) return 0;
  const first = line.replace(/^[“"‘(]+/, '');
  if (first.length === 0 || startsLower(first)) return 0;
  // Broken off ("if you knew the tables were wrong—"): not a whole thought.
  if (/[—–-]["”’]*$/.test(dartTrim(line))) return 0;
  let score = 1;
  if (words.length >= 8 && words.length <= 16) score += 2;
  const lower = ` ${dartToLowerCase(line)} `;
  if (/\b(but|yet)\b/.test(lower) || line.includes('—') || line.includes(';') || lower.includes(' not ')) score += 2;
  if (words.some((w) => truths.has(w))) score += 2;
  if (words.length <= 14 && words.some((w) => sayings.has(w)) && !words.includes('i')) score += 1;
  score += Math.min(2, new Set(words.filter((w) => senses.has(w))).size);
  const counted = new Map<string, number>();
  for (const w of words) {
    if (w.length >= 4) counted.set(w, (counted.get(w) ?? 0) + 1);
  }
  if ([...counted.values()].some((n) => n >= 2)) score += 1;
  if (/^(And|But|Then|So|Or|Also)\b/.test(first)) score -= 2;
  if (/\d/.test(line)) score -= 2;
  if (business.some((b) => lower.includes(b))) score -= 2;
  return score;
}

/** The best lines of `chapters` (in reading order, each its id and paragraphs). */
export function bestLines(chapters: readonly { id: string; paragraphs: readonly string[] }[]): BestLine[] {
  const found: BestLine[] = [];
  chapters.forEach((chapter, c) => {
    chapter.paragraphs.forEach((text, b) => {
      let best: BestLine | null = null;
      for (const m of text.matchAll(sentencePattern)) {
        const s = dartTrim(m[0]);
        // A sentence cut by a quotation is not whole.
        if (countOf(s, '“') !== countOf(s, '”')) continue;
        const score = lineScore(s);
        if (score > 0 && (best === null || score > best.score)) {
          best = { text: s, chapter: c + 1, nodeId: chapter.id, block: b, score };
        }
      }
      if (best !== null) found.push(best);
    });
  });
  dartSort(found, (a, b) => (b.score !== a.score ? b.score - a.score : a.chapter - b.chapter));
  const seen = new Set<string>();
  const out: BestLine[] = [];
  for (const l of found) {
    const key = dartToLowerCase(l.text);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(l);
    if (out.length === bestLinesKept) break;
  }
  return out;
}

/** The chapters' paragraphs (headings left out) from the chapters as stored (JSON text, a row each), by id. */
export function storedParagraphs(storedContents: readonly string[], order: readonly string[]): Map<string, string[]> {
  return storedPages(storedContents, new Set(order), paragraphsOf);
}

/** `bestLines` over the chapters as stored, in reading order `order`, as a job to run away from the screen. */
export function bestLinesJob(storedContents: readonly string[], order: readonly string[]): () => BestLine[] {
  return () => {
    const pages = storedParagraphs(storedContents, order);
    return bestLines(order.map((id) => ({ id, paragraphs: pages.get(id) ?? [] })));
  };
}
