// Codex entries (`loreEntries`) and their fields lined up with their category. A port of
// flutter_app/lib/shared/domain/records/entry.dart.

import { type JsonMap, idOrNull, numOrNull, str, strOrNull } from '../json';
import { dartToLowerCase, dartTrim } from '../text/dartString';
import { type Category, type FieldDef, type FieldType, fieldTypeOf } from './category';
import { JsonRecord, boolOf, freezeMap, maps, strings } from './jsonRecord';

/** One attribute of an entry. `defId` ties it to a field of the entry's category; without it, the field belongs to
 * this entry alone. Values are text whatever the type (see FieldType). */
export class EntryField {
  readonly raw: JsonMap;
  constructor(raw: JsonMap) {
    this.raw = freezeMap(raw);
  }

  get id(): string {
    return str(this.raw['id']);
  }
  get key(): string {
    return str(this.raw['key']);
  }
  get value(): string {
    return str(this.raw['value']);
  }
  get type(): FieldType | null {
    return fieldTypeOf(this.raw['type']);
  }
  get options(): string[] {
    return strings(this.raw['options']);
  }
  get defId(): string | null {
    return idOrNull(this.raw['defId']);
  }
}

/** A codex entry: a character, location, faction, item, power, piece of lore, or a record of a kind the author made.
 * They are told apart by `category`, so there is one place for all of them and one way to link them. */
export class Entry extends JsonRecord {
  /** A category key: a built-in one or `custom-…`. */
  get category(): string {
    return str(this.raw['category']);
  }
  get name(): string {
    return str(this.raw['name']);
  }
  get summary(): string {
    return str(this.raw['summary']);
  }
  get description(): string {
    return str(this.raw['description']);
  }
  /** An http(s) image URL, or an uploaded image stored as a data URL. */
  get image(): string | null {
    return strOrNull(this.raw['image']);
  }
  /** Private to the author. */
  get notes(): string {
    return str(this.raw['notes']);
  }
  get tags(): string[] {
    return strings(this.raw['tags']);
  }
  get fields(): EntryField[] {
    return maps(this.raw['fields']).map((f) => new EntryField(f));
  }
  /** For a place: its level in the novel's place hierarchy. */
  get placeLevel(): string | null {
    return idOrNull(this.raw['placeLevel']);
  }
  /** The author has settled which of two partner types (faction or species, ...) this entry is. */
  get typeSorted(): boolean {
    return boolOf(this.raw['typeSorted']);
  }
  get createdAt(): number {
    return numOrNull(this.raw['createdAt']) ?? 0;
  }
  get updatedAt(): number {
    return numOrNull(this.raw['updatedAt']) ?? 0;
  }

  withFields(changes: JsonMap): Entry {
    return new Entry(this.merged(changes));
  }

  renamed(name: string): Entry {
    return this.withFields({ name });
  }
}

/** An entry's stored values lined up with its category's field set. Nothing is ever dropped: a value whose field was
 * archived is in `archived`; a value whose field is gone, or belongs to another category, is in `own`. */
export class FieldView {
  constructor(
    readonly category: readonly (readonly [FieldDef, EntryField | null])[],
    readonly own: readonly EntryField[],
    readonly archived: readonly (readonly [FieldDef, EntryField])[],
  ) {}
}

export function viewFields(entry: Entry, category: Category): FieldView {
  const claimed = new Set<string>();
  const fields = entry.fields;
  const byDef = new Map<string, EntryField>();
  for (const f of fields) if (f.defId !== null) byDef.set(f.defId, f);
  const defs = category.fields;
  const forCategory: (readonly [FieldDef, EntryField | null])[] = [];
  for (const def of defs.filter((d) => !d.archived)) {
    // A value written before the field set existed is matched by name, once.
    const field =
      byDef.get(def.id) ??
      fields.find(
        (f) =>
          f.defId === null &&
          !claimed.has(f.id) &&
          dartToLowerCase(dartTrim(f.key)) === dartToLowerCase(dartTrim(def.name)),
      ) ??
      null;
    if (field !== null) claimed.add(field.id);
    forCategory.push([def, field]);
  }
  const archived: (readonly [FieldDef, EntryField])[] = [];
  for (const def of defs.filter((d) => d.archived)) {
    const field = byDef.get(def.id);
    if (field === undefined || dartTrim(field.value).length === 0) continue;
    claimed.add(field.id);
    archived.push([def, field]);
  }
  const known = new Set(defs.map((d) => d.id));
  const own = fields.filter((f) => !claimed.has(f.id) && (f.defId === null || !known.has(f.defId)));
  return new FieldView(forCategory, own, archived);
}
