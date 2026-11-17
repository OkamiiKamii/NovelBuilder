// THE CHAPTER'S RHYTHM: its sentences in order with their lengths, the runs of five or more that keep one beat, and the
// shortest, longest and middle lengths. Reads only; describes, never judges. Pure TypeScript (it also runs in the
// editor's WebView). A port of flutter_app/lib/shared/domain/text/rhythm.dart.

import { countWords } from './voices';

/** One sentence of a chapter: its paragraph, where it starts and ends in it (end exclusive), its words, and whether it
 * holds dialogue (a quotation mark). */
export type RhythmSentence = { block: number; start: number; end: number; words: number; spoken: boolean };

/** A run of sentences, by their indexes in {@link RhythmReport.sentences} (end exclusive). */
export type RhythmRun = { from: number; to: number };

/** How many sentences of nearly one length in a row make a run that keeps one beat. */
export const sameBeatRun = 5;

/** How far apart (in words) the sentences of such a run may be. */
export const sameBeatSpread = 3;

function runsOf(s: readonly RhythmSentence[]): RhythmRun[] {
  const out: RhythmRun[] = [];
  let from = 0;
  while (from < s.length) {
    let lo = s[from].words;
    let hi = lo;
    let to = from + 1;
    while (to < s.length) {
      const w = s[to].words;
      const nlo = Math.min(lo, w);
      const nhi = Math.max(hi, w);
      if (nhi - nlo > sameBeatSpread) break;
      lo = nlo;
      hi = nhi;
      to++;
    }
    if (to - from >= sameBeatRun && lo >= 4) {
      out.push({ from, to });
      from = to;
    } else {
      from++;
    }
  }
  return out;
}

/** THE CHAPTER'S RHYTHM: its sentences in order with their lengths, the runs of five or more that keep one beat (all
 * within three words of each other, and of four words or more), and the shortest, longest and middle lengths. Reads
 * only; describes, never judges: a run may be just what the scene wants. */
export class RhythmReport {
  static readonly empty = new RhythmReport([]);

  readonly runs: readonly RhythmRun[];

  constructor(readonly sentences: readonly RhythmSentence[]) {
    this.runs = runsOf(sentences);
  }

  /** The words of the shortest sentence (0 when there are none). */
  get shortest(): number {
    return this.sentences.length === 0 ? 0 : this.sentences.map((s) => s.words).reduce((a, b) => Math.min(a, b));
  }

  /** The words of the longest sentence (0 when there are none). */
  get longest(): number {
    return this.sentences.length === 0 ? 0 : this.sentences.map((s) => s.words).reduce((a, b) => Math.max(a, b));
  }

  /** The middle length (the median): what a sentence here usually runs to. */
  get usual(): number {
    if (this.sentences.length === 0) return 0;
    const sorted = this.sentences.map((s) => s.words).sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }
}

// A sentence ends at . ! ? or … (with any closing quotes or brackets after), before a space or the paragraph's end.
const end = /[.!?…]+["”’')\]]*(?=\s|$)/g;

const quoteMark = /[“”"]/;

// Whether a character is one Dart's String.trim takes off: JavaScript's, and U+0085 (NEXT LINE).
const isSpace = (c: string) => c.trim().length === 0 || c === '\u0085';

/** The sentences of [paragraphs], in order. */
export function rhythmOf(paragraphs: readonly string[]): RhythmReport {
  const out: RhythmSentence[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    const text = paragraphs[i];
    let start = 0;
    const add = (stop: number) => {
      // Leading spaces are not the sentence's.
      let s = start;
      while (s < stop && isSpace(text[s])) s++;
      const piece = text.substring(s, stop);
      const words = countWords(piece);
      if (words > 0) out.push({ block: i, start: s, end: stop, words, spoken: quoteMark.test(piece) });
      start = stop;
    };

    for (const m of text.matchAll(end)) add(m.index + m[0].length);
    if (start < text.length) add(text.length);
  }
  return new RhythmReport(out);
}
