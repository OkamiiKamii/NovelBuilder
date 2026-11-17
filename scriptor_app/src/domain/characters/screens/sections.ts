// SECTIONS AND FIELDS: the sections of one tab of a profile, each a card of fields; with the hidden ones put away, the
// fields that belong to no section, and a way to add a section. Every field shown is a field of the character's one
// record. Under Details it also offers the fields every character of the novel shares. The pure parts of
// flutter_app/lib/features/characters/widgets/sections_view.dart.
//
// What a press changes (all CharacterChanges, at once unless said):
//  - a shared field offered: setFieldValue(entryId, defId, '');
//  - a hidden section's Show: updateSection(entryId, sectionId, { hidden: false });
//  - Add a section: addSection(entryId, name, tab) (nothing for a blank name);
//  - a section's menu (sectionMenu): rename, updateSection(…, { name }); up/down, moveSection(…, -1 / 1); duplicate,
//    duplicateSection; tab, updateSection(…, { tab: otherTab }); hide, updateSection(…, { hidden: true }); delete,
//    removeSection(…, { deleteFields }) after removeSectionDialog;
//  - a field's value: typed (autosave under `field:<entryId>:<fieldId>`) or chosen, updateField(entryId, fieldId,
//    fieldCard(…).changeOf(value)): a field of a known shape made before as something else takes its shape then;
//  - its settings: name typed (autosave under `fieldname:<entryId>:<fieldId>`; not while blank), updateField(…,
//    { key }); type, updateField(…, { type }); choices typed (autosave under `fieldoptions:<entryId>:<fieldId>`),
//    updateField(…, { options: text.split('\n') }); section, moveField(…, { toSection }); earlier/later,
//    moveField(…, { by: -1 / 1 }); delete, removeField(entryId, fieldId) after its confirmation;
//  - a suggestion or a field of the author's own: addField(entryId, sectionId, suggestion).

import { checkValue, type FieldIssue, displayValue, splitChoices } from '../../codex/fieldValues';
import { type FieldDef, type FieldType, fieldTypeLabel, fieldTypes } from '../../records/category';
import { type Entry, type EntryField, viewFields } from '../../records/entry';
import { dartTrim } from '../../text/dartString';
import { type CastData } from '../castData';
import {
  type CharacterProfile,
  FieldSuggestion,
  type ProfileSection,
  type ProfileTab,
  profileTabLabel,
} from '../characterRecords';
import { type FieldKind, kindNote, kindOf, settled } from '../fieldKinds';
import { suggestionsFor } from '../templates';

/** One tab's sections, as the view lays them out. */
export function sectionsView(
  cast: CastData,
  entry: Entry,
  profile: CharacterProfile,
  tab: ProfileTab,
): {
  /** The sections shown, in order, each with whether it is first or last (Move up / Move down). */
  visible: { section: ProfileSection; first: boolean; last: boolean }[];
  /** "2 hidden sections", with each one's Show; null when none is hidden. */
  hidden: { title: string; sections: { section: ProfileSection; show: string }[] } | null;
  /** Under Details: the fields that belong to no section, and the shared fields this character has nothing in yet
   * (offered, never forced onto the page); null when there are neither. */
  loose: {
    title: string;
    sharedLink: { label: string; path: string };
    note: string | null;
    offeredTitle: string | null;
    offered: FieldDef[];
    fields: EntryField[];
  } | null;
  addSection: { label: string; prompt: { title: string; label: string; confirm: string } };
} {
  const peers = profile.sections.filter((s) => s.tab === tab);
  const hidden = peers.filter((s) => s.hidden);
  const placed = new Set(profile.sections.flatMap((s) => s.fieldIds));
  const loose =
    tab === 'details'
      ? entry.fields.filter(
          (f) => !placed.has(f.id) && (dartTrim(f.key).length > 0 || dartTrim(f.value).length > 0),
        )
      : [];
  const offered =
    tab === 'details'
      ? viewFields(entry, cast.characterCategory)
          .category.filter(([, field]) => field === null)
          .map(([def]) => def)
      : [];
  const visible = peers.filter((s) => !s.hidden);
  return {
    visible: visible.map((s) => ({
      section: s,
      first: s.id === visible[0].id,
      last: s.id === visible[visible.length - 1].id,
    })),
    hidden:
      hidden.length === 0
        ? null
        : {
            title: `${hidden.length} hidden ${hidden.length === 1 ? 'section' : 'sections'}`,
            sections: hidden.map((s) => ({ section: s, show: `Show the section ${s.name}` })),
          },
    loose:
      loose.length === 0 && offered.length === 0
        ? null
        : {
            title: `Fields without a section (${loose.length})`,
            sharedLink: { label: 'Shared fields…', path: '/organize/world/kinds?kind=character' },
            note:
              loose.length > 0
                ? 'Shared by every character, or left behind by a section that was removed. Open one to give it a section.'
                : null,
            offeredTitle: offered.length > 0 ? 'Shared by every character:' : null,
            offered,
            fields: loose,
          },
    addSection: {
      label: 'Add a section',
      prompt: { title: 'Add a section', label: 'Section name', confirm: 'Add section' },
    },
  };
}

