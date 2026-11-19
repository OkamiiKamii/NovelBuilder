import type { JsonMap } from '../json';
import { blockTexts, lastLines } from '../prose';

export type WidgetDay = { net: number; written: boolean };
export type WidgetSummary = {
  version: 1;
  book: null | { title: string; goal: number | null; lines: string | null; days: Record<string, WidgetDay> };
};

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** What the home-screen widget and the Quick Settings tile show, written by the app as a small JSON file. Mirrors the
 * native read() in plugins/withWritingWidget.js. Every day is kept (the file stays small). */
export function widgetSummary(input: {
  novels: readonly { id: string; title: string; archived: boolean; lastOpenedAt: number | null }[];
  sessionsOf: (novelId: string) => readonly JsonMap[];
  goalsOf: (novelId: string) => readonly JsonMap[];
  lastDocOf: (novelId: string) => unknown;
}): WidgetSummary {
  let book: (typeof input.novels)[number] | null = null;
  for (const n of input.novels) {
    if (n.archived || n.lastOpenedAt === null) continue;
    if (book === null || n.lastOpenedAt > (book.lastOpenedAt as number)) book = n;
  }
  if (book === null) return { version: 1, book: null };

  const days: Record<string, WidgetDay> = {};
  for (const s of input.sessionsOf(book.id)) {
    if (typeof s.day !== 'string') continue;
    const d = (days[s.day] ??= { net: 0, written: false });
    d.net += num(s.netWords);
    if (num(s.netWords) > 0 || num(s.added) > 0) d.written = true;
  }
  const goalRow = input.goalsOf(book.id).find((g) => g.kind === 'daily' && typeof g.targetWords === 'number');
  const doc = input.lastDocOf(book.id);
  return {
    version: 1,
    book: {
      title: book.title,
      goal: goalRow ? (goalRow.targetWords as number) : null,
      // A hard break reads as a space on the widget, as it did before: its few lines stay the story's.
      lines: doc === undefined ? null : (lastLines(blockTexts(doc), 100)?.replace(/\s*\n\s*/g, ' ') ?? null),
      days,
    },
  };
}
