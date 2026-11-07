# Keeping the knowledge graph readable (Prompt 33)

**Written:** 2026-10-22.

**Code:**
- `src/modules/graph/knowledge.ts`:
  - `collapseGraph`: kinds of record folded into one group each; scenes folded into their chapters.
  - `limitGraph`: at most `DRAW_LIMIT` records drawn, the most connected first.
  - `DRAW_LIMIT` (200) and `DRAW_STEP` (100).
- `graph/components/KnowledgeMap.tsx`: group nodes, and the path target picked on the graph (Shift-click, or P).
- `visualize/GraphView.tsx`: the order things are applied in, the "what this view leaves out" notice, and "Restore the full view".

**Tests:**
- `graph/knowledge.test.ts`: 5 more tests (folding, the limit, and a performance test on 3,000 records and 9,000 connections).
- "A crowded graph" in the Visualize section of `e2e/smoke.mjs`: 10 checks on 403 records and 1,002 connections.

Built on the knowledge graph of Prompt 32. Focus at one or two steps, layers for kinds of record and connection, search, and the path between two records were already there.

## What is applied, in order

1. **Layers, search and focus** decide what is in the view.
2. **Folding** gathers records together:
   - **Fold scenes into their chapters:** a scene's connections are drawn on its chapter; the connection between them goes.
   - **Fold together** (beside each kind of record in Layers): every record of that kind becomes one group node, "100 locations". Its connections are drawn on it, connections inside it are left out, and clicking the group (or Enter on it) opens it again.
3. **The limit:**
   - **What is drawn:** at most 200 records (and groups), the most connected first, so the graph stays readable and quick to lay out.
   - **What always stays in:** the selected record, the focus and the records on a path shown, even past the limit.
   - **Drawing more:** **Draw 100 more** adds them a step at a time, and **Draw all** removes the limit, warning that it may be slow.

## Never mistaken for the whole story

**Two places say what is shown:**
- **The status line** always gives the count ("Showing 200 of 403 records and 512 of 1,002 connections, 1 group folded together").
- **When anything leaves part of the story out**, a notice says so ("This is part of the story, not all of it") and lists each reason with its own way back:

| Reason | Way back |
|---|---|
| Only the most connected records are drawn, and how many are left out | Draw 100 more, Draw all |
| Hidden kinds of record, named | Show them |
| Hidden kinds of connection, named | Show them |
| Only what is within one or two steps of a record | Drop the focus |
| Only records named in a search | Clear the search |
| Kinds of record folded together | Open them |
| Scenes folded into their chapters | Unfold them |
| Records with no connection shown are not drawn, and how many | Draw them |

**Restore the full view** clears every setting at once (layers, focus, search, folding, the limit). It keeps what is selected and a path being shown. The default limit of 200 still applies to a large novel, and the notice keeps saying so.

## Paths

- **Picking the other end:** with a record selected, choose another from the menu, Shift-click it on the graph, or press **P** on it.
- **A path through what is hidden:** if the view hides the only connections between the two, the path is not denied. The view says "Connected only through what this view hides (2 steps)", with **Restore the full view to see it**.
- **Records on a path** are drawn even when they are not among the most connected.

## Responsiveness

**Measured by the tests:**
- **The work:** building, filtering, folding and limiting a graph of 3,000 records and 9,000 connections takes well under the 3-second limit set in the test.
- **The layout:** laying out the 200 drawn takes well under its 4-second limit.
- **In the browser:** the crowded novel (403 records) is drawn within 20 seconds of opening the page, on the dev server (checked).

**What keeps it quick:**
- **Recomputing:** the layout is worked out again only when the set of drawn records or lines changes.
- **Line labels** are drawn only for what is lit, or once zoomed in, past 80 lines.

## Repeatable manual test steps

**Large-graph check, for any change to the graph:**

1. **Make the novel:** a novel with 400 or more records and 1,000 or more connections. The e2e block "A crowded graph" makes one: run it alone, or copy its seeding.
2. **Open it:** Visualize → Knowledge graph.
   - **Check:** the graph appears within a few seconds.
   - **Check:** the status line says "Showing 200 of N".
   - **Check:** the notice lists the limit.
3. **Draw 100 more:** the page stays responsive while laying out. Zoom with the wheel and pan by dragging the background; both should feel immediate.
4. **Fold a large kind of record** (Layers → Fold together): one group node appears. Click it: it opens again.
5. **Select a record,** then Shift-click another far away: the chain is listed and lit. Hide one kind of connection on it: the view says the path goes through what is hidden.
6. **Focus** on a record (detail panel → Focus the graph on this), then choose Two steps; then **Restore the full view**: everything clears, and the notice is left with the limit only.
7. **Draw all:** expect a slower layout (several seconds on a large novel). The page should not freeze for good, and zoom and pan should still work once drawn.

## Limits

- **Folding** is by kind of record, and scenes into chapters. There is no folding by faction, act or a hand-picked set.
- **Which records are drawn first:** "the most connected first" counts connections in the current view. Two views of the same novel can therefore draw different records first.
- **Layout timing:** the layout runs in the page, not in a background worker, so drawing everything in a very large novel pauses the page while it is laid out.
