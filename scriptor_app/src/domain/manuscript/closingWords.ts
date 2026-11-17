// The closing words of a chapter, to show where the writing stopped. Pure TypeScript. A port of closingWords in
// flutter_app/lib/shared/domain/manuscript/prose.dart.

import { docBlocks } from '../prose';
import { dartTrim, dartTrimLeft } from '../text/dartString';

/** The closing words of a document: its last paragraphs (headings left out), up to about [max] characters (Unicode code
 * points), cut at a space so no word is broken. [cut] says whether earlier text was left out. Empty when nothing is
 * written. Reads only: the text is the author's exactly, paragraph breaks kept. */
export function closingWords(doc: unknown, opts: { max?: number } = {}): { text: string; cut: boolean } {
  const max = opts.max ?? 320;
  const paragraphs = docBlocks(doc)
    .filter((b) => !b.heading && dartTrim(b.text) !== '')
    .map((b) => dartTrim(b.text));
  const kept: string[] = [];
  let length = 0;
  let cut = false;
  for (const p of [...paragraphs].reverse()) {
    const room = max - length;
    const runes = Array.from(p);
    if (runes.length <= room) {
      kept.unshift(p);
      length += runes.length + 2;
      continue;
    }
    cut = true;
    if (kept.length === 0 || room > 40) {
      // The end of this paragraph, from the first space that leaves it within the room.
      const take = room > 40 ? room : 40;
      const from = runes.length > take ? runes.length - take : 0;
      let start = from;
      while (start > 0 && start < runes.length && dartTrim(runes[start]) !== '') start++;
      const tail = dartTrimLeft(runes.slice(start).join(''));
      if (tail !== '') {
        kept.unshift(tail);
      } else if (kept.length === 0) {
        // One unbroken run longer than the room: its end, as it is.
        kept.unshift(runes.slice(from).join(''));
      }
    }
    break;
  }
  return { text: kept.join('\n\n'), cut };
}
