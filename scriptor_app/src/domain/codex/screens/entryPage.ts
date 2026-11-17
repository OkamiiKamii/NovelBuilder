// AN ENTRY OF THE WORLD (FEATURES.md #208–#211): its picture, name (with Forge a name), category (moving keeps every
// value), summary; its detailed description; the category's fields with what fits each said, never enforced; fields
// just for this entry; tags; related entries, each with its wording and canon status; where it figures (chapters,
// events, plot threads) and "In its pages"; its connections (connections panel); private notes; delete, saying
// everything that refers to it, with a restore point and Undo. Every field saves itself; nothing here writes to the
// manuscript. The pure parts of flutter_app/lib/features/codex/entry_page.dart.
//
// The page (at most 1000 wide), 12 between its boxes: the head, "Detailed description" (5 lines), the kind's fields,
// "Fields just for this entry", "Tags" ("Tags (comma separated)"), "Related entries", "Where it figures", "In its
// pages" (the characters' In their pages panel, titled so), the connections panel, "Author notes (private)" (3 lines,
// its hint), then the footer: `entryWords.reference` (bodySmall) and "Delete entry…" (in the error colour). Its title
// is the entry's name, its subtitle the kind's singular, and "The world" (back arrow) goes to /organize/world. A
// character's address here goes to its profile (characterPath).
//
// Saving as typed goes through autosave under `autosaveKeys` (CharacterActions.later); a choice is saved at once.

import { localeCompare } from '../../collation';
import { plural } from '../../desk/format';
import { type JsonMap, str } from '../../json';
import { dartSort } from '../../manuscript/dartSort';
import { stableSorted } from '../../reader/stableSort';
import { type CanonStatus, canonStatuses } from '../../records/canon';
import { Category, type FieldDef, type FieldType, fieldTypeLabel, fieldTypeOf, fieldTypes } from '../../records/category';
import { type Entry, viewFields } from '../../records/entry';
import { strings } from '../../records/jsonRecord';
import { dartToLowerCase, dartTrim } from '../../text/dartString';
import type { CastData } from '../../characters/castData';
import { documentName } from '../../characters/screens/parts';
import type { CodexChanges } from '../codexChanges';
import type { EntryReferences } from '../codexService';
import { checkValue, displayValue } from '../fieldValues';
import { entryInitial, kindColor } from './world';

/** How the status of a link reads, as in the original app. */
export function linkStatusLabel(s: CanonStatus): string {
  switch (s) {
    case 'canon':
      return 'Confirmed';
    case 'provisional':
      return 'Provisional';
    case 'conflicting':
      return 'Disputed';
    case 'retconned':
      return 'Invalid: retconned';
    case 'non-canon':
      return 'Invalid: not canon';
  }
}

/** The address of an entry's page. */
export function worldEntryPath(entryId: string): string {
  return `/organize/world/entry/${entryId}`;
}

