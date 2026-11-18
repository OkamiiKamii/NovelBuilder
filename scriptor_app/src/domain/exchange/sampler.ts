// THE SAMPLER: a book's opening as a reader's sample, the thing a writer sends to a beta reader, a writing group or an
// agent: a title page (the title, who wrote it, the best line set apart, the blurb), the first chapters until a reader
// has enough to judge (as many as reach `samplerWords`, three at most, at least one), and a last page that says how much
// more there is. Made as the same format-neutral document every export is (compile.ts), so it is rendered by the PDF
// writer (renderPdf.ts) as it is. Reads only.
//
// A port of flutter_app/lib/shared/domain/exchange/sampler.dart.

import { bestLines, storedParagraphs } from '../manuscript/bestLines';
import { dartTrim } from '../text/dartString';
import { type Block, type Compiled, DividerBlock, HeadingBlock, ParagraphBlock, Run } from './compile';

/** The words a sample runs to: chapters are added until it reaches this. */
export const samplerWords = 1500;

/** The most chapters a sample holds. */
export const samplerChapters = 3;

/** A chapter for the sample: its title and its paragraphs. */
export type SampleChapter = { title: string; paragraphs: readonly string[] };

const wordPattern = /[\p{L}\p{N}][\p{L}\p{N}’'\-]*/gu;
const wordsIn = (text: string): number => Array.from(text.matchAll(wordPattern)).length;
const chapterWords = (c: SampleChapter): number => c.paragraphs.reduce((s, p) => s + wordsIn(p), 0);

/** The opening chapters of `chapters` a sample holds. */
export function sampleChapters(chapters: readonly SampleChapter[]): SampleChapter[] {
  const out: SampleChapter[] = [];
  let words = 0;
  for (const c of chapters) {
    const n = chapterWords(c);
    if (n === 0) continue;
    out.push(c);
    words += n;
    if (words >= samplerWords || out.length === samplerChapters) break;
  }
  return out;
}

function thousands(n: number): string {
  const s = `${n}`;
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ',';
    out += s[i];
  }
  return out;
}

/** The sample of a book called `title` by `author`, its `quote` and `blurb` on the title page, from `chapters` (in
 * reading order); `allChapters` and `allWords` are the whole book's, for the last page. */
export function samplerOf(args: {
  title: string;
  author: string;
  quote: string;
  blurb: string;
  chapters: readonly SampleChapter[];
  allChapters: number;
  allWords: number;
  /** The app named on the last page: Scriptor (the Flutter app says Novel Builder; its golden is made with that). */
  brand?: string;
}): Compiled {
  const name = dartTrim(args.title).length === 0 ? 'Untitled' : dartTrim(args.title);
  const opening = sampleChapters(args.chapters);
  const words = opening.reduce((s, c) => s + chapterWords(c), 0);
  const more = args.allChapters - opening.length;
  const blocks: Block[] = [new HeadingBlock('title', 1, name)];
  if (dartTrim(args.author).length > 0) blocks.push(new HeadingBlock('subtitle', 2, `by ${dartTrim(args.author)}`));
  if (dartTrim(args.quote).length > 0) {
    blocks.push(new DividerBlock(), new ParagraphBlock([new Run(dartTrim(args.quote), { italic: true })], 'center'));
  }
  if (dartTrim(args.blurb).length > 0) {
    blocks.push(new DividerBlock(), new ParagraphBlock([new Run(dartTrim(args.blurb))], 'center'));
  }
  blocks.push(new ParagraphBlock([new Run('A reader’s sample', { italic: true })], 'center'));
  opening.forEach((c, i) => {
    blocks.push(new HeadingBlock('chapter', 1, dartTrim(c.title).length === 0 ? `Chapter ${i + 1}` : dartTrim(c.title), true));
    for (const p of c.paragraphs) {
      if (dartTrim(p).length > 0) blocks.push(new ParagraphBlock([new Run(dartTrim(p))]));
    }
  });
  blocks.push(
    new DividerBlock(),
    new ParagraphBlock(
      [
        new Run(
          more > 0
            ? `End of the sample. ${name} runs to ${args.allChapters} chapters and ${thousands(args.allWords)} words so far.`
            : `End of the sample: all of ${name} so far, ${thousands(args.allWords)} words.`,
          { italic: true },
        ),
      ],
      'center',
    ),
    new ParagraphBlock([new Run(`Made with ${args.brand ?? 'Scriptor'}`)], 'center'),
  );
  return { title: name, author: dartTrim(args.author), blocks, wordCount: words, chapterCount: opening.length };
}

/** The sample of a book, made from its chapters as stored (JSON text, a row each): `order` the chapters' ids in reading
 * order, `titles` their titles. The line on the title page is the book's best; the blurb only the author's synopsis,
 * since the opening follows it. A job to run away from the screen. */
export function samplerJob(
  storedContents: readonly string[],
  order: readonly string[],
  titles: ReadonlyMap<string, string>,
  book: { title: string; author: string; synopsis: string; brand?: string },
): () => Compiled {
  return () => {
    const pages = storedParagraphs(storedContents, order);
    const chapters = order.map((id) => ({ id, title: titles.get(id) ?? '', paragraphs: pages.get(id) ?? [] }));
    const best = bestLines(chapters.map((c) => ({ id: c.id, paragraphs: c.paragraphs })));
    return samplerOf({
      title: book.title,
      author: book.author,
      quote: best.length === 0 ? '' : best[0].text,
      blurb: book.synopsis,
      chapters: chapters.map((c) => ({ title: c.title, paragraphs: c.paragraphs })),
      allChapters: chapters.filter((c) => c.paragraphs.some((p) => wordsIn(p) > 0)).length,
      allWords: chapters.reduce((s, c) => s + chapterWords(c), 0),
      brand: book.brand,
    });
  };
}
