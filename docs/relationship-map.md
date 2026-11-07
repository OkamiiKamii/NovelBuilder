# The interactive relationship map (Prompt 26)

**Written:** 2026-10-21.

**Code:**
- `src/modules/relationships/network.ts`: which characters and ties are shown (`relationNetwork`, `stageShown`), and where they are drawn (`layoutNetwork`); pure
- `relationships/networkParams.ts`: the map's filters in the page address and in saved views
- `relationships/components/RelationMap.tsx`: the drawing
- the **Relationship map** view in `visualize/VisualizePage.tsx` (`/visualize/relationships`)
- `model/navigate.ts`: a relationship's details gain Direction and Feeling

**Tests:**
- `relationships/network.test.ts`, 7 tests, on a network of 400 characters and 1,200 relationships
- "The relationship map, on a crowded court" in the Visualize section of `e2e/smoke.mjs`: 16 checks, on 150 characters and 300 relationships

The Relationships page keeps its own simpler map for editing. This is the full map, in Visualize.

## The drawing

**Characters** are circles, bigger with more ties shown, each with its initial and name.

**Relationships** are lines between the actual character records. Each group has its own colour **and** line pattern, named in the legend, so no group is told by colour alone:

| Group | Line |
|---|---|
| Family | solid, heavier |
| Social (friends, allies, rivals, enemies) | long dashes |
| Mentorship | dotted |
| Romance | dash-dot |
| Work and rank (employment, rule, politics) | short dashes |
| Custom | thin |
| Other connections (distrusts, considers a rival…) | thin, grey |

**Direction.** A one-way relationship has an arrow from the first role to the second, and reads aloud with both roles ("Courtier 003 (Mentor) to Courtier 010 (Student): Mentor / Student, neutral, Whole story").

**Moving around:**
- **Zoom and pan:** wheel, drag, pinch, or the keyboard, through the shared viewport (Prompt 12).
- **Drag** a character to move them. A press that doesn't move selects instead, and **Put everyone back** undoes the moves.
- **The layout** is a force layout from a fixed start, so the same network is always drawn the same way (tested). It's worked out again only when the set of characters or ties changes.

**Selection** uses the page's shared selection:
- **A character:** their ties light up, everything else dims, and their details open with **Focus the map on …**.
- **A relationship line:** opens its details, now with **Direction** ("Orrin (Mentor) → Mira (Student)") and **Feeling**, as well as how it stands now, its stages, and the two characters.

**Keyboard.** The map is one stop in the tab order:
- the arrow keys move between characters, in name order;
- Enter selects;
- **F** focuses the map on that character.

## Filters and layers

All of these live in the page address (and saved views keep them):

| Filter | What it does |
|---|---|
| **When** | **Now** (the end of the story so far), **as of a chapter** (the stage in force there), **across chapters** (any stage in force between two chapters, drawn as the latest), or **at any time** in their history |
| **Type** | One relationship type, as used in this novel |
| **Faction** | Relationships touching a character tied to that faction by any connection |
| **Focus on** | One character's neighbourhood: their own ties, or **and their ties' ties** |
| Search, **Involving character** | The page's own filters, as on every view |
| **Layers** | Show or hide each group, other connections, and the labels on the lines; and choose whether to show characters with no ties |

**Against the hairball:**
- **Labels:** with more than 60 lines, labels are drawn only for what's selected, or once zoomed in.
- **Focus** shows a local neighbourhood.
- **Layers** take whole groups away.
- **A count** says what's shown ("Showing 150 characters and 300 of 300 relationships, with 10 other connections.").
- **No results:** a filter that leaves nothing says so and offers to clear.

**A stage whose chapter isn't said** (Prompt 25) is in the history, but isn't assumed to be in force at any chapter or range.

## The list alternative

**List** shows the same relationships and connections as a table. Each row has from (with role), how, to (with role), feeling, and where it applies, with characters and relationships selectable like on the map.

## Tested at scale

**Unit tests, on 400 characters, 1,200 relationships of six kinds, five factions of 80 and 60 other connections:**
- **Counts:** every filter's result checked exactly (type, layers, faction, the page's own filters).
- **Focus:** neighbourhoods at one and two steps checked against a hand-worked search.
- **Speed:** filtering under 1.5 s and the layout under 5 s. Both run much faster than that; the limits are there to catch a regression.
- **Layout:** the same layout every time, everyone placed apart.

**In the browser, on 150 characters and 300 relationships:**
- the whole court drawn within 20 s, through a fresh dev server;
- keyboard selection;
- dimming;
- focus at one and two steps;
- dragging;
- type, as-of, across-chapters, whole-history, faction and layer filters, each with its count;
- the no-results state;
- the table;
- relationship details;
- phone width.

## Fixes found on the way

**The layer checkboxes** flicked back while the address updated. They now show the change at once, as in Prompts 18 and 24.

## Limits

- **Positions aren't kept.** Dragged positions last while the map is open; they aren't saved, and a new filter lays the map out again.
- **Other connections** (typed links) can't be selected from the map, since they aren't records with details of their own. They read aloud, and appear in the table.
- **"Faction"** means entries of the Factions category. A tie to the faction is any connection, so an enemy of a house counts too.