/** Dart's `Uri.encodeQueryComponent`: UTF-8, every byte but A–Z a–z 0–9 - . _ ~ escaped, a space as "+". */
export function encodeQueryComponent(text: string): string {
  let out = '';
  for (const byte of new TextEncoder().encode(text)) {
    const c = String.fromCharCode(byte);
    if (/[A-Za-z0-9\-._~]/.test(c)) out += c;
    else if (byte === 0x20) out += '+';
    else out += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return out;
}

/** The autosave keys of what is typed on the page. */
export const autosaveKeys = {
  name: (id: string) => `name:${id}`,
  summary: (id: string) => `summary:${id}`,
  description: (id: string) => `description:${id}`,
  tags: (id: string) => `tags:${id}`,
  notes: (id: string) => `notes:${id}`,
  value: (id: string, defId: string) => `value:${id}:${defId}`,
  ownFields: (id: string) => `ownfields:${id}`,
  linkLabel: (linkId: string) => `linklabel:${linkId}`,
} as const;

// ---------------------------------------------------------------------------------------------------- the head

/** The head (a card padded 16; the picture column and the fields, at most 560 wide, 20 apart): the picture (an
 * EntryThumb of 96), the web-address note under it (160 wide, bodySmall) when its picture is a web address,
 * "Upload picture" / "Replace picture", "Remove picture" (asking first); then "Name", "Forge a name" (a place's names
 * for anything that is not a character), 12, "Category" (every kind but characters, not archived or its own, by order
 * then name) with its helper (two lines), 12, "Short summary" (several lines, its hint). */
export function entryHead(cast: CastData, entry: Entry, kind: Category) {
  const kinds = dartSort(
    [...cast.model.categories.values()].filter((c) => c.key !== 'character' && (!c.archived || c.key === entry.category)),
    (a, b) => (a.order !== b.order ? (a.order < b.order ? -1 : 1) : localeCompare(a.name, b.name)),
  );
  const image = entry.image;
  return {
    title: entry.name,
    subtitle: kind.singular,
    tone: kindColor(kind),
    initial: entryInitial(entry),
    pictureLabel: image === null ? `${entry.name} has no picture` : `Picture of ${entry.name}`,
    upload: image === null ? 'Upload picture' : 'Replace picture',
    canRemove: image !== null,
    categories: kinds.map((k) => ({ value: k.key, label: k.name })),
    forge: {
      people: cast.entries.filter((e) => e.category === 'character').map((e) => e.name),
      places: cast.entries.filter((e) => e.category === 'location').map((e) => e.name),
      place: entry.category !== 'character',
    },
  };
}

/** Whether the picture is a web address (kept, not fetched, and so not shown): `uploaded` says whether it is one the
 * app can show. */
export function webPictureNote(image: string | null, uploaded: boolean): string | null {
  return image !== null && !uploaded
    ? 'This picture is a web address. The app does not fetch pictures from the web, so it is kept but not shown.'
    : null;
}

/** "Remove the picture?", asked before it is removed. */
export function removePictureDialog(entry: Entry) {
  return {
    title: 'Remove the picture?',
    message: `The picture is removed from ${entry.name}. A restore point or a backup still has it.`,
    confirm: 'Remove picture',
  };
}

/** What typing a name saves: nothing for a name of only spaces (the name typed so far stays as it was). */
export function nameTyped(entryId: string, text: string): ((c: CodexChanges) => void) | null {
  return dartTrim(text).length === 0 ? null : (c) => c.updateEntry(entryId, { name: text });
}

/** The other edits of the page, as changes. */
export const entryEdits = {
  forged: (entryId: string, name: string) => (c: CodexChanges) => c.updateEntry(entryId, { name }),
  category: (entry: Entry, key: string | null): ((c: CodexChanges) => void) | null =>
    key === null || key === entry.category ? null : (c) => c.updateEntry(entry.id, { category: key }),
  summary: (entryId: string, text: string) => (c: CodexChanges) => c.updateEntry(entryId, { summary: text }),
  description: (entryId: string, text: string) => (c: CodexChanges) => c.updateEntry(entryId, { description: text }),
  tags: (entryId: string, text: string) => (c: CodexChanges) => c.updateEntry(entryId, { tags: text.split(',') }),
  notes: (entryId: string, text: string) => (c: CodexChanges) => c.updateEntry(entryId, { notes: text }),
  picture: (entryId: string, image: string | null) => (c: CodexChanges) => c.updateEntry(entryId, { image: { value: image } }),
};

export const entryWords = {
  back: 'The world',
  backPath: '/organize/world',
  description: 'Detailed description',
  nameLabel: 'Name',
  forge: 'Forge a name',
  category: 'Category',
  categoryHelper: 'Moving it keeps every value: one the new category cannot place stays on the entry.',
  summary: 'Short summary',
  summaryHint: 'One or two lines you can take in at a glance.',
  own: 'Fields just for this entry',
  tags: 'Tags',
  tagsLabel: 'Tags (comma separated)',
  notes: 'Author notes (private)',
  notesLabel: 'Author notes',
  notesHint: 'Reminders, open questions, spoilers. For your eyes only.',
  inItsPages: 'In its pages',
  reference: 'Reference only: nothing here is ever added to your manuscript.',
  delete: 'Delete entry…',
  notFound: 'Entry not found',
  notFoundNoNovel: 'No novel is open. Open one from the Library.',
  notFoundGone: 'It may have been deleted.',
  goLibrary: 'Go to Library',
} as const;

// ---------------------------------------------------------------------------------------------------- the kind's fields

/** One field of the kind: how it is written (TypedInput) and what fits it, said (never enforced). */
export type KindFieldRow = {
  def: FieldDef;
  key: string;
  label: string;
  type: FieldType;
  value: string;
  options: string[];
  entries: Entry[];
  helper: string | null;
  error: string | null;
};

/** "<Kind> fields": each field of the kind (12 between), "Edit these fields…" to the kinds page at this kind; with
 * none, `empty`; values whose field was archived, under `archived` (an expanding row: "2 archived fields with
 * something written", each name over its value, and the note). */
export function kindFields(cast: CastData, entry: Entry, kind: Category) {
  const view = viewFields(entry, kind);
  const others = cast.entries.filter((e) => e.id !== entry.id);
  const names = new Map([...cast.model.categories.values()].map((c) => [c.key, c.name]));
  const rows: KindFieldRow[] = view.category.map(([def, field]) => ({
    def,
    key: `${entry.id}:${def.id}`,
    label: `${def.name}${def.required ? ' *' : ''}`,
    type: def.type ?? 'text',
    value: field?.value ?? '',
    options: def.options,
    entries: stableSorted(
      others.filter((e) => def.target === null || e.category === def.target),
      (a, b) => localeCompare(a.name, b.name),
    ),
    helper: def.help,
    error: checkValue(def, field?.value ?? '', cast.model.entries, { categoryName: (k) => names.get(k) ?? k })?.message ?? null,
  }));
  const n = view.archived.length;
  return {
    title: `${kind.singular} fields`,
    edit: 'Edit these fields…',
    editPath: `/organize/world/kinds?kind=${encodeQueryComponent(kind.key)}`,
    empty: rows.length === 0 ? 'This category has no fields of its own yet.' : null,
    rows,
    archived:
      n === 0
        ? null
        : {
            heading: `${n} archived ${n === 1 ? 'field' : 'fields'} with something written`,
            fields: view.archived.map(([def, field]) => {
              const shown = displayValue(def.type, field.value, (id) => cast.nameOf(id));
              return { name: def.name, value: shown.length > 0 ? shown : field.value };
            }),
            note:
              `These fields were removed from ${kind.name}. What you wrote is kept; restore a field under “Edit these ` +
              'fields…” to edit it again.',
          },
  };
}

/** A value typed (saved a moment later, under autosaveKeys.value) or chosen (saved at once). */
export function fieldValueSet(entryId: string, defId: string, value: string) {
  return (c: CodexChanges) => c.setFieldValue(entryId, defId, value);
}

// ---------------------------------------------------------------------------------------------------- fields just for this entry

/** The entry's own fields as rows to edit (copies of what is stored). */
export function ownFieldRows(cast: CastData, entry: Entry, kind: Category): JsonMap[] {
  void cast;
  return viewFields(entry, kind).own.map((f) => JSON.parse(JSON.stringify(f.raw)) as JsonMap);
}

/** One own field as shown: its name ("Field name"), its type ("Type": every type by label; a type not known shows as
 * Long text), the remove tip, the choices line for a choice ("Choices, separated by commas"), and its value's label. */
export function ownFieldRow(row: JsonMap) {
  const type = fieldTypeOf(row['type']) ?? 'longtext';
  const name = str(row['key']);
  return {
    id: str(row['id']),
    name,
    type,
    types: fieldTypes.map((t) => ({ value: t, label: fieldTypeLabel[t] })),
    removeTip: `Remove the field ${str(row['key'], 'without a name')}`,
    choices: row['type'] === 'select' || row['type'] === 'multiselect' ? strings(row['options']).join(', ') : null,
    valueLabel: name.length === 0 ? 'Value' : `${name}: value`,
    value: str(row['value']),
    options: strings(row['options']),
  };
}

/** The rows after an edit of one (`patch` merged in). */
export function ownFieldEdited(rows: readonly JsonMap[], i: number, patch: JsonMap): JsonMap[] {
  return rows.map((r, j) => (j === i ? { ...r, ...patch } : r));
}

/** The choices typed for a choice field, as stored. */
export function choicesTyped(text: string): string[] {
  return text
    .split(',')
    .filter((o) => dartTrim(o).length > 0)
    .map((o) => dartTrim(o));
}

/** The rows with one removed. */
export function ownFieldRemoved(rows: readonly JsonMap[], i: number): JsonMap[] {
  return rows.filter((_, j) => j !== i);
}

/** The rows with a new, empty one at the end ("Add a field"). */
export function ownFieldAdded(rows: readonly JsonMap[], newId: () => string): JsonMap[] {
  return [...rows, { id: newId(), key: '', value: '', type: 'text' }];
}

/** Said under the rows while one has neither a name nor a value. */
export function ownFieldsNote(rows: readonly JsonMap[]): string | null {
  return rows.some((r) => dartTrim(str(r['key'])).length === 0 && dartTrim(str(r['value'])).length === 0)
    ? 'A field with neither a name nor a value is not kept.'
    : null;
}

/** What saving the rows changes (typed: later, under autosaveKeys.ownFields; a type, a removal or a choice: now). */
export function ownFieldsSaved(entryId: string, rows: readonly JsonMap[]) {
  const copy = rows.map((r) => ({ ...r }));
  return (c: CodexChanges) => c.setOwnFields(entryId, copy);
}

export const ownFieldWords = { name: 'Field name', type: 'Type', choices: 'Choices, separated by commas', add: 'Add a field' } as const;

// ---------------------------------------------------------------------------------------------------- related entries

/** "Related entries": each linked entry (a press opens it, as a character or an entry) with its kind, its wording
 * ("Relationship", hinting "They say: …" when the other side has words of its own), its status (every status, by
 * linkStatusLabel) and an unlink button; then, while anything is left to link, "Link to…" (each "Name (Kind)"),
 * "Relationship (optional)" and **Link**. */
export function relatedEntries(cast: CastData, entry: Entry) {
  const related = cast.relatedOf(entry.id);
  const linked = new Set(related.map((r) => r.entry.id));
  const kindOf = (e: Entry) => cast.model.categories.get(e.category) ?? Category.unknown(e.category);
  const linkable = stableSorted(
    cast.entries.filter((e) => e.id !== entry.id && !linked.has(e.id)),
    (a, b) => localeCompare(a.name, b.name),
  );
  return {
    title: 'Related entries',
    empty: related.length === 0 ? 'Not linked to anything yet.' : null,
    rows: related.map((r) => {
      const canon = cast.links.find((l) => l.id === r.linkId)?.canon ?? 'canon';
      const kind = kindOf(r.entry);
      return {
        linkId: r.linkId,
        entry: r.entry,
        character: r.entry.category === 'character',
        kind: kind.singular,
        tone: kindColor(kind),
        label: r.label,
        hint: r.theirLabel.length > 0 ? `They say: ${r.theirLabel}` : null,
        canon,
        unlinkTip: `Remove the link to ${r.entry.name}`,
      };
    }),
    statuses: canonStatuses.map((s) => ({ value: s, label: linkStatusLabel(s) })),
    linkable: linkable.map((e) => ({ value: e.id, label: `${e.name} (${kindOf(e).singular})` })),
  };
}

export const relatedWords = { relationship: 'Relationship', status: 'Status', linkTo: 'Link to…', optional: 'Relationship (optional)', link: 'Link' } as const;

/** The presses of Related entries. */
export const relatedEdits = {
  label: (linkId: string, entryId: string, text: string) => (c: CodexChanges) => c.labelLink(linkId, entryId, text),
  canon: (linkId: string, s: CanonStatus) => (c: CodexChanges) => c.setLinkCanon(linkId, s),
  unlink: (linkId: string) => (c: CodexChanges) => c.unlink(linkId),
  link: (entryId: string, otherId: string, label: string) => (c: CodexChanges) => c.linkEntries(entryId, otherId, label),
};

// ---------------------------------------------------------------------------------------------------- where it figures

/** "Where it figures": the chapters and scenes that link to it in their text (in reading order; a press opens one),
 * the timeline events at it or naming it, the plot threads set there. */
export function whereItFigures(cast: CastData, entry: Entry) {
  const position = (id: string) => cast.model.order.position.get(id) ?? 0;
  const chapters = stableSorted(
    [...cast.model.nodes.values()].filter((n) => n.mentions.includes(entry.id)),
    (a, b) => position(a.id) - position(b.id),
  );
  const events = [...cast.model.events.values()].filter((e) => e.locationId === entry.id || e.entryIds.includes(entry.id));
  const threads = [...cast.model.threads.values()].filter((t) => t.locationIds.includes(entry.id));
  return {
    title: 'Where it figures',
    empty:
      chapters.length === 0 && events.length === 0 && threads.length === 0
        ? `No chapter, event or plot thread refers to ${entry.name} yet.`
        : null,
    chapters:
      chapters.length === 0
        ? null
        : { heading: 'Linked in the text of:', items: chapters.map((n) => ({ id: n.id, name: documentName(cast, n.id) })) },
    events: events.length === 0 ? null : `Timeline events: ${events.map((e) => e.name).join(', ')}`,
    threads: threads.length === 0 ? null : `Plot threads here: ${threads.map((t) => t.title).join(', ')}`,
  };
}

// ---------------------------------------------------------------------------------------------------- delete

/** The question before deleting (hold to confirm): what refers to the entry, and that a restore point is kept. */
export function deleteDialog(refs: EntryReferences, entry: Entry, kind: Category) {
  const said = [
    ...(refs.links > 0 ? [`${plural(refs.links, 'link')} to other records (removed with it)`] : []),
    ...(refs.chapters > 0 ? [`${plural(refs.chapters, 'chapter')} linking to it in the text (the words stay)`] : []),
    ...(refs.events > 0 ? [`${plural(refs.events, 'timeline event')} naming it (kept; they show it as deleted)`] : []),
    ...(refs.threads > 0 ? [`${plural(refs.threads, 'plot thread')} naming it (kept)`] : []),
    ...(refs.fields > 0 ? [`${plural(refs.fields, 'other entry', 'other entries')} with a field linking to it (kept)`] : []),
    ...(refs.plans > 0 ? [`${plural(refs.plans, 'chapter plan')} listing it (kept)`] : []),
  ];
  return {
    title: `Delete ${entry.name}?`,
    message: [
      `This deletes the ${dartToLowerCase(kind.singular)} ${entry.name}.`,
      said.length === 0 ? 'Nothing else in the novel refers to it.' : `It is referred to elsewhere:\n• ${said.join('\n• ')}`,
      'A restore point is kept first (Settings → Restore points), so it can be brought back.',
    ].join('\n\n'),
    confirm: 'Delete',
  };
}

/** Said once deleted (with **Undo**, which restores the restore point and opens the entry again), or when it failed. */
export const deleteWords = {
  deleted: (name: string) => `Deleted ${name}.`,
  undo: 'Undo',
  failed: (e: unknown) => `Deleting failed, and nothing was changed: ${e instanceof Error ? e.message : String(e)}`,
} as const;
