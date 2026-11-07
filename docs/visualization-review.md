# Visualization system: final review (Prompt 50)

**Written:** 2026-10-22, against the acceptance checklist in [`visualization-acceptance.md`](visualization-acceptance.md) (Prompt 4).

**How it was reviewed:**
- every one of the checklist's 102 items was traced to the code that does it and the tests that show it;
- cross-checks were made by search and by running the app;
- the whole test suite was run again today.

"Complete" means the behaviour is there **and** a test that ran shows it. "Partial" means part of the success condition, as written, is missing, differs, or is not shown by a test.

## Verdict

| | Items |
|---|---|
| Complete | **54** |
| Partial | **46** |
| Not implemented | **2** (GN-7 saved graph positions; RS-3 touch tests and 44 px targets in the views) |
| Blocked | 0 |

The partial items fall into three groups:
- **About half only lack evidence.** The behaviour is built, often by construction, but no test asserts the exact case the checklist names. Examples: the drawing and its list showing the same ids; one exact three-way filter.
- **About a quarter differ from the checklist on purpose,** and the difference is documented. Examples: map pins in the map's own units, zoom not saved in saved views, no multi-select on the board.
- **About ten are real gaps.** They are listed with the next steps.

No regression was found. Nothing in the visualization system calls an AI model or sends anything to another host. No internal link is broken.

## Checklist, item by item

C = complete, P = partial, N = not implemented. Line numbers are in `e2e/smoke.mjs` unless a file is named.

**0. Baseline**
- **BL-1 C.** Today: `tsc -b` 0 errors; Vitest 866/866 in 75 files (baseline 451 in 29); the production build succeeds.
- **BL-2 C.** e2e 1562/1562 on the production build (baseline 779/781, with about 1,500 lines unreachable). Some baseline-era checks were reworded or retimed along the way; each change is in `visualization-baseline.md`.
- **BL-3 P.** No test opens every route for every role. Role page lists are checked (5401–5410), and today's link crawl opened every page as the owner.

**1. Shared data**
- **SD-2, 3, 6, 7, 8, 9, 10: C.**
  - 2: P49 at 10233, the same records in five views.
  - 3: `connections.test.ts:108`.
  - 6: `validity.test.ts:160`.
  - 7: `validity.test.ts:70`.
  - 8: `events.test.ts:58`.
  - 9: `ownership.test.ts`, schema 25 and 33 with about 10,000 records compared row by row.
  - 10: `ownership.test.ts`, every field at every depth, no stale id.
- **SD-11 C, stricter than written.** Unknown collections refuse the whole file with a message, rather than importing with a warning.
- **SD-1 P.** Renames of chapters, entries, events, threads, relationships and blueprint ranks are tested (`identity.test.ts`, `systems.test.ts:465`). An *ability* rename is not.
- **SD-4 P.** `"Blood-oath"` survives an update and export/import (`connections.test.ts:74`). It is not checked across a reload, nor on screen.
- **SD-5 P.** Deletions are flagged and never throw for deleted or foreign refs. `resolveRef` returns `{ found: false }`, not `{ missing: true }`.
- **SD-12 P.** Modules off and on keep every row (`ownership.test.ts`; P49 at 10314–10320). There is no per-view off switch to test; that is Optional Prompt D.

**2. Chronology**
- **CH-2, 8, 10, 11: C.**
  - 2: `axis.test.ts:25`; e2e 6750, 10337.
  - 8: `overlap.test.ts`; e2e 6890–6910.
  - 10: `ages.test.ts`.
  - 11: `histories.test.ts`; e2e 7130–7150.
