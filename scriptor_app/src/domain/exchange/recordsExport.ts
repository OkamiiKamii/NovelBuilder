// EXPORTING RECORDS: what a view, or a chosen set of kinds, exports as data: the records as the app keeps them (every
// field, with stable ids), narrowed by the page's filters, with the names of everything they point at so the file
// reads on its own. It is not a backup: the whole novel is Library → Export backup. Private notes are left out unless
// asked for, and secrets are only ever included on purpose. A port of
// flutter_app/lib/shared/domain/exchange/records_export.dart.

import { localeCompare } from '../collation';
import { type JsonMap, deepCopy, mapOrNull, str } from '../json';
import { compareNum, dartSort } from '../manuscript/dartSort';
import { EntityRef, entityTypes } from '../model/entityRef';
import type { StoryModel } from '../model/storyModel';
import { Anchor } from '../model/validity';
import { strings } from '../records/jsonRecord';
import { dartTrim } from '../text/dartString';

/** The kinds of record an export can hold. */
export const recordKinds: readonly string[] = [
  'events', 'nodes', 'characters', 'entries', 'places', 'factions', 'items', 'relations', 'links', 'threads',
  'journeys', 'progress', 'abilities', 'appearances', 'secrets', 'charts',
];

/** What each kind is called, as one and as many. */
export const recordKindWords: Readonly<Record<string, readonly [string, string]>> = {
  events: ['event', 'Events'],
  nodes: ['chapter or scene', 'Chapters and scenes (without their text)'],
  characters: ['character', 'Characters'],
  entries: ['codex entry', 'All codex entries'],
  places: ['place', 'Places'],
  factions: ['faction', 'Factions'],
  items: ['item', 'Items'],
  relations: ['relationship', 'Relationships'],
  links: ['connection', 'Connections'],
  threads: ['plot thread', 'Plot threads'],
  journeys: ['journey', 'Journeys'],
  progress: ['progression change', 'Progression changes'],
  abilities: ['ability', 'Abilities'],
  appearances: ['appearance', 'Character appearances'],
  secrets: ['secret', 'Secrets'],
  charts: ['chart', 'Charts'],
};

/** What each view's data holds. */
export const viewData: Readonly<Record<string, readonly string[]>> = {
  timeline: ['events'],
  order: ['events', 'nodes'],
  relationships: ['relations', 'characters', 'links'],
  plot: ['threads', 'events', 'nodes'],
  structure: ['nodes'],
  graph: ['entries', 'events', 'nodes', 'threads', 'relations', 'links'],
  places: ['places', 'links'],
  progression: ['progress', 'characters'],
  history: ['characters', 'events', 'relations'],
  appearances: ['appearances', 'characters', 'nodes'],
  knowledge: ['secrets', 'characters'],
  kinds: ['entries'],
  abilities: ['abilities', 'links'],
  journeys: ['journeys', 'places'],
  factions: ['factions', 'links'],
  ownership: ['items', 'links'],
  charts: ['charts'],
};

/** Fields the app keeps private to the author: a codex entry's notes, a chapter's or scene's notes. */
export const privateFields: Readonly<Record<string, readonly string[]>> = {
  entries: ['notes'],
  characters: ['notes'],
  places: ['notes'],
  factions: ['notes'],
  items: ['notes'],
  nodes: ['notes'],
};

export class ExportedRecords {
  constructor(
    /** By kind, in the order the original writes them. */
    readonly records: Map<string, JsonMap[]>,
    /** The name of every record the records point at, by id. */
    readonly names: Map<string, string>,
  ) {}

  get count(): number {
    let n = 0;
    for (const rows of this.records.values()) n += rows.length;
    return n;
  }
}

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const orNull = (v: unknown): unknown => (v === undefined ? null : v);

