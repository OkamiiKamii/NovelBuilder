# Saved views (Prompt 14)

**Written:** 2026-10-21.
**Code:**
- `src/modules/visualize/saved.ts`: type, service, registry, `openSaved`
- `visualize/SavedViewsBar.tsx`
- the filter bar in `visualize/VisualizePage.tsx`

**Tests:**
- `visualize/saved.test.ts`, 6 tests
- the "Filters, and saved views" checks in the Visualize section of `e2e/smoke.mjs`

## What a saved view is

A named way of looking at the novel. It holds **settings and record ids only**, never copies of records. Opening one reads the records as they are now: a character renamed since is found by its id, under the new name.

| Field | Meaning |
|---|---|
| `view` | Which view (`timeline`, `places`…), kept as written |
| `name` | The author's name for it; blank becomes "Untitled view" |
| `filter` | The query settings (`query.md`): record ids (characters, places, factions, threads, chapters), story-time points, text, canon, status… |
| `mode` | Drawn or list |
| `layers` | Which of the view's layers are on (for drawn views to come) |
| `scale` | Zoom and position (`{ x, y, k }`), or none to fit everything when it opens |
| `layout` | The view's own choices (grouping, track order…), kept as given |
| `createdAt`, `updatedAt` | When it was made and last changed |

**What is stored is cleaned on the way in** (`cleanConfig`):
- The filter goes through the same reading as the page address, so only what a filter can hold is kept.
- An unknown mode becomes "visual", and layers are de-duplicated.
- A zoom that isn't three finite numbers with a positive scale is dropped.
- The layout object is kept as given.

## Actions

| Action | Effect |
|---|---|
| **Save view as…** | Saves the current filters and mode under a name, and opens it |
| **Save changes to "…"** | Shown when the open saved view's filters differ from what is on screen |
| **Rename** | Keeps everything else |
| **Duplicate** | "<name> (copy)" with the same settings |
| **Restore default** | Puts the saved view back to how the view opens on its own (no filters, drawn, fitted), keeping its name |
| **Delete** | Asks first, and says that no record is changed |

The open saved view is in the page address (`?saved=<id>`), with its filters, so a reload or a shared link brings it back.

## Records deleted since

`openSaved(model, view)` opens a saved view **without** the ids of records deleted since it was saved:
- characters, places, factions and threads;
- the ends of a chapter range;
- story-time points that name a chapter or event.

It lists the missing ids, and the page says "1 record this saved view names no longer exists; it shows the rest." **The stored view is not changed.** "Save changes" afterwards would store it without them. If everything it named is gone, it opens as the plain view.

**The same applies to any filter in the page address.** A reload or a shared link reads the filter straight from the address, which may still name a deleted character. The page leaves such ids out before filtering and says so ("…this view names no longer exist"). The e2e test caught the first version, which cleaned only views picked from the menu: a reload then showed "Nothing matches".

## Storage

- **Table:** `savedViews` (schema **v27**, `id, projectId`) in the app's own database.
- **Registered in the project registry**, so saved views are backed up, copied, forked and deleted with their project. Copies and imports rewrite every id inside them: the filter's ids and points, plus layout values that are ids (unknown values are left as they are). This is tested for both duplicate and import.
- **Roles:** a saved view is part of the plan (`sync/access.ts` `PLANNING`), seen by roles that may read the plan.
- **Sync:** appears as "Saved view" in sync.
- **Older app versions:** a project file holding saved views is refused by an older copy of the app, which says it holds records it can't keep (`persistence.md`), rather than silently dropping them. The file version stays 4.

## Filters on the Visualize page

To give a saved view something to hold, the page now has a filter bar shared by every view:
- **Search by name**, and **Involving character** (the character, or anything with a recorded connection to them).
- The lists obey it through the query layer (`select`).
- When nothing matches, the view says so and offers **Clear filters**.
- Records the filters can't decide on are listed underneath with the reason.
- The Knowledge graph summary covers the whole novel and says the filters don't narrow it.

**One addition to the query layer.** A **relationship** now counts as connected to the two characters it joins, so filtering by a character keeps their relationships.

## Not in this step

Layers, zoom and layout preferences are stored and restored. The timeline sets `layout` from Prompt 18: its tracks, their order, and which are hidden, folded or focused (`timeline-tracks.md`). No view sets layers or zoom yet; they are filled in as the other drawn views arrive.
