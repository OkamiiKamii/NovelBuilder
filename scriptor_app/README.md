# Scriptor

Scriptor is the React Native rebuild of Novel Builder, written in TypeScript. The Flutter app in `../flutter_app` stays
as it is and is not replaced; this folder only adds the new app beside it.

**Platform: Android only, for now.** Phones and tablets. iPhone, Mac and Windows versions are not being built.

`FEATURES.md` lists everything the Flutter app does. It is the checklist for rebuilding the app piece by piece.

Scriptor must read and write the same `.novel.json` backup format (version 4) as the Flutter app, so a novel can move
between the two apps without losing anything. The file format keeps its existing names (`.novel.json`,
`.module.json`, `.novel-template.json`) so files made by either app open in the other.

## Rebuild status

| Phase | Items in FEATURES.md | State |
|---|---|---|
| 1: Storage and saving | 1–14 | Done (2026-11-16), see below |
| 2: App frame, Library and Settings, in the owner's design | 15–19, 35–70 (in part) and the new features | Done (2026-11-16); first install on the phone |
| 3a: Write — the contents and the chapter editor | 71–80, 85–86, 89–92, 96 and the word meter | Done (2026-11-17) |
| 3b-1: Write — the desk: settings, focus, lenses, Listen | 97–99, 102–105, 111 | Done (2026-11-17) |
| 3b-2: Write — the rest of the desk, history and drafts | 81–84, 87–88, 93–95, 100–101, 106–110, 112–118 | Done (2026-11-17), tested on the emulator |
| 3c: Write — goals, sprints, the reader, publishing | 119–134 | Done (2026-11-17), tested on the emulator |
| 4a: Organize — characters and relationships | 135–139, 149–150, 152, 154, 166–168, 171–174, 176–188, 194–200 | Done (2026-11-17), tested on the emulator |
| 4b: Organize — the cast's views, found in your pages, writing aids | 140–148, 151, 153, 155–165, 169–170, 175, 189–193 | Done (2026-11-17), tested on the emulator and the phone |
| 5a: Organize — World, categories and fields, templates, connections | 201–220 | Done (2026-11-17), tested on the emulator |
| 5b: Organize — genre modules | 221–227 | Done (2026-11-17), tested on the emulator |
| 5c: Organize — Systems and character progression (with the profile's Status tab) | 228–249, 175 | To do |
| 6a: Organize — Plan: plot threads, the scene board, the timeline (with the story-time date editor) | 250–273 | To do |
| 6b: Organize — Visualize: the workspace and its views, places and journeys, the knowledge graph | 274–305 | To do |
| 7: Review and collaboration by file | 306–328 | To do |
| 8: Analytics and keepsakes | 329–347 | To do |
| 9: Import and export, search and the index, the tutorial, the shared behaviours; finishing | 348–369 | To do |

**Phase 5b** built the genre modules, as two new Organize tabs after World: **Systems** (which says it comes in 5c)
and **Modules**. The Module Manager: the ten genre modules on a shelf (All, Enabled, Not enabled), turn one on (it adds
its categories and fields and makes no records) or off (it hides its tools and empty categories and deletes nothing),
update a newer built-in, "Made for your story" (up to two modules suggested from the book), the try-on preview of what
a module would add, and your own modules (made from this novel's categories and system, kept on this device, shared
and imported as `.module.json`). A module's workspace: the dashboard, Configure (names, which tools show and their order,
a log's stages) and its tools: registry, board, table, matrix, meters, log with its arc chart, calculator, ranks,
inventory, family tree and page links. The logic matches the Dart on every fixture (41 tests, golden output from the
real Dart, and the original app's own golden replayed step by step).

Where the Flutter app's messages say "the Codex", Scriptor's say World (`src/domain/modules/scriptorWords.ts`; the
golden test maps them back). The built-in modules' own field hints keep the Flutter app's wording.

Left for later: page links to parts not built yet (Systems, Visualize, Review) are shown and say they come later; the
ranks tool reads tracks without the Systems calculator (5c); module tools are always editable (no review copies yet).

**Phase 5a** built Organize → World. The World tab: New entry, the world charter on an empty world (a paragraph whose
blanks become the first linked entries), the category volumes, the world chart (places as islands with the places
inside them, what is linked on their shores, the rest adrift with "Where does X belong?"), search and tags, and the
encyclopedia filed A–Z with a letter bar. Found in your pages for the world ("Add as…", "Not an entry"). The entry
page: picture, name with Forge a name, category (moving keeps every value), summary, description, the category's
fields with their checks, fields just for this entry, tags, notes, related entries with wording and canon status,
where it figures, every connection, and delete with a restore point and Undo. Categories & fields: categories and
their fields of 10 types with rules, archive and restore, the knowledge graph switch, what each view reads, the 8
category presets and 4 world presets, and templates saved on this device. The connections panel (24 two-sided kinds
or your own, five statuses) is on entries and on a character's Overview. The logic matches the Dart on every fixture
(81 tests, golden output from the real Dart, including a 172-entry world for the chart's packing).

Left for later: connections on chapters, events and threads (with their pages in Plan), date and number pickers in
fields (they are text boxes meanwhile), hover lighting on the chart (phones have no pointer).

**Phase 4b** finished the cast. Above it: the playbill for an empty cast ("Raise the curtain" makes them with their
ties), the empty chairs round a small cast's lead, and the cast photograph. The cast list for the book (by faction,
part or one list; as they appear or by name), put in the book's matter or copied. Twelve ways to see the cast, chosen
from "Ways to see your cast" and remembered on this device: cards, list, roll call (written in place), names (the
alphabet board, look-alikes, free letters, Forge a name), ties, stakes, compass, orbit, eyes, entrances, table read
(read aloud, a voice each) and arcs. "From your pages" under the cast: together on the page, the cast checked,
waiting for a name, names in your manuscript. On a profile: the cameo drawn from their looks (and Draw their face),
the interview, This or that, the name forge, their journal, Write them in, the shareable card with a line they say,
and three boxes read from the book (their voice, in their own words, checked against your pages). The page readings
match the Dart on every fixture novel (97 tests, golden output from the real Dart).

One fix worth knowing: Hermes (the phone's JavaScript engine) hung on an endless `for (;;)` bisection in the easing
curves that runs fine in Node, freezing the app when the orbit rose. The loop is now counted (it settles well within
64 halvings), and the results are the same.

Left for later: the Status tab (#175, with Systems), "Read it there" selecting the sentence (it opens the chapter),
the portrait crop, and the full story-time date editor (with the timeline in Plan).

**Phase 4a** built Organize (Characters first; World, Plan and Visualize say which phase brings them) on a port of
the Flutter app's whole model layer (records, the story model, connections, what a delete takes with it, codex
changes, dates and the two orders of a story: 65 tests, 0 differences from the Dart's own output across about
216,000 values). On it: the character library (search, sort, filters, role tabs, cards or a list, My order), New
character with "write them in a line", the profile (portrait, identity edited in place, figures, previous and next,
find, sections and fields with suggestions, layouts and templates, Overview, Relationships, Details, Secrets, Notes,
History, archive, delete with a restore point and Undo), and relationships (the page with every stage and its editor,
record a change, swap, types and tracked attributes, the map with its filters, zoom, selection, list and first tie).
The characters and relationships logic matches the Dart on every fixture (109 and 48 tests, with change scripts of
104 and 100 steps compared step by step).

**Phase 3c** finished Write: the word meter with today's goal ring and this week's goal; "How much a day?" goals
(kept in the novel's `goals`, as the Flutter app keeps them); writing sprints (the best kept on this device); the day
book's Set a daily goal and Share today's page (a 1080 × 1350 picture through the share sheet); Read as a book
(standard novel, ebook or web serial, a page at a time or scrolling, with the place remembered on this device and
"N% · about M minutes left"); the reader's look (six typefaces, size, spacing, line length, paragraphs, justification,
white, sepia, dark or custom colours with their contrast); Book details (dedication, epigraph, copyright, cast list,
acknowledgements, about the author, the mark between scenes); and Publish: an EPUB 3 ebook, every chapter of a web
serial in a zip, or one chapter saved or copied, as a web page, Markdown or plain text, with what the file will hold
shown first. The reader's pages are reader-web/, built with the editor's by `npm run build:pages`. The book, its look
and the publishing outputs were ported from the Dart with their tests and checked against the Dart's own output (677
outputs, the same text; the zip bytes differ only in compression). Added `fflate`, `react-native-view-shot` and
`expo-clipboard`.

Left for later: the worldbuilding appendix of the full book export (with Organize), and the device frame preview,
which shows on tablets only.

**Phase 3b-2** finished the writing desk: version history (compare any version paragraph by paragraph, restore, save
a named one) and alternate drafts; the chapter switcher; the chapter's end (what comes next, or Begin the next chapter,
and the author's name at the end of the book) with a note for next time; the first page of an empty chapter; Stuck?
nudges; the margin; rhythm; time-lapse; today's ink; the chapter spine; atmosphere; title ideas; the In this chapter
strip; name keys and the at-a-glance card in the ink tray over the keyboard; on wide screens the desk's tools as icons
and the page as paper on a desk; and in the contents the day book, the road to the draft, gaps to fill and the
storyboard. The pure logic was ported from the Dart with its tests (test/desk, test/manuscript) and checked against
the Dart originals' output. Added `react-native-svg` (the day book's ink, the road, later the Analytics charts) and
ESLint (`npx eslint src editor-web test tool`: no errors; the React Compiler rules are warnings, as Scriptor does not
use the compiler).

Left for the phases they belong to:
- The day book's Set a daily goal and Share today's page, with goals (3c and Analytics).
- The import and export menu in the contents (#84), with the reader and exchange phases.
- The at-a-glance card's ties ("Kai's sister") and real faces, with relationships and portraits in Organize; until
  then a face is the initials in the person's colour, and Plan this chapter says plans come with Organize.
- Hardware-keyboard shortcuts (#97).
- Opening a gap or Carry on puts the caret in place, but Android does not raise the keyboard until the page is tapped.

**Phase 3a** built the editor on the original web app's own editor, TipTap, with the same set-up (editor-web/), run in
a WebView from a page bundled into the app (`npm run build:editor`), with the app's fonts and no network. Every chapter
of the Flutter app's fixtures comes back from it unchanged (test/editorSchema.test.ts); a chapter it cannot reproduce
exactly opens read-only with the reason, so no formatting is lost. Ported `ManuscriptService` (saving with revisions
and conflict protection, history copies, crash copies, the writing log) and the outline operations (add, rename,
status, move, reorder, duplicate, split, merge, delete with Undo).

**Phase 2** built:
- The System Monolith frame of the mock-ups: five areas, a bottom bar on phones, a rail with the writer's rank on
  tablets.
- The shared building blocks: panels, gold buttons, chips, progress bars, sheets, toasts with Undo, hold-to-delete.
- The Library: search, status filters, sort, cards or a list, the New Novel / Import / Backup / Templates tiles,
  Collections (Favorites, My Drafts, Completed, On Hold, your own), Library Overview, Quick Actions, Recent Activity.
- Every novel action: create (with chapter one), edit details, cover picture, favorite, add to collection, duplicate,
  archive, save a backup, delete with a restore point and Undo, start writing, import a backup as a copy or in place.
- Settings: appearance, the writer's rank and how it is earned, restore points, the sample novel, your data.

The Flutter app's other Library looks (shelves by stage, the bookcase, the book-opening animation, the idea file) are
replaced by the owner's mock-up layout. Write, Organize and Analytics show what they will hold until their phases.

**Phase 1** ported `flutter_app/lib/shared/data` and `shared/domain/snapshot` to `src/data` and `src/domain`:
- The SQLite library (same schema, WAL, `synchronous = FULL`, refusing a newer library, a copy before upgrading).
- The novel store, autosave with retries, crash-recovery drafts, restore points and backups.
- The `.novel.json` reader and writer with its upgrades, and novel copies with fresh ids.
- The sample novel on first start, the remembered open novel, flushing saves when the app goes to the background, the
  in-memory error log, a fallback for a part of a screen that fails, and read-aloud over the device's voice.

Checked by 77 tests, including every `.novel.json` fixture of the Flutter app: Scriptor writes exactly what the Flutter
app writes (`test/golden/flutter-roundtrip`, made by the Flutter app itself).

Still to come in later phases:
- The screens that use some of this: the editor's recovery banner, Settings' restore points, Listen.
- The review-copy guard (section 33).
- The import preview's list of missing references (section 32).
- Running whole-book work off the screen thread (#11), first needed by the book-reading features.

## Stack

| What | Value |
|---|---|
| Framework | Expo SDK 58, React Native 0.88, React 19.3, TypeScript 6 |
| Storage | expo-sqlite (synchronous API), expo-file-system; ids from expo-crypto; read-aloud by expo-speech |
| Look | System Monolith (`DESIGN.md`, `src/ui/theme.ts`); fonts bundled with expo-font |
| Tests | Jest (jest-expo), the storage code run against Node's built-in SQLite (`test/nodeSql.ts`) |
| App ID | `com.scriptor.app`, so it installs **beside** Novel Builder (`com.novelbuilder.flutter`) and never touches its library |
| Builds | On this computer only, with Gradle. No EAS, no Expo account, nothing uploaded |
| Native folder | `android/` is generated from `app.json` by `expo prebuild` and is not kept in git; never edit it by hand |

## Building and running

Needs:
- Node.js;
- JDK 17 (`%USERPROFILE%\.jdks\jbr-17.0.14`);
- the Android SDK (`%LOCALAPPDATA%\Android\Sdk`), with CMake 3.31.6 installed in it (`sdkmanager "cmake/3.31.6"`);
- **Windows long paths turned on** (`LongPathsEnabled = 1`, set on this PC 2026-11-16).

The last two are because native C++ parts of React Native packages make file paths longer than 260 characters, and only
CMake 3.31.6's Ninja can use long paths. The script sets `JAVA_HOME` and `ANDROID_HOME` for its own commands only, and
points Gradle at that CMake. Run it from Git Bash:

```sh
npm install                 # once, and after package.json changes
tool/android.sh check       # typecheck, tests and Expo's project checks
tool/android.sh debug       # build a debug APK -> build/Scriptor-debug.apk (loads its code from `npx expo start`)
tool/android.sh preview     # build a self-contained APK -> build/Scriptor-preview.apk (debug key: emulator only)
tool/android.sh emulator    # build the preview, start the emulator (AVD NovelBuilder_Pixel), install and open it
```

Add packages with `npx expo install <package>` (not `npm install <package>`), so versions match the Expo SDK.

### On the phone

```sh
tool/android.sh phone           # build/Scriptor.apk, signed with the author's key in ../signing (read, never copied)
tool/android.sh install-phone   # install it on the one connected, unlocked phone
```

`install-phone` only ever updates (`adb install -r`), never uninstalls, and refuses when the build's signature differs
from the one installed: an app signed with another key could only be installed by uninstalling, which would delete
Scriptor's library. Scriptor (`com.scriptor.app`) and Novel Builder (`com.novelbuilder.flutter`) are separate apps
with separate libraries; installing one never touches the other. The phone build is signed with the same key as Novel
Builder (certificate SHA-256 `0d271125…3383`).
