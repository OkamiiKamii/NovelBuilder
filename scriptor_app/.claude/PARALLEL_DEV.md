# Scriptor: Parallel Development Protocol (for the coordinator)

The main Claude session is the **Project Coordinator**. It splits a request into independent tasks, hands them to the
agents in `.claude/agents/`, integrates the results, runs the checks, and reports. Subagents follow their own
definition files, not this one.

## The team

| Agent | Role | Default ownership | Edits code |
|---|---|---|---|
| `scriptor-ui-dev` | UI/UX | `src/ui/**`, route screens `src/app/**` (not `_layout.tsx`) | yes |
| `scriptor-feature-dev` | Features | `src/domain/**` + matching `test/<area>/**` | yes |
| `scriptor-architect` | Architecture & integration | `src/data/**`, `src/app/_layout.tsx`, `LibraryContext.tsx`, `src/setup.ts`, `index.ts`, `editor-web/`, `reader-web/`, `src/editor/`, `src/reader/`, `plugins/`, `tool/`, `app.json`, `package.json`, configs | yes |
| `scriptor-perf` | Performance | `test/perf/**` + source files assigned per task | yes |
| `scriptor-qa` | QA & review | none (read-only) | no |

## Skills per agent

| Agent | Preloaded (every run) | On demand, via the Skill tool, only when the brief calls for it |
|---|---|---|
| `scriptor-ui-dev` | `ponytail` | `frontend-design` (a new screen or a visual redesign, inside `DESIGN.md`'s look); `impeccable` (refine, polish, harden, clarify, layout or animate a screen) |
| `scriptor-feature-dev` | `ponytail` | none |
| `scriptor-architect` | `ponytail` | `ponytail-audit` (assess architecture, dependencies or risk in a named area) |
| `scriptor-perf` | `ponytail` | `ponytail-audit` (look for slow paths across an area) |
| `scriptor-qa` | `ponytail-review` | `ponytail-audit` (only when a wider area than the change is to be audited) |

- Preloaded skills are in the agent's `skills:` frontmatter and cost their SKILL.md on every run, so only skills that
  apply to every task are preloaded. The on-demand ones are larger, so the agent loads them only when the brief needs
  them.
- In each brief, name the on-demand skill to use, or write `Skill: none`. That keeps token use down. Don't name a skill
  the task doesn't need (no `impeccable` for a wiring fix, no audit for a one-file change).
- Agents may use other installed skills when they clearly fit. Their own rules (file list, git, no deleting, no
  devices) outrank any skill. QA stays read-only whatever skill it loads.
- `impeccable` resolves to the user-level copy (`~/.claude/skills/impeccable`), which shadows the project copy of the
  same name. Inside a subagent it cannot screenshot, launch the app or spawn agents. Its `init`, `document`, `extract`,
  `live` and `generate` commands and full redesigns are run by the coordinator, not delegated.

## Ownership

The default areas are only a starting point. **Every brief must list the exact files an agent may edit**, and that list
is what counts.

**Hot files** have one owner per task, named in the brief. No other agent touches them that round:
- `src/ui/theme.ts`, `src/ui/kit.tsx`, `src/ui/frame.tsx`
- `src/domain/model/**`, `src/domain/novel.ts`
- `src/data/database.ts`, `src/data/sql.ts`
- `package.json`, `app.json`
- `FEATURES.md`, `README.md`, `DESIGN.md`, `test/fixtures.ts`

## When to delegate

- **Don't delegate simple tasks.** A change of a few files in one area, a lookup or a small fix is faster done
  directly.
- Delegate when there are two or more independent pieces with disjoint file sets, or one large piece in a single area
  whose file reads would flood the main context.
- Prefer parallel *implementation* over parallel analysis. Don't send agents to "investigate" what one Grep answers.
- Use up to **4 implementation agents at once** by default. Use fewer when the pieces share files or the task is small.
  Use more only when the user asks for scale.
- If two pieces need the same file, either give that file to one agent and run the other piece after it, or do the
  shared edit yourself first and then fan out.

## Before any code changes

1. `git status` (from `scriptor_app/`; the git root is `../`, on branch `react-native`). Note every uncommitted change.
   It is the user's work, so never overwrite or discard it. Keep any agent away from files that already have
   uncommitted changes unless the user says otherwise.
2. **Checkpoint.** Record `git rev-parse HEAD`. If the tree has uncommitted changes, also take a snapshot without
   touching the working tree:
   `S=$(git stash create) && [ -n "$S" ] && git update-ref refs/checkpoints/$(date +%Y%m%d-%H%M%S) "$S"`.
   `git stash create` covers tracked files only. List untracked files (`git status --short | grep '^??'`) and keep
   agents away from them. Commit only when the user asks.
3. Map the dependencies: which pieces need another's output (a domain function before the screen that calls it, a
   schema before its queries). Independent pieces start at once. Dependent ones start when their input is ready,
   **not** when the whole first round finishes.
