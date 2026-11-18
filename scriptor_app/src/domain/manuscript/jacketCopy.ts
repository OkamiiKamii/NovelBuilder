// THE BACK OF THE JACKET: what a printed novel says on its back, taken from this one. The blurb is the author's
// synopsis when there is one, else the book's own opening, cut at a sentence; the pull quote is a line someone says in
// it, short enough to set large, else its first sentence. Only the author's words, nothing written for them.
//
// A port of flutter_app/lib/shared/domain/manuscript/jacket_copy.dart.

import { dartTrim } from '../text/dartString';
import { sentencePattern, storedParagraphs } from './bestLines';

/** The back of the jacket: the quote set large, and the blurb. */
export type JacketCopy = { quote: string; blurb: string };

/** The most words the blurb runs to when it is the opening. */
export const blurbWords = 70;

const spoken = /[“"]([^”"]{8,160})[”"]/g;
const space = /\s+/;

/** The back of the jacket for a book whose paragraphs (in reading order) are `paragraphs`, its synopsis `synopsis`. */
export function jacketCopy(paragraphs: readonly string[], synopsis: string): JacketCopy {
  const text = paragraphs.filter((p) => dartTrim(p).length > 0).map(dartTrim);
  // A spoken line of five to fourteen words, ending as a sentence.
  let quote = '';
  for (const p of text) {
    for (const m of p.matchAll(spoken)) {
      const words = dartTrim(m[1]).split(space);
      if (words.length >= 5 && words.length <= 14) {
        quote = dartTrim(m[1]).replace(/[,;:]$/, '.');
        break;
      }
    }
    if (quote.length > 0) break;
  }
  if (quote.length === 0 && text.length > 0) {
    const m = new RegExp(sentencePattern.source).exec(text[0]);
    const first = m === null ? '' : dartTrim(m[0]);
    if (first.split(space).length <= 24) quote = first;
  }

  let blurb = dartTrim(synopsis);
  if (blurb.length === 0 && text.length > 0) {
    const out: string[] = [];
    let count = 0;
    let cut = false;
    outer: for (const p of text) {
      for (const s of p.matchAll(sentencePattern)) {
        const sentence = dartTrim(s[0]);
        const n = sentence.split(space).length;
        if (count > 0 && count + n > blurbWords) {
          cut = true;
          break outer;
        }
        out.push(sentence);
        count += n;
      }
    }
    blurb = `${out.join(' ')}${cut ? ' …' : ''}`;
  }
  return { quote, blurb };
}

/** `jacketCopy` over the chapters as stored (JSON text, a row each), in reading order `order`, as a job. */
export function jacketCopyJob(storedContents: readonly string[], order: readonly string[], synopsis: string): () => JacketCopy {
  return () => {
    const pages = storedParagraphs(storedContents, order);
    return jacketCopy(
      order.flatMap((id) => pages.get(id) ?? []),
      synopsis,
    );
  };
}
