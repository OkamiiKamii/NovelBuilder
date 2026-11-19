# Scriptor — Feature Inventory

The complete list of what the Flutter app (`../flutter_app`) does, read from its source code on 2026-11-16 (518 Dart
files, about 158,000 lines). It is the checklist for rebuilding it in React Native as Scriptor, piece by piece.

**Ground rules the whole app follows**

- **Offline only.** No account, no cloud, no network requests, no AI. Pictures given as web addresses are kept but never
  fetched.
- **Nothing is ever lost.** Deletes keep a restore point and offer Undo; unknown fields in a file are kept; checks
  report problems but never "fix" the author's data on their own.
- **One file format.** Novels are stored and backed up as `.novel.json` (format version 4; versions 1–3 are upgraded on
  import, newer ones are refused). The new versions must read and write the same format.
- **Platforms.** The Flutter app runs on Android, iPhone, Mac and Windows. **Scriptor is being built for Android only
  for now** (phones and tablets). Phone layout is under 600 px wide, medium 600–999 px, wide 1000 px and up. A large
  Android tablet uses the wide layout, so the "wide screen" items still apply. Items that only concern a computer, such
  as the Save dialog on Mac/Windows and computer keyboard shortcuts, wait until other versions are built. On Android,
  files are saved through the share sheet.

**How to read this list.** Each item is one capability: its name, then what it does. Items are numbered straight
through so they can be referred to by number ("build #42 next"). The source file it comes from is in brackets, under
`flutter_app/lib/`.

---

## 1. Foundation: storage, saving and data safety

1. **Open the library** — On launch, opens the single local SQLite library file. If it cannot be opened, shows the reason and a Try again button, and never starts with an empty library in its place. [app/bootstrap.dart]
2. **Refuse a newer library** — A library saved by a newer version of the app is left untouched with a message to update; before an older library is upgraded, a copy is kept beside it (`.before-v<N>`). [shared/data/database.dart]
3. **Sample novel on first start** — The first launch adds the sample novel "The Drowned Road" (15 chapters, ~10k words, with cast, places, threads, plans and timeline). Added once per device; if deleted it is not re-added. [shared/data/sample_novel.dart]
4. **Autosave everywhere** — There is no Save button. Every change is saved ~600 ms after typing stops; a failed write is retried after 2 s, 5 s, 15 s, then every 30 s. [shared/data/autosave.dart]
5. **Atomic, durable saves** — Each save is one database transaction (WAL, synchronous=FULL), so a crash leaves either the old state or the new one, never half. Records are stored whole as JSON so fields this version doesn't know survive. [shared/data/database.dart]
6. **Save-status pill** — Shows "Saved on this device", "Unsaved changes", "Saving…" or "Not saved" with the reason and a Retry button. Shown in the rail, in Settings, and above the phone bar when not saved. [core/widgets/save_status_indicator.dart]
7. **Save on leaving the app** — Pending saves are written when the app goes to the background or closes. [app/app.dart]
8. **Crash-recovery drafts** — Unsaved editor text is copied every 250 ms to a drafts table; on reopening, the author chooses to keep the recovered writing or the saved text. Drafts never replace saved work on their own. [shared/data/draft_store.dart]
9. **Restore points** — A whole-novel copy is kept automatically before a delete, a merge, a backup replacing a novel, and a restore (up to 20 per novel). Listed in Settings with reason and date; restoring is itself undoable. [shared/data/draft_store.dart, features/settings/settings_page.dart]
10. **Remember the open novel** — The open novel is reopened on the next launch; opening stamps its "last opened" time; a deleted novel is closed automatically. [features/workspace/open_novel.dart]
11. **Heavy work off the screen thread** — Whole-book reading (proofs, best lines, quiz, index, cast analysis) runs in the background and is cached by content version, so returning to a page is instant. [shared/data/background.dart, shared/data/kept_readings.dart]
12. **Error containment** — Errors are kept in memory only, never written or sent. In release builds a broken widget is replaced by a placeholder while the rest of the app keeps working. [app/bootstrap.dart, core/widgets/broken_widget.dart]
13. **Read-aloud voice service** — Uses the device's own text-to-speech with rate and pitch; reports when the device has none. [shared/data/speech.dart]
14. **Privacy statement** — Settings states that there is no account, no cloud, no AI and nothing sent, and shows the library file's location. [features/settings/settings_page.dart]

## 2. App shell and navigation

15. **Eight areas** — Library, Write, Organize, Plan, Visualize, Review, Progress, Settings. Every area except Library and Settings works inside one open novel. [app/destinations.dart]
16. **Shelf vs. inside a book** — With no book open, navigation shows only Library and Settings; inside a book it shows Library plus the six book areas. [app/shell/app_shell.dart]
17. **Adaptive navigation** — Phone: bottom bar (Library, Write, Organize, an optional pinned area, More). Medium: icon rail with labels under icons. Wide: extended rail with labels and the app's wordmark ("Scriptor" in the new app). [app/shell/app_shell.dart, core/layout/breakpoints.dart]
18. **Rail extras** — A search button, a Tutorial button (if enabled), and the save-status pill at the foot; tooltips show each area's shortcut. [app/shell/app_shell.dart]
19. **Keyboard shortcuts** — Ctrl/⌘+1…8 go to the areas, Ctrl/⌘+, opens Settings, Ctrl/⌘+K opens search (⌘ on Apple, Ctrl elsewhere). [app/shell/app_shortcuts.dart]
20. **Sub-page tabs** — Each area's parts appear as ledger-divider tabs: Organize (Characters, World, Systems, Modules); Plan (Timeline, Plot threads, Scene board, Alternate histories, Calendar); Review (All warnings, Record check, Timeline review, Canon, Continuity check, What depends on this, Team and feedback); Progress (Writing progress, Analytics). On phones up to 4 tabs share the width; more scroll. [features/workspace/area_switch.dart, features/workspace/organize_switch.dart]
21. **"No novel open" state** — A book area opened with no novel says so with Go to Library; with a novel open, pages offer Switch novel. [features/workspace/section_page.dart]
22. **Page-turn transition** — Switching areas turns the old page away like a book leaf on a 3D hinge (~460 ms), left going forward, right going back. Skipped with reduced motion. [app/shell/page_turn.dart]
23. **Page not found** — An unknown link shows "This page does not exist" with Back to library. [app/not_found_page.dart]
24. **More sheet as a contents page (phone)** — Lists Plan, Visualize, Review and Progress as contents lines with a Roman numeral, a live summary (e.g. "N plot threads", "X of Y words · +N today") and a small drawing; then Search, The index and Tutorial. [app/shell/contents_sheet.dart, app/shell/vignettes.dart]
25. **More in four parts** — Once the book has words, More is laid out as One Today, Two Before it goes out, Three Made from the book, Four The book, with a pinned strip to jump between parts. [app/shell/contents_parts.dart]
26. **Pin an area to the bar** — Any area in More can be pinned as a fifth bar slot (one at a time). An area opened 4+ times in 7 days is offered for pinning, with Not now remembered per area. [app/shell/pinned_area.dart]
27. **Where you were (trail)** — The last 6 places visited inside the book (characters, entries, threads, events, plans, sub-pages) as cards with relative time; renamed items show the new name and deleted ones drop off. [app/shell/trail.dart]
28. **Today from your book** — A daily card that rotates: a line of the day from the book, a quiz question answered in place, or the book in numbers. [app/shell/today_from_your_book.dart]
29. **Loose ends** — Up to 3 prompts that each open the page that answers them: words left to today's goal, a streak at risk, the quietest open thread, the next unplanned chapter, a character with no ties. [app/shell/loose_ends.dart]
30. **Proof card** — Counts proofreading slips in the book, or says "the book reads clean"; opens the proofreading list (see Review). [app/shell/proof_card.dart]
31. **Submission card** — "Submission kit: X of N ready" with the next step; opens the kit. [app/shell/submission_card.dart]
32. **Keepsakes row and shelf** — The nine keepsakes (Gazette, Quiz, Postcards, Trailer, Best lines, Sampler, So far, Fingerprint, Full jacket) as tiles with a NEW ribbon until opened, and a full-screen wooden shelf showing all of them. [app/shell/keepsakes.dart]
33. **Ribbon bookmarks** — A silk ribbon at the right edge of every page; tapping it lists the book's ribbons (up to 6, in 6 colours). "Lay a ribbon in this page" names it from the page; in Write it also remembers the chapter. Tapping a ribbon goes there. Stored per device. [app/shell/ribbons.dart]

## 3. Themes and appearance

