// TIME-LAPSE: a chapter's saved copies, oldest first, as frames, each marking what it added to the one before. Pure
// TypeScript. A port of flutter_app/lib/shared/domain/manuscript/time_lapse.dart.

import { dartTrim } from '../text/dartString';
import { countWords } from '../text/voices';
import { compareNum, dartSort } from './dartSort';

/** A copy of a chapter's text: when it was saved, and its paragraphs. */
export type LapseCopy = { at: number; paragraphs: readonly string[] };

/** One frame of the time-lapse: the text as it was saved then, its words, and which of its paragraphs (by index) are
 * new or changed since the frame before (every one, on the first). */
export type LapseFrame = { at: number; paragraphs: string[]; words: number; fresh: Set<number> };

/** The frames of [copies]. Copies that say the same as the one before are left out (a save with nothing changed); empty
 * paragraphs are not counted as written. Paragraphs are matched in order (the longest common run of them), so a
 * paragraph moved or rewritten is new where it now stands. Words are counted as the voices count them (`voices.ts`). */
export function timeLapse(copies: readonly LapseCopy[]): LapseFrame[] {
  const sorted = dartSort([...copies], (a, b) => compareNum(a.at, b.at));
  const out: LapseFrame[] = [];
  let before: string[] | null = null;
  for (const c of sorted) {
    const now = c.paragraphs.map((p) => dartTrim(p)).filter((p) => p !== '');
    if (before !== null && sameList(before, now)) continue;
    out.push({ at: c.at, paragraphs: now, words: countWords(now.join(' ')), fresh: fresh(before ?? [], now) });
    before = now;
  }
  return out;
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** The indexes of [now] outside the longest common subsequence with [before], in order. */
function fresh(before: readonly string[], now: readonly string[]): Set<number> {
  const n = before.length;
  const m = now.length;
  // lcs[i][j]: the longest common run of before[i..] and now[j..].
  const lcs = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] =
        before[i] === now[j] ? lcs[i + 1][j + 1] + 1 : lcs[i + 1][j] > lcs[i][j + 1] ? lcs[i + 1][j] : lcs[i][j + 1];
    }
  }
  const kept = new Set<number>();
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (before[i] === now[j]) {
      kept.add(j);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  const out = new Set<number>();
  for (let k = 0; k < m; k++) if (!kept.has(k)) out.add(k);
  return out;
}
