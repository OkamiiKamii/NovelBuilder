// Dart's number parsing and rounding as the Dart VM runs them, for the record and timeline ports that use them where
// JavaScript's differ. Pure TypeScript. Checked against Dart 3.10 (Flutter 3.38.9).

import { dartTrim } from '../text/dartString';

const decimalInt = /^[+-]?\d+$/;
const hexInt = /^([+-]?)0[xX]([0-9a-fA-F]+)$/;
const decimalDouble = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
const int64Max = 9223372036854775807n;
const int64Min = -9223372036854775808n;

/** Dart's `int.tryParse(source)` (no radix): white space trimmed, a sign, decimal digits or `0x` and hex digits.
 * Null for a decimal outside 64 bits; a hex literal of up to 16 digits wraps as Dart's does (0xFFFFFFFFFFFFFFFF is
 * -1). The result is a JavaScript number, so integers beyond 2^53 lose precision. */
export function dartIntTryParse(source: string): number | null {
  const text = dartTrim(source);
  if (decimalInt.test(text)) {
    const n = BigInt(text);
    return n > int64Max || n < int64Min ? null : Number(n) + 0;
  }
  const hex = hexInt.exec(text);
  if (hex) {
    const n = BigInt(`0x${hex[2]}`);
    if (n > 0xffffffffffffffffn) return null;
    const wrapped = BigInt.asIntN(64, n);
    return Number(hex[1] === '-' ? -wrapped : wrapped) + 0;
  }
  return null;
}

/** Dart's `double.tryParse(source)`: white space trimmed, a decimal literal, `NaN` or `Infinity` with a sign. */
export function dartDoubleTryParse(source: string): number | null {
  const text = dartTrim(source);
  if (decimalDouble.test(text)) return Number(text);
  switch (text) {
    case 'NaN':
    case '+NaN':
    case '-NaN':
      return NaN;
    case 'Infinity':
    case '+Infinity':
      return Infinity;
    case '-Infinity':
      return -Infinity;
  }
  return null;
}

/** Dart's `num.tryParse`: an int if it reads as one, else a double, else null. */
export function dartNumTryParse(source: string): number | null {
  return dartIntTryParse(source) ?? dartDoubleTryParse(source);
}

/** Dart's `num.round()`: halves away from zero (JavaScript's `Math.round` takes -2.5 to -2). */
export function dartRound(n: number): number {
  const r = Math.round(Math.abs(n));
  return (n < 0 ? -r : r) + 0;
}

/** Dart's `toString()` of a double: as JavaScript prints it, except that a whole number keeps ".0" ("5.0") and
 * negative zero is "-0.0". For a Dart int (any whole number read from JSON) use String(n). */
export function dartDoubleToString(n: number): string {
  if (Object.is(n, -0)) return '-0.0';
  if (Number.isFinite(n) && Number.isInteger(n) && Math.abs(n) < 1e21) return `${n}.0`;
  return String(n);
}
