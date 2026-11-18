// IN THEIR OWN WORDS: the lines the manuscript gives a character to say, found by how dialogue is written, never
// guessed:
//
// - a quotation followed by a word of speech and their name: “It's going,” Wren said / “Go,” said Nan;
// - their name and a word of speech before it: Wren said, “Go.” / Ilse whispered: “Close the drawer.”;
// - and in a paragraph where they are the only one named as speaking, its other quotations too (“Nine days,” Wren
//   said. “Nine days of low water.”).
//
// "She said" names no one and is left alone; so is any paragraph where two are named as speaking and a line is not
// tied to either. A port of flutter_app/lib/shared/domain/characters/voice.dart.

import { dartSort } from '../manuscript/dartSort';
import { blockTexts } from '../prose';
import { dartTrim } from '../text/dartString';
import { type Found, allMatches, clamp, dartEscape, storedPages } from './pageText';

/** A line said: the chapter or scene, its paragraph (as the editor counts blocks), and the words. */
export type Spoken = { nodeId: string; block: number; words: string };

/** The words of speaking. */
export const speechWords: readonly string[] = [
  'said', 'says', 'asked', 'asks', 'whispered', 'shouted', 'called', 'replied', 'answered', 'murmured', 'cried',
  'snapped', 'muttered', 'added', 'told', 'began', 'sang', 'breathed', 'laughed', 'sighed', 'admitted', 'insisted',
  'demanded', 'warned', 'yelled', 'hissed', 'growled', 'went on', 'agreed', 'explained', 'repeated', 'gasped',
];

/** A quotation, curly or straight: its words in the first group or the second. */
export const quotePattern = /“([^”]+)”|"([^"]+)"/g;

/** The lines quoted in `text` (quotePattern's matches). A paragraph with no quotation mark has none, and is not run
 * through the pattern: most of a book's paragraphs have no line in them (test/perf). */
export function quotesIn(text: string): Found[] {
  return text.includes('“') || text.includes('"') ? allMatches(quotePattern, text) : [];
}

/** The words of speaking, as one pattern's alternatives. */
const verb = `(?:${speechWords.join('|')})`;

/** Anyone named as speaking at all, for telling a paragraph of one speaker from one of two. */
const anyone = new RegExp(`(\\p{Lu}[\\p{L}'’-]+)\\s+${verb}\\b|\\b${verb}\\s+(\\p{Lu}[\\p{L}'’-]+)`, 'gu');

/** Every line `names` speak in `pages` (each chapter's paragraphs), in the order of `nodeIds`, at most `limit` (60). */
export function spokenBy(
  pages: ReadonlyMap<string, readonly string[]>,
  nodeIds: readonly string[],
  names: readonly string[],
  options: { limit?: number } = {},
): Spoken[] {
  return spoken(pages, nodeIds, names, options.limit ?? 60, (_id, _block, text) => quotesIn(text));
}

/** spokenBy for each of `people` (their names, by whatever key), the book read for its lines once for all of them:
 * each paragraph's lines are found once, not once a person. The same lines for each as spokenBy. */
export function spokenByEach<K>(
  pages: ReadonlyMap<string, readonly string[]>,
  nodeIds: readonly string[],
  people: ReadonlyMap<K, readonly string[]>,
  options: { limit?: number } = {},
): Map<K, Spoken[]> {
  const quotes = new Map<string, Found[][]>();
  for (const id of nodeIds) {
    const blocks = pages.get(id);
    if (blocks !== undefined) quotes.set(id, blocks.map((text) => quotesIn(text)));
  }
  const out = new Map<K, Spoken[]>();
  for (const [who, names] of people) {
    out.set(who, spoken(pages, nodeIds, names, options.limit ?? 60, (id, block) => quotes.get(id)![block]));
  }
  return out;
}

function spoken(
  pages: ReadonlyMap<string, readonly string[]>,
  nodeIds: readonly string[],
  names: readonly string[],
  limit: number,
  quotesOf: (id: string, block: number, text: string) => Found[],
): Spoken[] {
  const wanted = dartSort(
    [...new Set(names.map(dartTrim))].filter((n) => n.length > 0),
    (a, b) => b.length - a.length,
  );
  if (wanted.length === 0) return [];
  const name = `(?:${wanted.map(dartEscape).join('|')})`;
  // Made the first time a paragraph of lines names them: most people are named in few of the book's paragraphs.
  let after: RegExp | null = null;
  let before: RegExp | null = null;

  const out: Spoken[] = [];
  for (const id of nodeIds) {
    const blocks = pages.get(id);
    if (blocks === undefined) continue;
    for (let i = 0; i < blocks.length; i++) {
      const text = blocks[i];
      const quotes = quotesOf(id, i, text);
      if (quotes.length === 0) continue;
      // A line is theirs only where one of their names is written by it.
      if (!wanted.some((w) => text.includes(w))) continue;
      // After a line: “…,” Wren said / “…,” said Wren. Before a line: Wren said, “…” / Ilse whispered: “…”.
      after ??= new RegExp(`^\\s*(?:(${name})\\s+${verb}\\b|${verb}\\s+(${name})\\b)`, 'u');
      before ??= new RegExp(`(${name})\\s+${verb}(?:\\s+\\w+)?\\s*[,:]?\\s*$`, 'u');
      let theirs = new Set<number>();
      quotes.forEach((m, q) => {
        const tail = text.substring(m.end, clamp(m.end + 80, 0, text.length));
        const head = text.substring(q === 0 ? 0 : quotes[q - 1].end, m.start);
        if (after!.test(tail) || before!.test(head)) theirs.add(q);
      });
      if (theirs.size === 0) continue;
      // The only one named as speaking here: every line in it is theirs.
      const speakers = new Set(allMatches(anyone, text.replace(quotePattern, ' ')).map((s) => (s.groups[0] ?? s.groups[1])!));
      const mine = [...speakers].filter((s) => wanted.some((w) => w === s || w.split(' ').includes(s)));
      if (speakers.size === mine.length) theirs = new Set(quotes.map((_, q) => q));
      for (const q of [...theirs].sort((a, b) => a - b)) {
        const words = dartTrim(quotes[q].groups[0] ?? quotes[q].groups[1]!).replace(/[,]$/, '');
        if (words.length < 2) continue;
        out.push({ nodeId: id, block: i, words });
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}

/** spokenBy over the chapters as stored (each record as JSON text, CharacterService.storedChapters), as a job to run
 * away from the screen. */
export function spokenJob(
  storedContents: readonly string[],
  nodeIds: readonly string[],
  names: readonly string[],
): () => Spoken[] {
  return () => spokenBy(storedPages(storedContents, new Set(nodeIds), blockTexts), nodeIds, names);
}
