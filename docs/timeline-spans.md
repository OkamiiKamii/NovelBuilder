# Parallel, overlapping and lasting events (Prompt 19)

**Written:** 2026-10-21.

**Code:**
- `src/modules/model/validity.ts` (`boundsOfEvent`): when an event begins and ends, each as a stretch
- `src/modules/timeline/overlap.ts`: how two events share time; pure
- `timeline/axis.ts`: marks with rough starts and ends, and a new kind for an end that isn't given
- `timeline/components/TimelineChart.tsx`: drawing them
- `timeline/components/EventDetails.tsx`: the new **Ends** control
- `model/navigate.ts`: "At the same time" in every view's details
- `viz/components/Legend.tsx`: two new swatches, hatched and fading

**Tests:**
- `timeline/overlap.test.ts`, 8 tests: same-time events, overlapping intervals, missing end dates, open-ended durations, rough starts and ends
- "Parallel, overlapping and lasting events" in the Visualize section of `e2e/smoke.mjs`

## How each kind of event is drawn

| Kind | When | Drawn as | Said as (screen reader) |
|---|---|---|---|
| Exact moment | No length, date known to the day or better | Dot | "…, an exact moment" |
| Somewhere in a stretch | No length, date known only to the month, season or year | Dashed rounded bar across the stretch, dot in the middle | "…, somewhere in that stretch of time" |
| Lasts a while | A duration or an end date | Solid bar | "…, Year 9, March 1 to Year 11, January 1, lasting a while" |
| Rough start or end | A lasting event whose start or end is known only roughly | The rough stretch **hatched**, solid only while it is certainly going on | "…, lasting a while; its start and end are known only roughly" |
| Still going on | "Still going on" | Bar to the edge, with an arrow | "…, Year 11, January 1, still going on" |
| End not given | It lasts, but its end is "a time not given", or can't be worked out (dated from a deleted event) | A short bar **fading out**, with "?". It never claims an end | "…, end not known, lasting a while" |

Every kind is in the legend, as a shape and in words.

## Start and end uncertainty (`boundsOfEvent`)

Each event's start and end are kept as the stretch they're known to fall in:
- **Start:** the stretch its date covers. A day, or a whole year for "Year 10".
- **End:**
  - An end date gives the stretch it covers ("Spring of Year 14" is that spring).
  - A duration ends that long after the start. If the start is known to the day, the end is exact. If the start is rough, the end is just as rough, shifted by the duration: "some time in Year 20, for 3 months" ends somewhere from late in month 3 of Year 20 to month 3 of Year 21.
- **Open:** `'ongoing'` (still going on), or `'unknown'` (an end not given or not worked out). Neither has an end.

**`span` is now derived from bounds.** It still runs from the earliest start to the latest end, or to Infinity with no end. Only one case changed: a duration with a rough start now reaches to the latest end it could have, not the earliest. This is more honest, and can only turn a validity answer into "unknown", never into a wrong yes or no.

## Sharing time is not an error

**Overlaps are normal:**
- a battle in one place while a treaty is signed in another;
- a siege that runs through smaller events;
- two characters' journeys that cross.

**None of it is a warning.** `validateEvent` is unchanged, and a test checks that same-time and overlapping events, even the same character at two places on the same day, have no problems.

**On the drawing,** events that share time go on separate rows. Two events at the same moment sit at the same x, one above the other.

**In words,** a record's details in every Visualize view list them under **At the same time**, with how and where. For example: "The long siege · while this is going on · at Ashen Keep".

| Words | Meaning (`together`) |
|---|---|
| at the same time | two moments, the same day or closer |
| while this is going on | the other happens while this one is certainly going on |
| going on at the time | this one happens while the other is certainly going on |
| overlaps with this | both are certainly going on at some moment |
| may be at the same time; the dates are too rough to tell | they could share time, but rough dates or an end not given mean it can't be told |

**What "certainly going on" means:**
- from the latest moment it can have started, to the earliest it can have ended;
- forever, if it's still going on;
- for an end not given, only its first day, and only when the start is known to the day.

So an event with no end given is never said to be over, and never said to be certainly going on later. Two events where one ends on the day before the other starts don't share time.

## Setting how an event ends

The event editor on the Timeline page has an **Ends** choice under **Lasts**:

| Choice | Stored as |
|---|---|
| At once: it is a moment / When the time it lasts is over | No end date, not ongoing (a duration in **Lasts**, if any) |
| On a date… | `end`: a full date editor ("End year", "End month", … or approximate, or relative to another event), so an end can be as rough as "Spring of Year 14" |
| At a time not given | `end: { precision: 'unknown' }` |
| Still going on | `ongoing: true` |

**One way at a time.** **Lasts** is disabled while an end date, an unknown end, or "still going on" is set. The service already cleared the other ways whenever one was set.

The Timeline page's event cards say it too: "· until Year 12, June 1", "· end not known", "· still going on".

## Limits

- **"Certainly" treats a date known to the day as exact for that day.** Two events on the same day are "at the same time" even if the hours would separate them, unless both give a time.
- **Bar length for an unknown end is fixed.** The fading tail is a fixed 48 pixels at any zoom; it means "lasts, end unknown", not a length.
- **Same character in two places.** The "At the same time" list shows where each event is, so the author can spot it themselves. There's no check for a character in two places at once, and none was added, since overlaps aren't errors by default. An opt-in check could come with the warnings in Prompt 23.
