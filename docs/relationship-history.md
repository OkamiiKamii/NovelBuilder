# Relationship history and chapter-aware changes (Prompt 25)

**Written:** 2026-10-21.

**Code:**
- `src/modules/relationships/types.ts`: new optional stage fields
- `relationships/service.ts`: `recordChange`, `moveStage`, `addStage(…, { unknown })`, checks in `updateStage`, copying
- `relationships/timeline.ts`: ordering with unknown points, `stageAt`, ranges, `stageDifferences`
- `relationships/components/RelationDetails.tsx`: "How it evolved", and the new fields on each stage
- `timeline/components/DateFields.tsx`: the compact date fields, now shared with the Alternate histories page

**Tests:**
- `relationships/history.test.ts`, 7 tests
- the existing relationship tests, unchanged and passing
- the relationship history checks in the Visualize section of `e2e/smoke.mjs`, 4 checks

## How a relationship's history is kept

**A relationship is a list of states (stages).** Each says how things stand from its point on.

**Recording a change adds a stage; it never changes another.** `recordChange` appends a new stage, starting as things stood, with the changes given. The **Add stage** button does the same, and the new stage is then edited.

**The required test:** a relationship goes Friends → Rivals (chapter 3) → Enemies (chapter not said) → Allies (chapter 6). After each change, every earlier stage is byte-for-byte what it was. A correction to one stage (editing it in place) changes only that stage (tested).

## When a change happens

Each stage can say when, on two separate axes (Prompt 20), never one worked out from the other:

| Axis | Choices | Stored as |
|---|---|---|
| Where the reader meets it | Start of the story, a volume/arc/chapter, or **Not said** | `startNodeId`, or `startUnknown: true` |
| In story time | **Not said**, **at an event**, or **on a date**: exact, around a year (approximate), or relative to an event | `storyAt: { kind: 'event', eventId }` or `{ kind: 'date', when }` |

**A stage whose chapter is not said:**
- **Ordering:** it stays just after the stage recorded before it. It can be moved earlier or later among the others; stages at a chapter keep their place.
- **No range is claimed.** Its range reads "Stage 3, chapter not said", and the stage before it reads "From chapter 3" rather than "Chapters 3+".
- **"As of chapter N" doesn't assume it has begun.** The relationship map's "As of" and `stageAt` skip it, because whether it applies at that chapter isn't known. At the end of the story it counts, as the latest state (tested).

**Story time never moves a stage** in the book's order. A date the calendar can't read is dropped rather than guessed, and so is a relative date's missing event.

## What brought it about

**Only what the author names:**
- **Brought about by** a timeline event (`causeEventId`);
- **Shown in** a chapter or scene (`causeNodeId`);
- in the author's words, as before: **Origin: what brought this about**.

**Never inferred.** A stage dated at an event is not taken to be caused by it. A test records a change at "The betrayal" and checks that its cause, scene and origin are all empty until the author fills them in. With none named, the stage says "No cause recorded. None is assumed from when it happened."

**Checked.** An event or chapter that isn't in the novel is refused with the reason.

## Seeing how it evolved

**Each relationship's details open with How it evolved.** It shows every state in order, with:
- its range, and when in story time;
- its type, feeling and title;
- **what changed** from the state before (`stageDifferences`): type, feeling, each tracked attribute each way, and a new title;
- what brought it about.

For example: "Chapters 3+ · in story time at 'The ball' (Year 10, March 3): Enemies · Hostile · changed type: Friends → Enemies; feeling: Neutral → Hostile · brought about by 'The raid', shown in The War".

**This list is the history in words,** the non-graphical way to read it; the editable stages follow below it.

## Copies and what-if copies

- **Copying a novel** re-points each stage's cause event, scene and story-time event (and a relative date's event) at the copy's own records (tested).
- **A what-if copy forked partway** keeps a not-said stage with the stage before it. It drops a "shown in" scene the copy doesn't have.

## Limits

- **The map's "As of" works by chapter only.** It doesn't yet offer "as of" a point in story time.
- **Deleted references stay.** A cause or story-time event that is later deleted shows as "an event since deleted" until the author changes it. Nothing is removed for them.
