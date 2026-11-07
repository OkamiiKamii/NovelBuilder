# Ability trees and evolution paths (Prompt 38)

**Written:** 2026-10-22.

**Code:**
- `src/modules/abilities/paths.ts`: what is drawn (`abilityTree`), what does not add up (`pathProblems`), the tree's shape (`treeLayout`), and one ability's paths (`pathsOf`); pure.
- `visualize/AbilityPathsView.tsx`: the **Ability paths** view, and `AbilityPathDetails` beside it.
- `connections/types.ts`: seven path types.
- `codex/types.ts`, `codex/capabilities.ts`, `codex/components/KindUsesEditor.tsx`, `codex/typePresets.ts`: a kind of record "In the ability tree".
- `progression/track.ts`, `trackService.ts`, `components/ProgressTracker.tsx`, `model/connections.ts`: a progression change can name a system's own ability.

**Tests:**
- `abilities/paths.test.ts`, 12 tests:
  - sources, path meanings, ranks, holders and acquisitions;
  - requirement cycles; abilities that can never be gained; clashes with exclusions; unreadable rules; blueprint branch loops; loops and one-thing fusions as notes; holder notes; alternatives;
  - layout, and one ability's paths.
- `progression/track.test.ts`: a change naming a system ability is checked, connected, and copied.
- "Ability paths: two systems and a kind…" in the Visualize section of `e2e/smoke.mjs`: 15 checks.

## What is drawn

A thirteenth Visualize view, **Ability paths**.

**Nodes:**
- **Every item of every system blueprint,** whatever its group (skills, classes, titles…). Any number of systems sit side by side; each ability says which it comes from ("Ember Arts · Skills"). Nothing assumes one progression system.
- **Every codex record of a kind set "In the ability tree"** (Codex → Categories & fields → Visualizations). The Spells and Techniques presets come set; any kind can be set.
- **Any other codex record at an end of a path you record** (a sword that upgrades to another).
- **Never a character.** A path with a character at one end is listed as not drawn. Who holds what is read from sheets and progression.

## Paths, each as what it is

| Path | Recorded as | Means | Drawn |
|---|---|---|---|
| Prerequisite | "Prerequisite for" | must be held first | solid line, arrow |
| Alternative | "Alternative prerequisite for" | any one of these is enough | dashed |
| Requirement rule | a blueprint item's rule naming another ("Skill: Fire Lance") | must be held first, as the rule says | dotted |
| Upgrade | "Upgrades to" | one becomes the other, improved | thick line |
| Evolution | "Evolves into" | one becomes the other | thick line |
| Fusion | "Fuses into" | several become one | long dashes |
| Replacement | "Replaced by" | one takes the other's place | dash-dot |
| Branch | a blueprint item's "branches from" | where the blueprint places it | thin line |
| Mutually exclusive | "Mutually exclusive with" | not both | red dashes, no arrow |
| Your own | any other kind of connection between two abilities, and link fields | what you say it means | its own words |

- **Only prerequisites, rules and alternatives** decide whether something can be gained. An evolution, an upgrade or a branch is never read as a prerequisite.
- **Branches and alternative paths** are what they look like: several paths out of one ability, or several ways into one.
- **Each line has a colour and a dash pattern,** and the legend names both, so nothing is told by colour alone.

## Details beside the view

Select an ability (click, or Enter):
- **its source and rank:** the blueprint's rank, or a kind's rank field (Prompt 36);
- **its requirement rule** and **limits:** costs and cooldown;
- **who holds it:** on their system sheet, in their latest snapshot, or as of the end by their progression (Prompt 37);
- **when each holder gained or lost it,** from progression changes, or first held in a snapshot;
- **every path, in words.**

**Adding and removing paths:**
- **Add a path:** choose which way, the kind (or "Your own…", any words), and the other ability.
- A path is a typed connection saved through the connections service. So it is also in Every connection, the knowledge graph and the Record check, and can have a status and a time when it holds (Prompts 8 and 34).
- Recorded paths can be removed from here. Those read from a blueprint are changed in the blueprint.

## What does not add up

Read from the paths, said and never changed. Each names the records it rests on, and those are marked in the tree ("!" for a problem, "•" for a note).

| | Rule | Example |
|---|---|---|
| Problem | A cycle of requirements | "A cycle of requirements: Ouro → Boros → Ouro. None of them can ever be gained while each requires the next." |
| Problem | Requiring what is excluded, directly or through what it requires | "Iron Fortress requires both Iron Stance and Ember Stance, which are mutually exclusive, so it can never be gained." |
| Problem | Requiring what can never be gained, or with no alternative that can | "Tail Whip can never be gained: it requires Boros, which can never be gained." |
| Problem | A requirement rule that cannot be read | "Nova's requirement rule “levl >= 5” cannot be read: Nothing here is called “levl”." |
| Problem | Blueprint items that branch from each other in a loop | |
| Note | A loop of upgrades, evolutions, fusions or replacements (may be meant: a form taken and left again) | |
| Note | A fusion of one thing | |
| Note | A holder without what something requires, unless it became this one (upgraded, evolved…) | "Mira holds Flame Wall without Fire Lance, which it requires." |
| Note | A holder holding two things that exclude each other | |

## The drawing

- **Layout:** layers from the top, each ability below what leads to it. A loop is broken where it closes and drawn bending back.
- **Moving around:** zoom and pan; arrow keys move between abilities, Enter selects, F shows only one ability's paths.
- **Filters:**
  - by source;
  - by kind of path;
  - focused on one ability;
  - "Also draw the N with no paths";
  - Search by name;
  - "Involving character" marks what that character holds.
- **The list form** gives every ability, by source, with its paths in words and who holds it.
- **What does not add up** is listed under both forms.

## Linked to the actual records

- **A progression change** (Prompt 37) can name a system's own ability ("Its ability in a system") or a codex record ("Its codex entry"). Holders and acquisitions are read from these, so a change recorded on a character's Progression tab shows here.
- **Copies:** a copy of the novel points its changes at the copy's own abilities.
- **Deleting a blueprint item** leaves the changes and paths that named it to the Record check.

## Data model

- **No new tables; still version 32.**
- **New optional data on existing records:**
  - `KindUses.tree` on a category;
  - `ProgressChange.abilityId` on a change.
- **Seven new connection types:** `prerequisite-for`, `alternative-for`, `upgrades-to`, `evolves-into`, `fuses-into`, `replaced-by`, `excludes`.

## Limits

- **Requirement rules** are read for the items they name ("Group: Name", in the same blueprint).
  - Levels and numbers in a rule are checked for misspelt names, but are not worked out when deciding whether something can ever be gained.
  - A rule naming several items is read as requiring each of them; an OR between them is not told apart. Record such a choice as alternative prerequisites instead.
- **One set of alternatives per ability.** All of its "Alternative prerequisite for" paths are one choice; there is no "(A and B) or (C and D)".
- **A fusion's inputs** are all of its "Fuses into" paths: one recipe per ability.
- **Holders are as of the end of the story.** The state at a chapter is on each character's Progression tab.
- **Very wide trees** need zooming; the list form reads better there.
