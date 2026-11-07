# Record identity (Prompt 5)

**Written:** 2026-10-21.
**Scope:** how the app identifies records, what was fixed, and what is still designed but not built.

## The strategy, unchanged because it is sound

- **New ids.** Every project-owned row gets `crypto.randomUUID()` (`src/core/id.ts`).
- **Ids never change.** Nothing changes an id after creation:
  - Renaming changes `name`/`title`.
  - Reordering changes `order` (`StoryNode.order` is documented "Never used to identify a node").
  - Moving changes `parentId`.
- **Copies get fresh ids.** Duplicate, import and fork give every row a fresh id through one id map built across **all** durable tables (`projects/service.ts` `restoreMapped`). Every field listed in a table's `refs` is rewritten through that map, and a table's `remap` handles ids nested inside it. An id the map doesn't know passes through unchanged.
- **Ids inside one record.** Beats, stages, blueprint items, groups, tracks and plan beats carry their own `createId()` ids. They are unique within their row, and the array order is only display order.
- **Deliberate exceptions:**
  - **`characterProfiles` ids are `profile-<entryId>`** (`characters/service.ts`). This is deterministic on purpose: two devices that create the same profile write the same row, not two. Lookups always go through the indexed `entryId`, never the id, and copies get a UUID like any row.
  - **Preset blueprint ids** are built from names once, at creation (`systems/presets.ts`, for example `` x-${toKey(name)} ``). Later renames don't touch them.

## Fixed in this step

| Problem | Effect before | Fix |
|---|---|---|
| `CharacterProfile.linkStatus` is keyed by `LoreLink` id, and nothing rewrote the keys | After duplicate, import or fork, a character's tie statuses ("Estranged") pointed at the original project's links and disappeared | A `remap` on `characterProfiles` (`characters/service.ts`) |
| `members`, `comments`, `suggestions` and `activity` had no `refs`/`remap`. They travel in full archives (`optional`), so importing one gave every row a new id but left the ids inside rows alone. | After restoring a full archive: reply threads broke (`threadId`, `parentId`); comments, suggestions and activity pointed at old chapters, entries and threads; authors no longer matched team members; "converted to…" links pointed at the old project | `refs` + `remap` per table (`collab/service.ts` `registerCollab`). Comment targets and `targetKey` are rebuilt, and verdict authors and `converted.to` are rewritten. `resolvedBy` and `decidedBy` hold **names**, so they are left as they are. Plain copies and forks still start with no team or conversations (`fork: () => []`, unchanged). |

**Tests:** `src/modules/projects/identity.test.ts`, 4 tests.
- Renames, nudges and moves keep the ids of chapters, scenes, entries, events, threads and relationships, and every link still resolves.
- Tie statuses survive duplicate and import.
- A full-archive round trip keeps every collaboration reference consistent, and leaves the source project untouched.
- With the fixes temporarily removed, the two copy tests **fail**; restored, all four pass.

**No migration is needed.** Both fixes act only when a project is copied or imported. Rows already stored are unchanged. Copies made *before* this fix keep their stale keys, and the effect is that their tie statuses show as blank, which is how they already appeared.

## Ranks and table cells: done

The owner doesn't use cloud sync, so the clean version was built. It has stable ids and keeps no label copies for older app versions.

- **New shape** (`systems/types.ts`):
  - `ranks: Named[]`, where `Named = { id, name }`.
  - `SysItem.rankId` replaces the old `rank` label.
  - Table `rows` and `columns` are `Named[]`, and cells are keyed `rowId|columnId`.
  - `rankName(system, item)` gives a rank's current name, wherever one is shown.
- **Conversion** (`systems/shape.ts` `upgradeShape`). It converts only these three things and drops nothing:
  - A rank label not in the list is added to the list.
  - A cell whose names match no row or column keeps its old key.
  - It is safe to run on data that is already converted.
- **Where conversion runs:**
  - The Dexie **v26** upgrade, for stored blueprints.
  - The `systems` registry `remap`, for old `.novel.json` files.
  - `tidy` and `instantiate`, for presets and saved custom modules.
  - The database upgrade deliberately calls `upgradeShape` and not `tidy`, because `tidy` drops items whose group is missing, and an upgrade must never delete anything.
- **Editor** (`BlueprintTabs.tsx` `NamedList`). Each rank, row and column is its own field, with rename, move and remove buttons, in the same pattern as the ladder-stage editor. The comma-separated boxes are gone. Removing a row or column also removes its cells.
- **Tests** (`systems.test.ts`, under "NAMES ARE NOT LINKS"):
  - Renames keep the links.
  - Opening a v25 database converts it and keeps everything, including an item whose group is gone and a cell with no matching row.
  - A file in the old shape imports with its links intact.
  - The "Tea Ceremony" test feeds `tidy` the old shape on purpose.
