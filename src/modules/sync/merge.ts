import { IGNORED, TALLIES, type FieldConflict, type Row } from './types';

/** JSON with keys in a fixed order, so the same data always reads the same. */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).filter((key) => object[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`;
}

const ignored = (table: string): string[] => [...IGNORED['*'], ...(IGNORED[table] ?? [])];

/** A row without the fields that are a device's own business. */
export function comparable(table: string, row: Row): Row {
  const skip = ignored(table);
  return Object.fromEntries(Object.entries(row).filter(([key]) => !skip.includes(key)));
}

/** A short fingerprint of a row as far as sync is concerned. Null for "no such row". */
export function fingerprint(table: string, row: Row | null | undefined): string | null {
  if (!row) return null;
  const text = canonical(comparable(table, row));
  // Two independent 32-bit hashes, so an accidental match is not a practical concern.
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    a = Math.imul(a ^ code, 0x01000193);
    b = Math.imul(b + code, 0x85ebca6b) ^ (b >>> 13);
  }
  return `${(a >>> 0).toString(36)}${(b >>> 0).toString(36)}${text.length.toString(36)}`;
}

const equal = (a: unknown, b: unknown): boolean => canonical(a) === canonical(b);

/**
 * Combines two versions of a row that both started from `base`. A field
 * changed on one side only takes that side's value; a field changed the same
 * way on both is fine. A field changed differently on both is a conflict,
 * and is left at this device's value in `merged` until the author decides.
 */
export function mergeRows(table: string, base: Row, local: Row, remote: Row): { merged: Row; conflicts: FieldConflict[] } {
  const skip = ignored(table);
  const merged: Row = { ...local };
  const conflicts: FieldConflict[] = [];
  for (const field of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])) {
    if (skip.includes(field)) continue;
    const [b, l, r] = [base[field], local[field], remote[field]];
    if (equal(l, r)) continue;
    if (equal(l, b)) {
      if (r === undefined) delete merged[field];
      else merged[field] = r;
    } else if (!equal(r, b)) {
      const tally = TALLIES[table]?.[field];
      if (tally && typeof l === 'number' && typeof r === 'number') merged[field] = tally === 'sum' ? l + r - (typeof b === 'number' ? b : 0) : tally === 'min' ? Math.min(l, r) : Math.max(l, r);
      else conflicts.push({ field, base: b, local: l, remote: r });
    }
  }
  return { merged, conflicts };
}

/** The fields that differ between two versions when there is nothing to tell who changed what. */
export function differingFields(table: string, local: Row, remote: Row): FieldConflict[] {
  const skip = ignored(table);
  return [...new Set([...Object.keys(local), ...Object.keys(remote)])].filter((field) => !skip.includes(field) && !equal(local[field], remote[field])).map((field) => ({ field, base: undefined, local: local[field], remote: remote[field] }));
}
