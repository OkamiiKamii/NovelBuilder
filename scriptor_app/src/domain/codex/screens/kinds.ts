// CATEGORIES & FIELDS (FEATURES.md #212–#214, #216–#218): where the novel's kinds of record and their field sets are
// shaped. Every change is to structure only: no entry and no value an author wrote is ever deleted, and a removed field
// is archived and can be brought back. Custom categories archive and restore; built-ins cannot be archived. The page
// shows a chooser of the categories (each with its count), "New category" and "Or start from a preset…", the chosen
// category's editor (its name, what one of them is, its colour, "Show in the knowledge graph", "Save X as a template";
// its live fields, each a row; "Add a field"; the views' settings, kindUses.ts; the archived fields with Restore;
// archive or restore the category), then Templates (save all categories, add from a built-in or saved one, the saved
// ones with Delete).
//
// The pure parts of flutter_app/lib/features/codex/kinds_page.dart. A press is returned as a change to run inside
// CodexChanges (`(c) => …`); templates go through TemplateStore (templates.ts). Changes to a field list are made
// against the category as stored at that moment (`fieldsChange`), so quick edits build on each other; typing is saved
// a moment later under the key given (`later`, the autosave key `kind:<key>:<what>`).

import { plural } from '../../desk/format';
import { localeCompare } from '../../exchange/collation';
import type { JsonMap } from '../../json';
import { dartSort } from '../../manuscript/dartSort';
import { type Category, type FieldDef, type FieldType, fieldTypeLabel, fieldTypes } from '../../records/category';
import { dartDoubleToString, dartNumTryParse } from '../../records/dartNum';
import type { Entry } from '../../records/entry';
import { maps } from '../../records/jsonRecord';
import { dartToLowerCase, dartTrim } from '../../text/dartString';
import { type CodexChanges, customColors } from '../codexChanges';
import type { SavedTemplate } from '../templates';
import { templateLicenseLabel, templateLicenseOf } from '../templates';
import type { TypePreset } from '../typePresets';

export const kindsWords = {
  title: 'Categories & fields',
  noNovel: 'No novel open',
  noNovelMessage: 'Categories belong to a novel. Open one from the Library.',
  goToLibrary: 'Go to Library',
  backToWorld: 'The world',
  backToWorldPath: '/organize/world',
  category: 'Category',
  newCategory: 'New category',
  newCategoryHint: 'Kingdoms',
  addCategory: 'Add category',
  fromPreset: 'Or start from a preset…',
  fromPresetTooltip: 'Start a kind of record from a preset',
  categoryName: 'Category name',
  singular: 'One of them is a…',
  colour: 'Colour',
  characterCaption:
    'The fields every character shares: offered on every profile, under Details. Fields for one character alone are ' +
    'added on their profile.',
  graph: 'Show in the knowledge graph',
  graphTooltip: 'Its records stay everywhere else either way.',
  noFields: 'No fields yet.',
  addField: 'Add a field',
  newFieldName: 'New field',
  archivedTitle: 'Archived fields',
  archivedCaption: 'Removing a field only hides it. What you wrote in it is kept, and comes back if you restore it.',
  restore: 'Restore',
  // A field's row.
  fieldName: 'Field name',
  type: 'Type',
  choices: 'Choices, separated by commas',
  required: 'Required',
  requiredTooltip: 'Said at the field when it is empty; never stops an entry being saved.',
  lowest: 'Lowest',
  highest: 'Highest',
  linksTo: 'Links to',
  anyKind: 'Any kind of entry',
  help: 'Help shown with the field (optional)',
  // Templates.
  templates: 'Templates',
  templateName: 'Template name',
  templateNameHint: 'Save all categories & fields as a template…',
  saveTemplate: 'Save template',
  addFromTemplate: 'Add categories and fields from a template…',
  addFromTemplateTooltip: 'Add categories and fields from a template',
  builtIn: 'Built in',
  yours: 'Yours',
  yourTemplates: 'Your templates',
  delete: 'Delete',
} as const;

// ------------------------------------------------------------------------------------------------- the categories

/** The categories in the chooser's order: by their order, then by name. */
export function kindsInOrder(categories: Iterable<Category>): Category[] {
  return dartSort([...categories], (a, b) => (a.order !== b.order ? a.order - b.order : localeCompare(a.name, b.name)));
}

