# Plot-thread lanes and subplot tracking (Prompt 29)

**Written:** 2026-10-21.

**Code:**
- `src/modules/plot/types.ts`:
  - beat roles: `BEAT_ROLES`, `roleOf`, `withThreadIds` for intersections;
  - the `custom` status, with `customStatus` and `statusName`.
- `plot/service.ts`: saves roles and crossings, checks them, and cleans them up when a thread is deleted. Copies re-point them.
- `plot/lanes.ts`: where each thread is recorded and how it reads across the chapters (`placesOf`, `threadLanes`, `threadsByNode`, gaps, ends); pure.
- `plot/components/ThreadLanes.tsx`: the lanes drawing.
- `visualize/PlotView.tsx`: the **Plot board** view in Visualize (`/visualize/plot`), now lanes, with a list.
- `plot/components/ThreadDetails.tsx`: a role for each beat, what an intersection crosses, the custom status name, and links to the lanes and the board.
- `manuscript/pages/BoardPage.tsx`: a thread filter on the scene board, thread chips on cards, and "Add to a thread".

**Tests:**
- `plot/lanes.test.ts`, 10 tests
- "Plot-thread lanes" in the Visualize section of `e2e/smoke.mjs`: 19 checks

## What the author records

Threads already had a title, category, status, characters, places, a target resolution and **beats**, each at a chapter or scene. Now:

**Each beat has a role:**

| Role | Meaning |
|---|---|
| **Introduction** | Where the thread starts. |
| **Development** | A step it takes. |
| **Intersection** | Where it crosses other threads, which the author names. |
| **Resolution** | Where it is resolved. |
| **Appears** | It is in this scene, with no development recorded. |

- A beat stored before roles existed reads as a development, as every beat was called then.
- **Only "Appears" needs no title.** No title is made up for it.

**Threads and scenes:**
- **A scene can be in any number of threads,** by having beats in each.
- **On the scene board,** "Add to a thread…" on a card records only that the thread appears there.

**Events:**
- **Events already belong to threads** (on the Timeline).
- An event shows on a thread's lane at each chapter or scene that tells it.

**Statuses:**
- **The built-in statuses** are Planned, Active, Paused, Resolved, Abandoned and Retconned.
- **Custom:** "Custom", with the author's own name for it (e.g. "Simmering"), shown by that name everywhere. Nothing is assumed about a custom status, so the existing "quiet thread" reminders do not apply to it.

## The lanes (Visualize → Plot board)

**The drawing:**
- **A lane per thread** (the page's filters narrow them), across the chapters in reading order.
- **Each mark is something recorded in that chapter** (in the chapter or one of its scenes), shaped by its role and named in the legend: ring for introduction, dot for development, diamond for intersection, square for resolution, small dot for appears, triangle for an event. A number says when a chapter holds more than one.
- **Neighbouring chapters** are joined by a solid line.
- **Gaps:** chapters in between with nothing recorded are crossed by a dashed line, labelled with how many.
  - Gaps are counted only between recorded chapters, never before the first or after the last.
  - They are said as facts ("Nothing recorded in Ch 6–8 (3 chapters)"), not judgements, and nothing is filled in.
- **An intersection** is a line from the beat to the lane of each thread it crosses. That chapter of the other lane reads "crossed by …".

**Moving around:**
- **Keyboard:** one stop in the tab order. Arrow keys move between cells; the first column is the thread's name. Enter shows a cell, or selects a thread.
- **A chosen cell** lists its chapters and scenes (to open in the manuscript, or select), each beat with its role, title and note, and its events.
- **A selected thread** shows its whole sequence:
  - "Introduced: Ch 1 · Resolved: Ch 8", or "not recorded" when the author has not recorded one;
  - each chapter with what is recorded there, and the gaps between;
  - beats with no chapter, and events told nowhere;
  - a link to its chapters and scenes on the scene board.

**List:** the same sequence for every thread, as text.

## From a thread to its scenes

- **On the scene board, "Show thread"** (or `?thread=` in the address, which the links use) shows only the chapters and scenes where the thread is recorded, by its beats or the events that belong to it, and says so.
- **Moving is off** while it is filtered, as with any filter.
- **Every card shows its threads** as chips ("The heist · develops", "Romance · 1 event"), each opening the thread.
- **Removing from a thread:** a chip can be taken off only when all it records is that the thread appears there. Anything with the author's words in it is edited on the Plot threads page.
- **Plot threads page:** each thread links to its lanes and to the scene board.

## Data

- **Where it is stored:** roles, crossings and the custom status name live inside each thread row, so there is no new table and no schema change. Older rows read as before.
- **Copies:** a copied novel's intersections name its own threads.
- **Deleting a thread** takes it out of other threads' intersections and events, and changes nothing else.

## Limits

- **Board actions are not undoable.** Adding to or taking off a thread from the board is not in the board's undo, which covers moves and status changes.
- **Chapters only.** Lanes are by chapter: scenes are shown within their chapter's cell, not as columns of their own.
- **Events only show if told.** Events are placed by the chapters and scenes that tell them. An event told nowhere is listed under its thread, not drawn.
- **Two different "gaps".** The existing "Worth a look" reminders on the Plot threads page (quiet threads, gaps over a set number of chapters) are unchanged and separate from the lanes' plain gap counts.
