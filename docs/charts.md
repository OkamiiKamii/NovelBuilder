# Charts of what is recorded (Prompt 44)

**Written:** 2026-10-22.

**Code:**
- `src/modules/analytics/charts.ts`: the seven charts (`analyticsCharts`), their filters (`readChartFilter`, `CHART_PARAMS`), and the data as a CSV file (`toCsv`); pure.
- `viz/components/Bars.tsx`: columns (`ColumnChart`) and named bars (`BarList`), on the Dashboard's chart styles.
- `visualize/ChartsView.tsx`: Visualize → **Charts**.
- `manuscript/types.ts`, `manuscript/service.ts`, `characters/components/AppearanceRecords.tsx`, `model/connections.ts`: the **point of view** a chapter or scene is told from (`ChapterPlan.povIds`).

**Tests:**
- `analytics/charts.test.ts`, 8 tests: each chart; its empty states and notes; the filters; the address; the CSV file; the point-of-view field.
- "Charts of what is recorded…" in the Visualize section of `e2e/smoke.mjs`: 18 checks.

## The charts

Each chart says what it **uses**, and what it leaves out. **Nothing is judged:** no literary quality, emotional impact or genre is inferred. A chart shows how much of something is recorded where.

| Chart | Uses | Shape |
|---|---|---|
| **Words per chapter** (or **per chapter and scene**) | the word count saved with each chapter and scene. By chapter, its own text and its scenes'. By scene, each scene, and a chapter's own text when it holds words. | columns, in reading order |
| **How long chapters are** | each chapter's words, counted into bands (250, 500, 1,000… words, at most 12 bands): how many chapters fall in each | columns |
| **Character appearances** | **any record** tying a character to a chapter (appearance records, links in the text, "Entities involved", events told there), or **only appearance records** ("on the page"). No text is searched for names. | bars, most first |
| **Plot-thread presence** | the chapters in which a thread has a development you placed, or one of its events is told | bars |
| **Events per year of story time** | events by the year they start, in the novel's calendar. An approximate date counts at the first year it allows; a relative date, from the event it leans on. Groups of years (2, 5, 10…) when the stretch is long. Empty years are shown. | columns |
| **Point of view** | whose point of view each chapter and scene is told from, as recorded on its plan. A scene with none is told from its chapter's. | bars, with words in the table |
| **Your scene categories** | the labels you give chapters and scenes on their plans, as you spell them (capitals aside) | bars, with words in the table |

## Incomplete data is said, never filled in

- **Each chart has its own empty state,** saying what is missing and where to record it:
  - no chapters, or nothing written yet;
  - fewer than two written chapters for the lengths chart;
  - no characters, or no records of them;
  - no plot threads, or nothing placed;
  - no events, or none with a date that can be placed;
  - no point of view, or no labels, recorded yet;
  - nothing matching the filters.
- **What is left out is counted under the chart:**
  - "1 chapter has no words yet; shown at zero, not as short";
  - "1 event has no date that can be placed, and is not counted";
  - "3 chapters and scenes have no point of view recorded";
  - "1 character has nothing recorded in these chapters: not recorded, which is not the same as absent".

## Filters

One row above every chart, kept in the page address (and in saved views):
- **Chapters** from and to;
- **plot thread:** its chapters and scenes, and its events;
- **point of view;**
- **scene category;**
- **story years** from and to.

They scope every chart. Story years scope the events chart only: chapters have no dates of their own, and the filter row says so. With a chapter, point-of-view or category filter, the events chart counts the events told in the chapters that pass.

**How a chapter passes:**
- With a thread, a chapter or scene passes when it or its chapter holds the thread.
- By point of view or category, only the parts that pass are counted (Orrin's scene's 800 words, not the whole chapter).

**Two settings belong to one chart each:** words per chapter or per scene, and appearances counted from any record or only from appearance records.

## Accessible, and as data

- **Single series:** each chart is one series in the chart colour, so it has no legend; the title names it. The colour passes the palette checks on both surfaces (contrast of at least 3:1, light and dark).
- **Columns:**
  - one stop in the tab order; the arrow keys move between columns, and Enter selects the chapter a column is;
  - each column is named with its value and what it is;
  - its value shows on hover or focus;
  - the highest is labelled;
  - many columns scroll sideways rather than shrink.
- **Bars for named things:** the name is a button that selects the record, and the value is at the tip.
- **The same data, without the drawing:**
  - a summary sentence;
  - **Show as table** under each chart;
  - **List** turns every chart into its table.
- **Download the data (CSV)** saves each chart's table as a file. A cell a spreadsheet would read as a formula is kept as text.

## Point of view: a new, optional record

The prompt asks for point of view "if recorded". The app did not record it, so a plan now can:
- **Where:** "Who appears here" on a chapter's or scene's plan (Organizer, or the editor's plan) has a **Point of view** list, for one or more characters.
- **Data model:** `ChapterPlan.povIds`, optional; older plans have none. No migration; **still version 34.**
- **What it reaches:**
  - copies of the novel re-point it (registered with the plan's references);
  - the record check finds a deleted character still named there;
  - it is a connection of its own ("Point of view in"), so it shows in the knowledge graph and every connection list.

## Limits

- **Event density** is by year of story time, not by month: a month would need every event dated to the month.
- **Lengths** are words as saved by the editor; text not yet saved is not counted.
- **Point of view** is counted by chapter and scene, not by passage within one.
- **Writing dates** (when words were written) are on the Dashboard and Progress pages; these charts are about the story.