/** A section's card: its title with how many fields it holds, and those fields in order. */
export function sectionCard(entry: Entry, section: ProfileSection): { title: string; fields: EntryField[]; menuTooltip: string } {
  const byId = new Map(entry.fields.map((f) => [f.id, f]));
  const fields = section.fieldIds.flatMap((id) => {
    const f = byId.get(id);
    return f === undefined ? [] : [f];
  });
  return { title: `${section.name} (${fields.length})`, fields, menuTooltip: `Options for the section ${section.name}` };
}

export type SectionMenuItem = 'rename' | 'up' | 'down' | 'duplicate' | 'tab' | 'hide' | 'delete';

/** A section's menu, each item with its words and whether it can be chosen. */
export function sectionMenu(
  section: ProfileSection,
  place: { first: boolean; last: boolean },
): { item: SectionMenuItem; label: string; enabled: boolean }[] {
  return [
    { item: 'rename', label: 'Rename', enabled: true },
    { item: 'up', label: 'Move up', enabled: !place.first },
    { item: 'down', label: 'Move down', enabled: !place.last },
    { item: 'duplicate', label: 'Duplicate (fields empty)', enabled: true },
    {
      item: 'tab',
      label: section.tab === 'overview' ? 'Move to the Details tab' : 'Move to the Overview tab',
      enabled: true,
    },
    { item: 'hide', label: 'Hide', enabled: true },
    { item: 'delete', label: 'Delete…', enabled: true },
  ];
}

/** The tab a section moves to from its menu. */
export function otherTab(section: ProfileSection): ProfileTab {
  return section.tab === 'overview' ? 'details' : 'overview';
}

/** Renaming a section: the prompt. */
export function renameSectionPrompt(section: ProfileSection): {
  title: string;
  label: string;
  initial: string;
  confirm: string;
} {
  return { title: 'Rename the section', label: 'Section name', initial: section.name, confirm: 'Rename' };
}

/** Deleting a section: an empty one is only confirmed; one with fields asks whether they go too (`deleteFields` true
 * for "Also delete…", false for "Delete section only"). */
export function removeSectionDialog(
  section: ProfileSection,
  count: number,
):
  | { empty: true; title: string; message: string; confirm: string }
  | { empty: false; title: string; message: string; cancel: string; alsoFields: string; sectionOnly: string } {
  const title = `Delete the section “${section.name}”?`;
  if (count === 0) return { empty: true, title, message: 'The section is empty.', confirm: 'Delete section' };
  return {
    empty: false,
    title,
    message:
      `It holds ${count === 1 ? '1 field' : `${count} fields`}. Unless you say otherwise they stay on the character, ` +
      'listed under “Fields without a section” on the Details tab.',
    cancel: 'Cancel',
    alsoFields: `Also delete ${count === 1 ? 'that field' : 'those fields'}`,
    sectionOnly: 'Delete section only',
  };
}

