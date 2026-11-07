# The relationship manager (Prompt 24)

**Written:** 2026-10-21.

**Code:**
- `src/modules/relationships/types.ts`: types of the novel's own, tracked attributes, the settings row
- `relationships/service.ts`: `saveType`, `removeType`, `offerBuiltIn`, `trackAttribute`, `untrackAttribute`, and attribute values in `updateStage`
- `relationships/components/RelationSettings.tsx`: the "Relationship types and attributes" panel; `TypeOptions`
- `relationships/components/RelationDetails.tsx`: type choices, "How they feel", "Also recorded between them"
- schema **v30**: table `relationSettings`

**Tests:**
- `relationships/manager.test.ts`, 9 tests
- the existing `relationships.test.ts`, still 11
- the relationship manager checks in the Visualize section of `e2e/smoke.mjs`, 11 checks

## What was already there, and stays

**Relationship records.** A relationship is its own record (`characterRelations`): one per pair of characters, pointing at the two **character records by id**.
- Create refuses anything that isn't a character, the same character twice, or a second record for a pair.
- Deleting a character deletes their relationships.
- A relationship's **stages** say how it stands from each point in the book (Prompt 25 builds on these).

**Directional types.** A one-way type gives each side a role (Mentor → Student), drawn as an arrow, and **Swap who is who** reverses them.

**Shared model.** The shared connection model reads every relationship as a connection between the two characters, each side in its own words (`deriveConnections`, kind `relationship`).

**Built-in types** cover every kind the prompt names:

| Kind | Built-in types |
|---|---|
| Family | Parent / Child, Siblings, Spouses, Relatives |
| Friendship, alliance, rivalry, hostility | Friends, Allies, Rivals, Enemies |
| Mentorship | Mentor / Student |
| Romance | Romantic interest, Partners, Exes |
| Employment, political | Employer / Employee, Master / Servant, Ruler / Subject, Political tie |
| Custom | Any wording, per relationship |

## New: types of the novel's own

**Relationships → Relationship types and attributes → Your own types.**
- **What a type has:** a name, a group, and whether it's one-way. A one-way type has two roles; a mutual one has one role, or its name.
- **Checked:** it needs a name, the name can't repeat a built-in type or another of the novel's types (case aside), and a one-way type needs both roles.
- **Offered beside the built-in types** everywhere a type is chosen. A stage records it as `type:<id>` with its wording.
- **Changing a type** re-words every stage that uses it.
- **Deleting a type** turns those stages to Custom, keeping their wording, so nothing about them is lost.

**Built-in types offered.** Built-in types the novel doesn't use can be left out of the choices. A relationship already using one keeps it, and shows it where it's used.

## New: attributes, only when chosen

**Relationships → Relationship types and attributes → Attributes to track.**
- **None is tracked until the author chooses.** The suggestions are Trust, Affection, Fear, Loyalty, Hostility and Respect, and the author can add their own ("Debt").
- **Each way is its own.** A tracked attribute is given at each stage, from 0 to 10: how the first character feels toward the second, and the second toward the first. Trust need not be returned. Empty means not said.
- **Checked.** A value that isn't a whole number from 0 to 10, or an attribute that isn't tracked, is refused with the reason ("Fear is given as a whole number from 0 to 10.").
- **A new stage starts with the attributes as they stood,** for the author to change.
- **Untracking keeps the values in the stages.** Tracking a suggested attribute again shows them again.

**Stored on the stage** as `attributes: { [key]: { from, to } }`. Older stages simply have none.

## Shared connections between the same characters

**Typed connections** made elsewhere (on character pages or in the codex), such as "Bren distrusts Kai", are their own records in the shared connection model. The relationship's details now show them under **Also recorded between them**, read from where they're kept. A test checks that both appear as connections between the two characters in the shared model.

## Stored, copied, synced

**`relationSettings`:** one row per novel holding its own types, hidden built-ins and tracked attributes. It's registered with the project, so it's copied, backed up and deleted with the novel (tested on duplicate). It syncs with the story's lore, labelled "Relationship types and attributes".

**A checkbox fix found by the browser test:** the settings' checkboxes now show a change at once while it saves, as the timeline's track checkboxes do since Prompt 18.

## Limits

- **One relationship per pair.** Several kinds of tie at once go in its wording, or as typed connections, which now show beside it.
- **Attributes are numbers, not shown on the map yet.** The relationship map (Prompt 26) can draw them.
- **Your own attributes.** Untracking one and adding it again under the same name starts a fresh attribute; the old values stay stored.
