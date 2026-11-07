# Modules: genre modules and views (Optional Prompt D)

**Written:** 2026-10-23.

**Where it lives:**
- `src/modules/visualize/modules.ts`: the views as modules: what each reads, needs and keeps, and the rules for turning them off and on (pure, tested).
- `src/modules/visualize/ViewLink.tsx`: links into a view, offered only while it is on.
- `src/modules/extensions/components/ViewModules.tsx`: the **Views** section of the Module Manager.
- `src/modules/projects/service.ts` (`setViewsOff`) and `Project.viewsOff`: the novel's setting.

## The module manager as it was (reviewed)

**Genre modules** (Fantasy, Mystery, Progression…, and the author's own) were already safe:
- **Turning one on** adds its categories and fields to the Codex (merging with what is there) and shows its tools. It creates no records.
- **Turning one off** hides its tools and sidebar entry, and puts away only the categories it brought that are empty and unused by another module that is on. It deletes nothing, and turning it on again brings everything back.
- **Shared categories** are shown ("Shares records with …"), and stay while another module uses them.

Two things were missing:
- **The views could not be turned off one by one.** The final review (SD-12) noted there was "no per-view off switch".
- **A page a module unlocks** (Character progression) stayed in the sidebar when it held progression *snapshots* or a system blueprint, but not when it held only *tracked progression changes*. Turning the module off could hide the page those records are made on.
  - Fixed: the page now stays while any of the three exists. The records were never at risk; only the way to them was.

A new test turns all ten genre modules off and on, one by one and all at once, three times over, with records in each:
- no entry or tool record changes;
- no category or field is added twice.

## Views as modules

Each of the 17 views of the Visualize page is a module. Every novel starts with every view on. With **Module Manager → Views**, someone who can edit the novel turns a view off, and on again.

**Off, a view is:**
- gone from the Visualize picker;
- at its own address (an old link, a bookmark), a page saying it is off, with a button to turn it on;
- not offered in the links other pages make to it (listed below).
- **With every view off,** Visualize leaves the sidebar, and its page says so.

**Off, nothing is lost:**
- the records it shows stay on their own pages, and every other view still shows them;
- its saved views stay. The dashboard's Saved views widget lists them as "that view is turned off in this novel";
- the checks that read its records still run (the Review page, the Record check). Where a check lives in an off view, the page says that view is off instead of linking to it;
- turning it on brings it back exactly as it was.

**What every view needs, always there:**
- **the shared story model**: one set of records, read live;
- **the Visualize frame**: filters, saved views, export, the details panel, canon and continuity markers.

These are part of every view and are not turned off on their own, so no view can be left without them.

### What each view reads, needs and keeps

| View | Reads (core pages) | Needs | Made only here | Linked from |
|---|---|---|---|---|
| Timeline | Timeline, Characters, Codex, Plot threads, Manuscript | | | Continuity review |
| Story vs reading order | Timeline, Manuscript | | | Timeline (an event's chapters) |
| Relationship map | Relationships, Characters, Codex | | | Continuity review |
| Plot board | Plot threads, Manuscript, Timeline | | | Plot threads, Scene board, Continuity review |
| Structure and pacing | Manuscript, Organizer, Timeline | | Structural markers | Record check |
| Knowledge graph | every kind of record | | | Continuity review |
| Places | Codex, Timeline, Characters | | Place levels, world maps and the places pinned on them | |
| Character progression | Character progression, Systems, Characters | | | |
| Character history | Characters, Timeline, Relationships, Codex, Manuscript, Character progression | | | Characters (a profile's life history), Timeline (a character's life) |
| Character appearances | Manuscript, Characters, Timeline | | | |
| Secrets and knowledge | Characters (Secrets tab), Timeline, Manuscript | | | Characters (a secret), Continuity review |
| Records by kind | Codex, Timeline | | | |
| Ability paths | Systems, Codex, Character progression | | | Continuity review |
| Journeys | Codex, Characters, Timeline | **Places** | Journeys, and the speeds of ways to travel | Record check, Continuity review |
| Factions | Codex, Timeline, Characters | | | |
| Ownership | Codex, Timeline, Characters | | | |
| Charts | Manuscript, Characters, Plot threads, Timeline | | | |

The core pages never depend on a view: writing, the Codex, the Timeline, Relationships, Plot threads, Canon and export work the same with every view off.

### The one dependency between views, and its safeguard

**Journeys needs Places.** Its routes are drawn on the world maps made in Places ("Maps…"), at the places pinned there.

- **Places cannot be turned off while Journeys is on.** Asking to do so changes nothing. Places' card says "Places stays on while Journeys is on: Journeys needs it, because its routes are drawn on the maps made in Places…", and offers:
  - **Turn off Journeys and Places**: the safe way, both together;
  - **Keep Places on**.
- **With Journeys off, Places can go on its own.**
- **Turning Journeys on turns Places on too,** and says so. From Journeys' own page, the button reads "Turn the Journeys view on (with Places, which it needs)".

### Records made only in a view

- **Which they are:** structural markers (Structure and pacing), place levels and maps (Places), journeys and travel speeds (Journeys).
- **Before you turn it off:** the view's card says this.
- **After:** the message and the view's own page say again that these records are kept and still checked, and can be changed once the view is on.

## Where the setting is kept

- **On the novel itself** (`Project.viewsOff`, the keys of the views turned off). Absent or empty means every view is on.
- **It travels with the novel:**
  - in its backup file;
  - in a copy;
  - in a new timeline;
  - through sync.
- **It is the novel's, like its genre modules,** so a team shares it.
- **Only this setting changes** when a view is turned off or on. No record of any view is written (tested, row by row).
- **No database change and no migration:** the database stays at version 34.
- **A key this version does not know** (from a newer version) is kept as it is. "Turn every view on" leaves it alone too.

## Checks

- **Unit tests,** `visualize/modules.test.ts`, 8 tests:
  - every view is a module, and every dependency is a real view with its reason;
  - the turn-off rules: blocked, together, alone once the dependent is off;
  - the turn-on rules: what is needed comes too;
  - reading a page address;
  - the setting kept in order, without repeats, with unknown keys;
  - the setting through a backup file and a copy;
  - **cycles:** every view of the QA sample novel off and on, one by one and all at once, three times. Every row of the novel stays the same, its saved views stay, and the timeline reads the same.
- **Unit tests,** `extensions/extensions.test.ts`: the genre-module cycle test above.
- **Browser checks,** `e2e/smoke.mjs`, "Views as modules (Optional Prompt D)", on an imported QA sample novel:
  - the Module Manager lists 17 views, with their dependencies;
  - Places is refused while Journeys is on, with the reason;
  - the safe way turns both off;
  - an off view is gone from the picker, and its address says so;
  - the links into off views go (a character's life history, the plot lanes); the Review page says where a check lives is off;
  - nothing but the setting changes;
  - turning on from the view's own page brings Places with Journeys;
  - "Turn every view on" works;
  - three rounds of off and on;
  - with every view off, Visualize leaves the sidebar;
  - the phone layout.
- **Accessibility audit,** `e2e/a11y.mjs`: the Module Manager and a view turned off, at desktop, tablet and phone.

## Limits

- **Only views are modules here.** The dashboard's widgets read the shared records directly, so they work whatever views are on; only the Saved views widget marks a saved view of an off view.
- **Read-only team members** see which views are off but cannot change it; the buttons are offered to those who can edit.
- **Off views are still searchable by their records:** a record found in search opens on its own page as before.
