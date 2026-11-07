# Saving, backups and recovery (Prompt 48)

**Written:** 2026-10-22. What the app does today, checked by the tests named at the end. Where something is not tested, it says so.

## Where a novel is kept

- **In the browser:** the browser's own database (IndexedDB, named `novel-builder`) for this site, in this browser profile, on this device.
- **In the desktop app:** the same kind of database, inside the app's own folder: Electron's folder for the app's data, which on Windows is `%APPDATA%\Novel Builder` (not checked by a test).
- **In the Android app:** inside the app's own storage (not checked by a test here).

Each device has its own copy. **Nothing is sent anywhere.** Cloud sync is a separate, optional feature, set up only on purpose; it is not used here, and nothing on this page depends on it.

**The browser may delete a site's data** when the disk runs low, unless the site is allowed to keep it.
- The app asks to keep it when chapter text is saved, until the browser agrees.
- Settings → Manage says which applies: "Protected from automatic browser cleanup", or "The browser may clear it if the disk runs low", with a **Protect it** button.
- **Clearing the browser's data for the site** (or uninstalling the app) deletes every novel on that device. Only backup files survive that.

## Saving

Everything is saved on the device as it is made. There is no Save button to forget.

| What | When it is saved |
|---|---|
| Records (entries, events, connections, relationships, threads, views…) | At once, each change in one transaction |
| Text boxes (summaries, notes, descriptions) | 0.6 s after typing stops, and on leaving the box |
| Chapter and scene text | 0.8 s after typing stops, and at least every 5 s while typing goes on |

Chapter text has further protection:
- **Crash copies:** while text is waiting to be saved, a copy is written every 0.25 s. When the page is closed, a last copy is written at once, in a second place.
- **Recovery:** if the tab or browser stops before the text was saved, opening the chapter again shows **"Unsaved writing was recovered"**, with **Keep it** and **Discard it**.
- **Failed saves** are tried again after 2, 5, 15 and 30 s. The status shows **"Not saved"** with a **Retry** button, and the browser asks before the page is left.
- **Two tabs editing one chapter:** the second save is stopped and the author chooses which text to keep. Nothing is overwritten silently.
- **Version history:** a version every 5 minutes of writing, and one before each restore. The last 50 of each chapter are kept. History → **Restore this version** brings one back, and the text it replaces stays in the history.
- In Chromium-based browsers and the desktop app, the database is opened so that each save is written through to the disk before it counts as saved. That is what makes it survive a power cut as well as a crash; a power cut is not something the tests can do.

**Closing and reopening:** a novel is still there, whole, after the browser is closed and opened again, and every view reads it as before (tested; see the end).

## Backup files

**To make one** (all three make the same file):
- Library → a novel's **⋯** menu → **Export backup**;
- the novel's Settings → **Export backup**;
- Import & Export → **Export entire project data**.

**The file** (`<title>.novel.json`) is plain JSON:
- `format: "novel-builder/project"`, `version: 4`, the novel's details, and every record grouped by kind;
- any program can read it.

**In it:**
- every chapter, scene and their text;
- alternate drafts and version history;
- plans and notes;
- the codex, your own record kinds and fields, and connections;
- relationships, events, alternate histories and the story calendar;
- plot threads, structure markers, canon, continuity rules and decisions;
- systems, progression, places, maps (their images included), journeys;
- factions and ownership, which are connections;
- secrets and knowledge;
- genre modules turned on in this novel and what their tools recorded;
- saved views;
- goals and the writing log;
- the team and its conversations.

**Not in it:**
- **Kept on this device only:** crash copies, the search index (rebuilt when needed), and cloud-sync bookkeeping.
- **Kept by the app, not by one novel:**
  - category templates;
  - your module library (a module turned on in this novel is in the file all the same);
  - which novels are alternate timelines of which (a restored timeline is a novel of its own).
- **Settings of this browser:**
  - theme, workspace layout, reader and editor preferences, the tutorial;
  - each novel's dashboard arrangement (which widgets, their order, sizes and settings). It names records by id only, so it holds nothing to restore; a restored novel starts with an empty dashboard. See `dashboard-widgets.md`;
  - the assistant's key, which is never in any file;
  - the cloud account.

**A view's export is not a backup.** Visualize → **Export…** makes a picture, a printout, a CSV or a JSON of one view and says so on it. Only the files above can be restored.

## Restoring

Library → **Import** → choose a `.novel.json` file.

- **It always becomes a new, separate novel.** Nothing existing is replaced or merged into, so importing a file can never damage a novel already on the device.
  - If the title is taken, the new one gets a number ("Ashfall 2").
  - It starts unpinned and in the library, not archived.
- **Every record gets a new id,** and every reference inside every record is rewritten to the new ids. That covers:
  - links in the text, connections, and the chapters an event is told in;
  - saved views, and fields of your own kinds that link to other records;
  - links to the novel's own pages kept by the assistant, and the team's record of who did what;
  - the rest.
- **The new ids sort as the old ones did,** so records that tie (made in the same instant) are listed in the same order as before. Every view shows the restored novel exactly as the original (tested).
- **Nothing in the restored novel points at the novel it was saved from** (tested on real data).
- **On a team novel,** each chapter keeps the name of whoever wrote it, not of whoever restored it. The restore is not recorded as anyone's edits.
- **Fields the app does not know are kept,** on the novel and on every record, at every depth. A file from a later version of the same format, or edited by another program, loses nothing it can store.
- **Older files** (versions 1–3) are read and brought up to date on the way in.