/** The category shown: the one chosen, else the first that is not Characters. */
export function chosenKind(kinds: readonly Category[], key: string | null): Category {
  const found = kinds.find((k) => k.key === key);
  if (found !== undefined) return found;
  const first = kinds.find((k) => k.key !== 'character');
  if (first === undefined) throw new Error('Bad state: No element');
  return first;
}

/** How many entries a category holds. */
export function entryCount(entries: readonly Entry[], kind: Category): number {
  return entries.filter((e) => e.category === kind.key).length;
}

/** A category in the chooser: "Places · 4 entries", or "· archived". */
export function kindChoiceLabel(kind: Category, count: number): string {
  return `${kind.name} · ${kind.archived ? 'archived' : plural(count, 'entry', 'entries')}`;
}

/** "Add category": a change making the category typed, or null when nothing is typed. The new category's key is what
 * the change returns; it is then the one shown. */
export function addCategory(name: string): ((c: CodexChanges) => Category) | null {
  if (dartTrim(name).length === 0) return null;
  return (c) => c.saveCategory(null, () => ({ name }));
}

/** A preset chosen: what it adds, and then which category to show (the one named as the preset, if there) and what is
 * said. */
export function addPreset(p: TypePreset): (c: CodexChanges) => Category[] {
  return (c) => c.addKinds(p.categories);
}
export function presetAdded(after: readonly Category[], p: TypePreset): { show: string | null; tell: string } {
  const made = after.find((c) => dartToLowerCase(dartTrim(c.name)) === dartToLowerCase(p.name));
  return {
    show: made?.key ?? null,
    tell: `Added “${p.name}” with its fields. Rename, retype or remove any of them.`,
  };
}

// ------------------------------------------------------------------------------------------------- the field set

/** A change to the field set of `kindKey`, made against the category as stored when it runs. */
export function fieldsChange(kindKey: string, change: (stored: JsonMap[]) => JsonMap[]): (c: CodexChanges) => Category {
  return (c) => c.saveCategory(kindKey, (current) => ({ fields: change(maps(current!.raw['fields']).map((f) => f)) }));
}

/** The autosave key of typing into a category's part (`what`: name, singular, `<field id>:name`, …). */
export function kindSaveKey(kindKey: string, what: string): string {
  return `kind:${kindKey}:${what}`;
}

/** One field changed by `patch` (a null value removes that key). */
export function editField(stored: readonly JsonMap[], id: string, patch: JsonMap): JsonMap[] {
  return stored.map((f) => {
    if (f['id'] !== id) return f;
    const next: JsonMap = { ...f, ...patch };
    for (const k of Object.keys(next)) if (next[k] === null || next[k] === undefined) delete next[k];
    return next;
  });
}

/** A live field moved up (-1) or down (+1) among the live ones; the archived ones stay after them. Out of range: as
 * stored. */
export function moveField(stored: readonly JsonMap[], id: string, by: number): JsonMap[] {
  const live = stored.filter((f) => f['archived'] !== true);
  const from = live.findIndex((f) => f['id'] === id);
  const to = from + by;
  if (from < 0 || to < 0 || to >= live.length) return [...stored];
  const moving = live[from];
  live[from] = live[to];
  live[to] = moving;
  return [...live, ...stored.filter((f) => f['archived'] === true)];
}

/** "Add a field": a short text field called "New field", after the live ones. */
export function addField(stored: readonly JsonMap[], id: string): JsonMap[] {
  return [
    ...stored.filter((f) => f['archived'] !== true),
    { id, name: kindsWords.newFieldName, type: 'text', options: [] },
    ...stored.filter((f) => f['archived'] === true),
  ];
}

/** The patches of a field's row. Typed values are saved only when there is something (a name), as the Flutter page. */
export const fieldPatch = {
  name: (v: string): JsonMap | null => (dartTrim(v).length === 0 ? null : { name: v }),
  type: (t: FieldType): JsonMap => ({ type: t }),
  options: (v: string): JsonMap => ({ options: v.split(',').filter((o) => dartTrim(o).length > 0).map(dartTrim) }),
  required: (on: boolean): JsonMap => ({ required: on ? true : null }),
  min: (v: string): JsonMap => ({ min: dartNumTryParse(dartTrim(v)) }),
  max: (v: string): JsonMap => ({ max: dartNumTryParse(dartTrim(v)) }),
  target: (v: string | null): JsonMap => ({ target: v === null || v.length === 0 ? null : v }),
  help: (v: string): JsonMap => ({ help: dartTrim(v).length === 0 ? null : v }),
  archive: (): JsonMap => ({ archived: true }),
  restore: (): JsonMap => ({ archived: null }),
};

