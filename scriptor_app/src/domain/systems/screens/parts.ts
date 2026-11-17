// What the Systems screens share: numbers read as Dart reads them, a starting value written as the Flutter app writes
// it, and the list edits a blueprint's tabs make (patch one, take one out, move one, split "A, B, C"). Pure.

import { type JsonMap } from '../../json';
import { maps } from '../../records/jsonRecord';
import { type SystemBlueprint } from '../../records/system';
import { dartTrim } from '../../text/dartString';

/** Dart's `double.tryParse`: a decimal (with an exponent), or Infinity / NaN, signed; whitespace round it ignored. */
export function dartDoubleTryParse(text: string): number | null {
  const t = dartTrim(text);
  if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return Number(t);
  if (/^[+-]?Infinity$/.test(t)) return t.startsWith('-') ? -Infinity : Infinity;
  if (/^[+-]?NaN$/.test(t)) return NaN;
  return null;
}

/** Dart's `int.tryParse`: a whole number, decimal or `0x` hex, signed. */
export function dartIntTryParse(text: string): number | null {
  const t = dartTrim(text);
  if (/^[+-]?\d+$/.test(t)) return parseInt(t, 10);
  if (/^[+-]?0[xX][0-9a-fA-F]+$/.test(t)) return t.startsWith('-') ? -parseInt(t.replace(/^[+-]?0[xX]/, ''), 16) : parseInt(t.replace(/^[+-]?0[xX]/, ''), 16);
  return null;
}

/** A starting value as the field shows it: whole as whole ("10"), else as Dart writes a double ("2.5"). */
export function formatBase(n: number): string {
  return Number.isFinite(n) && n === Math.trunc(n) ? String(Math.trunc(n)) : String(n);
}

/** A blueprint's list (`variables`, `tracks`, `items`…) as stored. */
export const listOf = (s: SystemBlueprint, key: string): JsonMap[] => maps(s.raw[key]);

/** The list with the one of id `id` changed. */
export const patched = (all: readonly JsonMap[], id: string, change: JsonMap): JsonMap[] => all.map((m) => (m['id'] === id ? { ...m, ...change } : m));

/** The list without the one of id `id`. */
export const without = (all: readonly JsonMap[], id: string): JsonMap[] => all.filter((m) => m['id'] !== id);

/** The list with the one of id `id` moved `by` places (unchanged when it would leave the list). */
export function moved(all: readonly JsonMap[], id: string, by: number): JsonMap[] {
  const out = [...all];
  const at = out.findIndex((m) => m['id'] === id);
  const to = at + by;
  if (at < 0 || to < 0 || to >= out.length) return out;
  const [m] = out.splice(at, 1);
  out.splice(to, 0, m);
  return out;
}

/** "Fire, Water, , Earth" as ["Fire", "Water", "Earth"]. */
export const splitList = (text: string): string[] =>
  text
    .split(',')
    .filter((s) => dartTrim(s).length > 0)
    .map(dartTrim);

/** A row's up, down and remove buttons: their tooltips, and whether up and down can be pressed. */
export function rowTools(name: string, first: boolean, last: boolean): { up: string; down: string; remove: string; canUp: boolean; canDown: boolean } {
  return { up: `Move ${name} up`, down: `Move ${name} down`, remove: `Remove ${name}`, canUp: !first, canDown: !last };
}
