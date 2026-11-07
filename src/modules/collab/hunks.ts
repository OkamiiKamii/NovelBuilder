import { docBlocks } from '@/modules/search/extract';

type Block = unknown;

/** One change a suggestion makes: these paragraphs out, those in, at this place in the text it was written against. */
export interface Hunk {
  id: string;
  /** Where in the original it starts (a paragraph number). */
  at: number;
  remove: Block[];
  insert: Block[];
  /** The paragraph just before, for placing a pure addition. Null at the very start. */
  before: Block | null;
}

const blocksOf = (doc: unknown): Block[] => ((doc as { content?: Block[] } | null)?.content ?? []) as Block[];
const sig = (block: Block): string => JSON.stringify(block);
/** The words of some paragraphs, for showing what a change says. */
export const textOf = (blocks: Block[]): string => docBlocks({ type: 'doc', content: blocks }).map((b) => b.text).join('\n');

function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = (Math.imul(h, 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * The separate changes between a chapter as someone found it and as they
 * would have it, paragraph by paragraph, so that each can be accepted or
 * rejected on its own. Unchanged paragraphs are matched up first (longest
 * common run); each stretch between matches is one change.
 */
export function textHunks(base: unknown, proposed: unknown): Hunk[] {
  const [a, b] = [blocksOf(base), blocksOf(proposed)];
  const [sa, sb] = [a.map(sig), b.map(sig)];
  const [n, m] = [a.length, b.length];
  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) table[i * width + j] = sa[i] === sb[j] ? table[(i + 1) * width + j + 1] + 1 : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
  const hunks: Hunk[] = [];
  let [i, j] = [0, 0];
  let open: { at: number; remove: Block[]; insert: Block[] } | null = null;
  const close = () => {
    if (!open) return;
    // Named by where it is and what it says, not by how the document happens to be stored: the same change has the same
    // name on every device, so a verdict given on one is recognised on another.
    hunks.push({ ...open, before: open.at > 0 ? a[open.at - 1] : null, id: hash(`${open.at}|${open.remove.length}|${textOf(open.remove)}|${open.insert.length}|${textOf(open.insert)}`) });
    open = null;
  };
  while (i < n || j < m) {
    if (i < n && j < m && sa[i] === sb[j]) {
      close();
      i++;
      j++;
    } else {
      open ??= { at: i, remove: [], insert: [] };
      if (j < m && (i === n || table[i * width + j + 1] >= table[(i + 1) * width + j])) open.insert.push(b[j++]);
      else open.remove.push(a[i++]);
    }
  }
  close();
  return hunks;
}

const runAt = (content: string[], run: string[], from: number): boolean => run.every((s, k) => content[from + k] === s);
/** Where a run of paragraphs sits in a text, nearest to where it was expected. -1 when it is not there as it was. */
function locate(content: string[], run: string[], near: number): number {
  let best = -1;
  for (let from = 0; from + run.length <= content.length; from++) if (runAt(content, run, from) && (best < 0 || Math.abs(from - near) < Math.abs(best - near))) best = from;
  return best;
}

/**
 * Makes one accepted change to the chapter as it is NOW, which may have
 * moved on since the suggestion was written. The paragraphs it replaces are
 * found by what they say, not by counting; if they are no longer there as
 * the suggester saw them, nothing is changed and null is returned, so that
 * an author's later writing is never overwritten by an older proposal.
 */
export function applyHunk<T>(current: T, hunk: Hunk): T | null {
  const content = blocksOf(current);
  const sigs = content.map(sig);
  const [remove, insert] = [hunk.remove.map(sig), hunk.insert.map(sig)];
  const put = (from: number, count: number): T => ({ ...(current as object), content: [...content.slice(0, from), ...hunk.insert, ...content.slice(from + count)] }) as T;
  if (remove.length) {
    const from = locate(sigs, remove, hunk.at);
    if (from >= 0) return put(from, remove.length);
    // Already there (accepted before, or the author made the same change themselves): nothing to do.
    return insert.length && locate(sigs, insert, hunk.at) >= 0 ? current : null;
  }
  if (hunk.before === null) return put(0, 0);
  const anchor = locate(sigs, [sig(hunk.before)], hunk.at - 1);
  return anchor >= 0 ? put(anchor + 1, 0) : null;
}