4. Define the interfaces up front when pieces meet, for example "feature-dev exports `scenePace(novel): PaceRow[]` from
   `src/domain/plot/pace.ts`; ui-dev imports it." Then both sides can work at the same time.
5. Write the ownership table into each brief.

## Brief template

```
Goal: <one outcome>
Context: <what exists, what you've ruled out, relevant files to read>
You may edit ONLY: <exact paths; new files you may create>
Do not touch: <files other agents own this round>
Interface: <signatures you provide / consume>
Skill: <the on-demand skill to use, e.g. impeccable polish | ponytail-audit of src/data | none>
Done when: <behaviour + tests that must exist and pass>
```

## During implementation

- Launch independent agents **in one message** so they run concurrently. Use `run_in_background` when you have other
  work to do meanwhile.
- No agent runs destructive git (`reset --hard`, `clean -fd`, `checkout -- .`, `stash`, force push), and neither do
  you. Only the coordinator writes to git, and only when asked.
- No dependency or config changes without a reason the user can see. Approval is needed for new packages, `app.json`
  and plugin changes, schema or `.novel.json` format changes, and anything from the "ask first" list in
  `DESIGN.md`/memory (Sync, Premium, rank, notifications, avatar).
- **Worktrees (`isolation: worktree`) are opt-in, not a default.** Claude Code branches the worktree from the
  repository's default branch (`main`), not from `react-native`. It also lacks `node_modules` and any uncommitted work,
  and the repo root is `Novel Builder/`, not `scriptor_app/`. Use a worktree only for a genuinely high-risk experiment.
  Before relying on it, confirm inside it that it is on the right base (`git log -1`, `git merge-base`), and run
  `npm install` there. Otherwise keep agents in this tree with disjoint file lists.
- If an agent reports needing a file outside its list, decide: give it the file (once no one else holds it), assign the
  change to the file's owner, or do it yourself.

## Integration

1. Collect every report. Read every changed file (`git diff`, `git status` for new files). Don't trust summaries alone.
2. Check that each agent stayed inside its list: `git status --short` against the briefs.
3. Resolve mismatches at the joining points: signatures, imports, duplicate helpers (keep one).
4. Run the full checks once, after integration:
   - `npx tsc --noEmit && npx tsc --noEmit -p test` (or `npm run typecheck`)
   - `npx jest`
   - `npx expo lint`
   - `tool/android.sh check` (typecheck, tests and Expo checks) for anything beyond a small change.
5. Send `scriptor-qa` the checkpoint, the list of agents and their files, and the goal. Give it the code, not your
   conclusions. It reviews with `ponytail-review` every time. Ask for `ponytail-audit` too only when a wider area needs
   auditing. Fix its **Must fix** findings (yourself or via the owning agent) and re-run the checks.
6. Device check, **sequentially, by the coordinator only**, under the memory rules:
   - emulator via `tool/android.sh emulator`, with `-s emulator-5554` on every adb command;
   - the phone only at the end of a phase, with the user's go-ahead, via `tool/android.sh phone` + `install-phone`;
   - never uninstall, and only look, never change the user's novels.

## Final report to the user

- What was implemented.
- Which agents took part, and what each did.
- Files modified and created.
- Checks run, with real results (and what was **not** run or verified, including device checks).
- Unresolved issues and QA findings not fixed.
- Changes needing the user's approval.

## Monitoring

- CLI: the agent panel under the prompt shows running agents. `/tasks` lists them; Enter opens a transcript. Ctrl+B
  moves a running task to the background.
- VS Code: the docs confirm a "Run in background" option. Other panel details are unverified. Each agent's final
  report goes to the coordinator, which relays it.
- Background agents' permission prompts surface in the main session, labelled with the agent's name.
