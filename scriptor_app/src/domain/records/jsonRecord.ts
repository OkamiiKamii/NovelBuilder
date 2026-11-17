// A stored record: the complete JSON it was read from, with typed fields read on top. A port of
// flutter_app/lib/shared/domain/json_record.dart, with the readers of json.dart that ../json.ts does not have
// (intOrNull, boolOf, strings, maps, freezeMap).
//
// PRESERVATION RULE: a record keeps every field it was given, including ones this version of the app does not know
// (written by a newer version, a module that is turned off, or by hand). Changes are made with `merged`, which replaces
// only the named fields, so saving, exporting or migrating a record never drops anything.
//
// Readers never throw: a missing or mistyped field reads as its default.

import { type JsonMap, deepCopy, isMap, jsonEquals, listOf, str } from '../json';

/** A deep, frozen copy of a JSON object: what records hold. A value that is already frozen is shared, not copied
 * (everything this module and NovelSnapshot freeze is frozen all the way down). */
export function freezeMap(map: JsonMap): JsonMap {
  return freeze(map) as JsonMap;
}

function freeze(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) return Object.freeze(value.map(freeze));
  const out: JsonMap = {};
  for (const key of Object.keys(value)) out[key] = freeze((value as JsonMap)[key]);
  return Object.freeze(out);
}

/** Dart's `intOrNull`: an integer, or a finite double with no fraction. JavaScript cannot tell `5` from `5.0`. */
export function intOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

export function boolOf(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** The strings of a list; other values are skipped (and stay in the stored record). */
export function strings(value: unknown): string[] {
  return listOf(value).filter((v): v is string => typeof v === 'string');
}

/** The objects of a list; other values are skipped (and stay in the stored record). */
export function maps(value: unknown): JsonMap[] {
  return listOf(value).filter(isMap);
}

/** The first element, or null (Dart's `firstOrNull`). */
export function firstOrNull<T>(items: Iterable<T>): T | null {
  for (const item of items) return item;
  return null;
}

/** A stored record. Subclasses read their fields from `raw`. */
export abstract class JsonRecord {
  /** Everything the record holds, deeply frozen. */
  readonly raw: JsonMap;

  constructor(raw: JsonMap) {
    this.raw = freezeMap(raw);
  }

  get id(): string {
    return str(this.raw['id']);
  }

  /** The project this record belongs to. */
  get projectId(): string {
    return str(this.raw['projectId']);
  }

  /** The record as JSON, a mutable copy safe to change. */
  toJson(): JsonMap {
    return deepCopy(this.raw);
  }

  /** The stored JSON with `changes` applied: a `null` value stores null (it does not remove the key). */
  merged(changes: JsonMap): JsonMap {
    return { ...this.toJson(), ...deepCopy(changes) };
  }

  /** Dart's `==`: the same kind of record holding the same JSON. */
  equals(other: unknown): boolean {
    return (
      other instanceof JsonRecord && other.constructor === this.constructor && jsonEquals(other.raw, this.raw)
    );
  }

  toString(): string {
    return `${this.constructor.name}(${this.id})`;
  }
}
