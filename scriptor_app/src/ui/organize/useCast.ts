// The open novel's cast, as the character screens read it (a CastData: the records, profiles, links, and where each
// character is named in the text), read again after every change; and the character service that changes it. A port
// of flutter_app/lib/features/characters/characters_providers.dart's cast provider.

import { useCallback, useMemo } from 'react';

import { openNovelSettingKey } from '../../data/settingsStore';
import { CastData } from '../../domain/characters/castData';
import type { CharacterChanges } from '../../domain/characters/characterChanges';
import { CharacterService } from '../../domain/characters/characterService';
import { NamedInReader } from '../../domain/characters/namedIn';
import type { NovelStore } from '../../data/novelStore';
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

/** The cast last read, by the store it was read from: every screen that shows the cast shares it, and it is read again
 * only when what it is made of changed (the novel's records or its text, by the store's version of them), not on
 * every change anywhere (a setting, another novel). Where each is named in the text is read again only for the pages
 * whose text changed (NamedInReader). Whole-book work off the screen's way as far as it goes (FEATURES.md #11). */
const castCache = new WeakMap<object, { key: string; cast: CastData }>();
const namedReaders = new WeakMap<object, NamedInReader>();

function castOf(store: NovelStore, service: CharacterService, novelId: string): CastData | null {
  const key = `${novelId}\u0000${store.versionOf(novelId, CharacterService.castSource)}\u0000${store.versionOf(novelId, ['chapterContents'])}`;
  const kept = castCache.get(store);
  if (kept !== undefined && kept.key === key) return kept.cast;
  const snapshot = service.read(novelId);
  if (!snapshot) return null;
  const plain = new CastData(novelId, snapshot);
  let reader = namedReaders.get(store);
  if (reader === undefined) namedReaders.set(store, (reader = new NamedInReader()));
  // Where each is named in the saved text (a link, a name, an alias, a title).
  const named = reader.read(service.storedChapters(novelId), plain.findNames);
  const cast = new CastData(novelId, snapshot, { named });
  castCache.set(store, { key, cast });
  return cast;
}

export function useCast(): OpenCast | null {
  const lib = useLibrary();
  const revision = useLibraryRevision();
  const toast = useToast();
  const service = useMemo(() => new CharacterService(lib.novels, lib.backups), [lib]);
  const novelId = useMemo(() => {
    const id = lib.settings.read(openNovelSettingKey);
    return typeof id === 'string' && lib.novels.exists(id) ? id : null;
  }, [lib, revision]);
  // `revision`: a change was made; castOf then reads the versions to see whether it was to the cast.
  const cast = useMemo(() => (novelId ? castOf(lib.novels, service, novelId) : null), [lib, service, novelId, revision]); // eslint-disable-line react-hooks/exhaustive-deps

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