34. **Four looks** — Match this device, Light (parchment), Dark (midnight), and System Monolith (near-black with gold and teal, its own fonts and a grid ground). Chosen from drawn swatches; stored per device; changes animate. [app/theme/theme_choice.dart, app/theme/app_theme.dart, features/settings/theme_swatches.dart]
35. **Book typefaces** — Bundled fonts: Cinzel and EB Garamond for the book themes; Outfit, Merriweather and JetBrains Mono for Monolith. Licences shown in the app's licence list. [app/theme/book_faces.dart, app/bootstrap.dart]
36. **Wear each book's colour** — While a novel is open its cover colour becomes the app's accent, adjusted to keep 4.5:1 contrast; grey, near-black or near-white covers are not worn. On by default; can be turned off. [app/theme/book_tone.dart]
37. **Leather binding** — The rail and bottom bar are drawn as a stitched leather spine with gilt lettering (a dark panel in Monolith). [app/theme/leather.dart]
38. **Paper ground** — Every page sits on painted paper by day, a lamplight pool by night, or a grid in Monolith. [app/theme/paper_ground.dart]
39. **Theme-aware book art** — Jackets, shelves and nameplates change style with the theme (gilt and wood vs. gold frames and metal); cover pictures are always shown unaltered. [app/theme/novel_art.dart]
40. **Stationery styling** — Squared "stamped label" buttons, paper-card dialogs with capital titles, squared segmented controls. [app/theme/app_theme.dart]
41. **Reduced motion** — Every animation in the app is switched off when the device asks for reduced motion. [core/motion/motion.dart]

## 4. Library: managing novels

42. **Pick up where you left off** — The most recently opened book is shown large with its jacket, last chapter, the last lines written (with a blinking caret) and "Continue writing", which opens it with the caret at the end. [features/library/bookshelf.dart]
43. **Library totals** — Novels / In progress / Complete counts. [features/library/bookshelf.dart]
44. **Shelves by stage** — Books stand on shelves: Writing now, Ideas, Set aside, Finished. Ideas written in lately offer "Mark it Drafting", with Undo. [features/library/stage_shelves.dart]
45. **Covers view** — A grid of 2:3 jackets: the cover picture, or a designed jacket in the book's colour with a genre motif (stars, rings, vines, sunburst, waves, crescent). Shows pin, status, genre and a menu. [features/library/bookshelf.dart, features/library/cover_art.dart]
46. **Spines view (bookcase)** — Books as spines on wooden shelves; tapping one opens "book in hand" with the jacket, details, synopsis and every action. Spines are the default past 6 books; the choice is remembered. [features/library/bookcase.dart]
47. **Swiped shelves on phone** — A shelf with more than 2 books becomes a swipe row with "See all N". [features/library/shelf_row.dart]
48. **Book-opening animation** — Opening a novel lifts the jacket, swings the cover open to a first page and fades into Write (under 1 s; skipped with reduced motion). [features/library/book_opening.dart]
49. **Search, filter and sort novels** — Search title, subtitle, author, genres, tags and synopsis; filter by status and genre; sort by last edited, last opened, title, date created or word count; pinned books first; an Archived chip shows the archive. [features/library/library_page.dart]
50. **Create a novel (title page)** — A live jacket preview with title, author (pre-filled from the last novel) and 8 colour swatches. "Begin chapter one" creates the novel and Chapter 1 and opens the editor; "More details" opens the full form. [features/library/title_page.dart]
51. **Full novel form** — Title, subtitle, author, status (Planning, Drafting, Revising, Complete, On hold), main genre, other genres, tags, target word count, deadline, synopsis, cover picture and colour. [features/library/novel_form.dart]
52. **Start from another novel's setup** — A new novel can copy another novel's categories and fields, relationship types, calendar, progress tracking and systems, with none of its story. [features/library/novel_form.dart]
53. **Start with a worldbuilding template** — A new novel can begin with a built-in or saved template (it only adds). [features/library/novel_form.dart]
54. **Cover picture** — Pick a JPEG, PNG, WebP, GIF or HEIC from the device; it is shrunk to 800 px and stored inside the novel; can be removed. Shown in the library, the reader and the EPUB. [features/library/cover_picker.dart]
55. **Jot an idea** — A one-line field on the Ideas shelf; text after " — " or ": " becomes the premise. Creates a Planning novel without opening it. [features/library/idea_jot.dart]
56. **The idea file** — Deals idea novels with no premise one card at a time, asking "In one line, what is it about?" (Save & next, Skip, Done). [features/library/idea_cards.dart]
57. **Draw an idea** — When nothing is being written, picks a random idea and offers "Start writing it" or "Draw another". [features/library/idea_draw.dart]
58. **Start writing it** — Sets an idea to Drafting and opens its first chapter (creating Chapter 1 if needed), with Undo. [features/library/library_actions.dart]
59. **Edit, pin, archive** — Edit details, Pin to top / Unpin, Archive / Restore (archive hides without changing, with Undo). [features/library/library_actions.dart]
60. **Duplicate a novel** — Makes a fully separate copy titled "… (Copy)" with new ids. [shared/data/library_service.dart]
61. **Delete a novel** — Hold-to-confirm, keeps a restore point first, and offers Undo. [features/library/library_actions.dart]
62. **Export a backup** — Saves the whole novel as `<title>.novel.json` (Save dialog on Mac/Windows, share sheet on phones). [features/library/backup_actions.dart]
63. **Import a backup with preview** — Shows what the file holds before anything is written (record counts, format upgrade, missing references, unknown parts kept). If the novel already exists: Import as a copy, or Replace with an added/changed/removed list per kind (restore point kept first). An unreadable file changes nothing. [features/library/backup_actions.dart, shared/data/backup_service.dart]
64. **Add the sample novel again** — From Settings, adds another copy of the sample novel. [features/settings/settings_page.dart]

## 5. Settings

65. **This novel** — Edit details, Export backup, Close novel. [features/settings/settings_page.dart]
66. **Appearance** — Theme swatches and the "Wear each book's colour" switch. [features/settings/settings_page.dart]
67. **Keyboard shortcuts list** — Shows every shortcut. [features/settings/settings_page.dart]
68. **Writing preferences** — The editor's writing settings (see Write), kept separately for phone, tablet and computer. [features/write/writing_prefs_controls.dart]
69. **Tutorial settings** — Open the tutorial; show or hide the Tutorial button. [features/settings/settings_page.dart]
70. **Restore points list** — Every restore point with its reason and date, and Restore. [features/settings/settings_page.dart]
71. **Import & export page** — Link to the import/export hub. [features/settings/settings_page.dart]

## 6. Write: manuscript structure (the Contents panel)

72. **Write screen layout** — Wide screens show the contents (outline) beside the editor; phones show one at a time with a Back arrow. Opens the last chapter used in this novel. [features/write/write_page.dart, features/write/write_providers.dart]
73. **Manuscript hierarchy** — Volumes, acts, arcs, chapters and scenes. Groups nest by rank (volume > act > arc > chapter); scenes go only inside chapters. [features/write/outline_panel.dart]
74. **Contents panel** — Styled as a printed contents page: parts in capitals, chapters numbered with a dotted leader to the word count and status, scenes indented, a ribbon on the open chapter. [features/write/outline_panel.dart]
75. **Add parts, chapters and scenes** — The "+" menu adds a volume, act, arc or chapter; each row's menu adds the allowed kinds inside it. New chapters and scenes open at once. [features/write/outline_panel.dart]
76. **Rename, move and reorder** — Rename; Move up / Move down; Move to… any valid parent or the top level. [features/write/outline_panel.dart]
77. **Duplicate a chapter or part** — Deep copy with children, text, plans and alternate drafts, placed right after. [features/write/data/manuscript_service.dart]
78. **Merge with the next one** — Appends the next sibling's text, scenes and plan to this one and re-points references; both texts go into history first. [features/write/data/manuscript_service.dart]
79. **Split here** — Everything from the caret's paragraph on becomes a new chapter or scene right after this one; the text before the split goes into history. [features/write/chapter_editor.dart]
80. **Chapter status** — Idea, Planned, Drafting, Draft Complete, Revising, Final, Published. [features/write/outline_panel.dart]
81. **Delete with Undo** — Deletes a node and everything inside it after confirmation; a restore point is kept and the toast offers Undo. [features/write/data/manuscript_service.dart]
82. **Storyboard view** — A toggle that shows under each chapter its opening and closing lines, the faces of who is there, and a length bar. [features/write/storyboard.dart]
83. **Contents cards** — The Day book, Road to the draft and Gaps to fill appear as cards in the contents. [features/write/outline_panel.dart]
84. **Import/export menu** — Read as a book and publish, Book details, Export manuscript, Import a manuscript, All import and export. [features/write/outline_panel.dart]
85. **Phone chapter switcher** — A sheet listing every chapter and scene in reading order with word counts, plus Previous/Next. [features/write/chapter_editor.dart]

