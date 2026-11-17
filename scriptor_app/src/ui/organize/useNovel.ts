// What Organize reads and how it writes: the open novel as stored (a snapshot, and the story model made from it), read
// again after every change; and `change`, which applies a change made on a copy of the snapshot and stores the
// difference in one transaction (NovelStore.saveChanges, as the Flutter app's `saveChanges`), refusing to overwrite
// what was saved meanwhile. Nothing is written until the whole change is ready.

import { useCallback, useMemo } from 'react';

import type { Library } from '../../data/library';
import { openNovelSettingKey } from '../../data/settingsStore';
import { StoryModel } from '../../domain/model/storyModel';
import type { NovelSnapshot } from '../../domain/snapshot/novelSnapshot';
import { useLibrary, useLibraryRevision } from '../LibraryContext';

export type OpenNovel = {
  lib: Library;
  novelId: string;
  snapshot: NovelSnapshot;
  model: StoryModel;
  /** Applies `make` to the snapshot as stored now and saves the result. Returns what `make` returned. A refused
   * change (`ChangeRefused`) or a stale write throws, and nothing is saved. */
  change: <T>(make: (before: NovelSnapshot) => { after: NovelSnapshot; result: T }) => T;
  /** Keeps a restore point first (deleting), returning its id. */
  keepRestorePoint: (reason: string) => string | null;
};

/** The open novel for Organize, or null when none is open. */
export function useOpenNovel(): OpenNovel | null {
  const lib = useLibrary();
  const revision = useLibraryRevision();
  const novelId = useMemo(() => {
    const id = lib.settings.read(openNovelSettingKey);
    return typeof id === 'string' && lib.novels.exists(id) ? id : null;
  }, [lib, revision]);
  const snapshot = useMemo(() => (novelId ? lib.novels.load(novelId) : null), [lib, novelId, revision]); // eslint-disable-line react-hooks/exhaustive-deps
  const model = useMemo(() => (snapshot ? StoryModel.fromSnapshot(snapshot) : null), [snapshot]);

  const change = useCallback(
    <T,>(make: (before: NovelSnapshot) => { after: NovelSnapshot; result: T }): T => {
      if (!novelId) throw new Error('No novel is open.');
      const before = lib.novels.load(novelId);
      if (!before) throw new Error('The novel is no longer in the library.');
      const { after, result } = make(before);
      lib.novels.saveChanges(before, after);
      return result;
    },
    [lib, novelId],
  );
  const keepRestorePoint = useCallback(
    (reason: string) => (novelId ? lib.backups.keepRestorePoint(novelId, reason) : null),
    [lib, novelId],
  );

  if (!novelId || !snapshot || !model) return null;
  return { lib, novelId, snapshot, model, change, keepRestorePoint };
}
