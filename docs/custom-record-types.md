# Kinds of record and field templates (Prompt 35)

**Written:** 2026-10-22.

**Code:**
- `src/modules/codex/types.ts`: the rules a field may carry (`required`, `help`, `min`, `max`, `target`), `FIELD_LIMITS`, and a category's `graph` setting.
- `codex/service.ts`: `cleanDefs` keeps each rule only where it fits the field's type. `cleanKind` cleans a category brought in from a file. `saveCategory` enforces the limits. `applyTemplate` carries links between a template's own kinds.
- `codex/validation.ts`: `checkValue` and `entryIssues`, what fits a field; pure.
- `codex/typePresets.ts`: eight presets to start a kind from.
- `codex/components/SchemaDialog.tsx`: the rules for each field, presets, "Show in the knowledge graph", and saving one kind as a template.
- `codex/components/EntryEditor.tsx` and `characters/components/Sections.tsx`: required marks, help, and what does not fit, at each field.
- `integrity/rules.ts` (`unfitEntries`) and `integrity/IntegrityPage.tsx`: **Values that do not fit their fields** on the Record check.
- `graph/knowledge.ts` and `visualize/GraphView.tsx`: kinds kept out of the knowledge graph, and the view saying so.

**Tests:**
- `codex/recordTypes.test.ts`, 13 tests: rules, limits, presets, templates, links, the record check, search, export, the graph, copying and importing.
- "Kinds of record of the author's own…" in the Visualize section of `e2e/smoke.mjs`: 18 checks.

## What a kind of record is

A kind of record is a Codex category: Spells, Planets, Investigations, or anything else. It has a name, a colour and a set of fields. Its records are ordinary Codex entries: a name, a summary, a description, tags, and a value for each field.

**Nothing new is added to the core data model.**
- Kinds are rows of `loreSchemas`; records are rows of `loreEntries`, as before.
- Every value is stored as text on the entry, whatever its field's type.
- So a kind of the author's own is linked, searched, exported, copied, checked and drawn by the same code as the built-in ones.

**Where:** Codex → **New entry** → **Categories & fields…**, or **Edit these fields…** on any entry.

## Field types

| Type | Shown as | Stored as |
|---|---|---|
| Short text, Long text | a box | the text |
| Number | a number box | the number, as written |
| Date | a date picker | `YYYY-MM-DD` |
| Yes / No | a choice | `yes` or `no` |
| Choice (one) | a menu of the field's choices | the choice |
| Choice (several) | ticks against the choices | one choice per line |
| Tags / list | chips | one item per line |
| Link to an entry | a menu of entries | the entry's id |
| Links to several entries | chips and a menu | one id per line |

A link holds an id, never a name, so renaming the linked record breaks nothing.

## Rules

Each field can carry:
- **Required:** it should be filled in.
- **Lowest and highest** (numbers only).
- **Links to** one kind of record (links only): the menu then offers only that kind, for example characters.
- **Help:** a line shown with the field.

A rule is kept only where it fits the type. A number range on a text field, a "links to" on a number, or a highest below the lowest is dropped when saved. A link limited to a kind that does not exist is saved unlimited.

## Validation: said, never enforced

A value that does not fit is **said, not stopped, and never changed:**
- **At the field,** on a Codex entry and on a character's profile (for the fields every character shares).
- **On the Record check,** under **Values that do not fit their fields**, one line per value, linked to the record.

What is checked:

| Problem | Example |
|---|---|
| A required field is empty | "Cost is required." |
| Not a number | "Rank should be a number; it holds “high”." |
| Out of range | "Rank should be at most 9; it is 12." |
| Not a real date | "First visited should be a date; it holds “spring”." |
| Not yes or no | "Sapient should be yes or no; it holds “maybe”." |
| Not one of the choices | "School should be one of Fire, Water…; it holds “Ash”." |
| A link to something that is not an entry | "Leader holds “Orrin”, which is not an entry." |
| A link to the wrong kind | "Known by should link to Characters; The Keep is not." |