/** One field, as its card shows and edits it. */
export type FieldCard = {
  field: EntryField;
  /** A field every character shares takes its name, type and choices from the shared set. */
  def: FieldDef | null;
  /** A field whose answer has a known shape (a Gender is chosen, an Age is a number) is shown and edited that way,
   * whatever it was made as. */
  kind: FieldKind | null;
  type: FieldType;
  options: readonly string[];
  /** The value as its kind reads it ("male" reads Male). */
  value: string;
  /** Whether a value written now also gives the field its known shape. */
  reshape: boolean;
  name: string;
  required: boolean;
  /** "Gender *": the field's label. */
  label: string;
  /** What a link can point at: the other characters by name, then every other entry (limited to the shared field's
   * kind when it has one). */
  linkable: Entry[];
  /** The value as read ("Yes", a linked entry's name); '' when there is none. */
  shown: string;
  /** In place of an empty value: "Not recorded", or "The linked entry was deleted". */
  empty: string | null;
  /** Several choices or tags, as chips. */
  chips: string[] | null;
  /** A shared field's rules: checked and said, never enforced. */
  issue: FieldIssue | null;
  help: string | null;
  /** A link to another character, to open their page ("Open Mira →"). */
  openCharacter: { id: string; label: string } | null;
  editLabel: string;
  /** The updateField changes for a value written or chosen. */
  changeOf: (value: string) => { value: string; type: FieldType | null; options: readonly string[] | null };
  settings: {
    /** For a shared field: its settings are the shared set's. */
    shared: string | null;
    /** The field's own name (not for a shared field). */
    name: string | null;
    /** What a field of a known shape is ("Gender is a choice: Male or Female."), in place of the type menu. */
    kindNote: string | null;
    types: { value: FieldType; label: string }[] | null;
    typeHelper: string;
    /** The choices, one per line, for a choice the author made. */
    choices: string | null;
    /** The section menu: "Not in a section" for a loose field, then the sections. */
    sections: { value: string; label: string }[];
    section: string;
  };
  deleteConfirm: { title: string; message: string; confirm: string; label: string };
};

