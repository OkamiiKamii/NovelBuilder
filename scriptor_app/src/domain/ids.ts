// STABLE ID RULE (as in the Flutter app, flutter_app/lib/shared/domain/ids.dart): an id is assigned once and never
// changed or reused. Renaming changes a name, reordering an `order`, moving a `parentId`; nothing changes an id.
// Copies give every row a fresh id through one id map, so no two novels ever share one.

let generate: () => string = () => {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  throw new Error('No id generator: call setIdGenerator at startup.');
};

/** Set once at startup (the app uses expo-crypto's UUIDs). */
export function setIdGenerator(next: () => string): void {
  generate = next;
}

/** A new permanent id for a record: a UUID v4. */
export function newId(): string {
  return generate();
}

/** Whether a value can be an id: a non-empty string. Some ids are built from others (`<systemId>/<itemId>`). */
export function isId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
