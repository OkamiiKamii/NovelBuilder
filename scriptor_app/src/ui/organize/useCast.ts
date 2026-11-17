// The open novel's cast, as the character screens read it (a CastData: the records, profiles, links, and where each
// character is named in the text), read again after every change; and the character service that changes it. A port
// of flutter_app/lib/features/characters/characters_providers.dart's cast provider.

import { useCallback, useMemo } from 'react';

import { openNovelSettingKey } from '../../data/settingsStore';
import { CastData } from '../../domain/characters/castData';
import type { CharacterChanges } from '../../domain/characters/characterChanges';
import { CharacterService } from '../../domain/characters/characterService';
import { namedInJob } from '../../domain/characters/namedIn';
import { useLibrary, useLibraryRevision } from '../LibraryContext';
import { useToast } from '../toast';

export type OpenCast = {
  novelId: string;
  cast: CastData;
  service: CharacterService;
  /** A change made now: a refusal is said, and nothing is saved. Returns the result, or undefined when refused. */
  now: <T>(make: (c: CharacterChanges) => T) => T | undefined;
  /** Typing: saved a moment after it stops, under `key`; a failure shows on the save pill and is retried. */
  later: (key: string, make: (c: CharacterChanges) => void) => void;
};

export function useCast(): OpenCast | null {
  const lib = useLibrary();
  const revision = useLibraryRevision();
  const toast = useToast();
  const service = useMemo(() => new CharacterService(lib.novels, lib.backups), [lib]);
  const novelId = useMemo(() => {
    const id = lib.settings.read(openNovelSettingKey);
    return typeof id === 'string' && lib.novels.exists(id) ? id : null;
  }, [lib, revision]);
  const cast = useMemo(() => {
    if (!novelId) return null;
    const snapshot = service.read(novelId);
    if (!snapshot) return null;
    const plain = new CastData(novelId, snapshot);
    // Where each is named in the saved text (a link, a name, an alias, a title): read once per change.
    const named = namedInJob(service.storedChapters(novelId), plain.findNames)();
    return new CastData(novelId, snapshot, { named });
  }, [service, novelId, revision]); // eslint-disable-line react-hooks/exhaustive-deps

  const now = useCallback(
    <T,>(make: (c: CharacterChanges) => T): T | undefined => {
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
    (key: string, make: (c: CharacterChanges) => void) => {
      if (!novelId) return;
      lib.saves.schedule(key, () => service.change(novelId, make));
    },
    [lib, service, novelId],
  );

  if (!novelId || !cast) return null;
  return { novelId, cast, service, now, later };
}
