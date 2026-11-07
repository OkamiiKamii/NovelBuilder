# Character progression, change by change (Prompt 37)

**Written:** 2026-10-22.

**Code:**
- `src/modules/progression/track.ts`: categories, changes and their wording, and what a character is like at a point (`progressAt`, `changeLog`, `progressSummary`); pure.
- `progression/trackService.ts`: the tracker service and its registry hooks (copy, fork, backup).
- `progression/components/ProgressTracker.tsx`: one character's progression, on the profile's new **Progression** tab and at the top of the Character progression page.
- `progression/components/TrackedCategories.tsx`: **What is tracked**.
- `model/connections.ts`: each change becomes a connection (`progress`) to its chapter, scene or event, and to the codex entry it names.
- `characters/lifeHistory.ts`: changes in a character's history.
- `visualize/summaries.ts` and `VisualizePage.tsx`: the Character progression view.
- `integrity/*` and `codex/service.ts`: deleted chapters, events and entries.

**Tests:**
- `progression/track.test.ts`, 13 tests:
  - characters with no progression recorded, in a novel that tracks nothing and in one that tracks levels and abilities;
  - changes over time: in reading order, in story time against reading order, with no time known, off a ladder;
  - recording rules, what is tracked, connections, history, deletions, copies and forks.
- "Progression change by change…" in the Visualize section of `e2e/smoke.mjs`: 19 checks.

## The idea

How a character changes is recorded as a list of changes, each at the point it happens: a level reached, a rank, a title won, an ability gained, equipment lost, a transformation, a class or job taken up, a milestone, a restriction placed or lifted, a cost paid.

**Nothing is assumed.**
- A novel tracks nothing until the author chooses what to track.
- A character shows only what is recorded for them. A character with nothing recorded has no level, no statistics and no empty rows; at most a quiet line says what could be recorded for them.

## What is tracked

Chosen in **What is tracked…** (on the Progression tab). Each category has a name, one of four shapes, and optionally the characters it applies to (none ticked: every character).

| Shape | Each change | Suggested categories |
|---|---|---|
| One value at a time | sets it ("Level set to 4") | Level, Rank, Class or job |
| Several named values | sets one by name ("Strength set to 6") | Attributes |
| Things gained and lost | gains or loses one ("Gained Fire Lance") | Titles, Abilities, Equipment, Transformations, Restrictions |
| Moments | something that happened ("First kill") | Milestones, Costs paid |

- **A ladder:** a one-value category can have steps in order, lowest first (Squire, Knight, Captain). The value then shows where it sits ("Knight, 2 of 3"). A value off the ladder is kept as written and said ("not one of its steps").
- **Your own categories:** any name, in any of the four shapes (Cultivation realm, Oaths, Scars…).
- **A shape stays fixed** once changes are recorded in the category, so none of them stops making sense.
- **A category in use is archived, never removed.** No new changes go in it; those recorded are kept and still read. A category with nothing recorded can be removed.

## Recording a change

On the character's Progression tab (or the Character progression page), **Record a change**:
- **What changes:** the category. Only those that apply to this character are offered.
- **The change itself:** what it is set to, which value, what is gained or lost, or what happened.
- **Its codex entry,** optionally, for something gained, lost or happening (the Ember Crown). Its name is kept, so the change still says what it was if the entry is later deleted.
- **When:**
  - **When is not known** (the default);
  - **Before the story**;
  - **a chapter or scene** (reading order);
  - **an event** (story time).
- **Cost and note,** optionally, in the author's words.

The values themselves are never judged; "over nine thousand" is a level if the author says so. A change is edited where it is listed, and deleted after asking.

## What they are like at a point

**As of** the end of the story, a chapter or scene, or an event:
- **At a chapter:** the changes placed at or before it in reading order (and before the story) count.
- **At an event:** the changes placed at or before it in story time count.
- **Reading order and story time are never compared** (Prompt 8): a chapter can't be placed against an event, since a flashback can be on either side. A change in the other order, or with no time known, is listed under "Not placed against …", never applied or guessed at.
- **At the end of the story,** every change has happened. Where the latest of a value can't be told, because it changed both in story time and in reading order, the value is shown with the other one and says "which comes later cannot be told".
- **Things once held and since lost** are listed as such.

**Changes, in order:**
1. before the story;
2. story time, by date;
3. reading order, by position;
4. no time known.

Within one point they keep the order they were recorded in, and a value set says what it was before ("Level set to 4 (was 1)").

## Connected to the story

- **Every connection:** each change is a connection from the character to its chapter, scene or event, and to the codex entry it names. It is listed both ways:
  - "Changes (Level set to 3) in Ch 2: The Vault";
  - "Mira changes (Level set to 3) in this";
  - "Mira gained this".
- **The knowledge graph:** these appear as connections of the kind "Progression change"; the Connections layer can hide them.
- **Character history** (Visualize):
  - each change is a "Progression" line in reading order, in story time, or with no time given, as recorded;
  - a change at an event is a line of its own, not taking part in the event.
- **The profile's History tab** lists changes among its other lines, placed the way that tab places events. A change at a chapter goes at that chapter; one at an event goes at the first chapter that tells it; one with no time known goes last. Each line opens the Progression tab.
- **Character progression view** (Visualize): who has anything recorded, with where they stand at the end ("Level 4 · Rank Knight · Abilities: Ward of Ash · Equipment: Ember Crown") and how many changes. Nobody else is listed.

## When records go

- **A deleted chapter, scene or event:** the change is found by the Record check (as "a progression change"). **Take this reference out** keeps the change and its words; its time becomes "when is not known".
- **A deleted codex entry it names:** the change keeps its words and stops linking to it.
- **A deleted character:** their changes go with them. Nobody else's are touched.
- **Copies, backups and imports:**
  - carry categories and changes, pointing at the copy's own chapters, events and characters;
  - a fork keeps the changes at chapters it has reached, and every change in story time or with no time known.

## Beside system sheets

Novels with a worked-out system (levels and attributes from a blueprint, skills on a sheet) keep **System snapshots** and **system sheets** exactly as before; they sit below the tracker on the Character progression page. The tracker is for any novel, whatever its genre.

## Data model

- **Tables:** `progressCategories` and `progressChanges`. Database version 32 adds the two tables; nothing existing is migrated.
- **`ProgressChange.at`** is a validity anchor (Prompt 8):
  - `{ kind: 'node' }`, `{ kind: 'event' }` or `{ kind: 'date' }`;
  - `null` for before the story;
  - a date of unknown precision for "when is not known".
- **The shared model** gains `progressCategories` and `progress`, and the connection kind `progress`.

## Limits

- **Changes are not worked out from system sheets or snapshots,** and snapshots are not worked out from changes. The two are kept apart, and say different things.
- **Placement:**
  - A change is at one point. A span ("a transformation from Chapter 3 to Chapter 5") is two changes: gained, then lost.
  - "Before the story" is the only point before the first chapter. There is no earlier ordering.
- **Not checked:**
  - Whether a thing lost was ever gained.
  - Whether a value goes up or down.
