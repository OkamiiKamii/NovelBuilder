# Visualization kit (Prompt 12)

**Written:** 2026-10-21.
**Code:** `src/modules/viz/`
**Tests:** `viz/viz.test.ts`, 11 tests
**Styles:** "Visualization kit" section at the end of `src/styles/global.css`

## No new libraries

The app already draws its visuals itself, in SVG and canvas, and has one layout library, `d3-force` (used by the Story graph). Nothing in this kit needs more:
- zooming, panning and fitting are a few lines of arithmetic;
- the components are plain React over the app's existing styles.

`d3-force` stays available for the views that need a force layout (relationship map, knowledge graph). Nothing was installed.

## Logic (plain TypeScript, unit-tested)

| File | What it does |
|---|---|
| `zoom.ts` | `View` (screen = world × k + offset). Zoom about a point (the cursor stays over the same spot), pan, fit to bounds with padding, two-finger pinch, scale limits (0.1–4). Also the keyboard commands: `+`/`=` zoom in, `-`/`_` zoom out, `0` fit, arrows pan. |
| `focus.ts` | Moving the keyboard focus between marks: through a list (no wrapping; Home and End), through a grid (rows and columns), and on a free-form drawing, to the **nearest mark in the arrow's direction** within 45°. A mark straight ahead beats a nearer one off to the side. Also toggling a selection. |
| `notice.ts` | What a view says about records a filter couldn't decide on, one counted line per reason ("3 events not shown: no date that can be worked out."), and "Showing 40 of 1,200" when only part is shown. |
| `params.ts` | Filters, the selected record (`?select=entry:<id>`) and visual or list (`?as=list`) in the page address. Reloading, Back and shared links restore the view. Whatever can't be read in an old or hand-edited address is ignored, never an error, and the view's other parameters are left alone. |

So that the notices read well for one or many, the query layer's reasons (Prompt 10) were reworded as noun phrases ("no date that can be worked out" rather than "has no date…"). `query.ts`, its tests and `query.md` were updated to match.

## React pieces

| Component / hook | Use | Accessibility |
|---|---|---|
| `useAddress()` | Reading and setting address parameters. Each change is built on the address **as it is at that moment** (fixed in Prompt 16), so quick changes in a row all stay. Filters replace the history entry; a selection can add one (`{ push: true }`), so Back returns to it. This is the shared form of the `setParam` helper the Relationships, Timeline and Plot pages each copy. | none |
| `useSize()` | An element's laid-out size, following window and panel changes (`ResizeObserver`) | none |
| `useZoomPan(bounds)` | Drag the background (mouse, pen, one finger) to pan; pinch with two fingers; wheel to zoom at the cursor (a non-passive listener, so the page doesn't scroll instead); keys on the focused drawing. Fits on first show, and again when its space changes (a panel opening, the window resized) unless the author has moved or zoomed it since (Optional Prompt A). Pressing on a mark (`data-mark`) selects rather than pans. | Keys act only while the drawing itself has focus; a focused mark keeps the arrows for moving between marks |
| `Viewport` | An SVG drawing using the above, with `ZoomControls` over it. The SVG is taken out of the layout flow, so the drawing follows its column (Optional Prompt A) | One tab stop; `role="group"`, `aria-roledescription="zoomable drawing"`, a label, and the keys described in hidden text (`aria-describedby`) |
| `ViewHeader` | Title, what the view is drawn from, "Showing N of M", actions | The count is a `status` |
| `FilterBar`, `FilterChip` | The row of filters, with "Clear filters (n)"; an on/off filter as a chip | `role="search"` with a label; chips are real checkboxes |
| `ZoomControls` | +, −, Fit, and the scale | Real buttons named for what they zoom; the scale is read out when it changes (`aria-live`) |
| `Legend` | What marks mean: a **shape and a name** for each, never colour alone (circle, square, diamond, line, dashed, arrow…). Under the drawing, under its title; folds away, and starts folded on a phone (Optional Prompt A) | Swatches hidden from screen readers; the names are text |
| `DetailPanel`, `VizLayout` | Details beside the view on a wide screen, as a sheet (`Modal`) below 1100px, the same pattern as the Relationships and Timeline pages (`.rel-body`, `.rel-drawer`) | Escape closes it; focus moves to its heading when it opens beside the view |
| `ArrowMarker` | The one arrowhead, as tall as the drawing's labels, in the line's colour (Optional Prompt A) | Hidden with its drawing |
| `VizState` | Loading, error ("Nothing has been changed"), empty because nothing has been recorded, no results (with "Clear filters"); under a drawn view, the lines of what is not shown | `status` / `alert` roles |
| `ViewSwitch` | Drawn or list, with the drawn form named ("Map", "Board") | Toggle buttons with `aria-pressed` |

**Styles** follow the views' design system (`viz-design-system.md`, Optional Prompt A): shared spacing, sizes, lines, a validated palette and one look for selected, focused and dimmed marks. They use the app's variables (`--surface`, `--border`, `--accent`…), so light, dark and the author's accent colour all apply. Focus rings follow the app's `:focus-visible` rule. At phone width the zoom controls move to the bottom and filters wrap to full width. A `.visually-hidden` class was added for text meant only for screen readers.

## What this step does not do

- **No screen uses the kit yet.** The Visualize hub (Prompt 13) is its first user, and that is where its behaviour in a real browser (keyboard, zoom, phone width) gets end-to-end checks. Until then, the components are typechecked and their logic is unit-tested, not exercised in a browser.
- **The existing maps were not moved onto it.** These are the Relationships network, the character profile's map and the Story graph. They keep their own zoom code and colours until they are rebuilt (Prompt 26 for relationships, Prompt 32 for the graph). The Story graph's relationship colours still disagree slightly with the CSS ones; that is fixed when the graph moves over.
