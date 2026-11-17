// The open novel as Plan's plot screens read it (threads, chapters and scenes, their plans), read again after every
// change; and the plot service that changes it. A port of flutter_app/lib/features/plot/plot_providers.dart.

import { useCallback, useMemo } from 'react';

import { openNovelSettingKey } from '../../data/settingsStore';
import type { PlotChanges } from '../../domain/plot/plotChanges';
import { PlotService, plotSaveKey } from '../../domain/plot/plotService';
import type { NovelSnapshot } from '../../domain/snapshot/novelSnapshot';
import { useLibrary, useLibraryRevision } from '../LibraryContext';
import { useToast } from '../toast';

export type OpenPlot = {
  novelId: string;
  snapshot: NovelSnapshot;
  service: PlotService;
  /** A change made now: a refusal is said, and nothing is saved. Returns the result, or undefined when refused. */
  now: <T>(make: (c: PlotChanges) => T) => T | undefined;
  /** Typing: saved a moment after it stops, under the plot's save key; a failure shows on the save pill. */
  later: (key: string, make: (c: PlotChanges) => void) => void;
};

export function usePlot(): OpenPlot | null {
  const lib = useLibrary();
  const revision = useLibraryRevision();
  const toast = useToast();
  const service = useMemo(() => new PlotService(lib.novels, lib.backups), [lib]);
  const novelId = useMemo(() => {
    const id = lib.settings.read(openNovelSettingKey);
    return typeof id === 'string' && lib.novels.exists(id) ? id : null;
  }, [lib, revision]); // eslint-disable-line react-hooks/exhaustive-deps
  const snapshot = useMemo(() => (novelId ? service.read(novelId) : null), [service, novelId, revision]); // eslint-disable-line react-hooks/exhaustive-deps

  const now = useCallback(
    <T,>(make: (c: PlotChanges) => T): T | undefined => {
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
    (key: string, make: (c: PlotChanges) => void) => {
      if (!novelId) return;
      lib.saves.schedule(plotSaveKey(novelId, key), () => service.change(novelId, make));
    },
    [lib, service, novelId],
  );

  if (!novelId || !snapshot) return null;
  return { novelId, snapshot, service, now, later };
}
