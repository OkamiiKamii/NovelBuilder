// Copies of a novel that share nothing with it: a new id for the novel and every record, every reference rewritten
// to the copies. A port of flutter_app/lib/shared/domain/snapshot/copy.dart.

import { newId } from '../ids';
import { type JsonMap, isMap, str } from '../json';
import { NovelSnapshot } from './novelSnapshot';

// Separators inside composite references: an ability `<systemId>/<itemId>`, a ref key `entry:<id>`, a connection id
// `participant:<eventId>:<entryId>`, a cell key `<rowId>|<columnId>`, several ids one per line in a field.
const separators = /([:/|\n])/;
const separatorsGlobal = /[:/|\n]/;

/** Version history: kept in backups, left out of duplicates. */
export const historyCollections: ReadonlySet<string> = new Set(['chapterRevisions', 'characterHistory']);

/** A novel's setup, for starting a new novel from it: how it is organised, never its story. */
export const setupCollections: ReadonlySet<string> = new Set([
  'loreSchemas',
  'relationSettings',
  'storyCalendars',
  'progressCategories',
  'systems',
]);

/** Replaces every id in `ids` wherever it appears in a JSON value: as a whole value, a list item, a key, and a part of
 * a composite reference. The text of chapters (ProseMirror `text` nodes) is left exactly as written. */
export function substituteIds(value: unknown, ids: ReadonlyMap<string, string>): unknown {
  const one = (s: string): string => {
    const whole = ids.get(s);
    if (whole !== undefined) return whole;
    if (!separatorsGlobal.test(s)) return s;
    // split with a capturing group keeps the separators at the odd positions.
    return s
      .split(separators)
      .map((part, i) => (i % 2 === 1 ? part : (ids.get(part) ?? part)))
      .join('');
  };
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return one(v);
    if (Array.isArray(v)) return v.map(walk);
    if (isMap(v)) {
      const proseText = v['type'] === 'text';
      const out: JsonMap = {};
      for (const [key, inner] of Object.entries(v)) {
        out[one(key)] = proseText && key === 'text' ? inner : walk(inner);
      }
      return out;
    }
    return v;
  };
  return walk(value);
}

/** A fresh id for every record (and the novel), keeping their order: new ids sort as the old ones did. */
export function freshIds(source: NovelSnapshot, createId: () => string = newId): Map<string, string> {
  const old = new Set<string>();
  for (const rows of Object.values(source.collections)) {
    for (const r of rows) if (typeof r['id'] === 'string') old.add(r['id']);
  }
  const sortedOld = [...old].sort(compareCodeUnits);
  const fresh = sortedOld.map(() => createId()).sort(compareCodeUnits);
  const map = new Map<string, string>();
  sortedOld.forEach((id, i) => map.set(id, fresh[i]));
  map.set(source.projectId, createId());
  return map;
}

// Dart's String.compareTo: by UTF-16 code units, as JavaScript's default sort.
function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** A copy that shares nothing with the source. The copy's details are the source's with `title`, unpinned, not
 * archived, and new dates; fields Scriptor does not know come along. The long-retired single `genre` is dropped. */
export function copyNovel(
  source: NovelSnapshot,
  args: { title: string; now: number; include?: (collection: string) => boolean; createId?: () => string },
): NovelSnapshot {
  const kept: Record<string, readonly JsonMap[]> = {};
  for (const [name, rows] of Object.entries(source.collections)) {
    if (!args.include || args.include(name)) kept[name] = rows;
  }
  const map = freshIds(source.copyWith({ collections: kept }), args.createId);
  const newProjectId = map.get(source.projectId)!;
  const details: JsonMap = {};
  for (const [key, value] of Object.entries(source.project)) if (key !== 'genre') details[key] = value;
  const project = substituteIds(details, map) as JsonMap;
  const collections: Record<string, JsonMap[]> = {};
  for (const [name, rows] of Object.entries(kept)) {
    collections[name] = rows.map((r) => ({ ...(substituteIds(r, map) as JsonMap), projectId: newProjectId }));
  }
  return new NovelSnapshot({
    project: {
      ...project,
      id: newProjectId,
      title: args.title,
      pinned: false,
      archived: false,
      createdAt: args.now,
      updatedAt: args.now,
      lastOpenedAt: null,
    },
    collections,
    extra: source.extra,
  });
}

/** A duplicate: everything but version history. */
export function duplicateNovel(
  source: NovelSnapshot,
  args: { title: string; now: number; createId?: () => string },
): NovelSnapshot {
  return copyNovel(source, { ...args, include: (c) => !historyCollections.has(c) });
}

/** Every place in `copy` that still holds an id of `source`: a reference back into the other novel. Empty for a proper
 * copy. */
export function foreignReferences(source: NovelSnapshot, copy: NovelSnapshot): string[] {
  const ids = new Set<string>([source.projectId]);
  for (const rows of Object.values(source.collections)) {
    for (const r of rows) if (typeof r['id'] === 'string') ids.add(r['id']);
  }
  const found: string[] = [];
  const scan = (v: unknown, where: string): void => {
    if (typeof v === 'string') {
      if (ids.has(v) || v.split(separatorsGlobal).some((p) => ids.has(p))) found.push(`${where}: ${v}`);
    } else if (Array.isArray(v)) {
      v.forEach((x, i) => scan(x, `${where}[${i}]`));
    } else if (isMap(v)) {
      const proseText = v['type'] === 'text';
      for (const [key, inner] of Object.entries(v)) {
        scan(key, `${where}{key}`);
        if (!(proseText && key === 'text')) scan(inner, `${where}.${key}`);
      }
    }
  };
  scan(copy.project, 'project');
  for (const [name, rows] of Object.entries(copy.collections)) {
    for (const r of rows) scan(r, `${name}/${str(r['id'])}`);
  }
  return found;
}
