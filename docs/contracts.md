# Shared record contracts (Prompt 6)

**Written:** 2026-10-21.
**Code:** `src/modules/model/`
- `types.ts`: the contracts
- `model.ts`: load, build, resolve
- `connections.ts`: typed connections
- `validate.ts`: validation

**Tests:** `model.test.ts`, 10 tests.

These contracts are a **read model over the tables the app already has**. They add no table and copy no record. A view reads `loadModel(db, projectId)` and gets every relevant row indexed by id. It edits through the owning record's existing service (`manuscript`, `codex`, `timeline`, …), never through the model.

## Entities

A record is named by `EntityRef = { type, id }`, always by its stable id and never by name, title or position (see `identifiers.md`).

| Contract type | Existing record | Table | Kind shown (`EntityView.kind`) |
|---|---|---|---|
| (the novel) | `Project` | `projects` | `model.project`; every other record belongs to it |
| `node` | `StoryNode`: volume, act, arc, **chapter**, **scene** | `chapters` | the node kind |
| `entry` | `LoreEntry`: **characters, locations, factions, items**, powers, lore and **custom record types** | `loreEntries` | the category key (`character`, `location`, `faction`, `item`, `custom-…`) |
| `event` | `TimelineEvent` | `timelineEvents` | `event` |
| `thread` | `PlotThread` | `plotThreads` | `thread` |
| `relation` | `CharacterRelation` | `characterRelations` | `relation` |
| `ability` | `SysItem` inside a `SystemBlueprint` | `systems` (inside the row) | `ability`; id is `<systemId>/<itemId>` |

**Adapted, not duplicated:**
- Characters, locations, factions and items are all codex entries, told apart by category. Custom types are custom categories, so there are no separate character, location or faction models.
- Abilities are not rows of their own, so their ref combines the blueprint id and the item id. Both are stable.
- The codex's `power` category (free-form power entries) remains an `entry`. Structured abilities are `ability`.

### Required vs optional fields

`REQUIRED` in `validate.ts` lists what a record **must** have. `validateRecord(type, row)` reports, in words, what is wrong with a stored record. It never changes the record.

| Type | Required |
|---|---|
| node | `id`, `projectId`, `kind` (one of volume/act/arc/chapter/scene), `title` (may be empty), `parentId` (id or null), `order` |
| entry | `id`, `projectId`, `category`, `name` |
| event | `id`, `projectId`, `name`, `when` (with a known precision) |
| thread | `id`, `projectId`, `title`, `status` |
| relation | `id`, `projectId`, `fromId`, `toId` (two different characters) |
| ability | `id`, `groupId`, `name` |

**Backward compatibility.** Every other field is optional for the contract. `buildModel` reads lists that older rows lack as empty:
- `mentions`, `entityIds`, `fields`, `tags`
- `stages`, `characters`, `entryIds`, `nodeIds`
- `beats`, `characterIds`, `locationIds`, `groups`, `items`, `itemIds`

It also reads missing `afterId`, `locationId` and `targetNodeId` as `null`. Fields a later version adds are absent here and are ignored, not stripped.

### Resolving

- `resolveRef(model, ref)` returns `{ found: true, view: { ref, label, kind } }`, with the name as it is now, or `{ found: false, ref }` for a deleted record or another project's. It never throws.
- `refKey` and `parseRefKey` turn a ref into `entry:<id>` and back, for URLs and selection.

## Connections

`deriveConnections(model)` returns `{ connections, dangling }`. Each `Connection` holds:

| Field | Meaning |
|---|---|
| `id` | Stable while the connection exists, because it is built from where the connection is stored. It survives renames and reorders, which is tested. |
| `kind`, `from`, `to` | Refs only, never copies of the records |
| `label` | The `from` side's wording |
| `reverseLabel?` | The `to` side's wording, **only when the author gave one** |
| `directed` | Whether the direction matters ("Mentor → Student") |
| `source { table, id }` | Where it is stored, i.e. what to open or change |

