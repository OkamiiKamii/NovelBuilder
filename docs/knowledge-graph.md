# The knowledge graph (Prompt 32)

**Written:** 2026-10-22.

**Code:**
- `src/modules/graph/knowledge.ts`: the graph and its queries (`knowledgeGraph`, `queryGraph`, `neighbourhood`, `pathBetween`, `typeCounts`, `edgeWords`); pure
- `graph/components/KnowledgeMap.tsx`: the drawing
- `visualize/GraphView.tsx`: the **Knowledge graph** view in Visualize (`/visualize/graph`), with its layers, focus, path query and list
- `relationships/network.ts`: the force layout, now accepting any network (only ids, degrees and ends)

**Tests:**
- `graph/knowledge.test.ts`, 9 tests of the core queries
- "The knowledge graph" in the Visualize section of `e2e/smoke.mjs`: 16 checks

The older **Story graph** page is unchanged. It draws the story at chapter level with its own clustering. This view is the full graph over the shared records.

## Built on the shared records only

The graph is the shared model's records and the connections it already reads (`deriveConnections`), as they are each time. **There are no graph-only records:**
- no table is added (tested: the database's tables and the novel's records are the same before and after);
- each edge carries the id of the connection it stands for, and says where that is kept.

**Nodes, every record of the novel:**
- characters, places, factions, items, lore, and every category the author makes (species, from a genre module, among them), each in its category's colour;
- abilities;
- events;
- chapters, scenes, and the volumes, acts and arcs they sit in;
- plot threads.

**Shapes:** circles for entries, diamonds for events, squares for the manuscript, and triangles for threads and abilities.

**Edges, each connection, typed:**

| Kind | Edges |
|---|---|
| **Connections the author records** | owns, created by, caused, took place at, appears in, knows about, member of, leads, located in, allied with, related to, and the author's own types ("set off"), each named as recorded, with how it reads from the other side when that is known |
| **Character relationships** | |
| **Fields that name an entry** | ("Leader", "Owner") |
| **The timeline** | takes part in, involved in, takes place at, comes after, dated from, belongs to a thread |
| **Plot threads** | involves, develops in, meant to resolve in |
| **The manuscript** | told in, linked in the text, involved in a chapter's plan, part of |
| **Abilities** | has, branches from |

**Missing ends:** a connection one end of which has been deleted is left out, and the view says how many.

## The view

**The drawing:**
- **Each pair of connected records is one line,** styled by the strongest kind of connection between them: a colour and a line pattern per group, named in the legend.
- **Arrows:** a line has an arrow when every connection on it reads one way.
- **Zoom and pan** through the shared viewport. **Dragging** moves a record, and "Put everything back" undoes it.
- **Labels on lines** are drawn for what is lit, or once zoomed in, when there are more than 80 lines.

**Selection and details:**
- **A record:** its connections light up and the rest dims. The page's own detail panel opens, with **Focus the graph on this**.
- **A line:** lists every connection it stands for, how each reads, its type and where it is kept, with ways to show either end, or open the relationship.
- **Keyboard:** the graph is one stop in the tab order. The arrow keys move between records (by name), Enter selects, and F focuses.

**Layers** (**Records** and **Connections**): every kind present, with its count, to show or hide.

**Focus:** one step or two around a record (or around the character chosen in the page's "Involving character" filter); **Show the whole graph** goes back.

**Search by name** (the page's own): keeps what matches and what it is directly connected to.

**Records with no connection shown** are counted, and can be drawn too.

**How is X connected to…** (with a record selected): the shortest chain of connections to another record, either way along each, listed in words and lit on the graph. If they are not connected within eight steps, it says so.

**List:** every connection shown, as a table: from, connection (with its type when that differs), to, and where it is kept; and the records with none.

**The address and saved views:** hidden kinds of record and connection, the focus and its depth, and "show records with no connection" live in the address, and saved views keep them. The record chosen for a path is in the address but not saved.

## Limits

- **Clutter:** folding, the drawing limit, and the notice of what a view leaves out came with Prompt 33 (`docs/graph-clutter.md`).
- **Positions** are not saved. A new set of records or lines lays the graph out again.
- **Connection types:** a connection's type is set where the connection is made (Codex, Relationships, Timeline…). The graph shows types; it does not edit them.
