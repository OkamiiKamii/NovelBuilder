# Release readiness (Phase 24)

Checked on 2026-10-26 with Flutter 3.38.9 on the owner's Windows 11 PC, and on an Android 15 emulator. This file
says what the Flutter app does and does not do, how it was checked, what was measured, and what is still a risk. Every
result below is from a real run; nothing is estimated.

## 1. Checks and results

| Check | Result |
|---|---|
| Formatting (`dart format`, 120 columns) | Clean |
| Static analysis (`flutter analyze`, strict) | No issues |
| Unit and widget tests | 1,124 of 1,124 pass (re-run 2026-10-30 after Review one at a time) |
| Integration tests on Windows (real app window) | 22 of 22 pass (2026-10-30, with the title page) |
| Integration tests on Android (emulator, Android 15, x86_64) | 22 of 22 pass (2026-10-30, with the title page) |
| Integration tests on a real Android phone (nubia RedMagic NX769J, Android 16, arm64, RedMagic OS 11) | 21 of 21 pass (2026-10-27) |
| Mac and iPhone | Not run here: built and tested on the owner's Mac with `tool/local_mirror.sh` (see section 8) |
| Builds | Windows release (`release/flutter/windows/NovelBuilder-Windows.zip`) and Android release APK (`release/flutter/android/NovelBuilder.apk`); `pub get --enforce-lockfile` confirms the lockfile unchanged |

New in Phase 24, and kept in the test suite so a later change cannot quietly undo them:

- `test/perf/large_project_test.dart`: a generated novel of realistic size (below) opens every screen without an error,
  at desktop and phone width; plot lanes build only the columns near the screen; the whole novel survives a restart of
  the library file and a backup round trip **exactly, record for record**.
- `test/app/accessibility_sweep_test.dart`: every screen, in both themes, at desktop and phone width, meets Flutter's
  tap-target, labelled-control and text-contrast guidelines; and every screen fits a phone at twice the text size.
- `test/app/keyboard_sweep_test.dart`: Tab moves through every screen and never gets stuck (15 to 80+ controls reached
  per screen).
- `test/app/privacy_audit_test.dart`: no network code, no AI or model packages, nothing printed or logged, links in the
  prose never opened, no network permission in the Android and Mac release builds.
- `test/shared/domain/analytics_names_test.dart`: where each character appears is unchanged by the speed-up below, on
  names with accents, apostrophes, hyphens, digits and near misses.
- `integration_test/perf_test.dart` (run with `flutter drive --profile`): the timings in section 3.

## 2. The large test novel

`test/helpers/large_novel.dart` builds it in memory (test content only; it never enters a real library): 10 volumes,
300 chapters and 600 scenes with about 300,000 words of prose, 400 characters, 300 places, 100 factions, 200 items,
4,000 connections, 600 relationships (half with a second stage), 800 dated events, 40 plot threads and a year of
writing sessions: about 8,100 records. As a backup file it is 5.2 MB; in the library, 7.5 MB.

## 3. Performance (measured)

Profile builds (the speed of a release build, with timing), on the large novel. "Screen" is from asking for the screen
to the screen drawn and still. Windows: the owner's PC. Android: an emulator (Pixel 7 size, Android 15, x86_64, on the same PC, drawing with a software GPU), so its times show how the app behaves on a phone-sized screen, not how fast a real phone is.

| What (ms) | Windows PC | Android emulator |
|---|---:|---:|
| Read a backup file (preview) | 59 | 195 |
| Import it into the library | 390 | 554 |
| Export a backup | 167 | 212 |
| Open the novel | 127 | 123 |
| Screen: Library | 104 | 114 |
| Screen: Write | 384 | 716 |
| Screen: Write → Read as a book | 642 | 614 |
| Screen: Write → Book details | 271 | 234 |
| Screen: Organize → Characters | 455 | 682 |
| Screen: Organize → World | 473 | 614 |
| Screen: Organize → Systems | 297 | 326 |
| Screen: Plan → Timeline | 627 | 724 |
| Screen: Plan → Calendar | 257 | 270 |
| Screen: Plan → Plot threads | 295 | 252 |
| Screen: Plan → Scene board | 574 | 272 |
| Screen: Plan → Alternate histories | 366 | 364 |
| Screen: Review → All warnings | 817 | 950 |
| Screen: Review → Record check | 284 | 269 |
| Screen: Review → Timeline review | 250 | 287 |
| Screen: Review → Canon | 231 | 236 |
| Screen: Review → Continuity | 248 | 236 |
| Screen: Visualize → Relationship map | 495 | 467 |
| Screen: Visualize → Timeline | 384 | 374 |
| Screen: Visualize → Story and reading order | 616 | 624 |
| Screen: Visualize → Plot lanes | 863 | 803 |
| Screen: Visualize → Structure | 847 | 815 |
| Screen: Visualize → Appearances | 499 | 537 |
| Screen: Visualize → Knowledge graph | 495 | 578 |
| Screen: Visualize → Records by kind | 540 | 562 |
| Screen: Visualize → Ability paths | 337 | 361 |
| Screen: Visualize → Character progression | 315 | 279 |
| Screen: Visualize → Places | 550 | 499 |
| Screen: Visualize → Secrets and knowledge | 342 | 324 |
| Screen: Visualize → Journeys | 270 | 261 |
| Screen: Visualize → Factions | 810 | 846 |
| Screen: Visualize → Ownership | 438 | 4,578 * |
| Screen: Visualize → Charts | 540 | 611 |
| Screen: Visualize → Character history | 298 | 319 |
| Screen: Progress | 678 | 499 |
| Screen: Progress → Analytics | 403 | 478 |
| Screen: Settings | 412 | 293 |
| Screen: Settings → Import & export | 383 | 510 |
| Open a scene in the editor | 166 | 175 |
| Compile the manuscript | 882 | 737 |
| Export the manuscript as Word | 40 | 60 |
| Export the manuscript as a web page | 16 | 19 |
| Export the manuscript as PDF | 919 | 1,378 |
| Restart: open the library and show it | 164 | 151 |

