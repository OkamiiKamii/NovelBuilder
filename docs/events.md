# The unified event (Prompt 9)

**Written:** 2026-10-21.
**Code:**
- `timeline/types.ts` (`TimelineEvent`)
- `timeline/service.ts` (storing and cleaning)
- `model/events.ts` (`eventRecord`, `validateEvent`)
- `model/validity.ts` (`spanOfEvent`)

**Tests:** `model/events.test.ts`, 9 tests.

## One event record, refined, not replaced

The timeline's `TimelineEvent` was already the app's event record, used by the Timeline page, the Story graph, Consequences, character secrets and canon sources. It was extended with **optional** fields, so no data is migrated:
- an event stored before this reads exactly as it did;
- a new event starts with nothing the author did not give it.

| Asked for | Where it lives | New? |
|---|---|---|
| Stable id, title, description | `id`, `name`, `description` | no |
| Fictional start | `when`: exact, approximate, relative or unknown | no |
| Fictional end | `end` (a date) **or** `duration` **or** `ongoing` | `end`, `ongoing` new |
| Precision or uncertainty | The precision of `when` and `end`. Approximate dates are ranges (see `validity.md`) | no |
| Participants (with ages), location, other records involved | `characters`, `locationId`, `entryIds` | no |
| Related chapters and scenes | `nodeIds`, plus `reveals`: how a chapter tells it (`flashback`, `flashforward` (Prompt 20), `foreshadowed`, `mentioned`, `revealed`; plain `told` when not said) | `reveals` new |
| Plot threads | `threadIds` | new |
| Significance | `importance`: minor, major, climax | no |
| Status | `status`: `idea`, `planned` or `confirmed`; **confirmed when absent** | new |
| Canon | `canon`: the existing `CANON_STATUSES`; **canon when absent** | new |
| Branch | The project's own `TimelineRecord` (main canon, alternate, non-canon…), as the Branches page names it. What-if layers inside one project come in Prompt 22 | read, not stored |
| Order dependencies, links to related records | `afterId`, relative dates; and typed connections (`connections.md`) can join an event to anything | no |

## When it happened vs. when the reader meets it

`eventRecord(model, id)` gives every view one shape for an event, with two separate orders:
- **Story time:** `start`, `end`, `shape` and `span` (minutes).
- **Reading:** `told`, the chapters and scenes in **reading order**, each with its role and position.

Neither is ever worked out from the other. A flashback (Year 1, told in chapter 3) comes first in story time and last in reading order. Reordering chapters changes `told` and nothing else. Both are tested.

## Instants, stretches, and things still going on

`eventShape` is one of:
- **`instant`:** no length given.
- **`span`:** a duration, or an end date.
- **`ongoing`:** no end within the story.

The length is given **one way at a time**:
- Setting a duration clears any end date.
- Setting an end date clears the duration.
- "Still going on" clears both.

**Added in Prompt 19:** each record also has `bounds` (its start and end, each as the stretch it is known to fall in, with `open` for still going on or an end not given) and `dateProblem` (why its date is not in the novel's calendar). An end with precision `unknown` reads "…, end not known". See `timeline-spans.md` and `story-calendar.md`.

An ongoing event, or one whose end date is unknown, has **no known end**. Nothing is ever definitely after it.

## Validation

**When saving** (`timeline.update`), anything that doesn't fit is not stored:
- plot threads that aren't this project's;
- statuses and canon values that don't exist;
- reveal roles that don't exist, a reveal in a chapter the event isn't told in, and a second reveal for the same chapter;
- a relative end date pointing outside the project.

Taking a chapter off an event also takes its reveal.

**When reading** (`validateEvent(model, event)`), the problems are reported in words and nothing is changed:
- required fields;
- an end before the start;
- the length given more than one way, which only old or imported data can have;
- a reveal in a chapter the event isn't told in;
- each link to a character, place, entry, chapter, thread or event that no longer exists.

## Integrity

- **Deleting a plot thread** takes it out of every event's `threadIds`. The events keep everything else.
- **Copies and imports** rewrite `threadIds`, the chapters in `reveals`, and the anchor event of a relative end date.
- **An alternate timeline forked partway** keeps the event, with its chapters and reveals cut to the chapters it has.
- **Read models.** `deriveConnections` now has `in-thread` (event → thread) connections. `told-in` connections are worded by role ("Flashback in", "Foreshadowed in").

## Not in this step

- **On-screen editing** of the new fields belongs to the timeline event editor, Prompt 23. End and ongoing (Prompt 19) and how each chapter tells it (`reveals`, Prompt 20, see `two-orders.md`) are editable already. Planning status, canon status and plot threads are editable from Prompt 23 (`timeline-review.md`). The current editor only changes the fields it shows, so it leaves the new ones alone.
- **The Timeline page's ordering** (`resolveChronology`) still orders by start. Showing lengths and overlaps is Prompt 19.
- **Journeys** (`toLocationId`) come with travel routes in Prompt 40.