/** A number as typed back into a box: no thousands separators, no trailing ".0". A whole number past Dart's 64-bit
 * integers reads as the largest one, as Dart's `toInt` saturates. */
export function plainNumber(n: number): string {
  if (!Number.isFinite(n) || n !== Math.round(n)) return dartDoubleToString(n);
  if (n >= 9223372036854775807) return '9223372036854775807';
  if (n <= -9223372036854775808) return '-9223372036854775808';
  return BigInt(n).toString();
}

/** A field's row: its name, type and the type's choices, the move and archive buttons, the choices box (a Choice), the
 * Lowest and Highest boxes (a Number), the "Links to" chooser (a Link), and its help. */
export function fieldRow(
  def: FieldDef,
  args: { first: boolean; last: boolean; kinds: readonly Category[] },
): {
  id: string;
  name: string;
  type: FieldType;
  types: { value: FieldType; label: string }[];
  up: { tooltip: string; enabled: boolean };
  down: { tooltip: string; enabled: boolean };
  archiveTooltip: string;
  choices: string | null;
  required: boolean;
  numbers: { min: string; max: string } | null;
  linksTo: { value: string; choices: { value: string; label: string }[] } | null;
  help: string;
} {
  const type = def.type ?? 'text';
  const isLink = type === 'reference' || type === 'references';
  return {
    id: def.id,
    name: def.name,
    type,
    types: fieldTypes.map((t) => ({ value: t, label: fieldTypeLabel[t] })),
    up: { tooltip: `Move ${def.name} up`, enabled: !args.first },
    down: { tooltip: `Move ${def.name} down`, enabled: !args.last },
    archiveTooltip: `Remove ${def.name} (archived: values already written are kept)`,
    choices: type === 'select' || type === 'multiselect' ? def.options.join(', ') : null,
    required: def.required,
    numbers:
      type === 'number'
        ? { min: def.min === null ? '' : plainNumber(def.min), max: def.max === null ? '' : plainNumber(def.max) }
        : null,
    linksTo: isLink
      ? {
          value: args.kinds.some((k) => k.key === def.target) ? def.target! : '',
          choices: [{ value: '', label: kindsWords.anyKind }, ...args.kinds.map((k) => ({ value: k.key, label: k.name }))],
        }
      : null,
    help: def.help ?? '',
  };
}

// --------------------------------------------------------------------------------------------- a category's editor

/** The chosen category's editor: what it is called, its colours, the knowledge-graph switch and the template button
 * (not for Characters), its live fields and its archived ones, and archiving (custom categories only). */
export function kindEditor(
  kind: Category,
  entries: readonly Entry[],
  count: number,
): {
  title: string;
  caption: string | null;
  isCharacter: boolean;
  name: string;
  singular: string;
  colours: { color: string; chosen: boolean; label: string }[];
  graph: { on: boolean } | null;
  saveTemplate: string | null;
  fieldsTitle: string;
  active: FieldDef[];
  archived: { def: FieldDef; title: string; subtitle: string; restoreLabel: string }[];
  archive: { said: string; button: string } | null;
} {
  const isCharacter = kind.key === 'character';
  const usedBy = (def: FieldDef) =>
    entries.filter(
      (e) => e.category === kind.key && e.fields.some((f) => f.defId === def.id && dartTrim(f.value).length > 0),
    ).length;
  const colours = [...new Set([kind.color, ...customColors])];
  return {
    title: kind.name,
    caption: isCharacter ? kindsWords.characterCaption : null,
    isCharacter,
    name: kind.name,
    singular: kind.singular,
    colours: colours.map((color) => ({
      color,
      chosen: kind.color === color,
      label: `Colour ${color}${kind.color === color ? ', chosen' : ''}`,
    })),
    graph: isCharacter ? null : { on: kind.raw['graph'] !== false },
    saveTemplate: isCharacter ? null : `Save ${kind.name} as a template`,
    fieldsTitle: `Fields every ${dartToLowerCase(kind.singular)} has`,
    active: kind.fields.filter((f) => !f.archived),
    archived: kind.fields
      .filter((f) => f.archived)
      .map((def) => {
        const n = usedBy(def);
        return {
          def,
          title: def.name,
          subtitle: `${def.type !== null ? fieldTypeLabel[def.type] : 'Short text'} · ${
            n > 0 ? `still filled in on ${plural(n, 'entry', 'entries')}` : 'no values'
          }`,
          restoreLabel: `Restore ${def.name}`,
        };
      }),
    archive: kind.builtin
      ? null
      : {
          said: kind.archived
            ? 'Archived: no new entries can be added; existing ones are kept.'
            : `Archiving hides this category from “New entry”. Its ${plural(count, 'entry is', 'entries are')} kept.`,
          button: kind.archived ? 'Restore category' : 'Archive category',
        },
  };
}

