# The drawn timeline (Prompt 16)

**Written:** 2026-10-21.
**Code:**
- `src/modules/timeline/axis.ts`: the layout, pure
- `timeline/components/TimelineChart.tsx`
- the Timeline view in `visualize/VisualizePage.tsx`

**Tests:**
- `timeline/axis.test.ts`, 4 tests
- "The timeline drawn along story time" in the Visualize section of `e2e/smoke.mjs`

## What it is

The Timeline view on the Visualize page now **draws** the novel's events along story time, and the same events can still be read **as a list** (the "Show as" switch; `?as=list`). Both read the shared event record (`events.md`), so no event is copied. The drawing and the list show exactly the same events, through the same filters (search, character).

## How much is known about each date

Each mark shows how precise its date is. The difference is in shape and in words, never colour alone:

| Mark | When | Shape |
|---|---|---|
| **Moment** | A date to the day or finer | A dot |
| **Somewhere in this stretch** | A date given only to the month, season or year ("Summer of Year 10", "Year 12") | A dashed band across the whole possible stretch, with a dot at its middle |
| **Lasts a while** | A duration or an end date | A solid bar as long as it lasts |
| **Still going on** | No end within the story | A bar to the edge of the drawing, with an arrow |

A legend under the drawing says the same thing in words. Each mark's name, as a screen reader hears it, says the event, its date, and which of these kinds it is ("The siege, Year 10, somewhere in that stretch of time").

**No event gets an invented position.** An event with no date that can be worked out is not placed on the line. It is listed under **"Not placed in time"**, with the reason:
- "No date yet";
- "Dated from an event that has no date yet";
- "Dated from an event that no longer exists".

## Layout (`layoutAxis`)

- **Order.** Dated events are ordered by when they begin, with ties by name and then id. The drawing spans the earliest start to the latest end, with a margin. A single event, or several at one moment, still gets a year either side.
- **Rows.** Marks are packed into as few rows as keep **both the marks and their labels** apart. This is tested: no two marks in a row, labels included, overlap.
- **Year labels.** They use round steps (1, 2, 5, 10, 20, 50…) so there are never more than about ten, whether the story covers a decade or a million years.
- **Width.** The drawing is 1,200 units wide and scrolls sideways in a narrow window. Zoom and finer time scales (hours to centuries, custom calendars) are the next prompt.

## Selecting

- **Clicking a mark, or pressing Enter or Space on it,** selects the event and opens the shared details panel (`selection.md`).
- **The keyboard:** one mark is in the tab order; the left and right arrows, Home and End move along the line.
- **Marks in context:** the selected mark is outlined thickly, and marks connected to the selection are outlined.
- **Undated events** in "Not placed in time" are selectable the same way.

## Making and editing events

- **"+ Add event"** (only for roles that may write) creates an event in the timeline's own records and selects it. It has no date yet, so it appears under "Not placed in time".
- **The same record everywhere.** The e2e test opens the new event on the Timeline page through the details panel, renames it there, comes back, and finds it renamed here.

## States

| State | What it shows |
|---|---|
| Loading | A status line |
| Error | Says nothing was changed |
| Empty | "No events yet", with "+ Add event" |
| Nothing matches the filters | "Clear filters" |

## Not in this step

- Zoom, pan, time scales, jump-to-date and range selection (Prompt 17)
- Tracks (Prompt 18)
- Overlap lanes beyond row packing (Prompt 19)
- The reading-order comparison (Prompt 20)
