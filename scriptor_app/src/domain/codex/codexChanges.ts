// Changes to a novel's codex: entries, their fields, categories, and connections. A port of
// flutter_app/lib/shared/domain/codex/codex_changes.dart.
//
// A change starts from what was read (a NovelSnapshot); operations are applied in order, each building on the ones
// before; `snapshot` is then the novel as it would be. Nothing is stored here: the caller saves it against what was
// read (NovelStore.saveChanges(before, changes.snapshot), or writeRows with rowWritesBetween from ../model/rowWrites),
// so a newer save elsewhere is never overwritten. A change that cannot be made throws ChangeRefused and the caller
// stores nothing.

import { localeCompare } from '../collation';
import { type JsonMap, isMap, jsonEquals, listOf, mapOrNull, numOrNull, str } from '../json';
import { type EntityRef } from '../model/entityRef';
import { stableSorted } from '../reader/stableSort';
import { type CanonStatus } from '../records/canon';
import { Category, builtinCategoryKeys, fieldTypeOf, resolveCategories, standIn, typePartners } from '../records/category';
import { dartNumTryParse } from '../records/dartNum';
import { Entry, viewFields } from '../records/entry';
import { maps } from '../records/jsonRecord';
import { Link, wordingOf } from '../records/link';
import type { NovelSnapshot } from '../snapshot/novelSnapshot';
import { dartToLowerCase, dartTrim } from '../text/dartString';
import { cleanUses, mergeUses, remapUses } from './capabilities';

/** A change the author asked for that cannot be made as asked, with the reason in plain words. Nothing is changed. */
export class ChangeRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChangeRefused';
  }

  override toString(): string {
    return this.message;
  }
}

/** A change being made to one novel: it starts from what was read, operations are applied in order (each building on
 * the ones before, as the original app's transactions do), and `snapshot` is then saved against what was read. */
export class RecordChanges {
  snapshot: NovelSnapshot;
  readonly now: number;
  private readonly createId: () => string;

  constructor(snapshot: NovelSnapshot, args: { now: number; createId: () => string }) {
    this.snapshot = snapshot;
    this.now = args.now;
    this.createId = args.createId;
  }

  newId(): string {
    return this.createId();
  }

  get projectId(): string {
    return this.snapshot.projectId;
  }

  rows(collection: string): readonly JsonMap[] {
    return this.snapshot.rows(collection);
  }

  row(collection: string, id: string): JsonMap | null {
    return this.rows(collection).find((r) => r['id'] === id) ?? null;
  }

  put(collection: string, row: JsonMap): void {
    this.snapshot = this.snapshot.putRow(collection, row);
  }

  remove(collection: string, id: string): void {
    this.snapshot = this.snapshot.withRows(
      collection,
      this.rows(collection).filter((r) => r['id'] !== id),
    );
  }
}

const maxCoverLength = 2000000;
const coverPattern = /^(https?:\/\/\S+$|data:image\/(png|jpeg|webp|gif);base64,)/i;

/** An image the app keeps: a web address or an uploaded picture as a data URL, within the size the original allows.
 * Anything else is no image. */
export function normalizeImage(value: unknown): string | null {
  const image = typeof value === 'string' ? value : '';
  return image.length > 0 && image.length <= maxCoverLength && coverPattern.test(image) ? image : null;
}

/** Tags as the codex keeps them: trimmed, without blanks or repeats, in the order given. */
export function cleanList(values: Iterable<unknown>): string[] {
  const out = new Set<string>();
  for (const v of values) if (typeof v === 'string' && dartTrim(v).length > 0) out.add(dartTrim(v));
  return [...out];
}

/** The novel's categories, the built-ins (with the author's changes) and the author's own, by key, in order. */
export function categoriesOf(s: NovelSnapshot): Map<string, Category> {
  const out = new Map<string, Category>();
  for (const c of resolveCategories(s.rows('loreSchemas').map((r) => new Category(r)), s.rows('loreEntries').map((r) => str(r['category'])))) out.set(c.key, c);
  return out;
}

/** Limits that keep custom fields from swelling past what the app can show and check well, as in the original. */
export const fieldLimits = { fields: 60, options: 100, name: 60, help: 200 } as const;

/** Colours given to categories the author creates, in turn. */
export const customColors: readonly string[] = [
  '#2b7a8c',
  '#a8436b',
  '#6b7a2b',
  '#a3622b',
  '#4f5fa3',
  '#8c2b5a',
  '#2b8c6b',
  '#7a5c3d',
];

