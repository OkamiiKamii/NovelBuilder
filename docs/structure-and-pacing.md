# Structure and pacing (Prompt 30)

**Written:** 2026-10-22.

**Code:**
- `src/modules/structure/types.ts`: `StructureMarker`, the suggested marker kinds and labels, `cleanLabels`, `labelOrder`
- `structure/service.ts`: markers (`registerStructure`, `createStructureService`: list, save, remove)
- `structure/pacing.ts`: everything the charts show (`lengthBars`, `partBands`, `lengthFacts`, `labelDistribution`, `usedLabels`, `placeMarkers`, `barOf`); pure
- `structure/components/LengthChart.tsx`: the length chart
- `structure/components/LabelPicker.tsx`: labels on a chapter, scene or event
- `visualize/StructureView.tsx`: the **Structure and pacing** view in Visualize (`/visualize/structure`)
- **Labels are given:**
  - in each chapter's and scene's plan (`manuscript/components/PlanForm.tsx`: the Organizer's details and the manuscript's side panel);
  - on each event (`timeline/components/EventDetails.tsx`).

**Tests:**
- `structure/structure.test.ts`, 14 tests, including empty and incomplete manuscripts
- "Structure and pacing" in the Visualize section of `e2e/smoke.mjs`: 19 checks

## What it is, and is not

The view opens by saying so:

> Word counts the editor keeps, and the parts, labels and markers you record, laid out in reading order. They describe the manuscript as it stands. They do not measure quality, how a chapter reads, or whether a structure is right, and no storytelling formula is assumed: the markers are only the ones you add.

**No formula is imposed:**
- **Structural markers are the author's own:** any kind, in any order, as many or as few as they like.
- **Suggestions only:** Act break, Inciting incident, Turning point, Midpoint, Major reveal, Climax and Resolution are offered as suggestions. None is required, and nothing checks for them.
- **Acts are the volumes, acts and arcs** the author already keeps in the Organizer.

## What the author records

- **Labels on chapters, scenes and events:**
  - Suggested: Action, Dialogue, Exposition, Romance, Mystery clue, Quiet moment.
  - Any label of the author's own can be added; there are up to 12 on each, of up to 40 characters.
  - A label is the same label whatever its capitals. One that matches a suggestion takes the suggestion's spelling. Others are shown as first spelled in reading order.
  - Labels on chapters and scenes are kept in their plan, the planning layer, never in the text. Labels on events are kept on the event.
- **Structural markers:**
  - **Fields:** a kind, optional words of its own, a chapter or scene, an event, and a note.
  - **Placing:** a marker with only an event is placed where that event is told.
  - **Unplaced markers:** one with neither is listed as not placed.
  - **Deleted chapters:** one whose chapter is deleted is kept, and says so.

## The view

**Filters (kept in the address and in saved views):**
- **Bars for** chapters or scenes. By scene, a chapter with no scenes is a bar of its own, and so is a chapter's own text beside its scenes, so no words go uncounted.
- **Pick out a label:** bars without it are dimmed, so the shape of the book stays in view, and the count of those with it is given.
- **Part of the book:** keep to one volume, act or arc.

**Facts, as a line of text:**
- the count, the total, and the average and median over the chapters with words;
- the longest and shortest;
- how many have no words yet ("not written yet", never "short");
- how many are labelled.

**The length chart:**
- a bar for each chapter or scene, in reading order, and an empty dashed bar for one with no words yet;
- the parts (acts) as bands behind;
- the markers as flags;
- the average as a dashed line.
- **Keyboard:** one stop in the tab order; the arrow keys move between bars, and Enter selects one, which opens its details.

**Words by label:**
- **The grid:** labels by chapters (or scenes). Each cell shows the words, shaded to match, with "No label" as its own row and totals at the end.
- **Counting:** a chapter or scene with two labels counts its words toward both.
- **Events:** they have no words, so they are not counted here.

**Markers:** listed in reading order with where they are. Markers are added and removed here.

**List:** the lengths as a table (with part, labels and markers), and words by label as totals.

## Empty and incomplete manuscripts

All of these are tested:

| The manuscript | What the view shows |
|---|---|
| No chapters | An empty state saying where chapters come from |
| Chapters with no words | Bars of 0, drawn as empty; "No words are written yet: the bars fill in as you write." No average, no longest or shortest |
| Some chapters unwritten | Counted as such, and left out of the average and median |
| No labels | The words-by-label section says how to add them |
| An act with no chapters | No band |
| A plan saved before labels | Read as no labels |

## Data

- **New table:** `structureMarkers` (Dexie v31), copied, backed up and forked with the novel (a fork keeps the markers in the chapters it has), and kept to authors as planning data.
- **Labels** live in existing rows: `labels` on chapter plans and on events. No existing record changes shape for anyone who does not use them.
- **Read-only:** charting reads only (tested): no chapter's place, words or labels change.

## Limits

- **Markers** are added and removed, not edited in place.
- **Event labels** are kept on the event and offered as suggestions elsewhere, but no chart uses them yet: the words-by-label grid counts chapters and scenes only.
- **Pace as a reader feels it** is not measured. Word counts are not reading time, and nothing here judges whether a chapter is too long or too short.