| Kind | From → to | Read from |
|---|---|---|
| `part-of` | node → node | `StoryNode.parentId` |
| `link` | any → any | `loreLinks`: the codex's related entries, or a typed connection (`type`, notes, canon). See `connections.md` |
| `relationship` | entry → entry | `characterRelations`, latest stage (`fromRole` / `toRole` when directional) |
| `field` | entry → entry | reference and multi-reference fields, named after the field |
| `mentioned` | entry → node | `StoryNode.mentions` (linked in the text) |
| `present` | entry → node | `ChapterPlan.entityIds` (listed by the author) |
| `participant` / `involved` | entry → event | `TimelineEvent.characters` / `entryIds` |
| `occurs-at` | event → entry | `TimelineEvent.locationId` |
| `told-in` | event → node | `TimelineEvent.nodeIds` (reading order; separate from the event's date) |
| `follows` / `dated-from` | event → event | `afterId` / a relative date's `anchorId` |
| `thread-entry` | thread → entry | `PlotThread.characterIds`, `locationIds` |
| `beat` / `resolves-in` | thread → node | `beats[].nodeId` / `targetNodeId` |
| `holds` | entry → ability | `SystemSheet.itemIds` |
| `branches-from` | ability → ability | `SysItem.parentId` |

**Each side keeps its own wording.**
- `connectionsOf(connections, ref)` lists a record's connections as that record sees them: `label` is this side's wording and `theirLabel` the other's. This is the same pair of terms the codex already uses for related entries.
- One side's words are never shown as the other's. When Orrin calls Mira a rival, Mira's view shows no label of her own, with "Rival" as Orrin's wording.

**Dangling ends are reported.**
- A connection whose end no longer exists goes into `dangling`, together with the missing refs, and is not dropped silently.
- For example, deleting a location removes its codex links and relationships (`codex.remove`), but an event or thread that names it is reported.
- `validateConnection` checks the kind, the endpoint types (`ENDPOINTS`), self-links and missing ends.

**Not changed in this step:** the Story graph (`graph/build.ts`) still uses its own derivation. Moving it onto `deriveConnections` with identical output belongs to Prompt 7, together with typed and stored connections.

## Models to add later (documented, not built)

| Needed for | Model | Where it will live | Prompt |
|---|---|---|---|
| Typed, directional, stored connections | Optional `LoreLink` fields `type`, `fromType`/`toType`, `notes`, `canon`, `updatedAt` | `loreLinks` (extended) | **Done** (P7), see `connections.md`; `validity` in P8, `status` in P34, `branchId` in P22 |
| Facts that change over fictional time | `Validity` / `Anchor` (chapter, event or date) | **Done** (P8) on `LoreLink.validity`; read-only views of stages, rules and snapshots. Event and date anchors for stages, snapshots and XP come in P25 and P37. See `validity.md` | P8 |
| Event end dates, threads, status, canon, reveal roles | Optional `TimelineEvent` fields; `eventRecord` view | `timelineEvents` | **Done** (P9), see `events.md` |
| Query and filter helpers | `select`, `selectConnections`, `combine` (`model/query.ts`) | Read-only | **Done** (P10), see `query.md` |
| Saved views and graph/map positions | `savedViews`, `vizLayouts` | New tables | P14 |
| Custom calendars | `calendars` | New table | P17 |
| What-if timelines | `storyLayers` | New table | P22 |
| Scene labels, structural markers, POV | Optional `ChapterPlan.labels`, `markers`, `povId` | `chapterPlans` | P30 |
| Ability edges (prerequisite, upgrade, evolution…) | Optional `SysItem.links` | Inside blueprints | P38 |
| Maps and pins | `maps`, `mapPins` | New tables | P39 |
| Rank and matrix ids | `Named` ranks, rows and columns; `SysItem.rankId` | Inside blueprints | **Done** (schema v26), see `identifiers.md` |

When each lands, add its entity type or connection kind to `types.ts`, its required fields to `REQUIRED`, and its derivation to `deriveConnections`, with tests.
