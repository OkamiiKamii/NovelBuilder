# Typed connections (Prompt 7)

**Written:** 2026-10-21.
**Code:**
- `src/modules/connections/`
  - `types.ts`: kinds and how they read
  - `service.ts`: create, update, remove
  - `cascade.ts`: removal with deleted records
- `codex/types.ts` (`LoreLink`)
- `model/connections.ts`

**Tests:** `connections/connections.test.ts`, 9 tests.

## One place for connections

The app already stored the codex's related entries in `loreLinks`, one row per pair with a label for each side. That table was extended instead of adding a second connection store. Existing rows keep their meaning exactly, and every new field is optional.

| Field | Meaning | Required |
|---|---|---|
| `id` | Stable id (`createId()`), remapped on copy and import like every row | yes |
| `fromId`, `toId` | The two records, **by id only**; nothing of either record is copied | yes |
| `fromType`, `toType` | `node`, `entry`, `event`, `thread`, `relation` or `ability` (abilities are `<systemId>/<itemId>`); `entry` when absent | no |
| `type` | A known kind (below) or the author's own word, **kept exactly as written** (only trimmed). Absent: a plain related-entries link | no |
| `fromLabel` / `toLabel` | Each side's own wording, when the author gives one | yes (may be empty) |
| `notes` | Free text | no |
| `canon` | One of the existing `CANON_STATUSES` | no |
| `createdAt`, `updatedAt` | When it was made and last changed | `createdAt` yes |

**Time** (when a connection holds in the story) is Prompt 8's job and will be added there as optional `validity`.

## Direction, and what the other side sees

A connection is **one statement made from its `from` side**. How it reads from the other end depends on its kind (`connections/types.ts`):

| Kind | Read from the other end | Examples |
|---|---|---|
| Mutual (`same`) | The same words | `related`, `allied-with` |
| Fact with a converse | The plain converse; no one's opinion is guessed | `member-of` / "Has member", `owns` / "Owned by", `located-in` / "Contains", `leads`, `created-by`, `caused`, `occurred-at`, `appears-in`, `knows-about` |
| One-sided (`null`) | **Nothing** | `considers-rival`, `considers-friend`, `distrusts`, and **every kind the author makes up** |

- "Mira considers Orrin a rival" says nothing about what Orrin thinks. If Orrin considers Mira a friend, that is **his own** connection, `considers-friend` from Orrin to Mira.
- Each side then sees its own words as `label` and the other's as `theirLabel`, through `connectionsOf` in the model, which uses the same terms as the codex's related entries.
- The author's own wording on either side always takes precedence over the kind's wording.

## Integrity

- **Both ends must exist in the same project** when a connection is made. The service checks:
  - the ref's shape;
  - that a record isn't connected to itself;
  - that each end exists in this project (for an ability, that the blueprint holds the item).
  It says which end is wrong.
- **No duplicates.** The same kind between the same two records in the same direction is refused. Different kinds between the same pair are separate connections.
- **Deletion removes the connection with the record, never the other end:**

  | Record deleted | Where |
  |---|---|
  | Entry | `codex.remove`, as before, plus the connections of the character relationships deleted with it |
  | Event | `timeline.remove` |
  | Plot thread | `plot.remove` |
  | Chapter or scene, with everything inside it | `manuscript.remove` |
  | Relationship | `relationships.remove` |
  | Blueprint, or an item taken out of it | `systems.remove` / `systems.update` |

  Anything that still points at nothing is reported by `deriveConnections` as `dangling`, never hidden.
- **Copies and imports** rewrite both ids. An ability's blueprint id is rewritten too, while its item id stays (`codex/service.ts` `registerCodex` remap).

## What existing screens see

- **Codex, character profiles, exports, the Story graph.** `codex.links()` and the two direct readers (`exchange/service.ts`, `characters/service.ts`) list only connections **between two entries**, so nothing that expects two entries ever receives an event or a chapter.
  - Typed links between entries appear in "Related entries" in each side's words ("Member of" / "Has member").
  - The plain related-entries link can still be made beside typed ones. "Already linked" now applies only to that plain link.
- **Roles.** A connection that touches a chapter or a plot thread is shown only to roles that may read the plan (`sync/access.ts`). Today every role that reads lore also reads the plan, so nothing changes for current roles.
- **Story graph.** Not moved onto `deriveConnections` in this step. Its output is unchanged, and Prompt 32 rebuilds it over the shared connections.

## Not in this step

- Time (Prompt 8).
- A screen for making typed connections. The service exists for the views to come; for now the codex's related-entries editor still makes the plain link.
