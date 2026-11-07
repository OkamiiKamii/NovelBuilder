/**
 * WHAT THIS BROWSER KEEPS FOR ONE NOVEL
 * Beside its records, a novel leaves settings in the browser: its workspace
 * layouts, its notes, its dashboard, which parts of the manuscript tree are
 * folded, the last chapter and the reading position, and for each chapter or
 * scene its scroll position and any crash copy. Each key ends in the novel's
 * id or in one of its chapters' or scenes' ids, so a novel deleted from this
 * device can take them with it.
 */
type Keys = Pick<Storage, 'length' | 'key' | 'removeItem'>;

const browserStorage = (): Keys | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

/** The app's keys that end in one of these ids. */
export function keysFor(storage: Keys, ids: Iterable<string>): string[] {
  const wanted = new Set(ids);
  const out: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith('novel-builder:') && wanted.has(key.slice(key.lastIndexOf(':') + 1))) out.push(key);
  }
  return out;
}

/** Forgets what this browser keeps for a novel and its chapters and scenes. Returns the keys removed; storage that cannot be reached is left as it is. */
export function forgetBrowserData(projectId: string, nodeIds: string[], storage: Keys | null = browserStorage()): string[] {
  if (!storage) return [];
  try {
    const keys = keysFor(storage, [projectId, ...nodeIds]);
    for (const key of keys) storage.removeItem(key);
    return keys;
  } catch {
    return [];
  }
}
