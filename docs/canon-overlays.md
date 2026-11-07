# Canon and continuity overlays (Prompt 42)

**Written:** 2026-10-22.

**Code:**
- `src/modules/canon/checks.ts`: the record check's eight canon and continuity rules (`checkRecords`); pure, deterministic, reads only.
- `canon/overlay.ts`: what to mark on each record: its canon status, and the open findings of every check (`canonOverlay`, `mergeMarks`, `badgeOf`, `markWords`); pure.
- `canon/useOverlay.ts`: the same, live, while the markers are on; it runs the continuity check of the manuscript.
- `canon/components/MarkBadge.tsx`: the badge drawn on a mark, a node, a line or a cell.
- `visualize/CanonMarks.tsx`: the switch, the legend, every marker in words, and the details section.
- Markers drawn in `timeline/components/TimelineChart.tsx`, `graph/components/KnowledgeMap.tsx`, `relationships/components/RelationMap.tsx` and `plot/components/ThreadLanes.tsx`, and listed in each view's list.
- `integrity/RecordRules.tsx`: the rules on the **Record check** page, with decisions.
- `continuity/audit.ts`: one condition, so decisions about these findings are not listed as stale manuscript findings.

**Tests:**
- `canon/checks.test.ts`, 6 tests:
  - each rule, with the data behind it;
  - nothing raised without the data a rule needs;
  - the same findings and keys in any order, with no record changed;
  - decisions kept, reopened, and not called stale;
  - an alternate history;
  - the markers.
- "Canon and continuity markers…" in the Visualize section of `e2e/smoke.mjs`: 14 checks.

## Canon states: the project's own

The project already had canon states, so none were added and nothing new is stored.

| The prompt's state | Here | Where it is set |
|---|---|---|
| Confirmed | **Canon** (a connection: **Confirmed**) | events, connections, canon statements |
| Provisional | **Provisional** | the same |
| Disputed | **Conflicting** (a connection: **Disputed**) | the same |
| Non-canon | **Non-Canon** (a connection: **Invalid: not canon**); also **Retconned** (**Invalid: retconned**) | the same |
| Alternate branch | An **alternate history**'s status (Alternate Canon, Non-Canon, Experimental, Abandoned), or a **forked timeline**'s | Alternate histories; Story branches |

Records with no status of their own (characters, chapters, relationships, plot threads) are marked only by what the checks find about them.

## Markers in four views

Visualize → **Timeline**, **Knowledge graph**, **Relationship map** and **Plot board**:
- **Off until asked for:** tick **Canon and continuity markers**. The setting is kept in the page address, so it follows to the other views, a reload and a saved view.
- **What is marked:**
  - **Timeline:** each event.
  - **Knowledge graph:** each record, and each line (all the connections it holds). A folded group carries its members' markers.
  - **Relationship map:** each character, each relationship and each connection.
  - **Plot board:** each cell, from its events and its chapters and scenes.
- **How a marker reads.** A glyph, never colour alone:

  | Glyph | Meaning |
  |---|---|
  | `?` | Provisional |
  | `≠` | Conflicting / Disputed |
  | `↺` | Retconned |
  | `✕` | Non-Canon |
  | `A` | Alternate branch: an event of the alternate history shown that goes differently there, or happens only there |
  | `!` | Something to check; a number counts them. Red when critical, amber for a warning, blue for info. |

- **For a screen reader:** the same words are added to the name of whatever the marker sits on ("Canon status: Retconned. 2 to check").
- **Without the drawing:**
  - **Every marker in words** lists every marked record of the view, each finding with its rule and the data behind it.
  - Each view's list shows the same, in a column or under each item.
- **Selecting a record** shows, in its details, its status with what it means, and each finding:
  - its severity;
  - **the rule**;
  - **because**: the data it rests on;
  - a link to the page where it is decided.
- **The status line** counts the marked records and says when the manuscript was last checked, with **Check the manuscript again**.
- **In a forked timeline**, the bar says so: every marker is about that timeline only.

## Where the findings come from

Every check keeps its own rule, words and decisions. The markers only gather the findings still open:

| Source | What it checks | Decided on |
|---|---|---|
| **Record check** (new rules, below) | structured records against each other | Record check |
| **Timeline review** (Prompt 23) | dates, ages, travel, two places at once | Timeline review |
| **Canon** | statements that may disagree, with each other or a codex field | Canon |
| **Continuity check** | the manuscript's text against tracked rules and codex fields; run when the markers come on, and again when records or decisions change | Continuity |

## The record check's new rules

Record check → **Canon and continuity rules**:
- **How each rule is shown:** with what it needs. A finding is raised only when the records hold that data.
- **Deterministic:** the same records give the same findings, with the same keys, every time (tested, in any order).
- **The manuscript's text is not read.**

| Rule | Raised when | Severity |
|---|---|---|
| **Rests on a set-aside event** | Something in play (Canon, Provisional or Conflicting) comes after, is dated from, begins or ends at, or is established at an event marked Retconned or Non-Canon. This covers events, connections, canon statements, progression changes and journeys. | Warning |
| **Set aside, but still told** | An event marked Retconned or Non-Canon still lists the chapters or scenes telling it | Info |
| **Allied and at war at once** | An "Allied with" and an "At war with" between the same two records, both in play, whose times certainly overlap. No time given holds throughout. | Warning |
| **Appears after their recorded death** | A character tracked as Deceased from a chapter (Continuity → Tracked), until it says they return: <br>• appears in a later chapter or scene (appearance record); <br>• takes part in an event told only later; <br>• or has a relationship stage that starts later. | Critical |
| **Ends before it begins** | A connection's end is on the same scale as its start, and earlier | Warning |
| **Date not in the calendar** | A month, day or hour the calendar lacks, on a connection, a progression change or a journey. Events are left to the timeline review. | Warning |
| **Timed by something that is gone** | A connection, progression change or journey timed by a chapter, scene or event that was deleted. An event an alternate history leaves out is that history's business, not a deleted record. | Warning |
| **Retconned with nothing in its place** | A statement marked Retconned names no replacement, a deleted one, or one itself set aside | Info |

**Each finding:**
- says what was found and **because**: the data it rests on, in words;
- links to the records to open, the canon statement, or the tracked status.

**Decisions:**
- **Mark as intentional…** (with why: a flashback, a ghost…) or **Dismiss** takes it off the open list and off the markers.
- **Reopen** brings it back.
- Decisions are stored with the continuity decisions under `records|…`, so they are copied, backed up and synced like those.
- A decision whose finding is no longer raised is listed, to remove.

**Since Prompt 43**, every finding can also be decided on the **Continuity review** (`docs/continuity-review.md`):
- resolved, intentional, ignored or needs review;
- the markers leave out what is decided there (canon statements included), and keep what needs review.

## What never happens

- **No canon status, record or word of the manuscript is changed** by a marker, a check or a decision (tested: every record is the same before and after).
- Nothing is guessed. A time on another scale (a chapter against a date) is not compared. A missing date raises nothing.
- No AI: every rule is a fixed comparison of stored values.

## Limits

- **Manuscript findings** need the continuity check, which reads every chapter's text. On a long book the markers from it arrive a moment after the others; the status line says when.
- **"Allied and at war"** is the only pair of opposite connection types checked. Your own connection types have no opposites.
- **"Appears after their recorded death"** reads chapters, not story dates. An event told after the death but happening before it (a flashback) is raised; mark it intentional.
- **The scene board** (`/board`) has no markers yet. The plot board in Visualize does.
