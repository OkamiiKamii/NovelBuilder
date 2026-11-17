// Levels of place, maps and pins, journeys and travel methods: every change one transaction, made on the records as
// stored at that moment and refused if they changed elsewhere since; and what the place and travel views read beside
// the shared model. A port of flutter_app/lib/features/places/places_providers.dart's PlacesService and PlaceData.

import { type CharacterStore } from '../characters/characterService';
import { newId as makeId } from '../ids';
import { Journey } from '../records/journey';
import { type NovelSnapshot } from '../snapshot/novelSnapshot';
import { TravelSettings } from '../travel/travel';
import { PlaceChanges, placeCollections } from './placeChanges';
import { MapPin, PlaceSettings, WorldMap } from './places';

class StateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StateError';
  }
}

export class PlacesService {
  private readonly clock: () => number;
  private readonly createId: () => string;

  constructor(
    readonly store: CharacterStore,
    options: { clock?: () => number; createId?: () => string } = {},
  ) {
    this.clock = options.clock ?? Date.now;
    this.createId = options.createId ?? makeId;
  }

  change<T>(projectId: string, apply: (c: PlaceChanges) => T): T {
    const before = this.store.loadPart(projectId, placeCollections);
    if (before === null) throw new StateError('That novel is no longer in the library.');
    const now = this.clock();
    const changes = new PlaceChanges(before, { now, createId: this.createId });
    const result = apply(changes);
    this.store.saveChanges(before, changes.snapshot.copyWith({ project: { ...before.project, updatedAt: now } }));
    return result;
  }
}

/** The autosave key of a typed change to places (`places:<novel>:<key>`). */
export const placesSaveKey = (novelId: string, key: string): string => `places:${novelId}:${key}`;

/** What the place and travel views read from the open novel, beside the shared model. */
export class PlaceData {
  readonly settings: PlaceSettings | null;
  readonly maps: WorldMap[];
  readonly pins: MapPin[];
  readonly travel: TravelSettings | null;
  readonly journeys: Journey[];

  constructor(s: NovelSnapshot) {
    const settings = s.rows('placeSettings')[0];
    this.settings = settings === undefined ? null : new PlaceSettings(settings);
    this.maps = s.rows('worldMaps').map((r) => new WorldMap(r));
    this.pins = s.rows('mapPins').map((r) => new MapPin(r));
    const travel = s.rows('travelSettings')[0];
    this.travel = travel === undefined ? null : new TravelSettings(travel);
    this.journeys = s.rows('journeys').map((r) => new Journey(r));
  }
}