## 7. Write: the editor

86. **Rich-text chapter editor** — Bold, italic, underline, strikethrough; Paragraph, Heading 1–3, Quotation; bulleted and numbered lists; left/center/right/justify; undo/redo. No automatic conversions and no network. Text is stored as ProseMirror JSON; a chapter that can't round-trip exactly opens read-only with the reason, so no formatting is ever lost. [features/write/chapter_editor.dart, features/write/editor/prose_document.dart]
87. **Chapter heading** — "CHAPTER 3" kicker, an editable centred title and an ornament. [features/write/chapter_editor.dart]
88. **Title ideas** — While a chapter has a stand-in title ("Chapter 1"), up to 5 title ideas drawn from its own text appear as chips; tapping one renames it. [features/write/chapter_editor.dart, shared/domain/manuscript/title_ideas.dart]
89. **Phone ink tray** — While the keyboard is up, a strip above it holds the formatting toolbar and the name keys. [features/write/chapter_editor.dart]
90. **Chapter autosave** — Saves after a typing pause and at least every 5 s while typing; saves on leaving the chapter. [features/write/chapter_editor.dart]
91. **Save-conflict protection** — If another window saved the chapter meanwhile, asks "Keep my text" or "Use the saved text"; the losing text goes into history. [features/write/chapter_editor.dart]
92. **Find and replace** — Match count, previous/next, match case, whole words; Replace and Replace all keep formatting; Replace all can be undone. [features/write/editor/find_bar.dart, features/write/editor/find_replace.dart]
93. **Link words to a record** — Select words and link them to any character or world entry; links show as a dotted underline, and a bar on the caret offers Open. Unlink removes them. [features/write/chapter_editor.dart, features/write/editor/link_bar.dart]
94. **Name keys (name autocomplete)** — While typing a word, up to 6 book names (and aliases) that complete it appear; Tab or a tap inserts the full name. On phones, also lists the names already on the page. [features/write/name_keys.dart]
95. **At a glance** — When the caret rests on a known name, a strip shows that record's face, kind, first facts and a relationship; tapping opens a card with "Open their page". [features/write/glance.dart]
96. **In this chapter strip** — Under the heading, every record the text names or links, with a mention count; tapping opens it. [features/write/in_chapter.dart]
97. **Editor shortcuts** — Ctrl/⌘+S save now, Ctrl/⌘+F find, Shift+Ctrl/⌘+F focus mode, Esc close find or leave focus, Tab complete a name, Ctrl/⌘+B/I/U formatting. [features/write/chapter_editor.dart]
98. **Writing settings** — Font (Serif, Sans, Mono), size 14–28, line spacing 1.2–2.4, paragraph spacing, text width (Narrow, Medium, Wide, Full), page colour (As the app, Light, Sepia, Dark), atmosphere, Today's ink, Set like a book; kept per device type with a live sample. [features/write/writing_prefs.dart, features/write/writing_prefs_controls.dart]
99. **Set like a book** — Shows a raised initial and small capitals on a chapter's first paragraph, and centres scene-break marks (`***`, `#`, `⁂`) as ornaments. Display only. [features/write/book_setting.dart]

## 8. Write: the writing desk tools

