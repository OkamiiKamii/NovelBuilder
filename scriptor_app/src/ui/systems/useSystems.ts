// The open novel as Systems reads it (its systems, sheets and progress snapshots, with the records they draw on), read
// again after every change; and the service that changes it. A port of the systems part of
// flutter_app/lib/features/progression/progression_providers.dart.

import { useCallback, useMemo } from 'react';

import { openNovelSettingKey } from '../../data/settingsStore';
import { type SystemChanges, systemCollections } from '../../domain/systems/systemChanges';
import { SystemsService, systemsSaveKey } from '../../domain/systems/systemsService';
import type { NovelSnapshot } from '../../domain/snapshot/novelSnapshot';
import { useLibrary, useLibraryRevision } from '../LibraryContext';
import { useToast } from '../toast';
import { keptRead } from '../keptRead';

export type OpenSystems = {
  novelId: string;
  snapshot: NovelSnapshot;
  service: SystemsService;
  /** A change made now: a refusal is said, and nothing is saved. Returns the result, or undefined when refused. */
  now: <T>(make: (c: SystemChanges) => T) => T | undefined;
  /** Typing: saved a moment after it stops, under `systems:<novel>:<key>`; a failure shows on the save pill. */
  later: (key: string, make: (c: SystemChanges) => void) => void;
};

export function useSystems(): OpenSystems | null {
  const lib = useLibrary();
  const revision = useLibraryRevision();
  const toast = useToast();
  const service = useMemo(() => new SystemsService(lib.novels), [lib]);
  const novelId = useMemo(() => {
    const id = lib.settings.read(openNovelSettingKey);
    return typeof id === 'string' && lib.novels.exists(id) ? id : null;
  }, [lib, revision]); // eslint-disable-line react-hooks/exhaustive-deps
  const snapshot = useMemo(() => (novelId ? keptRead(lib.novels, 'systems', novelId, systemCollections, () => service.read(novelId)) : null), [lib, service, novelId, revision]); // eslint-disable-line react-hooks/exhaustive-deps

  const now = useCallback(
    <T,>(make: (c: SystemChanges) => T): T | undefined => {
      if (!novelId) return undefined;
      try {
        return service.change(novelId, make);
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), { error: true });
        return undefined;
      }
    },
    [service, novelId, toast],
  );
  const later = useCallback(
    (key: string, make: (c: SystemChanges) => void) => {
      if (!novelId) return;
      lib.saves.schedule(systemsSaveKey(novelId, key), () => service.change(novelId, make));
    },
    [lib, service, novelId],
  );

  if (!novelId || !snapshot) return null;
  return { novelId, snapshot, service, now, later };
}