const cut = (s: string, n: number) => (s.length > n ? s.substring(0, n) : s);

/** Choices as stored: trimmed, at most 60 characters each, without blanks or repeats, at most 100. */
export function cleanOptions(options: unknown): string[] {
  return cleanList(listOf(options).map((o) => (typeof o === 'string' ? cut(dartTrim(o), fieldLimits.name) : ''))).slice(
    0,
    fieldLimits.options,
  );
}

function finite(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && dartTrim(value).length > 0) {
    const n = dartNumTryParse(dartTrim(value));
    return n !== null && Number.isFinite(n) ? n : null;
  }
  return null;
}

const defKeys = new Set(['id', 'name', 'type', 'options', 'archived', 'required', 'help', 'min', 'max', 'target']);

/** A field set as stored, as the original app cleans it: each field has an id, a name, a known type and clean
 * choices; the rules a field may carry (required, help, a number range, the kind a link points at) are kept only where
 * they fit its type. Whatever else a field holds (written by a later version) is kept beside it. */
export function cleanDefs(defs: unknown, newId: () => string): JsonMap[] {
  return listOf(defs).map((raw) => {
    const def = mapOrNull(raw) ?? {};
    const type = fieldTypeOf(def['type']) ?? 'text';
    const min = type === 'number' ? finite(def['min']) : null;
    const max = type === 'number' ? finite(def['max']) : null;
    const help = typeof def['help'] === 'string' ? cut(dartTrim(def['help']), fieldLimits.help) : '';
    const name =
      typeof def['name'] === 'string' && dartTrim(def['name']).length > 0 ? dartTrim(def['name']) : 'Untitled field';
    const target = def['target'];
    const out: JsonMap = {};
    for (const [k, v] of Object.entries(def)) if (!defKeys.has(k)) out[k] = v;
    out['id'] = typeof def['id'] === 'string' && def['id'].length > 0 ? def['id'] : newId();
    out['name'] = cut(name, fieldLimits.name);
    out['type'] = type;
    out['options'] = cleanOptions(def['options']);
    if (def['archived'] === true) out['archived'] = true;
    if (def['required'] === true) out['required'] = true;
    if (help.length > 0) out['help'] = help;
    if (min !== null) out['min'] = min;
    if (max !== null && (min === null || max >= min)) out['max'] = max;
    if ((type === 'reference' || type === 'references') && typeof target === 'string' && target.length > 0) {
      out['target'] = target;
    }
    return out;
  });
}

/** Whether an entry matches what was typed: its name, summary, description, tags, and its fields' names and values. */
export function matchesEntry(entry: Entry, query: string): boolean {
  const needle = dartToLowerCase(dartTrim(query));
  if (needle.length === 0) return true;
  return [
    entry.name,
    entry.summary,
    entry.description,
    ...entry.tags,
    ...entry.fields.flatMap((f) => [f.key, f.value]),
  ].some((t) => dartToLowerCase(t).includes(needle));
}

const typeKey = (type: string | null | undefined): string =>
  dartTrim(type ?? '').length === 0 ? 'related' : dartTrim(type!);

const words = (value: string | null | undefined): string => {
  const t = dartTrim(value ?? '');
  return t.length > 80 ? t.substring(0, 80) : t;
};

const highestOrder = (all: readonly Category[]) => all.reduce((m, c) => Math.max(m, c.order), -1);

/** Codex changes: entries, the values of their category's fields, and links between entries. As the original app's
 * codex service. REFERENCE ISOLATION RULE: nothing here reads or writes manuscript text. */
export class CodexChanges extends RecordChanges {
  owned(entryId: string): Entry {
    const row = this.row('loreEntries', entryId);
    if (row === null) throw new ChangeRefused('That entry is no longer in this novel.');
    return new Entry(row);
  }

  category(key: string): Category {
    return categoriesOf(this.snapshot).get(key) ?? Category.unknown(key);
  }

  putEntry(entry: Entry, changes: JsonMap): void {
    this.put('loreEntries', entry.merged({ ...changes, updatedAt: this.now }));
  }

