// A character's progression changes, as the Progression tab makes them: the tracker's (TrackChanges) and the
// snapshots' (SnapshotChanges), each one transaction on the records as stored at that moment, refused (and said) when
// they changed elsewhere since. The progression part of flutter_app/lib/features/progression/progression_providers.dart's
// ProgressionService.

import { useCallback } from 'react';

import { newId } from '../../domain/ids';
import { SnapshotChanges } from '../../domain/progression/snapshots';
import { TrackChanges, trackerCollections } from '../../domain/progression/trackChanges';
import { useLibrary } from '../LibraryContext';
import { useToast } from '../toast';

export type ProgressActions = {
  /** A tracker change made now: a refusal is said and nothing is saved; undefined when refused. */
  track: <T>(make: (x: TrackChanges) => T) => T | undefined;
  /** A snapshot change made now. */
  snapshot: <T>(make: (x: SnapshotChanges) => T) => T | undefined;
  /** A typed snapshot change, saved a moment after typing stops, under `progress:<novel>:<key>`. */
  snapshotLater: (key: string, make: (x: SnapshotChanges) => void) => void;
};

export function useProgress(novelId: string): ProgressActions {
  const lib = useLibrary();
  const toast = useToast();

  const run = useCallback(
    <C, T>(make: (before: Parameters<typeof lib.novels.saveChanges>[0]) => C, apply: (c: C) => T, snapshotOf: (c: C) => Parameters<typeof lib.novels.saveChanges>[1]): T => {
      const before = lib.novels.loadPart(novelId, trackerCollections);
      if (before === null) throw new Error('That novel is no longer in the library.');
      const changes = make(before);
      const result = apply(changes);
      const now = Date.now();
      lib.novels.saveChanges(before, snapshotOf(changes).copyWith({ project: { ...before.project, updatedAt: now } }));
      return result;
    },
    [lib, novelId],
  );

  const track = useCallback(
    <T,>(make: (x: TrackChanges) => T): T | undefined => {
      try {
        return run(
          (before) => new TrackChanges(before, { now: Date.now(), createId: newId }),
          make,
          (c) => c.snapshot,
        );
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), { error: true });
        return undefined;
      }
    },
    [run, toast],
  );

  const snapshot = useCallback(
    <T,>(make: (x: SnapshotChanges) => T): T | undefined => {
      try {
        return run(
          (before) => new SnapshotChanges(before, { now: Date.now(), createId: newId }),
          make,
          (c) => c.snapshot,
        );
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), { error: true });
        return undefined;
      }
    },
    [run, toast],
  );

  const snapshotLater = useCallback(
    (key: string, make: (x: SnapshotChanges) => void) => {
      lib.saves.schedule(`progress:${novelId}:${key}`, () =>
        run(
          (before) => new SnapshotChanges(before, { now: Date.now(), createId: newId }),
          make,
          (c) => c.snapshot,
        ),
      );
    },
    [lib, novelId, run],
  );

  return { track, snapshot, snapshotLater };
}
