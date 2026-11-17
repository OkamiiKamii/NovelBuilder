// The open novel as the timeline reads it (TimelineData over the cast's records: events, histories, the calendar),
// read again after every change; and the timeline service that changes it. A port of
// flutter_app/lib/features/timeline/timeline_providers.dart.

import { useCallback, useMemo } from 'react';

import type { EventChanges } from '../../domain/timeline/eventChanges';
import { TimelineData } from '../../domain/timeline/screens/timelineData';
import { TimelineService, timelineSaveKey } from '../../domain/timeline/timelineService';
import { useLibrary } from '../LibraryContext';
import { useToast } from '../toast';
import { type OpenCast, useCast } from '../organize/useCast';

export type OpenTimeline = {
  novelId: string;
  open: OpenCast;
  data: TimelineData;
  service: TimelineService;
  /** A change made now: a refusal is said, and nothing is saved. Returns the result, or undefined when refused. */
  now: <T>(make: (c: EventChanges) => T) => T | undefined;
  /** Typing: saved a moment after it stops, under the timeline's save key; a failure shows on the save pill. */
  later: (key: string, make: (c: EventChanges) => void) => void;
};

export function useTimeline(): OpenTimeline | null {
  const lib = useLibrary();
  const toast = useToast();
  const open = useCast();
  const service = useMemo(() => new TimelineService(lib.novels, lib.backups), [lib]);
  const data = useMemo(() => (open ? new TimelineData(open.cast) : null), [open?.cast]); // eslint-disable-line react-hooks/exhaustive-deps
  const novelId = open?.novelId ?? null;

  const now = useCallback(
    <T,>(make: (c: EventChanges) => T): T | undefined => {
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
    (key: string, make: (c: EventChanges) => void) => {
      if (!novelId) return;
      lib.saves.schedule(timelineSaveKey(novelId, key), () => service.change(novelId, make));
    },
    [lib, service, novelId],
  );

  if (!open || !data || !novelId) return null;
  return { novelId, open, data, service, now, later };
}
