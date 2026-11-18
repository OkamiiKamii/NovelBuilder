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

## Shapes and effects

- **Panels:** `surface` ground, 1 px `border` outline, about 10 px rounded corners, a soft sky-blue glow along the edge.
- **Selected navigation item:** filled with a gold gradient, dark text, a brighter gold edge.
- **Main buttons:** gold outline with gold text and icon ("New Novel", "Continue"); the most important action is filled
  gold.
- **Progress bars:** thin, gold on a dark track, with the percentage beside them in gold.
- **Novel cards:** the cover picture fills the card top, a status chip at the top left, a "…" menu at the top right, the
  title in Cinzel, then progress, chapters and last-read date, then Continue and a stats button.
- **Section headings:** an icon in gold, then the title in Outfit capitals ("LIBRARY OVERVIEW", "QUICK ACTIONS").
- **Editor:** a dark page, the chapter title in Cinzel with a gold ornament line under it, the text in Merriweather,
  the chapters list on the left with the open chapter filled gold, word count / characters / reading time at the foot.

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
