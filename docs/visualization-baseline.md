# Baseline before visualization work (Prompt 3)

**Recorded:** 2026-10-21. No application code had been changed for the visualization work at this point.
**Machine:** Windows 11 Home, Node v24.20.0, npm 11.19.0.

## Version control

The folder is **not a Git repository** (`git status` reports `fatal: not a git repository`). There was no Git status to inspect, so uncommitted work could not be told apart from committed work.

The pack's checkpoint commits, from Prompt 4 onwards, need `git init` first. That is waiting for the owner's approval.

## Environment fixes needed to run any check

`node_modules` had been installed on macOS (arm64), so only macOS native binaries were present. The following were added so the checks could run. Nothing was removed, and `package.json` and `package-lock.json` are unchanged.

| Added | Version | Why |
|---|---|---|
| `node_modules/@typescript/typescript-win32-x64` | 7.0.2 | `tsc` failed with "Unable to resolve @typescript/typescript-win32-x64" |
| `node_modules/@rolldown/binding-win32-x64-msvc` | 1.2.13 | `vite` and `vitest` failed with "Cannot find native binding" |
| `node_modules/lightningcss-win32-x64-msvc` | 1.33.0 | Windows CSS transformer binding for Vite |
| Playwright Chromium headless shell v1248, in the user cache (`%LOCALAPPDATA%\ms-playwright`) | for Playwright 1.64.0 | The cache held only v1243 |

The packages were unpacked from `npm pack` tarballs, matching the versions the lockfile requires.

**Still a problem: `npm run <script>` doesn't work on Windows.**
- `node_modules/.bin` holds only Unix launchers, so `npm run typecheck` fails with "'tsc' is not recognized".
- For this baseline, every tool was run as `node node_modules/<tool>/…`, which is the same command `npm run` would call.
- A clean `npm ci` on this machine would fix it. But it would also replace the macOS binaries, so it waits for the owner's decision.

## Results

| Check | Command actually run | Result |
|---|---|---|
| Typecheck | `node node_modules/typescript/bin/tsc --noEmit` | **Pass.** 0 errors; 265 `src` files checked (TypeScript 7.0.2) |
| Lint | none | **Not available.** The project has no ESLint or Prettier configuration. |
| Unit tests | `node node_modules/vitest/vitest.mjs run` | **Pass.** 29 files, **451/451** tests, 4.95 s. No warnings in the output. |
| Production build | `node node_modules/vite/bin/vite.js build` | **Pass with warning.** 381 modules in 0.68 s. Warning: `index-*.js` is 1,774.64 kB (538.76 kB gzipped), above Vite's 500 kB advisory. The output hash `index-w2Rs3ttW.js` is identical to `desktop/web/assets/`, so the source matches the last desktop build. |
| E2E smoke | dev server on :5173, then `node e2e/smoke.mjs` | **Fail (existing).** **779/781** checks passed, on two runs with identical results. Details below. |
| E2E offline | `e2e/offline.mjs` | **Not runnable on Windows (existing).** It calls `spawnSync('npx', …)` without a shell, and on Windows `npx` exists only as `npx.cmd`. |
| E2E desktop | `e2e/desktop.mjs` | **Not runnable here.** `node_modules/electron/dist` contains only the macOS `Electron.app`. |
| Android build | `npm run app:android` | Not attempted; needs the Android/Gradle toolchain. Out of scope for this baseline. |

### Existing e2e failures (do not fix in this step)

Both happened on both runs.

1. **`mobile: move a scene with the Location picker`** (`e2e/smoke.mjs:401`)
   - Expected `Chapter 2 [11]`, received `Chapter 2 [12]`.
   - Likely cause: the test clicks into the chapter text (`smoke.mjs:395`) and types `" More."`. Where the cursor lands depends on font layout, so on Windows it can land inside a word, splitting it and adding one to the count.
   - This looks like a test that depends on the platform, not an app defect. Not confirmed.

2. **The script aborts in Phase 28** (`smoke.mjs:5067`, `menu28.boundingBox()`)
   - It timed out after 30 s waiting for `details[open] > .menu-items` after tapping the first `summary[aria-label^="Actions for"]`.
   - The page at that moment was `/project/<id>/sync`.
   - Browser errors logged at that point were `net::ERR_CONNECTION_REFUSED`, the expected result of the earlier "unreachable relay" check.
   - Cause not investigated.

**Because of the abort, these sections never ran and have no baseline:**
- Phase 28 from line 5063 on
- Phase 29 (collaboration)
- Phase 30 (reader preview)
- Tutorial
- Character Management
- Phase 33 (levelling)

That is roughly lines 5063–6589 of `smoke.mjs`. Regressions in those areas cannot be detected by e2e until the abort is fixed.

## Update, same day: environment reinstalled and the two test failures fixed

With the owner's approval:

- **`npm ci` on Windows.** It added 265 packages and audited 266, reporting 3 moderate advisories (left alone). `npm run` scripts now work.
  - Re-check after the reinstall: `npm run typecheck` passes; `npm test` gives 451/451.
  - Electron's binary download was held back by npm's install-script policy, so `e2e/desktop.mjs` still can't run.
