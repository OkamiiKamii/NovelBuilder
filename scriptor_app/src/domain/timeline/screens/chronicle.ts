// THE CHRONICLE: the timeline as one line of time running down the page. Each year is a mark on it, each event hangs
// from it by a node sized by its importance (on a wide screen, to either side in turn), a jump of years is said on the
// line itself, and events not yet placed in time follow on a broken line. The pure parts of
// flutter_app/lib/features/timeline/widgets/chronicle.dart: the rows, and how each row's line and node are drawn.
//
// The rows, top to bottom (`chronicleRows`): for each year group, a gap row first when years were skipped ("26 years
// later"), its year mark, then its events. Wide is 840 or more.
//
// How a row is drawn (`lineOf` gives the numbers):
//  - The line runs at x = width / 2 (wide) or 22 (narrow: half the 44 gutter), 2 wide in outlineVariant; dashed (5 on,
//    4 off: a dash every 9 from the top) for undated rows and gap rows; it starts at the node for the very first mark.
//  - An event row: the card in the left or right half (wide, with a 72 gutter in the middle; sides alternate, first
//    left) or 44 in from the left (narrow), 12 below it. Its node sits 26 down; a reach 1.5 wide joins it to the card
//    (to x ± 36 wide, to 44 narrow). Nodes: minor a ring of 5 (2 wide, the accent) on the page colour; major a disc of
//    7 in the accent; climax a halo of 14 (the accent at 22%), a disc of 9 and a ring of 9 in the page colour, 2 wide.
//  - A year mark: 4 above the first, 14 above the others, 14 below; the heading (the book face, 20 bold; undated 16,
//    onSurfaceVariant). Wide: centred in a pill (radius 20, padding 18 × 8, the page colour, a border of the accent at
//    60%, outlineVariant when undated) and no node. Narrow: 44 in, 12 above, 2 below, and a node level with the
//    heading's middle ((4 or 14) + 12 + 13 down): a ring of 8 (2 wide) on the page colour around a dot of 3.5, the
//    accent (outline when undated).
//  - A gap: 10 above and below; the words (the book face, 15, italic, onSurfaceVariant), centred on the page colour
//    (wide) or 44 in (narrow); the line dashed, no node.

import type { Placed } from '../chronology';
import type { ChronicleGroup } from './timelinePage';

export const chronicleWide = 840;
export const wideGutter = 72.0;
export const narrowGutter = 44.0;
export const nodeY = 26.0;

export type ChronicleRow =
  | { kind: 'gap'; text: string }
  | { kind: 'year'; heading: string; undated: boolean; first: boolean }
  | { kind: 'event'; placed: Placed; left: boolean; importance: string; dashed: boolean };

/** The rows of the chronicle for these groups, at this width. */
export function chronicleRows(groups: readonly ChronicleGroup[], wide: boolean): ChronicleRow[] {
  const rows: ChronicleRow[] = [];
  let side = 0;
  let lastYear: number | null = null;
  for (const g of groups) {
    const year = /^-?\d+$/.test(g.key) ? Number(g.key) : null;
    const undated = year === null;
    if (year !== null && lastYear !== null && year - lastYear > 1) rows.push({ kind: 'gap', text: `${year - lastYear} years later` });
    rows.push({ kind: 'year', heading: g.heading, undated, first: rows.length === 0 });
    for (const p of g.items) {
      rows.push({ kind: 'event', placed: p, left: wide && side % 2 === 0, importance: p.event.importanceKey, dashed: undated });
      side++;
    }
    if (year !== null) lastYear = year;
  }
  return rows;
}

/** Where the line runs in a row `width` wide. */
export const lineX = (wide: boolean, width: number): number => (wide ? width / 2 : narrowGutter / 2);

/** How a row's line and node are drawn, in a row `width` × `height`. */
export function lineOf(
  row: ChronicleRow,
  wide: boolean,
  width: number,
  height: number,
): {
  x: number;
  /** The line from `top` down to the row's bottom; as dashes when `dashed`. */
  top: number;
  dashed: boolean;
  dashes: { from: number; to: number }[];
  /** The node, its centre `y`; null for a gap row and a wide year mark. */
  node: 'minor' | 'major' | 'climax' | 'year' | null;
  y: number;
  /** The reach from the node to the card, for an event. */
  reach: { from: number; to: number } | null;
} {
  const x = lineX(wide, width);
  const kind = row.kind;
  const node = kind === 'gap' ? null : kind === 'year' ? 'year' : row.importance === 'climax' || row.importance === 'major' ? row.importance : 'minor';
  const at = kind === 'year' && !wide ? (row.first ? 4 : 14) + 12 + 13 : null;
  const y = at ?? (node === 'year' ? height / 2 : nodeY);
  const top = kind === 'year' && row.first ? y : 0;
  const dashed = kind === 'gap' ? true : kind === 'year' ? row.undated : row.dashed;
  const dashes: { from: number; to: number }[] = [];
  if (dashed) {
    for (let t = top; t < height; t += 9) dashes.push({ from: t, to: Math.min(Math.max(t + 5, 0), height) });
  }
  const reach = kind === 'event' ? { from: x, to: wide ? x + (row.left ? -1 : 1) * (wideGutter / 2) : narrowGutter } : null;
  return { x, top, dashed, dashes, node: node === 'year' && wide ? null : node, y, reach };
}
