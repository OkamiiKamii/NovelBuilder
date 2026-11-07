# Selection and navigation across views (Prompt 15)

**Written:** 2026-10-21.
**Code:**
- `src/modules/model/navigate.ts`: `routeFor`, `detailsOf`, `relatedIds`
- `visualize/RecordDetails.tsx`
- `visualize/VisualizePage.tsx`: `Pick`, the selection

**Tests:**
- `model/navigate.test.ts`, 5 tests
- the "Selecting a record" and "A selection whose record is deleted" checks in the Visualize section of `e2e/smoke.mjs`

## The contract

Selecting a record means the same thing in every view:

1. **Its details show in a shared panel** (`detailsOf`).
   - **Facts about the record itself:**

     | Record | Facts |
     |---|---|
     | Event | Date, significance, status, canon, description |
     | Entry | Kind and summary |
     | Chapter | Kind, status, words and summary |
     | Thread | Status and developments |
     | Relationship | Its current stage |
     | Ability | System, group and description |

   - **Everything it is connected to**, grouped by how and worded from its side. An event shows "Who takes part" (with ages), "Takes place at", "Told in" (with "Flashback in" and so on), "Plot threads", "Comes after" and "Followed by". A character shows the events they take part in, their relationships (in their own role: "Student"), the relationship records, and their abilities.
   - A note beside an item says only what the group title doesn't: the author's wording, an age, a flashback.
   - Every connected record in the panel can be selected in turn.
2. **It opens on the page where it is kept** (`routeFor`), in the same form the rest of the app already links to it:

   | Record | Opens in |
   |---|---|
   | Character | Their profile |
   | Other entry | The Codex |
   | Chapter or scene | The editor |
   | Volume, act or arc | The Organizer |
   | Event | `timeline?event=` |
   | Thread | `plot?thread=` |
   | Relationship | `relationships?rel=` |
   | Ability | Its system |

   The Story graph already opened records this way (a character node opens their profile). The panel's "Open …" link does the same from any view.
3. **Other views mark it** (`relatedIds`). The selection is kept when moving between view tabs. The selected row says "Selected", and rows directly connected to it say "Connected to the selection", **in words as well as shading**. A relationship counts as connected to its two characters.

**The details are never only in a drawing.** The panel is reached from the lists every view has, so an ordinary record's details never need a graph.

## Address and Back

- The selection is in the page address: `?select=event:<id>`.
- Selecting adds a history entry, so **Back** returns to what was selected before. Opening a record's page and coming back returns to the selection.
- Closing the panel clears the selection.
- Everything stays within the current novel. Ids are only looked up in this novel's records, and a record of another novel is "not found".

## Stale and deleted references

- `detailsOf` and `routeFor` return nothing for a record that doesn't exist, whether it was deleted since or belongs to another novel.
- The panel then says "This record is no longer in this novel; it may have been deleted. Nothing else has changed", and offers **Clear the selection**.
- Connections to deleted records are not listed. The model reports them as dangling (`contracts.md`).
- The e2e test deletes a selected place in the database, reloads, and gets that message.

## Not in this step

**Highlighting inside drawings** (a node outlined on the graph or map) comes with each drawn view. They will read the same `select` parameter and `relatedIds`.