// The original's model fills in what older records lack; its exports carry those defaults, and so do these.
const node = (r: JsonMap): JsonMap => ({ ...r, mentions: list(r['mentions']) });
const entry = (r: JsonMap): JsonMap => ({ ...r, fields: list(r['fields']), tags: list(r['tags']) });
const relation = (r: JsonMap): JsonMap => ({ ...r, stages: list(r['stages']) });
const event = (r: JsonMap): JsonMap => ({
  ...r,
  characters: list(r['characters']),
  entryIds: list(r['entryIds']),
  nodeIds: list(r['nodeIds']),
  afterId: orNull(r['afterId']),
  locationId: orNull(r['locationId']),
  end: orNull(r['end']),
  ongoing: r['ongoing'] === true,
  threadIds: list(r['threadIds']),
  status: r['status'] ?? 'confirmed',
  canon: r['canon'] ?? 'canon',
  reveals: list(r['reveals']),
});
const thread = (r: JsonMap): JsonMap => ({
  ...r,
  characterIds: list(r['characterIds']),
  locationIds: list(r['locationIds']),
  beats: list(r['beats']),
  targetNodeId: orNull(r['targetNodeId']),
});
const progress = (r: JsonMap): JsonMap => ({ ...r, at: orNull(r['at']), refId: orNull(r['refId']), abilityId: orNull(r['abilityId']) });
const journey = (r: JsonMap): JsonMap => ({
  ...r,
  travellerIds: list(r['travellerIds']),
  via: list(r['via']),
  eventIds: list(r['eventIds']),
  fromId: orNull(r['fromId']),
  toId: orNull(r['toId']),
  departure: orNull(r['departure']),
  arrival: orNull(r['arrival']),
  afterId: orNull(r['afterId']),
});

/** The records of `kinds`, as kept, and the names of every record they point at. `keep` says whether the page's
 * filters keep a record (by id). */
export function exportRecords(
  model: StoryModel,
  kinds: readonly string[],
  options: {
    keep?: (id: string) => boolean;
    includePrivate?: boolean;
    secrets?: readonly JsonMap[] | null;
    charts?: readonly JsonMap[] | null;
  } = {},
): ExportedRecords {
  const kept = options.keep ?? (() => true);
  const records = new Map<string, JsonMap[]>();
  const entries = [...model.entries.values()];
  const put = (kind: string, rows: Iterable<JsonMap>) => {
    const hide = options.includePrivate === true ? [] : (privateFields[kind] ?? []);
    const out: JsonMap[] = [];
    for (const r of rows) {
      const copy: JsonMap = {};
      for (const [k, v] of Object.entries(r)) if (!hide.includes(k)) copy[k] = deepCopy(v);
      out.push(copy);
    }
    records.set(kind, out);
  };
  const sorted = (rows: JsonMap[], name: (r: JsonMap) => string) =>
    dartSort(rows, (a, b) => {
      const byName = localeCompare(name(a), name(b));
      return byName !== 0 ? byName : localeCompare(str(a['id']), str(b['id']));
    });
  const byCategory = (category: string) => entries.filter((e) => e.category === category && kept(e.id)).map((e) => entry(e.raw));
  const nameOf = (r: JsonMap) => str(r['name']);

  for (const kind of kinds) {
    switch (kind) {
      case 'events':
        put(kind, sorted([...model.events.values()].filter((e) => kept(e.id)).map((e) => event(e.raw)), nameOf));
        break;
      case 'nodes':
        put(
          kind,
          dartSort(
            [...model.nodes.values()].filter((n) => kept(n.id)),
            (a, b) => compareNum(model.order.position.get(a.id) ?? 0, model.order.position.get(b.id) ?? 0),
          ).map((n) => node(n.raw)),
        );
        break;
      case 'characters':
        put(kind, sorted(byCategory('character'), nameOf));
        break;
      case 'places':
        put(kind, sorted(byCategory('location'), nameOf));
        break;
      case 'factions':
        put(kind, sorted(byCategory('faction'), nameOf));
        break;
      case 'items':
        put(kind, sorted(byCategory('item'), nameOf));
        break;
      case 'entries':
        put(kind, sorted(entries.filter((e) => kept(e.id)).map((e) => entry(e.raw)), nameOf));
        break;
      case 'relations':
        put(kind, sorted([...model.relations.values()].filter((r) => kept(r.id)).map((r) => relation(r.raw)), (r) => str(r['id'])));
        break;
      case 'threads':
        put(kind, sorted([...model.threads.values()].filter((t) => kept(t.id)).map((t) => thread(t.raw)), (r) => str(r['title'])));
        break;
      case 'journeys':
        put(kind, model.journeys.map((j) => journey(j.raw)));
        break;
      case 'progress':
        put(kind, model.progress.filter((c) => kept(c.entryId)).map((c) => progress(c.raw)));
        break;
      case 'abilities':
        put(
          kind,
          [...model.abilities.entries()].map(([id, a]) => ({ id, system: a.system.name, group: a.group, item: a.item.raw })),
        );
        break;
      case 'appearances':
        put(
          kind,
          [...model.plans.values()]
            .filter((p) => (p.appearIds.length > 0 || p.mentionIds.length > 0 || p.povIds.length > 0) && kept(p.id))
            .map((p) => ({ nodeId: p.id, appearIds: p.appearIds, mentionIds: p.mentionIds, povIds: p.povIds })),
        );
        break;
      case 'secrets':
        if (options.secrets !== undefined && options.secrets !== null) put(kind, options.secrets);
        break;
      case 'charts':
        if (options.charts !== undefined && options.charts !== null) put(kind, options.charts);
        break;
    }
  }
  // Connections whose ends are among what is exported.
  if (kinds.includes('links')) {
    const ids = new Set<unknown>();
    for (const rows of records.values()) for (const r of rows) if (typeof r['id'] === 'string') ids.add(r['id']);
    records.set(
      'links',
      model.links.filter((l) => ids.has(l.fromId) || ids.has(l.toId)).map((l) => deepCopy(l.raw) as JsonMap),
    );
  }
  // The names of everything the records point at: every string they hold that is the id of one of the novel's records.
  const held = new Set<string>();
  const stack: unknown[] = [[...records.values()]];
  // Each value is visited once; the bound only guards against a value that holds itself.
  for (let turns = 0; stack.length > 0 && turns < 10_000_000; turns++) {
    const v = stack.pop();
    if (typeof v === 'string') held.add(v);
    else if (Array.isArray(v)) for (let i = v.length - 1; i >= 0; i--) stack.push(v[i]);
    else if (v !== null && typeof v === 'object') {
      const values = Object.values(v as JsonMap);
      for (let i = values.length - 1; i >= 0; i--) stack.push(values[i]);
    }
  }
  const names = new Map<string, string>();
  for (const id of held) {
    for (const type of entityTypes) {
      const found = model.resolve(new EntityRef(type, id));
      if (found !== null) {
        names.set(id, found.label);
        break;
      }
    }
  }
  return new ExportedRecords(records, names);
}

