# Timeline zoom, scales and calendars (Prompt 17)

**Written:** 2026-10-21.
**Code:**
- `src/modules/timeline/scale.ts`: calendar, scales, marks, zoom, reading dates; pure
- `timeline/components/TimelineChart.tsx`

**Tests:**
- `timeline/scale.test.ts`, 10 tests
- "Zoom, scales, jump and range" in the Visualize section of `e2e/smoke.mjs`

## Controls

| Control | What it does |
|---|---|
| **+ / −** (buttons, or keys on the focused drawing) | Zoom in or out about the middle |
| **Mouse wheel** | Zoom about the pointer: the moment under it stays put |
| **Drag** the drawing; **← / →** on the focused drawing | Move along the line |
| **Fit all**, or **0** | Show every dated event |
| **Jump to date** | Go to a year (`10`, `-500`), a month (`10-6`, `June 10`) or a day (`10-6-14`), shown with its neighbours: three times the length of what was typed |
| **Show from … until …** | Show exactly that stretch |
| **Arrow keys on a mark** | Move to the next or previous event, bringing it into view if it is off screen |

**Limits:** zoom stops at one hour across the drawing, and at a thousand times the whole story. A date the timeline can't read gets a message with examples ("…is not a date this timeline can read. Try a year (10, -500)…"). Nothing is guessed. A range that ends before it starts is refused.

## Scales

The scale is chosen to keep labels at least 90 pixels apart, and the drawing says which it is ("Showing decades"):

| Scale | Steps |
|---|---|
| Hours | 1, 2, 3, 6, 12 hours |
| Days | 1 or 2 days |
| Weeks | 1 or 2 weeks |
| Months | 1, 2, 3 or 6 months |
| Years, decades, centuries, millennia | 1, 2, 5, 10 … up to 10,000,000 years |

**Where marks go:**
- Marks sit on the unit's own boundaries: the start of an hour, a day, a month, a year.
- Month labels name the year where it changes ("November Year 10", "December", "January Year 11").
- Day and hour labels name the month day ("January 3", "January 1, 06:00").

**Years can be any whole number:** year 0, negative years ("Year -1000000") and far-future ones are all labelled and placed, as tested.

**Positions stay put when zooming.**
- Zoom only stretches or shrinks the line, about the pointer or the middle.
- **Rows are worked out once for the whole story**, so a mark never moves to another row as you zoom.
- Two events keep their order, and their spacing grows in proportion: zooming in 4× spreads them 4× further apart. This is tested in unit tests and in the browser.

## Calendars

**The axis takes everything about time from a `Calendar`.** That covers month names, months per year, the length of a year and a day, and named eras ("First Age 1", "Second Age 6"). Nothing Gregorian is assumed in the axis itself. A test runs a made-up calendar (ten months, 400-day years, two ages), and its marks and labels follow it: "Thaw Second Age 4", "Swelter", "Frost".

**Per-novel calendars now exist** (built after Prompt 18 at the owner's request; see `story-calendar.md`). The paragraph below is kept as it was written.

**The app doesn't have per-story calendars yet.** Every date in the app (`EventDate`, `chronology.ts`) is counted in one calendar: twelve equal months to a year. `STORY_CALENDAR` is that calendar, and it is what the drawn timeline uses. Letting a novel have its **own** calendar is a data-model change across the whole timeline: dates, durations, the order of events, the validity and query layers, and the event editor. The plan marks it optional (`visualization-plan.md` §3.7, §6). It is designed so the axis will follow a stored calendar unchanged, and waits on the owner's go-ahead.

## Not in this step

Zoom isn't kept in saved views (their `scale` field is for drawings with `x/y/k`). Prompt 18 decided to keep it that way: a timeline view always opens fitted to its events, so a later event can't sit unseen outside a saved window. See `timeline-tracks.md`.
