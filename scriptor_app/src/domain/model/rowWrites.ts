// The rows that differ between two versions of a novel, as writes the store applies (not part of the Dart model:
// the Flutter app's store diffs the two snapshots itself in `saveChanges`, as Scriptor's NovelStore.saveChanges does).
// For a caller that wants the writes as data: to show them, to batch them with others in NovelStore.writeRows, or to
// test them.

import { type JsonMap, jsonEquals, str } from '../json';
import type { NovelSnapshot } from '../snapshot/novelSnapshot';

/** One record to write (`value` set) or remove (`value` null), only if it is still as read (`expect`: the row as read,
 * or null for "must not exist"). The same shape as RowWrite in src/data/novelStore.ts. */
export type RowWrite = {
  collection: string;
  id: string;
  value: JsonMap | null;
  expect?: JsonMap | null;
};

/** Every row `after` adds, changes or removes from `before`, each checked against `before`: per collection (in the
 * order the snapshots list them), removals in `before`'s order, then additions and changes in `after`'s. The same
 * writes, checks and order as NovelStore.saveChanges(before, after), which also writes the novel's own row. */
export function rowWritesBetween(before: NovelSnapshot, after: NovelSnapshot): RowWrite[] {
  const writes: RowWrite[] = [];
  const names = new Set([...Object.keys(before.collections), ...Object.keys(after.collections)]);
  for (const name of names) {
    const old = new Map(before.rows(name).map((r) => [str(r['id']), r]));
    const next = new Map(after.rows(name).map((r) => [str(r['id']), r]));
    for (const [id, was] of old) {
      if (!next.has(id)) writes.push({ collection: name, id, value: null, expect: was });
    }
    for (const [id, value] of next) {
      const was = old.get(id);
      if (was !== undefined && jsonEquals(was, value)) continue;
      writes.push({ collection: name, id, value, expect: was ?? null });
    }
  }
  return writes;
}
