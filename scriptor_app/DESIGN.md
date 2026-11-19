# Scriptor — Design

The look the owner chose (2026-11-16, from their mock-ups of the Library, editor, character page, world map, analytics
and Settings): **System Monolith**. A futuristic system interface: near-black navy panels, gold for what is chosen and
what acts, sky blue for what informs and for the glow at panel edges. Its colours are the Flutter app's System Monolith
tokens exactly (`flutter_app/lib/app/theme/app_theme.dart`, `MonolithTokens`), so the two apps match.

The code that holds these values is `src/ui/theme.ts`. Screens take colours and fonts from there, never as literals.

## Colours

| Token | Hex | Used for |
|---|---|---|
| `background` | `#0A0B0E` | The ground behind everything |
| `surface` | `#13161F` | Panels and cards |
| `elevated` | `#1C202D` | Raised parts: fields, toolbars, the selected row's ground |
| `border` | `#272E40` | Panel and card outlines |
| `gold` | `#F3B63A` | Accent: the selected item, main buttons, progress bars, key numbers, headings of panels |
| `onGold` | `#0A0B0E` | Text and icons on gold |
| `sky` | `#38BDF8` | Second accent: information, "Ongoing", the "Auto-saved" tick, the blue glow on panel edges |
| `text` | `#F8FAFC` | Main text |
| `muted` | `#94A3B8` | Secondary text: dates, counts, captions |
| `danger` | `#F87171` | Errors, deleting, "At war", "Rivals" |
| `success` | `#4ADE80` | "Completed", a finished progress bar's end |
| `goldLight` | `#FFD36B` | The light end of the gold gradient (filled buttons, the ink's surface) |
| `goldDeep` | `#C98A12` | The deep end of the gold gradient (buttons, progress bars, the ink's foot) |
| `tints.goldRule` | gold at 45% | Thin gold lines over pictures (the cover medallion's outer ring) |
| `tints.veil` | background at 55% | A dark veil under a mark set on a picture (the cover medallion) |

Status colours from the mock-ups: Ongoing sky, On hold gold, Completed green, Archived muted.

## Type

| Role | Font | Where |
|---|---|---|
| Interface | **Outfit** | Navigation, buttons, labels, panel headings (often in capitals with wide letter spacing: "MY NOVELS", "GENERAL INFO") |
| Book text | **Merriweather** (and italic) | Chapter text, quotes, summaries |
| Display | **Cinzel** | Book titles on covers, chapter titles ("Chapter 1: The Awakening"), a character's name |
| Numbers | **JetBrains Mono** | Stats tables, counts where columns must line up |

All bundled with the app (SIL Open Font License, licences in `assets/fonts/`), so it looks the same on every phone and
needs no network.

**Weights.** The files are variable fonts. `app.json` declares each one to Android as a font family with named weights
(expo-font's `android.fonts`), so `fontWeight` picks a real face of the same typeface: text with no weight is Regular
(400), `'700'` is that font's Bold. (Before 2026-11-18 Android drew each file's default instance, Outfit at Thin 100
and Merriweather at Light 300, and every bold fell back to Roboto.)

| Family | Weights declared |
|---|---|
| Outfit | 400, 500, 600, 700, 800, 900 |
| Merriweather (and its italic) | 400, 600, 700, 900 (italic 400, 700) |
| Merriweather-Italic | 400, 700 |
| JetBrainsMono | 400, 500, 600, 700, 800 |
| Cinzel | 400, 600, 700, 900 |

The editor and reader pages (WebViews) read the same files from `file:///android_res/font/` (the names expo-font gives
them: `outfit.ttf`, `merriweather.ttf`, `merriweather_italic.ttf`, `cinzel.ttf`, `jet_brains_mono.ttf`), so each font
is in the app once.

## Shapes and effects

- **Panels:** `surface` ground, 1 px `border` outline, about 10 px rounded corners, a soft sky-blue glow along the edge.
- **Selected navigation item:** filled with a gold gradient, dark text, a brighter gold edge.
- **Main buttons:** gold outline with gold text and icon ("New Novel", "Continue"); the most important action is filled
  gold.
- **Progress bars:** thin, gold on a dark track, with the percentage beside them in gold.
- **The day's ring** (`frame.tsx`, on the bottom bar and the rail): with a daily word goal set on the open novel, the
  Write area's feather sits in a thin ring that fills gold, clockwise from the top, as today's words reach the goal;
  once it is met, the feather stands dark on a solid gold disc. Visible from every area, so the day's writing is never
  more than a glance away. No goal, no ring. A screen reader hears "Write: 127 of 250 words today".
- **The day's seal** (`write/DaySeal.tsx`): the moment today's words cross the daily goal while writing, a gold seal
  is pressed onto the page (the goal in Cinzel, the feather, "WORDS") with "The day's words are written." beneath it in
  Merriweather italic; it holds about 2.6 s and lifts away. It never takes a touch or the keyboard, comes only on
  crossing in this sitting (never on opening a chapter after the goal was met), is announced to a screen reader, and
  only fades, without moving, for less motion.
- **Your first book** (`FirstBook.tsx`): while the writer has no novel of their own (only the sample, or nothing; archived
  ones don't count), the top of the Library is a blank jacket in the same banner style, with "YOUR FIRST BOOK" in gold
  and the title typed straight onto it in Cinzel over a gold rule; "Begin chapter one" makes the book (the last author
  name used) and opens Chapter 1. It gives way to Pick up the thread once a book of their own exists.
- **The daily nudge** (`domain/goals/reminder.ts`, `ui/reminders.ts`, on the pick-up banner under the week): "A nudge each
  day, at the hour you write?" with three times (Morning 8:00 AM, Midday 12:30 PM, Evening 8:00 PM); once chosen, "A nudge
  at 8:00 PM, never on a day you have written" and Off. A local Android notification (`expo-notifications`, nothing sent
  anywhere) titled "Your next page: <the book>" with the last line written; pressed, it opens Write at the last word.
  The next week is planned at once and again whenever Scriptor goes to the background, so today's is dropped once today
  is written. Its small icon is the feather in white, tinted gold.
- **Before you go** (`DeskViews.tsx` `NextNoteSheet`, leaving after a sitting of 100 words or more): the close of the
  sitting before the note for next time: the words written in it large in Cinzel gold ("+347", "WORDS IN THIS
  SITTING"), then today against the daily goal with its bar, and the days in a row, over the gold ornament line.
- **A milestone on the road** (`write/MilestoneMoment.tsx`): the moment the whole book passes a length on the road to the
  draft while writing (1,000 words, a short story's 7,500, a novelette's 17,500, a novella's 40,000, the whole draft
  at the target), the page dims and a gold-edged card stands over it: "THE ROAD TO THE DRAFT", the number large in
  Cinzel gold, "WORDS", what the book has become in Merriweather italic, and the road's diamonds with this one lit. It
  holds about four seconds and goes; it never takes a touch or the keyboard. Larger and rarer than the day's seal.
- **Pick up the thread** (top of the Library, `PickUp.tsx`): the book last opened, as a banner of its own jacket (its
  colour and genre pattern, `NovelCover` with `backdrop`, darkening into the panel) with the chapter it was left in in
  gold capitals and the title large in Cinzel bold over it; then the last lines written there in Merriweather italic
  (whole, at most four lines: the end of the last paragraph, starting at a sentence), the writer's own **note for next
  time** on that chapter when they left one, **this week** as seven marks Monday first (filled gold for a day
  written, a gold ring for today still to write, faint for the rest; the initials under them, today's in gold) beside
  the run of days ("3 days in a row · write today to keep it"), the editor's gold ornament line, today's words against the daily goal (or,
  with no daily goal yet, **How much a day?**: four pace cards, 100 / 250 / 500 / 1,000 words in Cinzel gold with what
  that is in pages; one press sets the goal, and the ring and the seal follow from it), and one filled gold **Continue writing** that opens that chapter with the caret after its last word, with a gold-outlined
  **15-minute sprint** under it (the same, with a sprint started and the desk cleared into focus). Hidden while
  searching; absent until a book has been opened.
- **The shelf** (`ShelfView.tsx`, the Library's third view beside cards and list): every novel stands as a book on a
  shelf, its spine in the book's own colour (shaded to look round) with gold bands top and bottom and its title up the
  spine in Cinzel bold, a star on a favorite; as thick as it is written (`spineThickness`, the square root of its words,
  30 to 78 points) and a little different in height for each book. Rows stand on a dark board with a gold edge; under
  them, "Each book stands as thick as it is written." A press opens the book, a long press its menu.
- **Novel cards:** the cover picture fills the card top, a status chip at the top left, a "…" menu at the top right, the
  title in Cinzel, then progress, chapters and last-read date, then Continue and a stats button.
- **Designed covers** (a novel with no picture of its own, `NovelCover.tsx`, choices in `domain/coverArt.ts`): the
  book's own colour from top to foot; a fine gold line pattern from its **primary** genre (fantasy: pointed arches;
  sci-fi: orbits and stars; adventure and the sea: waves; mystery and crime: rain; romance: a lattice of rings; horror:
  rings round a moon; LitRPG and progression: climbing chevrons; anything else: ruled manuscript paper), each drawn
  faint enough to carry the same weight; a double gold rule with diamond corners; a shaded spine fold on the left; and a
  medallion with the title's initial in Cinzel (past "The", "A", "An"). With the title shown, the title and the author
  stand under the medallion.
- **Section headings:** an icon in gold, then the title in Outfit capitals ("LIBRARY OVERVIEW", "QUICK ACTIONS").
- **Editor:** a dark page, the chapter title in Cinzel with a gold ornament line under it, the text in Merriweather,
  the chapters list on the left with the open chapter filled gold, word count / characters / reading time at the foot.

## Launch and icon

- **Launch screen** (`expo-splash-screen` in `app.json`): the `background` near-black with the crest in the middle,
  so opening Scriptor never flashes white.
- **Launcher icon:** the owner's crest (`assets/android-icon-foreground.png`, kept as it is) scaled into Android's
  safe zone, with its square plate fading to transparency, in `assets/android-icon-foreground-safe.png` on the
  `background` colour. Every launcher mask (circle, squircle, rounded square) shows the whole crest, wing tips
  included. The launch screen uses the same picture.

- **Home-screen shortcuts** (`plugins/withShortcuts.js`): long-press Scriptor's icon for **Continue writing** (Write,
  on the chapter last worked in, the caret after its last word: `scriptor:///write?at=end`) and **Start a new novel**
  (the Library with the New novel form open: `scriptor:///?new=1`), each on a round gold icon with a dark glyph
  (Material Design Icons' feather and plus). They can be dragged onto the home screen as icons of their own.

- **The writing widget** (`plugins/withWritingWidget.js`, a native Android home-screen widget, 4 × 2, resizable): the book
  last worked in on a dark-gold panel ("SCRIPTOR" in gold capitals, the title, the last words written in the chapter last
  worked in, in the system serif italic (one to three lines as the widget's height allows, from a sentence when one starts in
  reach), this week's seven marks and the run of days, "Today: 238
  of 250 words" with a gold bar, or just the day's words with no goal; 4 × 3 by default), and a filled gold **Continue writing** that opens Write at the last word, beside a gold-outlined **15 min** that
  does the same with a 15-minute sprint started (`scriptor:///write?at=end&sprint=15`).
  It reads the library file only (never writes it), refreshes every 30 minutes and whenever Scriptor goes to the
  background, and says "Open Scriptor" when there is nothing to show. The launcher draws its text in the system face.

## Motion

Scriptor moves only for three reasons (`src/ui/motion.ts`), all on the native driver:

- **A touch is acknowledged:** buttons and chips give a little under the finger (scale 0.97; icon buttons 0.92).
- **A state is shown:** a progress bar's fill grows from the left once, when it is first shown (600 ms).
- **One authored moment:** on Progress, the page filling with ink rises to its level (1.1 s, after 150 ms).

The easing is one confident arrival that settles (`cubic-bezier(0.16, 1, 0.3, 1)`), never a bounce. With Android's
"Remove animations" on, nothing moves: fills and ink stand at their level, and the press scale stays, since it confirms
the touch. No entrance choreography, count-ups or looping decoration.

## The reader

The book as a reader sees it (`reader-web`, `src/reader/bookHtml.ts`). Each chapter opens as in a printed book: lower on
the page, its label in spaced Outfit capitals, the title in Cinzel bold, a thin ornament (two rules and a diamond) under
it; then the first paragraph of prose opens with a drop cap in Cinzel and its first line in small capitals. In every
format (standard novel, ebook, web serial) and on every page colour, since all of it takes the page's own ink.

## Layout by screen size (Android)

| Width | Layout |
|---|---|
| Phone (under 600 px) | Content full width; bottom bar with Library, Write, Organize, Analytics, Settings (selected item in gold) |
| Tablet (600 px and up) | Left rail (logo, the same areas, the selected one filled gold) and the content; on wide tablets a right column of panels (overview, quick actions, recent activity) as in the Library mock-up |

## Decided by the owner (2026-11-16)

| Question | Decision |
|---|---|
| Five areas in the mock-ups, eight in the Flutter app | **Five**: Library, Write, Organize, Analytics, Settings. Plan, Visualize and Review (the consistency checks; moved from Analytics by the owner on 2026-11-17) are tabs inside Organize; Progress, Analytics and the Keepsakes are tabs inside Analytics. Nothing is dropped. |
| The writer's rank and level ("Rank: SSS, Lv. 125") | **Built, earned by writing**: experience from words written, days written in a row and chapters finished, read from the writing log on this device. Ranks F, E, D, C, B, A, S, SS, SSS. |
| Collections and Recent Activity in the Library | **Built, all of it**: Favorites (pinned books), My Drafts, Completed and On Hold (by status), the writer's own custom collections, and a Recent Activity list of what changed lately. |
| Sync, Premium, the notifications bell, a profile picture | **Left out for now.** Kept as possible later features in `FEATURES.md` ("Possible later features"). Sync and Premium would reverse the offline, no-account decision. |
| "Upload Backup" | Saving a `.novel.json` backup wherever the writer chooses (the share sheet), and restoring one: no cloud. |
