# Query and filtering layer (Prompt 10)

**Written:** 2026-10-21.
**Code:** `src/modules/model/query.ts`
**Tests:** `model/query.test.ts`, 8 tests

Views ask the shared model (`contracts.md`) for records through one function, so the rules for "which records" live in one place and not in each screen.

## `select(model, filter)`

The result has three parts:
- **`items`**: records that definitely match every filter, in a fixed order (type, then name, then id).
- **`undecided`**: records that no filter ruled out but at least one **could not decide** about, grouped as `{ filter, reason, refs }`.
- **`considered`**: how many records of the asked-for types were looked at.

A record that definitely doesn't match is simply not in the result. A record the filter can't judge is **never dropped without a word**: it appears in `undecided` with a reason in plain words.

| Filter | Matches | Undecided when (reason) |
|---|---|---|
| `types` | Those kinds of record (default: all) | none |
| `ids` | Those records | none |
| `categories` | Codex entries of those categories | Not an entry: "no codex category" |
| `text` | Name contains the words, any case | none |
| `chapters { from, to }` | Something in that stretch of **reading order**: a chapter or scene itself; an event told there; an entry mentioned there or present in its plan; a thread with a development there | "not told in any chapter", "not linked to any chapter", "no development placed in a chapter", "no place in reading order"; or the range names a deleted chapter |
| `time { from, until }` | An event that happens at some moment in that stretch of **story time**, from the start of `from` up to the start of `until` | "no date that can be worked out"; "date too broad to tell against the range"; not an event: "no place in story time (only events have one)" |
| `characters`, `locations`, `factions`, `threads` | The record **is** one of them, or has a **recorded connection** to one (any connection kind, see `contracts.md`) | none: no recorded connection means no match |
| `canon` | Events by their canon status (canon when unset) | Not an event: "no canon status of its own" |
| `status`, `significance` | Events by planning status and importance | Not an event |

**Combining filters.**
- Fields combine with **AND**, and the values within one field with **OR**: `characters: [Mira, Orrin]` is either one.
- The order fields are written in makes no difference; this is tested.
- `combine(a, b)` merges two filters. For a list both set, only the values in both are kept.

**Dates are not guessed.** An approximate date is a range of **possible moments**, not a length. "Some time in Year 10" against "from June Year 10" might fall before June, so the event is undecided. An event's length (a duration, an end date, still ongoing) is added on top of its possible start. It is:
- **in** the range only if it overlaps it whichever moment its date stands for;
- **out** only if it can't reach the range at all;
- **undecided** otherwise.

**A relationship (as a record) counts as connected to the two characters it joins** (added in Prompt 14).

**"Connected" means directly.**
- A faction filter finds the faction and what is directly connected to it, such as its members. It does not find the events those members attend.
- An event that names a character is connected to that character.
- Two-step neighbourhoods are the graph's job (Prompt 33).

The reasons are worded as noun phrases ("no date that can be worked out"), so a view can say "3 events not shown: …" for one record or many (`viz/notice.ts`).

## `selectConnections(model, filter)`

| Filter | Matches | Undecided when |
|---|---|---|
| `kinds` | Connection kinds (`link`, `participant`, `told-in`…) | none |
| `types` | Stored connections' own kinds (`member-of`, the author's words) | none |
| `involving` | Either end is one of these records | none |
| `canon` | Stored connections by canon status (canon when unset) | Not a stored connection: "no canon status of its own" |
| `time` | Holds at some moment in that stretch (its `validity`, `validity.md`) | "when it holds cannot be compared with the range": an unknown or too-broad date, or chapters against story time |

The result is `{ items, undecided: [{ reason, connections }] }`, in a fixed order.

## Performance

- Each model's connection index is built once and cached (a `WeakMap`), so later queries on the same model reuse it.
- The large test runs 5,000 events, 1,000 entries and 10,000 connections with three filters at once (characters, places, a time range), and must finish in under **300 ms** (acceptance PF-1). It also checks that the result is identical when run again.

## Not in this step

- Screens using it. Views adopt it as they are built (Prompts 12 onwards).
- The existing Timeline, Plot and Story graph pages keep their own filters until their views are rebuilt.
- Saved filter sets are Prompt 14.

## A note on `validity.ts`

When an event is used as the start or end of a validity (Prompt 8), it still counts as taking up its **whole possible range**, start uncertainty and length together. This is conservative: it can only produce more `unknown` answers, never a wrong yes or no. The query layer above makes the finer distinction because a filter needs to.
