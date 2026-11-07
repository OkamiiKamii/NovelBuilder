# The scene board (Prompt 28)

**Written:** 2026-10-21.

**Code:**
- `src/modules/manuscript/board.ts`: what the board shows (`boardOf`, `filterBoard`), where a drop lands (`dropOf`, `placeOf`, `samePlace`), which moves are asked about (`bulkOf`), and when undo is safe (`undoProblem`); pure
- `manuscript/pages/BoardPage.tsx`: the page, at `/project/:id/board`, **Scene board** in the sidebar, after the Organizer
- a lesson for it in `tutorial/topics.ts`

**Tests:**
- `manuscript/board.test.ts`, 10 tests, through the real manuscript service
- "The scene board" in the Visualize section of `e2e/smoke.mjs`: 25 checks

It complements the editor and the Organizer, and replaces neither.

## What it shows

- **A column for each chapter, and a card for each scene in it,** in reading order.
- **Grouped by part:** chapters that sit next to each other in the same volume, act or arc form a part, headed with its path ("Volume One › Act II").
  - A volume, act or arc between two chapters starts a new part, so the board never reorders the book to group it.
  - An empty act is shown as an empty part, so chapters can be moved into it.
- **On each card:** the title (a link that opens it in the manuscript), the status (changeable on the card), the words and the summary.
- **On each column's header:** the chapter's own card, with its words counting its scenes', and how many scenes it has.
- **Lanes or columns:** **Columns** puts chapters side by side and scrolls across. **Lanes** puts each chapter in a row, with its scenes flowing across. Lanes are the default on a narrow screen, and the choice is kept in the page address.
- **Filters:** by status, and by words in a title or summary. A chapter stays when it, or one of its scenes, matches.

**Nothing is copied.** A card is the chapter or scene itself, read live from the same records as the editor and the Organizer:
- a move on the board shows in the Organizer, even in another tab, and the other way round (tested);
- words written in the editor show on the card (tested).

## Moving

- **By drag and drop:**
  - Drop a scene on the top or bottom half of another scene card (left or right half, in lanes), or anywhere on a chapter to put it at the end.
  - Drag a chapter by its header onto another chapter, or onto the "end of this part" zone.
  - This uses the browser's own drag and drop, as the Organizer does; no new library.
- **Without a mouse:** every card has **earlier** and **later** buttons, and a **Move to…** menu (a scene to another chapter, a chapter into another volume, act or arc).
- **Through the manuscript's own `move`:** only a card's place (its parent and order) changes. Text, words, summaries, notes and ids stay as they were (tested). Moves the manuscript does not allow, like a scene outside a chapter or a chapter inside a scene, are not offered as drop targets.
- **A drop that changes nothing** does nothing, and adds nothing to undo.

## Undo

**The board keeps its last 20 changes** (moves and status changes). **Undo**, or Ctrl/⌘+Z when not typing in a field, takes back the latest.

**Undo only puts back what the board changed, and only while things are as the board left them.** If the card has been moved or its status changed since (in the Organizer, the editor, or another tab), or the place it came from has gone, undo says so and changes nothing (tested).

The history lasts while the board is open. The rest of the app has no undo for structure.

## Guards against accidental bulk changes

- **A chapter carrying scenes into another volume, act or arc is asked about first,** saying what goes with it ("Move Arrival and its 2 scenes (90 words) into “Act II”?"). Cancelling changes nothing. Moves within the same part are not asked about; undo covers them.
- **Moving is off while the board is filtered,** so nothing lands next to cards that are hidden. The board says so.
- **Read-only roles** see the board without moving or status controls.
- **There is no multi-select,** so one action moves one card (and, for a chapter, what is inside it).

## Limits

- **Drag and drop needs a mouse or pen,** as in the Organizer. On touch screens, the earlier/later buttons and "Move to…" do the same.
- **Undo history is lost on leaving the page.** Moves made in the Organizer are not undone from the board.
- **Volumes, acts and arcs** are not cards. They are moved and edited in the Organizer.
- **Long books:** columns scroll across. There is no virtualisation; a 60-chapter, 300-scene book lays out in well under the test's 500 ms limit.
