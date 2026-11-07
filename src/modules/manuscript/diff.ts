import { docBlocks } from '@/modules/search/extract';
import { countWords } from './metrics';

export type DiffOp = 'same' | 'add' | 'del';

export interface DiffPart {
  op: DiffOp;
  text: string;
}

/**
 * One paragraph of a comparison.
 *  - same:    unchanged
 *  - added:   only in the newer text
 *  - removed: only in the older text
 *  - changed: in both, edited; `parts` marks the words added and removed
 *  - moved:   identical paragraph that sits somewhere else in the other text
 *             (`side` says which copy this is)
 */
export type DiffBlock =
  | { kind: 'same' | 'added' | 'removed'; text: string }
  | { kind: 'changed'; parts: DiffPart[] }
  | { kind: 'moved'; side: 'from' | 'to'; text: string };

export interface DiffStats {
  wordsBefore: number;
  wordsAfter: number;
  charactersBefore: number;
  charactersAfter: number;
  wordsAdded: number;
  wordsRemoved: number;
  paragraphsChanged: number;
}

export interface DiffResult {
  blocks: DiffBlock[];
  stats: DiffStats;
  identical: boolean;
}

/** Above this many table cells a comparison falls back to a coarser result instead of stalling. */
const MAX_CELLS = 4_000_000;
/** Two paragraphs sharing at least this fraction of their words are shown as one edited paragraph. */
const SIMILAR = 0.4;

/**
 * Longest common subsequence, as a list of steps turning `a` into `b`.
 * Returns null when the inputs are too large to compare this way.
 */
function align<T>(a: T[], b: T[], equal: (x: T, y: T) => boolean): DiffOp[] | null {
  const n = a.length;
  const m = b.length;
  if (n * m > MAX_CELLS) return null;
  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * width + j] = equal(a[i], b[j]) ? table[(i + 1) * width + j + 1] + 1 : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (equal(a[i], b[j])) {
      ops.push('same');
      i++;
      j++;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      ops.push('del');
      i++;
    } else {
      ops.push('add');
      j++;
    }
  }
  while (i++ < n) ops.push('del');
  while (j++ < m) ops.push('add');
  return ops;
}

interface Token {
  /** A word, or a single punctuation mark; empty for whitespace that opens a paragraph. */
  word: string;
  /** The whitespace that follows it, kept exactly. */
  space: string;
}

