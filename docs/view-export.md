# Exporting and printing a view (Prompt 46)

**Written:** 2026-10-22.

**Code:**
- `src/modules/visualize/exportView.ts`: pure.
  - `viewRecords`: the records a view is about.
  - `filterWords`: the filters and settings in words.
  - `exportFileName`, `tablesCsv`, and the file's envelope.
- `visualize/snapshot.ts`: a drawing copied to stand on its own (`standalone`), framed with title, lines and legends (`framedSvg`), as PNG (`pngOf`), as printable data (`printableData`) and as a page for printing (`printDocument`, `printHtml`).
- `visualize/ExportDialog.tsx`: **Export…** on every Visualize view.
- `visualize/VisualizePage.tsx`: the button, and the view drawn as a list out of sight while exporting a drawn view.
- `visualize/ChartsView.tsx`: the charts' own CSV now uses the app's download helper (the share sheet on Android), the shared file-name rule and a byte-order mark.

**Tests:**
- `visualize/exportView.test.ts`, 9 tests:
  - names in several scripts and a very long one;
  - the filters;
  - private notes;
  - secrets;
  - an empty view;
  - a large view (5,000 events);
  - filter words;
  - file names;
  - CSV.
- "Exporting a view…" in the Visualize section of `e2e/smoke.mjs`: 12 checks.

## Five ways out

Visualize → any view → **Export…**:

| As | Holds | For |
|---|---|---|
| **Print, or save as PDF** | The view laid out for paper. Its heading: the view, the novel, the date and time, the filters and settings. Then the drawing with its legends (when the view is shown drawn), the view's records in words as its list shows them, and a line saying it is not a backup. "Save as PDF" in the print dialog makes the file. | paper, a PDF to send |
| **Picture (PNG)** | The drawing as shown, framed with the same heading and its legends, at twice the screen's size where the browser allows. A very large drawing is drawn smaller rather than not at all. | slides, messages |
| **Picture (SVG)** | The same, as a drawing that stays sharp at any size | print shops, drawing programs |
| **Records (JSON)** | The records the view is about, as the app keeps them (see below) | moving data into other tools, keeping a record of a view |
| **Table (CSV)** | A first table with the date, the filters and settings, then the view's tables as its list shows them. A view whose list has no table gives its list one line an item. | spreadsheets |

**A picture needs the drawing on screen.** In a view shown as a list, or one with no drawing, the picture choices are greyed out, with the reason.

## Records, faithfully

**What it holds:**
- **The records of the kinds the view is about:**

  | View | Kinds |
  |---|---|
  | Timeline | events |
  | Relationship map | relationships, characters and connections |
  | Knowledge graph | every kind |
  | Charts | each chart's table, with what it uses |
  | … | … |

- **As the app reads them:** every field, with the stable ids they are kept under.
- **Narrowed by the page's filters.** Layers and other drawing settings change only the drawing. They are listed with the filters, so the file says how the view was set up.
- **A name for every id it holds** (characters, places, chapters, events…), so it reads on its own.

**The file's envelope:**
- `format` and `version`;
- `exportedAt`;
- the novel's id and title;
- the view (key, name, description, drawn or as a list);
- the filters and settings in words;
- `notABackup`;
- `leftOut`: what was left out on purpose;
- `empty`: what the view says when it has nothing to show.

**It is not a backup.** The dialog and every file say so, and point to **Import & Export → Export entire project data**, which keeps the whole novel and can be imported again.

## Private data

**Private notes are left out unless asked for:**
- **Which notes:** a codex entry's notes ("Private to the author"), and a chapter's or scene's notes.
- **Asking for them:** only the author and co-authors can tick "Include private notes", and only for records.
- **The file says when they were left out.**

**Secrets** (Secrets and knowledge) are never in the records unless an author or co-author ticks "Include the secrets themselves".

**A picture or printout holds what is on screen,** and the view's details panel is not part of it. For the secrets view, the dialog says so.

**Nothing is sent anywhere.** Every export is made in the browser and saved by the app's own download, which on Android goes through the share sheet.

## Offline

Nothing is fetched: drawings, pictures, files and the print layout are all made in the browser, and the print layout uses system fonts. Tested with the browser offline: a picture and the records are both made.

## Names, sizes, scripts

- **Any script:**
  - files are UTF-8;
  - the CSV starts with a byte-order mark, so a spreadsheet reads 東京, Ærøskøbing or Корона as written;
  - the print page declares its character set;
  - file names keep letters from any script ("Le-Château-東京-timeline-2026-10-22.json").
- **Long names:**
  - wrap in the print layout;
  - stay whole in records and tables;
  - are cut at 60 characters in a file name.
- **Large views:**
  - a 150-character, 300-relationship map exports as a picture and as records within the test's time;
  - 5,000 events export in milliseconds.
  - The print layout repeats table headings on each page and keeps a row together.
- **Empty views** export what they say ("No secrets yet…"), so an empty file is never mistaken for a failed one.

## Limits

- **A picture is of the drawing as shown:**
  - the part a zoomed drawing shows, in the theme in use;
  - a dark theme prints dark.
- **Some views draw with HTML rather than SVG** (the charts' columns, ownership chains). They have no picture; their print layout and tables carry them.
- **Records hold the kinds a view is about, not the whole novel:** chapter text, profiles and history are on the Import & Export page.
- **No Word or spreadsheet file** is made from a view. CSV opens in any spreadsheet.
