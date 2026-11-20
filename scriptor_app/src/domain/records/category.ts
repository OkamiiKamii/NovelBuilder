// Codex categories and their field sets (`loreSchemas`). A port of flutter_app/lib/shared/domain/records/category.dart.

import { localeCompare } from '../collation';
import { type JsonMap, mapOrNull, numOrNull, str, strOrNull } from '../json';
import { compareNum, dartSort } from '../manuscript/dartSort';
import { dartToLowerCase, dartTrim } from '../text/dartString';
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

/** The categories every project starts with, partners side by side. Their keys are fixed; names, colours and fields can
 * change. Species, artifacts, rules and history were once folded into faction, item, power and lore. */
export const builtinCategoryKeys: readonly string[] = [
  'character',
  'location',
  'faction',
  'species',
  'item',
  'artifact',
  'power',
  'rule',
  'lore',
  'history',
];

/** The four types that were once two: each original key and the newer built-in that took half of it. */
export const typePartners: ReadonlyMap<string, string> = new Map([
  ['faction', 'species'],
  ['item', 'artifact'],
  ['power', 'rule'],
  ['lore', 'history'],
]);

/** The built-ins added after the first six: kept out of view while the novel has a category of the same name. */
const addedKeys: readonly string[] = ['species', 'artifact', 'rule', 'history'];

// Orders of the first built-ins stay as they were stored; each newer one sits halfway to the next.
const builtinOrder: Record<string, number> = {
  character: 0,
  location: 1,
  faction: 2,
  species: 2.5,
  item: 3,
  artifact: 3.5,
  power: 4,
  rule: 4.5,
  lore: 5,
  history: 5.5,
};

const builtinNames: Record<string, readonly [string, string, string]> = {
  character: ['Characters', 'Character', '#b4532a'],
  location: ['Locations', 'Location', '#3f7d4e'],
  faction: ['Factions', 'Faction', '#3d5fa8'],
  species: ['Species', 'Species', '#2b7a8c'],
  item: ['Items', 'Item', '#8a6d1f'],
  artifact: ['Artifacts', 'Artifact', '#a8436b'],
  power: ['Powers', 'Power', '#7a4fa3'],
  rule: ['Rules', 'Rule', '#6b7a2b'],
  lore: ['Lore', 'Lore', '#5c6370'],
  history: ['History', 'Historical event', '#8c2b5a'],
};

/** What four built-ins were called when they held two kinds each: still shown by their new names. */
export const mergedNames: Record<string, readonly [string, string]> = {
  faction: ['Factions & Species', 'Faction / Species'],
  item: ['Items & Artifacts', 'Item / Artifact'],
  power: ['Power Systems & Rules', 'Power System / Rule'],
  lore: ['Lore & History', 'Lore / History'],
};

type SuggestedField = readonly [name: string, type?: FieldType, extra?: JsonMap];

// The first fields of a built-in keep their ids (`builtin-<key>-<n>`): entries store values against them. Add after.
const suggestedFields: Record<string, readonly SuggestedField[]> = {
  character: [],
  location: [['Type'], ['Region'], ['Notable features']],
  faction: [['Type'], ['Leader'], ['Goals']],
  species: [
    ['Lifespan', 'text'],
    ['Homeland', 'reference', { target: 'location' }],
    ['Sapient', 'toggle'],
    ['Traits', 'tags'],
    ['Abilities'],
  ],
  item: [['Type'], ['Owner'], ['Abilities']],
  artifact: [
    ['Origin'],
    ['Current holder', 'reference', { target: 'character' }],
    ['Powers'],
    ['Rank', 'select', { options: ['Common', 'Uncommon', 'Rare', 'Legendary', 'Unique'] }],
    ['Cursed', 'toggle'],
  ],
  power: [['Rules'], ['Costs & limits'], ['Tiers']],
  rule: [['Applies to', 'text'], ['What it says', 'longtext'], ['Exceptions'], ['Cost of breaking it']],
  lore: [['When'], ['Who was involved'], ['Consequences']],
  history: [
    ['When', 'text'],
    ['Who was involved', 'references', { target: 'character' }],
    ['Where', 'reference', { target: 'location' }],
    ['Consequences'],
  ],
};

const sameName = (a: string, b: string) => dartToLowerCase(dartTrim(a)) === dartToLowerCase(dartTrim(b));

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
      order: builtinOrder[key],
      fields: suggestedFields[key].map(([f, type, extra], i) => ({
        id: `builtin-${key}-${i}`,
        name: f,
        type: type ?? 'longtext',
        options: [],
        ...extra,
      })),
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

/** Another category that stands in for a newer built-in by having its name (the author's own, or a renamed built-in), or
 * else by being one of them ("Species & Races", whose singular is "Species"). */
export function standIn(key: string, categories: Iterable<Category>): Category | null {
  if (!addedKeys.includes(key)) return null;
  const [name, singular] = builtinNames[key];
  const list = [...categories].filter((c) => c.key !== key);
  // By name first ("Species"), then by what one of them is called ("Species & Races", a Species), as a genre module's.
  return list.find((c) => sameName(c.name, name)) ?? list.find((c) => sameName(c.singular, singular)) ?? null;
}

/** A built-in shows its new name and singular when it still has the old merged ones (or is not stored); one the author
 * typed stays. Where another category already has the new name, the old merged one is kept so names never repeat. The
 * stored row is not rewritten. */
function freshNames(c: Category, stored: readonly Category[], isStored: boolean): Category {
  const old = mergedNames[c.key];
  if (old === undefined) return c;
  const [name, singular] = builtinNames[c.key];
  const taken = stored.some((o) => o.key !== c.key && sameName(o.name, name));
  const pick = (shown: string, was: string, now: string) => (isStored && shown !== was ? shown : taken ? was : now);
  return new Category(c.merged({ name: pick(c.name, old[0], name), singular: pick(c.singular, old[1], singular) }));
}

/** A project's categories: the built-ins (with any changes) followed by its own, sorted by order, then name. A newer
 * built-in is left out when the author already has a category by its name (until it is stored). */
export function resolveCategories(stored: readonly Category[], inUse: Iterable<string> = []): Category[] {
  const byKey = new Map<string, Category>();
  for (const c of stored) byKey.set(c.key, c);
  // A built-in that entries are filed under is always shown, even where another type stands in for it.
  const used = new Set(inUse);
  const custom = stored.filter((c) => !builtinCategoryKeys.includes(c.key));
  const builtins = builtinCategoryKeys
    .filter((key) => byKey.has(key) || used.has(key) || standIn(key, stored) === null)
    .map((key) => freshNames(byKey.get(key) ?? Category.builtin(key), stored, byKey.has(key)));
  return dartSort([...builtins, ...custom], (a, b) => {
    const byOrder = compareNum(a.order, b.order);
    return byOrder !== 0 ? byOrder : localeCompare(a.name, b.name);
  });
}