- **E2E:** the Systems section (Phase 19) now uses the list editor, and checks that renaming a table row keeps its cell.
- **Limitation:** two devices syncing through a relay must both run this version. Cloud sync is not used, per the owner.
- **Fix found in Prompt 8.** The list editor first computed each change from the list as it was *drawn*. Two quick clicks (removing two ranks) could then undo each other. Every change is now worked out from the blueprint as it is *stored* at that moment, which is the same rule as the rest of the blueprint editor; tables also keep their cells this way. The e2e check that removes two ranks in a row caught it.

## Earlier design notes (superseded by the section above)

Both of these live **inside one blueprint row** (`systems` table):

1. **Ranks.**
   - `SystemBlueprint.ranks` is `string[]`, and `SysItem.rank` stores the rank's *label* (`systems/types.ts:97,127`).
   - Ranks are edited as comma-separated text (`BlueprintTabs.tsx:269`).
   - Renaming "Advanced" to "Adept" silently disconnects every item that had it. The select shows "No rank", while the badges in profiles, sheets and snapshots still say "Advanced".
2. **Matrix cells.**
   - `Matrix.rows` and `columns` are `string[]`, and cells are keyed `` `${row}|${column}` `` (`BlueprintTabs.tsx:347`).
   - Renaming a row or column hides its cells (they stay stored, but nothing shows them).

**Proposed fix: stable ids, written alongside the labels so older app versions keep working.**

- **New fields:**
  - `ranks` stays a `string[]` of names, for older versions.
  - Add `rankList: { id, name }[]`.
  - Items keep `rank` (a mirror of the label) and gain `rankId`.
  - Matrices gain `rowIds` / `columnIds`, and their cells move to `` `${rowId}|${columnId}` `` keys under `cellsById`; the old `cells` are kept.
- **Normalizer.** One `normalizeBlueprint()` turns either shape into the new one:
  - Labels are matched exactly.
  - An item whose rank label isn't in the list gets a new rank appended, so nothing is lost.
  - Cells whose labels match no row or column are kept as they are.
- **Where it runs:**
  - (a) A Dexie v26 upgrade over `systems` rows.
  - (b) The `systems` registry `remap`, so old `.novel.json` files import correctly.
  - (c) When reading in `systems/service.ts`, so rows that arrive by sync from a device that hasn't updated yet are handled.
- **The editor** becomes one row per rank, row and column, with rename and delete, instead of comma text. A rename keeps the id and updates the mirrored labels.
- **Why both shapes are kept:**
  - Cloud sync merges rows field by field, between devices that may be on different app versions.
  - Replacing `ranks: string[]` with objects outright would make an older device show "[object Object]" and possibly write broken data back.
  - Keeping the label mirrors makes the change invisible to old versions.
  - Once every device is updated, the mirrors could be dropped in a later step.
- **Tests to add with it:**
  - Renaming a rank keeps every item linked.
  - Old-shape rows from the database, from a v3 file and from sync all normalize to the same result.
  - An unknown rank label is preserved.
  - Matrix cells follow a renamed row.

## Positions used as anchors in text (known limitation, not changed)

Some records point *into* chapter text by paragraph number:
- canon fact sources: `sources[].block`
- comments on selected words: `target.block` / `offset`, plus the `quote`
- continuity findings: `block`, computed and not stored

Paragraph numbers shift when paragraphs are added above. The chapter id itself is stable, and comments also keep the quoted words to find their place again.

Making these exact would need stable paragraph ids inside the editor document (a TipTap node attribute). That is a larger change to the manuscript format and is better taken up with cross-reference integrity (Prompt 34) than here.

## Names that are *not* identifiers (left as they are, on purpose)

- **Canon review dismissals** store `{ entryId, field: <field label> }` (`canon/review.ts`). The flag exists only while the fact's subject equals that field label, so the label is what is being compared, not a link. Renaming the field ends the comparison, and the dismissal with it.
- **Module bindings** map a module's own vocabulary (its category and field names) to the project's category **keys** and field ids (`extensions/service.ts` `resolveCategory`). The stored side is stable.
- **Continuity decisions** are keyed by rule id, chapter id and a fingerprint of the paragraph (`continuity/audit.ts`). Ids are remapped on copy (`continuity/service.ts`), and the fingerprint deliberately reopens a decision when the paragraph is rewritten.