(\*) On the emulator, 4.4 s of this is spent inside the emulator's own software graphics (a timeline of it shows the time in Impeller's OpenGL layer, `ReactorGLES`, after many screens have been drawn); the app's own work for the screen is about 0.2 s, and the same screen takes 0.25 s when opened first. Measured twice: 4,574 and 4,578 ms. A real phone has not been measured.

### What was slow, why, and what changed

Measured first (time split between working things out and building the screen), then fixed only where the time went.

| Screen | Before | After | Cause and change |
|---|---|---|---|
| Plan → Scene board | 3,242 ms | 574 ms | Every card of every part was built at once (about 900 cards with drag handles, menus and thread chips). The board is now a list built as it is scrolled: the header, each part's title, then its row of columns (or each lane on a phone). |
| Progress | 2,366 ms | 678 ms | Two causes. (1) Where each character appears: every character's name was searched for in every chapter's full text (400 × 900 searches). A chapter is now skipped at once when it lacks one of the name's words, which can never change the result (proved by a test against the plain search). (2) The words-per-week chart worked out the week of each writing session eight times over; each day's week is now worked out once. |
| Plan → Alternate histories | 1,661 ms | 366 ms | Measured slow only after the scene board (left-over work); with the board fixed it is no longer slow. |
| Visualize → Plot lanes | 1,575 ms | 863 ms | A tap target and screen-reader button for every cell: 40 threads × 300 chapters = 12,000 widgets, plus 300 chapter tooltips. Only the columns near what is on screen are built now, in steps of 16 as it scrolls; the drawing still shows every column, and keyboard moves bring their cells with them. |
| Write → open a scene | (no reading) | 166 ms | Not slow: the first timing never ended because the caret blinks for ever and the test waited for a still screen. The test now times to the editor shown. |

Not changed, because they were not slow: every other screen opens in under a second on Windows, backups export and
import in under half a second, and a Word or web-page export of 300,000 words takes under 50 ms (PDF about a second).

## 4. Accessibility

The sweep (section 1) found, and these were fixed:

- **Too small to tap** (under 48 × 48): the "Saved views" menu on every Visualize view (40 px tall), "Or start from a
  preset…" in Systems, the scene board's card title, plan button, status menu and "Add to a thread", the plot-lane
  cells (42 × 38) and the appearance-matrix cells (40 × 36). All are now at least 48 × 48; the lane and matrix grids
  are a little larger as a result.
- **Buttons a screen reader heard as unnamed**: every plot-lane cell and every structure bar had an extra, empty
  button inside its named one (12,000 on the large novel); the knowledge graph's two "Show…"/"Fold…" checkboxes had
  no name; the timeline drawing, which takes taps and keys, had no name. Each is now one named control, and the
  timeline drawing says how to use it.
- **Cut off at twice the text size on a phone**: the ability-tree boxes (fixed 46 px tall; now they grow with the text,
  up to the space between rows) and the ability-path legend (now wraps). An "Add to a thread" label on a narrow card
  overflowed on the large novel; it now shortens with an ellipsis.

Already in place and re-checked: text contrast passes in both themes on every screen; Tab reaches every screen's
controls without a trap; every drawn view has a list or table form (each says so, and each was tested in its own
phase); meaning is never shown by colour alone (signs, labels and line styles too). **Reduced motion**: the app has
no animations of its own and pages change without a transition, so only Flutter's own small effects (ripples, menus)
move.

