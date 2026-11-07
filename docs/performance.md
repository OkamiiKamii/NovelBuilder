# Speed with a large novel (Prompt 47)

**Written:** 2026-10-22.

**Code:**
- `e2e/bigNovel.mjs`: the benchmark novel. The same records every time (a seeded random number generator), shaped as the app stores them.
- `e2e/perf.mjs`: the browser benchmark. `npm run test:perf` builds the app, serves the build and runs it.
- `src/modules/perf/perf.test.ts`: the computation behind each view, timed in Node, each held to a budget. It runs with the other unit tests.
- The changes:
  - `src/modules/visualize/AppearancesView.tsx`: a large appearance matrix is drawn in steps.
  - `src/modules/manuscript/pages/BoardPage.tsx`: on a large scene board, a card's "Move to…" menu is filled when it is opened.
  - `src/modules/graph/GraphCanvas.tsx`: a graph of more than 1,000 records is laid out in fewer, cheaper steps.
  - `src/modules/analytics/compute.ts`: the dashboard's cast count no longer searches every part's text for every character.

**Tests:**
- `perf/perf.test.ts`: 1 test, 26 timed computations.
- "A large novel…" in the Visualize section of `e2e/smoke.mjs`: 5 checks. It loads the benchmark novel and checks that each change works, and that nothing chosen is lost:
  - the matrix is drawn in steps;
  - a cell chosen far down the list is drawn and stays chosen;
  - the board's menus are filled when opened and still move a scene;
  - the dashboard counts the cast.

## The benchmark novel

At scale 1 (`bigNovel(projectId, at, 1)`):

| Records | How many |
|---|---|
| Acts, chapters, scenes | 3, 120, 480 (603 parts) |
| Codex entries | 1,550: 800 characters, 200 places, 50 factions, 200 items, 300 records of the author's own kind ("Artifacts") |
| Connections between entries | 4,000 |
| Timeline events | 2,000, 70% with a month, a few in an "after" chain |
| Relationships | 800, with 1–3 stages each |
| Scene plans | 480, with 2–6 characters each and a point of view |
| Plot threads | 40, with 15 developments each |
| Journeys | 200 |
| Canon statements, tracked statuses | 300, 50 |

The scene text is not written: word counts are set on the parts. The text-reading checks (the manuscript check, names in the text) therefore do less work here than with a real manuscript of this size.

## How it was measured

**In the browser** (`e2e/perf.mjs`):
- a production build, Chromium through Playwright, a 1280 × 800 window;
- each page timed from navigation until it is drawn: its heading is there, its view has content, and nothing says "loading";
- the Story graph is timed until its layout has settled;
- **busy** is the time the page was blocked by tasks longer than 50 ms, from the browser's long-task records. **Longest task** is the longest of those;
- each figure is the median of 3 runs;
- actions are timed from the input until the result is on screen.

**In Node** (`perf.test.ts`): each computation the views run, best of 3 runs, against a budget a few times what it takes now (1.5 s; 3 s for the network layout and the whole review).

The machine was the owner's Windows 11 computer. The numbers are for comparing before and after on one machine, not promises.

## What was slow, and why

Measured first, with the novel above, before any change:

| Page | Drawn | Busy | Longest task | Cause found |
|---|---|---|---|---|
| Story graph (laid out) | 9,246 ms | 1,443 ms | 603 ms | 3,673 records and 13,199 lines. Each layout step took about 20 ms, and the layout ran 300 steps before it settled. |
| Character appearances | 1,633 ms | 342 ms | 392 ms | Every character × every chapter drawn at once: about 96,000 cell buttons. |
| Scene board | 1,001 ms | 207 ms | 191 ms | Each of 480 cards had a "Move to…" menu listing 119 chapters: about 57,000 menu options. |
| Dashboard | 650 ms | 350 ms | 229 ms | The cast count searched every part of the manuscript for every character's name, and counted relationships by going through all of them once per character. In Node that was 410–770 ms. |
| Relationship map | 705 ms | 257 ms | 307 ms | The network layout: about 200 ms in Node. It runs once per set of filters and is remembered. |
| Continuity review | 565 ms | 150 ms | 200 ms | Every check, about 180 ms in Node. |

Everything else was drawn in under 500 ms, with no task over 170 ms.

## What was changed

- **Character appearances: drawn in steps.**
  - The table draws about 6,000 cells at first (50 characters at 120 chapters), then more when asked: "Show 50 more", or "Show all 800 (may be slow)".
  - The note says how many are shown, and that the list beside it has everyone.
  - The cell chosen in the address is always drawn, even if it is far down. Opening a link to it, or reloading, does not lose it.
  - The arrow keys move only within the rows drawn.
  - Small novels are unchanged: below the step, every row is drawn.
