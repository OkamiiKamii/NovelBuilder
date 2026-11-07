# The views' design system (Optional Prompt A)

**Written:** 2026-10-22.

**Where it lives:**
- `src/styles/global.css`:
  - "The views' design system", at the start of the visualization styles: the values;
  - "Marks: one look in every drawing", near the end;
  - "The Visualize frame", at the end.
- `src/modules/viz/`:
  - `breakpoints.ts`: the two widths where the layout changes;
  - `components/Arrow.tsx`: the one arrowhead;
  - `components/Legend.tsx`: the one legend;
  - `hooks.ts`: a drawing refits when its space changes.

It keeps the app's own look: warm paper surfaces, the rust accent, serif headings, the same fonts. It changes no data, no route and no page outside the views.

## The measures

| What | Values | Notes |
|---|---|---|
| Spacing | `--space-1` 4px · `-2` 8 · `-3` 12 · `-4` 16 · `-5` 24 · `-6` 32 | 1–3px stay as hairline offsets. |
| Words drawn in a picture | `--viz-text-sm` 11px · `--viz-text` 12 · `--viz-text-lg` 14 | Never below 11px. |
| Text around a picture | `--text-xs` 0.75rem · `--text-sm` 0.875rem · `--text-lg` 1.1rem | Body text stays the app's 15px. |
| Corners | `--radius-sm` 4px · `--radius-md` 8 · `--radius` 10 (panels, as before) · `--radius-pill` | |
| Lines | `--line-hair` 1px · `--line-thin` 1.5 · `--line` 2 · `--line-strong` 3 · `--line-heavy` 4 | Hit areas (12px) and the double line (5px with a 1.5px gap) keep their exact widths. |
| Focus | `--focus-ring` (the accent), 2px, offset 2px | The same as the rest of the app. |
| Widths | phone: 640px and below · narrow: 1100px and below | `breakpoints.ts`; the stylesheet uses the same numbers. |

## Colour

**One palette of seven hues and a neutral**, in this order:
- each has a step for the light surface and one for the dark;
- they are assigned to kinds in a fixed order and **never repeated**;
- an eighth kind, or anything else, uses the neutral for "other".

| Slot | Hue | Light (on `#fffdf9`) | Dark (on `#22201c`) |
|---|---|---|---|
| 1 | blue | `#2a6fb8` | `#3a80cc` |
| 2 | green | `#1f8a5b` | `#3aab7c` |
| 3 | rust | `#c4562a` | `#c4532c` |
| 4 | teal | `#00908a` | `#0f9a93` |
| 5 | ochre | `#b07a00` | `#bd8a12` |
| 6 | violet | `#6b55d0` | `#8572e0` |
| 7 | magenta | `#c8457f` | `#d65590` |
| other | neutral | `#6f675c` | `#b4ab9e` |

**Checked by computation, not by eye.** The palette validator measures lightness, chroma, separation for colour-blind readers (protan and deutan) and for full colour vision, and contrast against the surface.

| Check | Light | Dark |
|---|---|---|
| Lightness band | pass | pass |
| Chroma (none reads as grey) | pass | pass |
| Colour-blind separation, neighbouring slots | pass (worst ΔE 8.2) | pass (worst ΔE 10.3) |
| Full-colour separation, neighbouring slots | pass (worst ΔE 18.7) | pass (worst ΔE 18.2) |
| Contrast against the surface | pass (all ≥ 3:1) | pass (all ≥ 3:1) |
| Slots 1–3, every pair against every other | pass | pass |

**Before, for comparison:** the relationship and knowledge-graph palettes failed colour-blind separation in both themes:
- in dark, "mentorship" violet and "social" blue were ΔE 0.9 apart for a deutan reader;
- the graph's two purples were ΔE 3.2 apart even with full colour vision.

**Where every colour can sit next to every other** (graphs, maps), no palette of more than three colours passes. So:
- **past three colours on one drawing, a shape, a letter code or a line pattern always goes with the colour.**
- Every view does: line patterns on the relationship map and the graph, letter codes on graph nodes, shapes on the plot board and in the secrets chart, numbered routes on the journeys map.

