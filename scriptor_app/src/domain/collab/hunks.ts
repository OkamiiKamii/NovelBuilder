// One change a suggestion makes: these paragraphs out, those in, at this place in the text it was written against. As
// the original app's `src/modules/collab/hunks.ts`. A port of flutter_app/lib/shared/domain/collab/hunks.dart.

import { type JsonMap, listOf, mapOrNull } from '../json';
import { docBlocks } from '../prose';

export type Hunk = {
  readonly id: string;
  /** Where in the original it starts (a paragraph number). */
  readonly at: number;
  readonly remove: readonly unknown[];
  readonly insert: readonly unknown[];
  /** The paragraph just before, for placing a pure addition. Null at the very start. */
  readonly before: unknown;
};

const blocksOf = (doc: unknown): unknown[] => [...listOf(mapOrNull(doc)?.['content'])];
// Dart's jsonEncode of a block: keys in their stored order, as JSON.stringify writes them.
const sig = (block: unknown): string => JSON.stringify(block === undefined ? null : block);

/** The words of some paragraphs, for showing what a change says. */
export function textOf(blocks: readonly unknown[]): string {
  return docBlocks({ type: 'doc', content: blocks })
    .map((b) => b.text)
    .join('\n');
}

/** The original's 32-bit string hash (djb2 with xor over UTF-16 units), written in base 36. */
function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((Math.imul(h, 33) >>> 0) ^ text.charCodeAt(i)) >>> 0;
  }
  return (h >>> 0).toString(36);
}

/** The separate changes between a chapter as someone found it and as they would have it, paragraph by paragraph, so
 * that each can be accepted or rejected on its own. Unchanged paragraphs are matched up first (longest common run);
 * each stretch between matches is one change. */
export function textHunks(base: unknown, proposed: unknown): Hunk[] {
  const a = blocksOf(base);
  const b = blocksOf(proposed);
  const sa = a.map(sig);
  const sb = b.map(sig);
  const n = a.length;
  const m = b.length;
  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * width + j] =
        sa[i] === sb[j]
          ? table[(i + 1) * width + j + 1] + 1
          : table[(i + 1) * width + j] > table[i * width + j + 1]
            ? table[(i + 1) * width + j]
            : table[i * width + j + 1];
    }
  }
  const hunks: Hunk[] = [];
  let i = 0;
  let j = 0;
  let open: { at: number; remove: unknown[]; insert: unknown[] } | null = null;
  const close = () => {
    const o = open;
    if (o === null) return;
    // Named by where it is and what it says, not by how the document happens to be stored: the same change has the
    // same name on every device, so a verdict given on one is recognised on another.
    hunks.push({
      id: hash(`${o.at}|${o.remove.length}|${textOf(o.remove)}|${o.insert.length}|${textOf(o.insert)}`),
      at: o.at,
      remove: o.remove,
      insert: o.insert,
      before: o.at > 0 ? a[o.at - 1] : null,
    });
    open = null;
  };
  // Each turn moves i or j on by one, so the loop ends within n + m turns (counted, as Hermes asks).
  for (let turns = 0; turns <= n + m && (i < n || j < m); turns++) {
    if (i < n && j < m && sa[i] === sb[j]) {
      close();
      i++;
      j++;
    } else {
      open ??= { at: i, remove: [], insert: [] };
      if (j < m && (i === n || table[i * width + j + 1] >= table[(i + 1) * width + j])) {
        open.insert.push(b[j++]);
      } else {
        open.remove.push(a[i++]);
      }
    }
  }
  close();
  return hunks;
}

function runAt(content: readonly string[], run: readonly string[], from: number): boolean {
  for (let k = 0; k < run.length; k++) if (content[from + k] !== run[k]) return false;
  return true;
}

/** Where a run of paragraphs sits in a text, nearest to where it was expected. -1 when it is not there as it was. */
function locate(content: readonly string[], run: readonly string[], near: number): number {
  let best = -1;
  for (let from = 0; from + run.length <= content.length; from++) {
    if (runAt(content, run, from) && (best < 0 || Math.abs(from - near) < Math.abs(best - near))) best = from;
  }
  return best;
}

/** The outcome of applying one change: the text with it made, already there, or rewritten since (nothing changed). */
export type Applied = { kind: 'appliedTo'; doc: JsonMap } | { kind: 'alreadyThere' } | { kind: 'rewritten' };

/** Makes one accepted change to the chapter as it is NOW, which may have moved on since the suggestion was written.
 * The paragraphs it replaces are found by what they say, not by counting; if they are no longer there as the
 * suggester saw them, nothing is changed, so that an author's later writing is never overwritten by an older proposal. */
export function applyHunk(current: unknown, hunk: Hunk): Applied {
  const doc = mapOrNull(current) ?? { type: 'doc', content: [] };
  const content = blocksOf(doc);
  const sigs = content.map(sig);
  const remove = hunk.remove.map(sig);
  const insert = hunk.insert.map(sig);
  const put = (from: number, count: number): Applied => ({
    kind: 'appliedTo',
    doc: { ...doc, content: [...content.slice(0, from), ...hunk.insert, ...content.slice(from + count)] },
  });
  if (remove.length > 0) {
    const from = locate(sigs, remove, hunk.at);
    if (from >= 0) return put(from, remove.length);
    return insert.length > 0 && locate(sigs, insert, hunk.at) >= 0 ? { kind: 'alreadyThere' } : { kind: 'rewritten' };
  }
  if (hunk.before === null || hunk.before === undefined) return put(0, 0);
  const anchor = locate(sigs, [sig(hunk.before)], hunk.at - 1);
  return anchor >= 0 ? put(anchor + 1, 0) : { kind: 'rewritten' };
}
