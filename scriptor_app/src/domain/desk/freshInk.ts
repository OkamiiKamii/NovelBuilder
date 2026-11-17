// TODAY'S INK: the paragraphs written or changed today, read against the chapter as it stood when the day began. Read
// only; the marks are drawn beside the text and on the chapter's spine, never in it. Pure TypeScript. A port of the
// logic in flutter_app/lib/features/write/fresh_ink.dart.

import { type JsonMap, numOrNull, str } from '../json';
import { blockTexts } from '../prose';
import { dartTrim } from '../text/dartString';

/** Whether today's ink is shown, kept on this device (on unless stored as `false`). */
export const freshInkKey = 'write.freshInk';

/** How long after the page last changed today's ink is read again (a moment after each pause in typing). */
export const freshInkReadAfterMs = 350;

/** The draft a chapter is in when it names none (`manuscript_service.dart`'s `mainDraft`). */
const mainDraft = 'Main draft';

/** The local midnight that begins the day holding [nowMs] (`DateTime(now.year, now.month, now.day)`). */
export function dayStartOf(nowMs: number): number {
  const now = new Date(Math.trunc(nowMs));
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

/** The chapter's paragraphs as they stood when today began ([dayStart], in milliseconds), from what is stored:
 * nothing (`[]`), for a page made today ([node]'s `createdAt` on or after it); the saved text ([saved], its
 * `chapterContents` row), when it was last saved before today (its `savedAt`, else the node's `updatedAt`); else the
 * newest copy in its history ([revisions], its `chapterRevisions` rows) saved before today, of the same draft
 * (`branchName`, "Main draft" when none; of copies saved at the same moment, the first listed). Null when that cannot
 * be known (no copy from before today): then nothing is marked, rather than guessed. */
export function textAtDayStart({
  node,
  saved,
  revisions,
  dayStart,
}: {
  node: JsonMap | null;
  saved: JsonMap | null;
  revisions: readonly JsonMap[];
  dayStart: number;
}): string[] | null {
  const start = dayStart;
  const created = numOrNull(node?.['createdAt']);
  if (created !== null && created >= start) return [];
  const savedAt = numOrNull(saved?.['savedAt']) ?? numOrNull(node?.['updatedAt']);
  if (saved && savedAt !== null && savedAt < start) return blockTexts(saved['doc']);
  const draft = str(node?.['branchName'], mainDraft);
  let best: JsonMap | null = null;
  for (const r of revisions) {
    const at = numOrNull(r['savedAt']);
    if (at === null || at >= start || str(r['branchName'], mainDraft) !== draft) continue;
    if (best === null || at > (numOrNull(best['savedAt']) ?? 0)) best = r;
  }
  return best === null ? null : blockTexts(best['doc']);
}

/** Which of [now]'s paragraphs (by index) were written or changed since [before]: those with words (more than white
 * space) whose text, trimmed, is not among [before]'s (each earlier paragraph matched once). With [before] unknown
 * (null), none. */
export function freshParagraphs(now: readonly string[], before: readonly string[] | null): Set<number> {
  if (before === null) return new Set();
  const left = new Map<string, number>();
  for (const b of before) {
    const t = dartTrim(b);
    if (t !== '') left.set(t, (left.get(t) ?? 0) + 1);
  }
  const out = new Set<number>();
  now.forEach((p, i) => {
    const t = dartTrim(p);
    if (t === '') return;
    const n = left.get(t) ?? 0;
    if (n > 0) {
      left.set(t, n - 1);
    } else {
      out.add(i);
    }
  });
  return out;
}
