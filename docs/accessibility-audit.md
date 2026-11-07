# Accessibility and responsive audit (Prompt 45)

**Written:** 2026-10-22.

**Code:**
- `e2e/a11y.mjs`: the audit, run with `npm run test:a11y` (`e2e/built.mjs` builds the app, serves the build on port 4173, runs it and stops the server).
- **Fixes:**
  - `viz/hooks.ts`: a drawing follows keyboard focus.
  - `viz/components/DetailPanel.tsx`: focus goes back to the selection when the details close.
  - `viz/components/Legend.tsx`: a double-line swatch, and letter codes.
  - `graph/components/KnowledgeMap.tsx`, `visualize/GraphView.tsx`: kinds of record get codes; relationships are drawn as a double line; Shift+arrow moves a record.
  - `relationships/components/RelationMap.tsx`, `visualize/VisualizePage.tsx`: custom relationships are drawn as a double line; Shift+arrow moves a character.
  - `timeline/components/TwoOrdersChart.tsx`: the legend's crossing lines.
  - `graph/GraphCanvas.tsx`: reduced motion.
  - `styles/global.css`: target sizes, room at the bottom of Visualize, the double line and codes, the Scene board's width.

**Tests:**
- `graph/typeCodes.test.ts`, 3 tests.
- The audit itself: 0 errors.
- The e2e suite: every existing check.

## What the project has to check with

The project has no accessibility linter or checker: no axe, no ESLint, no Lighthouse. Adding one would mean a new dependency, which was not asked for. The audit uses what is there:
- Playwright;
- **Chromium's own accessibility tree**, through the DevTools protocol. It is the same tree a screen reader is given.

## What the audit checks, automatically

**Visualize:** all 17 views, each drawn and as a list.

**The other pages that draw:**
- Story graph
- Relationships
- Timeline
- Scene board
- Dashboard
- Progress

**Sizes:**
- desktop 1280×800;
- tablet 820×1180;
- phone 390×844.

That is 120 pages, on a novel seeded with characters, factions, places, an item, chapters and scenes with words, plans, dated events, relationships, connections, a plot thread and a journey.

**Each page is an error when:**
- **It scrolls sideways.** The audit names what sticks out.
- **A control has no accessible name.** This covers buttons, links, text boxes, selects, checkboxes, radios, sliders and options, as Chromium exposes them.
- **An element has a positive tab index.**
- **Keyboard focus is stuck.** Tab is pressed 45 times through each drawn view, and focus keeps returning to one control.
- **Focus lands on something not shown.** This includes a mark outside the visible part of a drawing.
- **A control is covered** by something else (a floating button, a panel), once scrolled into view. Checked at tablet and phone sizes.

**Each page is a warning, for a person to judge, when:**
- **A pointer target is under 24×24 px** at tablet and phone sizes. A checkbox counts with its label; links inside running text are left out.
- **Two legend entries are told apart by colour alone:** the same swatch once colours are set aside, and no letter code.
- **A focused control shows no outline or ring** of its own. Some show focus another way, which a person checks.

**Once each:**
- **Dialogs:** Escape closes "Record a tie", "Record what happens to it" and "Record a journey", and focus returns to the button that opened each.
- **Details:** Escape closes the details of a selection (beside the view on desktop, as a sheet on a phone), and focus returns to the selection.
- **Zoomed in:** on the relationship map and the knowledge graph, the arrow keys keep the focused mark inside the visible part, and Shift+arrow moves it.
- **Reduced motion:** with it requested, nothing in any Visualize view animates or transitions, and the Story graph is drawn at rest. The audit also confirmed that, without the preference, the Story graph is still settling at 0.7 s, so this check is not trivially true.

## What it found, and what was fixed

