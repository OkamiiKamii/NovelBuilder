import type { TextMetrics } from './types';

const WORDS_PER_MINUTE = 250;
const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'word' }) : null;

export function countWords(text: string): number {
  if (!text.trim()) return 0;
  if (!segmenter) return text.trim().split(/\s+/).length;
  let words = 0;
  for (const segment of segmenter.segment(text)) if (segment.isWordLike) words++;
  return words;
}

/** Measures a document given the text of each of its blocks (paragraphs, headings). */
export function measure(blocks: string[]): TextMetrics {
  let words = 0;
  let characters = 0;
  let paragraphs = 0;
  for (const block of blocks) {
    words += countWords(block);
    for (const _ of block) characters++;
    if (block.trim()) paragraphs++;
  }
  return { words, characters, paragraphs, readingMinutes: words === 0 ? 0 : Math.max(1, Math.round(words / WORDS_PER_MINUTE)) };
}

export const EMPTY_METRICS: TextMetrics = { words: 0, characters: 0, paragraphs: 0, readingMinutes: 0 };
