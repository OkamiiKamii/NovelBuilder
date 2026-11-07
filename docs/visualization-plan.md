# Visualization Workspace: implementation plan

**Status:** plan only. Nothing here is built yet.
**Written:** 2026-10-21, from the read-only audit (Prompt 1) and the full prompt pack (`novel_app_visualization_claude_code_prompts.md`: Prompts 1–50 plus optional A–E).
**Applies to:** Novel Builder 0.1.0 (React 19, TypeScript 7, Vite 8, Dexie 4, IndexedDB schema v25).

At the start of each prompt, re-read its row in §4. If the prompt and this plan disagree, update the plan first, then write code.

---

## 0. Ground rules and known unknowns

**Rules from the pack (apply to every prompt):**
- No AI or external calls. All analysis is deterministic.
- Data stays local.
- Reuse stable ids and shared records; never copy them.
- Keep fictional chronology separate from reading order.
- Warnings never change data.
- Every visual has a list or table alternative.
- Support keyboard, mobile and dark mode.
- Report test results truthfully.
- One prompt at a time.

**Not an AI feature.** Nothing in this plan imports from `src/modules/assistant/`, the only code that calls a model (`assistant/providers.ts`). The only other network code is the user-configured sync relay (`sync/account.ts`). New code adds neither.

**The "41-feature roadmap" is not in the repo.** Until it is supplied, "preserve the roadmap" means:
- every route in `src/app/App.tsx` keeps working;
- every e2e section in `e2e/smoke.mjs` (Phases 1–33) keeps passing;
- the placeholder mechanism for unbuilt pages (`src/modules/workspace/sections.ts`) stays intact.

**The pack's own numbering is inconsistent.** Its heading says "45 sequential prompts", but it contains 50. This plan follows the 50.

---

## 1. What already exists, and how it relates to the pack

Most of the pack is **extension, not new construction**. Reusing what exists is what the pack's own rule "do not invent a second architecture" requires.

| Pack area | Already in the app | Gap |
|---|---|---|
| Stable ids (P5) | `crypto.randomUUID()` in `core/id.ts`. `StoryNode.order` is separate from `id`. Copies remap every id across all durable tables (`projects/service.ts:127` `restoreMapped`). | Rename/reorder stability tests. Stale `CharacterProfile.linkStatus` keys. |
| Connections (P7) | `LoreLink` (`codex/types.ts:148`): one row, two directional labels. `CharacterRelation` (`relationships/types.ts:78`): typed, directional, with stages. | No connection *type*, notes, validity or canon status on `LoreLink`. Endpoints can only be codex entries. |
| Temporal state (P8) | `RelationStage.startNodeId`, `ProgressSnapshot.nodeId`, `ContinuityRule.fromNodeId/untilNodeId`, `CharacterHistory` | Every anchor is a reading position. None is a fictional time or event. |
| Events (P9) | `TimelineEvent` (`timeline/types.ts:51`): exact, approximate, relative and unknown dates; duration; participants with ages; location; entries; `nodeIds`; `afterId`. `resolveChronology` (`chronology.ts:71`). | No end date or uncertainty, no plot-thread link, no status, no canon or branch field, no role for each linked chapter (told / flashback / foreshadowed). |
| Custom types (P35) | Codex categories and fields (`loreSchemas`; `FIELD_TYPES` = text, longtext, number, select, multiselect, tags, toggle, date, reference, references), templates (`templates` table), genre presets | No required fields, no validation rules, no visualization mapping (P36). |
| Graph (P32–33) | Story graph (`graph/`): canvas + d3-force, 7 edge kinds, clustering above 150 nodes, 1- and 2-hop highlighting, filters, inspector lists | Positions are not saved, the canvas is not keyboard-navigable, there is no path highlighting, no "results are limited" notice, and no plot-thread nodes. |
| Relationships (P24–26) | `RELATION_PRESETS` and categories, stages over reading position, `NetworkMap` (ring layout), table, `VaultMap` | No configurable attributes (trust, fear and so on), no fictional-time anchors, no force layout, zoom or filters. |
| Secrets (P27) | `CharacterSecret` (`characters/types.ts:71`): the truth apart from who `knows`/`suspects`/`unaware`, plus what the reader knows and where | No "falsely believes", no record of when or how each character learned, no spread view. |
| Board (P28) | Organizer outline with native drag and drop (`manuscript/pages/OrganizerPage.tsx`), `manuscript.move/nudge` | No card board, and native drag and drop does not work on touch. |
| Plot threads (P29) | `PlotThread`, `ThreadBeat.nodeId`, statuses (planned, active, paused, resolved, abandoned, retconned), quiet-thread diagnostics (`plot/diagnostics.ts`) | No lane view, and beats cannot link to events. |
| Structure and pacing (P30, P44) | Word counts on nodes, `BarChart`, dashboard `Strip`/`Parts` (`analytics/`) | No scene labels, structural markers or point-of-view field. |
| Appearance matrix (P31) | `ChapterPlan.entityIds` (set by the author: **present**). `StoryNode.mentions` (linked in the text: **mentioned**). The dashboard `Strip`. | No matrix view. |
| Cross-references (P34) | `crossref/` (MentionedIn, Trail), entity links inside the text, the registry's `refs`/`remap` | No dangling-reference or duplicate detection, no merge, no link status. |
| Progression (P37–38) | `systems` (blueprints, sheets, XP), `progressSnapshots`, `SysItem.parentId` | Anchors are reading positions only. `requires` is free text. There is no tree view and no typed ability edges. |
| Locations and maps (P39–41) | Location category; `TimelineEvent.locationId`; continuity `travel` rules (a duration between two locations) and `possession` rules (`continuity/types.ts`) | No hierarchy, coordinates or maps, no movement records, and no membership or ownership history with fictional time. |
| Alternate timelines (P22) | `branching/`: each alternate timeline is a **full copy of the project** (`projects.fork`) | The pack forbids copying the whole database for a small branch (see §3.6). |
| Canon (P42) | `CANON_STATUSES` = canon, provisional, non-canon, retconned, conflicting (`canon/types.ts:1`), with fact history | No markers on the visual views. |
| Continuity (P43) | `ContinuityPage`, rules, audit, `Resolution.kind` = intentional / dismissed with a note | No "resolved" or "needs review" states; only checks of the manuscript text. |
| Export (P46) | `shared/download.ts`; manuscript export as docx, pdf, md, txt, html; project `.novel.json` | No CSV, SVG or PNG export of a view. |
| Modules (P48, D) | `extensions` enable/disable keeps all data (`extensions/service.ts:228-245`) | Visualizations are not modules yet. |

