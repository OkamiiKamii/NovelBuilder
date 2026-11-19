This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building: on this computer only

Scriptor is an offline app and its code stays on this computer: **do not use EAS** (no `eas build`, `eas submit`,
`eas update`, no Expo account). Build locally with `tool/android.sh` (see README), which sets `JAVA_HOME` to JDK 17 and
`ANDROID_HOME` to the local Android SDK, generates `android/` with `npx expo prebuild`, and runs Gradle.

Scriptor is **Android only** for now: no iOS or web setup.

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

## Parallel development (main session only; subagents follow their own definitions)

The main session coordinates five agents in `.claude/agents/`: `scriptor-ui-dev`, `scriptor-feature-dev`,
`scriptor-architect`, `scriptor-perf`, and the read-only `scriptor-qa`. Follow `.claude/PARALLEL_DEV.md` when a
request splits into independent pieces. In short:

- Don't delegate simple tasks; do them directly.
- Check `git status` first and never overwrite uncommitted work.
- Give every agent an exact list of files it may edit. No two agents hold the same file at once.
- Run at most four implementation agents at a time, launched together.
- Name the skill each brief needs, or none (the mapping is in `PARALLEL_DEV.md`).
- After integration, run typecheck, Jest and lint yourself, then have `scriptor-qa` review before reporting.
- Device testing stays with the main session, one step at a time.