- **CH-1 P.** The drawing and the list are fed from the same rows (`VisualizePage.tsx:397`), but no test compares their ids.
- **CH-3 P.** Seasons are drawn as spans (`calendar.test.ts:54`). The card says "somewhere in that stretch of time", not "approximate".
- **CH-4 P.** One zoom step is tested (`scale.test.ts:71`), not every level from hours to centuries.
- **CH-5 P.** Own calendars order correctly (`calendar.test.ts:70`). The exact 10 × 36-day case, and the comparison with the old `resolveChronology`, are not tested as written.
- **CH-6 P.** Negative and huge years sort and label correctly. They carry an era only when the author defines eras; otherwise "Year -10000".
- **CH-7 P.** One event is on every track as one record (`tracks.test.ts:47`). "One edit updates both" is not tested.
- **CH-9 P.** Out-of-order tellings are marked (`narrative.test.ts:80`; e2e 7005–7030), on fixtures other than the one written.
- **CH-12 P.** An edit from the drawn timeline updates the shared row (7240), but the test edits a name, not a date.

**3. Relationship history**
- **RH-1, 2, 3, 4, 7, 8: C.**
  - 1, 2: `manager.test.ts`.
  - 3, 4: `history.test.ts`.
  - 7, 8: `knowledge.test.ts`.
- **RH-5 P.** Arrows, keyboard selection, focus and drag are tested (7386–7413). Zoom and pan come from the shared viewport but are not tested on this map. A dragged character is not saved.
- **RH-6 P.** The filters are unit-tested (`network.test.ts`). "The table gives the same set" is checked as ≥ (7446), not as equality.

**4. Plot threads and boards**
- **PT-1, 2, 4, 5, 6: C.**
  - 1: `board.test.ts:122`; e2e 7652, 7713.
  - 2: Ctrl+Z undoes, at 7663.
  - 4, 5: `lanes.test.ts`.
  - 6: `structure.test.ts`.
- **PT-3 P.** There is no multi-select on the board. The confirmation applies to a chapter carrying scenes into another part.
- **PT-7 P, by design (Prompt 31).** "Appears" and "mentioned" come from the plan's appearance records. Plan `entityIds` and in-text mentions make a further state, "other records". No "absent" state exists. A cell opens the chapter through its details, in two steps.

**5. Graph navigation**
- **GN-1 to GN-5: C.**
  - 1: `navigate.test.ts:66`; e2e 6663–6669.
  - 2: `saved.test.ts:86`.
  - 3, 4: `knowledge.test.ts:103`, `:111`.
  - 5: e2e 8246, 8288.
- **GN-6 P.** Dangling references, look-alikes and confirmed merges are tested (`integrity.test.ts`). The listing of broken *in-text* links is not.
- **GN-7 N.** Dragged positions in the knowledge graph and the relationship map are not saved. This is documented ("Positions are not saved"). Map pins *are* stored, but no test reloads them.

**6. Custom kinds**
- **CT-1, 2, 4, 5: C.** `codex/service.test.ts`, `recordTypes.test.ts`, `capabilities.test.ts`; e2e 8446–8683.
- **CT-3 P.** Mapping is explicit, never guessed. Kinds are drawn on a timeline in "Records by kind", not on the main Timeline view.

**7. Character progression**
- **CP-1, 2, 3, 4, 6: C.** `track.test.ts`, `paths.test.ts`; e2e 8736–8933. The "replacement" path role is not exercised.
- **CP-5 P.** Cycles are reported. A path to a missing ability is skipped in the ability view, and only the Record check lists it.

**8. Places and maps**
- **WM-1, 2, 5, 7: C.** `places.test.ts`, `travel.test.ts`, `factions.test.ts`; e2e 9003–9343.
- **WM-3 P.** Maps take only images from the device, stored as data URLs. Today's link crawl saw no request to another host, but the e2e itself does not assert that.
- **WM-4 P, by design.** Pins are stored in the map's own units, not 0–1, and placed by keyboard by typing coordinates; arrow keys move between pins.
- **WM-6 P, by design.** The rule is a speed per way of travelling. Some conflicts (two journeys at once) need no speed at all.

