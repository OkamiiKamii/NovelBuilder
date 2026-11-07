# Timeline tracks (Prompt 18)

**Written:** 2026-10-21.
**Code:**
- `src/modules/timeline/tracks.ts`: which events go on which track, arranging tracks, and reading and writing them in the page address and in saved views; pure
- `timeline/components/TrackPanel.tsx`: the "Tracks by" choice and the "Arrange tracks" list
- `timeline/components/TimelineChart.tsx`: draws one band per track
- the Timeline view in `visualize/VisualizePage.tsx`; `visualize/SavedViewsBar.tsx` (`addressFor`)

**Tests:**
- `timeline/tracks.test.ts`, 6 tests
- "Tracks" in the Visualize section of `e2e/smoke.mjs`, 23 checks

## Splitting the timeline

**Tracks by** offers:

| Choice | One track per… |
|---|---|
| One line | Nothing: the timeline as before |
| Characters, Places, Factions & Species, … | Each record of that codex category an event is connected to. Every category the novel has records in is offered, the author's own ("Ships") too |
| Plot threads | Each plot thread an event belongs to |

**Membership comes from links that already exist.** A track for a codex record holds every event the record is connected to, through any of the following:
- the event's cast;
- its place;
- its linked entries;
- a typed connection (`connectionsOf`, Prompt 8).

Plot-thread tracks use the event's `threadIds`. Nothing new is stored to put an event on a track.

**Events linked to none of them** go on a last track, "Not linked to any character" (or place, faction / species, …), or "Not part of any plot thread". So no event drops out of sight because of the grouping.

**An event on several tracks is still one record.** A track holds event ids, not copies. The feast that Mira and Bren share is one event: it is drawn on both their tracks, at the same moment, and selecting it on either track selects it everywhere. Editing it anywhere changes it on every track.

Tracks with no events are left out. Tracks are sorted by name, and the "not linked" track always comes last.

## Arranging tracks

**Arrange tracks (N of M shown)** lists every track in drawing order. Each row has:

| Control | Does |
|---|---|
| Checkbox, named with the track and its event count | Show or hide the track |
| ↑ / ↓ ("Move Mira up") | Move the track up or down; disabled at the ends |
| Fold / Unfold (`aria-pressed`) | Draw the track as a single labelled line: "Bren — folded, 2 events" |
| Only this (`aria-pressed`) | Show this track alone; "Showing only “Mira”. Show all tracks" undoes it |

**If every track is hidden,** the view says so ("Every track is hidden, so there is nothing to show.") and offers **Show all tracks**.

**Undated events** are listed under "Not placed in time" only if they are on a track that is shown.

**Everything is a button or checkbox.** Nothing needs a drag, so all of it works with a keyboard and a screen reader. The panel shows each change at once, even though the address it is kept in updates a moment later. Without that, a checkbox would briefly flick back.

## Chronology never moves

Arranging tracks changes only which band an event is drawn in, never when it happens.
- **One time axis.** Every track is laid out against the same time range (`domainOf` of all the events the filters leave, passed to `layoutAxis`). An event sits at the same x on every track, whatever the track order. Hiding a track doesn't rescale the others, and Fit all still fits every event.
- **Order within a track is story order,** as everywhere else.
- **Nothing is written.** Grouping, order, hiding, folding and focus live in the page address (`group`, `torder`, `thide`, `tfold`, `tfocus`) and, if the author saves the view, in its `layout`. No event, entry or thread changes.

**This is tested both ways:**
- **Unit test:** an event's x is identical on every track it is on, for the usual track order and the reversed one, and its stored date is unchanged afterwards.
- **Browser:** moving a track leaves the feast's marks at the same pixel.

## Filters and tracks

Tracks are built from the events the filters leave. A search for "siege" leaves only the tracks that hold the siege. Clearing the search brings the others back, still arranged as they were. Hidden and folded tracks are remembered by id, so a track that drops out under a filter comes back the same way.

## Keyboard and screen readers

**The drawing's name says how many tracks there are:** "Timeline of 2 dated events, in the order they happen, on 3 tracks."

**Each band is a group named with its track:**
- "Mira: 1 event"
- "Bren: 2 events, folded"

**Each mark adds its track:** "The feast, Year 12, somewhere in that stretch of time, on the Mira track".

**Keys:**

| Key | Moves to |
|---|---|
| ← / → / Home / End | Along the track |
| ↑ / ↓ | The nearest event in time on the next open track; folded tracks are skipped |

## As a list

With **List**, each shown track is a section with its name as a heading. Its events are listed in story order ("Events on the Bren track, in story order"). An event on two tracks is listed under both. A folded track says "Folded: 2 events."

## Saved views

The timeline's saved views keep the tracks in `layout`:
- `group`
- `trackOrder`
- `hiddenTracks`
- `foldedTracks`
- `focusTrack`

**Opening a view brings the arrangement back.** Changing it shows "Save changes to …", because the comparison includes the layout.

**Copying a project keeps views pointing at the copy.** Duplicating or importing a project rewrites the entry and thread ids in those lists to the copy's ids (`remapConfig`). Category keys are kept as they are, like the entries' own `category`.

**Zoom isn't saved, by decision.** A view always opens fitted to all its events, so an event added later can't sit outside a saved window unseen. Jump to date and Show range get to any stretch in one step.

## Limits

- **Custom groupings are codex categories.** "Custom groupings" means the author's own categories (and plot threads), so a new kind of grouping is made by adding a category in the Codex. There are no free-form named groups that exist only on the timeline: that would be new stored data, and could hold a second copy of what the codex already says.
- **Tracks by one kind at a time.** For example, characters or places, not both mixed.
- **Small mark targets.** A mark is hit on its shape or label, as in Prompt 16. A track doesn't enlarge it for touch.
