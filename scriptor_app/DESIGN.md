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
- **Pick up the thread** (top of the Library, `PickUp.tsx`): the book last opened, the chapter it was left in (in
  gold), the last lines written there in Merriweather italic (whole, at most four lines: the end of the last paragraph,
  starting at a sentence), the editor's gold ornament line, today's words against the daily goal, and one filled gold
  **Continue writing** that opens that chapter with the caret after its last word. Hidden while searching; absent until
  a book has been opened.
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

## Motion

Scriptor moves only for three reasons (`src/ui/motion.ts`), all on the native driver:

- **A touch is acknowledged:** buttons and chips give a little under the finger (scale 0.97; icon buttons 0.92).
- **A state is shown:** a progress bar's fill grows from the left once, when it is first shown (600 ms).
- **One authored moment:** on Progress, the page filling with ink rises to its level (1.1 s, after 150 ms).

The easing is one confident arrival that settles (`cubic-bezier(0.16, 1, 0.3, 1)`), never a bounce. With Android's
"Remove animations" on, nothing moves: fills and ink stand at their level, and the press scale stays, since it confirms
the touch. No entrance choreography, count-ups or looping decoration.

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
