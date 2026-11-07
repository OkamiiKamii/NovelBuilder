/**
 * PLACES
 * Where the story happens, as the author arranges it. A place is a codex
 * entry of the Location category; what lies inside what is a "Located in"
 * connection, as it always was; how large a place is (a planet, a city, a
 * room) is one of the novel's own levels, which the author names and orders.
 * A map is optional: drawn over a grid or over an image the author chooses
 * from their own device, kept in this novel only, with each place pinned at
 * coordinates the author gives. A place with no coordinates is as usable as
 * one with them: the tree never needs a map.
 */

/** One level of the novel's place hierarchy: "Planet", "City", "Room", or the author's own. */
export interface PlaceLevel {
  id: string;
  name: string;
}

/** A novel's place levels, largest first. One row a novel. */
export interface PlaceSettings {
  id: string;
  projectId: string;
  levels: PlaceLevel[];
  createdAt: number;
  updatedAt: number;
}

/** Sets of levels to start from. Each is only a start: levels can be renamed, added, moved and removed. */
export const LEVEL_PRESETS: { id: string; name: string; levels: string[] }[] = [
  { id: 'space', name: 'Across space', levels: ['Universe', 'Galaxy', 'Star system', 'Planet', 'Continent', 'Region', 'City', 'Building', 'Room'] },
  { id: 'world', name: 'One world', levels: ['World', 'Continent', 'Kingdom', 'Region', 'City', 'District', 'Building', 'Room'] },
  { id: 'today', name: 'The present day', levels: ['Country', 'State or province', 'City', 'Neighbourhood', 'Building', 'Room'] },
];

/**
 * A map of the world, or of one place in it. Coordinates are in the map's
 * own units, across from the left and down from the top, from 0 to its
 * width and height. Its background is a grid, or an image the author
 * chose from their device (kept as a data URL; never sent anywhere).
 */
export interface WorldMap {
  id: string;
  projectId: string;
  name: string;
  /** The place it is a map of; null for the whole world. */
  placeId: string | null;
  width: number;
  height: number;
  /** What one unit is: "leagues", "km", "squares". */
  unit: string;
  /** Lines every this many units; 0 for none. */
  grid: number;
  image: string | null;
  createdAt: number;
  updatedAt: number;
}

/** Where one place is on one map. A place has at most one pin a map. */
export interface MapPin {
  id: string;
  projectId: string;
  mapId: string;
  entryId: string;
  x: number;
  y: number;
  createdAt: number;
  updatedAt: number;
}

/** The largest image a map takes as its background, so the novel stays small enough to back up and copy. */
export const MAP_IMAGE_LIMIT = 8 * 1024 * 1024;