function tokens(text: string): Token[] {
  return (text.match(/^\s+|[\p{L}\p{N}'’_-]+\s*|[^\s\p{L}\p{N}]\s*/gu) ?? []).map((raw) => {
    const word = raw.trimEnd();
    return { word, space: raw.slice(word.length) };
  });
}

const wordsIn = (parts: DiffPart[], op: DiffOp) => parts.filter((p) => p.op === op).reduce((n, p) => n + countWords(p.text), 0);

/**
 * Word-level changes between two versions of a paragraph. Joining the `same`
 * and `add` parts gives the newer text exactly; `same` and `del`, the older.
 */
export function diffWords(before: string, after: string): DiffPart[] {
  const a = tokens(before);
  const b = tokens(after);
  const ops = align(a, b, (x, y) => x.word === y.word) ?? [...a.map((): DiffOp => 'del'), ...b.map((): DiffOp => 'add')];
  const parts: DiffPart[] = [];
  const push = (op: DiffOp, text: string) => {
    if (!text) return;
    const last = parts[parts.length - 1];
    if (last?.op === op) last.text += text;
    else parts.push({ op, text });
  };
  let i = 0;
  let j = 0;
  for (const op of ops) {
    if (op === 'del') push('del', a[i].word + a[i++].space);
    else if (op === 'add') push('add', b[j].word + b[j++].space);
    else {
      const [x, y] = [a[i++], b[j++]];
      if (x.space === y.space) push('same', y.word + y.space);
      else {
        // Same word, different spacing after it (a double space, say): show exactly that.
        push('same', y.word);
        push('del', x.space);
        push('add', y.space);
      }
    }
  }
  return parts;
}

function similarity(a: string, b: string): number {
  const x = a.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
  const y = b.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
  if (!x.length || !y.length) return 0;
  const bag = new Map<string, number>();
  for (const word of x) bag.set(word, (bag.get(word) ?? 0) + 1);
  let shared = 0;
  for (const word of y) {
    const left = bag.get(word) ?? 0;
    if (left > 0) {
      shared++;
      bag.set(word, left - 1);
    }
  }
  return (2 * shared) / (x.length + y.length);
}

/** Within a run of replaced paragraphs, pairs up the ones that are edits of each other. */
function pairChanged(removed: string[], added: string[]): DiffBlock[] {
  const ops = align(removed, added, (x, y) => similarity(x, y) >= SIMILAR) ?? [...removed.map((): DiffOp => 'del'), ...added.map((): DiffOp => 'add')];
  const blocks: DiffBlock[] = [];
  let i = 0;
  let j = 0;
  for (const op of ops) {
    if (op === 'same') blocks.push({ kind: 'changed', parts: diffWords(removed[i++], added[j++]) });
    else if (op === 'del') blocks.push({ kind: 'removed', text: removed[i++] });
    else blocks.push({ kind: 'added', text: added[j++] });
  }
  return blocks;
}

/**
 * Compares two texts given as lists of paragraphs. Unchanged paragraphs are
 * matched first, then each replaced stretch is examined word by word.
 */
export function diffParagraphs(before: string[], after: string[]): DiffResult {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let end = 0;
  while (end < before.length - start && end < after.length - start && before[before.length - 1 - end] === after[after.length - 1 - end]) end++;
  const a = before.slice(start, before.length - end);
  const b = after.slice(start, after.length - end);
  const ops = align(a, b, (x, y) => x === y) ?? [...a.map((): DiffOp => 'del'), ...b.map((): DiffOp => 'add')];

  const blocks: DiffBlock[] = before.slice(0, start).map((text) => ({ kind: 'same', text }));
  let i = 0;
  let j = 0;
  let removed: string[] = [];
  let added: string[] = [];
  const flush = () => {
    if (removed.length || added.length) blocks.push(...pairChanged(removed, added));
    removed = [];
    added = [];
  };
  for (const op of ops) {
    if (op === 'same') {
      flush();
      blocks.push({ kind: 'same', text: a[i++] });
      j++;
    } else if (op === 'del') removed.push(a[i++]);
    else added.push(b[j++]);
  }
  flush();
  blocks.push(...before.slice(before.length - end).map((text): DiffBlock => ({ kind: 'same', text })));

  // A paragraph removed in one place and added, word for word, in another has been moved.
  const waiting = new Map<string, number[]>();
  blocks.forEach((block, index) => {
    if (block.kind === 'removed' && block.text.trim()) waiting.set(block.text, [...(waiting.get(block.text) ?? []), index]);
  });
  blocks.forEach((block, index) => {
    if (block.kind !== 'added') return;
    const from = waiting.get(block.text)?.shift();
    if (from === undefined) return;
    blocks[from] = { kind: 'moved', side: 'from', text: block.text };
    blocks[index] = { kind: 'moved', side: 'to', text: block.text };
  });

  let wordsAdded = 0;
  let wordsRemoved = 0;
  let paragraphsChanged = 0;
  for (const block of blocks) {
    if (block.kind === 'same') continue;
    paragraphsChanged++;
    if (block.kind === 'added') wordsAdded += countWords(block.text);
    else if (block.kind === 'removed') wordsRemoved += countWords(block.text);
    else if (block.kind === 'changed') {
      wordsAdded += wordsIn(block.parts, 'add');
      wordsRemoved += wordsIn(block.parts, 'del');
    }
  }
  const length = (paragraphs: string[]) => paragraphs.reduce((n, p) => n + [...p].length, 0);
  return {
    blocks,
    identical: paragraphsChanged === 0,
    stats: {
      wordsBefore: before.reduce((n, p) => n + countWords(p), 0),
      wordsAfter: after.reduce((n, p) => n + countWords(p), 0),
      charactersBefore: length(before),
      charactersAfter: length(after),
      wordsAdded,
      wordsRemoved,
      paragraphsChanged,
    },
  };
}

/** Compares two saved documents by their text. Formatting-only changes (bold, alignment) are not shown. */
export const diffDocs = (before: unknown, after: unknown): DiffResult =>
  diffParagraphs(docBlocks(before).map((b) => b.text), docBlocks(after).map((b) => b.text));