  /** A new entry of a category, with only a name. The category's fields show on it by themselves; only values the
   * author writes are stored. `id`, when given, is the new entry's permanent id (a fresh one decided beforehand, so
   * a preview can show the colour it will keep); otherwise a new one is made. */
  createEntry(categoryKey: string, name?: string | null, id?: string | null): Entry {
    const kind = categoriesOf(this.snapshot).get(categoryKey);
    if (kind === undefined) throw new ChangeRefused('Unknown category.');
    if (kind.archived) throw new ChangeRefused(`${kind.name} is archived. Restore it to add entries.`);
    const entry: JsonMap = {
      id: id ?? this.newId(),
      projectId: this.projectId,
      category: categoryKey,
      name: dartTrim(name ?? '').length > 0 ? dartTrim(name!) : `New ${dartToLowerCase(kind.singular)}`,
      summary: '',
      description: '',
      image: null,
      notes: '',
      tags: [],
      fields: [],
      ...(typePartners.has(categoryKey) ? { typeSorted: true } : {}),
      createdAt: this.now,
      updatedAt: this.now,
    };
    this.put('loreEntries', entry);
    return new Entry(entry);
  }

  /** Changes an entry's own details. Only what is given changes. `image: { value: null }` removes the image. */
  updateEntry(
    entryId: string,
    changes: {
      name?: string;
      summary?: string;
      description?: string;
      image?: { value: string | null };
      tags?: readonly string[];
      category?: string;
      notes?: string;
    },
  ): void {
    const entry = this.owned(entryId);
    const out: JsonMap = {};
    if (changes.category !== undefined && categoriesOf(this.snapshot).has(changes.category)) {
      out['category'] = changes.category;
      if (typePartners.has(changes.category)) out['typeSorted'] = true;
    }
    if (changes.notes !== undefined) out['notes'] = changes.notes;
    if (changes.name !== undefined) {
      out['name'] = dartTrim(changes.name).length > 0 ? dartTrim(changes.name) : 'Untitled entry';
    }
    if (changes.summary !== undefined) out['summary'] = changes.summary;
    if (changes.description !== undefined) out['description'] = changes.description;
    if (changes.image !== undefined) out['image'] = normalizeImage(changes.image.value);
    if (changes.tags !== undefined) out['tags'] = cleanList(changes.tags);
    this.putEntry(entry, out);
  }

  /** Sets this entry's value for one field of its category, based on the entry as stored. */
  setFieldValue(entryId: string, defId: string, value: string): void {
    const entry = this.owned(entryId);
    const slot = viewFields(entry, this.category(entry.category)).category.find((c) => c[0].id === defId);
    if (slot === undefined) throw new ChangeRefused('That field is not part of this category.');
    const [def, field] = slot;
    const stored: JsonMap = {
      ...(field?.raw ?? {}),
      id: field?.id ?? this.newId(),
      key: def.name,
      value,
      type: def.raw['type'] ?? null,
      defId,
    };
    this.putEntry(entry, {
      fields:
        field === null
          ? [...listOf(entry.raw['fields']), stored]
          : listOf(entry.raw['fields']).map((f) => (isMap(f) && f['id'] === field.id ? stored : f)),
    });
  }

  /** Replaces the fields that belong to this entry alone. Values for the category's fields, current or archived, are
   * left as they are. Completely empty rows are dropped, as the original does. */
  setOwnFields(entryId: string, own: readonly JsonMap[]): void {
    const entry = this.owned(entryId);
    const view = viewFields(entry, this.category(entry.category));
    const kept = new Set<string>();
    for (const [, f] of view.category) if (f !== null) kept.add(f.id);
    for (const [, f] of view.archived) kept.add(f.id);
    const isKept = (id: unknown) => typeof id === 'string' && kept.has(id);
    const blank = (v: unknown) => !(typeof v === 'string' && dartTrim(v).length > 0);
    const mine: JsonMap[] = [];
    for (const f of own) {
      if (isKept(f['id']) || (blank(f['key']) && blank(f['value']))) continue;
      const row: JsonMap = {};
      for (const [k, v] of Object.entries(f)) if (k !== 'defId') row[k] = v;
      row['id'] = typeof f['id'] === 'string' && f['id'].length > 0 ? f['id'] : this.newId();
      row['key'] = dartTrim(str(f['key']));
      row['value'] = str(f['value']);
      if (Array.isArray(f['options']) && f['options'].length > 0) row['options'] = cleanOptions(f['options']);
      mine.push(row);
    }
    this.putEntry(entry, {
      fields: [...listOf(entry.raw['fields']).filter((f) => isMap(f) && isKept(f['id'])), ...mine],
    });
  }

