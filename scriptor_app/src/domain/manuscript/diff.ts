// Comparing two versions of a chapter, as the original app did: unchanged paragraphs are matched first, then each
// replaced stretch is examined word by word. Formatting-only changes are not shown. Used by version history. Pure
// TypeScript. A port of flutter_app/lib/shared/domain/manuscript/diff.dart; the shapes below are its `toJson`.

import { blockTexts, countWords } from '../prose';
import { dartToLowerCase, dartTrim, dartTrimRight } from '../text/dartString';

export type DiffOp = 'same' | 'add' | 'del';

export type DiffPart = { op: DiffOp; text: string };

/** One paragraph of a comparison: same, added, removed, changed (with word-level parts), or moved (an identical
 * paragraph somewhere else; `side` says which copy this is). */
export type DiffBlock =
  | { kind: 'same' | 'added' | 'removed'; text: string }
  | { kind: 'changed'; parts: DiffPart[] }
  | { kind: 'moved'; side: 'from' | 'to'; text: string };

export type DiffStats = {
  wordsBefore: number;
  wordsAfter: number;
  charactersBefore: number;
  charactersAfter: number;
  wordsAdded: number;
  wordsRemoved: number;
  paragraphsChanged: number;
};

export type DiffResult = { blocks: DiffBlock[]; stats: DiffStats; identical: boolean };

/** Above this many table cells a comparison falls back to a coarser result instead of stalling. */
const maxCells = 4000000;

/** Two paragraphs sharing at least this fraction of their words are shown as one edited paragraph. */
const similar = 0.4;

function align<T>(a: readonly T[], b: readonly T[], equal: (x: T, y: T) => boolean): DiffOp[] | null {
  const n = a.length;
  const m = b.length;
  if (n * m > maxCells) return null;
  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * width + j] = equal(a[i], b[j])
        ? table[(i + 1) * width + j + 1] + 1
        : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
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

const coarse = (n: number, m: number): DiffOp[] => [...Array<DiffOp>(n).fill('del'), ...Array<DiffOp>(m).fill('add')];

const tokenSource = "^\\s+|[\\p{L}\\p{N}'’_-]+\\s*|[^\\s\\p{L}\\p{N}]\\s*";

function tokens(text: string): { word: string; space: string }[] {
  return [...text.matchAll(new RegExp(tokenSource, 'gu'))].map((m) => {
    const raw = m[0];
    const word = dartTrimRight(raw);
    return { word, space: raw.substring(word.length) };
  });
}

function wordsIn(parts: readonly DiffPart[], op: DiffOp): number {
  return parts.filter((p) => p.op === op).reduce((n, p) => n + countWords(p.text), 0);
}

/** Word-level changes between two versions of a paragraph. Joining the same and add parts gives the newer text
 * exactly; same and del, the older. */
export function diffWords(before: string, after: string): DiffPart[] {
  const a = tokens(before);
  const b = tokens(after);
  const ops = align(a, b, (x, y) => x.word === y.word) ?? coarse(a.length, b.length);
  const parts: DiffPart[] = [];
  const push = (op: DiffOp, text: string) => {
    if (text === '') return;
    const last = parts[parts.length - 1];
    if (last !== undefined && last.op === op) {
      last.text += text;
    } else {
      parts.push({ op, text });
    }
  };

  let i = 0;
  let j = 0;
  for (const op of ops) {
    switch (op) {
      case 'del':
        push('del', a[i].word + a[i++].space);
        break;
      case 'add':
        push('add', b[j].word + b[j++].space);
        break;
      case 'same': {
        const x = a[i++];
        const y = b[j++];
        if (x.space === y.space) {
          push('same', y.word + y.space);
        } else {
          // Same word, different spacing after it: show exactly that.
          push('same', y.word);
          push('del', x.space);
          push('add', y.space);
        }
        break;
      }
    }
  }
  return parts;
}

