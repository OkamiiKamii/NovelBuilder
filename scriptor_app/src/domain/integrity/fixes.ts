// The fixes the record check offers, made only when the author chooses one. Each takes the whole novel and gives it
// back changed, to be saved against what was read. A port of flutter_app/lib/shared/domain/integrity/fixes.dart.

import { ChangeRefused, cleanList } from '../codex/codexChanges';
import { type JsonMap, jsonEquals, listOf, mapOrNull, str } from '../json';
import { maps, strings } from '../records/jsonRecord';
import { substituteIds } from '../snapshot/copy';
import type { NovelSnapshot } from '../snapshot/novelSnapshot';
import { dartTrim } from '../text/dartString';
import { fixable, goesWhole, normalizeName, withoutReference } from './rules';

/** "When is not known", as a progression change or journey keeps a point in time that is gone. */
const unknownTime: JsonMap = { kind: 'date', when: { precision: 'unknown' } };

function anchorNames(anchor: unknown, id: string): boolean {
  const a = mapOrNull(anchor);
  if (a === null) return false;
  const when = mapOrNull(a['when']) ?? {};
  return (
    (a['kind'] === 'node' && a['nodeId'] === id) ||
    (a['kind'] === 'event' && a['eventId'] === id) ||
    (a['kind'] === 'date' && when['precision'] === 'relative' && when['anchorId'] === id)
  );
}

const rowOf = (s: NovelSnapshot, table: string, id: string): JsonMap | null => s.rows(table).find((r) => r['id'] === id) ?? null;

/** Takes one broken reference out of the record that holds it. A connection or relationship whose end is gone goes
 * whole; anything else loses only the reference (a beat stays, unplaced; an event keeps everything but the missing
 * character). Text is never changed from here. */
export function removeReference(s: NovelSnapshot, table: string, rowId: string, missingId: string, options: { now: number }): NovelSnapshot {
  if (!fixable.has(table)) throw new ChangeRefused('That reference is changed where it is kept, not from here.');
  const row = rowOf(s, table, rowId);
  if (row === null) throw new ChangeRefused('That record is no longer there.');
  if (goesWhole.has(table)) return s.withRows(table, s.rows(table).filter((r) => r['id'] !== rowId));
  let next: JsonMap;
  if (table === 'progressChanges') {
    next = {
      ...row,
      at: anchorNames(row['at'], missingId) ? unknownTime : row['at'],
      refId: row['refId'] === missingId ? null : row['refId'],
      abilityId: row['abilityId'] === missingId ? null : row['abilityId'],
    };
  } else if (table === 'journeys') {
    const without = (list: unknown) => listOf(list).filter((v) => v !== missingId);
    next = {
      ...row,
      travellerIds: without(row['travellerIds']),
      fromId: row['fromId'] === missingId ? null : row['fromId'],
      toId: row['toId'] === missingId ? null : row['toId'],
      via: without(row['via']),
      eventIds: without(row['eventIds']),
      departure: anchorNames(row['departure'], missingId) ? null : row['departure'],
      arrival: anchorNames(row['arrival'], missingId) ? null : row['arrival'],
      afterId: row['afterId'] === missingId ? null : row['afterId'],
    };
  } else {
    next = withoutReference(row, missingId) as JsonMap;
  }
  return s.putRow(table, 'updatedAt' in next ? { ...next, updatedAt: options.now } : next);
}

/** Points a reference field holding words at the entry the author chooses. */
export function pointField(
  s: NovelSnapshot,
  entryId: string,
  fieldId: string,
  words: string,
  targetId: string,
  options: { now: number },
): NovelSnapshot {
  const owner = rowOf(s, 'loreEntries', entryId);
  if (owner === null || rowOf(s, 'loreEntries', targetId) === null) throw new ChangeRefused('That entry is no longer there.');
  return s.putRow('loreEntries', {
    ...owner,
    fields: listOf(owner['fields']).map((f) =>
      mapOrNull(f) !== null && (f as JsonMap)['id'] === fieldId
        ? {
            ...(f as JsonMap),
            value: str((f as JsonMap)['value'])
              .split('\n')
              .map((part) => (dartTrim(part) === dartTrim(words) ? targetId : part))
              .join('\n'),
          }
        : f,
    ),
    updatedAt: options.now,
  });
}