- **Scene board: menus filled when opened.**
  - Above 150 scenes, each card's "Move to…" menu holds only its first line until it takes focus or is pressed. The chapters are put in at that moment, before it opens.
  - The keyboard and the mouse both find them.
  - Below 150 scenes, the menus are filled from the start, as before.
- **Story graph: a quicker layout for large graphs.**
  - Above 1,000 records, the layout settles in about 120 steps instead of 300, and uses a coarser estimate of how far records push each other apart (Barnes–Hut θ 1.2 instead of 0.9).
  - The layout is a little less tidy. Records can still be dragged, found, and hidden by kind, and the graph can be limited to a volume, an arc or a faction.
  - Smaller graphs are laid out as before.
- **Dashboard: the cast counted without searching for every name in every part.**
  - A character is counted in a chapter as before: linked there, listed in its plan, or named in its text.
  - The checks are now in that order. The text is searched only when the name occurs in it at all.
  - Relationships and milestones are counted once for everyone, not once per character.
  - The results are the same; the existing analytics tests (20) pass unchanged.

**Not changed, on purpose:**
- **The relationship map's layout** (about 200 ms for 800 relationships).
  - It is a fixed layout, so the map is the same each time, and it is remembered for each set of filters.
  - Making it quicker would mean a different, less stable drawing.
- **The continuity review** (about 150–180 ms). Each check is already one pass; it runs once when the page opens.
- **Lists.** The timeline list with 2,000 events is drawn in about 300 ms, and filtering it in about 350 ms. A virtual list would break the browser's find-in-page, printing and some screen readers, for little gain at this size.

## Before and after

The old code and the new were built side by side and timed in turn, on the same machine, minutes apart:
- **before:** a copy of the app with the four changes undone, built and served on its own;
- **after:** the app as it is now;
- the benchmark was run against before, then after, then before and after again (two rounds, each the median of 3 runs).

Timing them in turn matters. A first comparison, of a before run and an after run taken at different times, showed the unchanged pages 30–80 ms slower after. Timed in turn, they are the same, so that difference was the machine, not the code.

### Pages (ms; round 1 / round 2)

| Page | Before: drawn | busy | longest task | After: drawn | busy | longest task |
|---|---|---|---|---|---|---|
| **Story graph (laid out)** | 9,764 / 9,529 | 1,842 / 1,694 | 640 / 606 | **4,081 / 4,032** | **803 / 664** | **610 / 514** |
| **Character appearances** | 1,782 / 1,761 | 450 / 397 | 461 / 432 | **437 / 477** | **26 / 34** | **76 / 84** |
| **Scene board** | 1,260 / 1,063 | 268 / 183 | 248 / 233 | **826 / 542** | **35 / 34** | **85 / 84** |
| **Dashboard** | 765 / 716 | 406 / 376 | 263 / 246 | **282 / 282** | **0 / 0** | **0 / 0** |
| Timeline | 499 / 486 | 13 / 11 | 63 / 61 | 505 / 483 | 13 / 12 | 63 / 62 |
| Story vs reading order | 547 / 512 | 29 / 29 | 79 / 79 | 538 / 522 | 30 / 30 | 80 / 80 |
| Relationship map | 817 / 819 | 312 / 288 | 349 / 338 | 825 / 831 | 295 / 287 | 344 / 335 |
| Plot board | 432 / 433 | 9 / 9 | 59 / 59 | 449 / 432 | 10 / 13 | 60 / 63 |
| Structure and pacing | 365 / 381 | 0 / 0 | 0 / 0 | 365 / 383 | 0 / 0 | 0 / 0 |
| Knowledge graph | 513 / 500 | 134 / 132 | 184 / 182 | 533 / 518 | 133 / 137 | 183 / 187 |
| Places | 416 / 399 | 33 / 36 | 83 / 86 | 400 / 414 | 36 / 28 | 86 / 78 |
| Character progression | 333 / 333 | 0 / 0 | 0 / 0 | 332 / 332 | 0 / 0 | 0 / 0 |
| Character history | 332 / 314 | 0 / 0 | 0 / 0 | 332 / 332 | 0 / 0 | 0 / 0 |
| Secrets and knowledge | 332 / 333 | 0 / 0 | 0 / 0 | 349 / 333 | 0 / 0 | 0 / 0 |
| Records by kind | 331 / 331 | 0 / 0 | 0 / 0 | 334 / 333 | 0 / 0 | 0 / 0 |
| Ability paths | 349 / 348 | 0 / 0 | 0 / 0 | 363 / 348 | 0 / 0 | 0 / 0 |
| Journeys | 381 / 423 | 4 / 2 | 54 / 52 | 398 / 386 | 0 / 0 | 50 / 0 |
| Factions | 399 / 399 | 0 / 0 | 50 / 0 | 405 / 405 | 0 / 0 | 0 / 0 |
| Ownership | 365 / 365 | 0 / 0 | 0 / 0 | 351 / 367 | 0 / 0 | 0 / 0 |
| Charts | 499 / 510 | 97 / 93 | 147 / 143 | 532 / 509 | 98 / 95 | 148 / 145 |
| Timeline page | 367 / 363 | 0 / 1 | 0 / 51 | 335 / 366 | 34 / 0 | 84 / 50 |
| Relationships page | 434 / 349 | 51 / 52 | 101 / 102 | 358 / 376 | 52 / 54 | 102 / 104 |
| Record check | 415 / 415 | 29 / 26 | 79 / 76 | 416 / 399 | 27 / 29 | 77 / 79 |
| Continuity review | 661 / 649 | 207 / 202 | 257 / 252 | 648 / 649 | 200 / 203 | 250 / 253 |

