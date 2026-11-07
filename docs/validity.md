# Facts that change over the story (Prompt 8)

**Written:** 2026-10-21.
**Code:** `src/modules/model/validity.ts`
**Used by:** typed connections (`connections/service.ts`, `LoreLink.validity`)
**Tests:** `model/validity.test.ts`, 12 tests

## The idea

Something that holds for a while has a **validity**: `{ from, until }`. Each end is a point in the story, or `null`.

| Point | Meaning | Axis |
|---|---|---|
| `{ kind: 'node', nodeId }` | From or until a chapter or scene: the way the app already anchors changes | **Reading order** |
| `{ kind: 'event', eventId }` | From or until a timeline event, covering its whole duration | **Story time** |
| `{ kind: 'date', when }` | A date in the timeline's own format (`EventDate`) | **Story time** |

What a date can be:
- **exact**, down to the minute or as coarse as a year;
- **approximate**: a month, a season, "around Year 10";
- **relative**: "2 years after the Siege";
- **unknown**.

What the ends mean:
- **`from: null`** holds from the start.
- **`until: null`** still holds (open-ended).
- **A date of unknown precision** is different: the change happened, but the story hasn't said when.
- **The start counts as included and the end as excluded.** So something that stops at the Siege, and something that starts at the Siege, hand over there without overlapping.

## Nothing is forced or guessed

- **A date covers as much time as it says.** "Year 10" is the whole year, "Summer of Year 10" the three summer months, and an exact day is that day. A date is never rounded to a precise moment it doesn't give.
- **`validAt(validity, point, context)` answers `true`, `false` or `'unknown'`.** It gives a definite answer only when the dates settle it. It answers `'unknown'` when:
  - the change falls somewhere inside the time asked about ("some time in Year 10" against "from the summer of Year 10");
  - a date is unknown or can't be worked out (relative to an undated event, or to a deleted one);
  - **the two points are on different axes.** Chapter 3 is a place in the reading and Year 11 is a time in the story, and a flashback can be on either side. They are never compared.
- **`overlaps(a, b, context)`** answers `true`, `false` or `'unknown'` the same way. Overlap is never treated as an error here; deciding what overlap means is up to the checks that use it (Prompts 23 and 40).

## History is kept

- **`connections.change(id, at, changes)`** records a change at a point. The current connection stops there, and a new one with the changes starts there: a new owner, a new faction, new wording. Nothing is overwritten.
- **`connections.end(id, at)`** records that it stopped. The connection stays, as history.
- **A later return** (rejoining the Wardens in Year 12) is its own state beside the earlier one.
- **`historyOf(states, …)`** lists every state in the order it began:
  1. open starts;
  2. story-time starts, by date;
  3. reading-order starts, by position;
  4. starts with an unknown date.
  Ties and unplaceable points keep their recorded order, and nothing is dropped.
- **`statesAt(states, …, point)`** lists those that hold at a point, each with `true` or `'unknown'`. Only the definite `false`s are left out.

## Where it applies

| Fact | How | Stored? |
|---|---|---|
| Faction membership, item ownership, location presence, any typed connection | `LoreLink.validity`, set with `create`, `update`, `change`, `end` | **Yes**, optional field; absent means always |
| Relationship states | `stageValidities(relation, order)`: each stage holds until the next begins | No: read from the existing stages, which already keep history |
| Character status and possession tracked by continuity rules | `ruleValidity(rule)` from `fromNodeId` / `untilNodeId` | No: read from the existing rules |
| Ability acquisition and character state over the story | `snapshotValidities(snapshots, order)`: each snapshot holds until the character's next one | No: read from the existing snapshots |
| Canon variants | Already kept: canon facts carry their own `history` (retcons, rewordings, status changes) | Unchanged |

**Where fictional-time anchors will be added later.** Relationship stages, snapshots and XP can only be anchored to chapters today. Optional event and date anchors for them belong to the prompts that build their views: Prompt 25 (relationship history) and Prompt 37 (progression). They will use these same types.

## Integrity

- **Points must belong to the project.** A chapter or event must exist in this project, a date must be a timeline date, and a relative date's event must exist. The service refuses anything else and says which end is wrong. Unknown dates and open ends are always allowed.
- **Copies and imports** rewrite the chapter and event ids inside validities, including a relative date's anchor event.
- **If a chapter or event used as a point is deleted**, the connection is kept. It then holds at an unknown time, and `validateConnection` reports `when it holds: <id> does not exist`. It is never silently re-dated.
- **Calendars.** Dates are read in the novel's own calendar (`story-calendar.md`), passed in the time context (`timeContext(model)` carries `model.calendar`), so the timeline and validity always agree. Without one, the standard calendar is used.
- **Bounds.** `boundsOfEvent` gives an event's start and end each as a stretch, with `open` for still going on or an end not given; `spanOfEvent` is derived from it (`timeline-spans.md`).