/** The presses of a category's head. Typed name and singular are saved only when not blank. */
export const kindPatch = {
  name: (v: string): JsonMap | null => (dartTrim(v).length === 0 ? null : { name: v }),
  singular: (v: string): JsonMap | null => (dartTrim(v).length === 0 ? null : { singular: v }),
  color: (color: string): JsonMap => ({ color }),
  graph: (on: boolean): JsonMap => ({ graph: on }),
  archived: (kind: Category): JsonMap => ({ archived: !kind.archived }),
};

/** A change saving `patch` on the category `kindKey`. */
export function saveKind(kindKey: string, patch: JsonMap): (c: CodexChanges) => Category {
  return (c) => c.saveCategory(kindKey, () => patch);
}

// --------------------------------------------------------------------------------------------------- templates

/** "Save X as a template": what is kept (the store's `save` arguments) and what is said after. */
export function kindAsTemplate(kind: Category, categories: readonly JsonMap[]): {
  name: string;
  description: string;
  categories: readonly JsonMap[];
  tell: (savedName: string) => string;
} {
  return {
    name: kind.name,
    description: `One kind of record: ${kind.name}`,
    categories,
    tell: (savedName) => `Saved “${savedName}” as a template, to add to any novel.`,
  };
}

/** "Save template" (every category): its description, and what is said after. */
export function allAsTemplate(data: readonly JsonMap[]): { description: string; tell: (savedName: string) => string } {
  return {
    description: plural(data.length, 'category', 'categories'),
    tell: (savedName) =>
      `Saved “${savedName}”. Pick it when you create a new novel, or add it to any novel here.`,
  };
}

/** What is said after a template's categories were added. */
export function templateAdded(name: string): string {
  return `Added what was missing from “${name}”. Nothing existing was changed.`;
}

/** What is said after a saved template was deleted. */
export function templateDeleted(name: string): string {
  return `Deleted the template “${name}”. No novel was changed.`;
}

/** The menu of templates to add: the built-in ones, then the author's own (when there are any). */
export function templateMenu(
  builtIn: readonly TypePreset[],
  saved: readonly SavedTemplate[],
): { heading: string; items: { name: string; description: string; categories: readonly JsonMap[] }[] }[] {
  const groups: { heading: string; items: { name: string; description: string; categories: readonly JsonMap[] }[] }[] = [
    {
      heading: kindsWords.builtIn,
      items: builtIn.map((p) => ({ name: p.name, description: p.description, categories: p.categories })),
    },
  ];
  if (saved.length > 0) {
    groups.push({
      heading: kindsWords.yours,
      items: saved.map((t) => ({ name: t.name, description: t.description, categories: t.categories })),
    });
  }
  return groups;
}

/** A saved template in "Your templates": its name and, under it, its description and, for one received as a file,
 * whose it is, which version and on what terms. */
export function savedTemplateRow(t: SavedTemplate): { id: string; title: string; subtitle: string; deleteLabel: string } {
  const lines: string[] = [];
  if (t.description.length > 0) lines.push(t.description);
  const s = t.shared;
  if (s !== null) {
    const author = typeof s['author'] === 'string' ? s['author'] : '';
    const version = s['version'] ?? 1;
    lines.push(
      `Version ${typeof version === 'number' ? plainNumber(version) : String(version)}, made by ${
        author.length === 0 ? 'someone unnamed' : author
      } · ${templateLicenseLabel[templateLicenseOf(s['license'])]}`,
    );
  }
  return { id: t.id, title: t.name, subtitle: lines.join('\n'), deleteLabel: `Delete template ${t.name}` };
}