**9. Saved views**
- **SV-4 C.** `saved.test.ts:86`; e2e 10408.
- **SV-1 P, by design.** Zoom and generic layers are not saved; per-view layout is.
- **SV-2 P.** Ids, not names, are stored, and the records are still found after a rename. The new *name* on screen is not checked.
- **SV-3 P.** "Restore default" is unit-tested, with no e2e.

**10. Filtering**
- **FL-3, 4: C.** e2e 10369; 10382, 10406.
- **FL-1 P.** Combinations and order-independence are tested, but not the exact character AND place AND time case.
- **FL-2 P.** The "N not shown: reason" line is unit-tested (`viz.test.ts:92`), with no e2e.

**11. Accessibility**
- **AX-1 P.** Every view has a list form, and all 17 are audited both ways (`a11y.mjs`). No test compares drawing ids with list ids.
- **AX-2 P.** Keyboard use is checked view by view. There is no single keyboard-only run, and the Story graph canvas cannot move nodes by keyboard.
- **AX-3 P.** Two cases rely on colour alone:
  - on the **Relationships page** map, three feelings (neutral, friendly, trusting) are solid lines that differ only in colour (the line's name and the table say it in words);
  - a canon marker's **severity** is shown by colour on the same glyph.
- **AX-4 P.** No control lacks a name (0 audit errors), and dialogs close with Esc and return focus. The audit counts any focused SVG mark as having a ring.
- **AX-5 P.** The graph settles before drawing under reduced motion (`GraphCanvas.tsx:115`). The test checks that it is settled within 0.7 s, not before the first frame.

**12. Responsiveness**
- **RS-1 C.** About 26 phone-width checks, plus the audit at 390 × 844 for every view.
- **RS-2 P.** The panel becomes a sheet at ≤1100 px. Only phone width is tested, and "closing gives the view back" is not asserted.
- **RS-3 N, as written.** No pan, pinch or drag test runs under touch in the views. Targets there are 24 px, not 44.
- **RS-4 P.** Side by side at 1280. At exactly 1100 px the panel is a sheet: the breakpoint is ≤1100.

**13. Performance**
- **PF-1 C.** `query.test.ts:152`: 5,000/1,000/10,000 in under 300 ms.
- **PF-2 P.** No lane-packing timing test. In the browser, the drawn Timeline with 2,000 events opens in about 0.5 s (`performance.md`).
- **PF-3 P.** `graph.test.ts:186` covers 1,000 nodes in under 400 ms, but `connectionsOf` is outside the timed part.
- **PF-4 P.** Before and after numbers are recorded, by script rather than by hand (`performance.md`). Keeping the selection across a filter change is not timed.
- **PF-5 P.** A change shows at once in another tab (7717). Not every view is checked live.

**14. Exports**
- **EX-5 C.** Offline: SVG and JSON (9809–9815).
- **EX-1 P.** Non-Latin text, quotes and commas are tested (`exportView.test.ts:88`), but not parsed back.
- **EX-2 P.** Title, filters and legend are asserted, but the timestamp is not. No export test for the knowledge graph or a map.
- **EX-3 P, real gap.** The opt-in ticks for private notes and secrets apply to JSON. A picture or printout of *Secrets and knowledge* holds what is on screen, with a notice. Its **CSV** holds it with **no** notice.
- **EX-4 P.** Empty views give a valid file. There is no drawn 1,000-node export test.
- **EX-6 P.** The dialog, the JSON and the printout say "not a backup"; SVG, PNG and CSV files do not.

**15. Continuity warnings**
- **CW-1 to CW-5: C.** `review.test.ts`, `checks.test.ts`, `timeline/review.test.ts`; e2e 9543–9603.
- **CW-6 P.** Opening every warning page changes no row in any table, `chapterContents` included (P49). Decisions are compared over 7 tables only.
- **CW-7 P.** Markers carry text labels. Connections use their own status names ("Disputed", "Invalid"), not `CANON_STATUSES`.

**Out of scope, as required**
- **No AI:** no visualization code imports the assistant.
- **No new transmission:** `fetch` exists only in the existing assistant and sync features, both opt-in, and the link crawl saw no request leave the device.
- **No automatic canon changes, no automatic rewriting:** CW-6 above, and the P49 check.
- **No fabricated data:** the large test novel lives in `e2e/` only.
- **"No unrelated redesigns" cannot be proven** without version control. Outside the views, P47 changed the Dashboard's computation and the scene board's menus, both for speed.

## Cross-checks

| Check | Result |
|---|---|
| Duplicate data models | **None.** Each record has one table; views read a model built from them and store nothing (`src/modules/model/`). Two deliberate overlaps are documented: a blueprint's **system snapshots** beside the genre-neutral **change tracker** (`progression-tracker.md`), and **typed connections** between two characters beside their **relationship**, shown under "Also recorded between them". |
| Hardcoded genre assumptions | **None in logic.** Genre words appear only in comments, placeholder examples, one editable place-level preset ("One world": … Kingdom …), and the optional levels of system blueprints. Genre content lives in the optional genre modules. |
| Graph-only information | **None in Visualize:** all 17 views have list forms. The older **Story graph page** is a canvas. Its "Find in the graph" reaches every record and the inspector lists each one's connections in text; the full table of the same records is the knowledge graph's list. |
| Inaccessible controls | Audit today: 0 errors across 120 page states. 51 warnings: 34 for a 19 px "Customize" link and 17 for a resize handle without a ring, both outside the views. Colour-only cases are under AX-3. |
| Unsupported claims | No "smart", "AI", "predicts" or "automatically detects" wording in the views. One doc miscount was fixed (`timeline-view.md`: 4 tests, not 5). `backup-and-recovery.md` was corrected in P49 (modules put away only empty kinds). |
| AI dependencies | None in visualization code. |
| Network transmission | None from the views. The crawl's requests to other hosts: 0. |
| Broken links | **0 of 210.** `npm run test:links` (new): every page and view, drawn and listed, on a novel holding every kind of record; every link followed; 0 browser errors. Pages explaining a deliberately missing record ("Dated from an event that no longer exists") are the app working as intended. |
| Regressions | Every suite passes: tsc, 866 unit tests, 1562 e2e checks, the audit, the link crawl. |

## Features and their entry points

All under `/project/:id/`.
- **Visualize** (`visualize/:view`), 17 views, each drawn and as a list (`?as=list`), with saved views, filters in the address, selection across views, a details panel and **Export…**:
  - timeline, story vs reading order, relationship map, plot board, structure and pacing, knowledge graph;
  - places, character progression, character history, character appearances, secrets and knowledge;
  - records by kind, ability paths, journeys, factions, ownership, charts.
- **Pages extended or added:**
  - Timeline (event editor; `timeline/review`) and Alternate histories (`histories`);
  - Relationships (types, attributes, history);
  - Scene board (`board`);
  - Plot threads;
  - Characters (Secrets tab, life history);
  - Codex (kinds of your own, field rules, what views read);
  - Record check (`integrity`) and Continuity review (`review`).

## Data models and migrations

- **New tables:** database versions 26–34 (`src/core/db.ts`):
  - 26: a blueprint's ranks and table rows get ids (an upgrade that rewrites in place, safe on unreadable rows);
  - 27: `savedViews`;
  - 28: `storyCalendars`;
  - 29: `alternateHistories`;
  - 30: `relationSettings`;
  - 31: `structureMarkers`;
  - 32: `progressCategories`, `progressChanges`;
  - 33: `placeSettings`, `worldMaps`, `mapPins`;
  - 34: `journeys`, `travelSettings`.
  - Every one is registered for backup, copy and delete (tested).
- **New fields on existing records**, read with defaults, so no upgrade is needed:
  - typed connections with when they hold;
  - event ends, threads, status, canon and tellings;
  - plan appearances, points of view and labels;
  - relationship stages with story time, causes and attributes;
  - the views a kind is set up for.
- **Backup file:** version 4 since P11. Older files are read; newer ones are refused.

## Tests and actual results (2026-10-22)

| Command | Result |
|---|---|
| `npx tsc -b` | 0 errors |
| `npx vitest run` | 866/866, 75 files (baseline 451, 29 files) |
| `npm run test:e2e:built` | 1562/1562 |
| `npm run test:a11y` | 120 page states (17 views drawn and listed, and 6 other pages, at three sizes): 0 errors, 51 warnings (the same as P45–P48) |
| `npm run test:links` | 210 links, 0 broken, 0 requests to other hosts, 0 browser errors |
| `npm run test:perf` | Last run in P47; numbers in `performance.md` |
| `e2e/offline.mjs`, `e2e/desktop.mjs` | Not run. Offline cannot start on Windows (it calls `npx` without a shell, as at baseline); desktop needs a desktop build. |

## Performance and accessibility

- **Performance** (P47, a novel of about 10,000 records):
  - most views open in 0.3–0.5 s, the relationship map in about 0.8 s, the Dashboard in 0.28 s;
  - the Story graph takes about 4 s to settle 3,673 records;
  - filtering and selecting take 0.2–0.5 s.
  - **The app is one 2.46 MB script (729 kB compressed)**, up from 1.77 MB at baseline. That is the slowest part of a first open on a phone.
- **Accessibility:**
  - 0 audit errors;
  - every view is usable by keyboard and has a list form;
  - reduced motion is respected;
  - the gaps are AX-3's colour-only cases and touch targets of 24 px rather than 44 in the views (RS-3).

## Known limitations and unresolved issues

1. **Secrets in a CSV export** of Secrets and knowledge go out with no notice and no opt-in (EX-3).
2. **Colour alone:** the Relationships page's three solid feelings, and a canon marker's severity (AX-3).
3. **Touch:** no touch tests in the views; targets of 24 px (RS-3).
4. **Graph positions are not saved** (GN-7). A path to a missing ability is not shown in the ability view (CP-5).
5. **No per-view off switch** (Optional Prompt D). No multi-select on the board (PT-3).
6. **Evidence gaps** listed above:
   - list/drawing id equality (AX-1, CH-1, RH-6);
   - exact filter cases (FL-1);
   - ability rename (SD-1);
   - "Restore default" by e2e (SV-3).
7. **Test infrastructure:** `offline.mjs` cannot run on Windows; the desktop e2e was not run.
8. **No version control:** the project folder is not a Git repository, so changes cannot be diffed or undone from history; backups are kept elsewhere.

## Recommended next steps, by impact and risk

| # | Step | Impact | Risk |
|---|---|---|---|
| 1 | Secrets in CSV, picture and print exports: the same opt-in tick as JSON, off by default | High (privacy) | Low |
| 2 | No colour alone: dash patterns for every feeling on the Relationships page (as the Visualize map already has), and a severity shape on markers | High (accessibility) | Low |
| 3 | Tests that pin what is now true only by construction: the drawing's ids equal the list's; the map equals the table; exact filter combinations; an ability rename; "Restore default" | Medium (guards against regressions) | Very low (tests only) |
| 4 | Touch: 44 px targets in the views' controls, and touch-emulation tests for pan, pinch and drag | Medium | Low–medium (layout) |
| 5 | Show paths to a missing ability in the ability view (CP-5); say "not a backup" in SVG, PNG and CSV files (EX-6) | Low–medium | Low |
| 6 | Split the app's script by page (load Visualize and its views when opened) | Medium (first open on phones) | Medium (build and offline cache) |
| 7 | Save dragged positions in the graph and relationship map (GN-7) | Low–medium | Medium (new stored state) |
| 8 | Make `offline.mjs` run on Windows; run the desktop e2e | Low | Low |
| 9 | Optional Prompt D: per-view on and off | Low | Medium |

None of these has been started.