  /** Sets where a link between two entries stands: confirmed (canon), provisional, disputed or invalid. */
  setLinkCanon(linkId: string, status: CanonStatus): void {
    const link = this.ownedLink(linkId);
    this.put('loreLinks', link.merged({ canon: status, updatedAt: this.now }));
  }

  categories(): Category[] {
    return [...categoriesOf(this.snapshot).values()];
  }

  /** Creates a category (`key` null) or changes one, from `edit` given the category as stored right now. Fields are
   * never removed by this: a field left out is kept, archived, so every value entries hold for it survives. */
  saveCategory(key: string | null, edit: (current: Category | null) => JsonMap): Category {
    const all = this.categories();
    const rows = this.rows('loreSchemas');
    const current = key === null ? null : (all.find((c) => c.key === key) ?? null);
    if (key !== null && current === null) throw new ChangeRefused('Unknown category.');
    const changes = edit(current);
    const row = current === null ? null : (rows.find((r) => r['key'] === current.key) ?? null);
    const name = dartTrim(typeof changes['name'] === 'string' ? changes['name'] : (current?.name ?? ''));
    if (name.length === 0) throw new ChangeRefused('Give the category a name.');
    const clash = all.find(
      (c) => c.key !== current?.key && dartToLowerCase(dartTrim(c.name)) === dartToLowerCase(name),
    );
    if (clash !== undefined) throw new ChangeRefused(`There is already a category called “${clash.name}”.`);

    let fields: JsonMap[] = current === null ? [] : maps(current.raw['fields']);
    if ('fields' in changes) {
      // A link may only be limited to a category that exists.
      const next = cleanDefs(changes['fields'], () => this.newId()).map((d) => {
        if (d['target'] !== null && d['target'] !== undefined && !all.some((c) => c.key === d['target'])) {
          const copy = { ...d };
          delete copy['target'];
          return copy;
        }
        return d;
      });
      if (next.filter((d) => d['archived'] !== true).length > fieldLimits.fields) {
        throw new ChangeRefused(`A category can have at most ${fieldLimits.fields} fields.`);
      }
      const ids = new Set(next.map((d) => d['id']));
      fields = [...next, ...fields.filter((d) => !ids.has(d['id'])).map((d) => ({ ...d, archived: true }))];
    }
    // Which fields the views read: only fields the category has.
    const uses = cleanUses(
      'uses' in changes ? changes['uses'] : current?.raw['uses'],
      fields.map((f) => str(f['id'])),
    );
    const archived = (changes['archived'] ?? current?.archived) === true && !(current?.builtin ?? false);
    const graph = 'graph' in changes ? changes['graph'] : current?.raw['graph'];
    const order = numOrNull(changes['order']) ?? current?.order ?? highestOrder(all) + 1;
    const singular = dartTrim(typeof changes['singular'] === 'string' ? changes['singular'] : (current?.singular ?? ''));
    const color =
      typeof changes['color'] === 'string' && changes['color'].length > 0
        ? changes['color']
        : current !== null && current.color.length > 0
          ? current.color
          : customColors[all.filter((c) => !c.builtin).length % customColors.length];
    const saved: JsonMap = {};
    // Whatever a later version stored on the category is kept.
    for (const [k, v] of Object.entries(row ?? {})) if (k !== 'archived' && k !== 'graph' && k !== 'uses') saved[k] = v;
    saved['id'] = row?.['id'] ?? this.newId();
    saved['projectId'] = this.projectId;
    saved['key'] = current?.key ?? `custom-${this.newId()}`;
    saved['name'] = name;
    saved['singular'] = singular.length > 0 ? singular : name;
    saved['color'] = color;
    saved['builtin'] = current?.builtin ?? false;
    saved['order'] = order;
    if (archived) saved['archived'] = true;
    if (graph === false) saved['graph'] = false;
    saved['fields'] = fields;
    if (uses !== null) saved['uses'] = uses;
    saved['createdAt'] = row?.['createdAt'] ?? this.now;
    saved['updatedAt'] = this.now;
    this.put('loreSchemas', saved);
    return new Category(saved);
  }

