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
