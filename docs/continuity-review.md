# The continuity review (Prompt 43)

**Written:** 2026-10-22.

**Code:**
- `src/modules/review/collect.ts`: every check's warnings in one shape (`collectWarnings`), with the author's decisions (`withStatus`); pure.
- `review/useReview.ts`: the same, live; it runs the manuscript check.
- `review/ReviewPage.tsx`: the **Continuity review** page (`/project/:id/review`, in the sidebar after Record check).
- `continuity/types.ts`: the decision kinds (`DECISION_KINDS`, `DECISION_LABELS`, `closes`, `decisionWord`).
- `continuity/service.ts`: `resolve` accepts every kind and records `updatedAt`.
- `continuity/audit.ts` and `timeline/review.ts` (`withDecisions`): "needs review" keeps a finding open.
- `continuity/useManuscriptCheck.ts`: the manuscript check, shared by this page and the canon and continuity markers.
- `continuity/components/DecisionNote.tsx`: a decision shown beside its finding on the Record check, Journeys, Ability paths and a canon statement's details.
- `canon/overlay.ts` (`canonKey`): one key for a canon flag's decision, everywhere.
- `tutorial/topics.ts`: a lesson for the page.

**Tests:**
- `review/review.test.ts`, 4 tests:
  - **Warning creation:** six checks' warnings, the confirmed/possible difference, links and context.
  - **No warnings from absent information.**
  - **Status changes, with notes, kept** across a fresh service.
  - **Needs review and gone decisions** for manuscript findings.
- "The continuity review…" in the Visualize section of `e2e/smoke.mjs`: 15 checks.

## What it gathers

Only warnings the app's deterministic checks already raise. Each check keeps its own rule and raises a finding only when the records hold what that rule needs. The review adds no check of its own and guesses nothing.

| Check | What it looks at | Its own page |
|---|---|---|
| Record check: canon and continuity rules (Prompt 42) | what the structured records say about each other | Record check |
| Record check: references, values, duplicates (Prompts 34, 36) | deleted records still referred to, fields that name nothing, values that do not fit, views on unsuitable fields, look-alike records | Record check |
| Timeline review (Prompt 23) | dates, ages, travel times, two places at once | Timeline review |
| Canon | statements that may disagree, with each other or a codex field | Canon |
| Secrets and knowledge (Prompt 27) | acting on, or learning from someone, what is recorded as not known | Visualize → Secrets and knowledge |
| Journeys (Prompt 40) | journeys against their dates, speeds and each other | Visualize → Journeys |
| Ability paths (Prompt 38) | requirement cycles, exclusions, abilities that can never be gained | Visualize → Ability paths |
| Continuity check of the manuscript | the text against tracked rules and codex fields, matched by words | Continuity |

**Not gathered:** the plot threads' notes about pacing (a thread quiet for a while, a resolution overdue). They are about pace, not about records that disagree, and stay on the Plot threads page. The page says so under **What was checked**.

## Organised

- **By severity** (Critical, Warning, Info), then **by category** within each. Or **by category first**, then severity.
- **Categories:**
  - canon status and statements;
  - characters and their status;
  - dates and time;
  - connections and relationships;
  - places and travel;
  - items and possession;
  - abilities and powers;
  - secrets and knowledge;
  - references and links;
  - values and fields;
  - records that look alike.
- **Filters:**
  - **Show:** what is to look at (open or needing review), what is decided, or everything;
  - certainty, severity, category, check, and words.
- The grouping and filters are kept in the page address.

## A confirmed data error, or a possible inconsistency

Every warning says which it is, as a mark of its own and in words:

| | Means | Which warnings |
|---|---|---|
| **Confirmed data error** | The records, as stored, cannot all be right: a value that is impossible or names nothing, or records that certainly contradict each other. Whether the story should change is still the author's call (a flashback can explain an appearance after a death). | the record check's rules; references, fields, values and view settings; the timeline review; secrets and knowledge; journeys' and ability paths' "problems"; canon statements the author linked as contradicting, or marked Conflicting with nothing paired |
| **Possible inconsistency** | Read from wording or likeness, or something that may well be meant. The records may agree after all. | records that look alike; canon statements noticed only because their wording differs; journeys' and ability paths' "notes"; everything the manuscript check finds by matching words |

**Severity is separate.** A confirmed error can be Info (a view setting), and a possible inconsistency can be Critical: the manuscript seems to show a dead character acting.

## Each warning

- its severity, certainty and check;
- its **title** and message;
- **the rule**, in words;
- **because**: the data it rests on;
- **records:** each affected record, opening where it is kept (the timeline, a character's profile, the Codex, the editor…);
- other places to open it: the canon statement, the passage in the manuscript, the tracked status, a character's secrets;
- **in context:** the visualization that shows it, with the canon and continuity markers on and the record selected (the timeline for an event, the relationship map for a relationship, the knowledge graph otherwise; Journeys, Ability paths or Secrets and knowledge for theirs);
- **where it is checked:** the check's own page.

## Statuses

**Set the status…** offers:

| Status | Means | On the list to look at? |
|---|---|---|
| Open | no decision | yes |
| **Needs review** | flagged to come back to | **yes**, marked |
| **Resolved** | dealt with: settled, or fixed somewhere the records do not show | no |
| **Intentional** | meant: the story explains it | no |
| **Ignored** | not worth acting on | no |

**Notes:** each status but Open takes an optional note ("Flashback", "Ask my editor").

**Changing a status:**
- It changes the one decision in place, and records when.
- **Open** withdraws it.

**Where decisions are kept:**
- **Storage:**
  - Stored with the continuity decisions (`continuityResolutions`) under the warning's own key, so they are copied, backed up and synced like those.
  - Keys name records by id, one segment each, so a copy of the novel re-points them.
- **One decision, every page.** Each check's page reads the same decisions:
  - **Timeline review, the record check's rules and look-alike records, secrets and knowledge, the manuscript check:** a closing decision takes the finding off their open lists; "needs review" leaves it there.
  - **The record check's other sections, Journeys, Ability paths, a canon statement's details:** the decision is shown beside the finding. On the record check, a closed one is no longer counted as to look at.
  - **The canon and continuity markers** leave closed findings out.
- **Ignored** is what the other pages call **Dismiss** / **Dismissed**: the same stored decision (`dismissed`).

**No longer raised:** decisions whose warning the checks no longer raise (the records changed) are listed, to remove. A manuscript finding's decision is judged gone only once the manuscript has been checked.

## What never happens

- No record, canon status or word of the manuscript is changed. Only the decisions are written (tested: every record is the same before and after).
- No warning is made from a missing date, place, speed or tracked rule.

## Data model

- `Resolution.kind` adds `resolved` and `review` to `intentional` and `dismissed`. `Resolution.updatedAt` is optional. Older rows read as before.
- **No new tables; still version 34.**

## Limits

- **The manuscript check** reads every chapter's text, so its warnings arrive a moment after the others. **What was checked** says when it ran, with **Check the manuscript again**.
- **"Needs review" on other pages:**
  - Pages with their own decisions (the timeline review, the continuity page) list it as open without the mark.
  - The Record check, Journeys, Ability paths and a canon statement's details show it beside the finding.
- **Bulk changes** (setting many warnings at once) are not offered; each warning is decided on its own.
