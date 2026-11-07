# The place explorer and optional world maps (Prompt 39)

**Written:** 2026-10-22.

**Code:**
- `src/modules/places/types.ts`: levels of place, maps and pins.
- `places/explore.ts`: the tree (`placeTree`, `parentsOf`, `placesWithin`), what a place is tied to (`placeLinks`), and what a map covers (`mapPlaces`); pure.
- `places/service.ts`: levels, a place's level and parent, maps, background images and pins.
- `places/components/PlaceDialogs.tsx`: **Levels of place** and **Maps**.
- `visualize/PlacesView.tsx`: the explorer (the Visualize **Places** view), its map, and `PlaceDetails` beside it.
- `codex/service.ts`: a deleted place takes its pins; a map of it becomes a map of the whole world.

**Tests:**
- `places/places.test.ts`, 10 tests:
  - nested places from a universe down to a room;
  - events rolled up from places inside;
  - no place inside itself; notes;
  - the author's own levels;
  - places with no coordinates; coordinates and images;
  - removing maps and places; copies;
  - what a place is tied to.
- "The place explorer…" in the Visualize section of `e2e/smoke.mjs`: 18 checks.

## Works without a map

The Visualize **Places** view is the explorer. Its tree is the explorer itself, and nothing in it needs coordinates. A map, when the novel has one, is drawn above the tree.

- **What is inside what** comes from "Located in" connections between places, as before. A connection that has ended (Prompt 8) is history, not where the place is now.
- **Each row says:**
  - how many events happen there, and how many in the places inside it;
  - the characters, factions, and chapters and scenes tied to it;
  - its level;
  - which maps it is on, or "no coordinates" (only once the novel has a map).
- **Exploring inside a place** shows only it and what lies within, with the path to it ("Known Universe › Milky Way › Earth › Paris") and "Show every place".
- **Page filters,** selection and "Connected to the selection" work as in every view.

**Said, never fixed:**
- a place also recorded as inside another;
- a place inside itself through a loop of connections (shown at the top);
- a larger kind of place inside a smaller one ("A Planet inside Paris, a City").

## Levels of place

**Levels of place…** names the novel's levels, largest first.
- **Sets to start from:**
  - "Across space" (Universe, Galaxy, Star system, Planet, Continent, Region, City, Building, Room);
  - "One world";
  - "The present day".
- **Or your own,** added, renamed, moved and removed. A preset applied later only adds what is missing.
- **A level some place has cannot be removed** ("1 place is a Fortress. Give it another level first."). Renaming keeps every place at it.
- **A place's level is optional,** set beside the view.

## Beside the view, for a place

- **Level and Located in.** "Located in" offers only places that are not inside it, so a place cannot go inside itself. Moving a place replaces its current "Located in"; a connection that has ended stays, as history.
- **What it is tied to:**
  - characters and factions, and other records, with how ("Located in this", "takes part in “The heist”, here");
  - events that take place there, and how many in places inside it;
  - chapters and scenes that link it in their text, have it in their plan, or tell an event there.
- **Tie something to it:**
  - a record, by a connection: Located in, Owns, Leads, Related to;
  - an event, by setting where it takes place;
  - a chapter or scene, by adding the place to its plan.

  Each goes through the service that keeps that record, so it shows everywhere else too.
- **On the maps:** coordinates for each map (across, down), placed by typing them or "by clicking the map". It can also be taken off a map.

## Maps, if wanted

**Maps…** makes as many as the novel needs:
- **What each is a map of:** the whole world, or one place (a city map covers only what lies inside the city).
- **Its size and unit:** coordinates are in the map's own units, across from the left and down from the top.
- **Its grid:** lines every so many units, or none.
- **Its background:** an image chosen from this device.
  - Kept in the novel as data; it is never sent anywhere, and no map service, geocoding or upload is used.
  - It is limited to 8 MB, so the novel stays easy to back up and copy.
  - With nothing placed on the map yet, the map takes the image's proportions.

**The drawing:**
- Zoom and pan; arrow keys move between places; Enter selects.
- A pin outside the map's edges is allowed, and said.
- Under the map: **"Not on this map (n), still in the tree"** lists every place it covers with no coordinates on it. Selecting one opens it beside the view, to give it some.

**Removing:**
- **Deleting a map** takes its pins, never its places.
- **Deleting a place** takes its pins; a map of it becomes a map of the whole world.

## Data model

- **New tables (database version 33):** `placeSettings` (the levels; one row a novel), `worldMaps`, `mapPins`. No migration is needed.
- **`LoreEntry.placeLevel`:** optional, a level's id.
- **The hierarchy** is the existing "Located in" connections; nothing new is stored for it.
- **Copies, backups and forks** carry levels, maps and pins, pointing at the copy's own places and maps.

## Limits

- **One "Located in" at a time** places a place in the tree. Others are said, not drawn as a second parent.
- **Maps are flat.** There is no projection, no globe, and no distances worked out; coordinates are what the author gives.
- **A place has one pin a map.**
- **An image is stretched to the map's proportions** once places are on it.
