// Text ordering that matches the original app's `localeCompare` (ICU root collation) for the text novels hold. Pure
// TypeScript. A port of flutter_app/lib/shared/domain/collation.dart, kept here because the export needs it to order
// siblings exactly as the Flutter app does.

import { dartToLowerCase } from '../text/dartString';
import { dartToUpperCase } from './dartUpperCase';

const accented: Record<string, string> = {
  àáâãäåāăą: 'a',
  çćĉċč: 'c',
  ďđ: 'd',
  èéêëēĕėęě: 'e',
  ĝğġģ: 'g',
  ĥħ: 'h',
  ìíîïĩīĭįı: 'i',
  ĵ: 'j',
  ķ: 'k',
  ĺļľŀł: 'l',
  ñńņňŉ: 'n',
  òóôõöøōŏő: 'o',
  ŕŗř: 'r',
  śŝşšß: 's',
  ţťŧ: 't',
  ùúûüũūŭůűų: 'u',
  ŵ: 'w',
  ýÿŷ: 'y',
  źżž: 'z',
};

const base = new Map<number, number>();
for (const [letters, to] of Object.entries(accented)) {
  for (const ch of letters) base.set(ch.codePointAt(0)!, to.charCodeAt(0));
}

function runes(s: string): number[] {
  return Array.from(s, (ch) => ch.codePointAt(0)!);
}

function fold(rune: number): number {
  const r = dartToLowerCase(String.fromCodePoint(rune)).codePointAt(0)!;
  return base.get(r) ?? r;
}

const isDigit = (r: number) => r >= 0x30 && r <= 0x39;

function isLetter(r: number): boolean {
  const s = String.fromCodePoint(r);
  return dartToLowerCase(s) !== dartToUpperCase(s) || base.has(fold(r));
}

/** Groups: 0 spaces and punctuation, 1 digits, 2 letters (folded), 3 anything else. */
function primary(rune: number): number {
  if (isDigit(rune)) return 0x100000 + rune;
  if (isLetter(rune)) return 0x200000 + fold(rune);
  if (rune < 0x80) return rune;
  return 0x300000 + rune;
}

function secondary(rune: number): number {
  const lower = dartToLowerCase(String.fromCodePoint(rune)).codePointAt(0)!;
  return base.has(lower) ? 1 : 0;
}

function tertiary(rune: number): number {
  const s = String.fromCodePoint(rune);
  return s !== dartToLowerCase(s) ? 1 : 0;
}

function compareKeys(a: string, b: string, key: (rune: number) => number): number {
  const ra = runes(a);
  const rb = runes(b);
  const n = Math.min(ra.length, rb.length);
  for (let i = 0; i < n; i++) {
    const d = key(ra[i]) - key(rb[i]);
    if (d !== 0) return d;
  }
  return ra.length - rb.length;
}

/** Case and accents are ignored first (so "émile" sorts with "emile" and "Bran" with "bran"), punctuation and spaces
 * come before digits, digits before letters; ties are then broken by accents, then lowercase before uppercase, then
 * code units, so the order is total and deterministic. */
export function localeCompare(a: string, b: string): number {
  const p = compareKeys(a, b, primary);
  if (p !== 0) return p;
  const s = compareKeys(a, b, secondary);
  if (s !== 0) return s;
  const t = compareKeys(a, b, tertiary);
  if (t !== 0) return t;
  return a < b ? -1 : a > b ? 1 : 0;
}