/** Dart's `toString` of a value a record holds: a list as "[a, b]", a map as "{k: v}". */
function dartToString(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return `[${v.map(dartToString).join(', ')}]`;
  if (typeof v === 'object') return `{${Object.entries(v as JsonMap).map(([k, x]) => `${k}: ${dartToString(x)}`).join(', ')}}`;
  return String(v);
}

/** Dart's `toString` of a number as JSON holds it (a whole number without ".0"). */
const numberText = (n: number) => String(n);

/** One CSV cell: quoted when it holds a comma, quote or line break; formulas a spreadsheet would run are made text. */
export function csvCell(value: unknown): string {
  let text =
    value === null || value === undefined
      ? ''
      : typeof value === 'string'
        ? value
        : typeof value === 'number'
          ? numberText(value)
          : typeof value === 'boolean'
            ? value
              ? 'yes'
              : 'no'
            : dartToString(value);
  if (/^[=+\-@\t\r]/.test(text) && typeof value === 'string') text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Records as tables for a spreadsheet: one table per kind, a column per field, lists joined with "; " and the ids in
 * them shown as names. Every table is headed by its kind; the file opens in any spreadsheet and reads every script. */
export function recordsCsv(exported: ExportedRecords, heading: readonly string[]): string {
  const cell = (v: unknown): string => {
    if (typeof v === 'string') return exported.names.get(v) ?? v;
    if (Array.isArray(v)) return v.map(cell).join('; ');
    if (v !== null && typeof v === 'object') {
      const m = v as JsonMap;
      return 'id' in m && typeof m['id'] === 'string' && exported.names.has(m['id']) ? exported.names.get(m['id'])! : JSON.stringify(m);
    }
    return v === null || v === undefined ? '' : String(v);
  };
  let out = '﻿';
  out += `${heading.map(csvCell).join(',')}\n`;
  for (const [kind, rows] of exported.records) {
    out += `\r\n${csvCell(recordKindWords[kind]?.[1] ?? kind)}\r\n`;
    const columns = ['id', 'name', 'title'].filter((c) => rows.some((r) => c in r));
    for (const r of rows) for (const k of Object.keys(r)) if (!columns.includes(k) && k !== 'projectId') columns.push(k);
    out += `${columns.map(csvCell).join(',')}\r\n`;
    for (const r of rows) out += `${columns.map((c) => csvCell(c === 'id' ? r[c] : cell(r[c]))).join(',')}\r\n`;
  }
  return out;
}

/** The records as one JSON object, kind by kind, as the Flutter app writes the `records` of an export. */
export function recordsJson(exported: ExportedRecords): JsonMap {
  const out: JsonMap = {};
  for (const [kind, rows] of exported.records) out[kind] = rows;
  return out;
}

/** The names, as one JSON object. */
export function namesJson(exported: ExportedRecords): JsonMap {
  const out: JsonMap = {};
  for (const [id, name] of exported.names) out[id] = name;
  return out;
}

// ---------------------------------------------------------------------------------------------------- the file

/** What every view or records export says about itself: it is not a backup. */
export const notABackup =
  'This file holds some of the novel’s records, with the filters used. It is not a backup: to keep or move the whole ' +
  'novel, use Library → Export backup (or Settings → Import & export).';

/** A file name in the novel's own words (letters of any script kept): "the-ember-crown-timeline-2026-10-22.json". */
export function exportFileName(title: string, what: string, at: Date, extension: string): string {
  const slug = title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
  const runes = Array.from(slug);
  const cut = runes.length > 60 ? runes.slice(0, 60).join('') : slug;
  const day = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
  return `${cut.length === 0 ? 'untitled' : cut}-${what}-${day}.${extension}`;
}

/** The page's filters, in words. Ids are named; nothing is left out. As the original app words them. */
export function filterWords(filter: JsonMap, model: StoryModel, when: (at: Anchor | null) => string): string[] {
  const named = (ids: unknown) =>
    strings(ids)
      .map((id) => model.entries.get(id)?.name ?? model.threads.get(id)?.title ?? id)
      .join(', ');
  const words: string[] = [];
  const text = dartTrim(str(filter['text']));
  if (text.length > 0) words.push(`Name contains “${text}”`);
  if (strings(filter['characters']).length > 0) words.push(`Involving: ${named(filter['characters'])}`);
  if (strings(filter['locations']).length > 0) words.push(`At: ${named(filter['locations'])}`);
  if (strings(filter['factions']).length > 0) words.push(`Faction: ${named(filter['factions'])}`);
  if (strings(filter['threads']).length > 0) words.push(`Plot thread: ${named(filter['threads'])}`);
  if (strings(filter['canon']).length > 0) words.push(`Canon status: ${strings(filter['canon']).join(', ')}`);
  if (strings(filter['status']).length > 0) words.push(`Planning status: ${strings(filter['status']).join(', ')}`);
  if (strings(filter['significance']).length > 0) words.push(`Significance: ${strings(filter['significance']).join(', ')}`);
  if (strings(filter['categories']).length > 0) words.push(`Kinds of record: ${strings(filter['categories']).join(', ')}`);
  const chapters = mapOrNull(filter['chapters']);
  if (chapters !== null && (chapters['from'] != null || chapters['to'] != null)) {
    const at = (id: unknown) => (typeof id === 'string' ? when(Anchor.fromJson({ kind: 'node', nodeId: id })) : '');
    words.push(
      `Chapters: from ${chapters['from'] != null ? at(chapters['from']) : 'the start'} to ${chapters['to'] != null ? at(chapters['to']) : 'the end'}`,
    );
  }
  const time = mapOrNull(filter['time']);
  if (time !== null && (time['from'] != null || time['until'] != null)) {
    words.push(
      `Story time: from ${time['from'] != null ? when(Anchor.fromJson(time['from'])) : 'the start'} until ${time['until'] != null ? when(Anchor.fromJson(time['until'])) : 'the end'}`,
    );
  }
  return words;
}
