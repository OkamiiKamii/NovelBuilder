// The open novel as the genre modules read it (a snapshot of the collections modules use), read again after every
// change; the module service that changes it; and the device library of the author's own modules. A port of the
// providers in flutter_app/lib/features/modules/module_service.dart.

import { useCallback, useMemo } from 'react';

import { openNovelSettingKey } from '../../data/settingsStore';
import type { ModuleChanges } from '../../domain/modules/moduleChanges';
import { ModuleLibrary } from '../../domain/modules/moduleLibrary';
import { ModuleService, moduleCollections } from '../../domain/modules/moduleService';
import type { NovelSnapshot } from '../../domain/snapshot/novelSnapshot';
import { useLibrary, useLibraryRevision } from '../LibraryContext';
import { useToast } from '../toast';
import { keptRead } from '../keptRead';

export type OpenModules = {
  novelId: string;
  snapshot: NovelSnapshot;
  service: ModuleService;
  /** The author's own modules, kept on this device (writes go through autosave, then the screens redraw). */
  library: ModuleLibrary;
  /** A change made now: a refusal is said, and nothing is saved. Returns the result, or undefined when refused. */
  now: <T>(make: (m: ModuleChanges) => T) => T | undefined;
  /** Typing: saved a moment after it stops, under `key`; a failure shows on the save pill and is retried. */
  later: (key: string, make: (m: ModuleChanges) => void) => void;
};

export function useModules(): OpenModules | null {
  const lib = useLibrary();
  const revision = useLibraryRevision();
  const toast = useToast();
  const service = useMemo(() => new ModuleService(lib.novels), [lib]);
  const library = useMemo(
    () =>
      new ModuleLibrary({
        read: (key) => lib.settings.read(key),
        write: (key, value) =>
          lib.saves.saveNow(`setting:${key}`, () => {
            lib.settings.write(key, value);
            lib.novels.touchSettings();
          }),
      }),
    [lib],
  );
  const novelId = useMemo(() => {
    const id = lib.settings.read(openNovelSettingKey);
    return typeof id === 'string' && lib.novels.exists(id) ? id : null;
  }, [lib, revision]); // eslint-disable-line react-hooks/exhaustive-deps
  const snapshot = useMemo(() => (novelId ? keptRead(lib.novels, 'modules', novelId, moduleCollections, () => service.read(novelId)) : null), [lib, service, novelId, revision]); // eslint-disable-line react-hooks/exhaustive-deps

  const now = useCallback(
    <T,>(make: (m: ModuleChanges) => T): T | undefined => {
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
    (key: string, make: (m: ModuleChanges) => void) => {
      if (!novelId) return;
      lib.saves.schedule(key, () => service.change(novelId, make));
    },
    [lib, service, novelId],
  );

  if (!novelId || !snapshot) return null;
  return { novelId, snapshot, service, library, now, later };
}
