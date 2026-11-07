# Secrets, beliefs and who knows what (Prompt 27)

**Written:** 2026-10-21.

**Code:**
- `src/modules/characters/types.ts`: `KnowledgeRecord`, `KnowledgeNeed`, `AWARENESS` (the states), added to `CharacterSecret` as `records` and `needs`
- `characters/knowledge.ts`: everything worked out from the records; pure, reads only
- `characters/service.ts`: `saveRecord`, `removeRecord`, `moveRecord`, `saveNeed`, `removeNeed`; copies, forks and character deletion
- `characters/components/KnowledgePanel.tsx`: the editor, on each secret on a character's **Secrets** tab
- `characters/components/KnowledgeChart.tsx`: the chart
- `visualize/KnowledgeView.tsx`: the **Secrets and knowledge** view (`/visualize/knowledge`)

**Tests:**
- `characters/knowledge.test.ts`, 17 tests: unknown, partial, false and changed states; story time; the spread; the checks
- the "knowledge records" block in `characters/characters.test.ts`, 7 tests: saving, validation, ordering, deletion, copies, older rows
- "Secrets and knowledge" in the Visualize section of `e2e/smoke.mjs`: 17 checks

It is optional: a secret with no records works exactly as before.

## What is kept apart

For each secret:
- **What is true:** the secret's own description, as before.
- **What each character holds**, one record at a time. A record says:

| Field | What it holds |
|---|---|
| **What they hold** | Knows · Knows part of it · Believes it, unconfirmed · Suspects · Believes something false · Unaware |
| **Their version** | The part they know, what they suspect or believe, or the false thing they believe instead. Kept apart from what is true. |
| **Chapter or scene** | Where the reader sees it. |
| **Event** | When it happens in story time. |
| **How they came by it** | The author's words: overheard, a letter, worked it out. |
| **From whom** | Who told or showed them. |

All of these but the character and the state are optional.

**"Not recorded" is not a state.** A character with no record is shown as nothing recorded, never as unaware.

## How it changes

- **A change in what someone knows is a new record.** The earlier ones stay as they were. Mira can be unaware in Chapter 1, suspect in Chapter 3, and know in Chapter 5, all three kept.
- **Order.** A character's records are kept in the order things happen to them, and can be moved earlier or later. Reading order and story time can differ (a flashback), so the order is the author's, not worked out from the chapters.
- **At a chapter or event, the record in force is their last one placed at or before it:**
  - A record with no chapter is in their history, but is not taken to hold at any chapter. The same goes for one with no event, in story time.
  - **In story time, before means before for certain.** Two events on the same day, or an undated one, are not known to be in either order.
- **Now** is their last record.

## The simple lists

Who knows, suspects or is unaware, and "Does … know?", work as before for characters with no records.

**A character with records is kept in their records,** not in the lists:
- **The first record takes them out of the lists.** If the list said something else, that is kept as an earlier record with no chapter, for the author to place or remove. If it said the same, it is simply replaced.
- **The lists no longer offer them,** and the card says who has a recorded history.
- **The secret's own character keeps their "Does … know?" answer;** their records, once they have some, are what count.

## Seeing it

**On the Secrets tab,** each secret has **How knowledge spreads**:
- each character's records, in order, with where, how and from whom;
- a form to record more;
- the marks of where someone acts on it;
- a link to the view.

**In Visualize → Secrets and knowledge**, one secret at a time:
- **What is true**, and **who knows what now:** grouped by state, each with their version. Answers from the simple lists are marked "no history".
- **The chart:** a row for each character named, a column for each chapter or scene a record or mark is placed at, and **Now**.
  - Each cell shows the record in force there, by a word, a colour and a pattern, named in the legend.
  - Marks in the cells: a dot where a record is made, a diamond where the author marked that they act on it, and an arrow from teller to learner.
  - The columns for where the secret first figures and where it is revealed are labelled.
  - **Along:** the reading (chapters and scenes) or story time (events). Records with no place on the chosen axis are listed under the chart.
- **Keyboard:** the chart is one stop in the tab order. The arrow keys move between cells, and Enter shows the record a cell rests on, with buttons to open the character and the chapter or event.
- **List:** the same, point by point, as text.
- **Phones:** the chart scrolls inside its box.

The secret and the axis are in the page address, and saved views keep them.

## Checks: only from a stated rule

**Nothing is flagged unless the author has given the rule something to test.** There are two rules:

| Rule | What it says | What it needs |
|---|---|---|
| **Acts on it while not knowing it** | A character marked as acting on a secret at a point must not be recorded there as unaware, or as believing something false. | The author's mark ("Where someone acts on it"), and a record of theirs at or before that point, with nothing of theirs later that could already be in force there. |
| **Learns it from someone who did not know** | A character recorded as learning it from someone cannot learn it from a person recorded as unaware of it at that point. | A record saying who they learned it from, placed at a chapter or event, and a record of the teller's at or before it. |

**What is never flagged:**
- Knowing part of it, suspecting it, or believing it unconfirmed.
- Having no record.
- Learning it later. A "knows from Chapter 5" record does not say they did not know before.
- A later record with no chapter, which could already hold.

**Findings are suggestions.** Each says the rule and the records it rests on. The author fixes the records, or marks a finding intentional (with why) or dismisses it. Decisions are kept with the continuity decisions, under keys starting `knowledge|`, and can be reopened. Checking and deciding change nothing in the records (tested).

## Data

- **Where it is stored:** `records` and `needs` live inside each `characterSecrets` row, so there is no new table and no schema change. Older rows without them read as empty.
- **Copies:** a copied novel's records point at its own characters, chapters and events.
- **Forks:** a fork at a chapter starts without records and marks placed in later chapters.
- **Deleting a character** removes their records and marks from other secrets. A record of someone who learned it from them keeps everything but who it was from.
- **Access:** secrets stay with the owner and co-authors, as before.

## Limits

- **One secret at a time** in the view. There is no chart of every secret at once.
- **Only two rules.** Other checks (someone knowing before the secret first figures, the reader knowing more than any character) are not made.
- **Story-time comparisons** use dates only: "Comes after" links between undated events are not used.
- **Deleting a character from the Codex** (rather than from Characters) leaves their records in other secrets, as it already left them in the lists. They are not shown and not checked.