  /** One category as template data: its name, colour, fields (archived ones left out), rules and view settings. The
   * "show in the knowledge graph" setting is not carried: it is a choice about one novel's graph. */
  static kindTemplate(c: Category): JsonMap {
    return {
      key: c.key,
      name: c.name,
      singular: c.singular,
      color: c.color,
      builtin: c.builtin,
      fields: c.fields.filter((f) => !f.archived).map((f) => f.raw),
      ...(c.raw['uses'] !== null && c.raw['uses'] !== undefined ? { uses: c.raw['uses'] } : {}),
    };
  }

  /** The novel's categories and fields as template data (archived ones left out). */
  schemaSnapshot(): JsonMap[] {
    return this.categories()
      .filter((c) => !c.archived)
      .map((c) => CodexChanges.kindTemplate(c));
  }

  /** Adds a template's categories and fields to this novel (a preset). It only ever adds: a category or field that
   * already exists (by name) is left exactly as it is, and nothing is removed or retyped. */
  addKinds(incomingAll: readonly JsonMap[]): Category[] {
    let all = this.categories();
    const same = (a: string, b: string) => dartToLowerCase(dartTrim(a)) === dartToLowerCase(dartTrim(b));
    const matching = (incoming: JsonMap): Category | null =>
      incoming['builtin'] === true && builtinCategoryKeys.includes(incoming['key'] as string)
        ? // A newer built-in is hidden where another type has its name ("Species"): that one takes its place.
          (all.find((c) => c.key === incoming['key']) ?? standIn(str(incoming['key']), all) ?? all.find((c) => same(c.name, str(incoming['name']))) ?? null)
        : (all.find((c) => same(c.name, str(incoming['name']))) ?? null);
    const here = incomingAll.map((incoming) => matching(incoming)?.key ?? `custom-${this.newId()}`);
    const keys = new Map<string, string>();
    incomingAll.forEach((incoming, i) => {
      const key = str(incoming['key']);
      if (key.length > 0 && incomingAll.filter((x) => x['key'] === key).length === 1) keys.set(key, here[i]);
    });
    const known = (key: string) => all.some((c) => c.key === key) || here.includes(key);
    for (let index = 0; index < incomingAll.length; index++) {
      const incoming = incomingAll[index];
      const target = matching(incoming);
      const cleaned = cleanDefs(incoming['fields'], () => this.newId());
      const fresh = cleaned.map((def) => {
        const t = def['target'];
        const limited = typeof t === 'string' ? (keys.get(t) ?? t) : null;
        const out: JsonMap = { ...def, id: this.newId(), target: limited !== null && known(limited) ? limited : null };
        delete out['archived'];
        if (out['target'] === null) delete out['target'];
        return out;
      });
      if (target === null && dartTrim(str(incoming['name'])).length === 0) continue;
      const baseFields = target === null ? [] : maps(target.raw['fields']);
      const fields = [
        ...baseFields,
        ...fresh.filter((def) => !baseFields.some((e) => same(str(e['name']), str(def['name'])))),
      ];
      const idOf = (id: string): string | null => {
        const i = cleaned.findIndex((d) => d['id'] === id);
        if (i < 0) return null;
        const existing = baseFields.find((e) => same(str(e['name']), str(fresh[i]['name'])));
        return str((existing ?? fresh[i])['id']);
      };
      const baseUses = target === null ? null : mapOrNull(target.raw['uses']);
      const uses = mergeUses(baseUses, remapUses(mapOrNull(incoming['uses']), idOf));
      if (target !== null && fields.length === baseFields.length && jsonEquals(uses, baseUses)) continue;
      const name = dartTrim(str(incoming['name']));
      const wanted = target?.key ?? here[index];
      const row = this.rows('loreSchemas').find((r) => r['key'] === wanted) ?? null;
      const base: JsonMap = target?.raw ?? {
        key: here[index],
        name,
        singular: dartTrim(str(incoming['singular'])).length > 0 ? dartTrim(str(incoming['singular'])) : name,
        color:
          str(incoming['color']).length > 0
            ? incoming['color']
            : customColors[all.filter((c) => !c.builtin).length % customColors.length],
        builtin: false,
        order: highestOrder(all) + 1,
      };
      const saved: JsonMap = { ...base, fields };
      if (uses !== null) saved['uses'] = uses;
      saved['id'] = row?.['id'] ?? this.newId();
      saved['projectId'] = this.projectId;
      saved['createdAt'] = row?.['createdAt'] ?? this.now;
      saved['updatedAt'] = this.now;
      this.put('loreSchemas', saved);
      all = this.categories();
    }
    return all;
  }

