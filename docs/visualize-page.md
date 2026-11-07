# The Visualize page (Prompt 13)

**Written:** 2026-10-21.
**Code:**
- `src/modules/visualize/`: `VisualizePage.tsx`, `views.ts`, `summaries.ts`
- `model/hooks.ts` (`useStoryModel`)

**Tests:**
- `visualize/visualize.test.ts`, 5 tests
- the "Visualize" section at the end of `e2e/smoke.mjs`

## Where it is

| | |
|---|---|
| Name | **Visualize**, because "Workspace" already names the Studio (plan §3.1) |
| Address | `/project/<id>/visualize/<view>`; `/visualize` alone opens the first view, and an unknown view name does the same |
| Sidebar | Between Story graph and Progress (`studio/panels.tsx` `PAGES`) |
| Phone | Behind **More** like every other page. The phone tab bar is unchanged. |
| Who can open it | Owner, co-author and **editor** (`sync/access.ts` `EDITOR_PAGES`), the same as the Story graph. Readers and viewers don't see it. |
| Studio | Can be a workspace's centre: "Visualize (every view)" (`studio/store.ts` `CENTERS`) |
| Tutorial | A "Visualize" lesson under "Planning the story" (`tutorial/topics.ts`) |

## What it shows

Six views, in the order the pack names them:

| View | Lists now | Records edited on |
|---|---|---|
| Timeline | Events by **when they happen** (undated last), each with **where the reader meets it** (chapter, and "flashback" and so on when marked) | Timeline |
| Relationship map | Each relationship as it stands now, and how many stages it has had | Relationships |
| Plot board | Each thread: status, the chapters it develops in, developments not yet placed | Plot threads |
| Knowledge graph | How many records and connections; the most connected; connections pointing at something deleted | Story graph |
| Places | Locations nested by their "located in" connections (a loop is shown flat, never lost), with how many events happened at each | Codex |
| Character progression | Characters with abilities held on a system sheet or states logged | Character progression |

These lists are each view's **written form**, and they will stay as the "List" side of each view (see the plan) when the drawn forms are built in later prompts. Each view says what it is drawn from, and links to the page where those records are made and changed. The page itself changes nothing.

**Every view has a clear empty state** for a novel with no relevant records ("No events yet. Events you add on the Timeline appear here…").

## Always this novel, never a copy

- **Records are read live.** `useStoryModel(projectId)` reads the project's records through the shared model (`loadModel`) as a live query. A record changed anywhere in the app shows here at once.
- **Nothing is stored for the page.** There is no workspace database.
- **The project comes from the workspace** (`useCurrentProject`), the same as every other project page. The e2e test checks that one novel's Visualize never shows another's events.

## Keyboard and screen readers

- **The views are links** in a `navigation` named "Views". The current one is marked `aria-current="page"` and its tab is outlined.
- **Each view has its own address,** so Back goes to the previous view, and links can be shared.
- **Content uses the shared kit:** `ViewHeader`, `VizState`.
- **Tables have hidden captions**, and lists are labelled ("Events in story order", "Places").

## End-to-end checks (`smoke.mjs`, "Visualize")

- The page is in the sidebar, with six views, opening on Timeline.
- A new novel shows an empty state in every view.
- Back returns to the previous view; an unknown view name opens Timeline; Enter on a view link opens it.
- An event and a place written to the database appear in Timeline (date; "Not told in any chapter yet") and Places ("1 event here"). The other novels' events don't appear.
- Each view links to its editing page.
- At phone width the page fits with no sideways scroll.
- The editor-role check (Phase 29) now includes Visualize in the editor's pages, as intended.

## Not in this step

- **The drawn forms** of each view come with their own prompts: timeline (16 onwards), relationship map (26), plot board (28–29), graph (32–33), places and map (39), progression and ability trees (37–38).
- **Saved views** (14) and cross-view selection (15).