In bold: the four pages changed. The others were not changed. Their before and after times differ by up to about 35 ms, in both directions, which is no more than two runs of the same build differ (Journeys before: 381 and 423 ms; the Relationships page before: 434 and 349 ms).

### Actions (ms, from the input until the result is shown; round 1 / round 2)

| Action | Before | After |
|---|---|---|
| Timeline list: search by name (100 of 2,000 shown) | 367 / 350 | 350 / 351 |
| Timeline list: select an event, details shown | 466 / 466 | 477 / 466 |
| Timeline: drawn to list | 310 / 307 | 291 / 291 |
| Relationship map: filter by type | 235 / 199 | 204 / 194 |
| Knowledge graph: search, drawn again | 283 / 250 | 250 / 251 |
| Charts: a chapter range | 200 / 200 | 218 / 216 |

None of these were changed. None moved by more than 35 ms, in either direction.

### Computations in Node (best of 3; ms)

| Computation | Before | After |
|---|---|---|
| **Dashboard analytics** | 410–770 (measured separately) | **9.5** |
| Relationship map layout | 202.5 | 198 |
| Continuity review: every warning | 177.7 | 145.6 |
| Timeline review | 80.1 | 80.7 |
| Place tree | 78.2 | 73.3 |
| Charts | 46.5 | 47.6 |
| Appearance matrix | 44.7 | 37.9 |
| Knowledge graph | 27.1 | 28.0 |
| Derive every connection | 22.4 | 16.0 |
| Everything else | under 20 | under 20 |

Only the dashboard's computation was changed; the other differences are between runs. The full table prints with each run of the test.

## Repeating it

**Browser benchmark:**

```
npm run test:perf
```

Settings, as environment variables:
- `PERF_RUNS`: runs per measurement (default 3).
- `PERF_SCALE`: the novel's size (default 1; 2 doubles everything).
- `PERF_ONLY`: `pages` or `actions`, to time only those.
- `PERF_OUT`: a JSON file to keep the results in, to compare two runs.
- `APP_URL`: the address of an app already being served, when the benchmark is run on its own (`node e2e/perf.mjs`).

It prints one line per page and per action. It exits with an error if a page never appears. An action that never finishes is reported as "did not finish", and the rest still run.

**Computations in Node:**

```
npx vitest run src/modules/perf
```

- `PERF_TABLE` names a file to keep its table in.
- It fails if any computation goes over its budget, so a change that makes a view's work several times slower is caught by the ordinary unit tests.

**To compare a change:**
1. Build the old version into one folder and the new one into another (`npx vite build --outDir <folder>`).
2. Serve both at once, on two ports (`npx vite preview --outDir <folder> --port <port>`).
3. Run `node e2e/perf.mjs` against each in turn, with `APP_URL` and `PERF_OUT` set, and repeat the pair at least once.
4. Compare page by page.

Runs taken at different times can differ by 80 ms or more on unchanged pages. Runs taken in turn mostly differ by under 35 ms.

## Limits

- **The Story graph is still the slowest page.**
  - With 3,673 records, the layout takes about 4 seconds to settle, though the page can be used while it moves.
  - The real answer for a graph that size is to show less of it. The page already offers this: **Limit to** a volume, an arc or a faction, and **Show** to hide kinds of record.
- **Character appearances, "Show all":**
  - with 800 characters this draws about 96,000 cells, and is as slow as before;
  - the button says so.
- **The benchmark has no scene text.** Checks that read the manuscript were timed with empty parts. A real novel of this size would make the continuity review and the manuscript check slower than shown here.
- **Times are from one machine.** The budgets in `perf.test.ts` are set several times above the measured times, so that a slower computer does not fail them.