const simWord = () => /[\p{L}\p{N}']+/gu;

function similarity(a: string, b: string): number {
  const x = [...dartToLowerCase(a).matchAll(simWord())].map((m) => m[0]);
  const y = [...dartToLowerCase(b).matchAll(simWord())].map((m) => m[0]);
  if (x.length === 0 || y.length === 0) return 0;
  const bag = new Map<string, number>();
  for (const w of x) bag.set(w, (bag.get(w) ?? 0) + 1);
  let shared = 0;
  for (const w of y) {
    const left = bag.get(w) ?? 0;
    if (left > 0) {
      shared++;
      bag.set(w, left - 1);
    }
  }
  return (2 * shared) / (x.length + y.length);
}

function pairChanged(removed: readonly string[], added: readonly string[]): DiffBlock[] {
  const ops = align(removed, added, (x, y) => similarity(x, y) >= similar) ?? coarse(removed.length, added.length);
  const blocks: DiffBlock[] = [];
  let i = 0;
  let j = 0;
  for (const op of ops) {
    switch (op) {
      case 'same':
        blocks.push({ kind: 'changed', parts: diffWords(removed[i++], added[j++]) });
        break;
      case 'del':
        blocks.push({ kind: 'removed', text: removed[i++] });
        break;
      case 'add':
        blocks.push({ kind: 'added', text: added[j++] });
        break;
    }
  }
  return blocks;
}

/** Compares two texts given as lists of paragraphs. */
export function diffParagraphs(before: readonly string[], after: readonly string[]): DiffResult {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let end = 0;
  while (
    end < before.length - start &&
    end < after.length - start &&
    before[before.length - 1 - end] === after[after.length - 1 - end]
  ) {
    end++;
  }
  const a = before.slice(start, before.length - end);
  const b = after.slice(start, after.length - end);
  const ops = align(a, b, (x, y) => x === y) ?? coarse(a.length, b.length);

  const blocks: DiffBlock[] = before.slice(0, start).map((t): DiffBlock => ({ kind: 'same', text: t }));
  let i = 0;
  let removed: string[] = [];
  let added: string[] = [];
  const flush = () => {
    if (removed.length > 0 || added.length > 0) blocks.push(...pairChanged(removed, added));
    removed = [];
    added = [];
  };

  let j = 0;
  for (const op of ops) {
    switch (op) {
      case 'same':
        flush();
        blocks.push({ kind: 'same', text: a[i++] });
        j++;
        break;
      case 'del':
        removed.push(a[i++]);
        break;
      case 'add':
        added.push(b[j++]);
        break;
    }
  }
  flush();
  for (const t of before.slice(before.length - end)) blocks.push({ kind: 'same', text: t });

  // A paragraph removed in one place and added, word for word, in another has been moved.
  const waiting = new Map<string, number[]>();
  blocks.forEach((block, index) => {
    if (block.kind === 'removed' && dartTrim(block.text) !== '') {
      const list = waiting.get(block.text) ?? [];
      list.push(index);
      waiting.set(block.text, list);
    }
  });
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];
    if (block.kind !== 'added') continue;
    const from = waiting.get(block.text);
    if (from === undefined || from.length === 0) continue;
    const f = from.shift()!;
    blocks[f] = { kind: 'moved', side: 'from', text: block.text };
    blocks[index] = { kind: 'moved', side: 'to', text: block.text };
  }

  let wordsAdded = 0;
  let wordsRemoved = 0;
  let paragraphsChanged = 0;
  for (const block of blocks) {
    if (block.kind === 'same') continue;
    paragraphsChanged++;
    switch (block.kind) {
      case 'added':
        wordsAdded += countWords(block.text);
        break;
      case 'removed':
        wordsRemoved += countWords(block.text);
        break;
      case 'changed':
        wordsAdded += wordsIn(block.parts, 'add');
        wordsRemoved += wordsIn(block.parts, 'del');
        break;
    }
  }
  const length = (ps: readonly string[]) => ps.reduce((n, p) => n + Array.from(p).length, 0);
  return {
    blocks,
    stats: {
      wordsBefore: before.reduce((n, p) => n + countWords(p), 0),
      wordsAfter: after.reduce((n, p) => n + countWords(p), 0),
      charactersBefore: length(before),
      charactersAfter: length(after),
      wordsAdded,
      wordsRemoved,
      paragraphsChanged,
    },
    identical: paragraphsChanged === 0,
  };
}

/** Compares two saved documents by their text. */
export function diffDocs(before: unknown, after: unknown): DiffResult {
  return diffParagraphs(blockTexts(before), blockTexts(after));
}