## 5. Privacy

- **No network**: the app's code opens no connection and launches no web address (checked by a test over every source
  file). The Android release build asks for no internet permission and the Mac release build's sandbox allows none, so
  on those two systems the operating system itself blocks any connection. iPhone and Windows have no such switch; there
  the guarantee is the code, and the test that guards it.
- **Packages**: no AI, model, analytics or crash-reporting package. Two packages that could reach the network come in
  with the text editor: `http` (never called by the app) and `url_launcher` (the editor opens a link when one is
  tapped). The app turns the editor's link-tapping off (`contentTapDelegateFactories: const []`), so a link in the prose
  is never opened; a test checks this stays so.
- **Logs**: nothing is printed or logged. Uncaught errors are kept in memory on the device, by type only: their
  messages, which can quote story text, are not kept, and nothing is written to disk or sent.

## 6. Data safety

Tested end to end (unit, widget and device tests): autosave with a visible status and retry; every write a transaction
(all or nothing, also when the app is killed mid-write); restart; crash-recovery drafts; a save based on an out-of-date
copy refused with the newer version kept; restore points before every replace and delete; schema upgrades (a copy of
the library kept first, a failing step rolled back, a library from a newer app refused untouched); backup and restore
(exact, record for record; at the large size too); imports that fail change nothing; rename, delete with Undo; custom
fields kept through every change; unknown fields and collections from the original app kept; views turned off and on
without losing data; alternate histories that keep only their differences.

No data-loss or critical navigation problem is known.

## 7. Feature matrix

**Complete** = built, checked against the original app where there is one, and tested. **Partial** = some of it.
**Not built** = not in the Flutter app. **Optional** = needs the owner's approval before any work.

### Roadmap phases