  // ----------------------------------------------------------------------------------------------- typed connections

  /** Whether a record is in this novel. An ability is `<systemId>/<itemId>`: its blueprint must hold the item. */
  recordExists(ref: EntityRef): boolean {
    if (ref.type === 'ability') {
      const slash = ref.id.indexOf('/');
      if (slash < 0) return false;
      const system = this.row('systems', ref.id.substring(0, slash));
      const item = ref.id.substring(slash + 1);
      return system !== null && maps(system['items']).some((i) => i['id'] === item);
    }
    const table = {
      node: 'chapters',
      entry: 'loreEntries',
      event: 'timelineEvents',
      thread: 'plotThreads',
      relation: 'characterRelations',
    }[ref.type];
    return this.row(table, ref.id) !== null;
  }

  /** Connects two records of the novel: one statement, made from `from`'s side. A kind the author makes up is kept as
   * written. As in the original: both ends must exist here, a record is not connected to itself, and the same
   * statement twice is refused (a different kind between the same two is a different connection). */
  createConnection(args: {
    from: EntityRef;
    to: EntityRef;
    type?: string | null;
    label?: string;
    reverseLabel?: string;
    notes?: string;
    canon?: CanonStatus | null;
    startsAt?: JsonMap | null;
    how?: string;
  }): Link {
    const { from, to } = args;
    const startsAt = args.startsAt ?? null;
    for (const [which, end] of [
      ['first', from],
      ['second', to],
    ] as const) {
      if (dartTrim(end.id).length === 0) throw new ChangeRefused(`The ${which} end has no id.`);
    }
    if (startsAt !== null) this.checkPoint(startsAt);
    const validity = startsAt === null ? null : { from: startsAt, until: null };
    if (from.equals(to)) throw new ChangeRefused('A record cannot be connected to itself.');
    for (const [which, end] of [
      ['first', from],
      ['second', to],
    ] as const) {
      if (!this.recordExists(end)) {
        throw new ChangeRefused(`The ${which} end (${end.type} ${end.id}) is not in this novel.`);
      }
    }
    const key = typeKey(args.type);
    const twin = this.rows('loreLinks')
      .map((r) => new Link(r))
      .some(
        (l) =>
          l.fromId === from.id &&
          l.toId === to.id &&
          typeKey(l.type) === key &&
          l.fromType === from.type &&
          l.toType === to.type &&
          jsonEquals(l.raw['validity'] ?? null, validity),
      );
    if (twin) throw new ChangeRefused('That connection already exists.');
    const how = words(args.how ?? '');
    const link: JsonMap = {
      id: this.newId(),
      projectId: this.projectId,
      fromId: from.id,
      toId: to.id,
      fromLabel: dartTrim(args.label ?? ''),
      toLabel: dartTrim(args.reverseLabel ?? ''),
      createdAt: this.now,
      fromType: from.type,
      toType: to.type,
      type: key,
      notes: dartTrim(args.notes ?? ''),
      ...(args.canon !== undefined && args.canon !== null ? { canon: args.canon } : {}),
      ...(validity !== null ? { validity } : {}),
      ...(how.length > 0 ? { how } : {}),
      updatedAt: this.now,
    };
    this.put('loreLinks', link);
    return new Link(link);
  }

  /** A point in the story: a chapter or scene or event of this novel, or a date (as the original's connections
   * accept). */
  checkPoint(anchor: JsonMap): void {
    const when = mapOrNull(anchor['when']);
    let ok: boolean;
    switch (anchor['kind']) {
      case 'node':
        ok = this.row('chapters', str(anchor['nodeId'])) !== null;
        break;
      case 'event':
        ok = this.row('timelineEvents', str(anchor['eventId'])) !== null;
        break;
      case 'date':
        ok =
          ['exact', 'approximate', 'relative', 'unknown'].includes(when?.['precision'] as string) &&
          (when?.['precision'] !== 'relative' || this.row('timelineEvents', str(when?.['anchorId'])) !== null);
        break;
      default:
        ok = false;
    }
    if (!ok) throw new ChangeRefused('That chapter, scene, event or date is not in this novel.');
  }

