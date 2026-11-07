import { CATEGORY_COLORS, CATEGORY_LABELS, CATEGORY_SINGULAR, FIELD_TYPES, LORE_CATEGORIES, SUGGESTED_FIELDS, type Category, type CategorySchema, type FieldDef, type FieldType, type LoreEntry, type LoreField } from './types';

/** A built-in category as it is before the author changes anything. */
export function builtinCategory(key: string): Category {
  return {
    key,
    name: CATEGORY_LABELS[key],
    singular: CATEGORY_SINGULAR[key],
    color: CATEGORY_COLORS[key],
    builtin: true,
    order: LORE_CATEGORIES.indexOf(key as never),
    // Fixed ids, so a value written before the project customised anything is still found afterwards.
    fields: SUGGESTED_FIELDS[key].map((name, i) => ({ id: `builtin-${key}-${i}`, name, type: 'longtext', options: [] })),
  };
}

/** A project's categories: the built-ins (with any changes the project made) followed by its own, in order. */
export function resolveCategories(rows: CategorySchema[]): Category[] {
  const stored = new Map(rows.map((row) => [row.key, row]));
  const builtins = LORE_CATEGORIES.map((key) => stored.get(key) ?? builtinCategory(key));
  const custom = rows.filter((row) => !LORE_CATEGORIES.includes(row.key as never));
  return [...builtins, ...custom].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

/** Stands in for a category that cannot be found (it should not happen; nothing is lost if it does). */
export const unknownCategory = (key: string): Category => ({ key, name: 'Uncategorised', singular: 'Entry', color: '#5c6370', builtin: false, order: 9999, fields: [] });

export const isFieldType = (value: unknown): value is FieldType => FIELD_TYPES.includes(value as FieldType);
export const splitChoices = (value: string): string[] => value.split('\n').map((v) => v.trim()).filter(Boolean);

/** A value as a reader should see it: "Yes", "Fire, Ash", the linked entry's name… */
export function displayValue(field: { type?: FieldType; value: string }, nameOf: (entryId: string) => string | undefined): string {
  const value = field.value;
  if (!value.trim()) return '';
  if (field.type === 'toggle') return value === 'yes' ? 'Yes' : value === 'no' ? 'No' : value;
  if (field.type === 'multiselect' || field.type === 'tags') return splitChoices(value).join(', ');
  if (field.type === 'reference') return nameOf(value) ?? '';
  if (field.type === 'references') return splitChoices(value).flatMap((id) => nameOf(id) ?? []).join(', ');
  return value;
}

export interface FieldView {
  /** The category's current fields, each with this entry's stored value if it has one. */
  category: { def: FieldDef; field: LoreField | undefined }[];
  /** Fields that belong to this entry alone. */
  own: LoreField[];
  /** Values this entry still holds for fields the category has archived. */
  archived: { def: FieldDef; field: LoreField }[];
}

/**
 * Lines an entry's stored values up with its category's field set.
 *
 * Nothing is ever dropped here: a value whose field was archived is listed
 * under `archived`; a value whose field belongs to a different category (the
 * entry was moved) or no longer exists is listed under `own`, so it stays
 * visible and editable.
 */
export function viewFields(entry: Pick<LoreEntry, 'fields'>, category: Category): FieldView {
  const claimed = new Set<string>();
  const byDef = new Map(entry.fields.filter((f) => f.defId).map((f) => [f.defId!, f]));
  const active = category.fields.filter((def) => !def.archived);

  const forCategory = active.map((def) => {
    // A value written before the field set existed is matched by name, once.
    const field = byDef.get(def.id) ?? entry.fields.find((f) => !f.defId && !claimed.has(f.id) && f.key.trim().toLowerCase() === def.name.trim().toLowerCase());
    if (field) claimed.add(field.id);
    return { def, field };
  });
  const archived = category.fields.flatMap((def) => {
    const field = def.archived ? byDef.get(def.id) : undefined;
    if (!field || !field.value.trim()) return [];
    claimed.add(field.id);
    return [{ def, field }];
  });
  const known = new Set(category.fields.map((def) => def.id));
  const own = entry.fields.filter((f) => !claimed.has(f.id) && (!f.defId || !known.has(f.defId)));
  return { category: forCategory, own, archived };
}

/** The fields of an entry that have something in them, labelled and readable, in display order. */
export function filledFields(entry: Pick<LoreEntry, 'fields'>, category: Category, nameOf: (entryId: string) => string | undefined): { id: string; label: string; text: string }[] {
  const view = viewFields(entry, category);
  return [
    ...view.category.flatMap(({ def, field }) => (field ? [{ id: field.id, label: def.name, text: displayValue({ type: def.type, value: field.value }, nameOf) }] : [])),
    ...view.own.map((field) => ({ id: field.id, label: field.key || 'Untitled field', text: displayValue(field, nameOf) })),
  ].filter((f) => f.text.trim());
}
