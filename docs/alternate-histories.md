# Alternate histories (Prompt 22)

**Written:** 2026-10-21.

**Code:**
- `src/modules/timeline/histories.ts`: the history, resolving its events, comparing timelines; pure
- `timeline/historyService.ts`: making and editing histories; registered with the project
- `timeline/pages/HistoriesPage.tsx`: **Alternate histories** (`/project/:id/histories`)
- the **Timeline shown** choice in Visualize → Timeline
- schema **v29**: table `alternateHistories`

**Tests:**
- `timeline/histories.test.ts`, 9 tests on isolation and comparison
- "Alternate histories" in the Visualize section of `e2e/smoke.mjs`, 16 checks

## Two kinds of branch

| | Story branches (existing, `/branches`) | Alternate histories (new, `/histories`) |
|---|---|---|
| What it is | A whole copy of the novel, forked after a chapter, to write the book differently | Another course of events in the story's timeline |
| What it holds | Everything: its own chapters, codex, events | Only its differences from the timeline it branches from |
| For | Alternate drafts and endings of the manuscript | Alternate histories, what-ifs, changed futures, time-travel branches |

Each page points to the other.

## What a history holds

| Part | Meaning |
|---|---|
| `changed` | Base events that go differently here, by id, with **only the fields that differ** (name, date, end, length, still going on, importance, place, who takes part, what is involved, what it follows) |
| `removed` | Base events that do not happen here |
| `added` | Events that happen only here. They are kept **inside the history record**, never in the main timeline's table |
| `baseId` | What it branches from: the main timeline, or another history |
| `originEventId` | Where it departs, or across the whole timeline |
| `causeEventId` | For a time-travel branch: the event that causes it, often later than where it lands |
| `kind` | Alternate history, What if, Changed future, Time-travel branch |
| `status` | Its canon status: Alternate Canon, Non-Canon, Experimental, Abandoned. "Main Canon" belongs only to the main timeline |

**Every other event is the base's own record, read through.** It is the same object, not a copy (tested), so editing it in the main timeline shows in every history that leaves it unchanged.

**A history based on another inherits that one's differences and adds its own.** Deleting a history moves those based on it onto its base, keeping their own differences.

**Changes are trimmed to what differs.** The change form sends every field, and fields equal to the base are dropped, so a history never holds a needless difference. Rows written before a field existed read as its default, so an old event isn't "changed" for lacking "still going on" (tested).

**Ids are checked.** A place must be a place in this novel, people must be characters, and dates are checked against the novel's calendar.

## Kept apart from canon

- **The main timeline is the novel's canon.** No history operation writes to `timelineEvents`. Tests compare every main-timeline row before and after making, changing, comparing, re-statusing and deleting histories, in both the unit tests and the browser.
- **The main model, and every view of it, never sees a history's events.** A history appears only where it is chosen, and says so: "Showing the alternate history 'If the Keep held' (Non-Canon), not the main timeline. The main timeline and its events are unchanged."
- **Nothing merges or changes canon by itself.** There is no merge; a history's canon status changes only when the author changes it.
- **Changes whose base event is gone.** A change to an event later deleted from the base isn't applied. It's listed ("1 change points at events no longer in …"), and the author may forget it.
- **Changes before where the history departs** are pointed out, not refused. A time-travel branch may mean exactly that.

## Showing a history

**On the Alternate histories page:**
- **The list:** each history with its canon status, kind, origin ("Branches from the main timeline at 'The long siege' (Year 10).") and differences ("1 changed · 1 not happening · 1 only here").
- **A history:**
  - its canon status in words ("Not canon. The main timeline is the novel's canon and stays as it is.");
  - for time travel, the cause ("…which comes later in story time than where this history departs: the change reaches back");
  - its events in its own story order, each marked "Changed here: date, place" or "Only in this history", with Change / Restore / Does not happen here / Delete;
  - the events that don't happen, each with Restore;
  - adding an event only there.
- **Compare:** any two timelines, by default a history against its base.
  - **In a sentence:** "3 events differ: 1 changed, 1 only in 'If the Keep held', 1 only in The main timeline."
  - **As a table:** each event's date in each timeline, and what differs. An event can be changed (which fields), moved (unchanged itself, but dated from one that changed), or only in one of them.
  - **Comparing changes nothing.**

**In Visualize → Timeline,** **Timeline shown** draws a history instead of the main timeline, with the notice above:
- adding events is turned off there;
- an event's details open in its alternate history.

## Copies, backups, sync

**Registered with the project.** Histories are backed up, duplicated, imported, forked and deleted with the novel. On copy every id inside them is rewritten: base, origin, cause, the changed events' ids and the ids inside each change, the removed events, and the added events with their places, people and anchors. Tested on duplicate.

**Sync:** with the story's lore, labelled "An alternate history".

## Limits

- **Only events differ.** Places, characters and relationships are shared with the main novel; a history can't give a place another name.
- **The change form edits name, date, place, "still going on" and what happens.** Who takes part, the length and the end can be set through the service, but have no form here yet. The event editor is Prompt 23.
- **Saved views don't remember** which timeline is shown.
- **Drawn comparison.** A history is drawn on its own; the comparison of two is a table, not two drawings side by side.
