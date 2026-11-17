// What the ways to see the cast share: the ink that reads on a character's colour (Flutter's
// `ThemeData.estimateBrightnessForColor`, as the cast's monograms choose it), a colour's luminance and a mix of two
// (Flutter's `Color.computeLuminance` and `Color.lerp`), names said as a list, Flutter's easing curves and Dart's seeded
// random numbers (for what the orbit draws), and recording a relationship inside a character change (Dart's `relate`,
// flutter_app/lib/features/relationships/relationship_page.dart). Pure TypeScript.

import { RelationChanges } from '../../relationships/relationChanges';
import { dartTrim } from '../../text/dartString';
import { type CharacterChanges } from '../characterChanges';

// ---------------------------------------------------------------------------------------------------------- colour

/** A colour's channels from `#rrggbb` (or `#aarrggbb`), each 0 to 1. */
export function channels(hex: string): { r: number; g: number; b: number; a: number } {
  const h = hex.replace('#', '');
  const argb = h.length === 8 ? h : `ff${h}`;
  const at = (i: number) => parseInt(argb.substring(i, i + 2), 16) / 255;
  return { a: at(0), r: at(2), g: at(4), b: at(6) };
}

/** Flutter's `Color.computeLuminance`: the relative luminance, 0 for black and 1 for white (alpha left out). */
export function luminance(hex: string): number {
  const { r, g, b } = channels(hex);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Whether a colour is dark, as Flutter's `ThemeData.estimateBrightnessForColor` judges it. */
export function isDark(hex: string): boolean {
  const l = luminance(hex);
  return (l + 0.05) * (l + 0.05) <= 0.15;
}

/** The ink a monogram is written in on a character's colour: cream on a dark colour, near black on a light one. */
export function inkOn(hex: string): string {
  return isDark(hex) ? '#FFF8EC' : '#1B140E';
}

/** `#rrggbb` as `rgba(…)` at `alpha` (Flutter's `withValues(alpha:)`). */
export function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = channels(hex);
  const byte = (c: number) => Math.round(c * 255);
  return `rgba(${byte(r)}, ${byte(g)}, ${byte(b)}, ${alpha})`;
}

/** Flutter's `Color.lerp(a, b, t)` (each channel, clamped), at `alpha`: as `rgba(…)`. */
export function mix(a: string, b: string, t: number, alpha: number): string {
  const x = channels(a);
  const y = channels(b);
  const lerp = (p: number, q: number) => Math.min(1, Math.max(0, p + (q - p) * t));
  const byte = (c: number) => Math.round(c * 255);
  return `rgba(${byte(lerp(x.r, y.r))}, ${byte(lerp(x.g, y.g))}, ${byte(lerp(x.b, y.b))}, ${alpha})`;
}

// ---------------------------------------------------------------------------------------------------------- words

/** "Ilse", "Ilse and Wren", "Ilse, Wren and Kade". */
export function andList(names: Iterable<string>): string {
  const all = [...names];
  if (all.length <= 1) return all.join('');
  return `${all.slice(0, all.length - 1).join(', ')} and ${all[all.length - 1]}`;
}

/** The first word of a name, as the orbit and the compass write one where there is little room. */
export function firstName(name: string): string {
  return dartTrim(name).split(/\s+/)[0];
}

