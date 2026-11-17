// THE FACE-OFF, on Systems (../faceOff.ts sets them against each other): two of the system's sheets side by side, the
// genre's "who would win". Their cameos either side of VS, and for every number both have, a bar out to each side,
// the longer lit; what it says beneath. In the system's own window dress. "Share the face-off" makes a picture of it
// (face-off.png). It only reads; with fewer than two sheets it is not shown. The pure parts of
// flutter_app/lib/features/progression/widgets/face_off_view.dart.
//
// Drawn: a sports icon (18, primary), "THE FACE-OFF" (11, weight 700, primary, letter spacing 2), the caption (14.5,
// italic); with more than two sheets two rows of names with "against" between (14, italic), else "Swap sides"; then
// the card centred at most 520 wide: the look's gradient top to bottom, radius 8, a border of its accent at 55%,
// padded 14: each cameo 64 × 78 (radius 10) over its name (14 bold, ink, two lines, centred), "VS" between (26, weight
// 900, the accent, letter spacing 2, a glow of the accent at 60% blur 12; 22 down); then each number: its name in
// capitals (10.5, letter spacing 1.4, ink at 75%), 3 below, a row: A's value 54 wide (13; bold in the accent when it
// leads, else ink at 70%), A's bar growing right to left, 6, B's bar growing left to right, B's value 54 wide at the
// right; each bar 8 high, radius 4, the accent with a glow (at 50%, blur 6) when it leads, else ink at 28%; 5 above
// and below. Then a rule (1, the accent at 28%, 8 above and below) and what it says (13.5, ink, height 1.35), 4 below.

import { type StoryModel } from '../../model/storyModel';
import { type SystemBlueprint, type SystemSheet } from '../../records/system';
import { dartTrim } from '../../text/dartString';
import { SheetProfile, computeSheet } from '../compute';
import { type FaceOff, type FaceOffRow, faceOff } from '../faceOff';
import { formatNumber } from '../formula';
import { type WindowLook, windowLookOf } from './statusWindow';
import { windowKindOf } from './systemSpeaks';

export const faceOffWords = {
  heading: 'THE FACE-OFF',
  caption: 'Two of them, side by side, as they stand. Who would win?',
  against: 'against',
  swap: 'Swap sides',
  share: 'Share the face-off',
  file: 'face-off.png',
  vs: 'VS',
} as const;

/** The face-off as shown, for the sides chosen (`a`, `b`; else the first two). Null with fewer than two sheets. */
export function faceOffView(
  model: StoryModel,
  system: SystemBlueprint,
  chosen: { a: string | null; b: string | null },
): {
  a: SystemSheet;
  b: SystemSheet;
  aName: string;
  bName: string;
  face: FaceOff;
  look: WindowLook;
  /** Two rows of names, each without the other side (more than two sheets); else null (Swap sides). */
  pickers: { a: { id: string; label: string; selected: boolean }[]; b: { id: string; label: string; selected: boolean }[] } | null;
  semanticsLabel: string;
} | null {
  const sheets = model.sheets.filter((s) => s.systemId === system.id && model.entries.has(s.entryId));
  if (sheets.length < 2) return null;
  const a = sheets.find((s) => s.id === chosen.a) ?? sheets[0];
  const b = sheets.find((s) => s.id === chosen.b && s.id !== a.id) ?? sheets.find((s) => s.id !== a.id)!;
  const nameOf = (s: SystemSheet): string => dartTrim(model.entries.get(s.entryId)!.name);
  const face = faceOff(computeSheet(system, SheetProfile.of(a)), computeSheet(system, SheetProfile.of(b)), { aName: nameOf(a), bName: nameOf(b) });
  const picker = (picked: SystemSheet, other: SystemSheet) =>
    sheets.filter((s) => s.id !== other.id).map((s) => ({ id: s.id, label: nameOf(s), selected: s.id === picked.id }));
  return {
    a,
    b,
    aName: nameOf(a),
    bName: nameOf(b),
    face,
    look: windowLookOf(windowKindOf(system)),
    pickers: sheets.length > 2 ? { a: picker(a, b), b: picker(b, a) } : null,
    semanticsLabel: `${nameOf(a)} against ${nameOf(b)}. ${face.says.join(' ')}`,
  };
}

/** One number's two bars: each side's share of the larger, who leads, and the values with their unit (a unit longer
 * than 4 is left out). */
export function faceOffBars(row: FaceOffRow): { name: string; aPart: number; bPart: number; aLeads: boolean; bLeads: boolean; aValue: string; bValue: string } {
  const top = row.a > row.b ? row.a : row.b;
  const part = (v: number): number => (top <= 0 ? 0 : Math.min(1, Math.max(0, v / top)));
  const unit = row.unit.length === 0 || row.unit.length > 4 ? '' : ` ${row.unit}`;
  return {
    name: row.name.toUpperCase(),
    aPart: part(row.a),
    bPart: part(row.b),
    aLeads: row.a > row.b,
    bLeads: row.b > row.a,
    aValue: `${formatNumber(row.a)}${unit}`,
    bValue: `${formatNumber(row.b)}${unit}`,
  };
}
