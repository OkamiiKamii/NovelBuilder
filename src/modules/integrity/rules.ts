import type { CanonStatus } from '@/modules/canon/types';
import { KIND_VIEWS, missingFor } from '@/modules/codex/capabilities';
import { unknownCategory } from '@/modules/codex/schema';
import { entryIssues, type FieldIssue } from '@/modules/codex/validation';
import type { Category, LoreEntry } from '@/modules/codex/types';
import { deriveConnections } from '@/modules/model/connections';
import { resolveRef } from '@/modules/model/model';
import type { Connection, EntityRef, StoryModel } from '@/modules/model/types';
import type { StructureMarker } from '@/modules/structure/types';

/**
 * RECORD INTEGRITY
 * Deterministic checks of how records point at one another. Each finding
 * comes from one stated rule and the records it rests on; the same records
 * give the same findings every time. Nothing here changes anything: fixes
 * are offered, and made only when the author chooses one.
 */

// ---------------------------------------------------------------------------------------------------- connection status

/** A stored connection's status, in the words used for connections. Its canon status underneath: one status, two vocabularies. */
export type ConnectionStatus = 'confirmed' | 'provisional' | 'disputed' | 'invalid';
export const STATUS_OF: Record<CanonStatus, ConnectionStatus> = { canon: 'confirmed', provisional: 'provisional', conflicting: 'disputed', retconned: 'invalid', 'non-canon': 'invalid' };
export const CONNECTION_STATUS_LABELS: Record<CanonStatus, string> = { canon: 'Confirmed', provisional: 'Provisional', conflicting: 'Disputed', retconned: 'Invalid: retconned', 'non-canon': 'Invalid: not canon' };
export const STATUS_WORDS: Record<ConnectionStatus, string> = { confirmed: 'Confirmed', provisional: 'Provisional', disputed: 'Disputed', invalid: 'Invalid' };
/** A connection's status: only stored connections have one (none said means confirmed); everything else is a fact of the records, with none. */
export const statusOf = (c: Pick<Connection, 'kind' | 'canon'>): ConnectionStatus | null => (c.kind === 'link' ? STATUS_OF[c.canon ?? 'canon'] : null);

// ---------------------------------------------------------------------------------------------------- where a reference is kept

export const SOURCE_WORDS: Record<string, string> = {
  loreLinks: 'a connection you recorded',
  characterRelations: 'a character relationship',
  loreEntries: 'a field of an entry',
  chapters: 'a link in the manuscript’s text',
  chapterPlans: 'a chapter’s or scene’s plan',
  timelineEvents: 'a timeline event',
  plotThreads: 'a plot thread',
  systemSheets: 'a system sheet',
  systems: 'a system blueprint',
  structureMarkers: 'a structural marker',
  progressChanges: 'a progression change',
  journeys: 'a journey',
};

/** Where a reference can be taken out by the app: everything but text, which is changed in the editor. Connections and relationships with a missing end go whole. */
export const FIXABLE = new Set(['loreLinks', 'characterRelations', 'loreEntries', 'chapterPlans', 'timelineEvents', 'plotThreads', 'systemSheets', 'structureMarkers', 'progressChanges', 'journeys']);
export const GOES_WHOLE = new Set(['loreLinks', 'characterRelations']);

// ---------------------------------------------------------------------------------------------------- broken references

/** What an id looks like: a value that is the id of a deleted record, rather than words. */
const ID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^[\w-]{20,}$/i;

export interface BrokenReference {
  /** Stable: the same broken reference has the same key on every run. */
  key: string;
  /** What holds the reference, in words, and the record it is. */
  where: string;
  table: string;
  rowId: string;
  /** The id that names nothing now, and what kind of record it named. */
  missing: EntityRef;
  /** What it said, in words. */
  says: string;
}

/**
 * Rule: a reference must name a record that exists. Every reference the
 * shared model reads (connections, relationships, fields, links in the text,
 * plans and appearance records, events, plot threads, system sheets) and
 * every structural marker is checked.
 */
