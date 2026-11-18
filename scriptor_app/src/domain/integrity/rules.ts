// RECORD INTEGRITY (as in the original app). A port of flutter_app/lib/shared/domain/integrity/rules.dart.
//
// Deterministic checks of how records point at one another. Each finding comes from one stated rule and the records it
// rests on; the same records give the same findings every time. Nothing here changes anything: fixes are offered
// (fixes.ts), and made only when the author chooses one. The connection statuses and the "kept in" words already
// ported for the connections panel are shared from codex/screens/connections.ts.

import { kindViews, missingFor } from '../codex/capabilities';
import { type FieldIssue, entryIssues } from '../codex/fieldValues';
import { connectionStatusLabel, statusOf, statusOfCanon, sourceWords, type ConnectionStatus } from '../codex/screens/connections';
import { localeCompare } from '../exchange/collation';
import { type JsonMap, idOrNull, str } from '../json';
import { type Connection, deriveConnections } from '../model/connections';
import { EntityRef, type EntityType } from '../model/entityRef';
import type { StoryModel } from '../model/storyModel';
import { stableSorted } from '../reader/stableSort';
import { Category } from '../records/category';
import type { Entry } from '../records/entry';
import { dartTrim } from '../text/dartString';
import { foldText } from '../text/fold';

export { connectionStatusLabel, statusOf, statusOfCanon, sourceWords, type ConnectionStatus };

/** Where a reference can be taken out by the app: everything but text, which is changed in the editor. */
export const fixable: ReadonlySet<string> = new Set([
  'loreLinks',
  'characterRelations',
  'loreEntries',
  'chapterPlans',
  'timelineEvents',
  'plotThreads',
  'systemSheets',
  'structureMarkers',
  'progressChanges',
  'journeys',
]);

/** Connections and relationships with a missing end go whole. */
export const goesWhole: ReadonlySet<string> = new Set(['loreLinks', 'characterRelations']);

// ------------------------------------------------------------------------------------------------ broken references

/** What an id looks like: a value that is the id of a deleted record, rather than words. */
const idLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^[\w-]{20,}$/i;

export function isIdLike(value: string): boolean {
  return idLike.test(value);
}

export class BrokenReference {
  constructor(
    /** The same broken reference has the same key on every run. */
    readonly key: string,
    /** What holds the reference, in words. */
    readonly where: string,
    readonly table: string,
    readonly rowId: string,
    /** The id that names nothing now, and what kind of record it named. */
    readonly missing: EntityRef,
    /** What it said, in words. */
    readonly says: string,
  ) {}
}

export function kindWords(t: EntityType): string {
  return t === 'node' ? 'chapter or scene' : t === 'entry' ? 'codex entry' : t;
}

/** Rule: a reference must name a record that exists. Every reference the shared model reads, and every structural
 * marker (`markers`, rows of `structureMarkers`), is checked. */
export function brokenReferences(model: StoryModel, markers: readonly JsonMap[] = []): BrokenReference[] {
  const out: BrokenReference[] = [];
  const name = (ref: EntityRef) => model.resolve(ref)?.label ?? 'a record that is gone';
  for (const d of deriveConnections(model).dangling) {
    const connection = d.connection;
    for (const gone of d.missing) {
      // A field holding words, not an id, is a reference that names nothing, not a broken one.
      if (connection.kind === 'field' && !idLike.test(gone.id)) continue;
      const other = connection.from.equals(gone) ? connection.to : connection.from;
      const table = connection.source.collection;
      out.push(
        new BrokenReference(
          `integrity|broken|${connection.id}|${gone.type}:${gone.id}`,
          sourceWords[table] ?? table,
          table,
          connection.source.id,
          gone,
          `${name(other)}: “${connection.label.length > 0 ? connection.label : connection.kind}” points at a ` +
            `${kindWords(gone.type)} that no longer exists`,
        ),
      );
    }
  }
  for (const marker of markers) {
    for (const [field, type] of [
      ['nodeId', 'node'],
      ['eventId', 'event'],
    ] as const) {
      const id = idOrNull(marker[field]);
      if (id === null || model.exists(new EntityRef(type, id))) continue;
      const title = str(marker['title']);
      out.push(
        new BrokenReference(
          `integrity|broken|marker:${str(marker['id'])}:${field}`,
          sourceWords['structureMarkers'],
          'structureMarkers',
          str(marker['id']),
          new EntityRef(type, id),
          `The marker “${str(marker['kind'])}${title.length > 0 ? `: ${title}` : ''}” is placed at a ` +
            `${type === 'node' ? 'chapter or scene' : 'timeline event'} that no longer exists`,
        ),
      );
    }
  }
  return stableSorted(out, (a, b) => {
    const c = localeCompare(a.says, b.says);
    return c !== 0 ? c : localeCompare(a.key, b.key);
  });
}

