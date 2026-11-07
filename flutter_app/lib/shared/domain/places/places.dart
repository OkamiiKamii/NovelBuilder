import '../json.dart';
import '../json_record.dart';

/// PLACES (as in the original app)
/// Where the story happens, as the author arranges it. A place is a codex entry of the Location category; what lies
/// inside what is a "Located in" connection; how large a place is (a planet, a city, a room) is one of the novel's own
/// levels, which the author names and orders. A map is optional: drawn over a grid or over an image the author chooses
/// from their own device, kept in this novel only, with each place pinned at coordinates the author gives. A place
/// with no coordinates is as usable as one with them: the tree never needs a map.

/// One level of the novel's place hierarchy: "Planet", "City", "Room", or the author's own.
typedef PlaceLevel = ({String id, String name});

/// A novel's place levels, largest first. One row a novel (`placeSettings`).
class PlaceSettings extends JsonRecord {
  PlaceSettings(super.raw);

  List<PlaceLevel> get levels => [for (final l in maps(raw['levels'])) (id: str(l['id']), name: str(l['name']))];
}

/// Sets of levels to start from. Each is only a start: levels can be renamed, added, moved and removed.
const levelPresets = [
  (
    id: 'space',
    name: 'Across space',
    levels: ['Universe', 'Galaxy', 'Star system', 'Planet', 'Continent', 'Region', 'City', 'Building', 'Room'],
  ),
  (
    id: 'world',
    name: 'One world',
    levels: ['World', 'Continent', 'Kingdom', 'Region', 'City', 'District', 'Building', 'Room'],
  ),
  (
    id: 'today',
    name: 'The present day',
    levels: ['Country', 'State or province', 'City', 'Neighbourhood', 'Building', 'Room'],
  ),
];

/// A map of the world, or of one place in it. Coordinates are in the map's own units, across from the left and down
/// from the top, from 0 to its width and height. Its background is a grid, or an image the author chose from their
/// device (kept as a data URL; never sent anywhere).
class WorldMap extends JsonRecord {
  WorldMap(super.raw);

  String get name => str(raw['name']);

  /// The place it is a map of; null for the whole world.
  String? get placeId => idOrNull(raw['placeId']);
  double get width => (numOrNull(raw['width']) ?? 100).toDouble();
  double get height => (numOrNull(raw['height']) ?? 100).toDouble();

  /// What one unit is: "leagues", "km", "squares".
  String get unit => str(raw['unit']);

  /// Lines every this many units; 0 for none.
  double get grid => (numOrNull(raw['grid']) ?? 0).toDouble();
  String? get image => strOrNull(raw['image']);
  num get createdAt => numOrNull(raw['createdAt']) ?? 0;
}

/// Where one place is on one map. A place has at most one pin a map.
class MapPin extends JsonRecord {
  MapPin(super.raw);

  String get mapId => str(raw['mapId']);
  String get entryId => str(raw['entryId']);
  double get x => (numOrNull(raw['x']) ?? 0).toDouble();
  double get y => (numOrNull(raw['y']) ?? 0).toDouble();
}

/// The largest image a map takes as its background, so the novel stays small enough to back up and copy.
const mapImageLimit = 8 * 1024 * 1024;