export function brokenReferences(model: StoryModel, markers: StructureMarker[] = []): BrokenReference[] {
  const out: BrokenReference[] = [];
  const name = (ref: EntityRef) => {
    const found = resolveRef(model, ref);
    return found.found ? found.view.label : 'a record that is gone';
  };
  for (const { connection, missing } of deriveConnections(model).dangling) {
    for (const gone of missing) {
      // A field holding words, not an id, is a reference that names nothing (below), not a broken one.
      if (connection.kind === 'field' && !ID_LIKE.test(gone.id)) continue;
      const other = connection.from.id === gone.id && connection.from.type === gone.type ? connection.to : connection.from;
      out.push({
        key: `integrity|broken|${connection.id}|${gone.type}:${gone.id}`,
        where: SOURCE_WORDS[connection.source.table] ?? connection.source.table,
        table: connection.source.table,
        rowId: connection.source.id,
        missing: gone,
        says: `${name(other)}: “${connection.label || connection.kind}” points at a ${gone.type === 'node' ? 'chapter or scene' : gone.type === 'entry' ? 'codex entry' : gone.type} that no longer exists`,
      });
    }
  }
  for (const marker of markers) {
    for (const [field, type] of [['nodeId', 'node'], ['eventId', 'event']] as const) {
      const id = marker[field];
      if (id && !resolveRef(model, { type, id }).found) out.push({ key: `integrity|broken|marker:${marker.id}:${field}`, where: SOURCE_WORDS.structureMarkers, table: 'structureMarkers', rowId: marker.id, missing: { type, id }, says: `The marker “${marker.kind}${marker.title ? `: ${marker.title}` : ''}” is placed at a ${type === 'node' ? 'chapter or scene' : 'timeline event'} that no longer exists` });
    }
  }
  return out.sort((a, b) => a.says.localeCompare(b.says) || a.key.localeCompare(b.key));
}

/**
 * A record with one reference taken out, and nothing else changed: an id in
 * a list goes from the list; an item of a list that is that reference
 * (`{ id, age }` for a character at an event) goes; a single reference
 * becomes empty. What holds it (a beat, a field) stays, so no work is lost.
 */
export function withoutReference<T>(value: T, id: string, depth = 0): T {
  if (Array.isArray(value)) return value.filter((v) => v !== id && !(v && typeof v === 'object' && (v as { id?: unknown }).id === id)).map((v) => withoutReference(v, id, depth + 1)) as T;
  if (value && typeof value === 'object' && depth < 5) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (k !== 'id' && v === id) out[k] = k === 'value' ? '' : null;
      else if (k === 'value' && typeof v === 'string' && v.split('\n').includes(id)) out[k] = v.split('\n').filter((part) => part !== id).join('\n');
      else out[k] = withoutReference(v, id, depth + 1);
    }
    return out as T;
  }
  return value;
}

// ---------------------------------------------------------------------------------------------------- references that name nothing

/** A name as compared for likeness: no accents, capitals, punctuation or leading article. */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/^(the|a|an) /, '');
}

export interface UnresolvedField {
  key: string;
  entry: LoreEntry;
  fieldId: string;
  fieldName: string;
  /** What the field holds that names no entry. */
  value: string;
  /** Entries whose name matches it, ignoring capitals, accents, punctuation and a leading article. */
  suggestions: LoreEntry[];
}

/**
 * Rule: a field that refers to an entry ("Leader", "Owner") must hold an
 * entry, not words. Text that names no entry (typed by hand, or brought in
 * by an import) is listed, with any entries of that name to point it at.
 * An id of a deleted entry is a broken reference instead.
 */
