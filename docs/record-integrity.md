# Cross-references and record integrity (Prompt 34)

**Written:** 2026-10-22.

**Code:**
- `src/modules/integrity/rules.ts`: connection statuses, broken references, references that name nothing, duplicate-looking records, `withoutReference`; pure.
- `integrity/service.ts`: the fixes (`removeReference`, `pointField`) and merging (`mergePlan`, `merge`).
- `integrity/IntegrityPage.tsx`: the **Record check** page (`/project/:id/integrity`, in the sidebar after Continuity).
- `crossref/components/AllConnections.tsx`: **Every connection**, both ways, on chapters and scenes (their plan), codex entries, events and plot threads.
- `model/connections.ts`: appearance records (Prompt 31) are now connections of their own (`appearance`).
- `crossref/graph.ts` and `crossref/components/MentionedIn.tsx`: "Mentioned in" includes appearance records.
- `characters/components/Tabs.tsx`: a character's overview lists the chapters their appearance records name.
- `codex/components/EntryEditor.tsx`: a status on each related entry.
- `graph/knowledge.ts`, `graph/components/KnowledgeMap.tsx` and `visualize/GraphView.tsx`: statuses in the knowledge graph.

**Tests:**
- `integrity/integrity.test.ts`, 13 tests: deletion, renaming and moving, export and import, broken references, merging
- "Cross-references both ways…" in the Visualize section of `e2e/smoke.mjs`: 16 checks

## Both ways

Every reference can be followed from either end where that means something:
- **Every connection** (on a chapter's or scene's plan, a codex entry, an event, a plot thread) lists both what the record points at ("Takes place at The Keep") and what points at it ("Orrin owns this"). Each item opens the other end and says where the connection is kept. It reads the shared model, so every kind is there: connections you record, relationships, fields, links in the text, plans and appearance records, events, plot threads, system sheets.
- **Appearance records** (who appears, who is only mentioned; Prompt 31) were kept on each chapter's plan. Now each character's overview and each entry's "Mentioned in" list them the other way round, linked to the chapters.
- **Links in the text** were already two-way. The codex's "Mentioned in" opens the chapter at the link, and the text's link opens the entry.

## Connection statuses

Connections you record (`loreLinks`) already had a canon status. It is shown in the words used for connections, so there is one status and no second field:

| Stored | Shown as |
|---|---|
| canon, or none said | **Confirmed** |
| provisional | **Provisional** |
| conflicting | **Disputed** |
| retconned | **Invalid: retconned** |
| non-canon | **Invalid: not canon** |

**Where statuses appear:**
- **Setting it:** on each related entry in the Codex.
- **Every connection:** shows it as a badge.
- **The knowledge graph:** lines are dashed while provisional, marked when disputed, and faded when invalid, named in the legend. A **Connection status** layer hides any status, and the view says so.
- **The record check:** lists those disputed or invalid.

Other connections (a link in the text, a character at an event) are facts of the records and have no status of their own.

## The record check

**How it works:**
- **Stated rules:** each section names its rule.
- **Deterministic:** the same records give the same findings.
- **Nothing changes until the author chooses a fix.**

**References to records that no longer exist.**
- **Rule:** a reference must name a record that exists. Every reference the shared model reads, and every structural marker, is checked.
- **Each finding:** says what holds the reference and where it is kept, with **Open where it is kept**.
- **Taking it out:**
  - A connection or relationship with a missing end is **removed** whole.
  - Anywhere else, **Take this reference out** removes only the reference. What holds it stays:
    - a plot beat is kept, unplaced;
    - an event keeps its other chapters, its cast and its place;
    - a marker is kept with no chapter;
    - a field is emptied.
  - Text is never changed from here: a broken link in the text is reported, to change in the editor.

**References that name nothing.**
- **Rule:** a field that refers to an entry ("Leader", "Owner") must hold an entry, not words. Words typed by hand or brought in by an import are listed with any entries of that name.
- **Fix:** **Point it at …** fixes it, only when chosen.
- **Not counted twice:** a field holding words is not also counted as a broken reference.

**Records that look like duplicates.**
- **Rules:** two entries of the same category whose names are the same once capitals, accents, punctuation and a leading "The" are set aside, or one whose name is the other's alias.
- **Not duplicates** keeps that decision (with the other decisions, under keys starting `integrity|`), and it can be reopened.
- **Merging, shown in full first.** **Merge…** opens a dialog saying:
  - which one to keep;
  - everything that will point at the one kept, place by place (fields, links in the text, connections, plans, events, plot threads, secrets…);
  - what is added (fields it does not have, tags, description, summary, picture, and a note saying the merge happened);
  - what is not kept: connections and relationships between the two, which would point at itself; the merged character's profile layout, whose name and aliases become aliases; and a second sheet in the same system.
- **Confirming:** the merge goes ahead only after the author types the merged entry's name. It cannot be undone.
- **How the merge re-points:** it uses the same rules a copy of the novel uses (each collection's references and its own remapping), so every kind of reference follows, links inside the text and its saved versions included. Then what would be doubled is tidied, and the merged entry is deleted. Tested: no row anywhere in the novel names it afterwards, and nothing is left broken.

**Connections marked disputed or invalid** are listed, kept as marked.

**Canon and continuity rules** (added in Prompt 42) check what the structured records say about each other, with decisions. See `docs/canon-overlays.md`.

## Renaming, moving, deleting, importing

These are tested.

- **Renaming and moving break nothing:** records point at one another by id, never by name or position. Covered: renaming an entry or a chapter, moving an entry to another category, and moving a chapter. Links in the text keep the entry's id under its new name.
- **Deleting:** deleting a chapter, or an entry from the Codex, leaves the references the delete does not clean up itself. Each is found, and taking each out keeps the rest of the record.
- **Export and import:** a copy made from the full archive has every reference pointing at its own records and none at the original's. A reference broken in the original stays reported in the copy; nothing is dropped quietly.

## Limits

- **Merging** is for codex entries (any category, characters included), two of the same category at a time. Chapters, events and threads are not merged.
- **Duplicate rules** compare names and aliases only, not descriptions or fields.
- **Deleting a character from the Codex** (rather than from Characters) still leaves some references behind, as before. The record check now finds them and offers to take them out.