| Phase | Status | Notes |
|---|---|---|
| 0 Audit and plan | Complete | |
| 1 Foundation and app shell | Complete | 8 areas; rail, bottom bar; two themes |
| 2 Domain models and shared data | Complete | |
| 3 Persistence, autosave, recovery, backups | Complete | |
| 4 Library and novel management | Complete | |
| 5 Manuscript editor and organisation | Complete | Alternate drafts of a chapter built 2026-10-27 (the editor's Alternate drafts button) |
| 6 Characters and profiles | Complete | |
| 7 Worldbuilding and custom reference database | Complete | |
| 8 Shared relationships and cross-references | Complete | |
| 9 Relationship history and social network | Complete | |
| 10 Events and advanced timeline | Complete | |
| 11 Visualization workspace | Complete | |
| 12 Plot board, threads, structure and pacing | Complete | "What depends on this" built 2026-10-27, linked from plan pages |
| 13 Knowledge graph | Complete | |
| 14 Custom data types and templates | Complete | |
| 15 Progression and ability trees | Complete | |
| 16 Places, maps, travel, factions, ownership | Complete | |
| 17 Canon and continuity review | Complete | |
| 18 Analytics and writing progress | Complete | The original's movable dashboard widgets: not built, by choice |
| 19 Import/export and portability | Complete | A picture of a view as SVG: not built (PNG and PDF are) |
| 20 Cloud sync | Declined | The owner chose (2026-10-27) to keep the app offline; backups move novels between devices |
| 21 Collaboration and sharing | Complete (by file) | Offline review copies and feedback files (owner's choice, 2026-10-27); no live sharing; no co-author role by file |
| 22 Reader preview, serialization, publishing | Complete | Cover picker built 2026-10-27 (a novel's details) |
| 23 Template sharing | Complete (files) | Local template files (categories & fields, profile layouts, systems) with attribution, licence and versions; no marketplace or community (would need approval and network) |
| 24 Quality, accessibility, performance, release | Complete | This document |

### Visualization inventory (roadmap section 6)

| View | Status | Where |
|---|---|---|
| 1 Story timeline | Complete | Visualize → Timeline (branch comparison: Plan → Alternate histories) |
| 2 Relationship map | Complete | Visualize → Relationship map |
| 3 Plot/chapter board | Complete | Plan → Scene board |
| 4 Knowledge graph | Complete | Visualize → Knowledge graph |
| 5 Character history | Complete | Visualize → Character history |
| 6 Parallel storylines | Complete | Timeline tracks by character, faction or thread; Plot lanes |
| 7 Plot-thread map | Complete | Visualize → Plot board (lanes) |
| 8 Faction/political map | Complete | Visualize → Factions |
| 9 Location explorer/world map | Complete | Visualize → Places |
| 10 Travel routes | Complete | Visualize → Journeys |
| 11 Item ownership | Complete | Visualize → Ownership |
| 12 Knowledge/secrets | Complete | Visualize → Secrets and knowledge |
| 13 Ability/progression tree | Complete | Visualize → Ability paths, Character progression |
| 14 Appearance matrix | Complete | Visualize → Character appearances |
| 15 Continuity dashboard | Complete | Review → All warnings |
| 16 Canon/alternate comparison | Complete | Review → Canon; Plan → Alternate histories |
| 17 Story structure | Complete | Visualize → Structure and pacing |
| 18 Pacing/distribution charts | Complete | Visualize → Charts |
| 19 Saved views | Complete | Every Visualize view |
| 20 Custom dashboard | Not built | By choice (recorded in the handoff) |

### Module system (roadmap section 7)

| Part | Status | Notes |
|---|---|---|
| Views turned off and on, data kept, dependencies explained | Complete | Settings of the novel (`viewsOff`) |
| Genre module manager (Fantasy, LitRPG, Sci-fi, Mystery, Romance, Horror, Superhero, Historical, Contemporary, Political) | Complete (2026-10-27) | Organize → Modules: the original's ten modules word for word; on/off without creating or deleting records; a workspace per module with its 11 kinds of tool; Configure; the author's own modules kept on the device and shared as `.module.json` files. Checked step by step against the original service (`tool/golden/modules.test.ts`) |

### Other features of the original app

| Feature | Status |
|---|---|
| Search across the whole novel (original `search`) | Complete (2026-10-27): ⌘K / Ctrl+K, the rail's search button, or More → Search the novel; agrees with the original on every query in every scope |
| "What depends on this" before a change (original `consequences`) | Complete (2026-10-27): Review → What depends on this, linked from chapter plans, events and plot developments; reads only; agrees with the original on 136 reports |
| Tutorials (original `tutorial`) | Complete (2026-10-27): the Tutorial button (rail, or More on a phone) and Settings → Tutorial; a lesson for every page, written for this app |
| AI assistant, brainstorms, ideas | Excluded by rule (no AI); their data is kept in backups |
| Docked studio layout (original `studio`) | Replaced by the Flutter shell |

## 8. Platform limitations and risks

- **Mac and iPhone** are built and tested on the owner's Mac only (`tool/local_mirror.sh`), not re-run in this phase.
  The changes in this phase are in shared Dart code; the Mac run should be repeated before a Mac or iPhone release.
- **iPhone**: signed with a free personal team, so an install stops opening after 7 days until reinstalled (data is
  kept). Wider distribution needs the paid Apple Developer Program (TestFlight or the App Store).
- **Mac**: Apple silicon only; not notarized, so macOS warns on first open when the app is copied to another Mac.
- **Windows**: a zip, not an installer; the program is not code-signed, so SmartScreen may warn on first run.
- **Android**: an APK signed with the project's key, installed by hand (no store listing). Tested on one real phone (a
  nubia RedMagic, Android 16): all 21 device tests pass. That phone's system hides app log messages, which Flutter's test
  runner needs: before running tests on it, `adb shell setprop log.tag.flutter V` (reset by a restart; clear it with
  `adb shell setprop log.tag.flutter "''"`), and clear the log first (`adb logcat -c`) so an old run's address is not
  picked up. Its timings have not been measured.
- **Performance** was measured on one PC and one emulator (an Android emulator with software graphics). Older phones are untested and will be
  slower. Pages measured above all open in under a second on the PC.
- **Scene board, columns view**: fixed 2026-10-27. A part's row of columns is built near the screen only (300 chapters in
  one part: under 40 columns built; checked in `test/perf/large_project_test.dart`).
- **Reader**: fonts are those already on each device, so the same book paginates slightly differently on each.
- **Backups are the author's**: the library lives on the device; nothing is copied anywhere automatically.

## 9. Build instructions

All with Flutter **3.38.9** (newer versions rewrite locked packages). Packages are fetched with
`--enforce-lockfile`.

| Platform | Where | Command | Output |
|---|---|---|---|
| Windows | The Windows PC | `tool\windows.ps1 build windows` | `release/flutter/windows/NovelBuilder-Windows.zip` (unzip, run `NovelBuilder.exe`) |
| Android | The Windows PC or the Mac | `tool\windows.ps1 build android` or `tool/local_mirror.sh build android` | `release/flutter/android/NovelBuilder.apk` |
| Mac | The Mac | `tool/local_mirror.sh build macos` | `release/flutter/macos/NovelBuilder-macOS.zip` |
| iPhone | The Mac, phone connected | `tool/local_mirror.sh iphone <device-id>` | Installed and launched on the phone |

Tests: `tool\windows.ps1 analyze | unit | test [windows|<device>]` on Windows; `tool/local_mirror.sh unit | test
<device>` on the Mac. Timings: `flutter drive --profile --driver=test_driver/integration_test.dart
--target=integration_test/perf_test.dart -d <device>`, written to `build/integration_response_data.json`.
