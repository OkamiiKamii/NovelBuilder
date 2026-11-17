// Codex categories and their field sets (`loreSchemas`). A port of flutter_app/lib/shared/domain/records/category.dart.

import { localeCompare } from '../collation';
import { type JsonMap, mapOrNull, numOrNull, str, strOrNull } from '../json';
import { compareNum, dartSort } from '../manuscript/dartSort';
import { JsonRecord, boolOf, freezeMap, maps, strings } from './jsonRecord';

/** Field types for custom fields. Values are always stored as text, whatever the type, so retyping a field can never
 * destroy what was written: number "42"; toggle "yes"/"no"; date "yyyy-mm-dd"; several choices or tags one per line;
 * a link the linked entry's id; several links their ids, one per line. */
export type FieldType =
  | 'text'
  | 'longtext'
  | 'number'
  | 'select'
  | 'multiselect'
  | 'tags'
  | 'toggle'
  | 'date'
  | 'reference'
  | 'references';

/** In the Dart enum's order. */
export const fieldTypes: readonly FieldType[] = [
  'text',
  'longtext',
  'number',
  'select',
  'multiselect',
  'tags',
  'toggle',
  'date',
  'reference',
  'references',
];

export const fieldTypeLabel: Readonly<Record<FieldType, string>> = {
  text: 'Short text',
  longtext: 'Long text',
  number: 'Number',
  select: 'Choice (one)',
  multiselect: 'Choice (several)',
  tags: 'Tags / list',
  toggle: 'Yes / No',
  date: 'Date',
  reference: 'Link to an entry',
  references: 'Links to several entries',
};

/** Dart's `FieldType.isLink`. */
export function isLinkType(type: FieldType | null): boolean {
  return type === 'reference' || type === 'references';
}

/** Dart's `FieldType.of`. */
export function fieldTypeOf(value: unknown): FieldType | null {
  return fieldTypes.find((t) => t === value) ?? null;
}

/** One field of a category's field set.
 *
 * NON-DESTRUCTIVE SCHEMA RULE: a field is never deleted, only archived. Values entries hold for it stay stored. */
export class FieldDef {
  readonly raw: JsonMap;
  constructor(raw: JsonMap) {
    this.raw = freezeMap(raw);
  }

  /** Permanent: entries store their value against it, so the field can be renamed or retyped freely. */
  get id(): string {
    return str(this.raw['id']);
  }
  get name(): string {
    return str(this.raw['name']);
  }
  /** Null for a type this version does not know (kept as stored, shown as text). */
  get type(): FieldType | null {
    return fieldTypeOf(this.raw['type']);
  }
  get options(): string[] {
    return strings(this.raw['options']);
  }
  get archived(): boolean {
    return boolOf(this.raw['archived']);
  }
  /** Checked and shown, never enforced: an entry can be saved half-done. */
  get required(): boolean {
    return boolOf(this.raw['required']);
  }
  get help(): string | null {
    return strOrNull(this.raw['help']);
  }
  get min(): number | null {
    return numOrNull(this.raw['min']);
  }
  get max(): number | null {
    return numOrNull(this.raw['max']);
  }
  /** For a link: the category key linked entries should have; any when absent. */
  get target(): string | null {
    return strOrNull(this.raw['target']);
  }
}

/** The categories every project starts with. Their keys are fixed; names, colours and fields can change. */
export const builtinCategoryKeys: readonly string[] = ['character', 'location', 'faction', 'item', 'power', 'lore'];

const builtinNames: Record<string, readonly [string, string, string]> = {
  character: ['Characters', 'Character', '#b4532a'],
  location: ['Locations', 'Location', '#3f7d4e'],
  faction: ['Factions & Species', 'Faction / Species', '#3d5fa8'],
  item: ['Items & Artifacts', 'Item / Artifact', '#8a6d1f'],
  power: ['Power Systems & Rules', 'Power System / Rule', '#7a4fa3'],
  lore: ['Lore & History', 'Lore / History', '#5c6370'],
};

const suggestedFields: Record<string, readonly string[]> = {
  character: [],
  location: ['Type', 'Region', 'Notable features'],
  faction: ['Type', 'Leader', 'Goals'],
  item: ['Type', 'Owner', 'Abilities'],
  power: ['Rules', 'Costs & limits', 'Tiers'],
  lore: ['When', 'Who was involved', 'Consequences'],
};

/** A codex category with its field set: a built-in (with the project's changes) or one the author created. A project's
 * stored version of one is a row of `loreSchemas`. */
export class Category extends JsonRecord {
  /** A built-in category as it is before the author changes anything. Its field ids are fixed (`builtin-<key>-<n>`),
   * so values written before the project customised anything are still found. Throws for a key that is not built in
   * (Dart's `!`). */
  static builtin(key: string): Category {
    const names = builtinNames[key];
    if (!Object.prototype.hasOwnProperty.call(builtinNames, key)) throw new TypeError(`Not a built-in category: ${key}`);
    const [name, singular, color] = names;
    return new Category({
      key,
      name,
      singular,
      color,
      builtin: true,
      order: builtinCategoryKeys.indexOf(key),
      fields: suggestedFields[key].map((f, i) => ({ id: `builtin-${key}-${i}`, name: f, type: 'longtext', options: [] })),
    });
  }

  /** Stands in for a category that cannot be found. Nothing is lost if this happens. */
  static unknown(key: string): Category {
    return new Category({
      key,
      name: 'Uncategorised',
      singular: 'Entry',
      color: '#5c6370',
      builtin: false,
      order: 9999,
      fields: [],
    });
  }

  get key(): string {
    return str(this.raw['key']);
  }
  get name(): string {
    return str(this.raw['name']);
  }
  get singular(): string {
    return str(this.raw['singular']);
  }
  get color(): string {
    return str(this.raw['color']);
  }
  get builtin(): boolean {
    return boolOf(this.raw['builtin']);
  }
  get order(): number {
    return numOrNull(this.raw['order']) ?? 0;
  }
  get archived(): boolean {
    return boolOf(this.raw['archived']);
  }
  get fields(): FieldDef[] {
    return maps(this.raw['fields']).map((f) => new FieldDef(f));
  }
  /** Which fields the views read, set by the author and never worked out from field names (`uses` in the file). */
  get uses(): JsonMap {
    return mapOrNull(this.raw['uses']) ?? {};
  }
}

/** A project's categories: the built-ins (with any changes) followed by its own, sorted by order, then name. */
export function resolveCategories(stored: readonly Category[]): Category[] {
  const byKey = new Map<string, Category>();
  for (const c of stored) byKey.set(c.key, c);
  const builtins = builtinCategoryKeys.map((key) => byKey.get(key) ?? Category.builtin(key));
  const custom = stored.filter((c) => !builtinCategoryKeys.includes(c.key));
  return dartSort([...builtins, ...custom], (a, b) => {
    const byOrder = compareNum(a.order, b.order);
    return byOrder !== 0 ? byOrder : localeCompare(a.name, b.name);
  });
}
