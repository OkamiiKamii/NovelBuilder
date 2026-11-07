# Your dashboard (Optional Prompt B)

**Written:** 2026-10-22.

**Where it lives:**
- `src/modules/dashboard/`:
  - `layout.ts`: the widget kinds, their settings, the layout operations and where the layout is kept;
  - `widgets.ts`: what each widget shows, worked out from the shared model (pure, tested);
  - `WidgetBodies.tsx`: each widget's contents and its settings form;
  - `DashboardBoard.tsx`: the board (placing, arranging, settings, removing).
- `src/modules/analytics/pages/DashboardPage.tsx`: the board sits at the top of the Dashboard page. The report below it is unchanged.
- `src/modules/sync/account.ts`: the layout is one of the personal settings that sync carries.

## What the author can do

On a novel's **Dashboard** page, under **Your dashboard**:

- **Place** a widget: **Customize**, then **Add a widget** (on an empty dashboard, **Add a widget** at once). Choose a kind, choose where (at the end, at the start, or after a widget already there), then **Add widget**. The choice stays open for adding more, and closes with the same button. While arranging, it is open only when asked for, so on a phone it does not push the widgets out of sight.
- **Resize** it: width (a third, two thirds, full width) and height (short, medium, tall). A widget's contents scroll inside it once they pass its height.
- **Reorder** it: **↑ Earlier** and **↓ Later**, from the keyboard or by pointer, or drag it by its handle (⠿).
- **Set it up**: **Settings** opens the widget's own settings, and each change takes effect at once. Every widget can also have its own title.
- **Remove** it: **Remove**, with **Undo** beside the message that says so.
- **Done** puts the arranging controls away.

A screen reader hears each change ("Moved “Plot threads” to position 1 of 7."). Focus stays on the widget's controls after a move and goes to **Undo** after a removal.

## The seven kinds

| Widget | What it shows | Settings |
|---|---|---|
| Upcoming events | **Reading order:** events told in chapters or scenes with no words yet, where the reader will meet them, flashbacks included. **Story order:** events later in story time than the latest event a written chapter tells as it happens. A flash-forward or a foreshadowing does not move that point. | Reading or story order; a plot thread; a character; how many |
| Plot threads | Each thread with the status the author gave it, how many developments it has, and where the latest is placed; a count of each status. | Statuses to list; order (by status, by title, most recently changed); how many |
| Recently changed | Chapters, scenes and parts, codex entries, events, plot threads and relationships, by the time each last saved. | Kinds of record; how many |
| Words per chapter | Words per chapter (with its scenes) or per scene, as the editor counts them. Each is a bar with its number beside it. | Chapters or scenes; reading order, longest or shortest; the whole book or one volume, act or arc; how many |
| Character appearances | One character's chapters (appears, mentioned, other records, nothing recorded), as a strip with a key and in words; or the characters who appear most. | A character, or "the ones who appear most"; how many |
| Warnings to look at | The warnings no decision has been made on yet (or marked to review), from every check the Review page runs, most serious and most certain first; a count by severity. Each opens the Review page searched for its title, where it is decided on. | Severities; how many |
| Saved views | The saved visualizations, by name. Each opens its view exactly as its own Saved views bar would, and says how many of the records it names are gone. | One kind of view or all; how many |

## Nothing made up

- **Every number and name is read from the novel's records** each time the widget is drawn. Each uses the function the rest of the app uses:
  - the editor's word counts;
  - the shared event records, which keep story order and reading order apart;
  - the appearance matrix;
  - the Review page's warnings and decisions;
  - the saved views.
- **A new dashboard is empty.** It says so and offers **Add a widget**, or **Start with four widgets** (upcoming events, plot threads, words per chapter, warnings to look at). Those four show this novel's own records, or say there are none yet. No example content is shown, anywhere.
- **No widget estimates, scores or judges.** A chapter with no words is "no words yet", not "short". A chapter with no appearance recorded is "not recorded", never "absent".
- **Each widget has its own states:**
  - **Loading:** "Reading your records…", "Running the checks…".
  - **Empty:** for example "No events on the timeline yet.", with a link to where they are made.
  - **No results:** for example "No event matches the thread and character chosen.".
  - **A record it follows has been deleted:** "The character this widget follows no longer exists. Choose another in its settings."
  - **Error:** one widget failing to draw shows that in its place. The rest of the dashboard, and every record, are untouched.

## Where the layout is kept

- **In this browser,** under `novel-builder:dashboard:<novel id>`. It is a personal setting, like the workspace layout:
  - one per novel;
  - it travels with the person's other settings when they sync;
  - it is not shared with a team.
- **It holds only each widget's id, kind, size, title and settings.** The settings name records by their stable ids. The stored text contains no names, titles, text or counts (tested). Renaming a record changes what the widget shows and leaves the layout untouched.
- **No database table and no migration:** the database stays at version 34. Arranging, setting up and reading the dashboard writes nothing to the novel. This is tested by comparing every table's rows for the novel before and after.
- **When the browser will not keep it** (storage full or turned off), the arrangement lasts for the visit and the page says so. A stored layout that cannot be read shows an empty dashboard; the stored text is left as it was until the author arranges again.
- **A widget from a newer version** of the app is kept as it is, says this version cannot show it, and can be removed.

## Checks

- **Unit tests,** `dashboard/dashboard.test.ts`, 26 tests:
  - the layout operations;
  - reading damaged or foreign layouts;
  - each setting's defaults and limits;
  - storage that fails, is corrupt or is changed by another tab;
  - registration for sync;
  - each widget's figures on a real novel, both orders for upcoming events;
  - a new novel showing nothing in any widget;
  - a layout holding ids, never copies.
- **Browser checks,** `e2e/smoke.mjs`, "Your dashboard (Optional Prompt B)", 29 checks on the Phase 26 novel:
  - placing all seven kinds;
  - each one's figures against the novel's own records: the editor's word counts, the Review page's count of warnings to look at;
  - settings, resizing, keyboard and drag reordering;
  - removing and undoing;
  - surviving a reload;
  - the stored text;
  - nothing written to the novel;
  - a renamed and a deleted record;
  - damaged storage;
  - the phone layout.
- **Accessibility audit,** `e2e/a11y.mjs`, at desktop, tablet and phone, with every kind on the board, read and while arranging:
  - named controls;
  - no sideways scroll;
  - 44px controls at tablet and phone sizes, with no words running past them;
  - nothing covered;
  - a keyboard walk with no traps.
- **Links check,** `e2e/links.mjs`: every kind of widget is placed on the test novel's dashboard, and every link they make is followed. None is broken.

**Results on 2026-10-22:**
- unit 892/892;
- e2e 1591/1591;
- audit: 126 page states, 0 errors;
- links: 231 followed, 0 broken, 0 requests to other hosts.

## Limits

- **The layout belongs to one browser profile** (and the person's synced devices). Exporting a novel does not include it. A restored, copied or forked novel is a new novel with an empty dashboard.
- **Each warnings widget runs the review's checks while the page is open,** the manuscript check included, as the Review page does. Two warnings widgets run them twice.
- **Dragging works with a mouse.** On touch screens, use **↑ Earlier** and **↓ Later**.
- **Sizes are three widths and three heights,** not free-form. Widgets flow in their order, so the order on screen is the order a keyboard and a screen reader meet them in.
