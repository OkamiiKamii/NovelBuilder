// JSON values as records hold them, and readers that never throw. A port of flutter_app/lib/shared/domain/json.dart.

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonMap = { [key: string]: unknown };

export function isMap(value: unknown): value is JsonMap {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A deep copy of a JSON value: objects and arrays are copied, everything else is shared (it is immutable). */
export function deepCopy<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => deepCopy(v)) as T;
  if (isMap(value)) {
    const out: JsonMap = {};
    for (const key of Object.keys(value)) out[key] = deepCopy(value[key]);
    return out as T;
  }
  return value;
}

/** A deep, frozen copy: what records hold, so nothing can change a record behind its back. */
export function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map((v) => deepFreeze(v))) as T;
  if (isMap(value)) {
    const out: JsonMap = {};
    for (const key of Object.keys(value)) out[key] = deepFreeze(value[key]);
    return Object.freeze(out) as T;
  }
  return value;
}

/** Structural equality of two JSON values. Key order does not matter. */
export function jsonEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!jsonEquals(a[i], b[i])) return false;
    return true;
  }
  if (isMap(a) && isMap(b)) {
    const ka = Object.keys(a);
    if (ka.length !== Object.keys(b).length) return false;
    for (const key of ka) {
      if (!Object.prototype.hasOwnProperty.call(b, key) || !jsonEquals(a[key], b[key])) return false;
    }
    return true;
  }
  return false;
}

// Readers that never throw. A value of the wrong type reads as absent; the record keeps it unchanged.

export function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export function strOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** A non-empty string, as an id must be. */
export function idOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export function numOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function mapOrNull(value: unknown): JsonMap | null {
  return isMap(value) ? value : null;
}

/** A list read leniently: anything that is not a list is empty. */
export function listOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