/** A record with one reference taken out, and nothing else changed: an id in a list goes from the list; an item of a
 * list that is that reference (`{id, age}` for a character at an event) goes; a single reference becomes empty. What
 * holds it (a beat, a field) stays, so no work is lost. */
export function withoutReference(value: unknown, id: string, depth = 0): unknown {
  if (Array.isArray(value)) {
    return value
      .filter((v) => v !== id && !(isMap(v) && v['id'] === id))
      .map((v) => withoutReference(v, id, depth + 1));
  }
  if (isMap(value) && depth < 5) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] =
        k !== 'id' && v === id
          ? k === 'value'
            ? ''
            : null
          : k === 'value' && typeof v === 'string' && v.split('\n').includes(id)
            ? v
                .split('\n')
                .filter((part) => part !== id)
                .join('\n')
            : withoutReference(v, id, depth + 1);
    }
    return out;
  }
  return value;
}

function isMap(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// ------------------------------------------------------------------------------------- references that name nothing

/** A name as compared for likeness: no accents, capitals, punctuation or leading article. */
export function normalizeName(name: string): string {
  return dartTrim(foldText(name).replace(/[^\p{L}\p{N}]+/gu, ' ')).replace(/^(the|a|an) /, '');
}

export class UnresolvedField {
  constructor(
    readonly key: string,
    readonly entry: Entry,
    readonly fieldId: string,
    readonly fieldName: string,
    /** What the field holds that names no entry. */
    readonly value: string,
    /** Entries whose name matches it, ignoring capitals, accents, punctuation and a leading article. */
    readonly suggestions: readonly Entry[],
  ) {}
}

/** Rule: a field that refers to an entry ("Leader", "Owner") must hold an entry, not words. An id of a deleted entry
 * is a broken reference instead. */
export function unresolvedFields(model: StoryModel): UnresolvedField[] {
  const entries = [...model.entries.values()];
  const out: UnresolvedField[] = [];
  for (const entry of entries) {
    const category = model.categories.get(entry.category) ?? Category.unknown(entry.category);
    const defs = new Map(category.fields.map((d) => [d.id, d]));
    for (const field of entry.fields) {
      const type = field.defId !== null ? (defs.get(field.defId)?.type ?? field.type) : field.type;
      if (type !== 'reference' && type !== 'references') continue;
      const values = field.value
        .split('\n')
        .filter((v) => dartTrim(v).length > 0)
        .map((v) => dartTrim(v));
      for (const value of values) {
        if (model.entries.has(value) || idLike.test(value)) continue;
        const wanted = normalizeName(value);
        const defName = field.defId === null ? null : (defs.get(field.defId)?.name ?? null);
        out.push(
          new UnresolvedField(
            `integrity|unresolved|${entry.id}|${field.id}|${wanted}`,
            entry,
            field.id,
            defName !== null && defName.length > 0 ? defName : field.key.length > 0 ? field.key : 'A field',
            value,
            entries.filter((e) => e.id !== entry.id && normalizeName(e.name) === wanted),
          ),
        );
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------------- duplicates

export type DuplicateRule = 'sameName' | 'alias';

export class DuplicatePair {
  constructor(
    readonly key: string,
    readonly a: Entry,
    readonly b: Entry,
    readonly rule: DuplicateRule,
    /** Why they look alike, in words. */
    readonly because: string,
  ) {}
}

/** Dart's String.compareTo: by UTF-16 code units. */
const byCodeUnits = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Rules: two entries of the same category look like duplicates when their names are the same once capitals, accents,
 * punctuation and a leading article are set aside, or when one's name is another's alias. Nothing is merged: the
 * author decides. */
export function duplicateCandidates(entries: readonly Entry[], aliases: ReadonlyMap<string, readonly string[]> = new Map()): DuplicatePair[] {
  const pairs = new Map<string, DuplicatePair>();
  const add = (x: Entry, y: Entry, rule: DuplicateRule, because: string) => {
    const [a, b] = byCodeUnits(x.id, y.id) < 0 ? [x, y] : [y, x];
    const key = `integrity|duplicate|${a.id}|${b.id}`;
    if (!pairs.has(key)) pairs.set(key, new DuplicatePair(key, a, b, rule, because));
  };
  const byCategory = new Map<string, Entry[]>();
  for (const e of entries) {
    let list = byCategory.get(e.category);
    if (list === undefined) byCategory.set(e.category, (list = []));
    list.push(e);
  }
  for (const group of byCategory.values()) {
    const byName = new Map<string, Entry[]>();
    for (const e of group) {
      const n = normalizeName(e.name);
      if (n.length === 0) continue;
      let list = byName.get(n);
      if (list === undefined) byName.set(n, (list = []));
      list.push(e);
    }
    for (const same of byName.values()) {
      for (let i = 0; i < same.length; i++) {
        for (let j = i + 1; j < same.length; j++) {
          add(
            same[i],
            same[j],
            'sameName',
            `“${same[i].name}” and “${same[j].name}” are the same name, apart from capitals, accents, punctuation ` +
              'or a leading “The”.',
          );
        }
      }
    }
    for (const e of group) {
      for (const alias of aliases.get(e.id) ?? []) {
        for (const other of byName.get(normalizeName(alias)) ?? []) {
          if (other.id !== e.id) add(e, other, 'alias', `“${other.name}” is the name of one and an alias of “${e.name}”.`);
        }
      }
    }
  }
  return stableSorted(pairs.values(), (x, y) => {
    const c = localeCompare(x.a.name, y.a.name);
    return c !== 0 ? c : localeCompare(x.key, y.key);
  });
}

// ----------------------------------------------------------------------------- values that do not fit their fields

export class UnfitEntry {
  constructor(
    readonly key: string,
    readonly entry: Entry,
    readonly issues: readonly FieldIssue[],
  ) {}
}

/** Rule: each value fits its field as its category defines it. Values are never changed by this. */
export function unfitEntries(model: StoryModel): UnfitEntry[] {
  const name = (key: string) => (model.categories.get(key) ?? Category.unknown(key)).name;
  const out: UnfitEntry[] = [];
  for (const entry of model.entries.values()) {
    const issues = entryIssues(entry, model.categories.get(entry.category) ?? Category.unknown(entry.category), model.entries, {
      categoryName: name,
    });
    if (issues.length > 0) out.push(new UnfitEntry(`integrity|unfit|${entry.id}`, entry, issues));
  }
  return stableSorted(out, (a, b) => localeCompare(a.entry.name, b.entry.name));
}

/** Stored connections marked disputed or invalid: kept as marked, listed so they are not forgotten. */
export function flaggedConnections(model: StoryModel): Connection[] {
  return deriveConnections(model).connections.filter((c) => {
    const s = statusOf(c);
    return s === 'disputed' || s === 'invalid';
  });
}

// ----------------------------------------------------------------------- views set up on fields that no longer suit

export class UnsuitedKind {
  constructor(
    readonly key: string,
    readonly category: Category,
    readonly problems: readonly string[],
  ) {}
}

/** Rule: a view a kind was set up for reads fields that still suit it. Only settings the author made are listed: a
 * view never set up is not a problem. Settings are never changed by this. */
export function unsuitedKinds(model: StoryModel): UnsuitedKind[] {
  const out: UnsuitedKind[] = [];
  for (const category of model.categories.values()) {
    const problems = [
      ...kindViews.flatMap((v) => (category.uses[v] !== undefined && category.uses[v] !== null ? missingFor(category, v) : [])),
      ...missingFor(category, 'graphLabel'),
      ...missingFor(category, 'graphLinks'),
    ];
    if (problems.length > 0) out.push(new UnsuitedKind(`integrity|uses|${category.key}`, category, problems));
  }
  return stableSorted(out, (a, b) => localeCompare(a.category.name, b.category.name));
}