---

## 2. Prerequisites: Prompt 3 (baseline)

| # | Step | Why |
|---|---|---|
| P3.1 | `npm ci` on this machine (needs your approval) | `node_modules` was installed on macOS. The Windows packages for TypeScript 7 and Rolldown are missing, so `tsc`, `vitest` and `vite` cannot start. |
| P3.2 | `git init` plus a baseline commit (needs your approval) | The pack requires a restorable baseline. A `.gitignore` already exists. |
| P3.3 | Run `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e` (with `npm run dev`) and `npm run test:offline`, and record the real results | There is no lint configuration (no ESLint or Prettier). Say so; don't add one in this step. |

---

## 3. Architecture decisions

### 3.1 Naming: "Visualization Workspace" → **Visualize**

**Conflict.** `PAGES` in `src/modules/studio/panels.tsx:21` already has `{ to: 'studio', label: 'Workspace' }`, which is the Studio.

**Solution.** Add a page called **Visualize** at `/project/:id/visualize/:view?`, in a new module `src/modules/visualize/`.
- It is a hub with one tab per view. Each view component lives in its own domain module (for example `timeline/components/ChronologyAxis.tsx`).
- Existing pages keep their routes and deep-link into the same components.
- `'visualize'` is added to `CENTERS` in `studio/store.ts:28`.

### 3.2 Shared contracts are adapters, not new tables (P6)

There are already more than 20 tables in use. Pages read them with `useLiveQuery` and write through `create*Service`. Contracts are a **read model** built over those tables.

New `src/modules/model/`:
- `refs.ts`
  - `EntityRef = { type: EntityType; id: string }`
  - `EntityType` = `node` | `entry` | `event` | `thread` | `relation` | `secret` | `fact` | `rule` | `system` | `sysItem` | `sheet` | `snapshot` | `map` | `pin`
  - For codex entries, the `category` key refines the kind: character, location, faction, item, power, or a custom category.
- `resolve.ts`: `loadModel(projectId)` reads every relevant table once and returns typed indexes. `resolveRef(model, ref)` returns the record or `{ missing: true }`.
- `connections.ts`: `connectionsOf(model)` turns `loreLinks`, `characterRelations`, event participants and locations, thread beats, plan `entityIds`, `mentions`, sheets, snapshots and typed links into one `Connection[]`. This **generalizes `graph/build.ts` `buildGraph`**, which already does the same for 7 edge kinds. The graph then uses this function.
- `validate.ts`: pure validators (required fields, endpoints that resolve, date sanity).

Ability items live inside blueprint JSON (`SysItem` within `systems.items`), not as rows of their own. They get the composite ref `{ type: 'sysItem', id: '<systemId>/<itemId>' }`. Both parts are stable ids, so nothing needs migrating.

### 3.3 Typed connections: extend `loreLinks`, keep `characterRelations` (P7)

