// PLACES (as in the original app): where the story happens, as the author arranges it. A place is a codex entry of the
// Location category; what lies inside what is a "Located in" connection; how large a place is (a planet, a city, a
// room) is one of the novel's own levels, which the author names and orders. A map is optional: drawn over a grid or
// over an image the author chooses from their own device, kept in this novel only, with each place pinned at
// coordinates the author gives. A place with no coordinates is as usable as one with them: the tree never needs a map.
// A port of flutter_app/lib/shared/domain/places/places.dart.

import { idOrNull, numOrNull, str, strOrNull } from '../json';
import { JsonRecord, maps } from '../records/jsonRecord';

/** One level of the novel's place hierarchy: "Planet", "City", "Room", or the author's own. */
export type PlaceLevel = { id: string; name: string };

/** A novel's place levels, largest first. One row a novel (`placeSettings`). */
export class PlaceSettings extends JsonRecord {
  get levels(): PlaceLevel[] {
    return maps(this.raw['levels']).map((l) => ({ id: str(l['id']), name: str(l['name']) }));
  }
}

/** Sets of levels to start from. Each is only a start: levels can be renamed, added, moved and removed. */
export const levelPresets: readonly { id: string; name: string; levels: readonly string[] }[] = [
  {
    id: 'space',
    name: 'Across space',
    levels: ['Universe', 'Galaxy', 'Star system', 'Planet', 'Continent', 'Region', 'City', 'Building', 'Room'],
  },
  {
    id: 'world',
    name: 'One world',
    levels: ['World', 'Continent', 'Kingdom', 'Region', 'City', 'District', 'Building', 'Room'],
  },
  {
    id: 'today',
    name: 'The present day',
    levels: ['Country', 'State or province', 'City', 'Neighbourhood', 'Building', 'Room'],
  },
];

/** A map of the world, or of one place in it. Coordinates are in the map's own units, across from the left and down
 * from the top, from 0 to its width and height. Its background is a grid, or an image the author chose from their
 * device (kept as a data URL; never sent anywhere). */
export class WorldMap extends JsonRecord {
  get name(): string {
    return str(this.raw['name']);
  }
  /** The place it is a map of; null for the whole world. */
  get placeId(): string | null {
    return idOrNull(this.raw['placeId']);
  }
  get width(): number {
    return numOrNull(this.raw['width']) ?? 100;
  }
  get height(): number {
    return numOrNull(this.raw['height']) ?? 100;
  }
  /** What one unit is: "leagues", "km", "squares". */
  get unit(): string {
    return str(this.raw['unit']);
  }
  /** Lines every this many units; 0 for none. */
  get grid(): number {
    return numOrNull(this.raw['grid']) ?? 0;
  }
  get image(): string | null {
    return strOrNull(this.raw['image']);
  }
  get createdAt(): number {
    return numOrNull(this.raw['createdAt']) ?? 0;
  }
}

/** Where one place is on one map. A place has at most one pin a map. */
export class MapPin extends JsonRecord {
  get mapId(): string {
    return str(this.raw['mapId']);
  }
  get entryId(): string {
    return str(this.raw['entryId']);
  }
  get x(): number {
    return numOrNull(this.raw['x']) ?? 0;
  }
  get y(): number {
    return numOrNull(this.raw['y']) ?? 0;
  }
}

/** The largest image a map takes as its background, so the novel stays small enough to back up and copy. */
export const mapImageLimit = 8 * 1024 * 1024;
