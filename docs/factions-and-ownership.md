# Factions, influence and item ownership (Prompt 41)

**Written:** 2026-10-22.

**Code:**
- `src/modules/factions/ties.ts`: a faction's ties by role, as of a point and as history (`factionsOf`, `factionTies`, `factionAt`, `factionNetwork`); pure.
- `factions/ownership.ts`: an item's ownership (`ownedItems`, `ownershipOf`); pure.
- `connections/types.ts`: three new connection types: At war with, Controls, Influences.
- `connections/service.ts` and `codex/types.ts`: a connection can say **how it began** (`how`) and **how it ended** (`endHow`), kept through `change` and `end`.
- `visualize/FactionsView.tsx`: the **Factions** view.
- `visualize/OwnershipView.tsx`: the **Ownership** view.
- `visualize/VisualizePage.tsx`: both read an alternate history when one is chosen ("Timeline shown").

**Tests:**
- `factions/factions.test.ts`, 8 tests:
  - ownership **changes over time**, and where an item stands at a point;
  - **unknown ownership;**
  - **branch-specific ownership**, in an alternate history and in a forked timeline;
  - factions over time, their history, and the faction map.
- "Factions, influence and item ownership…" in the Visualize section of `e2e/smoke.mjs`: 16 checks.

## Built on what is already there

**One shared model.** Every tie and every holding is a typed connection (Prompt 8), with:
- when it holds (`validity`: from and until, at a chapter, an event or a date);
- `change`: the old tie ends where the new one begins, and is kept;
- `end`: it stops, and stays as history.

Nothing new is stored for these views except **how** a tie began and ended, in the author's words.

**Nothing is assumed to last:**
- A tie or holding with no time is said to have **no time given**. It holds as far as anyone has said, and the views say so; that is not the same as for ever.
- One that has ended is history, not the present.

## Factions

Visualize → **Factions**:
- **What counts as a faction:** every Faction entry, and any other record (not a character or a place) someone is a member of or leads, or that controls or influences something.
- **Ties, by role:**

  | Role | Recorded as |
  |---|---|
  | Leaders | "Leads" (someone → the faction) |
  | Members | "Member of" (someone → the faction) |
  | Allies | "Allied with" |
  | Rivals and enemies | "At war with", "Considers a rival" |
  | Territory | "Controls" (the faction → a place) |
  | Influence | "Influences" (the faction → anything) |
  | Based in | "Located in" (the faction → a place) |
  | Other ties | any other kind, including **the author's own** ("Owes a debt to"), in its own words |

- **As of** the end of the story, a chapter or scene, or an event. A tie whose time cannot be compared with that point (a chapter against an event) is marked **"may hold"**.
- **The table** (always) lists each faction with its ties holding then. **The map** (optional) has:
  - factions on a circle;
  - territory beyond them;
  - lines for alliance, enmity, influence and control;
  - a legend that names each by colour and line.
- **One faction's history:** choose it under "Faction" to see every tie in order, with when and how it began and ended ("Mira is a member, from Year 3 until Year 8 (expelled)"). A tie that still holds can be **ended** there, at a point and with how.
- **Record a tie:**
  - who or what;
  - the kind of tie (or your own);
  - to what;
  - when it begins, and how.

## Ownership

Visualize → **Ownership**, one item at a time:
- **Items:** every Item entry, and anything recorded as owned.
- **Who made it:** from "Created by".
- **Each holding, in order:**
  - who held it;
  - when it began and **how** (made, found, given, sold, stolen, inherited, won, claimed, or the author's words);
  - when it ended and how: lost, destroyed, abandoned, hidden, the author's words, or **how the next holding began** right where it ended ("stolen by Mira", "given to The King").
- **Stretches with no owner known:** "Not known between Year 12 (lost) and Year 15."
- **Where it stands at a point:**
  - held by someone;
  - **perhaps** held, when it changes hands during that very point or a time cannot be compared with it ("Perhaps held by The King and Mira");
  - ended (lost, destroyed);
  - not recorded;
  - or no owner recorded at all.
- **Drawn as a chain** of holders, or **as a table**.
- **Record what happens to it:**
  - passes to someone (found, given, sold, stolen…): a new holding, or a change from the holding before, which ends there and is kept;
  - nobody has it after (lost, destroyed…): the holding ends.

  These are the same connections as anywhere else.

## Branches

**An alternate history** (the Alternate histories page) is chosen under **Timeline shown**. Both views read its events:
- **A holding or tie that begins at an event the history does not have does not happen there.** It is marked so, and not counted.
- **One that ends at such an event does not end there: it goes on.** In a history without the theft, the King keeps the crown.

**A forked timeline** is a novel of its own:
- What is recorded in it holds there alone, and changing it there leaves the original as it was.
- Both views say when the novel is a forked timeline.

## Data model

- **`LoreLink.how` and `LoreLink.endHow`:** optional, in the author's words. They are kept by `change` (the new holding's how) and `end` (how it ended).
- **No new tables; still version 34.**

## Limits

- **Influence has no strength scale.** Its degree is the author's wording.
- **"Perhaps held"** names everyone who may hold the item at the point; it does not decide between them.
- **The faction map** is a circle of factions, not a geographic map. Places a faction controls also show in the place explorer, under "Tie something to it".