**Conflict.** There are already two edge stores. A third generic `connections` table would duplicate both, and would need migrating the existing links and relationships (the pack says don't).

**Solution.** Add optional fields to `LoreLink` (`codex/types.ts:148`). Old rows stay valid because every field has a default.

```ts
interface LoreLink {
  // existing: id, projectId, fromId, toId, fromLabel, toLabel, createdAt
  fromType?: EntityType;    // default 'entry'
  toType?: EntityType;      // default 'entry'
  type?: string;            // 'related' default; 'member-of', 'owns', 'leads', 'located-in', 'knows', 'caused', 'created-by', or custom
  notes?: string;
  status?: 'confirmed' | 'provisional' | 'disputed' | 'invalid';   // P34; default confirmed
  validity?: Validity;      // P8
  canon?: CanonStatus;      // reuses canon/types.ts CANON_STATUSES
  branchId?: string | null; // P22
  updatedAt?: number;
}
```

- **Direction (P7).** One row is one directed statement. Its `fromLabel`/`toLabel` already describe each side's view. "A considers B a rival, B considers A a friend" can be stored either as two rows with different `type`, or as one row with two labels. The inverse view shows the `toLabel` and never invents the other side's view.
- **Known types.** Kept in `model/connectionTypes.ts`, each marked as reciprocal or not. Unknown or custom type strings are kept and shown as written.
- **Registry.** `loreLinks` already has `refs: ['fromId','toId']`, and those ids remap across all tables. Add `remap` for `branchId` and `validity` anchors.
- **Character relationships** stay in `characterRelations`. They are the richer, character-only connection with stages and roles. `connectionsOf` presents them as `Connection`s of kind `relationship`.
- **Deletion.** `codex.remove` already removes links whose `fromId`/`toId` is the entry. Links whose endpoints are not entries (events, chapters) are cleaned up by the owning service's `remove`, or flagged by the dangling-reference check (P34).

### 3.4 Time anchors (P8)

**Conflict.** Every "changes over time" record today is anchored to a **reading position** (`nodeId`). The pack wants fictional time too, while keeping reading order. Today's anchors must not be replaced.

**Solution.** One shared type, used wherever a fact holds for a while:

```ts
// model/validity.ts
type Anchor =
  | { kind: 'node'; nodeId: string }         // "from chapter 12 on" (reading position, as today)
  | { kind: 'event'; eventId: string }       // "from the Siege on"
  | { kind: 'date'; when: EventDate }        // reuses timeline EventDate: exact | approximate | relative | unknown
interface Validity { from: Anchor | null; until: Anchor | null }   // null = open-ended or unknown
```

- `validAt(validity, point, model)` returns `true | false | 'unknown'`. It **never guesses**: a missing anchor gives `'unknown'`.
- `historyOf(rows)` sorts by `from` and keeps every past state.
- Applied as optional fields to:
  - `LoreLink.validity` (membership, ownership, presence)
  - `RelationStage` (`startEventId?`, `startWhen?` alongside the existing `startNodeId`)
  - `ProgressSnapshot` (`eventId?`)
  - `SystemSheet.xp[]` (`eventId?`)
  - `ContinuityRule` (`fromEventId?`, `untilEventId?`)
- No migration is needed: missing means "reading position only", exactly as today.
- Remap: each owning service's `remap` handles the event and node ids inside anchors.

### 3.5 Event model (P9): extend `TimelineEvent`

Optional fields in `timeline/types.ts`, read with defaults:

```ts
end?: EventDate | null;           // an explicit end date; `duration` stays as the other way to give one
ongoing?: boolean;                // open-ended (P19)
threadIds?: string[];             // plot threads (P9, P29)
status?: 'idea' | 'planned' | 'confirmed';   // default 'confirmed'
canon?: CanonStatus;              // default 'canon'
branchId?: string | null;         // P22; null = main timeline
reveals?: { nodeId: string; role: 'told' | 'flashback' | 'foreshadowed' | 'mentioned' | 'revealed' }[];  // P20
toLocationId?: string | null; travel?: string;  // P40 journeys
```

- `reveals` refines `nodeIds` without replacing it. `nodeIds` stays the list of where an event appears, and existing code keeps working.
- Registry `refs` gain `threadIds`, `toLocationId` and `branchId`. `remap` handles `reveals[].nodeId` and `end.anchorId`.
- `resolveChronology` gains end and span handling. Undated events stay unplaced and are never given an invented date (P16).

### 3.6 Alternate histories inside a project (P22)

**Conflict.** The existing Branches feature (`branching/`) makes an alternate timeline by **copying the whole project** (`projects.fork`, `timelines` table). The pack says not to copy an entire novel's database for a small branch. "Branch" is also already used twice: alternate *drafts* (`chapterBranches`) and alternate *timelines* (`timelines`).

**Solution.**
- Keep the existing project forks. They are a working feature, so they stay on the roadmap. Use them for "rewrite the second half".
- Add **lightweight what-if layers** inside a project. A new table `storyLayers` holds `{ id, projectId, name, baseLayerId: string|null, originEventId: string|null, status: 'exploring'|'adopted'|'abandoned', canon: CanonStatus, notes }`.
- An event, link or relationship stage with `branchId = layer.id` belongs to that layer. `replacesId?` on an event means "in this layer, this replaces that event".
- The main canon is `branchId == null`. The main views exclude layers unless one is selected.
- Comparison is a pure diff (`timeline/layers.ts`): events added, replaced or removed relative to the base.
- Nothing merges automatically.
- The UI calls these **"What-if timelines"**, to keep them apart from Branches (project forks) and alternate drafts.

### 3.7 Calendars (P17, P21)

**Conflict.** `resolveChronology` converts dates to minutes with a hard-coded 12-month year of 525,600 minutes, and `MONTHS` is Gregorian (`timeline/types.ts:74`).

**Solution.**
- A project-owned `calendars` table with `{ id, projectId, name, months: { name, days }[], hoursPerDay, eras: { name, startYear, direction }[] }`.
- `resolveChronology(events, calendar = DEFAULT_CALENDAR)`. `DEFAULT_CALENDAR` reproduces today's numbers exactly, so existing projects place every event where they do now. This needs a regression test over the existing timeline tests.
- Only one active calendar per project for now.

### 3.8 Where view state lives (P14, P26, P33)

**Principle:** if a position means something in the story, it comes from story data. Only free-form placement is stored.

| View | Position comes from | Stored layout |
|---|---|---|
| Timeline axis and tracks | `resolveChronology` | Track order and visibility only, in the saved view |
| Board (P28) | `StoryNode.parentId/order` | none. Moves go through `manuscript.move` |
| Plot lanes (P29) | `ThreadBeat.nodeId` and `threadIds` | none. Moves go through `plot.updateBeat` |
| Ability tree | `SysItem.parentId` + typed edges | none |
| Relationship map, knowledge graph | force layout + pins | `vizLayouts` |
| World map | pins the author places | `mapPins` |

New tables:
- `vizLayouts`: `{ id, projectId, view, itemKey, x, y, pinned, updatedAt }`, indexed on `[projectId+view]`. One row per item, so sync's field-by-field merge never conflicts on a large blob.
- `savedViews` (P14): `{ id, projectId, view, name, config: { filters, layers, scale, range, trackOrder, focusRef }, builtin, updatedAt }`.
  - Configs hold **record ids and query settings only**, never record copies.
  - Missing ids are skipped with a notice.
  - Remap: ids inside `config` go through `mapId`.

### 3.9 Query layer (P10)

New `src/modules/model/query.ts` holds pure functions over `loadModel()`:
- `select(model, { types, ids, nodeRange, timeRange, characters, locations, factions, threads, canon, branchId })` returns `{ items, excluded: { reason, count }[] }`.
- Filters compose with AND. `excluded` makes "no date", "unknown location" and similar visible instead of silently dropping records (the pack's rule).
- The existing filters in `graph/build.ts` (`filterGraph`), `TimelinePage` and `PlotPage` move onto it over time, without changing behaviour.

### 3.10 Shared UI kit (P12)

New `src/modules/viz/`. No new dependencies; `d3-force` stays the only layout library.

- `useZoomPan` (pointer events with capture, pinch, wheel anchored at the cursor, keyboard), `<Viewport>`
- `<ViewHeader>`, `<FilterBar>` (URL-backed via `useSearchParam`), `<Legend>`, `<DetailPanel>`
- `<VizState>` (loading, empty, error, no-results, and "results limited")
- `activate()` for keyboard access, `truncate()`, `affinityColor()` (from CSS variables, dark-mode aware)
- `history.ts` (undo/redo, §3.11)
- `charts/`: `BarChart` moves from `progress/components/` and is re-exported from its old path; `Strip` and `Parts` come from `DashboardPage.tsx:28-60`, `ArcChart` from `Tools.tsx:275`; plus `toCsv()`.

**Duplication this removes:**
- the ring layouts (`relationships/timeline.ts:91`, `VaultMap.tsx:44`)
- the keyboard helpers (`NetworkMap.tsx:19`, `VaultMap.tsx:76`)
- the two `MapEdge` types
- the affinity colours that disagree (`GraphCanvas.tsx:37` vs `global.css:661`)
- `setParam`, copied in three pages

**Renderers.** SVG up to a few hundred marks. Canvas only for the knowledge graph. Pointer events, never native drag and drop. Every drag also has a keyboard or menu equivalent. Respect `prefers-reduced-motion`, which today only `global.css:1278` and `:1638` honour.

### 3.11 Undo and redo (P28 "where the project supports it")

**Conflict.** The app has no undo outside the TipTap editor. Writes go straight through services under the collaboration guard (`collab/guard.ts`) and sync, so a database-level undo would replay other people's changes and bypass permissions.

**Solution.** `viz/history.ts` keeps a command stack for each view. Each entry is `{ label, do(), undo() }`, and both functions call **existing service methods**. Rules:
- The stack lasts only for the session.
- It is cleared when the view or project changes.
- If an undo fails, the error is shown and that entry is dropped.

### 3.12 Navigation between views (P15)

New `model/navigate.ts`, `routeFor(ref)`:

| Ref | Route |
|---|---|
| entry | `characters/:id` or `codex/:id` |
| node | `manuscript/:id` |
| event | `timeline?event=` |
| thread | `plot?thread=` |
| map pin | `visualize/maps?pin=` |

- The selection lives in the URL (`?select=type:id`), so the browser and the Android back button work. Android back already goes through `App.tsx:45`.
- A shared `<DetailPanel>` shows any ref's links via `connectionsOf`.
- Refs that point at deleted records render as "This record was deleted", with the id.

### 3.13 Permissions, sync, backup and import for every new table (P11, P48)

Each new table needs all of the following:

1. **Schema.** A string `id` and an indexed `projectId`. Declared in `core/db.ts` *after* the existing versions, starting at v27 (v26 is the rank and table upgrade, Prompt 5). (v23, v24 and v25 are currently declared out of order at `db.ts:192-195`; don't add to that.)
2. **Registry.** `registry.registerCollection({ table, refs, remap, fork })`. This puts the table in backup, duplicate, fork, cascade delete and sync automatically.
3. **Visibility.** Add the table to `LORE` or `PLANNING` in `sync/access.ts:61-64`. Otherwise `visible()` hides its rows from editors, readers and viewers.
4. **Sync labels.** A display name in `TABLE_NAMES` (`sync/service.ts`). Add `IGNORED` fields in `sync/types.ts` if needed.
5. **Import safety (gap found).**
   - `importSnapshot` (`projects/service.ts:246-262`) keeps only the collections it knows and **silently drops the rest**.
   - `SNAPSHOT_VERSION` is still 3, so an older copy of the app would import a newer file and lose the new tables without a word.
   - Fix in P11: raise `SNAPSHOT_VERSION` to 4 when the first new table ships, so older copies refuse the file with a clear message. Also warn when a file contains collections this version does not know.
   - Unknown *fields* on known rows already survive, because rows are spread as-is (`{ ...original }`).
6. **Read-only views.** `ReadOnlyScope` disables inputs only. Visual editing must check `can(role,'write')` and turn off dragging.

### 3.14 Page wiring for any new page

1. A route in `src/app/App.tsx`.
2. A `PAGES` entry in `studio/panels.tsx:21`.
3. `EDITOR_PAGES` in `sync/access.ts:174`.
4. A tutorial topic in `tutorial/topics.ts`. `tutorial.test.ts` fails for any page without one.
5. Optionally, a `CENTERS` entry.
6. On phones the page is reached through More. The `TabBar` in `platform/components/Shell.tsx` stays unchanged.

---

## 4. Prompt-by-prompt map

Key: **M** = must-have foundation, **F** = feature, **O** = optional. "Data" means schema or field changes.

### Phase 1: inspect, plan, protect

| P | Work | Files | Data |
|---|---|---|---|
| 1 | Audit (done) | none | none |
| 2 | This plan | `docs/visualization-plan.md` | none |
| 3 **M** | Baseline (§2) | none | none |
| 4 **M** | Acceptance checklist; the out-of-scope list (AI, rewriting, automatic canon changes, redesigns) | `docs/visualization-acceptance.md` | none |

### Phase 2: shared data

| P | Work | Files | Data |
|---|---|---|---|
| 5 **M** | Confirm UUID ids. Add rename and reorder stability tests (node `order` and title, entry name, thread title). Fix `CharacterProfile.linkStatus` remap. Note that nested ids (beats, stages, `SysItem`) are stable within their row. | `characters/service.ts:12`, `*.test.ts` in manuscript, codex, plot, characters | `remap` added, no migration |
| 6 **M** | `EntityRef`, `loadModel`, `resolveRef`, validators (§3.2). Document the models still to come (maps, layers, calendars). | new `src/modules/model/{refs,resolve,validate}.ts`, `model.test.ts` | none |
| 7 **M** | Typed links (§3.3), `connectionTypes.ts`, `connectionsOf()`. `graph/build.ts` moves onto it with the same output (`graph.test.ts` stays green). | `codex/types.ts`, `codex/service.ts` (`link()` accepts type, endpoint types, notes), `model/connections.ts` | Optional `LoreLink` fields |
| 8 **M** | `Validity`, `validAt`, `historyOf` (§3.4). Wired into the optional anchor fields. | `model/validity.ts`; types and remaps in relationships, progression, systems, continuity, codex | Optional fields |
| 9 **M** | Event fields (§3.5); `resolveChronology` spans; `EventDetails` edits the new fields | `timeline/{types,service,chronology}.ts`, `components/EventDetails.tsx` | Optional fields; registry refs |
| 10 **M** | `model/query.ts` `select()` with `excluded` reasons (§3.9) | new; `query.test.ts` (combined filters, empty, 5,000 records, incomplete data) | none |
| 11 **M** | §3.13 items 5–6: `SNAPSHOT_VERSION` 4, unknown-collection warning, round-trip tests for every new field and table. Autosave stays `SavedText` and service writes; sync stays separate. | `projects/{service,types}.ts`, `projects/service.test.ts`, `ImportDialog.tsx` | Snapshot v4 (v3 files still import) |

### Phase 3: framework and workspace

| P | Work | Files | Data |
|---|---|---|---|
| 12 **M** | `viz/` kit (§3.10). NetworkMap and VaultMap move onto it with no change in behaviour. | `src/modules/viz/*`, `global.css` (new section), `viz.test.ts` | none |
| 13 **M** | Visualize hub (§3.1, §3.14). Tabs: Timeline, Relationship map, Plot board, Knowledge graph, Places, Progression. Each tab has an empty state. | `visualize/VisualizePage.tsx`, `App.tsx`, `panels.tsx`, `access.ts`, `store.ts`, `topics.ts` | none |
| 14 **M** | Saved views (§3.8): rename, duplicate, delete, restore default | `viz/views.ts` service, `<ViewPicker>` | **v27** `savedViews`, `vizLayouts` |
| 15 **M** | `routeFor`, `?select=`, shared `<DetailPanel>`, deleted-reference handling (§3.12) | `model/navigate.ts`, `viz/DetailPanel.tsx`; e2e "Visualize 15" | none |

### Phase 4: timeline

| P | Work | Files | Data |
|---|---|---|---|
| 16 **F** | Graphical axis plus the existing list. Undated events in an "Unplaced" strip. | `timeline/components/ChronologyAxis.tsx`, `TimelinePage.tsx` (`?view=list|axis`) | none |
| 17 **F** | Scales from hours to centuries plus eras; zoom, pan, fit, jump-to-date, range selection; calendars (§3.7) | `timeline/{calendar,scale}.ts`, a calendar editor in timeline settings | **v28** `calendars` |
| 18 **F** | Tracks by character, faction, location, thread or custom; show, hide, reorder, collapse, focus. One event can sit on several tracks. | `timeline/tracks.ts`, axis component; order kept in `savedViews` | none |
| 19 **F** | Lane packing for overlaps; distinct marks for instant, span, ongoing and uncertain events | `timeline/layout.ts` (pure) | Uses P9 fields |
| 20 **F** | Reading order vs story order view; `reveals` roles; a nonlinear test fixture; never reorders chapters | `timeline/components/OrderCompare.tsx`, `chronology.ts` `orderCrossings()` | Uses `reveals` |
| 21 **F** | Age at each event: from `EventCharacter.age` (age 0 marks birth) as known, approximate (range) or unknown. Life view combining events, appearances, places, affiliations, relationship stages and abilities. | `timeline/ages.ts`, extend `lifePath` (`chronology.ts:183`), a "Life" tab on the character profile (`characters/components/Tabs.tsx`) | none |
| 22 **F** | What-if timelines (§3.6) | `timeline/layers.ts`, a layer picker, a compare view | **v29** `storyLayers`; `branchId` / `replacesId` |
| 23 **F** | Edit on the timeline through `timeline.update`. Warnings: contradicting dates (already in `resolveChronology`); a character in two places at once; travel shorter than a recorded `travel` rule. Each explains its rule; uses the existing `continuityResolutions` for dismiss and intentional. | `timeline/checks.ts` (pure), shown on the axis and on the Continuity page | none |

### Phase 5: relationships

| P | Work | Files | Data |
|---|---|---|---|
| 24 **F** | Configurable types: built-in `RELATION_PRESETS` plus project-defined ones. Optional numeric attributes (trust, fear and so on) appear only when the author switches them on. The manager reads and writes through `relationships` service. | `relationships/{types,service}.ts`, `RelationDetails.tsx` | Optional `RelationStage.attributes?`; project setting in a new `relationTypes` table **or** in `loreSchemas` (decide in P24) |
| 25 **F** | Stage anchors gain an event or date (P8); history shows the cause the author links (`causeEventId?`, `causeNodeId?`) | `relationships/timeline.ts` (`stageAt` honours `validAt`), history UI | Optional fields |
| 26 **F** | Force-layout map on `<Viewport>`: drag to pin (`vizLayouts`), focus and neighbourhood, filters (type, current or historical, chapter range, faction, character), direction arrows plus line style (not colour alone); the table remains | `relationships/components/NetworkMap.tsx`, `RelationshipsPage.tsx` | none |
| 27 **F** | Secrets: add `believesFalse?: string[]` (with what they believe instead) and `learned?: { entryId, state, nodeId?, eventId?, how }[]` as history. Spread view: characters × reading or event order. Inconsistency warnings only from explicit rules. | `characters/types.ts:71`, `characters/service.ts`, `characters/components/SecretSpread.tsx` | Optional fields |

### Phase 6: boards and structure

| P | Work | Files | Data |
|---|---|---|---|
| 28 **F** | Card board for chapters and scenes. Columns are acts, arcs or chapters; cards show status and word counts. Pointer-based moves go through `manuscript.move`, and the keyboard uses `nudge` or "Move to…". Undo (§3.11). Multi-select moves need confirmation. The Organizer outline stays. | `manuscript/components/Board.tsx`, `OrganizerPage.tsx` (`?view=outline|board`) | none |
| 29 **F** | Plot lanes: threads × chapters, beats as cards; gaps shown as "no beat recorded"; filter and jump to scene; beats can link to events | `plot/components/PlotLanes.tsx`, `PlotPage.tsx` | Optional `ThreadBeat.eventId?`, `order?` |
| 30 **F** | Structural markers and scene labels chosen by the author; length and distribution charts; a note that the charts describe data, not quality | `ChapterPlan` gains `labels?: string[]`, `markers?: string[]`, `povId?: string`, plus a project label list; `PlanForm.tsx`; `analytics/compute.ts`; chart views | Optional plan fields (planning layer, per the PLANNING vs MANUSCRIPT rule) |
| 31 **F** | Appearance matrix: present (`ChapterPlan.entityIds`), mentioned (`StoryNode.mentions`), otherwise unknown, never "absent". Filters; a click opens the chapter or toggles presence through `manuscript.updatePlan`. | `analytics/components/AppearanceMatrix.tsx` (extends `Strip`) | none |

### Phase 7: knowledge graph

| P | Work | Files | Data |
|---|---|---|---|
| 32 **F** | Graph over `connectionsOf` (threads, typed links and abilities added); legends; detail panel; keyboard node cursor on the canvas; positions in `vizLayouts` | `graph/{build,GraphCanvas,GraphPage}` | none |
| 33 **F** | Path highlight (breadth-first search); collapse groups; show or hide node and edge types; "Showing N of M" when limited; restore full view; a repeatable 1,000- and 5,000-node benchmark | `graph/build.ts` (`pathBetween`), `GraphPage.tsx` | none |
| 34 **F** | Link status (§3.3). Checks for dangling references (any registered `refs` field pointing at nothing), possible duplicates (normalized names) and unresolved in-text links. **Merging entries** rewrites references in every table through the registry's `refs`/`remap`, the same mechanism duplicate uses, and needs explicit approval. Backlinks in both directions through `crossref`. | `model/integrity.ts`, `codex/service.ts` `merge()`, an integrity view on the Continuity page | none |

### Phase 8: custom data and progression

| P | Work | Files | Data |
|---|---|---|---|
| 35 **F** | Codex categories already cover most of this. Add `required?` and `validation?` (min, max, pattern) to field definitions, validation in `EntryEditor`, and a check that custom entries are searchable, exportable and appear in the graph. | `codex/{types,schema,service}.ts`, `SchemaDialog.tsx`, `FieldsEditor.tsx` | Optional fields on the category schema |
| 36 **F** | `Category.viz?`: `{ dateFieldId?, endFieldId?, xFieldId?, yFieldId?, rankFieldId?, graph?: boolean, connectionFieldIds? }`, set explicitly and checked. If a view lacks what it needs, it says what is missing and offers the table. | `codex/types.ts`, `SchemaDialog.tsx`, `model/resolve.ts` | Optional field |
| 37 **F** | Progression: categories set per sheet (already genre-neutral); changes anchored to event or chapter (P8); an empty state for characters with nothing tracked; stat chart (`ArcChart`) | `progression/*`, `systems/*` | Uses P8 fields |
| 38 **F** | Ability tree: `SysItem.links?: { toId, kind: 'prerequisite'|'upgrade'|'evolution'|'fusion'|'replaces'|'exclusive'|string }[]` alongside `parentId` and the free-text `requires`. Cycle and invalid-edge checks. Holders from `SystemSheet.itemIds`, acquisition from `xp` or snapshots. | `systems/{types,tree}.ts`, `systems/components/AbilityTree.tsx` in `BlueprintTabs` and `SheetsTab` | Optional `links` inside the blueprint JSON (no registry remap needed) |

### Phase 9: places, factions, objects

| P | Work | Files | Data |
|---|---|---|---|
| 39 **F** | **Places explorer** without a map: a tree from typed links `located-in` (P7). Location types are categories or a field. Each place lists its characters, events, factions and chapters. Optional maps: `maps` + `mapPins`, with images as downscaled data URLs through `shared/image.ts` (add a `maxEdge` parameter; the default stays 800). Keyboard pin placement; places with no coordinates stay in the list. | new `src/modules/places/` (`PlacesPage`, `service.ts`, `tree.ts`, `MapView.tsx`) | **v30** `maps`, `mapPins` |
| 40 **F** | Journeys are duration events with `locationId` → `toLocationId` (§3.5). Location history comes from events. Routes are drawn when both ends are pinned, otherwise shown as a list. Travel warnings only from author-set `travel` rules; no real-world speeds. | `places/routes.ts`, `timeline/checks.ts` | Uses P9 fields |
| 41 **F** | Membership, leadership and ownership as typed links with validity (P7, P8). Item history (created, found, transferred, stolen, inherited, lost, destroyed) as link types plus events. The existing continuity `possession` rules are shown as a second source, not migrated. Territories: optional map regions. What-if layers respected. | `places/` or `codex/components/HistoryOf.tsx`, `model/query.ts` | Optional `mapRegions` (O) |

### Phase 10: canon, continuity, analytics

| P | Work | Files | Data |
|---|---|---|---|
| 42 **F** | Use the **existing** `CANON_STATUSES`; no new set. Mapping: pack "confirmed" = `canon`, "disputed" = `conflicting`, "alternate branch" = a what-if layer. Markers on events, nodes, edges and cards, from `canonFacts.entryIds`/`sources` and the new `canon?` fields. Structured-data checks gathered in `model/checks.ts`. | `canon/*`, `viz/Legend.tsx`, each view | none |
| 43 **F** | Extend the existing `ContinuityPage` instead of adding another dashboard: a "Structured records" tab listing every check by severity and category. `Resolution.kind` gains `'resolved' | 'review'`. "Ignored" maps to the existing `dismissed`, and notes already exist. "Confirmed data error" (a broken rule) is kept apart from "possible inconsistency". | `continuity/{types,service}.ts`, `ContinuityPage.tsx` | Union widened; no migration |
| 44 **F** | Charts: words per chapter, length distribution, appearances, thread presence, event density over time, point of view (only if `povId` is recorded), labels. Each says which data it uses; each has a table and a CSV download. | `analytics/compute.ts`, `DashboardPage.tsx`, `viz/charts/*`, `shared/download.ts` | none |

### Phase 11: polish and verification

| P | Work | Files | Data |
|---|---|---|---|
| 45 **M** | Accessibility and responsive pass on every view at 720, 1100 and desktop widths: no information carried by colour alone, keyboard alternatives for drags, reduced motion | `global.css`, views; e2e checks | none |
| 46 **F** | Export views as SVG, PNG (canvas), CSV, JSON (the view's records by id plus data) and print CSS. Title, filters and a timestamp included. AUTHORS_ONLY tables (secrets, notes) are left out unless the author opts in. Works offline. | `viz/export.ts`, `shared/download.ts` | none |
| 47 **M** | A large-story fixture generator for tests only; benchmarks before and after; memoization, indexes, limits | `model/fixtures.test-util.ts`, benchmarks in `*.test.ts`, `docs/visualization-benchmarks.md` | Maybe indexes |
| 48 **M** | Audit of persistence, migration (v25 → latest) and module toggles; document backup and recovery | tests in `projects/service.test.ts`, `docs/` | none |
| 49 **M** | The pack's 10-step cross-feature scenario as a new e2e section | `e2e/smoke.mjs` (or `e2e/visualize.mjs` with the same helpers; ask first) | none |
| 50 **M** | Final review against the P4 checklist | `docs/visualization-review.md` | none |

### Optional follow-ups

| | Work | Notes |
|---|---|---|
| A | Design tokens for the visual views | Builds on the `--aff-*` and `--chart` variables |
| B | Configurable dashboard widgets | `DashboardPage` + `savedViews`; layout in its own table |
| C | QA sample novel | Built through `projects.importSnapshot` from a test fixture, labelled "Sample", never imported automatically |
| D | Visualizations as modules | Reuse the `extensions` enable/disable approach, where nothing is deleted; `unlocks`, as with the `progression` page today |
| E | Screenshot review | none |

---

## 5. Dependencies and safe order

```
P3 baseline ─► P4 criteria ─► P5 ids ─► P6 contracts ─► P7 links ─► P8 validity ─► P9 events
                                                                              │
                                                     P10 query ◄──────────────┘
                                                         │
                                                     P11 persistence (snapshot v4)
                                                         │
                         P12 kit ─► P13 hub ─► P14 saved views ─► P15 navigation
                                                         │
     ┌───────────────────┬───────────────────┬───────────┴─────┬──────────────────┬─────────────────┐
  P16–23 timeline   P24–27 relations   P28–31 boards     P32–34 graph     P35–38 custom +   P39–41 places
  (P17 calendars    (P25 needs P8)     (P29 uses P9      (P32 needs P7)   progression       (needs P7, P8,
   before P18–21;                       threadIds)                         (P36 needs P35)    P9; P40 needs P23)
   P22 before P23)
     └───────────────────┴───────────────────┴─────────────────┴──────────────────┴─────────────────┘
                                                         │
                                       P42 canon overlays ─► P43 continuity ─► P44 analytics
                                                         │
                                       P45 a11y ─► P46 export ─► P47 performance ─► P48 persistence ─► P49 integration ─► P50 review
```

Phases 4–9 depend only on Phases 2–3, so they *can* be reordered. The pack's order is safe, and you should keep it.

**Checkpoints:** follow the pack's list (commits after P4, 11, 15, 23, 27, 31, 34, 38, 41, 44, and a tag after P50). Those commits need git (P3.2).

---

## 6. Must-have vs optional

**Must-have foundations:**
- P3–P15, which cover the baseline, criteria, ids, contracts, links, validity, events, query, persistence, kit, hub, saved views and navigation
- P45 and P47–P50, which cover verification

**Features (the pack's core):**
- P16–P44
- Within these, the following are **optional** and can be cut without blocking later prompts:

| Optional piece | Prompt |
|---|---|
| Custom calendars beyond the default | P17; the default calendar stays |
| What-if timelines | P22 |
| Relationship attributes | P24 |
| Secrets spread view | P27 |
| Structural markers | P30 |
| Graph path highlighting | P33 |
| Map images | P39; the places explorer is required |
| Territories | P41 |
| PNG export | P46 |

**Optional follow-ups:** A–E.

---

## 7. Conflicts and their smallest compatible solutions

| Conflict | Smallest compatible solution | § |
|---|---|---|
| "Workspace" already means the Studio | Name the page **Visualize** | 3.1 |
| Two edge stores already exist | Extend `loreLinks` with optional fields; adapt `characterRelations` | 3.3 |
| Every time anchor is a reading position | Optional `Anchor` of node, event or date next to the existing `nodeId` | 3.4 |
| `TimelineEvent` has no end, threads, status or canon | Optional fields; keep `nodeIds` and add `reveals` | 3.5 |
| Alternate timelines copy the whole project | Keep project forks; add in-project what-if layers (`storyLayers`) | 3.6 |
| Calendar is hard-coded | `calendars` table; the default reproduces today's numbers | 3.7 |
| Abilities are not rows | Composite refs `systemId/itemId` | 3.2 |
| No location hierarchy | `located-in` typed links instead of a `parentId` on entries | 4 (P39) |
| No app-level undo | A per-view command stack over service calls | 3.11 |
| Imports silently drop unknown tables | `SNAPSHOT_VERSION` 4, plus a warning on unknown collections | 3.13 |
| New tables are invisible to editors and readers | Add them to `LORE` / `PLANNING` in `access.ts` | 3.13 |
| Sync merges field by field | One row per placed item; images in their own row | 3.8 |
| Native drag and drop fails on touch | Pointer events plus keyboard and menu moves | 3.10 |
| Continuity dashboard already exists | Extend `ContinuityPage`; widen `Resolution.kind` | 4 (P43) |
| Canon states already exist | Map the pack's names onto `CANON_STATUSES` | 4 (P42) |
| Possession rules overlap with ownership | Show both sources; do not migrate | 4 (P41) |
| Tests run in node without a DOM | Keep logic in pure `.ts` and test it with Vitest; cover rendering in e2e; add jsdom only if a prompt needs component tests (ask first) | 8 |

---

## 8. Testing approach

- **Unit tests** (`npm test`, Vitest in node with `fake-indexeddb`): every pure function (validity, query, layout, scale, checks, tree cycles, diff) and every service change. Every new field or table gets a test proving it survives duplicate, import and fork with its ids relinked.
- **Types:** `npm run typecheck`.
- **E2E:** one `// --- Visualize Pn: … ---` section per feature prompt in `e2e/smoke.mjs`. Each covers:
  - the empty state
  - the visual and the list showing the same records
  - the keyboard path
  - phone width without horizontal overflow (as at `smoke.mjs:1667`)
  - dark mode
  - reload keeping its state
- **Offline:** `npm run test:offline` after P13 and P46.
- **Lint:** none is configured. Say so in reports; don't add one without asking.
- **Regression:** run the full suite after every prompt and report the real results.

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| Optional-field growth makes types hard to read | Defaults in one `normalize*()` per type, as `projects/service.ts` `normalizeInput` already does |
| Graph refactor onto `connectionsOf` changes output | `graph.test.ts` and e2e Phase 15 are the guard; same output before and after |
| Calendar change shifts existing event positions | Golden test: today's fixtures give identical minutes with `DEFAULT_CALENDAR` |
| What-if layers leak into canon views | Default query filter `branchId == null`; isolation tests (P22) |
| Merging entries corrupts references | Uses the registry ref machinery already proven by duplicate and import; preview and confirmation; tests across every table |
| Map images bloat storage, exports and sync | Downscaling, size warning, a row of their own |
| `smoke.mjs` (6.6k lines) becomes unwieldy | Self-contained sections; propose a split only with approval |
| Schema version ordering confusion | New versions appended at the end of the constructor only |

---

## 10. Open questions

1. May I run `npm ci` and `git init` with a baseline commit (Prompt 3)?
2. Is **Visualize** acceptable as the page name? Are **What-if timelines** and **Places** acceptable names?
3. Where is the 41-feature roadmap?
4. Should graph and relationship-map positions sync between co-authors (as planned), or stay on each device?
5. P24: should custom relationship types live in a new `relationTypes` table, or alongside codex categories in `loreSchemas`?
