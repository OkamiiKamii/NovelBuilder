# Saving, backups and imports for the shared records (Prompt 11)

> **The full account of saving, backup files, restoring and recovery, as audited in Prompt 48, is [backup-and-recovery.md](backup-and-recovery.md).** This page records what Prompt 11 changed.

**Written:** 2026-10-21.
**Tests:**
- `projects/persistence.test.ts` (7 tests)
- `projects/identity.test.ts`
- `systems/systems.test.ts` ("NAMES ARE NOT LINKS")
- the updated test in `projects/service.test.ts`

## Where the new records live

Every record refined for the visual views lives in a table the app already had, and each of those tables was already registered in the project registry. So they already take part in backup, duplicate, fork, delete and sync without any new wiring.

| Record | Table | Added in |
|---|---|---|
| Typed connections, with `validity` | `loreLinks` | Prompts 7–8 |
| Event end, `ongoing`, threads, status, canon, reveals | `timelineEvents` | Prompt 9 |
| Rank and table ids | `systems` | Prompt 5 |

The read model, connections and query layer (`src/modules/model/`) store nothing of their own.

## Saving is local; sync is something else

- **Saving** writes to the browser's own database on this device (IndexedDB), the moment a change is made:
  - Services write inside a transaction straight away.
  - Text fields use `SavedText` (600 ms after typing stops, and on leaving the field).
  - The manuscript uses its own autosaver with crash copies.
  - Nothing here sends anything anywhere.
- **Cloud sync** is a separate, optional feature (`sync/`). It only runs when the author has set up an account and a relay; this app's owner does not use it.
- Nothing added for the visual views calls the network. "Saved" in the app always means saved on this device.

## Turning a view or module off

- Views only **read** the shared records, so a view being hidden, broken or missing cannot remove anything.
- Turning a module off keeps everything it made (`extensions/service.ts` `disable`). A test turns a built-in module on and off and checks that connections, events and blueprints are unchanged.
- View-only state still to come (saved views and positions, Prompt 14) will live in its own tables, and turning a view off will never delete it.

## Project files: versions and safe failure

- **The file version is now 4** (`projects/types.ts` `SNAPSHOT_VERSION`, with its history beside it).
- **An older copy of the app refuses a version 4 file**, saying it was made by a newer version. Before this, it would have accepted the file and misread the new shapes, such as rank ids.
- **Version 1–3 files still import.** On the way in:
  - ranks and table cells are linked by id (`systems` remap);
  - events and links read with their plain defaults.

  A test builds a version 3 file by hand and imports it.
- **Records with nowhere to go stop the import.** If a file holds non-empty collections this version has no table for (from a newer build, or added by hand), the import is refused and lists them: "it holds records this version of the app cannot keep: starCharts (1). Nothing was imported".
  - Before, they were dropped silently and the rest imported.
  - This also covers a file trying to write into tables that aren't the project's own, which the earlier test (`service.test.ts`) guarded against by ignoring them.
  - Empty placeholders older files always carry (`characters`, `outlines`) are fine.
- **Unknown fields are kept.**
  - Rows keep fields this version doesn't know (tested on entries, events, links, blueprints and chapters), and so do codex fields of a type this version doesn't know.
  - The **project row** used to be rebuilt from a fixed list, so a newer version's project settings were lost. They now ride along. Only the long-retired single `genre`, which became `primaryGenre` in schema v2, is dropped.

## Database upgrades: safe failure

- The one new upgrade (schema v26, ranks and table ids) converts each blueprint on its own.
- A blueprint it can't read (a `null` item, a non-list where a list belongs) is **left exactly as it was** instead of stopping the upgrade.
- This matters because an upgrade that throws would keep the whole database from opening.
- Values that are not records or text are passed through untouched.
- A test opens a database with a deliberately malformed blueprint.

## What is not here

- **No cloud service was added, and nothing is uploaded.**
- Exporting **views** (images, CSV, print) is Prompt 46. A view export is not a backup; "Export project" remains the backup.
