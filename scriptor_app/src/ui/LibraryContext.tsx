import { createContext, useContext, useSyncExternalStore } from 'react';

import type { SaveStatus } from '../data/autosave';
import type { Library } from '../data/library';

const LibraryContext = createContext<Library | null>(null);

export const LibraryProvider = LibraryContext.Provider;

export function useLibrary(): Library {
  const library = useContext(LibraryContext);
  if (!library) throw new Error('useLibrary is used outside the opened library.');
  return library;
}

/** Re-renders whenever the library is written to, and returns its revision. */
export function useLibraryRevision(): number {
  const { novels } = useLibrary();
  return useSyncExternalStore(
    (listener) => novels.subscribe(listener),
    () => novels.revision,
  );
}

export function useSaveStatus(): SaveStatus {
  const { saves } = useLibrary();
  return useSyncExternalStore(saves.subscribe, () => saves.status);
}
