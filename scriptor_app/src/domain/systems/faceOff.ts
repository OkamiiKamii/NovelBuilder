// THE FACE-OFF: two of a system's sheets set against each other, the progression story's "who would win": each
// number both have side by side, who leads in each, and what it says: who leads in how many, the widest gap, and what
// each holds that the other does not. Worked out from the sheets as they stand (./compute.ts). Reads only. A port of
// flutter_app/lib/shared/domain/systems/face_off.dart.

import { dartTrim } from '../text/dartString';
import { type ComputedSheet } from './compute';
import { formatNumber } from './formula';

/** One number both sheets have: its name, each side's value, and its unit. */
export type FaceOffRow = { name: string; a: number; b: number; unit: string; level: boolean };

/** The face-off of two sheets: the rows, and what it says. */
export type FaceOff = { rows: FaceOffRow[]; says: string[] };

/** Dart's `roundToDouble`: halves away from zero. */
export const dartRound = (n: number): number => (n < 0 ? -Math.round(-n) : Math.round(n));

/** "A", "A and B", "A, B and C". */
export function andList(names: readonly string[]): string {
  return names.length <= 1 ? names.join('') : `${names.slice(0, names.length - 1).join(', ')} and ${names[names.length - 1]}`;
}

/** `a` against `b` (named `aName` and `bName`). */
export function faceOff(a: ComputedSheet, b: ComputedSheet, names: { aName: string; bName: string }): FaceOff {
  const { aName, bName } = names;
  const rows: FaceOffRow[] = [];
  for (const t of a.tracks) {
    const other = b.tracks.find((x) => x.track.id === t.track.id);
    if (t.level === null || other === undefined || other.level === null) continue;
    rows.push({ name: t.track.name, a: t.level, b: other.level, unit: '', level: true });
  }
  for (const r of a.rows) {
    if (typeof r.value !== 'number' || r.variable.kind === 'choice') continue;
    const other = b.rows.find((x) => x.variable.id === r.variable.id);
    if (other === undefined || typeof other.value !== 'number') continue;
    rows.push({ name: r.variable.name, a: r.value, b: other.value, unit: dartTrim(r.variable.unit), level: false });
  }

  const says: string[] = [];
  if (rows.length === 0) return { rows, says };
  const aLeads = rows.filter((r) => r.a > r.b).map((r) => r.name);
  const bLeads = rows.filter((r) => r.b > r.a).map((r) => r.name);
  if (aLeads.length === 0 && bLeads.length === 0) {
    says.push(`${aName} and ${bName} are even in everything.`);
  } else {
    const [leader, led, ahead, behind] =
      aLeads.length >= bLeads.length ? ([aName, bName, aLeads, bLeads] as const) : ([bName, aName, bLeads, aLeads] as const);
    says.push(
      behind.length === 0
        ? `${leader} leads in all ${ahead.length}.`
        : `${leader} leads in ${ahead.length} of ${rows.length}; ${led} only in ${andList(behind)}.`,
    );
  }
  // The widest gap, as a share: "three times", "half again".
  let widest: FaceOffRow | null = null;
  let most = 1;
  for (const r of rows) {
    const low = r.a < r.b ? r.a : r.b;
    const high = r.a < r.b ? r.b : r.a;
    if (low <= 0 || high === low) continue;
    const ratio = high / low;
    if (ratio > most) {
      most = ratio;
      widest = r;
    }
  }
  if (widest !== null && most >= 1.5) {
    const r = widest;
    const [hi, hiValue, lo, loValue] = r.a > r.b ? ([aName, r.a, bName, r.b] as const) : ([bName, r.b, aName, r.a] as const);
    const unit = r.unit.length === 0 ? '' : ` ${r.unit}`;
    const times = most >= 1.95 ? `${formatNumber(dartRound(most * 10) / 10)} times` : `${formatNumber(dartRound((most - 1) * 100))}% more`;
    says.push(`The widest gap: ${r.name}, ${hi} ${formatNumber(hiValue)}${unit} to ${lo} ${formatNumber(loValue)}${unit} (${times}).`);
  }
  // What each holds that the other does not.
  const aHeld = [...new Set(a.items.map((i) => i.item.name))];
  const bHeld = [...new Set(b.items.map((i) => i.item.name))];
  const onlyA = aHeld.filter((n) => !bHeld.includes(n));
  const onlyB = bHeld.filter((n) => !aHeld.includes(n));
  if (onlyA.length > 0) says.push(`Only ${aName} holds ${andList(onlyA.slice(0, 4))}${onlyA.length > 4 ? '…' : ''}.`);
  if (onlyB.length > 0) says.push(`Only ${bName} holds ${andList(onlyB.slice(0, 4))}${onlyB.length > 4 ? '…' : ''}.`);
  return { rows, says };
}