/** What merging one entry into another would do, before anything is done. */
export class MergePlan {
  constructor(
    readonly keep: JsonMap,
    readonly merge: JsonMap,
    /** Records that point at the one merged, which would point at the one kept: how many in each collection. */
    readonly repointed: readonly { table: string; rows: number }[],
    /** What of the merged entry is added to the one kept. */
    readonly combined: readonly string[],
    /** What is not kept, because the one kept already has it, or it would point at itself. */
    readonly dropped: readonly string[],
  ) {}

  get keepName(): string {
    return str(this.keep['name']);
  }

  get mergeName(): string {
    return str(this.merge['name']);
  }
}

const tableWordsMap: Readonly<Record<string, string>> = {
  loreLinks: 'connections',
  characterRelations: 'character relationships',
  loreEntries: 'fields of other entries',
  chapters: 'chapters and scenes linking it in their text',
  chapterContents: 'chapters’ and scenes’ text',
  chapterRevisions: 'saved versions of chapters',
  chapterBranches: 'alternate drafts',
  chapterPlans: 'chapter and scene plans',
  timelineEvents: 'timeline events',
  plotThreads: 'plot threads',
  characterProfiles: 'character profile',
  characterSecrets: 'secrets',
  characterNotes: 'character notes',
  characterHistory: 'character history',
  systemSheets: 'system sheets',
  progressSnapshots: 'progression snapshots',
  canonFacts: 'canon facts',
  structureMarkers: 'structural markers',
  progressChanges: 'progression changes',
  journeys: 'journeys',
};

export function tableWords(table: string): string {
  return tableWordsMap[table] ?? table;
}

/** One id, wherever it appears in a value, re-pointed at another: the same substitution a copy of the novel uses, so
 * every kind of reference follows (links in the text and its saved versions too; the words are never changed). Where
 * that makes a list hold the kept one twice (Mira and her twin at the same event), it is kept once. */
function repoint(value: unknown, fromId: string, toId: string): unknown {
  const swapped = substituteIds(value, new Map([[fromId, toId]]));
  // Only what the merge changed is tidied: a list that already held something twice is left as it was.
  return jsonEquals(swapped, value) ? value : once(swapped, toId);
}

function once(value: unknown, id: string): unknown {
  if (Array.isArray(value)) {
    let seen = false;
    const out: unknown[] = [];
    for (const v of value) {
      const isIt = v === id || (mapOrNull(v) !== null && (v as JsonMap)['id'] === id);
      if (isIt && seen) continue;
      if (isIt) seen = true;
      out.push(isIt ? v : once(v, id));
    }
    return out;
  }
  const m = mapOrNull(value);
  if (m !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(m)) out[k] = once(v, id);
    return out;
  }
  return value;
}

function entryRow(s: NovelSnapshot, id: string): JsonMap {
  const row = rowOf(s, 'loreEntries', id);
  if (row === null) throw new ChangeRefused('That entry is no longer there.');
  return row;
}

