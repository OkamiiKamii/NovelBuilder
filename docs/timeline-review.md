# The event editor and the timeline's review (Prompt 23)

**Written:** 2026-10-21.

**Code:**
- `src/modules/timeline/review.ts`: the review rules; pure, deterministic, reads only
- `timeline/pages/TimelineReviewPage.tsx`: **Timeline review** (`/project/:id/timeline/review`)
- `timeline/hooks.ts` (`useTimelineReview`)
- `timeline/components/EventDetails.tsx`: the editor (new fields, date checks, its findings)
- `visualize/VisualizePage.tsx` (`EventEditor`): editing from the drawn timeline
- `continuity/audit.ts`: one line, so timeline decisions are not listed as stale manuscript findings

**Tests:**
- `timeline/review.test.ts`, 9 tests
- "The event editor and the timeline's review" in the Visualize section of `e2e/smoke.mjs`, 11 checks

## The event editor

**Where it is:**
- the Timeline page, as before;
- now also the drawn timeline. In Visualize → Timeline, select an event, then **Edit this event here**.

It is one component in both places, saving through the one timeline service (`timeline.forProject(id).update`), which checks every field as it always has.

| Field | Notes |
|---|---|
| Name, date (exact, approximate, relative, undated), where | As before; months, days and hours are the novel's calendar's |
| How long: lasts, ends (on a date, at a time not given, still going on) | From Prompt 19 |
| Who takes part, with their age | Ages hinted as exact or as a range (Prompt 21) |
| Chapters and scenes, each with how it tells the event | From Prompt 20 |
| **Planning status** (Idea, Planned, Confirmed) | **New** on screen |
| **Canon status** (Canon, Provisional, Non-Canon, Retconned, Conflicting) | **New** on screen |
| **Plot threads** it belongs to | **New** on screen |
| Factions, items and lore; what it comes after; description | As before |

**Edits the calendar can't hold are explained, not saved.** A day the month doesn't have ("March has 31 days: day 40 was not saved."), an hour the day doesn't have, or a year that isn't a whole number. The service would drop such detail anyway; now the author is told, and the date stays as it was.

## The review

Each rule has a title, the rule in words, and what it needs. A finding is raised **only when the records hold what the rule needs**: no date, no place or no recorded travel time means no finding, never a guess. The same records give the same findings, with the same keys, every time (tested).

| Rule | Raised when | Needs |
|---|---|---|
| Ends before it starts | Its end date is wholly before its start | Both dates worked out |
| Dated before what it follows | Its date is before the event it is set to come after | Both dated |
| Dated from an event that is gone | A relative date's event was deleted | A relative date |
| Date not in the calendar | A month, day or hour the calendar doesn't have | A date with those parts |
| Ages that disagree | A stated age doesn't fit the date of birth and the other ages (Prompt 21) | Two age clues |
| Takes part before being born | The event is before their birth | A worked-out birth, a dated event |
| **Too little time to travel** | The **longest** time there can be between leaving one place and arriving at the next is less than the travel time recorded between them | Both events dated with a place, and a travel time recorded under Continuity → Tracked |
| **In two places at once** | The dates put both events **certainly** at the same time (Prompt 19), at two places neither inside the other ("Located in" links) | Both dated closely enough, each with a place |

**Rough dates never raise the last two.** "Some time in Year 10" and "some time in Year 11" could be months apart, so they're not too close. Two events "in Year 10" could be months apart, so they're not at once.

**Only the next stop is checked for travel.** A journey is checked between consecutive places in story order, so a character who stops somewhere on the way isn't counted twice.

**Every finding says what it rests on.** "'The council' (Year 10, March 4) is at Ashen Keep; 'The ride' (Year 10, March 5) is at The Docks, at most 2 days later. The travel time recorded between them is 5 days." It links to the records to open.

## What the author can do

| Action | What happens |
|---|---|
| **Resolve** | Fix the record (open the event, or the travel time). The finding is simply no longer raised. Nothing is fixed for the author |
| **Mark as intentional…** | Kept as a decision, with the reason ("A double or impostor", "Magic or a portal", "Time travel", or the author's own). The finding leaves the open list while the records stay the same |
| **Dismiss** | Kept as a decision, without a reason |
| **Reopen** | Removes the decision: the finding is raised again if it still applies |

**Where decisions are stored.** With the continuity decisions (`continuityResolutions`), under keys like `timeline|travel|<character>|<event>|<event>`, so they are copied, backed up, synced and remapped on copy like those. The Continuity page leaves them to the timeline review.

**No decision touches an event, a date, a place or canon** (tested: every timeline record is the same before and after deciding).

**Where findings show:**
- the Timeline page's header ("Review: 2 to look at");
- each event card's count of things to check;
- the event editor, with the event's own findings and a link to the rule.

## Limits

- **Travel needs a recorded travel time.** Without one, a journey is never judged too fast: the app doesn't know how far apart places are.
- **"In two places at once"** treats any two places as apart unless one is "Located in" the other. Neighbouring places with no link between them are pointed out. Mark those intentional, or record a travel time of 0 between them.
- **Ages** are checked at each event's start.
- **Planning and canon status** of an event are shown and edited, not used by this review. Canon status is checked by the record check's canon and continuity rules (Prompt 42, `docs/canon-overlays.md`), and its findings are marked on the views.
