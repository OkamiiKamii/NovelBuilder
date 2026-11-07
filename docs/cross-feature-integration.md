# The system as a connected whole (Prompt 49)

**Written:** 2026-10-22.

**Test:** "The system as a connected whole (visualization Prompt 49)" in the Visualize section of `e2e/smoke.mjs`: 20 checks on one novel, "Connected Whole".
- Every record is made through the app's own pages, not written into the database.
- Every check reads both what the pages show and what is stored.

## What it does, and what each step proves

| Step | What is done, through the pages | What is checked |
|---|---|---|
| 1. Make the records | Organizer: three chapters and a scene. Modules: Progression Fantasy & LitRPG, whose "Skills & Abilities" kind holds the ability. Character Library: Mira and Bren. Codex: two places and the ability. Plot threads: a thread. Timeline: two events. | Each record exists once, and everything else points at it by id (step 2). |
| 2. Connect them | The ability linked to Mira (Codex). Mira tied to Emberfall (place explorer: "Located in"). The thread given Mira, Emberfall and developments in Chapters 1 and 3. The events given people, a place, chapters and the thread. | The stored event points at both people, the place, Chapter 2 (as a flashback) and the thread. The thread points at its cast, place and chapters. Both connections are stored. |
| 3. Chronology against reading order | "The Burning" is set ten years before "The Return" and told in Chapter 2, looking back. "The Return" is told in Chapter 1's scene. | The timeline lists the burning first. Story order beside reading order says "1 telling goes back in time", and lists Chapter 2 telling it "As a flashback … 1st · goes back in time". |
| 4. A relationship changes | Mira and Bren: Friends from the start, then a stage from Chapter 2: Enemies. | The first stage is byte-for-byte as it was. The history shows both. The map "as of" Chapter 1 reads Friends, and at the end Enemies. |
| 5. The same records everywhere | Timeline, story order, relationship map, plot board and knowledge graph, each as a list. The timeline also drawn by character and by place. | Each view names the same records. The knowledge graph lists all 16 connections, each with where it is kept. The tracks are Bren (1 event), Mira (2), Emberfall (2). |
| 6. Rename | Mira becomes "Mira Ashborn" (character profile). | Only her record changes. Her own history gains a line recording the rename, and her profile notes when it was edited. No reference is rewritten. Every view reads exactly as before with the new name in place of the old. |
| 7. Alternate timeline | Forked after Chapter 1 as Non-Canon, then an event renamed in the branch. | The branch has Chapter 1 and its scene. The relationship there is as it stood before Chapter 2 (one stage). It is tagged NON-CANON. The main canon's records and every one of its views are exactly as before. |
| 8. Export and re-import | Import & Export → Export entire project data, then Library → Import. | The same records. Nothing in the copy points at the original. Every view reads the copy exactly as the original. |
| 9. A module off and on | Progression Fantasy & LitRPG switched off, then on. | Off: no record changes. Only its three empty kinds are put away; "Skills & Abilities", which holds the ability, stays, and every view reads the same. On again: every record and every view as before. |
| 10. Incomplete and contradictory records | An event with no date. Mira at "The Duel", at the Ashen Keep, at the same moment as "The Return" at Emberfall. | The undated event is listed under "Not placed in time" with "No date yet", not drawn at a made-up time. The timeline review finds Mira in two places at once, naming her, both events and both places, with "The rule: …". The continuity review lists it too, with how sure it is. Visiting every warning changes no record. |

## What it found

**No fault in the app.** All 20 checks passed against the app as it was, once the test itself was right.

The test was wrong, at first, in three places. Each was corrected to what the app does, after checking that what it does is the intended behaviour:
- **The timeline list.** As a list, the timeline shows events, when they happen and where they are told, not their people and places. The people and places on the timeline are its tracks, which the test now reads.
- **A rename is not invisible.** A character's history records the rename (that is what the history is for), and the profile notes when it was edited. The check now says exactly what changes besides the record, and that no reference is rewritten.
- **Turning a module off.** It puts away only the kinds it brought that are empty and that no other module uses (`extensions/service.ts`, `disable`). A kind holding records stays, so its records stay visible. `docs/backup-and-recovery.md` had left out "empty" and is corrected.

## Not covered here

- Collaboration, sync and the reader preview are outside the visualization system; their own e2e phases cover them.
- The views were compared as lists, which carry the same records and words as the drawings. The drawings are covered by each view's own checks (Prompts 16–44).