export function unresolvedFields(model: Pick<StoryModel, 'entries' | 'categories'>): UnresolvedField[] {
  const entries = [...model.entries.values()];
  const out: UnresolvedField[] = [];
  for (const entry of entries) {
    const category = model.categories.get(entry.category) ?? unknownCategory(entry.category);
    const defs = new Map(category.fields.map((d) => [d.id, d]));
    for (const field of entry.fields) {
      const type = field.defId ? (defs.get(field.defId)?.type ?? field.type) : field.type;
      if (type !== 'reference' && type !== 'references') continue;
      for (const value of field.value.split('\n').map((v) => v.trim()).filter(Boolean)) {
        if (model.entries.has(value) || ID_LIKE.test(value)) continue;
        const wanted = normalizeName(value);
        out.push({ key: `integrity|unresolved|${entry.id}|${field.id}|${wanted}`, entry, fieldId: field.id, fieldName: (field.defId && defs.get(field.defId)?.name) || field.key || 'A field', value, suggestions: entries.filter((e) => e.id !== entry.id && normalizeName(e.name) === wanted) });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------- duplicates

export interface DuplicatePair {
  key: string;
  a: LoreEntry;
  b: LoreEntry;
  rule: 'same-name' | 'alias';
  /** Why they look alike, in words. */
  because: string;
}

/**
 * Rules: two entries of the same category look like duplicates when their
 * names are the same once capitals, accents, punctuation and a leading
 * article are set aside ("The Ember Blade", "ember blade"), or when one's
 * name is another's alias. Nothing is merged: the author decides.
 */
export function duplicateCandidates(entries: LoreEntry[], aliases: ReadonlyMap<string, string[]> = new Map()): DuplicatePair[] {
  const pairs = new Map<string, DuplicatePair>();
  const add = (x: LoreEntry, y: LoreEntry, rule: DuplicatePair['rule'], because: string) => {
    const [a, b] = x.id < y.id ? [x, y] : [y, x];
    const key = `integrity|duplicate|${a.id}|${b.id}`;
    if (!pairs.has(key)) pairs.set(key, { key, a, b, rule, because });
  };
  const byCategory = new Map<string, LoreEntry[]>();
  for (const e of entries) byCategory.set(e.category, [...(byCategory.get(e.category) ?? []), e]);
  for (const group of byCategory.values()) {
    const byName = new Map<string, LoreEntry[]>();
    for (const e of group) {
      const n = normalizeName(e.name);
      if (n) byName.set(n, [...(byName.get(n) ?? []), e]);
    }
    for (const same of byName.values()) for (let i = 0; i < same.length; i++) for (let j = i + 1; j < same.length; j++) add(same[i], same[j], 'same-name', `“${same[i].name}” and “${same[j].name}” are the same name, apart from capitals, accents, punctuation or a leading “The”.`);
    for (const e of group) {
      for (const alias of aliases.get(e.id) ?? []) {
        for (const other of byName.get(normalizeName(alias)) ?? []) if (other.id !== e.id) add(e, other, 'alias', `“${other.name}” is the name of one and an alias of “${e.name}”.`);
      }
    }
  }
  return [...pairs.values()].sort((x, y) => x.a.name.localeCompare(y.a.name) || x.key.localeCompare(y.key));
}

// ---------------------------------------------------------------------------------------------------- values that do not fit their fields

export interface UnfitEntry {
  key: string;
  entry: LoreEntry;
  issues: FieldIssue[];
}

/**
 * Rule: each value fits its field: a required field is filled in, a number
 * is a number in its range, a date is a date, a choice is one of the
 * choices, a link names an entry of the kind it is limited to. Values are
 * never changed by this: it lists where they do not fit.
 */
export function unfitEntries(model: Pick<StoryModel, 'entries' | 'categories'>): UnfitEntry[] {
  const name = (key: string) => (model.categories.get(key) ?? unknownCategory(key)).name;
  return [...model.entries.values()]
    .map((entry) => ({ key: `integrity|unfit|${entry.id}`, entry, issues: entryIssues(entry, model.categories.get(entry.category) ?? unknownCategory(entry.category), model.entries, name) }))
    .filter((u) => u.issues.length)
    .sort((a, b) => a.entry.name.localeCompare(b.entry.name));
}

// ---------------------------------------------------------------------------------------------------- view settings that no longer suit

export interface UnsuitedKind {
  key: string;
  category: Category;
  /** What no longer suits, in words, one line a problem. */
  problems: string[];
}

/**
 * Rule: a view a kind of record is set up for names fields that can fill it:
 * still there, not archived, of a type the view reads. Only settings the
 * author made are checked (a view never set up is not a problem); each is
 * kept as it is until the author changes it or the field.
 */
export function unsuitedKinds(model: Pick<StoryModel, 'categories'>): UnsuitedKind[] {
  return [...model.categories.values()]
    .flatMap((category) => {
      const uses = category.uses ?? {};
      const set = KIND_VIEWS.filter((v) => uses[v] !== undefined);
      const problems = [...set.flatMap((v) => missingFor(category, v)), ...missingFor(category, 'graphLabel'), ...missingFor(category, 'graphLinks')];
      return problems.length ? [{ key: `integrity|uses|${category.key}`, category, problems }] : [];
    })
    .sort((a, b) => a.category.name.localeCompare(b.category.name));
}