100. **Desk toolbar / Desk drawer** — Wide screens show the tools as icon buttons; phones list them by name in a Desk drawer. [features/write/chapter_editor.dart]
101. **Paper on a desk** — The page is a sheet of paper on a desk background on wide screens, the whole screen on phones. [features/write/chapter_editor.dart]
102. **The margin** — Index cards beside the page: the end of the previous chapter ("Last time"), this chapter's summary and goal, its planned beats, who is on the page, and plot threads here. A bottom sheet when the window is narrow. [features/write/margin.dart]
103. **Focus mode with typewriter** — Hides everything but the page; typewriter mode keeps the current line at 45% of the screen and fades the text around it. [features/write/chapter_editor.dart]
104. **Red pencil** — A revision overlay (never stored) marking echoes (a word repeated within 40 words), long sentences (40+ words) and filler words, with counts and "Leaned on" words. [features/write/red_pencil.dart, shared/domain/text/red_pencil.dart]
105. **Voices** — Colours each line of dialogue by its speaker, dims narration, marks lines with no clear speaker, and shows each speaker's share of the dialogue. [features/write/voices.dart, shared/domain/text/voices.dart]
106. **Listen (read aloud)** — Reads the chapter with the device's voice one sentence at a time from the caret, highlighting the sentence; back/next sentence, pause, speeds 0.8×/1×/1.25×. [features/write/listen.dart]
107. **Rhythm** — A waveform of sentence lengths (dialogue vs narration) that flags runs of 5+ same-length sentences; tapping a bar selects that sentence. [features/write/rhythm.dart]
108. **Time-lapse** — Replays the chapter growing across its saved history, with play/pause, a scrub bar, word counts and a growth chart. [features/write/time_lapse.dart]
109. **Atmosphere** — Animated writing weather around the page: rain, snow, fireflies, candlelight or stars. [features/write/atmosphere.dart]
110. **Today's ink** — A margin stroke beside every paragraph written or changed today. [features/write/fresh_ink.dart]
111. **Chapter spine** — A minimap down the right edge of long chapters (one mark per paragraph, today's ink highlighted); tap or drag to scroll. [features/write/chapter_spine.dart]
112. **Gaps (write past it)** — "TK" and `[[note]]` in the text show as sticky notes; "Leave a gap" inserts `[[ ]]`. The "Gaps to fill" card lists every gap in the book and opens it. [features/write/gaps.dart]
113. **Stuck? nudges** — After 40 s idle, a chip offers one writing prompt drawn from the last line, the plan, threads and characters present, or craft moves. Never inserts text; can be turned off. [features/write/nudge.dart]
114. **First page of an empty chapter** — Shows where the story stands, what the chapter is for, its beats and cast, and three "A way in" prompts; disappears with the first word. [features/write/first_page.dart]
115. **Chapter end** — Below the last line: "Continue to" the next chapter, or "The end, so far" with "Begin the next chapter". [features/write/chapter_end.dart]
116. **Note for next time** — One short note pinned per chapter (with starter phrases), shown in the chapter and the day book; on phones, offered when leaving after 100+ words. [features/write/next_note.dart]

## 9. Write: version history and alternate drafts

117. **Version history** — Automatic snapshots (at most every 5 minutes, up to 50) plus named "Save a version" snapshots; compare any version with the current text (added, removed, changed, moved paragraphs); restore a version (the current text is kept first). [features/write/version_history.dart]
118. **Alternate drafts** — Keep several drafts of a chapter or scene; only the active one counts, searches, reads and exports. Start a new draft from a copy or a blank page; read, swap in, rename or delete the others. [features/write/drafts_dialog.dart]

## 10. Write: goals, sprints and the day book

119. **Word meter** — Under the page: today's goal ring, words this session, chapter words and reading time, this week's goal, and the save status. [features/write/chapter_editor.dart]
120. **Writing log** — Every save records the net words written into a writing session (a new session after 30 minutes or a new day). [features/write/data/manuscript_service.dart]
121. **Daily and weekly goals** — "How much a day?": 100, 250, 500 or 1000 words, each with its pages and the projected finish date; or no goal; or custom daily and weekly numbers. [features/write/goal_pledge.dart]
122. **Writing sprints** — 10, 15, 25 or 45 minutes in focus mode with a countdown and live word count; ends with a result card (words, words per minute, personal best). [features/write/sprint.dart]
123. **Day book** — A 5-week calendar of ink blots sized by words written, the current streak, today and this week, the next-time note, "Carry on" in the last chapter, and "Share today's page". [features/write/day_book.dart]
124. **Today's page** — A shareable 1080×1350 picture of today's words, streak, last 7 days and the book. [features/write/todays_page.dart]
125. **Road to the draft** — A road from 0 to the target with milestones (1k, short story, novelette, novella, whole draft) and words to the next one. [features/write/draft_road.dart]

## 11. Reading the book and publishing

126. **Read as a book** — The manuscript shown read-only as a standard novel (title page, front matter, parts, chapters), an ebook (cover and a contents page that jumps), or a web serial (one chapter at a time with author notes before and after). [features/reader/reader_page.dart]
127. **Pages or scroll** — Pages are measured with the device's fonts; turn with arrow keys, Page Up/Down, Space, swipes or buttons; or read as one scrolling column. [features/reader/book_view.dart, features/reader/book_layout.dart]
128. **Bookmark and progress** — Remembers where the author stopped reading in each novel; shows "N% · about M minutes left". [features/reader/reader_page.dart]
129. **Reader appearance** — Six typefaces, size, line spacing, line length, indented or spaced paragraphs, justification, white/sepia/dark/custom colours with the contrast ratio stated. [features/reader/reader_page.dart, shared/domain/reader/reader_prefs.dart]
130. **Device frame preview** — On wide screens the book is shown inside a phone, e-reader or tablet frame. [features/reader/reader_page.dart]
131. **Book details (front and back matter)** — Dedication, epigraph and source, copyright page, cast list (Dramatis Personae), acknowledgements, about the author. [features/reader/book_details_page.dart]
132. **Scene-break mark** — Choose `* * *`, `***`, `⁂`, `—`, `#`, a blank line, or your own mark. [features/reader/book_details_page.dart]
133. **Publish an EPUB** — Makes an EPUB 3 ebook with cover, contents and front matter. [features/reader/publish_dialog.dart]
134. **Publish a web serial** — Every chapter as files in a zip, or one chapter saved or copied, as a web page, Markdown or plain text. A "What it will hold" list is shown before anything is made. [features/reader/publish_dialog.dart]

## 12. Characters: the cast list (Organize → Characters)

135. **Character library** — Every character in the novel, with New character and a live count; shown 60 at a time. [features/characters/characters_page.dart]
136. **Search characters** — Matches name, aliases, epithet, summary, roles, status, tags, factions and field values, ignoring case and accents. [features/characters/characters_page.dart, shared/domain/characters/cast.dart]
137. **Sort characters** — Name, recently updated, recently created, first appearance, most appearances, most recent appearance, or my own order (move up/down). [features/characters/characters_page.dart]
138. **Filter characters** — By status, tag, species, occupation, faction and "first appears by" a chapter. [features/characters/characters_page.dart]
139. **Role tabs** — All, each role in use (Protagonists, Antagonists…), and Archived. [features/characters/characters_page.dart]
140. **Cast photograph** — The cast standing on a lit stage: principals in front, minor characters behind, with a caption naming them; tap a face to open them. [features/characters/widgets/cast_photo.dart]
141. **Empty chairs** — For a small cast, dashed "chairs" for missing roles around the lead (mentor, rival, love, family…) that ask "Who taught Wren?" and create that character already tied. [features/characters/widgets/empty_chairs.dart]
142. **Playbill (first cast)** — With no characters yet, a "Dramatis personae" form for the hero, who stands against them and who stands by them; "Raise the curtain" creates them all with their ties. [features/characters/widgets/playbill.dart]
143. **Cast list for the book** — Builds a printable Dramatis Personae page (by faction, by role or one list; in order of appearance or by name) and puts it in the book's front matter or copies it. [features/characters/widgets/dramatis_page.dart]

## 13. Characters: found in your pages

144. **Notes strip** — One strip under the cast list, "✦ N suggestions from your pages", that unfolds chips counting what the app noticed in the manuscript about the cast, each jumping to its panel. [features/characters/widgets/page_notes.dart]
145. **Together on the page** — Pairs who share 3+ chapters but have no recorded relationship, with "How are they tied?" to record one. [features/characters/widgets/together_on_page.dart]
146. **The cast, checked** — Editor-style notes: a lead the book forgets, one who goes quiet, two always together, a one-chapter character with no ties. [features/characters/widgets/cast_check.dart]
147. **Waiting for a name** — Unnamed recurring people in the text ("the waitress") with where they appear; "Name them" creates a character whose aliases claim the existing mentions. [features/characters/widgets/waiting_for_a_name.dart]
148. **Names not in the cast** — Capitalised names that recur in the text but match no record, with "Add [Name]" or "Not a character". [features/characters/widgets/manuscript_names.dart]

## 14. Characters: creating a character

149. **Casting call (New character)** — Name, title or epithet, narrative roles (Protagonist, Antagonist, Supporting, Minor, Background), summary, and a profile layout (General, Protagonist, Antagonist, Supporting, Fantasy, Progression Fantasy, Mystery Suspect, or the author's own), with a live portrait card. [features/characters/new_character_dialog.dart]
150. **Write them in a line** — Type "Mira Vance, 34, a smuggler from Glass River, Kai's sister" and the app fills name, age, occupation, origin and ties to existing characters. [features/characters/new_character_dialog.dart, shared/domain/characters/one_line.dart]
151. **Name forge** — Generates a dozen names for a person or place, "like your book" (learned from its own names) or in a tradition (Old English, Norse, Latin, Lyrical, Desert, Steppe), optionally starting with given letters. [features/characters/widgets/name_forge.dart]

## 15. Characters: ways to see the cast (12 views)

152. **Cards** — A grid of character cards with portrait, status, epithet, roles, a chapter strip ("In X of Y chapters") and how well they are known. [features/characters/widgets/cast_card.dart]
153. **How well you know them** — Each card shows how many interview questions the profile answers; tapping starts the interview. [features/characters/widgets/cast_card.dart, features/characters/interview.dart]
154. **List** — Compact rows, reorderable in "My order". [features/characters/characters_page.dart]
155. **Roll call** — A table of every character with editable Age, Gender, Species, Occupation and What they want, and "X of Y filled". [features/characters/widgets/roll_call.dart]
156. **Name board** — Every name in the book laid out by first letter, look-alike names a reader could confuse, and free letters with "Forge a name". [features/characters/widgets/name_board.dart]
157. **Ties matrix** — Every character against every other; a filled cell shows their relationship, an empty one records a new tie. [features/characters/widgets/cast_ties.dart]
158. **Stakes board** — Each character's wants, needs, obstacle, stakes and ending, with blanks to fill and "Where they collide". [features/characters/widgets/cast_stakes.dart]
159. **Compass** — Characters placed on two temperament axes (from This or that), with foils, too-alike pairs and traits the whole cast shares. [features/characters/widgets/cast_compass.dart]
160. **Orbit** — An animated orrery: leads at the heart, rings for principals, cast, minor characters and those not yet on the page; size by chapters present. [features/characters/widgets/cast_orbit.dart]
161. **Eyes (point of view)** — The book as a ribbon of chapters coloured by point-of-view character, with each POV's share and notes on long runs and absent POVs. [features/characters/widgets/whose_eyes.dart]
162. **Entrances** — Where each character first enters the book and how (seen, speaks, acts, only named…), with notes such as too many entering at once. [features/characters/widgets/entrances_view.dart]
163. **Table read** — A chapter shown as a script under each speaker's name, read aloud with a distinct voice pitch per speaker. [features/characters/widgets/table_read_view.dart]
164. **Arcs** — Each character's emotional line across the book, read from feeling words near their name, with the shape named and compared to the arc planned. [features/characters/widgets/cast_arcs.dart]
165. **Ways to see your cast (phone)** — A chooser listing every view with a one-line description. [features/characters/widgets/view_chooser.dart]

## 16. Characters: the profile (the Vault)

166. **Character profile page** — Header with portrait, name, epithet and identity facts; previous/next character (Alt+↑/↓); find a character; a side list on very wide screens. [features/characters/character_page.dart, features/characters/widgets/vault_rail.dart]
167. **Edit identity** — Name, epithet, roles (built-in or your own), summary, aliases, status (Alive, Deceased, Missing, Unknown or your own) and tags. [features/characters/character_page.dart]
168. **Portrait** — Upload, replace, remove; images are rotated, shrunk to 800 px and stored in the novel; set the focal point kept in view. [features/characters/character_page.dart, features/characters/data/portrait_image.dart]
169. **Cameo (drawn portrait)** — With no picture, a silhouette bust is drawn in the character's colour from their profile (hair, eyes, skin, age, species, scars, glasses, crown…). [features/characters/widgets/cameo.dart]
170. **Draw their face** — Pick hair, cut, eyes, skin and marks; "Keep this face" writes them into the appearance fields. [features/characters/widgets/face_sketch.dart]
171. **Profile tabs** — Six: Status (when the novel has systems), Overview, Relationships, Details, Story (Progression and History) and Notes (Notes and Secrets). The aids (Write in, Interview, This or that, In their hand, Share their card) are the Quick actions panel on Overview; pressing the portrait opens its tools. [features/characters/character_page.dart]
172. **Sections and fields** — Add, rename, reorder, duplicate, hide, move or delete sections; add fields (suggested from templates or custom) with types: text, long text, number, date, yes/no, choice, several choices, tags, link to a record, links to several. [features/characters/widgets/sections_view.dart, features/characters/widgets/typed_input.dart]
173. **Shared fields** — Fields defined for every character in the novel appear on each profile. [features/characters/widgets/sections_view.dart]
174. **Profile layouts** — Add sections from a layout; save this profile's layout as a template for new characters. [features/characters/character_page.dart]
175. **Status tab** — The character's system sheet drawn as an in-story status window, editable in place (levels, values, held items). [features/characters/tabs/status_tab.dart]
176. **Overview tab** — Logline, sections, relationship web, symbol, levels, and the manuscript panels below. [features/characters/tabs/overview_tab.dart]
177. **In one sentence** — A pitch sentence built from the profile, with blanks that ask a question and save the answer. [features/characters/widgets/in_one_sentence.dart]
178. **Relationship web** — The character at the centre with up to 6 related people around them. [features/characters/widgets/vault.dart]
179. **In the manuscript / In their pages** — The chapters that link or name them, and the sentence where they first appear in each; opens the editor there. [features/characters/tabs/overview_tab.dart, features/characters/widgets/in_their_pages.dart]
180. **In their own words** — Their dialogue as pull quotes, each opening the line in the editor. [features/characters/widgets/in_their_words.dart]
181. **Their voice** — How they talk (line length, questions, exclamations, contractions, word length) against the cast, their own words, and who they sound like. [features/characters/widgets/their_voice.dart]
182. **Checked against your pages** — Compares eye and hair colour in the prose with the profile, with "Make it [colour]" or "Record [colour]". [features/characters/widgets/against_your_pages.dart]
183. **Details tab** — Description, linked powers, items, and affiliations with role and status (Active, Former, Secret). [features/characters/tabs/details_tab.dart]
184. **Secrets tab** — Secrets with status (Hidden, Hinted, Partly revealed, Revealed), the truth, who knows / suspects / is unaware, what the reader knows and when, reveal chapter and event. [features/characters/tabs/secrets_tab.dart]
185. **Notes tab** — Notes with tags, linked chapters and pins; "Copy into the profile" turns a note into a field. [features/characters/tabs/notes_tab.dart]
186. **History tab** — Their story in reading order (milestones, relationship stages, events) and an automatic log of every change to the record. [features/characters/tabs/history_tab.dart]
187. **Archive a character** — Hidden from the cast, everything kept, with Restore. [features/characters/character_page.dart]
188. **Delete a character** — Lists everything that refers to them, offers Archive instead, keeps a restore point and offers Undo. [features/characters/character_page.dart, features/characters/data/character_service.dart]

## 17. Characters: writing aids

189. **Interview** — Up to 12 questions asked by name ("What does Mira want more than anything?"), shown as a chat; each answer saves into the right field. [features/characters/interview.dart]
190. **This or that** — A swipe deck of 16 temperament cards ("Quiet or Loud") ending in the character's compass; "Keep these traits" saves them. [features/characters/widgets/this_or_that.dart]
191. **Journal ("In their hand")** — Write as the character in the first person to a prompt from their ties and wants; saved as journal notes. [features/characters/widgets/journal_page.dart]
192. **Write them in** — Choose where a scene goes, who else is in it, whose eyes, and a spark; "Start writing" creates the chapter or scene with its plan and opens the editor. No prose is written for the author. [features/characters/widgets/write_them_in_page.dart]
193. **Share their card** — A 1080×1350 character card with face, name, facts, ties and a line they say. [features/characters/widgets/character_card_share.dart]

## 18. Relationships

194. **Add a relationship** — Choose another character and a type. Built-in types: Parent/Child, Siblings, Spouses, Relatives, Friends, Allies, Rivals, Enemies, Mentor/Student, Romantic interest, Partners, Exes, Employer/Employee, Master/Servant, Ruler/Subject, Political tie, Custom. [features/relationships/relationship_page.dart, shared/domain/relationships/relation_types.dart]
195. **Relationship page** — "A and B", who is who, Swap who is who, "How it evolved" stage by stage, other connections between them, and delete. [features/relationships/relationship_page.dart]
196. **Record a change** — Adds a new stage at a chapter, copied from the current state; earlier stages are kept. [features/relationships/relationship_page.dart]
197. **Stage editor** — Type, phase title, affinity (Hostile to Trusting), tracked attributes 0–10 each way, when in story time, what caused it, where it is shown, notes. [features/relationships/relationship_page.dart]
198. **Relationship types and attributes** — Create custom types (one-way with roles, a group); turn built-in types on or off; choose tracked attributes (Trust, Affection, Fear, Loyalty, Hostility, Respect, or your own). [features/relationships/relation_settings_page.dart]
199. **Relationship map** — A network of characters with lines styled by group and arrows for one-way ties; as of now, a chapter, across chapters or ever; filters by type, faction and focus; zoom, pan, fit; keyboard moves; a list form. [features/relationships/relationship_map_page.dart]
200. **First tie** — On an empty map, a fill-in sentence "___ and ___ are [type]" that creates the characters and their tie. [features/relationships/first_tie.dart]

## 19. World (Organize → World)

201. **World encyclopedia** — Every non-character entry filed A–Z, with a letter bar to jump. Each entry shows its picture or initial, summary, tags and the chapters it appears in. [features/codex/world_page.dart, features/codex/widgets/encyclopedia.dart]
202. **Category volumes** — Each category as a bound volume with a count; tap to filter. [features/codex/widgets/encyclopedia.dart]
203. **World chart** — A sea-chart of the world: places as islands (nested places inside), linked factions and items as seals on their shores, unplaced entries "Adrift" with "Where does X belong?". [features/codex/widgets/world_chart.dart]
204. **Search and tag filter** — Search names, summaries, descriptions, tags and field values; filter by tag. [features/codex/world_page.dart]
205. **New entry** — Create an entry in any category. Built-in categories: Characters, Locations, Factions & Species, Items & Artifacts, Power Systems & Rules, Lore & History, plus the author's own. [features/codex/world_page.dart, shared/domain/records/category.dart]
206. **World charter** — On an empty world, a fill-in paragraph ("My story takes place in ___. ___ hold power there…") that creates the first linked entries. [features/codex/widgets/world_charter.dart]
207. **Found in your pages (world)** — Places, groups, powers and things the manuscript names that the world doesn't have yet, with "Add as <kind>" or "Not an entry". [features/codex/widgets/found_in_pages.dart]
208. **Entry page** — Picture, name (with Forge a name), category (moving keeps every value), summary, description, the category's fields with checks, fields just for this entry, tags and private notes. [features/codex/entry_page.dart]
209. **Related entries** — Link an entry to others with wording for each side and a canon status. [features/codex/entry_page.dart]
210. **Where it figures** — The chapters, events and plot threads that involve the entry, and the first sentence it appears in per chapter. [features/codex/entry_page.dart]
211. **Delete an entry** — Shows everything that refers to it, keeps a restore point and offers Undo. [features/codex/entry_page.dart]

## 20. Categories, fields and templates

212. **Categories & fields editor** — Create categories (name, singular, colour); add, reorder and archive fields of 10 types with rules (required, help text, min/max, link target). Rules are shown, never enforced. [features/codex/kinds_page.dart]
213. **Nothing is deleted** — Removing a field archives it (values kept, Restore offered); custom categories archive and restore. [features/codex/kinds_page.dart]
214. **Show in the knowledge graph** — A per-category switch. [features/codex/kinds_page.dart]
215. **What each view reads** — Each category says which fields the views use (timeline date and end, map across/up, rank, who holds it, graph label and drawn links, ability tree), chosen field by field, never guessed. [features/codex/widgets/kind_uses_editor.dart]
216. **Category presets** — Spells, Planets, Investigations, Techniques, Organizations, Species, Technologies, Relics. [shared/domain/codex/type_presets.dart]
217. **Worldbuilding presets** — Progression Fantasy Bible, Science Fiction, Detective Case, Urban Fantasy. [shared/domain/codex/world_presets.dart]
218. **Save and reuse templates** — Save all categories, or one, as a template; add a template to any novel or choose it for a new one (only ever adds). [features/codex/kinds_page.dart]

## 21. Connections between records

219. **Every connection panel** — On entries, chapters, events and threads: every connection in both directions wherever it is kept, each with its status; stored ones can be edited or removed. [features/codex/widgets/connections_panel.dart]
220. **Add a connection** — 24 kinds that read correctly from each end (Member of / Has member, Owns / Owned by, Located in / Contains, Prerequisite for / Requires, At war with…) or your own; to a record, chapter, event or thread; with status Confirmed, Provisional, Disputed, Invalid: retconned, Invalid: not canon. [features/codex/widgets/connections_panel.dart, shared/domain/records/link.dart]

## 22. Genre modules (Organize → Modules)

221. **Module manager** — The ten genre modules: Fantasy Worldbuilding; Progression Fantasy & LitRPG; Science Fiction & Space; Mystery & Detective; Romance; Horror & Suspense; Superhero; Historical; Contemporary; Political Intrigue. Each with its categories, tools and state. [features/modules/modules_page.dart, shared/domain/modules/builtin_modules.g.dart]
222. **Turn a module on or off** — On adds its categories and fields (creating no records); off hides its tools and empty categories, deleting nothing. Newer built-in versions can be updated. [features/modules/modules_page.dart]
223. **Made for your story** — Suggests up to 2 modules from the book's genres, synopsis and chapters. [features/modules/modules_page.dart]
224. **Try-on preview** — Shows what a module would add to this book before it is turned on. [features/modules/try_on_panel.dart]
225. **Module workspace** — A dashboard (counts, recently changed, still empty) and the module's tools: registry, board, table, matrix, meters, log, calculator, ranks, inventory, family tree (lineage), and page links. [features/modules/module_page.dart, features/modules/module_tools.dart]
226. **Configure a module** — Rename it and its tools, show or hide and reorder tools, edit a log's stages. [features/modules/module_page.dart]
227. **Your own modules** — Make a module from this novel's categories and system; export and import it as `.module.json`. [features/modules/modules_page.dart]

## 23. Systems: progression blueprints (Organize → Systems)

228. **Systems gallery** — Start a system from four presets, each with a live example status window (LitRPG / Game System, Progression / Cultivation, Hard Magic / Elemental, Superhero / Mutant), or blank. [features/progression/systems_page.dart, features/progression/widgets/system_gallery.dart]
229. **Your book's own system** — Reads the chapters, picks the preset whose words the book uses most (with evidence), brings in the book's powers, and creates the system and the hero's sheet in one press. [features/progression/systems_page.dart, shared/domain/systems/from_pages.dart]
230. **In the story / The blueprint** — Each system has two halves: how it shows in the story, and its rules. [features/progression/systems_page.dart]
231. **Blueprint beside its window** — The live status window sits beside the blueprint and updates as it is edited. [features/progression/systems_page.dart]
232. **Attributes and resources** — Attributes and resource pools (starting value, unit), formulas, and choices. [features/progression/systems_page.dart]
233. **Formula language** — Arithmetic, comparisons, AND/OR/NOT, min/max/floor/ceil/round/abs/sqrt, and tests of what is held; checked live. [shared/domain/systems/formula.dart]
234. **Levels and realms** — Numbered levels (cap, points per level, XP curve formula with a preview) or named stages with requirements. [features/progression/systems_page.dart]
235. **Every new tier, a new power** — A named stage can grant items that anyone at that stage or later holds automatically. [features/progression/systems_page.dart]
236. **Classes, skills and more** — Ranks; groups (Classes, Skills, Titles…, optionally one at a time); items with rank, parent item (a tree), requirements, modifiers, costs, cooldown, affinity and evolution. [features/progression/systems_page.dart]
237. **Tables** — Named matrices such as an elemental interaction chart. [features/progression/systems_page.dart]
238. **Sheets** — Give any character or entry a sheet in the system. [features/progression/systems_page.dart]
239. **Status window** — A sheet drawn in the system's style (game status, cultivation record, arcane ledger, threat dossier), with levels, resource bars, attributes after effects, and held items; shareable as a picture. [features/progression/widgets/status_window.dart, features/progression/widgets/live_window.dart]
240. **The climb** — A chart of a character's level by chapter from logged XP, with a projection at the current pace and outlier chapters noted. [features/progression/widgets/climb_view.dart]
241. **The face-off** — Two sheets side by side with mirrored bars, who leads and by how much; shareable. [features/progression/widgets/face_off_view.dart]
242. **The system speaks** — Compose in-story system messages (Level up, New skill, Stat up, Title earned, New quest, Quest complete, Warning) from the sheet; copy them or write them at the end of the chapter. [features/progression/widgets/system_speaks.dart]
243. **The ledger (number continuity)** — Reads stat and level numbers in the prose and flags wrong sums, rises from the wrong starting value, dropped levels, and final values that don't match the sheet. [features/progression/widgets/number_ledger_view.dart]
244. **In your pages, not in the system** — Skills, titles, classes and items the prose names in system style that the blueprint lacks, with "Add to <group>". [features/progression/widgets/pages_names_view.dart]
245. **Levels in your pages** — Everything the prose gives a level ("Hunter Armor Lv. 2"), its level over the chapters, and who owns it. [features/progression/widgets/levels_view.dart]

## 24. Character progression (Progression tab on a profile)

246. **System sheets on a character** — Levels, stages, values, choices and held items per system, with what is now within reach and unmet requirements. [features/progression/progression_tab.dart, features/progression/widgets/sheet_editor.dart]
247. **Experience log** — Log XP (or a loss) with source and chapter; the level after each entry; points to place on attributes. [features/progression/widgets/sheet_editor.dart]
248. **Progress tracker** — Free-form tracking of level, rank, class, titles, attributes, abilities, equipment, transformations, restrictions, milestones, costs paid, or your own; changes at chapters, scenes or events; the state at any point; a chart over the story. [features/progression/widgets/tracker.dart, features/progression/widgets/progress_chart.dart]
249. **Snapshots** — Log the full state at a chapter; inspect it, edit it (values, items, gear, status lines) and compare two snapshots. [features/progression/widgets/snapshots.dart]

## 25. Plan: plot threads

250. **Thread list as a loom** — Each thread drawn as a strand across the chapters with a knot per development, the target chapter, and a frayed end when it goes quiet. [features/plot/threads_page.dart, features/plot/widgets/loom.dart]
251. **Search, filter and group threads** — By status, category or character; "To check only". [features/plot/threads_page.dart]
252. **Worth a look** — Flags quiet active threads, paused threads gone long, threads with no developments, gaps, past-target threads and broken references; the quiet limit is set per novel. Threads can be muted. [shared/domain/plot/diagnostics.dart]
253. **The questions your story asks** — With no threads yet, four prompts that create the first threads. [features/plot/widgets/story_questions.dart]
254. **Thread page** — Title, category (Main Plot, Subplot, Character Arc, Mystery, Romance, Conflict, Foreshadowing, Political, Worldbuilding, Villain, Personal Goal, Custom), status (Planned, Active, Paused, Resolved, Abandoned, Retconned, Custom), premise, characters, places, target resolution, notes. [features/plot/thread_page.dart]
255. **Developments** — Beats placed in chapters with a role (Introduction, Development, Intersection with other threads, Resolution, Appears). [features/plot/thread_page.dart]
256. **Delete a thread** — With a restore point and Undo. [features/plot/thread_page.dart]

## 26. Plan: scene board and chapter plans

257. **Scene board** — Chapters as columns (or lanes) and scenes as cards with summary, status, word count and thread chips. [features/plot/board_page.dart]
258. **Move cards** — Drag and drop, or buttons (move earlier/later, into a part, to a chapter). [features/plot/board_page.dart]
259. **Board undo** — Undo the last 20 moves or status changes (Ctrl/⌘+Z). [features/plot/board_page.dart]
260. **Board filters** — Search, status and plot thread. [features/plot/board_page.dart]
261. **Chapter and scene plan page** — Status, objective, summary, labels, conflict, emotional arc, key dialogue, foreshadowing, information revealed, open questions, ending target and private notes. Never written into the manuscript. [features/plot/chapter_plan_page.dart]
262. **Beats** — An ordered list of key events for the chapter. [features/plot/chapter_plan_page.dart]
263. **Who appears here** — Appears, Mentioned and Point of view lists, and records involved; one-tap add for characters linked in the text. [features/plot/chapter_plan_page.dart]
264. **Web-serial notes** — A note before and after each chapter for serial publishing. [features/plot/chapter_plan_page.dart]

## 27. Plan: timeline and events

265. **Timeline (chronicle)** — Events in story order on a vertical line grouped by year, with "N years later" gaps and undated events listed apart. [features/timeline/timeline_page.dart, features/timeline/widgets/chronicle.dart]
266. **Life path** — Filter to one character's events, with their age at each. [features/timeline/timeline_page.dart]
267. **Events from chapters** — On an empty timeline, makes one event per chapter waiting for dates. [features/timeline/widgets/chapter_seed.dart]
268. **Event editor** — Name, description, date, importance (Minor, Major, Climax), place, length, end (or still going on), planning and canon status, threads, labels, factions, items, lore, and what it comes after. [features/timeline/event_page.dart]
269. **Flexible dates** — Exact (to the minute, in the novel's calendar), approximate (year and season or month), relative (before/after another event), or undated. [features/timeline/widgets/date_editor.dart]
270. **Characters and tellings** — Who takes part (and their age), and which chapters tell the event and how (Told here, Flashback, Flash-forward, Foreshadowed, Only mentioned, Revealed afterwards). [features/timeline/event_page.dart]
271. **Event checks** — Chronology problems, age conflicts, travel time and two places at once; "At the same time" lists overlapping events. [features/timeline/event_page.dart]
272. **Story calendar** — Standard or the novel's own: months, days, hours, weeks, eras and seasons; presets (Thirteen moons, The long year, The four turns, A ship's cycles). [features/timeline/calendar_page.dart]
273. **Alternate histories** — "What if…?" branches that keep only their differences: change an event, make it not happen, or add one only there; compare any two timelines. [features/timeline/histories_page.dart, features/timeline/widgets/what_if.dart]

## 28. Visualize: the workspace

274. **Atlas of views** — The view picker as plates grouped People, Time, The story, The world, Numbers. [features/visualize/view_atlas.dart]
275. **Shared frame** — Every view has the same header: view picker, shared filters (by name, involving a character), saved views, Export, and Turn views on or off. The selection carries across views. [features/visualize/viz_frame.dart]
276. **Details panel** — The selected record's facts and connections with "Open". A side panel on wide screens, a sheet on phones. [features/visualize/viz_frame.dart]
277. **Saved views** — Save, save changes, rename, duplicate, restore default and delete views; they keep filters, mode, layers and layout. [features/visualize/viz_frame.dart]
278. **Turn views on or off** — Per novel, without losing anything. [features/visualize/viz_frame.dart]
279. **Canon and continuity marks** — Badges on the timeline, relationship map, plot board and knowledge graph for provisional, conflicting, retconned or non-canon records and open warnings, also listed in words. [features/visualize/widgets/canon_badge.dart]

## 29. Visualize: the views

280. **Timeline view** — Events drawn along story time (dots, bars, rough edges, ongoing arrows), zoom from hours to millennia, jump to a date, a range, keyboard moves. [features/timeline/timeline_view_page.dart]
281. **Timeline tracks** — Split the timeline by category or plot thread; show, hide, reorder or fold tracks; view an alternate history. [features/timeline/timeline_view_page.dart]
282. **Story vs reading order** — Chapters and events side by side joined by lines styled by how each is told, with notes on flashbacks that don't go back. [features/timeline/order_page.dart]
283. **Character history** — A character's whole life: in story time, as the reader meets them, and throughout. [features/timeline/life_history_page.dart]
284. **Plot board (lanes)** — One lane per thread across the chapters, with developments, gaps and crossings. [features/plot/plot_lanes_page.dart]
285. **Structure and pacing** — Words per chapter or scene with parts behind them, the average, structural markers (inciting incident, midpoint, climax…), and words by label. [features/plot/structure_page.dart]
286. **Character appearances** — A character × chapter matrix of appears / mentioned / other record; cells can be recorded. [features/plot/appearances_page.dart]
287. **Records by kind** — Any category as a table (CSV download), on a timeline, on a map, by rank, or by who holds it. [features/kinds/kinds_view_page.dart]
288. **Ability paths (skill tree)** — Abilities as a tree of prerequisites, upgrades, evolutions, fusions and exclusions; seen through a character as held / can be gained / locked at any chapter; add paths; "What does not add up". [features/abilities/ability_paths_page.dart]
289. **Character progression** — Each character's progression state at the end, as a list. [features/visualize/view_lists_page.dart]
290. **Charts** — Words per chapter, chapter lengths, character appearances, plot-thread presence, events per year, point of view, scene categories; each with a table and CSV. [features/progress/charts_page.dart]
291. **Relationship map** — See Relationships. [features/relationships/relationship_map_page.dart]
292. **Secrets and knowledge** — See Review. [features/review/knowledge_page.dart]

## 30. Places, journeys, factions and ownership

293. **Place explorer** — Every location nested by what it is inside, with how much of the story happens there and warnings for loops. Explore inside one place. [features/places/places_page.dart]
294. **Levels of place** — The novel's own size levels, with presets (Across space, One world, The present day). [features/places/widgets/place_panels.dart]
295. **Maps** — Maps over a grid or a picture from the device; place pins by typing coordinates or tapping the map. [features/places/places_page.dart, features/places/widgets/place_panels.dart]
296. **Place panel** — Level, what it is in, who and what is tied to it, events and chapters there; tie more. [features/places/widgets/place_panels.dart]
297. **Journeys** — Who travels from where to where and when, by what method, with route maps and each traveller's route. [features/places/journeys_page.dart]
298. **Travel checks** — Flags arriving before leaving, too fast for the distance, two journeys at once, and events elsewhere mid-journey. Never fixed automatically. [shared/domain/travel/routes.dart]
299. **Factions** — Ties as of any point (leaders, members, allies, rivals, territory), a faction map, each faction's history, and ending a tie. [features/places/factions_page.dart]
300. **Ownership** — Who held an item, in order, how it passed, gaps nobody is known to hold it, and recording what happens to it next. [features/places/ownership_page.dart]

## 31. Knowledge graph

301. **Knowledge graph** — Every record and connection, by shape and colour, with arrows on one-way lines; zoom, pan, fit, drag. [features/graph/graph_page.dart, features/graph/widgets/graph_canvas.dart]
302. **Layers and clutter controls** — Hide kinds of record, connection or status; fold kinds into groups or scenes into chapters; the 200 most connected drawn first. [features/graph/graph_page.dart]
303. **Focus and paths** — Focus on one or two steps around a record; find the shortest path between two records. [features/graph/graph_page.dart]
304. **Says what it leaves out** — Every partial view lists what is hidden, with "Restore the full view". [features/graph/graph_page.dart]
305. **Graph keyboard and list** — Arrows, Enter, F (focus), P (path), Shift+arrows (nudge); a list form of every connection. [features/graph/widgets/graph_canvas.dart]

## 32. Review: checking the book

306. **All warnings** — Every check's findings in one list, by severity (Critical, Warning, Info) and certainty (confirmed data error or possible inconsistency), each with its rule, the data it rests on, its records, and where to see it. [features/review/review_page.dart]
307. **One at a time** — Works through open warnings most-severe first; decide each as Resolved, Intentional, Needs review or Ignored, with a note and quick reasons. Only the decision is stored. [features/review/review_page.dart, features/review/widgets/review_parts.dart]
308. **Warning filters** — To look at / Decided / Everything; group by severity or category; filter by certainty, severity, category and check; search. [features/review/review_page.dart]
309. **In good order** — When nothing is raised, a certificate states what was read and every check passed. [features/review/widgets/all_clear.dart]
310. **Record check** — References to deleted records (with remove), references that name nothing (with "Point it at"), values that don't fit their fields, and view settings on unsuitable fields. [features/review/record_check_page.dart]
311. **Duplicates and merge** — Finds look-alike entries; "Not duplicates" or Merge (shows the full plan, confirmed by typing the name, undoable). [features/review/record_check_page.dart, features/review/data/integrity_service.dart]
312. **Record-to-record rules** — Eight rules, e.g. allied and at war at once, appears after their death, a tie that ends before it starts, a retcon with no replacement. [shared/domain/canon/checks.dart]
313. **Timeline review** — Ends before it starts, dated before what it follows, date not in the calendar, ages that disagree, takes part before birth, too little time to travel, two places at once; mark intentional with a reason, dismiss, reopen. [features/timeline/timeline_review_page.dart]
314. **Canon** — Statements with status (Conflicting, Canon, Provisional, Retconned, Non-Canon), kind, what they are about, sources pinned to a paragraph, contradiction links, retcons that keep the earlier wording, and a history. [features/review/canon_page.dart]
315. **Possible contradictions** — Facts on the same subject worded differently, or differing from an entry's field. Observations, not rulings. [features/review/canon_page.dart]
316. **Continuity check** — Reads the manuscript word by word against tracked rules (deaths, absences, items lost or held, travel times, power limits) and profile ages and colours; fix the text, update canon after confirming, mark intentional or dismiss. [features/review/continuity_page.dart]
317. **Tracked rules** — Character status, item possession, travel time and power rules, with chapter ranges and aliases. [features/review/continuity_page.dart, shared/domain/continuity/rules.dart]
318. **Proofreading** — Proofreader's slips across the book (name slips, doubled words, unclosed quotes, straight vs curly quotes, spacing, small letters, unfinished chapters), each with "Read it there". [features/review/proof_page.dart]
319. **Secrets and knowledge** — Who knows each secret, chapter by chapter or event by event (knows, partial, believes, suspects, false belief, unaware), who told whom, and two checks (acts on it without knowing; learns it from someone who didn't know). [features/review/knowledge_page.dart]
320. **What depends on this** — Pick a chapter, event or plot development to see what is recorded there and what may be affected later; adjust who is involved; tick off what you've looked at. [features/consequences/consequences_page.dart]

## 33. Collaboration by file (offline)

321. **Team roster** — Add people as Editor, Beta reader or Viewer; change roles; remove (refusing their future feedback) and restore. [features/collab/team_page.dart]
322. **Make a review copy** — A file holding only what that role may see (editor: all but author-only data; reader: the manuscript; viewer: final chapters only). Nothing is sent by the app. [features/collab/team_page.dart, features/collab/collab_providers.dart]
323. **Reviewer's workspace** — The reviewer opens the copy, reads, comments on a paragraph or chapter, reacts (Loved this, Laughed, Tense, Moved, Confused, Lost interest, Did not believe it), fills in a feedback form, and as an editor suggests text and entry changes, without being able to change the book. [features/collab/review_workspace.dart, features/collab/review_gate.dart]
324. **Send and bring in feedback** — The reviewer saves a feedback file; the author previews it (with anything their role does not allow refused) and takes it in. [features/collab/team_page.dart]
325. **Conversations** — Reply, resolve and reopen comment threads. [features/collab/collab_widgets.dart]
326. **Suggestions** — Accept or reject each suggested text change (shown as out/in) and each entry change; accepted text goes into version history. [features/collab/collab_widgets.dart]
327. **Activity** — A record of who did what. [features/collab/collab_widgets.dart]
328. **Roles and permissions** — Owner, Co-Author, Editor, Beta Reader/Proofreader, Viewer; author-only data (secrets, notes, history, goals…) never goes into a copy. [shared/domain/collab/access.dart]

## 34. Progress: writing progress and analytics

329. **Journal** — Days in a row (and best run), words against the target as a page filling with ink, projected finish date. [features/progress/journal_view.dart]
330. **Length shelf** — Where the manuscript stands among fiction lengths (flash fiction to long novel), in pages, and words to the next length. [features/progress/widgets/length_shelf.dart]
331. **A year of writing** — A 53-week grid of writing days. [features/progress/journal_view.dart]
332. **Milestones** — Seals for word counts, streaks and completed chapters, and how far the next ones are. [features/progress/journal_view.dart]
333. **Writing progress** — Today, this week and this month; net words per week; daily and weekly targets; chapters and scenes by status. [features/progress/progress_page.dart]
334. **Deadlines** — For the whole manuscript or one part, with the words per day needed. [features/progress/progress_page.dart]
335. **Tasks** — Planning, worldbuilding, editing and other tasks with dates and done checks. [features/progress/progress_page.dart]
336. **Recent sessions** — The last 12 writing sessions. [features/progress/progress_page.dart]
337. **Analytics** — Observations stated as facts, writing output, sessions and streaks, manuscript structure, character presence and plot threads, with charts and tables. [features/progress/analytics_page.dart]

## 35. Keepsakes made from the book

338. **Your best lines** — The 12 most quotable sentences as cards; share a line as a picture. [features/progress/best_lines_page.dart]
339. **Book quiz** — Up to 10 questions from the book (who said it, which chapter, the missing word, which comes first). [features/progress/book_quiz_page.dart]
340. **Your book so far** — A story-style recap in shareable pages. [features/progress/book_story.dart]
341. **Book fingerprint** — The book drawn as threads coloured by who is on each paragraph. [features/progress/book_print_page.dart]
342. **Full jacket** — The front, spine (thickness from the word count) and back cover with blurb and pull quote. [features/progress/full_jacket.dart]
343. **The Gazette** — Each chapter as a newspaper front page. [features/progress/gazette_page.dart]
344. **Postcards from your world** — Up to 16 places as painted postcards with a line from the book on the back. [features/progress/postcards_page.dart]
345. **The trailer** — An animated trailer of the book's lines ending on a poster. [features/progress/trailer.dart]
346. **The sampler** — A reader's sample (title page, opening chapters up to ~1,500 words) as a PDF. [features/progress/sampler_page.dart]
347. **Submission kit** — A checklist (title, author, genre, length for the genre, one-page synopsis, slips in the first 3 chapters) and a query letter laid out from the book's details. [features/progress/submission_page.dart]

## 36. Import and export

348. **Import & export hub** — Export the manuscript, import a manuscript, export records, template files and full backups, in one place. Nothing is uploaded. [features/exchange/exchange_page.dart]
349. **Export the manuscript** — Word (.docx), PDF, Markdown, plain text or a web page; Clean reader or Complete bible preset; switches for what to include; the whole book or one part. [features/exchange/export_dialog.dart, features/exchange/exchange_service.dart]
350. **Import a manuscript** — A .docx, .rtf, .txt or .md file, split into chapters and scenes or not, with a preview, added under the part chosen; all or nothing. [features/exchange/import_dialog.dart]
351. **Export records** — Chosen kinds of record as CSV or JSON, marked "not a backup". [features/exchange/data_export_dialog.dart]
352. **Export a view** — Any Visualize view as a picture (PNG), PDF, JSON or CSV. [features/exchange/data_export_dialog.dart]
353. **Share a template** — Categories & fields, profile layouts or systems as a `.novel-template.json` file with maker, licence and a version that rises each time. [features/sharing/template_sharing.dart]
354. **Import a template** — Checks the file and shows its contents first; adds new or newer versions only. [features/sharing/template_sharing.dart, shared/data/template_store.dart]

## 37. Search, the index and the tutorial

355. **Search the whole novel** — Ctrl/⌘+K: chapter text, headings, notes and plans, and entries, scoped to Everything, Manuscript, Codex or Notes; opens the chapter at the paragraph found. [features/search/search_dialog.dart]
356. **Go anywhere** — The same box jumps to any area, page, keepsake, chapter, character, entry, thread, event or theme, with synonyms and fuzzy matching. [features/search/jumps.dart]
357. **The index** — An A–Z index of every name in the manuscript with chapter numbers, and names spelled two ways. [features/search/book_index_page.dart]
358. **Tutorial** — 94 lessons in 7 groups, opened on the lesson for the page in view, with "Take me there". Never changes data. [features/tutorial/tutorial.dart, features/tutorial/topics.dart]
359. **Your path** — Which lessons you have already used in your books, and the next one. [features/tutorial/your_path.dart]
360. **Show me on this page** — A spotlight tour that lights each button a lesson names. [features/tutorial/spotlight.dart]

## 38. Behaviours shared across the app

361. **Hold to confirm** — Destructive buttons must be held for 900 ms (one tap with a screen reader). [core/widgets/hold_to_confirm.dart]
362. **Toasts with Undo** — Messages from the foot of the page, up to 3 stacked, with Undo or Open actions. [core/widgets/toast.dart]
363. **Loading skeletons** — Shimmering placeholders while content loads. [core/widgets/skeleton.dart]
364. **Standard states** — Shared loading, empty, error (Try again) and no-results states. [core/widgets/states.dart]
365. **Typing-safe fields** — A field never overwrites what is being typed when the stored value refreshes. [core/widgets/saved_text_field.dart]
366. **Long-list choosers** — Long dropdowns open a filterable list. [core/widgets/choice_field.dart]
367. **Details panel or sheet** — A side panel on wide screens, a bottom sheet on phones. [core/widgets/detail_panel.dart]
368. **Accessibility** — Tap targets, named controls, contrast in both themes, twice the text size, and keyboard reach checked on every screen; every drawn view also has a list or table form.
369. **Shareable pictures** — Cards, windows and keepsakes are saved as PNGs via the share sheet on phones and the Save dialog on computers. [shared/data/backup_files.dart]

---

## Not in the app, by the owner's choice

- **Cloud sync** — declined; backups move novels between devices.
- **AI assistant, brainstorms** — excluded; their data from the original web app is kept in backups.
- **Movable dashboard widgets** — not built.
- **Live collaboration** — collaboration is by file only.
- **Template marketplace** — template sharing is by file only.

## New in Scriptor (from the owner's mock-ups, decided 2026-11-16)

- **Five areas** — Library, Write, Organize, Analytics, Settings. Plan and Visualize are tabs inside Organize; Progress and Review are tabs inside Analytics.
- **Writer rank and level** — experience earned from words written, days written in a row and chapters finished, read from the writing log on this device; ranks F to SSS, shown in the side rail.
- **Library collections** — Favorites (pinned), My Drafts, Completed, On Hold, and the writer's own custom collections.
- **Recent Activity** — what changed lately in a novel: chapters written, characters added, entries changed. In each novel's Analytics tab (moved out of the Library by the owner, 2026-11-19).
- **Library Overview and Quick Actions** — panels beside the novels on wide screens.

## Possible later features (shown in the mock-ups, left out for now by the owner's choice)

- **Sync ("Up to date")** — would need an account and a cloud service, reversing the offline decision.
- **Premium ("Unlock advanced features")** — the app has no paid tier.
- **Notifications bell** — could carry in-app reminders (writing streak, deadlines) without any network.
- **Profile picture** — a picture of the writer, chosen from the phone.
