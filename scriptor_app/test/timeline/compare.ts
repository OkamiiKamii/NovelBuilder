// Comparing outputs with a golden, as flutter_app/test/shared/domain/golden.dart's expectJson does: the first
// difference is said with its path, and a fraction may differ from the golden in its last digits (to a part in a
// trillion), as pow() and the like do between processors. Whole numbers, text and shapes stay exact.

import { type JsonMap, isMap } from '../../src/domain/json';

/** Values as JSON holds them: NaN and the infinities as words, Maps as objects, Sets as lists. */
export function plain(v: unknown): unknown {
  if (typeof v === 'number') {
    if (Number.isNaN(v)) return 'NaN';
    if (!Number.isFinite(v)) return v > 0 ? 'Infinity' : '-Infinity';
    return v + 0;
  }
  if (v === undefined) return null;
  if (v instanceof Map) {
    const out: JsonMap = {};
    for (const [k, x] of v) out[String(k)] = plain(x);
    return out;
  }
  if (Array.isArray(v) || v instanceof Set) return [...v].map(plain);
  if (isMap(v)) {
    const out: JsonMap = {};
    for (const [k, x] of Object.entries(v)) out[k] = plain(x);
    return out;
  }
  return v;
}

function diff(a: unknown, e: unknown, path: string): string | null {
  if (isMap(a) && isMap(e)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(e)])) {
      if (!(k in a)) return `${path}.${k} missing (expected ${JSON.stringify(e[k])})`;
      if (!(k in e)) return `${path}.${k} unexpected (${JSON.stringify(a[k])})`;
      const d = diff(a[k], e[k], `${path}.${k}`);
      if (d !== null) return d;
    }
    return null;
  }
  if (Array.isArray(a) && Array.isArray(e)) {
    for (let i = 0; i < a.length && i < e.length; i++) {
      const d = diff(a[i], e[i], `${path}[${i}]`);
      if (d !== null) return d;
    }
    return a.length === e.length ? null : `${path} has ${a.length} items, expected ${e.length}`;
  }
  if (typeof a === 'number' && typeof e === 'number') {
    if (a === e || Math.abs(a - e) <= 1e-12 * (Math.abs(e) > 1 ? Math.abs(e) : 1)) return null;
  }
  return JSON.stringify(a) === JSON.stringify(e) ? null : `${path} is ${JSON.stringify(a)}, expected ${JSON.stringify(e)}`;
}

/** Fails with the first difference, so a mismatch says where it is. */
export function expectJson(actual: unknown, expected: unknown, what: string): void {
  const d = diff(plain(actual), expected, what);
  if (d !== null) throw new Error(d);
}
