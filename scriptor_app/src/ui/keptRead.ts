// A part of a novel read once per version of it (FEATURES.md #11): a hook that shows some of a novel's collections reads
// them again only when one of them (or the novel's own row) was written, by the store's version of them, not on every
// change anywhere (a chapter's text saved as it is typed, a setting, another novel). Every screen that reads the same
// part shares the one read. The read itself is unchanged.

import type { NovelStore } from '../data/novelStore';

const kept = new WeakMap<object, Map<string, { key: string; value: unknown }>>();

/** `read()`'s result for `novelId`'s `collections` (`kind` names the part), read again only when they changed. */
export function keptRead<T>(store: NovelStore, kind: string, novelId: string, collections: Iterable<string>, read: () => T): T {
  const key = `${novelId}\u0000${store.versionOf(novelId, [...collections, 'project'])}`;
  let byKind = kept.get(store);
  if (byKind === undefined) kept.set(store, (byKind = new Map()));
  const was = byKind.get(kind);
  if (was !== undefined && was.key === key) return was.value as T;
  const value = read();
  byKind.set(kind, { key, value });
  return value;
}