export function fieldCard(
  cast: CastData,
  entry: Entry,
  profile: CharacterProfile,
  field: EntryField,
  section: ProfileSection | null,
): FieldCard {
  const def = field.defId === null ? null : (cast.characterCategory.fields.find((d) => d.id === field.defId) ?? null);
  const kind = def === null ? kindOf(field.key) : null;
  const type: FieldType = def?.type ?? kind?.type ?? field.type ?? 'text';
  const options = def?.options ?? kind?.options ?? field.options;
  const value = settled(kind, field.value);
  const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
  const reshape =
    kind !== null && (field.type !== kind.type || (kind.options.length > 0 && !sameList(field.options, kind.options)));
  const name = def !== null && def.name.length > 0 ? def.name : field.key.length > 0 ? field.key : 'Untitled field';
  const linkable = [...cast.characters({ except: entry.id }), ...cast.entries.filter((e) => e.category !== 'character')].filter(
    (e) => def?.target == null || e.category === def.target,
  );
  const shown = displayValue(type, value, (id) => cast.nameOf(id));
  const issue = def === null ? null : checkValue(def, field.value, cast.model.entries, { categoryName: (k) => k });
  const required = def?.required ?? false;
  const label = `${name}${required ? ' *' : ''}`;
  const linkedId = type === 'reference' && cast.model.entries.has(field.value) ? field.value : null;
  return {
    field,
    def,
    kind,
    type,
    options,
    value,
    reshape,
    name,
    required,
    label,
    linkable,
    shown,
    empty:
      shown.length === 0
        ? type === 'reference' && field.value.length > 0
          ? 'The linked entry was deleted'
          : 'Not recorded'
        : null,
    chips: shown.length > 0 && (type === 'tags' || type === 'multiselect') ? splitChoices(field.value) : null,
    issue,
    help: def?.help ?? null,
    openCharacter:
      linkedId !== null && cast.model.entries.get(linkedId)!.category === 'character'
        ? { id: linkedId, label: `Open ${cast.nameOf(linkedId)} →` }
        : null,
    editLabel: `Edit ${name}`,
    changeOf: (v) => ({
      value: v,
      type: reshape ? kind!.type : null,
      options: reshape ? kind!.options : null,
    }),
    settings: {
      shared: def !== null ? 'Shared by every character: its name, type and choices are the same on every profile.' : null,
      name: def === null ? field.key : null,
      kindNote: def === null && kind !== null ? kindNote(field.key, kind) : null,
      types: def === null && kind === null ? fieldTypes.map((t) => ({ value: t, label: fieldTypeLabel[t] })) : null,
      typeHelper: 'Changing the type never changes what is written.',
      choices: def === null && kind === null && (type === 'select' || type === 'multiselect') ? field.options.join('\n') : null,
      sections: [
        ...(section === null ? [{ value: '', label: 'Not in a section' }] : []),
        ...profile.sections.map((s) => ({ value: s.id, label: s.name })),
      ],
      section: section?.id ?? '',
    },
    deleteConfirm: {
      title: `Delete the field “${name}”?`,
      message:
        dartTrim(field.value).length === 0
          ? 'It is empty.'
          : 'What is written in it goes too. The change is noted in the character’s history.',
      confirm: 'Delete field',
      label: `Delete the field ${name}`,
    },
  };
}

/** A field's settings' other words. */
export const fieldWords = {
  settings: 'Field settings',
  name: 'Name',
  type: 'Type',
  choices: 'Choices (one per line)',
  section: 'Section',
  earlier: 'Move earlier',
  later: 'Move later',
  done: 'Done',
} as const;

/** What a section offers to add (the fields its name has in any template, less what the character has anywhere on
 * the profile and what every character shares, which is offered once, under Details), and the form for a field of
 * the author's own. An empty section shows its first 6 suggestions straight away; opened, up to 40. */
export function addFieldOffer(
  cast: CastData,
  entry: Entry,
  section: ProfileSection,
  open: boolean,
): {
  suggestions: { field: FieldSuggestion; tooltip: string }[];
  button: { label: string; said: string } | null;
  form: {
    label: string;
    types: { value: FieldType; label: string }[];
    add: string;
    done: string;
    /** The field to add for a name and type typed; null for a blank name. */
    suggestion: (name: string, type: FieldType) => FieldSuggestion | null;
  } | null;
} {
  const have = sectionCard(entry, section).fields.map((f) => f.key);
  const everyone = cast.characterCategory.fields.filter((d) => !d.archived).map((d) => d.name);
  const offered = suggestionsFor(section.name, cast.templates, [...have, ...entry.fields.map((f) => f.key), ...everyone]);
  const showing = open || have.length === 0;
  return {
    suggestions: showing
      ? offered.slice(0, open ? 40 : 6).map((f) => ({ field: f, tooltip: `Add ${f.name} to ${section.name}` }))
      : [],
    button: open ? null : { label: 'Add a field', said: `Add a field to ${section.name}` },
    form: open
      ? {
          label: `New field in ${section.name}`,
          types: fieldTypes.map((t) => ({ value: t, label: fieldTypeLabel[t] })),
          add: 'Add',
          done: 'Done',
          suggestion: (name, type) => (dartTrim(name).length === 0 ? null : new FieldSuggestion(dartTrim(name), type)),
        }
      : null,
  };
}

/** The tabs' names, as a section's tab is said. */
export { profileTabLabel };