| Found | Fix |
|---|---|
| After Escape closed the details panel, focus fell to the top of the page | Focus goes back to what was selected (the mark, or the name in a list), as the panel closes |
| A focused mark could be outside the visible part of a zoomed drawing | The drawing pans to keep a mark that takes focus in view |
| Moving a character or record on a map was by dragging only | **Shift+arrow** moves the focused one by a step. Said in the drawing's spoken help; "Put everyone back" undoes it as before. |
| Knowledge graph: characters, places, factions and items were all circles, and chapters and scenes both squares, told apart by colour | Kinds that share a shape carry a **letter code** in the node and in the legend (C, L, F, I…; more letters when two start alike). Each node's name now says its kind. |
| Knowledge graph: "Connections you recorded" and "Character relationships" were both solid lines | Relationships are drawn as a **double line** |
| Relationship map: "Custom" and "Other connections" were both thin lines | Custom relationships are drawn as a double line |
| Story vs reading order: the legend's "Lines that cross" had the same swatch as "Told here" | Its swatch is a crossing |
| Phone: the floating Tutorial button covered the last link of a view | Visualize has room below its last line on narrow screens |
| Tablet: the Scene board page scrolled sideways (854 px in 820) | The page's column fits; the board scrolls sideways inside itself, as meant |
| Names in lists, small buttons, segmented and chip buttons, labelled checkboxes, selects and inputs, empty-state links were 19–23 px high | At least 24 px inside Visualize |
| Story graph: the layout animated as it settled, whatever the reduced-motion setting | With reduced motion, it settles out of sight and is drawn at rest |

**Not errors, after checking:**
- **The "keyboard trap" on the relationship map's layer checkboxes** was the audit naming them all alike. They are a row of labelled checkboxes.
- **"Covered" controls in the knowledge graph and Relationships pages** were inside closed sections (Layers, the relationship types). The audit now skips what the browser does not render.

**Left as found (outside the visualizations, so not changed):**
- **The "Customize" link** in the workspace header is 19 px high.
- **The left panel's resize handle** shows focus by a change of colour, not a ring.

## Checked by hand

I checked these myself, by reading code and styles and by looking at screenshots. None of it is a substitute for testing with assistive technology.

- **Focus styles:** every mark that hides the browser's outline has its own visible `:focus-visible` style:
  - timeline marks
  - the relationship map's characters
  - the knowledge graph's records
  - plot lanes' cells and names
  - the knowledge matrix
  - progression bars
  - place-map pins
  - the faction map
  - ability-tree nodes
  - chart columns
  - the viewport's marks
- **Dialogs** are the browser's own `<dialog>`, opened modally, so Escape and the focus trap are the browser's.
- **Drag and drop:**

  | Where | Keyboard alternative |
  |---|---|
  | Drawings (pan) | arrow keys, + − 0, and zoom buttons |
  | Timeline | + − 0, jump to a date, a range |
  | Scene board | "earlier" and "later" buttons, and "Move to…" |
  | Knowledge graph, relationship map | Shift+arrow moves a node (new) |
  | Story graph canvas | none for pinning a node: a limitation; the list beside it reaches every node |
- **Colour alone:** besides the audit's legend check, I read how each view draws:
  - the timeline: a shape for each kind of date;
  - relationships: a line pattern for each group;
  - the knowledge graph: a shape for each kind of record, a code and a line pattern;
  - the plot lanes: a shape for each role;
  - the canon markers: glyphs;
  - the review: certainty in words;
  - charts: one series each.
- **Screens:** I looked at screenshots of the Charts, Continuity review and canon-marker views at desktop size while building them.

## Not checked

- **No screen reader** was run (NVDA, JAWS, VoiceOver, TalkBack). The names and roles are checked through Chromium's accessibility tree, which is what they read, but not how they are spoken.
- **No real phone or tablet.** Sizes were emulated, and touch was not used.
- **Not:**
  - Windows high-contrast (forced colours);
  - text zoomed to 200%;
  - the 320 px reflow width.
- **Text contrast** across every theme was not measured. Only the chart colour was, in Prompt 44.
- **The Story graph canvas** is one image to a screen reader, with a list beside it; its nodes cannot be moved by keyboard.
- **Pages outside visualization** were not audited (the editor, the Codex, settings), as asked.