**What each view's kinds use** (the view's own names point at the palette, so a kind keeps its meaning):

| View | Slot 1 | 2 | 3 | 4 | 5 | 6 | 7 | other |
|---|---|---|---|---|---|---|---|---|
| Relationship map | social | hierarchy | family | | | mentorship | romance | custom, other connections |
| Knowledge graph | typed connections | | timeline | systems | plot threads | fields | relationships | manuscript |
| Secrets and knowledge | partly knows | knows | | | suspects | believes | believes falsely | unaware |
| Plot board | introduction | resolution | event | | | | intersection | appears (development in the text colour) |
| Ability paths | alternative | other | fusion | upgrade | replacement | evolution | exclusive | rule, branch (prerequisite in the text colour) |
| Factions | | ally | rival | | | influence | other | territory |
| Journeys | travellers, in order, up to seven; everyone after shares the neutral | | | | | | | |

**Other colours:**
- **Feelings** on the Relationships page stay a diverging scale (warm hostile, through grey, to cool trusting), which suits an ordered scale. Each feeling now also has its own line: dashed, dotted, dash-dot, solid, double.
- **Warnings** have colours of their own, never used for kinds: `--status-critical`, `-warning`, `-info`, `-canon`, `-disputed`. Each always goes with a shape and words. A marker badge is squared when critical, rounded otherwise, and has a dashed edge for information.
- **Kinds of record** keep the colours the author gave their categories.

## Marks

- **Selected:** a ring in the text colour, `--line-strong`.
- **Focused from the keyboard:** the accent ring, `--line-heavy`. A mark both selected and focused shows both.
- **Dimmed** while something else is selected: 30%.
- **Words drawn over lines** have a halo in the drawing's background, so no line runs through them. On maps the halo grows and shrinks with the words as you zoom (`.viz-label`).
- **Nodes on the maps** come in three sizes: one tie or none, 2–5, 6 or more.
- **One arrowhead,** as tall as the drawing's labels (`ArrowMarker`).
- **Labels on the Relationships page** move along their line rather than print over another label.

## Legends

**Every view that draws has one:**
- under the drawing, under its title ("What the map shows");
- each entry a shape and a name, never a colour alone;
- it can be folded away, and starts folded on a phone.

The five views that had none now do: Places, Journeys, Records by kind (its timeline and map), Ownership, and Structure and pacing. The Relationships page uses the same legend.

A chart of one series has no legend: its title names it.

## The frame and the panel

- **The Visualize frame:**
  - the view picker is one row that scrolls sideways, kept on the open view;
  - then the view's title and its line;
  - then one row with the filters, saved views and Export;
  - the markers switch is one line until it is on.
  - On a phone, the picker is the same scrolling row (not a menu), so the keyboard and links work the same at every size.
- **A record's details** sit beside the drawing on a wide screen and open as a sheet at 1100px and below.
  - A drawing follows its column, so nothing of it (its zoom buttons included) runs under the panel.
  - When its space changes, it refits, unless you have moved or zoomed it.

## Touch

On tablets and phones (1100px and below, or any touch screen):
- the views' controls are at least 44px to a fingertip. A switch's two halves are widened by padding rather than a minimum width, which would let one shrink past its own word;
- on a phone, the Tutorial button shrinks to its icon on these pages, so it covers less.

## Checks

- `e2e/a11y.mjs`:
  - a view that draws must have a legend;
  - a record's details must not cover any of its view;
  - the views' controls must be at least 44px at tablet and phone sizes, and no control's words may run past it;
  - with the earlier checks (no unnamed control, no colour-only legend, no sideways scrolling, keyboard walk, reduced motion).
- The palette: run the validator on the hexes above. It is the `dataviz` skill's `validate_palette.js`, `--mode light --surface "#fffdf9"` and `--mode dark --surface "#22201c"`; `--pairs all` for the first three slots.
