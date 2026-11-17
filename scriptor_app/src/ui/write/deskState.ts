// What the writing desk is doing right now, shared with the app frame: focus mode hides the bottom bar too. Not kept:
// focus mode ends when the app closes, as in the Flutter app.

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useWindowDimensions } from 'react-native';

import {
  type DeviceForm,
  readWritingPrefs,
  type WritingPrefs,
  writingPrefsKey,
  writingPrefsToJson,
} from '../../domain/writingPrefs';
import { useLibrary, useLibraryRevision } from '../LibraryContext';
import { sizeClassOf } from '../theme';

let focus = false;
const listeners = new Set<() => void>();

export function setFocusMode(on: boolean): void {
  if (focus === on) return;
  focus = on;
  for (const l of [...listeners]) l();
}

export function useFocusMode(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => focus,
  );
}

/** The writing preferences of this kind of device, and a way to change them (saved through autosave). */
export function useWritingPrefs(): [WritingPrefs, (change: Partial<WritingPrefs> | null) => void, DeviceForm] {
  const lib = useLibrary();
  const revision = useLibraryRevision();
  const form: DeviceForm = sizeClassOf(useWindowDimensions().width) === 'compact' ? 'phone' : 'tablet';
  const prefs = useMemo(() => readWritingPrefs(lib.settings.read(writingPrefsKey(form)), form), [lib, form, revision]); // eslint-disable-line react-hooks/exhaustive-deps
  const change = useCallback(
    (next: Partial<WritingPrefs> | null) => {
      const value = next === null ? null : writingPrefsToJson({ ...prefs, ...next });
      // A settings write does not touch any novel, so the screens are told by a no-op revision bump of the store.
      lib.saves.saveNow(`setting:${writingPrefsKey(form)}`, () => {
        lib.settings.write(writingPrefsKey(form), value);
        lib.novels.touchSettings();
      });
    },
    [lib, form, prefs],
  );
  return [prefs, change, form];
}

/** A setting of the desk kept on this device (typewriter on or off…). */
export function useDeskSetting(key: string, fallback: boolean): [boolean, (on: boolean) => void] {
  const lib = useLibrary();
  const revision = useLibraryRevision();
  const value = useMemo(() => {
    const v = lib.settings.read(key);
    return typeof v === 'boolean' ? v : fallback;
  }, [lib, key, fallback, revision]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = useCallback(
    (on: boolean) =>
      lib.saves.saveNow(`setting:${key}`, () => {
        lib.settings.write(key, on);
        lib.novels.touchSettings();
      }),
    [lib, key],
  );
  return [value, set];
}

/** A choice of the desk kept on this device, one of `allowed` (the atmosphere…). */
export function useDeskChoice<T extends string>(key: string, allowed: readonly T[], fallback: T): [T, (value: T) => void] {
  const lib = useLibrary();
  const revision = useLibraryRevision();
  const value = useMemo(() => {
    const v = lib.settings.read(key);
    return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
  }, [lib, key, fallback, revision]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = useCallback(
    (next: T) =>
      lib.saves.saveNow(`setting:${key}`, () => {
        lib.settings.write(key, next);
        lib.novels.touchSettings();
      }),
    [lib, key],
  );
  return [value, set];
}
