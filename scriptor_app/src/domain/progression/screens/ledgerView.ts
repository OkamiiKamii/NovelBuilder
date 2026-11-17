// THE LEDGER on Systems (numberLedger.ts keeps it): the numbers the chapters give for this system's stats and levels,
// each a line of what it was and where ("Strength 10 · 1 → 12 · 3 → 14 · 5"), and above them the slips, each with the
// sentence and a press to read it in its chapter (opened at that paragraph). Read from the saved chapters as the page
// opens, away from the screen. It only reads. The pure parts of
// flutter_app/lib/features/progression/widgets/number_ledger_view.dart.
//
// The box (surfaceContainerLow, radius 14, outlineVariant border, padded 16 14 16 12): a receipt icon (18, primary)
// and THE LEDGER (heading face 11, bold, primary, spacing 2), at the right the slips counted on an error pill (radius
// 10, onError 12 bold); the line under it (book face 14.5, italic, onSurfaceVariant); then a thin progress bar while it
// is read; the empty line; or the slips (each: errorContainer at 22%, border error at 40%, radius 10, padded 12 10 8 4:
// its kicker (10, bold, error, spacing 1.5), what it says (15.5), the sentence in quotes (14, italic, two lines), and
// "Read it in chapter N" at the right), "Every number adds up." with a check when there are none, and the lines (each:
// the name, 96 wide, heading face 13 bold; then its last six numbers, "…" before them when there are more, an arrow
// (12) between, each number in the numbers face, the last bold and primary, followed by " ·N" (11) for its chapter).

import { type StoryModel } from '../../model/storyModel';
import { readingOrder } from '../../model/storyOrder';
import { isDocument } from '../../outline';
import { type SystemBlueprint } from '../../records/system';
import { SheetProfile, computeSheet } from '../../systems/compute';
import { type Ledger, type LedgerLine, type LedgerSlip, type SlipKind, ledgerNumber, numberLedgerJob } from '../../systems/numberLedger';

/** The chapters the ledger reads, in reading order. */
export function ledgerChapters(model: StoryModel): { id: string; title: string }[] {
  return readingOrder(model.nodes.values())
    .filter((n) => isDocument(n.kind))
    .map((n) => ({ id: n.id, title: n.displayTitle }));
}

/** What the ledger is read for: the stats and level tracks the system names, and, when it has one sheet (of an entry
 * still in the novel), what that sheet holds now, for the last check. */
export function ledgerInputs(
  model: StoryModel,
  system: SystemBlueprint,
): { order: string[]; stats: string[]; tracks: string[]; sheet: Map<string, number> } {
  const sheets = model.sheets.filter((s) => s.systemId === system.id && model.entries.has(s.entryId));
  const sheet = new Map<string, number>();
  if (sheets.length === 1) {
    const c = computeSheet(system, SheetProfile.of(sheets[0]));
    for (const r of c.rows) if (typeof r.value === 'number') sheet.set(r.variable.name, r.value);
    for (const t of c.tracks) if (t.level !== null) sheet.set(t.track.name, t.level);
  }
  return {
    order: ledgerChapters(model).map((c) => c.id),
    stats: system.variables.map((v) => v.name),
    tracks: system.tracks.filter((t) => t.kind === 'levels').map((t) => t.name),
    sheet,
  };
}

/** The reading, as a job to run away from the screen, over the chapters as stored. */
export function ledgerJob(model: StoryModel, system: SystemBlueprint, storedContents: readonly string[]): () => Ledger {
  const i = ledgerInputs(model, system);
  return numberLedgerJob(storedContents, i.order, { stats: i.stats, tracks: i.tracks, sheet: i.sheet });
}

export const ledgerWords = {
  heading: 'THE LEDGER',
  line: 'The numbers your pages give for this system, checked as a reader would.',
  empty:
    'Your pages do not give any of its numbers yet. When a chapter says "Strength 12" or "Level 3" (or ' +
    'The system speaks writes it), it is kept here.',
  allGood: 'Every number adds up.',
} as const;

export const slipKicker: Readonly<Record<SlipKind, string>> = {
  sum: 'THE SUM',
  start: 'THE START',
  backwards: 'BACKWARDS',
  sheet: 'THE SHEET',
};

/** The pill at the top: "1 slip", "3 slips"; null with none. */
export function slipsCount(ledger: Ledger | null): string | null {
  const n = ledger?.slips.length ?? 0;
  return n === 0 ? null : n === 1 ? '1 slip' : `${n} slips`;
}

/** A slip as shown: its kicker, what it says, the sentence (in quotes), and its press. */
export function slipCard(slip: LedgerSlip): { kicker: string; says: string; said: string; read: string } {
  return { kicker: slipKicker[slip.kind], says: slip.says, said: `“${slip.at.said}”`, read: `Read it in chapter ${slip.at.chapter}` };
}

/** Where "Read it in chapter N" goes: the chapter, opened with find on the name, at that paragraph. */
export function slipReadThere(slip: LedgerSlip): { nodeId: string; term: string; block: number } {
  return { nodeId: slip.at.nodeId, term: slip.name, block: slip.at.block };
}

/** A line as shown: its name, its last six numbers (with "…" before them when there are more), each with its chapter,
 * the last the strongest; and what a screen reader hears of all of it. */
export function ledgerLine(line: LedgerLine): {
  name: string;
  more: boolean;
  numbers: { value: string; chapter: string; last: boolean }[];
  semanticsLabel: string;
} {
  const shown = line.entries.length > 6 ? line.entries.slice(line.entries.length - 6) : line.entries;
  return {
    name: line.name,
    more: shown.length < line.entries.length,
    numbers: shown.map((e, i) => ({ value: ledgerNumber(e.value), chapter: ` ·${e.chapter}`, last: i === shown.length - 1 })),
    semanticsLabel: `${line.name}: ${line.entries.map((e) => `${ledgerNumber(e.value)} in chapter ${e.chapter}`).join(', ')}`,
  };
}