- **The two e2e failures were test problems, not app defects. Both are fixed in `e2e/smoke.mjs`:**
  1. **Location picker** (around line 389). The test now puts the cursor at the end of the chapter before typing `" More."`, instead of relying on where a click lands.
  2. **Phase 28 abort** (after line 5060, and after the tablet swipes around line 5140).
     - Reproduced in isolation: after touches sent straight through the protocol (`Input.dispatchTouchEvent`), Chromium headless shell v1248 delivers the *next* tap's touch and pointer events but synthesizes no click. Nothing in the app cancels anything, and the tap after that works.
     - Not caused by a fling (a 2 s wait made no difference), by the extra DevTools session, by touch ids, or by the pace of the moves.
     - The test now spends that first tap on a harmless target (the Organizer heading; the panel's search box).

**E2E after the fixes: 859/861 checks** (up from 779/781). All of Phase 28 passes. The run now reaches Phase 29 (collaboration), which had never run here, and shows two failures that were **previously hidden**:

1. `a comment attaches to the words that were selected`: received "Nobody".
2. The script aborts at `smoke.mjs:5552`: "timed out waiting for the verdicts to reach the editor".

Neither is investigated yet; the owner decides. Because of the abort, the rest of Phase 29 from line 5552, Phase 30, Tutorial, Character Management and Phase 33 still have no e2e baseline.

## What this means for later prompts

- **BL-1** (`docs/visualization-acceptance.md`) is met at: 0 type errors, 451/451 unit tests, build OK.
- **BL-2** is measured against **1044 of 1044 checks passing**, from the run after the comment fix and the rank and table ids.
  - **Comment fix.** The last consistent failure, `a comment attaches to the words that were selected`, was a real Windows behaviour: a double-click selects the word *and* the space after it, so the comment's quote and highlight carried a trailing space. Fixed in the app: `quoteIn` in `manuscript/editor/comments.ts` trims the spaces and keeps the offset right, with a unit test in `collab.test.ts`.
  - **Intermittent step.** The Phase 29 "verdicts reach the editor" timeout happened in one run and not in the three since. If it recurs once, treat it as flaky; if it repeats, investigate.
  - Any failure blocks acceptance.
- **Races found under load (Prompts 9 and 10), fixed.** Runs made while the machine was busy exposed timing bugs:
  - **Blueprint effects and costs** (`systems/components/BlueprintTabs.tsx`). Edits were computed from the item *as drawn*, so a quick second edit could undo the first: the effect target went back to "Strength".
    - The first attempted fix then read the select's value *inside* the queued edit, by which time React had reset it.
    - **Now:** values are read first, and the lists are changed from the item *as stored*.
    - The timeline's duration-unit select (`EventDetails.tsx`) had the same late read, and is fixed the same way.
  - **Phase 29 e2e test.** It pressed Enter a fixed 200 ms after the arrow keys. It now waits until the editor's own cursor (`dom.editor.state.selection`) is at the end of the last paragraph.
  - Confirmed with a full run on an idle machine: **1044/1044**.
- **More e2e timing gaps fixed (Prompt 11).** These were seen on a freshly started, slower dev server. Each check now waits, with a time limit, for what it expects, so a missing item still fails:
  - Phase 29 now puts the cursor at the end of the chapter through the editor's own command, rather than by arrow keys.
  - Three checks read lists that fill in a moment later: a location's events, a chapter's events, and the Consequences heading.
- **Dev server under strain.** A page load can time out ("NOT RESPONDING", waiting on source modules) after the dev server has run through several full suites. Restarting the server cleared it. If it recurs, restart the server before treating it as a regression.
- **After Prompt 11: 1044/1044.**
- **After Optional Prompt D (views as modules): 1616/1616** on the standard run (13 new checks); 918 unit tests (9 new); the audit covers 132 page states (the Module Manager and a view turned off, at three sizes), with 0 errors and the same 52 warnings; links 231 followed, 0 broken. See `view-modules.md`.
  - **Each of the 17 views can be turned off and on per novel** (Module Manager → Views).
    - The setting is `Project.viewsOff`, so it travels with backups, copies, timelines and sync. No database change: still version 34.
    - Off, a view is hidden from the picker, its own address and the links to it. No record is touched, which is tested row by row, over three cycles, on the QA sample novel.
  - **One dependency, enforced:** Journeys needs Places (its routes are drawn on the maps made there).
    - Places is refused while Journeys is on, with the reason, and the safe way offered: both off together.
    - Turning Journeys on brings Places.
  - **Genre modules, reviewed:** already safe. A cycle test of all ten (three rounds, then all off and all on) found no record changed and nothing added twice.
    - One gap fixed: the Character progression page now stays in the sidebar while the novel holds tracked progression changes, not only snapshots or blueprints.
  - **Two test-side lessons:**
    - the view cards first reused the genre cards' `.module-state` class, which an existing check reads on every card. They now have their own classes;
    - the sidebar briefly read the novel through its own query after a reload. It now reads the novel the workspace already holds, and the check waits for the state it expects.
- **After Optional Prompt C (QA sample novel): 1603/1603** on the standard run (12 new checks); 909 unit tests (17 new: 5 on the sample file, 11 on the views agreeing, 1 on character history); audit unchanged (126 page states, 0 errors, 52 warnings); links 231 followed, 0 broken. See `qa/README.md`.
  - **The sample lives in `qa/`, outside the app.** It is built through the app's services, saved as a Library backup file, and imported only on purpose. It is checked to be absent from the sources, `public/`, `index.html`, everything the built app serves, and a new browser's library.
  - **Two disagreements between views, found by the sample and fixed:**
    - character history ignored the author's appearance records. It now says "Appears in" and "Mentioned in" where the appearances view does; its existing lines are unchanged;
    - the list form of the timeline and the plot board named a scene without its chapter. It is now "Ch 3, scene: At the Archive", as elsewhere.
  - **Deleting a novel now also forgets what the browser kept for it:** layouts, notes, dashboard, scroll positions, crash copies (`projects/removal.ts`). The Library, Settings and Team → Leave all use it.
  - **Two e2e timing gaps in the Optional Prompt B checks, closed:**
    - the Review page's count was once read while it still said it was gathering warnings;
    - a long drag across a 3,200px window failed once. The drag is now between the first two widgets.
  - **An editing mishap, recovered.** Inserting the e2e block with `String.replace` expanded the patterns `` $` `` and `` $' `` in the inserted code. The script was rebuilt exactly from its unchanged head and tail, checked, and the block re-inserted with a replacer function.
- **After Optional Prompt B (your dashboard): 1591/1591** on the standard run (29 new checks); 892 unit tests (26 new); the audit covers 126 page states, with 0 errors and 52 warnings. The one new warning is the existing panel-resize-handle note, counted on the new dashboard state. Links: 231 followed (210 before; the widgets' links are new), 0 broken. See `dashboard-widgets.md`.
  - **No database change:** still version 34. The layout is a personal setting in the browser.
  - **The new browser checks prove that arranging writes nothing.** They compare every table's rows for the novel before and after, leaving out two stamps:
    - the project's "last opened" time;
    - its cached counts' time.
    Opening any page of a novel already refreshes those two; a probe showed this was true before this work.
  - **Two test-side lessons:**
    - Playwright's `dragTo` did not start a drag on the widget handle. A drag made of real mouse steps does, so the check uses that.
    - A widget read straight after a reload may still be "Reading your records…", so the checks wait for the text they expect.
  - **Found by the audit and fixed:** short names in widget lists ("Tam") were 44px tall but narrower than 44px on tablets and phones.
- **After Optional Prompt A (design system): 1562/1562** on the standard run; 866 unit tests; audit 0 errors and the same 51 warnings (both outside the views). See `viz-design-system.md`.
  - **Each of the four steps was checked on its own,** with the audit, e2e and before/after screenshots in light, dark and phone:
    1. values and palette;
    2. marks, focus and legends;
    3. frame and panel;
    4. touch.
  - **The audit now also requires,** in the views:
    - a legend wherever a view draws;
    - no part of a view under a record's details;
    - controls of at least 44px on tablets and phones, with no words running past them.
  - **Found and fixed along the way:**
    - the details panel covered the right side of every pan-and-zoom drawing, zoom buttons included (the drawing kept its first width);
    - feelings on the Relationships page followed a dark device even with light chosen;
    - labels on the Relationships page printed over each other where lines crossed;
    - two colour sets failed for colour-blind readers.
  - **My own mistakes, caught before finishing:**
    - two exact centring margins were rewritten into invalid values by the mechanical pass (restored);
    - the legend's first form changed its role, which six checks rely on (kept a figure);
    - a minimum width let the Drawn/List switch shrink past its word on a phone (padding instead; the audit now checks for it).
  - **One run of step 3 failed:** at Phase 20, a page none of the changes touch, waiting on a field. The rerun passed in full.
- **Prompt 50 (review): no app code changed.** Every suite was run again: tsc 0 errors, 866/866 unit tests, e2e 1562/1562, the audit 0 errors and the same 51 warnings.
  - **New check:** `npm run test:links` (`e2e/links.mjs`). It found 210 links, none broken, no request to another host and no browser error.
  - **Doc fix:** `timeline-view.md` gave the wrong number of axis tests.
  - **The review:** `visualization-review.md`. Of the checklist's 102 items, 54 are complete, 46 partial and 2 not implemented.
- **After Prompt 49: 1562/1562** on the standard run, in full the first time. 20 new e2e checks: one novel through all ten steps of the integration brief (see `docs/cross-feature-integration.md`). 866 unit tests, unchanged. No app code changed.
  - **No app fault found.** While the block was written and run on its own, three of its expectations were wrong and were corrected to the app's intended behaviour:
    - the timeline as a list shows events; people and places on the timeline are its tracks;
    - a rename adds a line to the character's own history;
    - a module turned off puts away only its empty kinds.
  - **Doc fixed:** `backup-and-recovery.md` had left out that only empty kinds are put away.
- **After Prompt 48: 1542/1542** on the standard run. 866 unit tests, 11 of them new; one existing test extended. 5 new e2e checks. Accessibility audit: 0 errors, the same 51 header warnings.
  - **The audit, end to end:**
    - The run's own novels (32 of its 60, chosen to hold every field of the 42 kinds of record it makes) each go through a backup file, a restore and a deletion through the pages.
    - A restored novel is read by all 17 views exactly as the original.
    - A browser profile is closed and reopened.
  - **Found and fixed by it** (each is an app fix, not a test change):
    - In a restored novel, ties were listed in a different order: new ids now sort as the old ones did.
    - Links the assistant kept to the novel's pages, and the team's record of who did what ("chapter:<id>"), still pointed at the original.
    - A field of the author's own kind linking to another record still pointed at the original. Its type is said by the category, which the restore did not read.
    - A restore re-signed every chapter with the name of whoever restored it. Each chapter now keeps its writer, as a member of the restored team.
    - Fields a later version might add were lost on restore inside connections' times, blueprint ranks and tables, category fields and settings, and relationship stages.
    - Records with no id were dropped from a file silently. Such a file, or one where two records share an id, is now refused before anything is written. A failure part-way says that nothing was imported.
  - **First full runs:** 1540/1542 and 1541/1542, while the audit was being built. Besides the app faults above, the test had two faults of its own: it read the list of views before it was drawn, and it counted deleted records (still named in the device's search index) as part of the novel. Both were fixed in the test.
- **After Prompt 47: 1537/1537** on the standard run, passing in full the first time. 855 unit tests, 1 of them new (the timed computations). 5 new e2e checks on a large novel. Accessibility audit: 0 errors, the same 51 header warnings.
  - **Measured first:** a seeded large novel (`e2e/bigNovel.mjs`: 2,000 events, 1,550 entries, 4,000 connections, 603 parts…), timed with `npm run test:perf` and `perf/perf.test.ts`. The results, before and after, are in `docs/performance.md`.
  - **Four slow pages fixed**, measured with the old and new builds served side by side and timed in turn (two rounds):
    - Story graph: 9.5–9.8 s → 4.0–4.1 s to settle.
    - Character appearances: 1.8 s → 0.4–0.5 s.
    - Scene board: 1.1–1.3 s → 0.5–0.8 s, busy 183–268 → 34–35 ms.
    - Dashboard: 716–765 → 282 ms, busy 376–406 → 0 ms.
    - The unchanged pages were the same in both builds, within the difference between two runs of one build.
  - **Lesson:** a first before/after pair, taken at different times, made the unchanged pages look 30–80 ms slower. That was the machine. Comparisons now time the old and new builds in turn.
  - **Kept on purpose:** the relationship map's fixed layout and the continuity review, each about 200 ms.
  - **Benchmark fix:** the first benchmark's charts step chose the wrong chapter and waited for columns that never came. Each action is now timed separately, and one that never finishes is reported, not fatal.
- **After Prompt 46: 1532/1532** on the standard run. 854 unit tests, 9 of them new. 12 new e2e checks for exporting a view. Accessibility audit: 0 errors, the same 51 header warnings.
  - **Updated expectation:** the charts' CSV now starts with a byte-order mark, so the Prompt 44 check expects it.
  - **First full run: 1530/1532, and the audit 2 errors.** All 12 new checks passed in it.
    - **The phone layout of Factions** scrolled sideways (531 px in 390), and an older check failed with it ("both views fit the screen").
      - Cause: the wrapper I put round each view, to find it when exporting, became a grid item without the view's `min-width: 0`.
      - Fix: it takes no part in the layout (`display: contents`). Factions, the timeline and the charts measured 390 px wide again.
    - **"No browser errors":** one failed request while my test had the browser offline. The export itself made none: logged in a separate run, there was no failed request.
      - The failure came from a novel the earlier sync tests left syncing in the background, which tries to reach its server.
      - The check now ignores that one "disconnected" message for that window only.
  - **App fix found by a unit test:**
    - the names in a records file were found by searching the whole file once for each id: 2.3 s for 5,000 events when run with the other tests;
    - they are now gathered in one pass: 14 ms.
  - **Found by looking at the print layout:**
    - the heading was printed twice (on the page and in the picture);
    - a menu's label was left behind without its menu;
    - both are fixed.
- **After Prompt 45: 1520/1520** on the standard run, passing in full the first time with the fixes; no existing check changed. 845 unit tests, 3 of them new.
  - **New: the accessibility audit, `npm run test:a11y`.** 120 pages (17 Visualize views drawn and as lists, and 6 other pages that draw) at desktop, tablet and phone sizes.
    - **0 errors.**
    - **51 warnings**, all in the workspace header outside the visualizations:
      - the "Customize" link is 19 px high (34 pages);
      - the left panel's resize handle shows focus by colour, not a ring (17 pages).
    - Details in `docs/accessibility-audit.md`.
  - **First full audit run: 3 errors and 489 warnings,** after an audit bug that made it check no views was fixed.
    - **Found in the audit itself and fixed:**
      - it read the list of views before the page had drawn it;
      - it named a row of checkboxes alike and took them for a keyboard trap;
      - it took controls inside closed sections for covered ones;
      - it pressed Escape before the details had taken focus.
    - **Found in the app and fixed:** listed in `docs/accessibility-audit.md`. In short:
      - focus is lost when the details close;
      - zoomed drawings let focus leave the visible part;
      - dragging was the only way to move a node;
      - four kinds of mark were told apart by colour alone;
      - a covered link on a phone;
      - the Scene board 34 px too wide at tablet size;
      - targets under 24 px;
      - the Story graph moved under reduced motion.
- **After Prompt 44: 1520/1520**, on the standard run, passing in full the first time on the final code. 842 unit tests, 8 of them new. 18 new e2e checks for the charts.
  - **Updated expectations:** seventeen Visualize views; Back after visiting them all now returns to Ownership.
  - **Found while writing the tests** (all in my own test code):
    - a button count that included the card's Download button;
    - a check read while the charts redrew after "Clear filters";
    - a wrong expectation of mine: a "from" year keeps every year of the stretch, empty ones included.
  - **App fixes found by looking at the result:**
    - counts read "1 chapters", so each chart now has singular and plural units;
    - count charts drew a half tick ("0.5 chapters"), so the middle tick is now drawn only when it is a whole number;
    - the filters stacked full-width instead of sitting in a row.
- **After Prompt 43: 1502/1502**, on the standard run (`npm run test:e2e:built`), passing in full the first time on the final code. 834 unit tests, 4 of them new. 15 new e2e checks for the continuity review.
  - **No expectations changed.** The continuity page still says "Dismissed" for the decision the review calls "Ignored": the same stored decision.
  - **Found while writing the tests** (all in my own test code):
    - a locator matched by part of a name;
    - two checks that read a page before it had drawn (one waited for something to be absent, which an empty page already is);
    - a shell-escaping slip in a test helper, rewritten.
  - **App change found while writing it:** canon flags' keys held a `:` inside a segment, so a copy of the novel would not have re-pointed a decision about one. Decision keys now give every id its own segment (`canonKey`).
- **After Prompt 42: 1487/1487**, on the standard run (a production build, below). 830 unit tests, 6 of them new. 14 new e2e checks for canon and continuity markers and the record check's new rules.
  - **Found while writing the tests** (expectations of mine): the timeline service refuses a month the calendar lacks, so a unit test used another timeline-review finding; two e2e locators (a label shared with a region, and SVG text read as `innerText`).
  - **First full run: 1484/1487.** All 14 new checks passed. Three older find-and-replace checks failed (`smoke.mjs:158`, 161, 164): the find bar showed "2 of 2" where "1 of 2" was expected.
    - **Cause, in the test:** a new search rightly starts at the first match after the cursor, and the test put the cursor by clicking the middle of the chapter, so where it landed depended on layout.
    - **Fix:** the test now moves the cursor to the start (Ctrl+Home) before searching. The opening section passed three times in a row, and the full run on the final code passed in full.
- **Standard e2e run is now a production build** (the author's decision, after Prompt 41). `npm run test:e2e:built` (`e2e/built.mjs`):
  - builds the app, serves the build on port 4173, runs `smoke.mjs` against it, and stops the server, so no server is left holding a port;
  - `npm run test:e2e` still runs against a dev server.
  - **The faction-filter race, fixed in the test.**
    - The app was right: the address changes at once, and the map follows within 100 ms (measured).
    - The check waited for "not 300 of 300", which the faction alone already satisfies, so it read the map before the Family layer applied.
    - It now waits for each change in turn, and also checks that hiding the layer leaves fewer relationships than the faction alone.
    - First full run with the runner: **1473/1473**, with no stall.
- **After Prompt 41: no complete run on the dev server.** 824 unit tests. 1473 e2e checks, 16 of them new.
  - **On the dev server,** one full run stopped on the stall at check 642, on a freshly started server. Every check before it passed.
  - **A diagnostic run against a production build** (`vite preview`), as in Prompts 34 and 37 to 40, not a change of procedure:
    - All 1473 checks ran with no stall: **1471/1473**.
    - The two failures are the relationship map's faction filter, the timing race recorded under Prompt 34.
    - All 16 new checks passed.
  - **Updated expectations:** sixteen Visualize views; Back after visiting them all returns to Factions.
  - **Found while writing the tests:**
    - **App fixes:**
      - At the very event an item changes hands, the shared temporal model rightly answers "may hold" for both holders. The view said "a time cannot be compared", which was wrong for that case. It now says "Perhaps held by The King and Mira (it changes hands at this point…)".
      - A holding that begins at an event an alternate history does not have now reads as such, not as "a deleted event".
    - **Expectations of mine:**
      - The branching service's `fork` returns the project itself.
      - The faction map's war edge is named from whichever faction comes first.
      - The date picker's chapter options are plain chapter ids.
- **After Prompt 40: no complete run on the dev server.** 816 unit tests. 1457 e2e checks, 14 of them new.
  - **On the dev server,** one full run stopped on the stall at check 1400, on a freshly started server. Every check before it passed.
  - **A diagnostic run against a production build** (`vite preview`), as in Prompts 34 and 37 to 39, not a change of procedure:
    - All 1457 checks ran with no stall: **1455/1457**.
    - The two failures are the relationship map's faction filter, the timing race recorded under Prompt 34.
    - All 14 new checks passed.
  - **Updated expectations:** fourteen Visualize views; Back after visiting them all returns to Ability paths.
  - **Found while writing the tests:**
    - **App fixes:**
      - A journey's time available counted its end minute short: a journey leaving and arriving on the same day was "at most 24 hours", not "1 day". Spans count whole minutes, ends included.
      - Two places named in one note came in database order, which differed from run to run. They are now named alphabetically.
      - An event in a route showed its name as its time; it now shows its date.
    - **Expectations of mine:** two unit tests whose own data held a further real conflict (a duration shorter than the speed allows, and a departure from somewhere other than the last arrival). Both are now expected.
    - **The new block passed 14/14 on its first standalone run.**
- **After Prompt 39: no complete run on the dev server.** 802 unit tests. 1443 e2e checks, 18 of them new.
  - **On the dev server,** one full run stopped on the stall at check 738, on a freshly started server. Every check before it passed.
  - **A diagnostic run against a production build** (`vite preview`), as in Prompts 34, 37 and 38, not a change of procedure:
    - All 1443 checks ran with no stall: **1441/1443**.
    - The two failures are the relationship map's faction filter, the timing race recorded under Prompt 34.
    - All 18 new checks passed. So did the earlier Places checks the explorer replaced the view under ("a place appears with what happened there", the selection marks, the deleted-selection case).
  - **The new block passed 18/18 on its first standalone run.**
- **After Prompt 38: no complete run on the dev server.** 792 unit tests. 1425 e2e checks, 15 of them new.
  - **On the dev server:**
    - One full run stopped at check 752 with `ERR_NETWORK_IO_SUSPENDED`, the network suspended (most likely the computer sleeping). That is not a test failure.
    - One full run stopped on the dev-server stall at check 1157, on a freshly started server. Every check before it passed.
  - **A diagnostic run against a production build** (`vite preview`), the same as in Prompts 34 and 37, not a change of procedure:
    - All 1425 checks ran with no stall: **1423/1425**.
    - The two failures are the relationship map's faction filter, the timing race recorded under Prompt 34.
    - All 15 new checks passed.
  - **Updated expectations:** the Visualize view list has thirteen views, and Back after visiting them all now returns to Records by kind.
  - **Found while writing the e2e block** (run on its own until it passed):
    - **App fix:** the view's source and path-kind checkboxes, kept in the page address, flicked back on a click before the address caught up (the same pattern as earlier views). They now show the click at once.
    - **Expectation of mine:** a cycle's wording also matched the section's own introduction.
    - **A name clash, caught before any run:** `node --check` on the whole script now runs before every run.
    - **A first run that tested the wrong build:** the production preview from Prompt 37 was still holding the port. Each run now waits on the dev server's own source files, not just its home page.
- **After Prompt 37: no complete run on the dev server.** 779 unit tests. 1410 e2e checks, 19 of them new.
  - **On the dev server,** three full runs each stopped on the stall: at check 617, at 1152, and at 1199. Each was on a freshly started server, with no browser errors. Every check before each stop passed; the furthest run passed 1198 of 1198.
  - **A diagnostic run against a production build** (`vite preview`), the same as in Prompt 34 and not a change of procedure:
    - It ran all 1410 checks with no stall: **1408/1410**.
    - The two failures are the relationship map's faction filter, the timing race already recorded under Prompt 34. The trait-chip race did not show this time.
    - All 19 new checks passed, and so did every block after them.
  - **Updated expectation:** the character profile has eight tabs (Progression is new).
  - **Found while writing the e2e block** (run on its own until it passed):
    - **Wording, changed:** Every connection read "Mira gained Ember Crown this"; connections from a change now read from either end ("Mira gained this", "Mira changes (Level set to 3) in this").
    - **A gap, closed:** the profile's History tab did not list the changes; it now does.
    - **Expectations of mine:**
      - The record form keeps the last "When" for the next change, so a test had to choose "When is not known".
      - A placeholder is not text to filter rows by.
      - A button was ambiguous where two references broke.
    - **The full script did not load at first:** three names in the new block were already declared earlier. They were renamed, and the whole script is now checked with `node --check` before a run.
  - **The stall now stops most full runs on the dev server.**
- **After Prompt 36: 1391/1391.** 766 unit tests.
  - 22 new e2e checks for kinds of record set up for views. The Visualize view list now has twelve views, so two older checks name the new one: the list of views, and where Back returns after visiting them all.
  - **Found while writing the e2e block** (run on its own until it passed):
    - **App bug, fixed:** the "Connection that means holding it" menu read its value inside the queued save, after React had reset it, so the choice was lost. This is the same late-read race recorded under Prompts 9 and 10; it now reads the value first.
    - **App bug, fixed:** recording a new holder used the shared model's connection id (`link:<id>`) instead of the stored one.
    - **Names fixed:** the view's way-of-showing chips and the drawn/list switch were both a group named "Show as"; the chips are now "Ways to show it", and the drawings are named Timeline, Map, Ladder and Holders.
    - **Expectations of mine:** a built-in kind called "Items & Artifacts" also matched "Artifacts"; a list read before it re-rendered.
  - **Runs:**
    - Three full runs stopped on the dev-server stall: at check 622, at 704, and at 1047. Each was on a freshly started server, with no browser errors and the server answering normally afterwards.
    - The run that reached 1047 also found the Back expectation above.
    - Then a full run on a freshly started server passed in full: 1391/1391.
  - **The stall is now frequent:** it stopped three of four full runs in this step.
- **After Prompt 35: 1369/1369.** 749 unit tests.
  - 18 new e2e checks for kinds of record of the author's own: presets, field rules, checks at the field and on the Record check, links, the graph setting, search, a one-kind template, and a required field every character shares.
  - **Found while writing the tests:**
    - **App bug, fixed:** applying a template keyed its categories by the template's keys. The built-in templates share keys, so an existing category could be overwritten (11 unit failures). Categories are now matched by position.
    - **Gaps closed:**
      - Kinds of record from an imported archive are now cleaned as saved ones are.
      - Character profiles now show the rules of the fields every character shares.
    - **Expectations of mine:**
      - Text export upper-cases headings.
      - The character page has no "Every connection" panel, so the link is followed from the record's side.
      - The graph also hides records with no connection.
  - **Runs:**
    - Two full runs were stopped by me when app code changed mid-run.
    - One stopped at check 642 on the dev-server stall.
    - Then a full run on a freshly started server passed in full: 1369/1369.
- **After Prompt 34: 1351/1351.** 736 unit tests.
  - 16 new e2e checks for cross-references, connection statuses and the record check.
  - **Found while writing the e2e block** (run on its own until it passed):
    - three expectations of mine (the order a pair is named in, a capital letter, and the merge preview's wording, which I then made read better);
    - a label match that ignores case ("Keep “Mira”" also matched "Keep “mira”").
  - **Runs that stopped early, all on the dev-server stall:**
    - At `smoke.mjs:4673`, on a fresh server.
    - At `smoke.mjs:4037`, on the same server.
    - Then a fourth full run, on a newly started server, passed in full: 1351/1351.
  - **A diagnostic run against a production build** (`vite preview`), not a change of procedure:
    - **No stall,** and all 16 of this prompt's checks passed.
    - **1346/1351 overall.** Five older checks failed: character trait chips typed quickly (3 checks), and the relationship map's faction filter (2 checks). Both look like timing races that the faster production build exposes and the slower dev server hides.
    - **Before switching the suite to a production build,** those five need waiting on what they expect. That switch is still the author's call.
- **After Prompt 33: 1335/1335.** 723 unit tests.
  - 10 new e2e checks for a crowded graph (403 records, 1,002 connections).
  - **Updated expectation:** the Prompt 32 block now picks the layer checkboxes by role, since each kind of record also has a "Fold together …" button.
  - **App fix found while writing the tests:** the graph's Layers panel snapped shut by itself when its last setting was cleared. It now stays as the author leaves it.
  - **Found while writing the e2e block** (run on its own until it passed): one check read a menu before the view had re-rendered.
  - **Runs that stopped early:** three in a row, each on the dev-server stall's signature (page not responding, source modules not served, no browser errors), at unrelated earlier steps.
    - At `smoke.mjs:4673`, on a server that had run several suites.
    - At `smoke.mjs:4190` on a fresh server.
    - At `smoke.mjs:4268` on that same server, which then served the same files at once.
    - The fourth run, on a newly started server, passed in full.
  - **The stalls are now more frequent than one run in two.** Running the e2e suite against a production build (`vite preview`) would take the dev server out of the picture. Proposed earlier; waiting for the author's go-ahead.
- **After Prompt 32: 1325/1325.** 718 unit tests.
  - 16 new e2e checks for the knowledge graph.
  - The new block passed on its own at the first try, and the full run passed in full the first time, with no dev-server stall.
- **After Prompt 31: 1309/1309.** 709 unit tests.
  - 20 new e2e checks for the character appearance matrix.
  - **Updated expectations:**
    - The Visualize page now has eleven views; the two checks listing the views were updated, and Back after them now lands on Character appearances.
    - The dashboard's observation now reads "1 character has no appearance recorded in any chapter", not "does not appear", in the unit and e2e checks.
  - **Found while writing the e2e block** (run on its own until it passed): one check counted a button before the details panel had drawn it.
  - **Runs that stopped early:**
    - Two, both at `smoke.mjs:7228`: a full page load of Visualize after the timeline review. They had the dev-server stall's signature (the page not responding, source modules never served, no browser errors). The second was on a freshly started server.
    - The third run, on that same server, passed in full.
    - Because two stalls landed on the same step, it may be one that strains the dev server. Worth watching.
- **After Prompt 30: 1289/1289.** 700 unit tests.
  - 19 new e2e checks for structure and pacing.
  - The Visualize page now has ten views; the two checks listing the views were updated.
  - **App fix found by the unit tests:** "Action" on one scene and "action" on another counted as two labels. Labels are now one label whatever their capitals: a suggestion's spelling is used when saved, and an own label is shown as first spelled in reading order.
  - **Found while writing the e2e block** (run on its own until it passed): a variable name used twice, and one expected column off by one in my own expectation.
  - **Full run:** passed in full the first time, with no dev-server stall.
- **After Prompt 29: 1270/1270.** 686 unit tests.
  - 19 new e2e checks for plot-thread lanes.
  - **Updated expectation:** the plot thread's status menu now ends with "Custom".
  - **Found while writing the e2e block** (run on its own until it passed): SVG text has no `innerText`, so the gap labels are read by their text content.
  - **Runs that stopped early:** one, on the dev-server stall at `smoke.mjs:4462` (the assistant page, unrelated). The next run on a fresh server passed in full.
- **After Prompt 28: 1251/1251.** 676 unit tests.
  - 25 new e2e checks for the scene board.
  - The sidebar now has a Scene board link; the one check that lists an editor's sidebar exactly was updated.
  - **App fix found by the unit tests:** the new page had no tutorial lesson, which an existing test requires of every page. It has one now.
  - **Found while writing the e2e block** (run on its own until it passed; no app changes needed):
    - The manuscript page hides the sidebar, so the test reaches the board from the overview and returns from the editor with Back.
    - A chapter far down the board cannot be dragged by Playwright while it scrolls, so that one step uses a tall window.
    - Switching to lanes updates the address first, so the check waits for the lanes.
  - **Full run:** passed in full the first time, with no dev-server stall.
- **After Prompt 27: 1226/1226.** 666 unit tests.
  - 17 new e2e checks for secrets and knowledge.
  - The Visualize page now has nine views; the two checks listing the views, and the Back check after them, were updated.
  - **App fixes found by e2e:**
    - The record form's selects took the chosen option into their accessible names, as selects wrapped in a label do; they now carry their own labels, as elsewhere in the app.
    - The form cleared itself when a save finished, so a character chosen in the meantime was wiped. It now clears when the record is sent, and puts the values back if the save fails.
  - **Run that stopped early:** the first full run, on the form not being found (the label issue above). The block was then run on its own until it passed, and the next full run passed in full, with no dev-server stall.
- **After Prompt 26: 1209/1209.** 642 unit tests.
  - 16 new e2e checks on a 150-character, 300-relationship court.
  - **App fix found by e2e:** the map's layer checkboxes flicked back while saving to the address.
  - **Runs that stopped early:**
    - Two stopped on my own test mistakes: a miscounted expectation, and a status read before the re-render, and later a dialog covering a button at phone width.
    - One stopped on the dev-server stall.
    - The next run on a fresh server passed in full.
- **After Prompt 25: 1193/1193.** 635 unit tests.
  - 4 new e2e checks for relationship history.
  - **Runs that stopped early:**
    - One on my own test (a variable name used twice; my first fix attempt failed to apply, so the run hit the syntax error).
    - One on the dev-server stall at `smoke.mjs:4167`.
    - The next run on a fresh server passed in full.
- **After Prompt 24: 1189/1189.** 628 unit tests.
  - 11 new e2e checks for the relationship manager.
  - **App fixes found by e2e:**
    - A new section label contained the words of an older label ("Relationship type"), so it was renamed.
    - The settings checkboxes flicked back while saving, and now show the change at once.
  - **Runs that stopped early:** two stopped on those, and one on my own test (a text match with a leading space). The next run on a fresh server passed in full.
- **After Prompt 23: 1178/1178.** 619 unit tests.
  - 11 new e2e checks for the event editor and the timeline review.
  - **Run that stopped early:** one failed two older filter checks, because my new test data put Mira in two more events; the travel case now uses a new character. The next run on a fresh server passed in full.
- **After Prompt 22: 1167/1167.** 610 unit tests.
  - 16 new e2e checks for alternate histories.
  - **App fix found while writing the tests:** a stored event lacking the newer "still going on" field read as changed when compared with one that had it false. Both comparisons now read a missing field as its default.
  - **Runs that stopped early:**
    - Two stopped on my own test timing: changing a history before its panel had switched, and leaving the next block off the Visualize page.
    - One stopped on the dev-server stall at `smoke.mjs:4513`.
    - The next run on a fresh server passed in full.
- **After Prompt 21: 1151/1151.** 601 unit tests.
  - 11 new e2e checks for ages and the life history.
  - **Updated expectations:**
    - Three existing life-path expectations changed from invented exact ages to honest ranges (`ages-and-life-history.md`).
    - The Visualize view lists now have eight views, and Back from the last view lands on Character progression.
  - **Runs that stopped early:**
    - One stopped on the view-list change.
    - One stopped on the dev-server stall at `smoke.mjs:4260`.
    - The next run on a fresh server passed in full.
- **After Prompt 20: 1140/1140.** 584 unit tests.
  - 15 new e2e checks for story order beside reading order.
  - The Visualize page now has seven views; the two checks listing the views were updated.
  - **App fix found by e2e:** the new view had no Side by side / List switch at first.
  - **Run that stopped early:** the dev-server stall, this time at `smoke.mjs:4451`. The next run on a fresh server passed in full.
- **After Prompt 19 and the story calendar: 1125/1125.** 579 unit tests.
  - 18 new e2e checks: 9 for lasting, overlapping and open-ended events, 9 for a custom calendar and switching back.
  - **App fixes they found:**
    - The calendar editor was too wide on a phone (its labels did not wrap); it now uses the wrapping label style.
    - A second line in the Timeline page header broke an older check that reads the header; it has its own class now.
  - **Runs that stopped early:**
    - Three runs stopped because of my own test mistakes (a label matching four fields, reading `innerText` from SVG text, uppercase headings).
    - Two runs stopped for reasons outside this work: the dev server stalled at `smoke.mjs:4240` (as in Prompt 18), and the manuscript "Compare" button at `smoke.mjs:1116` never settled once.
    - The next run on a fresh server passed in full.
- **After Prompt 18: 1107/1107.**
  - 23 new checks for timeline tracks.
  - **Two app fixes they found:**
    - The track checkboxes briefly flicked back, because the page address updates as a transition. The panel now shows each change at once.
    - The "Arrange tracks" panel closed itself when the last hidden track was shown again. It now stays as the author left it.
  - Two runs stopped early for reasons outside the timeline:
    - a dev server stalled serving source modules (page load timeout at `smoke.mjs:4240`);
    - a checkbox check failed, the first of the fixes above.
  - The next run on a fresh server passed in full.
- **After Prompt 17: 1084/1084.**
  - 8 new checks for zoom, scales, jump and range.
  - The zoom checks measure the spacing between two events, which is stable, and not the scale name, which stays the same across a wide range of zoom.
  - They take their baseline only once the drawing's width has settled after a panel closes.
- **After Prompt 16: 1076/1076.**
  - New checks for the drawn timeline.
  - **App fix:** `useAddress` (`viz/hooks.ts`) now builds each change on the address as it is at that moment. Two changes in quick succession (choosing List, then typing a search) used to drop the first.
  - A few e2e checks that read lists before they had appeared now wait for them.
  - One run hung at an unrelated early step ("NOT RESPONDING" while creating a project). It passed on the next fresh server.
- **After Prompt 15: 1070/1070.** 8 new checks for selection and navigation.
- **After Prompt 14: 1062/1062.** 7 new checks for filters and saved views.
- **How to run e2e.** Start a **fresh** dev server for each full run. The second full run against the same server has twice bogged down ("NOT RESPONDING"), which says nothing about the app.
- **After Prompt 13: 1055/1055.**
  - The 11 new checks are the Visualize section.
  - The Phase 29 check of an editor's pages now includes Visualize, which editors may open, like the Story graph.
- **Recommended separate fix**, not part of the visualization work, owner's call:
  - Make the Location-picker test independent of font layout (put the cursor at the end of the text before typing).
  - Investigate the Phase 28 menu tap, so the remaining ~1,500 lines of e2e run again.
- **No new test setup is needed.** Vitest and Playwright are in place and working.

## Side effects of this step

- `dist/` was created by the build. It is in `.gitignore`.
- A Vite dev server was started for the e2e runs and stopped afterwards.
- Test runs used throwaway browser profiles, plus relay data in temporary folders the script creates. No real project data was touched.