**A file is refused, with the reason, and nothing is written, when:**
- it is not a Novel Builder project file, or not JSON;
- it was made by a newer version of the app;
- it holds kinds of records this version has nowhere to keep (they are listed);
- a record has no id, or two records of one kind share an id;
- writing it fails part-way, for any reason. A restore is one transaction, all or nothing. A record the restore cannot read is tested; a full disk is not, but would stop the same transaction.

## Copies, timelines, deleting

- **Duplicate** (Settings) makes an independent copy, in the same way as a restore. It leaves out the version history and the team.
- **A new timeline** (Branches) is a copy as the story stood at a chapter. It leaves out what happens only later, and also the history and the team.
- **Archive** hides a novel from the Library without deleting anything. **Restore** brings it back.
- **Views turned off** (Module Manager → Views, Optional Prompt D) are a setting of the novel: they are in its backup file, its copies and its timelines. Turning a view off or on changes only that setting, never a record. See `view-modules.md`.
- **Delete** (Settings, or the Library menu) asks for the title to be typed. It then removes the novel and every record of it, in every table.
  - **It also forgets what this browser kept for the novel** (Optional Prompt C): its workspace layouts, notes, dashboard, folded parts of the tree, last chapter, reading position, and each chapter's scroll position and crash copy. Leaving a team's novel (Team → Leave) does the same. Before, these stayed behind in the browser after the novel was gone.
  - **There is no undo and no bin.** The only way back is a backup file.
  - Other novels are not touched (tested). A novel's alternate timelines are not deleted with it: each stays in the Library as a novel of its own.

## Turning things off

- **Genre modules** (Modules) can be turned off and on again.
  - Turning one off puts away the categories it brought that are **empty** and that no other module still uses. A category that holds records stays where it is, so those records stay in every view (tested in Prompt 49: an ability of the module's kind, with the module off).
  - No entry, connection, event or other record is changed or removed. Turning it on again brings the categories back.
  - Tested: every built-in module turned on and off on a novel made in the app changes no record. Bringing a module's categories back is tested on its own (`extensions.test.ts`).
- **Archiving a category or a field** in the Codex hides it. The values are kept, and **Restore** brings it back.
- **Visualize views cannot be turned off** one by one; that is a later, optional step.
  - Views only read the records.
  - The only things they store are saved views, which belong to the novel and are in its backup file. Deleting a saved view deletes only the view.
- **Workspace panels** (Customize) are a setting of this browser. Hiding a panel hides nothing in the novel.

## Upgrades of the stored data

- The database has had 34 versions. A device holding an older one is upgraded when the app opens.
- Most upgrades only add tables. A few rewrite records in place:
  - project genres (2);
  - the chapter tree (4);
  - chapter status (8);
  - blueprint ranks (26).
- **An upgrade is all or nothing.** If one fails, the browser undoes the whole of it, and the stored novels stay as they were at the earlier version, ready to open again (tested with an upgrade that rewrites records and then fails).
- The blueprint upgrade leaves a blueprint it cannot read exactly as it was, so one odd record cannot stop the database from opening.
- **Representative older databases** (versions 25 and 33, each with a novel of about 10,000 records) open with every record kept and are read by the app (tested).

## When something goes wrong

| What happened | What to do |
|---|---|
| The tab or browser crashed while writing | Open the chapter again → **Keep it** (or **Discard it**). |
| A chapter was changed by mistake | Chapter → History → **Restore this version**. |
| The status says **Not saved** | **Retry**. Keep the page open until it says saved; the crash copy is kept meanwhile. |
| A novel was deleted | Library → **Import** its latest backup file. |
| The browser's data was cleared, or you are on a new device | Library → **Import** each backup file. |
| An import was refused | Read the reason. Nothing was changed; the file itself is untouched. |

**The habit that covers everything:** export a backup file of each novel you care about regularly, and keep it somewhere other than the browser: another disk, or a folder that is itself backed up.

## Tests

- `src/modules/projects/ownership.test.ts`, partly on `fixtures/made-in-the-app.novel.json`. That is a novel joined from the backup files of the novels an end-to-end run makes through the app's own pages, by `scripts/project-fixture.mjs`; it has every field of the 42 kinds of record the run makes. The tests check that:
  - every table holding a novel's records is known to the backup, copy and delete code;
  - databases from versions 25 and 33 upgrade with every record kept;
  - a failing upgrade changes nothing;
  - files with unreadable records are refused, and a restore failing part-way writes nothing;
  - a novel made in the app keeps every field, known or not, at every depth, through a backup file and through a copy, and nothing in either points at the original;
  - modules off and on change no record;
  - an archived field keeps its values;
  - renaming a record changes nothing else.
- `src/modules/projects/persistence.test.ts`, `service.test.ts`, `identity.test.ts`: reload, round trips, older files, refused files, isolation, ids through renames.
- `e2e/smoke.mjs`:
  - Phase 4: autosave, crash recovery, conflicts, history, a backup deleted and restored;
  - "Persistence and data ownership" (visualization Prompt 48): the novels the run has made, enough of them to hold every kind of record and field it made, each exported, restored, compared and deleted; a restored novel read by every view; a browser closed and reopened.
- `e2e/desktop.mjs`: the desktop app quit and reopened.
