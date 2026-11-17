// The world views' reach into the open novel: the cast (the shared model and every record), what the place and
// travel views read beside it (levels, maps, pins, travel methods, journeys), and the place service that changes them
// in one transaction. A port of flutter_app/lib/features/places/places_providers.dart's PlaceActions.

import { useCallback, useMemo } from 'react';

import type { PlaceChanges } from '../../domain/places/placeChanges';
import { PlaceData, PlacesService, placesSaveKey } from '../../domain/places/placesService';
import { useLibrary } from '../LibraryContext';
import { useToast } from '../toast';
import { type OpenCast, useCast } from '../organize/useCast';

export type OpenPlaces = {
  open: OpenCast;
  data: PlaceData;
  /** A change to places or journeys now: a refusal is said, and nothing is saved. Undefined when refused. */
  places: <T>(make: (c: PlaceChanges) => T) => T | undefined;
  /** Typing: saved a moment after it stops, under `places:<novel>:<key>`; a refusal is said. */
  placesLater: (key: string, make: (c: PlaceChanges) => void) => void;
};

export function usePlaces(): OpenPlaces | null {
  const lib = useLibrary();
  const toast = useToast();
  const open = useCast();
  const service = useMemo(() => new PlacesService(lib.novels), [lib]);
  const data = useMemo(() => (open ? new PlaceData(open.cast.snapshot) : null), [open?.cast]); // eslint-disable-line react-hooks/exhaustive-deps
  const novelId = open?.novelId ?? null;
  const places = useCallback(
    <T,>(make: (c: PlaceChanges) => T): T | undefined => {
      if (novelId === null) return undefined;
      try {
        return service.change(novelId, make);
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), { error: true });
        return undefined;
      }
    },
    [service, novelId, toast],
  );
  const placesLater = useCallback(
    (key: string, make: (c: PlaceChanges) => void) => {
      if (novelId === null) return;
      lib.saves.schedule(placesSaveKey(novelId, key), () => {
        try {
          service.change(novelId, make);
        } catch (e) {
          toast(`Not saved: ${e instanceof Error ? e.message : String(e)}`, { error: true });
        }
      });
    },
    [lib, service, novelId, toast],
  );
  if (!open || !data) return null;
  return { open, data, places, placesLater };
}
