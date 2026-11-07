# Visualization system: acceptance checklist

**Status:** criteria only; nothing here is built yet.
**Written:** 2026-10-21 (Prompt 4).
**Companion to:** [`visualization-plan.md`](visualization-plan.md). Prompt numbers (P#) and plan sections (§) refer to that file.
**Review:** Prompt 50 marks every item below as complete, partial, blocked or not implemented, with evidence (file and test).

**How each item is verified**
- **U**: Vitest unit test (`npm test`, node with `fake-indexeddb`). This tests pure logic or a service.
- **E**: a new section in `e2e/smoke.mjs` (Playwright against `npm run dev`).
- **M**: a manual check, recorded with the date, device size and result.

**Rules that apply to every item**
- A check counts as passed only if the command actually ran and passed.
- A visual view is accepted only if its list or table alternative is also accepted.

---

## 0. Baseline and regression (BL)

| ID | Observable behaviour | Success condition | By |
|---|---|---|---|
| BL-1 | Existing features keep working | `tsc --noEmit` reports 0 errors. Vitest passes, with at least 451 tests in 29 files at baseline. `vite build` succeeds. | U |
| BL-2 | Existing end-to-end behaviour is unchanged | `e2e/smoke.mjs` passes at least the checks that passed at baseline. The known baseline failures are listed in the Prompt 3 record. A new failure blocks acceptance. | E |
| BL-3 | Existing routes still open | Every route in `src/app/App.tsx` that existed at baseline still renders for its role | E |

## 1. Shared data (SD) — P5–P11

| ID | Observable behaviour | Success condition | By |
|---|---|---|---|
| SD-1 | Ids never change | Renaming a chapter, entry, event, thread or ability, and reordering chapters or scenes, leaves its `id` unchanged and every reference to it still resolving | U |
| SD-2 | One record, many views | The same character id appears in the timeline, relationship map, plot lanes and graph. Each view resolves it from `loreEntries`, and no new row of the character is created. | U, E |
| SD-3 | Typed, directional connections | A rival link from A to B and a friend link from B to A are stored as two statements. A's view shows "rival" and B's view shows "friend". The inverse never invents a label. | U |
| SD-4 | Unknown connection types are kept | A link whose `type` is `"blood-oath"` (not built in) survives save, reload, export and import, and is shown as written | U |
| SD-5 | No dangling endpoints after deletion | Deleting an entry removes or flags every connection to it. `resolveRef` returns `{ missing: true }` and never throws. | U |
| SD-6 | History is kept | Recording a new state (relationship, membership, ownership) keeps the earlier one. `historyOf` returns every state in order. | U |
| SD-7 | Missing time is reported as unknown | `validAt` returns `'unknown'` (never `false`) when an anchor has no date | U |
| SD-8 | Events keep both orders | An event dated Year 3 that is told in chapter 12 keeps its Year 3 placement whatever the chapter order is. Moving chapter 12 never changes the event's date. | U |
| SD-9 | Old data still loads | A project created at schema v25 opens after the upgrade with every record intact (counted per table before and after) | U |
| SD-10 | Round trip with nothing lost | Exporting to `.novel.json` and importing it reproduces every new table and field, with ids relinked. Row counts and field values match. | U |
| SD-11 | Newer files are refused, not truncated | A snapshot carrying collections this version does not know produces a visible warning. A file with `version` higher than supported is refused with a message. | U |
| SD-12 | Turning off a view keeps its data | Disabling a visualization or module, then re-enabling it, leaves every related row unchanged | U, E |

## 2. Chronology (CH) — P16–P23

| ID | Observable behaviour | Success condition | By |
|---|---|---|---|
| CH-1 | The list and the graphical timeline show the same events | For one set of filters, the event ids in the list equal the event ids on the axis | U, E |
| CH-2 | Undated events are shown, not invented | Undated events and relative events with no anchor appear in an "Unplaced" area and have no x-position on the axis | U, E |
| CH-3 | Approximate dates show as ranges | "Summer, Year 10" is drawn as a span covering that season. Its card says "approximate". | U |
| CH-4 | Scale changes don't move events | Two events keep their order and relative placement at every zoom level, from hours to centuries | U |
| CH-5 | Non-Gregorian calendars | A calendar with 10 months of 36 days places day 1 of month 10 before day 1 of the next year. The default calendar gives exactly the same minutes as today's `resolveChronology`. | U |
| CH-6 | Negative, ancient and far-future years | Years −10,000, 0 and 1,000,000 sort correctly and are labelled with their era | U |
| CH-7 | Tracks | One event linked to two characters appears on both character tracks and is still one record (one id, one edit updates both). Reordering tracks never changes chronology. | U, E |
| CH-8 | Overlap and duration | Two events at the same time are both visible on separate lanes, with no warning. Instant, span, ongoing and uncertain-boundary events have distinct shapes or labels, not colour alone. | U, E |
| CH-9 | Reading order compared with story order | In a nonlinear test fixture (a prologue set in Year 50, chapters 1–3 in Years 1–3, a flashback in chapter 4 to Year 0), the comparison view marks the prologue and the flashback as out of order. No chapter is reordered. | U, E |
| CH-10 | Ages | A character with a known age at an event gets the right age at a later dated event. Approximate dates give a range. With no age or birth recorded the result is "unknown". | U |
| CH-11 | What-if timelines are kept apart | Events in a what-if layer never appear in the main timeline unless that layer is selected. Comparing two layers lists the events added, replaced and removed. Nothing is merged automatically. | U, E |
| CH-12 | Edits go to the shared record | Editing an event's date on the timeline updates the same `timelineEvents` row the Timeline page and the graph read | E |

## 3. Relationship history (RH) — P24–P27

| ID | Observable behaviour | Success condition | By |
|---|---|---|---|
| RH-1 | Configurable types | The author adds a custom type, uses it, renames it, and existing relationships of that type keep it | U, E |
| RH-2 | Optional attributes | Trust, fear and similar attributes appear only once the author turns them on. Turning them off hides them without deleting their values. | U |
| RH-3 | Changes keep the past | Adding a new stage leaves the previous stage readable. "As of" chapter 5 and "as of" chapter 20 show different states for the same pair. | U, E |
| RH-4 | Causes are only what the author recorded | A stage shows a cause only when the author linked an event or scene. Otherwise the cause field is blank, never inferred. | U |
| RH-5 | Interactive map | Zoom, pan, drag-to-pin, select a node, open an edge's details, and focus on a character all work. Direction is shown by arrows and labels. | E |
| RH-6 | Map filters | Filtering by type, current vs historical, chapter range, faction and character changes the visible edges. The same filter applied to the table gives the same set. | U, E |
| RH-7 | Knowledge states | One secret can hold knows, suspects, unaware and falsely-believes for different characters. A change of state records when it happened and keeps the earlier state. | U |
| RH-8 | No inferred contradictions | An inconsistency in what a character knows is reported only when an explicit rule plus records establish it. A test with incomplete data produces no warning. | U |

## 4. Plot threads and boards (PT) — P28–P31

| ID | Observable behaviour | Success condition | By |
|---|---|---|---|
| PT-1 | The chapter and scene board changes the real order | Moving a card on the board changes `StoryNode.parentId` and `order` through `manuscript.move`. The Organizer outline and the editor's contents list show the new order straight away. | E |
| PT-2 | Moves without dragging | Every move can be done with the keyboard or a menu. Pressing Ctrl/Cmd+Z after a move restores the previous order. | E |
| PT-3 | Guard against bulk changes | Moving several cards at once asks for confirmation first | E |
| PT-4 | Thread lanes | Each thread shows its beats in reading order across chapters. Beats with no chapter appear as "Unplaced". | U |
| PT-5 | Gaps are information, not judgement | A gap reads "no beat recorded in chapters 4–9". It never says "missing beat" and never creates a beat. | U |
| PT-6 | Structure and pacing | Word-count and label charts come from stored counts and labels only. An empty manuscript shows an empty state, not zeros dressed up as data. | U, E |
| PT-7 | Appearance matrix | Each cell shows "present" (plan `entityIds`), "mentioned" (in-text `mentions`) or blank (unknown). There is never an "absent" value. Clicking a cell opens that chapter. | U, E |

## 5. Graph navigation (GN) — P15, P32–P34

| ID | Observable behaviour | Success condition | By |
|---|---|---|---|
| GN-1 | Cross-view selection | Selecting an event shows its participants, chapters, location and threads in the detail panel. Selecting a character in the graph opens its profile. The browser back button returns to the previous view. | E |
| GN-2 | Deleted references | A saved view or link pointing at a deleted record shows "This record was deleted" and does not crash | U, E |
| GN-3 | Focus and depth | "Focus" plus a depth of 1 or 2 shows exactly that neighbourhood | U |
| GN-4 | Path between two records | For two records with a known path, the shortest path's nodes are highlighted. When no path exists, it says so. | U |
| GN-5 | Partial views are labelled | When limits or clustering hide records, a visible "Showing N of M" is displayed, with a way to restore the full view | U, E |
| GN-6 | Integrity | Dangling references, entries with duplicate-looking names and unresolved in-text links are each listed with the reason. A merge happens only after explicit confirmation, and afterwards every reference in every table points at the kept record. | U |
| GN-7 | Positions persist | Pinned graph and map positions survive a reload | E |

## 6. Custom entity types (CT) — P35–P36

| ID | Observable behaviour | Success condition | By |
|---|---|---|---|
| CT-1 | Define a type | The author creates a type (for example "Spell") with text, number, date, toggle, select, multi-select and reference fields. Its entries can be linked, searched and exported. | U, E |
| CT-2 | Validation | A required field left empty, or a number outside its limits, shows a message on that field, and the stored text value is never destroyed | U |
| CT-3 | Explicit mapping to views | A type appears on the timeline only when the author maps a date field to it. Nothing is guessed from field names. | U |
| CT-4 | Partly mapped types are explained | A type missing a field a view needs says which field is missing and offers the table view instead | U, E |
| CT-5 | Custom fields survive | Custom fields and values survive export, import and later schema changes | U |

## 7. Character progression (CP) — P37–P38

| ID | Observable behaviour | Success condition | By |
|---|---|---|---|
| CP-1 | Characters with no progression | A character with no sheets or snapshots shows an empty state and raises no errors or warnings | U, E |
| CP-2 | Changes over time | A change anchored to an event or a chapter shows the right state before and after that point | U |
| CP-3 | Genre-neutral | A project with no levels or combat statistics (for example, a romance tracking titles only) uses progression without any numeric fields | U |
| CP-4 | Ability trees with typed edges | Prerequisite, upgrade, evolution, fusion, replacement, mutually-exclusive and custom edges each have their own style and label. Nothing is assumed to be a prerequisite. | U, E |
| CP-5 | Cycles and invalid edges | A cycle (A needs B, B needs A) and an edge to a missing item are each reported. The tree still renders. | U |
| CP-6 | Holders and acquisition | An ability's panel lists the character sheets that hold it, and the event or chapter where each acquired it when recorded | U |

## 8. World maps and places (WM) — P39–P41

| ID | Observable behaviour | Success condition | By |
|---|---|---|---|
| WM-1 | The places explorer works without maps | A nested hierarchy (for example planet → continent → city → building, through `located-in` links) appears as a tree with no map present | U, E |
| WM-2 | Missing coordinates | Places with no pin stay listed under "Not on any map" and can be used everywhere else | U, E |
| WM-3 | Author-provided maps only | Uploading an image creates a map. No online map provider, geocoding or upload is involved (verified by checking network requests in the e2e run). | E |
| WM-4 | Pins | Pins are placed by click or tap, and also by keyboard (arrows). Positions are stored as fractions of the image (0–1), so re-uploading the image at another size keeps them in place. | U, E |
| WM-5 | Journeys | A journey with departure and arrival shows on the map when both ends are pinned, and as a route list otherwise | U, E |
| WM-6 | Travel warnings only from configured rules | A conflict is flagged only when the author has recorded a travel time between the two places. With no rule, no warning appears. | U |
| WM-7 | Membership and ownership over time | An item stolen in Year 5 shows its previous owner before and its new owner after. Ownership with no known holder shows "unknown". What-if layers keep their own ownership. | U |

## 9. Saved views (SV) — P14

| ID | Observable behaviour | Success condition | By |
|---|---|---|---|
| SV-1 | Save and restore | A saved view brings back its type, filters, layers, scale, time range, track order and name after a reload | U, E |
| SV-2 | References, not copies | A saved view stores ids and settings only. Renaming a character changes the name shown in the saved view. | U |
| SV-3 | Rename, duplicate, delete, default | Each action works, and "Restore default" resets without deleting the author's other views | U, E |
| SV-4 | Missing records | A view referring to a deleted record opens, skips it, and says so | U |

## 10. Filtering (FL) — P10

| ID | Observable behaviour | Success condition | By |
|---|---|---|---|
| FL-1 | Filters combine predictably | Character AND location AND time range returns exactly the records matching all three. The order filters are applied in does not change the result. | U |
| FL-2 | Exclusions are explained | When records are left out for missing data (no date, no location), the view shows a count and the reason, for example "4 undated events not shown". | U, E |
| FL-3 | Empty results | A filter with no matches shows a "No results" state, with a way to clear the filters | E |
| FL-4 | Filters are in the URL | Reloading or sharing the URL restores the same filters | E |

## 11. Accessibility (AX) — P45

| ID | Observable behaviour | Success condition | By |
|---|---|---|---|
| AX-1 | Every view has an alternative | Every visual view has a list or table showing the same records. The e2e test compares their ids. | E |
| AX-2 | Keyboard only | Every view can be reached and used without a mouse, including selecting nodes and events, opening details, moving cards and placing pins. Checked by an e2e run using only `keyboard.press`. | E |
| AX-3 | Not colour alone | Relationship type, affinity, canon state and warning severity each have a text or shape cue as well as colour | M, E |
| AX-4 | Labels and focus | Interactive marks have an accessible name and a visible focus ring. Dialogs close with Esc and return focus to where it was. | E |
| AX-5 | Reduced motion | With `prefers-reduced-motion: reduce`, layout animation is off and the force layout settles before it is first drawn | E |

## 12. Responsiveness (RS) — P45

| ID | Observable behaviour | Success condition | By |
|---|---|---|---|
| RS-1 | Phone width | At 390×780, every view has no horizontal page scroll (`scrollWidth <= innerWidth`) and its main controls stay reachable | E |
| RS-2 | Panels don't hide content | Below 1100px, the detail panel opens as a sheet (`Modal`) and closing it gives the full view back | E |
| RS-3 | Touch | Pan, pinch-zoom and drag work under touch emulation. Touch targets are at least 44px, as in the existing Phase 28 checks. | E |
| RS-4 | Tablet and desktop | At 1100×800 and 1280×800, the view and its detail panel both fit side by side | E |

## 13. Performance (PF) — P47

Limits measured in Vitest on the development machine, in the same style as the existing checks (`graph.test.ts` < 400 ms, `diff.test.ts` < 500 ms).

| ID | Observable behaviour | Success condition | By |
|---|---|---|---|
| PF-1 | The query layer scales | `select()` over 5,000 events, 1,000 entries and 10,000 connections with three filters takes < 300 ms | U |
| PF-2 | The timeline layout scales | Lane packing for 2,000 events takes < 300 ms | U |
| PF-3 | The graph scales | `connectionsOf` + `buildGraph` for 1,000 nodes stays < 400 ms (the existing limit) | U |
| PF-4 | Interaction stays responsive | With the large fixture, changing a filter updates the view within 1 s and the selection is kept (manual timing, before and after numbers recorded) | M |
| PF-5 | Results are never stale | After an edit, every open view shows the new value without a reload (live queries) | E |

## 14. Exports (EX) — P46

| ID | Observable behaviour | Success condition | By |
|---|---|---|---|
| EX-1 | Table data | Every view with a table exports CSV with a header row. Non-English text (for example "Ærø", "東京") and commas or quotes in names survive a parse back. | U |
| EX-2 | Images and print | Graph and map views export SVG or PNG, including title, legend, active filters and a timestamp. The print layout fits the page with no cut-off controls. | E, M |
| EX-3 | Private data | Secrets and private notes are left out of view exports unless the author ticks to include them | U |
| EX-4 | Empty and huge views | Exporting an empty view gives a valid file with headers only. A 1,000-node view exports without crashing. | U, E |
| EX-5 | Offline | Exports work with the network turned off | E |
| EX-6 | Exports are not backups | View exports say they are not a backup and point to "Export project" for that | M |

## 15. Continuity warnings (CW) — P23, P42–P43

| ID | Observable behaviour | Success condition | By |
|---|---|---|---|
| CW-1 | Every warning explains itself | Each warning names its rule, the records involved (as links) and the values that triggered it | U, E |
| CW-2 | Only from data that exists | Each check has a test with incomplete data that shows it produces **no** warning | U |
| CW-3 | Deterministic | The same data always gives the same warnings, in the same order | U |
| CW-4 | Author decisions persist | Marking a warning resolved, intentional, ignored or needing review, with a note, survives a reload. Removing the decision brings the warning back. | U, E |
| CW-5 | Errors kept apart from possibilities | A broken explicit rule is labelled as a data error. A possible inconsistency is labelled as possible. Each can be filtered on its own. | U |
| CW-6 | Never changes anything | Running every check, and every decision about a warning, leaves `chapterContents`, `canonFacts` and all record tables unchanged (row-by-row comparison before and after) | U |
| CW-7 | Canon markers | Events, graph nodes, relationship edges and plot cards show their canon status using the existing `CANON_STATUSES` names, each with a text label | E |

---

## Out of scope

These are not built, and any item that would need them fails acceptance:

- **AI analysis of any kind.** No model calls, no generated text, ideas or plot. No AI-driven continuity, knowledge, motivation or relationship inference. New code imports nothing from `src/modules/assistant/`. Verified by searching the source for imports and by checking network requests in e2e.
- **Automatic rewriting.** No view, check or export changes manuscript text (`chapterContents`, `chapterBranches`, `chapterRevisions`) or chapter plans. Verified by CW-6.
- **Automatic canon changes.** No check sets `canonFacts`, canon statuses or what-if layers on its own; every change is an explicit action by the author. Branches and layers are never merged automatically.
- **Unrelated redesigns.** Screens outside the visualization system keep their layout and behaviour (BL-2, BL-3). Shared CSS changes are limited to new `viz`/`visualize` sections and the colour fix for affinity.
- **New services or transmission.** No cloud service, map provider, geocoding, analytics or telemetry. The existing optional sync relay is unchanged.
- **Fabricated data.** No demo content in production projects. A QA sample novel (optional Prompt C) is only ever imported on purpose and is clearly labelled.