/** Every row that would change, by collection, with its new form. The merged entry's own row is left out. */
function repointedRows(s: NovelSnapshot, fromId: string, toId: string): { table: string; before: JsonMap; after: JsonMap }[] {
  const out: { table: string; before: JsonMap; after: JsonMap }[] = [];
  for (const [table, rows] of Object.entries(s.collections)) {
    for (const row of rows) {
      if (table === 'loreEntries' && row['id'] === fromId) continue;
      const after = repoint(row, fromId, toId) as JsonMap;
      if (!jsonEquals(after, row)) out.push({ table, before: row, after });
    }
  }
  return out;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What merging `mergeId` into `keepId` would do. Reads only. */
export function mergePlan(s: NovelSnapshot, keepId: string, mergeId: string): MergePlan {
  if (keepId === mergeId) throw new ChangeRefused('Choose two different entries.');
  const keep = entryRow(s, keepId);
  const merge = entryRow(s, mergeId);
  if (keep['category'] !== merge['category']) throw new ChangeRefused('Only entries of the same category can be merged.');
  const counts = new Map<string, number>();
  for (const c of repointedRows(s, mergeId, keepId)) counts.set(c.table, (counts.get(c.table) ?? 0) + 1);
  const keepName = str(keep['name']);
  const mergeName = str(merge['name']);
  const between = (r: JsonMap) => (r['fromId'] === keepId && r['toId'] === mergeId) || (r['fromId'] === mergeId && r['toId'] === keepId);
  const links = s.rows('loreLinks').filter(between).length;
  const relations = s.rows('characterRelations').filter(between).length;
  const profiles = s.rows('characterProfiles').filter((p) => p['entryId'] === keepId || p['entryId'] === mergeId).length;
  const sheets = s.rows('systemSheets').filter((r) => r['entryId'] === keepId || r['entryId'] === mergeId);
  const doubled = sheets.filter((r) => r['entryId'] === mergeId && sheets.some((k) => k['entryId'] === keepId && k['systemId'] === r['systemId'])).length;
  const keys = new Set(maps(keep['fields']).map((f) => normalizeName(str(f['key']))));
  const newFields = maps(merge['fields'])
    .filter((f) => dartTrim(str(f['key'])).length > 0 && !keys.has(normalizeName(str(f['key']))))
    .map((f) => str(f['key']));
  const keepTags = strings(keep['tags']);
  const newTags = strings(merge['tags']).filter((t) => !keepTags.includes(t));
  const mergeDescription = dartTrim(str(merge['description']));
  const byCodeUnits = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return new MergePlan(
    keep,
    merge,
    [...counts.entries()].sort((a, b) => byCodeUnits(a[0], b[0])).map(([table, rows]) => ({ table, rows })),
    [
      ...(newFields.length > 0 ? [`${plural(newFields.length, 'field', 'fields')} “${keepName}” does not have: ${newFields.join(', ')}`] : []),
      ...(newTags.length > 0 ? [`tags: ${newTags.join(', ')}`] : []),
      ...(mergeDescription.length > 0 && mergeDescription !== dartTrim(str(keep['description']))
        ? [dartTrim(str(keep['description'])).length > 0 ? 'its description, added after the description of the one kept' : 'its description']
        : []),
      ...(dartTrim(str(merge['summary'])).length > 0 && dartTrim(str(keep['summary'])).length === 0 ? ['its summary'] : []),
      ...(merge['image'] !== null && merge['image'] !== undefined && (keep['image'] === null || keep['image'] === undefined) ? ['its picture'] : []),
      `a note on “${keepName}” saying “${mergeName}” was merged into it`,
    ],
    [
      ...(links > 0 ? [`${plural(links, 'connection', 'connections')} between the two, which would point at itself`] : []),
      ...(relations > 0 ? [`${plural(relations, 'relationship', 'relationships')} between the two`] : []),
      ...(profiles > 1 ? [`the profile layout of “${mergeName}” (its name and aliases become aliases of “${keepName}”)`] : []),
      ...(doubled > 0
        ? [`${doubled} system ${doubled === 1 ? 'sheet' : 'sheets'} of “${mergeName}” in a system “${keepName}” already has a sheet in`]
        : []),
    ],
  );
}

/** Merges one entry into another of the same category, once the author has seen the plan and said yes. Every
 * reference to the merged entry is re-pointed at the one kept; what that makes point at itself, or double, goes; the
 * merged entry's content is added; then the merged entry is deleted. Nothing is left pointing at nothing. */
export function mergeEntries(s: NovelSnapshot, keepId: string, mergeId: string, options: { now: number }): NovelSnapshot {
  mergePlan(s, keepId, mergeId); // the same refusals
  const now = options.now;
  const keep = entryRow(s, keepId);
  const merge = entryRow(s, mergeId);
  const goneProfile = s.rows('characterProfiles').find((p) => p['entryId'] === mergeId) ?? null;
  const keptProfile = s.rows('characterProfiles').find((p) => p['entryId'] === keepId) ?? null;
  const goneSheets = new Set(s.rows('systemSheets').filter((r) => r['entryId'] === mergeId).map((r) => r['id']));

  // 1. Every reference follows.
  let out = s;
  for (const c of repointedRows(s, mergeId, keepId)) out = out.putRow(c.table, c.after);

  // 2. What now points at itself, or is there twice, goes.
  const seen = new Set<string>();
  out = out.withRows(
    'loreLinks',
    out.rows('loreLinks').filter((l) => {
      if (l['fromId'] === l['toId']) return false;
      const key = [l['fromId'], l['toId'], l['type'] ?? '', l['fromType'] ?? 'entry', l['toType'] ?? 'entry'].map(dartString).join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  );
  out = out.withRows(
    'characterRelations',
    out.rows('characterRelations').filter((r) => r['fromId'] !== r['toId']),
  );
  if (goneProfile !== null) {
    const gone = out.rows('characterProfiles').find((p) => p['id'] === goneProfile['id'])!;
    const keepName = str(keep['name']);
    if (keptProfile !== null) {
      const kept = out.rows('characterProfiles').find((p) => p['id'] === keptProfile['id'])!;
      const aliases = cleanList([...strings(kept['aliases']), str(merge['name']), ...strings(gone['aliases'])]).filter((a) => a !== keepName);
      out = out.withRows(
        'characterProfiles',
        out
          .rows('characterProfiles')
          .filter((p) => p['id'] !== gone['id'])
          .map((p) => (p['id'] === kept['id'] ? { ...p, aliases, updatedAt: now } : p)),
      );
    } else {
      out = out.putRow('characterProfiles', {
        ...gone,
        aliases: cleanList([...strings(gone['aliases']), str(merge['name'])]).filter((a) => a !== keepName),
        updatedAt: now,
      });
    }
  }
  const keptSheets = out.rows('systemSheets').filter((r) => r['entryId'] === keepId);
  out = out.withRows(
    'systemSheets',
    out
      .rows('systemSheets')
      .filter((r) => !(goneSheets.has(r['id']) && keptSheets.some((k) => !goneSheets.has(k['id']) && k['systemId'] === r['systemId']))),
  );

  // 3. The merged entry's own content joins the one kept.
  const keys = new Set(maps(keep['fields']).map((f) => normalizeName(str(f['key']))));
  const keepNow = out.rows('loreEntries').find((r) => r['id'] === keepId)!;
  const kd = dartTrim(str(keep['description']));
  const md = dartTrim(str(merge['description']));
  out = out.putRow('loreEntries', {
    ...keepNow,
    fields: [
      ...listOf(keepNow['fields']),
      ...maps(repoint(merge['fields'], mergeId, keepId)).filter(
        (f) => dartTrim(str(f['key'])).length > 0 && !keys.has(normalizeName(str(f['key']))),
      ),
    ],
    tags: cleanList([...strings(keep['tags']), ...strings(merge['tags'])]),
    summary: dartTrim(str(keep['summary'])).length > 0 ? keep['summary'] : merge['summary'],
    description: md.length > 0 && md !== kd ? [kd, md].filter((d) => d.length > 0).join('\n\n') : keep['description'],
    image: keep['image'] ?? merge['image'] ?? null,
    notes: [dartTrim(str(keep['notes'])), dartTrim(str(merge['notes'])), `Merged “${str(merge['name'])}” into this entry.`]
      .filter((n) => n.length > 0)
      .join('\n\n'),
    updatedAt: now,
  });
  return out.withRows(
    'loreEntries',
    out.rows('loreEntries').filter((r) => r['id'] !== mergeId),
  );
}

/** A value as Dart's string interpolation writes it, for the key of a link. */
function dartString(v: unknown): string {
  return v === null || v === undefined ? 'null' : String(v);
}