**Not checked:**
- Archived fields.
- Fields that belong to one entry alone.

## Presets

**Or start from a preset…** adds a kind with a field set to begin from. Every field can be renamed, retyped, made optional or removed afterwards.

| Preset | Fields (required in bold) |
|---|---|
| Spells | **Effect**, School, Rank (0–10), Cost, Known by (characters) |
| Planets | **System**, Climate, Population, Moons, Governed by (factions), First visited |
| Investigations | **Status**, Opened, Lead investigator, Suspects (characters), Solved, Evidence so far |
| Techniques | **Discipline**, Difficulty (1–10), Prerequisites, Practitioners (characters), Signature move |
| Organizations | **Kind**, Leader, Members (characters), Headquarters (locations), Founded, Goals |
| Species | Lifespan, Homeland (locations), **Sapient**, Traits |
| Technologies | **Status**, Inventor (characters), Tech level (1–10), Power source |
| Relics | **Powers**, Current holder (characters), Last seen (locations), Cursed, Age in years (0 or more) |

**Applying a preset only adds.** If a kind of that name already exists, only its missing fields are added. Applying it twice adds nothing.

## Templates: reusable configurations

- **Save {kind} as a template:** one kind, its fields and their rules.
- **Save template:** every category and field set of the novel, as before.
- **Add from a template:** adds what is missing to this novel. Nothing existing is changed.
- **New project → Worldbuilding template:** starts a novel from one.

Templates belong to the author, not to one novel. When a template holds two kinds that link to each other (Cells whose Members are Agents), the link follows to the new novel's copy of Agents.

**Not carried by a template:** the "Show in the knowledge graph" setting. It is a choice about one novel's graph.

## Linked, searched, exported, shown in the graph

- **Linked:**
  - A link field is a connection in the shared model. It appears both ways under **Every connection**, in the knowledge graph, and on the Record check.
  - A custom record can also be linked under **Related entries**, with a status (Prompt 34), like any entry.
- **Searched:** project search (Ctrl/Cmd+K) finds a record by its name and by what its fields hold, grouped under its kind.
- **Exported:**
  - The story-bible export lists each kind, its records, and their filled-in fields, with links shown by name.
  - The project archive carries kinds, rules and records. A copy or an import keeps them.
- **Shown in the graph, or not:**
  - Each kind is drawn by default.
  - Untick **Show in the knowledge graph** to keep a kind out. The graph then says so under "What this view leaves out", with the count and a link back to the Codex.
  - The kind's records stay everywhere else.

## Keeping the app sound

Whatever is defined, the app's own data stays the same shape:

| Limit | Value |
|---|---|
| Fields per kind | 60. Saving more says so and saves nothing. |
| Choices per field | 100 |
| Length of a field name or choice | 60 characters |
| Length of help | 200 characters |

**Also enforced:**
- A field of an unknown type becomes short text.
- A field without a name is named "Untitled field".
- **A kind brought in from a file is cleaned the same way.** A malformed archive cannot add a field the app cannot show. Its records are kept.
- **Changing a field's type never converts or deletes values.** A value that no longer fits is said at the field and on the Record check.
- **Removing a field archives it.** Its values are kept, and come back if the field is restored (as before).

**No migration.** The new rules are optional properties of a field definition, and `graph` is an optional property of a category. The database schema is unchanged (still version 31).

## Limits

- **Validation is advisory by design.** Nothing stops an author saving a value that does not fit.
- **Only numbers have a range.** Dates, text lengths and the number of links have no limits of their own.
- **A link limited to one kind** narrows what is offered. A value already pointing at another kind is flagged, not removed.
- **No compound field type** (a table, or a field with sub-fields). Lists, several choices and several links cover most needs.
- **Presets are matched by name.** A kind renamed from "Spells" to "Magic" no longer matches, so applying the Spells preset again adds a second kind.
- **Fields of one entry alone** have a type but no rules.