/** Dart's `String.compareTo`: by UTF-16 code units. */
export function byCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** What a setting stored as a list holds, each as text (Dart's `'$s'` of each; anything else is empty). */
export function storedList(stored: unknown): string[] {
  return Array.isArray(stored) ? stored.map((s) => (typeof s === 'string' ? s : dartText(s))) : [];
}

/** What a setting stored as a list holds that is text (Dart's `whereType<String>()`). */
export function storedStrings(stored: unknown): string[] {
  return Array.isArray(stored) ? stored.filter((s): s is string => typeof s === 'string') : [];
}

/** A value as Dart's string interpolation writes it, as far as a stored setting can hold one. */
function dartText(v: unknown): string {
  return v === null || v === undefined ? 'null' : String(v);
}

// ---------------------------------------------------------------------------------------------------------- motion

/** Flutter's `Cubic` curve: a cubic Bézier from (0, 0) to (1, 1), found to within 0.001 as Flutter finds it. */
export function cubic(a: number, b: number, c: number, d: number): (t: number) => number {
  const evaluate = (p: number, q: number, m: number) => 3 * p * (1 - m) * (1 - m) * m + 3 * q * (1 - m) * m * m + m * m * m;
  return (t) => {
    if (t === 0 || t === 1) return t;
    let start = 0.0;
    let end = 1.0;
    // Halving a double settles in well under 64 steps; the bound only keeps a pathological input from hanging.
    for (let step = 0; ; step++) {
      const midpoint = (start + end) / 2;
      if (step >= 64) return evaluate(b, d, midpoint);
      const estimate = evaluate(a, c, midpoint);
      if (Math.abs(t - estimate) < 0.001) return evaluate(b, d, midpoint);
      if (estimate < t) {
        start = midpoint;
      } else {
        end = midpoint;
      }
    }
  };
}

/** Flutter's `Curves.easeOutCubic` and `Curves.easeOutBack`. */
export const easeOutCubic = cubic(0.215, 0.61, 0.355, 1.0);
export const easeOutBack = cubic(0.175, 0.885, 0.32, 1.275);

/** Dart's `Random(seed)` as the Dart VM makes it (a multiply-with-carry generator, its seed mixed and cranked four
 * times), so what is scattered with a fixed seed lands where it does in the Flutter app. */
export class DartRandom {
  private lo: bigint;
  private hi: bigint;

  constructor(seed: number) {
    const mask = (1n << 64n) - 1n;
    let n = BigInt.asUintN(64, BigInt(seed));
    n = (~n & mask) + ((n << 21n) & mask);
    n &= mask;
    n ^= n >> 24n;
    n = (n * 265n) & mask;
    n ^= n >> 14n;
    n = (n * 21n) & mask;
    n ^= n >> 28n;
    n = (n + ((n << 31n) & mask)) & mask;
    if (n === 0n) n = 0x5a17n;
    this.lo = n & 0xffffffffn;
    this.hi = n >> 32n;
    for (let i = 0; i < 4; i++) this.next();
  }

  private next(): void {
    const state = (0xffffda61n * this.lo + this.hi) & ((1n << 64n) - 1n);
    this.lo = state & 0xffffffffn;
    this.hi = state >> 32n;
  }

  /** A whole number from 0 (included) to `max` (not), `max` from 1 to 2^32, as Dart's `nextInt` draws it. */
  nextInt(max: number): number {
    if (max <= 0 || max > 4294967296) throw new RangeError(`max must be positive and <= 2^32: ${max}`);
    if ((max & -max) === max && max <= 0x40000000) {
      // Fast case for powers of two.
      this.next();
      return Number(this.lo & BigInt(max - 1));
    }
    for (;;) {
      this.next();
      const rnd32 = Number(this.lo);
      const result = rnd32 % max;
      if (rnd32 - result + max <= 4294967296) return result;
    }
  }

  /** A number from 0 (included) to 1 (not). */
  nextDouble(): number {
    this.next();
    const a = Number(this.lo & ((1n << 26n) - 1n));
    this.next();
    const b = Number(this.lo & ((1n << 27n) - 1n));
    return (a * 134217728 + b) / 9007199254740992;
  }
}

// ---------------------------------------------------------------------------------------------------------- changes

/** Changes the relationships inside a character change (CharacterService.change), as Dart's `relate` does: `apply` is
 * given RelationChanges over the same records, and what it changes is kept. */
export function relateIn<T>(c: CharacterChanges, apply: (r: RelationChanges) => T): T {
  const r = new RelationChanges(c.snapshot, { now: c.now, createId: () => c.newId() });
  const result = apply(r);
  c.snapshot = r.snapshot;
  return result;
}
