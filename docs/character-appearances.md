# The character appearance matrix (Prompt 31)

**Written:** 2026-10-22.

**Code:**
- `src/modules/characters/appearances.ts`: the matrix, read from records only (`appearanceMatrix`, `stateOf`, `evidenceWords`); pure
- `characters/components/AppearanceRecords.tsx`: the manual workflow, in each chapter's and scene's plan
- `manuscript/types.ts` and `manuscript/service.ts`: `appearIds` and `mentionIds` on a plan
- `visualize/AppearancesView.tsx`: the **Character appearances** view in Visualize (`/visualize/appearances`)
- `analytics/compute.ts`: the dashboard's wording (see below)

**Tests:**
- `characters/appearances.test.ts`, 9 tests
- "Character appearances" in the Visualize section of `e2e/smoke.mjs`: 20 checks

## What counts, and what never does

**Nothing is read from the manuscript text.** A cell shows only records.

**The cell's state comes from the author's own appearance record when there is one:**

| State | From | Drawn as |
|---|---|---|
| **Appears** | the author recorded the character as on the page in that chapter or scene | ● |
| **Mentioned** | the author recorded them as mentioned, not on the page | ◐ |
| **Other records** | no appearance record, but something else ties them there (see below) | ○ |
| **Not recorded** | nothing | blank |

**What "Other records" means.** Without an appearance record, a cell shows whatever else ties the character to that chapter, each said for what it is:
- **Linked in the text:** an entity link to them in the prose.
- **Listed under "Entities involved"** in the plan.
- **Takes part in an event told here.**

None of these is taken as an appearance; the author decides.

**A blank cell is not absence.** The view says so at the top ("A blank cell means nothing is recorded, not that the character is absent"), the legend says so, and so does a selected blank cell ("They may still be in the text").

**The dashboard.** It searches chapter text for names, and used to say a character "does not appear in any chapter". It now says they have "no appearance recorded in any chapter".

## Recording appearances (the manual workflow)

**In each chapter's or scene's plan** (the Organizer's details, or the manuscript's side panel), "Who appears here" has:
- **Appears:** characters on the page, with a menu to add one.
- **Mentioned, not on the page:** the same.
- **Linked in the text, with no record yet:** each character linked in the prose, with "Appears" and "Mentioned" buttons to record them. Nothing is recorded until the author clicks.

**Rules:**
- A character is in one list or the other, never both. Adding them to one takes them out of the other.
- Only this novel's characters can be recorded.

**From the matrix:** a selected cell offers **Record: appears here**, **Record: mentioned here** and **Remove my record**, written to that chapter's (or scene's) plan.

## The view

**Columns:**
- **Chapters,** in reading order. A chapter's cell gathers the records on it and on its scenes, and says where each is ("in “Talk”").
- **Scenes:** each scene a column, and a chapter with no scenes as itself. A chapter's own column appears beside its scenes when something is recorded on the chapter itself.

**Rows:**
- **Who is shown:** characters with anything recorded in the columns shown.
- **Hidden characters:** others are counted ("1 character with nothing recorded here not shown"), and **Show characters with nothing recorded here** brings them back.

**Filters** (in the page address, so a reload, Back or a shared link keeps them):

| Filter | Keeps |
|---|---|
| **Character** | the page's own "Involving character", and the search by name |
| **Chapter range** | from one chapter, to another, or both |
| **Plot thread** | the chapters and scenes where the thread is recorded (its beats, and the events that belong to it) |
| **Place** | the chapters and scenes where the place is in the plan, linked in the text, or is where an event they tell happens |
| **Status** | the chapters and scenes with that status |

Filters that leave no chapters say so, and offer to clear. A range with nothing recorded for anyone says that is not the same as nobody being there.

**Getting to an intersection:**
- **Keyboard:** the matrix is one stop in the tab order. The arrow keys move between cells, and Enter opens one.
- **What a cell holds:** each cell reads aloud what is recorded and where.
- **Returning to it:** the chosen cell is in the address (`acell`), so a reload or a shared link opens it again.
- **The opened intersection shows:** what is recorded, with a link to each event; links to open the chapter in the manuscript, the character, and the chapter's plan in the Organizer; and the record buttons.
- **Character names** select the character, opening their details.

**List:** each character with the chapters where they appear, are mentioned, have other records, and have nothing recorded.

**Saved views** keep the columns setting, the status and "show everyone". The chosen cell is not kept.

## Data

- **Where records live:** `appearIds` and `mentionIds` on chapter and scene plans, in existing rows, with no schema change. Plans saved before have neither.
- **Copies** point them at their own characters (tested).
- **Deleting a character** leaves its ids in plans, as the plan's "Entities involved" already does. The matrix shows only characters that exist.

## Limits

- **Recording from the matrix at chapter level** records on the chapter itself; its scenes keep their own records.
- **Point of view is not tracked.** "On stage" and "point of view" are not told apart, and there is no record type for it.
- **Very large casts** scroll, and the character column stays in place. There is no virtualisation; 40 characters by 60 chapters lays out well inside the test's one-second limit.