  /** Changes how a connection reads: its kind, each side's words, notes, status. Only what is given changes.
   * `canon: { value: null }` clears the status. */
  updateConnection(
    linkId: string,
    changes: {
      type?: string;
      label?: string;
      reverseLabel?: string;
      notes?: string;
      canon?: { value: CanonStatus | null };
      how?: string;
      endHow?: string;
    },
  ): Link {
    const link = this.ownedLink(linkId);
    const edits: JsonMap = {};
    if (changes.type !== undefined) edits['type'] = typeKey(changes.type);
    if (changes.label !== undefined) edits['fromLabel'] = dartTrim(changes.label);
    if (changes.reverseLabel !== undefined) edits['toLabel'] = dartTrim(changes.reverseLabel);
    if (changes.notes !== undefined) edits['notes'] = dartTrim(changes.notes);
    if (changes.canon !== undefined) edits['canon'] = changes.canon.value;
    if (changes.how !== undefined) edits['how'] = words(changes.how).length === 0 ? null : words(changes.how);
    if (changes.endHow !== undefined) {
      edits['endHow'] = words(changes.endHow).length === 0 ? null : words(changes.endHow);
    }
    edits['updatedAt'] = this.now;
    const next = link.merged(edits);
    for (const k of ['canon', 'how', 'endHow']) if (next[k] === null) delete next[k];
    this.put('loreLinks', next);
    return new Link(next);
  }

  /** Removes a connection. The records at its ends are not touched. */
  removeConnection(linkId: string): void {
    this.ownedLink(linkId);
    this.remove('loreLinks', linkId);
  }

  private ownedLink(linkId: string): Link {
    const row = this.row('loreLinks', linkId);
    if (row === null) throw new ChangeRefused('That link no longer exists.');
    return new Link(row);
  }

  /** Relates two entries. Each will list the other; `label` is the first entry's wording. */
  linkEntries(entryId: string, otherId: string, label = ''): Link {
    if (entryId === otherId) throw new ChangeRefused('An entry cannot be linked to itself.');
    this.owned(entryId);
    this.owned(otherId);
    // Two entries have one plain link; typed connections between them ("owns", "created by") are separate.
    const existing = this.rows('loreLinks')
      .map((r) => new Link(r))
      .some(
        (l) =>
          (l.fromId === entryId || l.toId === entryId) &&
          l.type === null &&
          l.isEntryLink &&
          (l.fromId === otherId || l.toId === otherId),
      );
    if (existing) throw new ChangeRefused('These entries are already linked.');
    const link: JsonMap = {
      id: this.newId(),
      projectId: this.projectId,
      fromId: entryId,
      toId: otherId,
      fromLabel: dartTrim(label),
      toLabel: '',
      createdAt: this.now,
    };
    this.put('loreLinks', link);
    return new Link(link);
  }

  /** Sets how `entryId` describes one of its links. */
  labelLink(linkId: string, entryId: string, label: string): void {
    const link = this.ownedLink(linkId);
    if (link.fromId !== entryId && link.toId !== entryId) {
      throw new ChangeRefused('That link does not belong to this entry.');
    }
    this.put('loreLinks', link.merged({ [link.fromId === entryId ? 'fromLabel' : 'toLabel']: dartTrim(label) }));
  }

  /** Removes the relationship from both entries. */
  unlink(linkId: string): void {
    this.ownedLink(linkId);
    this.remove('loreLinks', linkId);
  }
}

/** An entry related to another, with this side's wording of the relationship. */
export class RelatedEntry {
  constructor(
    readonly linkId: string,
    readonly entry: Entry,
    readonly label: string,
    readonly theirLabel: string,
  ) {}
}

/** Entries related to `entryId`, each with this side's wording, by name. */
export function relatedTo(entryId: string, entries: Iterable<Entry>, links: Iterable<Link>): RelatedEntry[] {
  const byId = new Map<string, Entry>();
  for (const e of entries) byId.set(e.id, e);
  const out: RelatedEntry[] = [];
  for (const link of links) {
    if (!((link.fromId === entryId || link.toId === entryId) && link.isEntryLink)) continue;
    const entry = byId.get(link.fromId === entryId ? link.toId : link.fromId);
    if (entry === undefined) continue;
    const w = wordingOf(link);
    const outgoing = link.fromId === entryId;
    out.push(new RelatedEntry(link.id, entry, outgoing ? w.forward : w.backward, outgoing ? w.backward : w.forward));
  }
  return stableSorted(out, (a, b) => localeCompare(a.entry.name, b.entry.name));
}

