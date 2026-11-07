# Kinds of record in the views (Prompt 36)

**Written:** 2026-10-22.

**Code:**
- `src/modules/codex/types.ts`: `KindUses`, a category's view settings (`Category.uses`).
- `codex/capabilities.ts`: what each setting reads, `missingFor` (what is missing, in words), `readyViews`, and the stored shape (`cleanUses`, `remapUses`, `mergeUses`); pure.
- `codex/components/KindUsesEditor.tsx`: **Visualizations**, in Categories & fields.
- `visualize/kinds.ts`: what the view reads for each way of showing a kind (`kindTable`, `kindTimeline`, `kindMap`, `kindRanks`, `kindHolders`, `tableCsv`); pure.
- `visualize/KindsView.tsx`: the **Records by kind** view, and `HolderEditor` beside it.
- `graph/knowledge.ts` and `visualize/GraphView.tsx`: a kind's label field and chosen link fields in the knowledge graph.
- `integrity/rules.ts` (`unsuitedKinds`) and `integrity/IntegrityPage.tsx`: **Views set up on fields that no longer suit**.
- `codex/service.ts` and `codex/typePresets.ts`: settings saved, copied, imported and carried by templates and presets.

**Tests:**
- `codex/capabilities.test.ts`, 6 tests: nothing set, partly set, fully set, fields changed afterwards, the stored shape.
- `visualize/kinds.test.ts`, 11 tests: a partly set-up kind and a fully set-up one in every view and the graph, and settings kept through field changes, a copy, a template and the presets.
- "Kinds of record set up for views…" in the Visualize section of `e2e/smoke.mjs`: 22 checks.

## The idea

A kind of record (a Codex category: Spells, Artifacts, Locations…) takes part in a view only when the author says which of its fields that view reads.
- **Nothing is worked out from field names.** A field called "Date" is not assumed to be a date on the timeline.
- **Settings name fields by id.** Renaming, moving or retyping a field keeps its setting.
- **A setting whose field stops suiting is kept, and said.** It works again once the field suits, so nothing is lost by a change made by mistake.

## The settings

Set in the Codex: **Categories & fields → the kind → Visualizations**. Each menu offers only the fields of a type the view can read.

| Setting | Reads | Field types | Shown in |
|---|---|---|---|
| Date on the timeline, and an optional end | When each record is | Number (a year of the story's calendar) or Date (a day) | Records by kind → On a timeline |
| Across and up on the map | Where each record is | Two Number fields | Records by kind → On a map |
| Rank | Where each record sits on a ladder | Number (by value), or Choice (one) (by the order of its choices, lowest first) | Records by kind → By rank |
| Connection that means holding it, and an optional current-holder field | Who holds each record over the story | A connection type (Owns, or the author's own); a Link to an entry | Records by kind → By who holds it |
| Label in the knowledge graph | What each record's node says | Short text, Number, Choice (one) or Date | Knowledge graph |
| Link fields drawn as connections | Which link fields become lines | Link fields (all when none are chosen) | Knowledge graph |

"Show in the knowledge graph" (Prompt 35) still decides whether the kind is in the graph at all.

## Saying what is missing

The same sentences are used everywhere:
- **In the dialog,** under each view: "Not set up", what is still missing, or "Set up".
- **In Records by kind,** when a way of showing the kind is chosen that it isn't set up for. The view explains what is missing, links to the Codex, and **shows the table instead**.
- **On the Record check,** under **Views set up on fields that no longer suit**. Only settings the author made are listed. A view never set up is not a problem.

Examples:
- "The date on the timeline is not set: choose a Number or Date field."
- "Artifacts has no Number field for across on the map: add one, then choose it."
- "Up on the map is not set: choose a Number field." (partly set up)
- "Found, chosen for the date on the timeline, is now Short text; it needs to be a Number or Date field."
- "North, chosen for up on the map, was removed (archived): restore it or choose another."
- "Tier, chosen for the rank, has fewer than two choices to rank by."

## Records by kind

A twelfth Visualize view (`/visualize/kinds?kind=<category>&kshow=<way>`). It shows every Codex kind except characters, which have views of their own. It opens on the first kind with records.

- **Table**, always: a column per field, each value as a reader sees it (a linked record by its name). **Download the table (CSV)** saves it as a file; nothing leaves the device otherwise.
- **On a timeline:** a dot for a record with only a date, a bar from its date to its end. The axis is the novel's own calendar, as events use.
- **On a map:** one scale for both directions, so distances keep their proportions; up is up. It zooms and pans like the other drawings. Arrow keys move to the nearest point that way, and Enter selects.
- **By rank:** the ladder, highest at the top. A Choice field shows every rung, held or not, so the ladder keeps its shape.
- **By who holds it:** each holding in the order it began, then who the current-holder field names.

Every drawing also has:
- **a list form** (Timeline, Map, Ladder or Holders beside **List**);
- **"Not on the timeline / map", "Not ranked":** each record that can't be drawn, with the reason ("Found holds “long ago”, not a year (a whole number).");
- **the page filters,** applied as in the other views.

### Who holds it

- **A holder** is the record a connection of the chosen type comes from: "Mira owns the Ember Crown".
- **Recording a holder.** Select a record while it is shown by who holds it, then use **Record who holds it** beside the view. It records through the connections service (Prompt 8):
  - **A first holder:** a new connection, from the start or from a chapter or event.
  - **A new holder from a point:** the holding before ends there and is kept, and the new one starts there (`connections.change`).
  - **Nobody:** the holding in force ends there (`connections.end`).
- **The field and the history can differ.** If the current-holder field names someone other than the holding still in force, the view says so ("Keeper names Mira, but the holding recorded as still in force is Orrin’s."). Neither is changed.

## In the knowledge graph

- **Label:** a record whose label field is filled in is drawn by that value (a code name, a designation). Searching the graph finds it by that value and by its name. A record with the field empty keeps its name.
- **Link fields:**
  - With none chosen, every link field is drawn, as before.
  - Untick one and its connections are left out of the drawing only. "Every connection", the Record check and every other view still have them.
  - The graph says what it left out: "Link fields set, in the Codex, not to be drawn: Artifacts: Keeper (2), 2 connections in all."
  - Fields added to a single entry are always drawn.

## Kept across changes and copies

- **Schema updates:**
  - Renaming, moving and retyping fields keep every setting.
  - Removing (archiving) a field keeps its setting, said as a problem.
  - Restoring or retyping the field back makes it work again.
- **Backups and copies of the novel** carry the settings. A kind brought in from a file is cleaned (only known settings naming its own fields are kept).
- **Templates** (one kind, or every category) carry the settings. Applied to another novel:
  - each setting points at that novel's field of the same name;
  - a setting the novel already has is never replaced.
- **Presets** come set up where it suits them. Each setting can be changed or cleared.

  | Preset | Comes set up for |
  |---|---|
  | Spells | By rank (Rank) |
  | Techniques | By rank (Difficulty) |
  | Technologies | By rank (Tech level) |
  | Planets | On a timeline (First visited) |
  | Investigations | On a timeline (Opened) |
  | Organizations | On a timeline (Founded) |
  | Relics | By who holds it (Owns, Current holder) |

- **Exports:**
  - The story bible lists every field, as before.
  - The table downloads as CSV.

## Data model

- **`Category.uses`**: optional, stored with the category (`loreSchemas`).
- **`ConnectionSource.field`**: the field a field connection comes from. It lives in the shared model only and is never stored.
- **No migration;** the database is still version 31.

## Limits

- **Records of a kind are not drawn among the events on the Timeline view.** They share the novel's calendar, but are drawn in Records by kind. The Timeline stays a timeline of events.
- **A Number on the timeline is a whole year.** A Date is a day of the standard 12-month form the date picker gives. In a novel with its own calendar, a Date whose month or day that calendar lacks is listed as not placed, with why.
- **The map is a plane of two numbers.** There's no background image, and points at the same place are drawn on top of each other (the list shows each).
- **The ladder ranks by one field.** There's no history of rank over the story; a character's progression over the story stays with Character progression.
- **Holders are entries** (characters, factions, places…), not chapters or events.
- **Characters** have no view settings here; they have their own views.
