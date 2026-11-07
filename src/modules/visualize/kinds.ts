import { fieldOf, KIND_VIEWS, missingFor, type KindView } from '@/modules/codex/capabilities';
import { displayValue, unknownCategory } from '@/modules/codex/schema';
import type { Category, FieldDef, LoreEntry } from '@/modules/codex/types';
import { connectionType } from '@/modules/connections/types';
import { deriveConnections } from '@/modules/model/connections';
import type { Connection, EntityRef, StoryModel } from '@/modules/model/types';
import { ALWAYS, historyOf, spanOfDate, timeContext, type Anchor } from '@/modules/model/validity';
import { dateProblem, STANDARD_CALENDAR } from '@/modules/timeline/calendar';
import { formatDate } from '@/modules/timeline/chronology';
import { nodeLabel } from '@/modules/timeline/narrative';
import type { EventDate } from '@/modules/timeline/types';

/**
 * RECORDS BY KIND
 * Any kind of Codex record as a table, or drawn the ways its category is set
 * up for (`Category.uses`): on the story's timeline, on a map, on a ladder of
 * ranks, or by who holds each record over the story. Each reads only the
 * fields the author chose; a record whose value cannot be read is listed
 * with the reason, never guessed at, and nothing is changed.
 */

/** The page address: which kind, and how it is shown. */
export const KIND_PARAMS = ['kind', 'kshow'] as const;
export type KindShow = KindView | 'table';

/** The kinds offered: every Codex category but characters (they have views of their own), with their records counted. */
export function kindsOf(model: Pick<StoryModel, 'categories' | 'entries'>): { category: Category; count: number }[] {
  const counts = new Map<string, number>();
  for (const e of model.entries.values()) counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
  return [...model.categories.values()]
    .filter((c) => c.key !== 'character' && (!c.archived || counts.get(c.key)))
    .map((category) => ({ category, count: counts.get(category.key) ?? 0 }));
}

/** Which kind and way of showing it the address names. A kind that is not there falls back to the first with records; an unknown way, to the table. */
export function readKind(params: URLSearchParams, model: Pick<StoryModel, 'categories' | 'entries'>): { key: string | null; show: KindShow } {
  const kinds = kindsOf(model);
  const asked = params.get('kind');
  const key = kinds.find((k) => k.category.key === asked)?.category.key ?? kinds.find((k) => k.count > 0)?.category.key ?? kinds[0]?.category.key ?? null;
  const show = params.get('kshow');
  return { key, show: (KIND_VIEWS as readonly string[]).includes(show ?? '') ? (show as KindView) : 'table' };
}

/** The settings a saved view keeps for this view. */
export const kindLayout = (params: URLSearchParams): Record<string, string> => Object.fromEntries(KIND_PARAMS.flatMap((p) => (params.get(p) ? [[p, params.get(p)!]] : [])));

const categoryOf = (model: Pick<StoryModel, 'categories'>, key: string) => model.categories.get(key) ?? unknownCategory(key);
const recordsOf = (model: Pick<StoryModel, 'entries'>, key: string) => [...model.entries.values()].filter((e) => e.category === key).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
const valueOf = (entry: LoreEntry, def: FieldDef) => entry.fields.find((f) => f.defId === def.id)?.value.trim() ?? '';

/** Why a record is not drawn, in words. */
export interface Unplaced {
  entry: LoreEntry;
  reason: string;
}

// ---------------------------------------------------------------------------------------------------- table

export interface KindTable {
  category: Category;
  /** The kind's fields, in order; archived ones are left out. */
  columns: FieldDef[];
  rows: { entry: LoreEntry; cells: string[] }[];
}

/** A kind's records as a table: one row a record, one column a field, each value as a reader sees it (a linked record by its name). */
export function kindTable(model: Pick<StoryModel, 'categories' | 'entries'>, key: string): KindTable {
  const category = categoryOf(model, key);
  const columns = category.fields.filter((f) => !f.archived);
  const nameOf = (id: string) => model.entries.get(id)?.name;
  return { category, columns, rows: recordsOf(model, key).map((entry) => ({ entry, cells: columns.map((def) => displayValue({ type: def.type, value: valueOf(entry, def) }, nameOf)) })) };
}

const csvCell = (text: string) => (/[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);
/** The table as CSV (RFC 4180): a name column, then one column a field. */
export const tableCsv = (table: KindTable): string => [['Name', ...table.columns.map((c) => c.name)], ...table.rows.map((r) => [r.entry.name, ...r.cells])].map((row) => row.map(csvCell).join(',')).join('\r\n');

// ---------------------------------------------------------------------------------------------------- timeline

export interface TimedRecord {
  entry: LoreEntry;
  start: EventDate;
  end: EventDate | null;
  /** Minutes of story time, as events are placed. */
  span: { lo: number; hi: number };
  label: string;
  /** Why only part of it is drawn ("drawn at its start only: …"), or null. */
  note: string | null;
}
export interface KindTimeline {
  placed: TimedRecord[];
  unplaced: Unplaced[];
  missing: string[];
}

/** A value as a date of the story's calendar: a Number is a year, a Date a day. The reason it is not one, otherwise. */
function storyDate(def: FieldDef, value: string, calendar: StoryModel['calendar']): { when: EventDate } | { reason: string } {
  if (!value) return { reason: `${def.name} is empty.` };
  if (def.type === 'number') {
    if (!/^-?\d+$/.test(value)) return { reason: `${def.name} holds “${value}”, not a year (a whole number).` };
    return { when: { precision: 'exact', year: Number(value), month: null, day: null, hour: null, minute: null } };
  }
  const m = /^(-?\d+)-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (!m) return { reason: `${def.name} holds “${value}”, not a date.` };
  const when: EventDate = { precision: 'exact', year: Number(m[1]), month: Number(m[2]), day: Number(m[3]), hour: null, minute: null };
  const problem = dateProblem(when, calendar ?? STANDARD_CALENDAR);
  return problem ? { reason: `${def.name}: ${problem}` } : { when };
}

/** A kind's records on the story's timeline, from the field set as each one's date (and, if set, its end). */
export function kindTimeline(model: StoryModel, key: string): KindTimeline {
  const category = categoryOf(model, key);
  const missing = missingFor(category, 'timeline');
  const startDef = fieldOf(category, 'timeline.start', category.uses?.timeline?.start);
  if (missing.length || !startDef) return { placed: [], unplaced: [], missing };
  const endDef = fieldOf(category, 'timeline.end', category.uses?.timeline?.end);
  const context = timeContext(model);
  const nameOf = (id: string) => model.events.get(id)?.name;
  const placed: TimedRecord[] = [];
  const unplaced: Unplaced[] = [];
  for (const entry of recordsOf(model, key)) {
    const start = storyDate(startDef, valueOf(entry, startDef), model.calendar);
    if ('reason' in start) {
      unplaced.push({ entry, reason: start.reason });
      continue;
    }
    const span = spanOfDate(start.when, context);
    if (!span) {
      unplaced.push({ entry, reason: `${startDef.name} cannot be placed in the novel’s calendar.` });
      continue;
    }
    let end: EventDate | null = null;
    let note: string | null = null;
    let hi = span.hi;
    const endValue = endDef ? valueOf(entry, endDef) : '';
    if (endDef && endValue) {
      const read = storyDate(endDef, endValue, model.calendar);
      const endSpan = 'when' in read ? spanOfDate(read.when, context) : null;
      if ('reason' in read) note = `drawn at its start only: ${read.reason}`;
      else if (!endSpan) note = `drawn at its start only: ${endDef.name} cannot be placed in the novel’s calendar.`;
      else if (endSpan.hi <= span.lo) note = `drawn at its start only: ${endDef.name} is before ${startDef.name}.`;
      else {
        end = read.when;
        hi = endSpan.hi;
      }
    }
    const label = end ? `${formatDate(start.when, nameOf, model.calendar)} to ${formatDate(end, nameOf, model.calendar)}` : formatDate(start.when, nameOf, model.calendar);
    placed.push({ entry, start: start.when, end, span: { lo: span.lo, hi }, label, note });
  }
  placed.sort((a, b) => a.span.lo - b.span.lo || a.entry.name.localeCompare(b.entry.name));
  return { placed, unplaced, missing };
}

// ---------------------------------------------------------------------------------------------------- map

export interface MapPoint {
  entry: LoreEntry;
  x: number;
  y: number;
}
export interface KindMap {
  points: MapPoint[];
  unplaced: Unplaced[];
  /** The fields' names: what across and up mean. */
  axes: { x: string; y: string };
  missing: string[];
}

/** Round numbers between two values, for a map's grid: about `count` of them, at 1, 2 or 5 times a power of ten. */
export function niceTicks(lo: number, hi: number, count = 5): number[] {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= raw)!;
  const out: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + step * 1e-9; t += step) out.push(Number(t.toFixed(10)));
  return out;
}

/** A kind's records on a plane, from the two Number fields set as across and up. */
export function kindMap(model: Pick<StoryModel, 'categories' | 'entries'>, key: string): KindMap {
  const category = categoryOf(model, key);
  const missing = missingFor(category, 'map');
  const [xDef, yDef] = [fieldOf(category, 'map.x', category.uses?.map?.x), fieldOf(category, 'map.y', category.uses?.map?.y)];
  if (missing.length || !xDef || !yDef) return { points: [], unplaced: [], axes: { x: xDef?.name ?? '', y: yDef?.name ?? '' }, missing };
  const points: MapPoint[] = [];
  const unplaced: Unplaced[] = [];
  for (const entry of recordsOf(model, key)) {
    const reasons = [xDef, yDef].flatMap((def) => {
      const v = valueOf(entry, def);
      return !v ? [`${def.name} is empty.`] : Number.isFinite(Number(v)) ? [] : [`${def.name} holds “${v}”, not a number.`];
    });
    if (reasons.length) unplaced.push({ entry, reason: reasons.join(' ') });
    else points.push({ entry, x: Number(valueOf(entry, xDef)), y: Number(valueOf(entry, yDef)) });
  }
  return { points, unplaced, axes: { x: xDef.name, y: yDef.name }, missing };
}

// ---------------------------------------------------------------------------------------------------- rank

export interface RankLevel {
  /** The rank as written: the choice, or the number. */
  label: string;
  entries: LoreEntry[];
}
export interface KindRanks {
  /** Highest first. A Choice field's levels are all its choices, held or not, so the ladder keeps its shape. */
  levels: RankLevel[];
  unplaced: Unplaced[];
  field: string;
  missing: string[];
}

/** A kind's records on a ladder, from the field set as their rank: a Number by its value, a Choice (one) by the order of its choices, lowest first. */
export function kindRanks(model: Pick<StoryModel, 'categories' | 'entries'>, key: string): KindRanks {
  const category = categoryOf(model, key);
  const missing = missingFor(category, 'rank');
  const def = fieldOf(category, 'rank', category.uses?.rank);
  if (missing.length || !def) return { levels: [], unplaced: [], field: def?.name ?? '', missing };
  const unplaced: Unplaced[] = [];
  const at = new Map<string, LoreEntry[]>();
  for (const entry of recordsOf(model, key)) {
    const v = valueOf(entry, def);
    if (!v) unplaced.push({ entry, reason: `${def.name} is empty.` });
    else if (def.type === 'number' && !Number.isFinite(Number(v))) unplaced.push({ entry, reason: `${def.name} holds “${v}”, not a number.` });
    else if (def.type === 'select' && !def.options.includes(v)) unplaced.push({ entry, reason: `${def.name} holds “${v}”, not one of its choices.` });
    else {
      const level = def.type === 'number' ? String(Number(v)) : v;
      at.set(level, [...(at.get(level) ?? []), entry]);
    }
  }
  const labels = def.type === 'select' ? [...def.options].reverse() : [...at.keys()].sort((a, b) => Number(b) - Number(a));
  return { levels: labels.map((label) => ({ label, entries: at.get(label) ?? [] })), unplaced, field: def.name, missing };
}

// ---------------------------------------------------------------------------------------------------- who holds it

export interface Holding {
  connection: Connection;
  holder: EntityRef;
  holderName: string;
  /** When it holds, in words: "from Ch 2 until “The siege”", or "no time given". */
  when: string;
}
export interface HeldRecord {
  entry: LoreEntry;
  /** Every recorded holding, in the order they began. */
  history: Holding[];
  /** Who the current-holder field names, if it is set and filled in. */
  current: { id: string; name: string } | null;
  /** A difference worth a look between the field and the history, in words, or null. Never fixed for the author. */
  note: string | null;
}
export interface KindHolders {
  records: HeldRecord[];
  /** The connection type that means holding, in words ("Owns"). */
  typeLabel: string;
  field: string | null;
  missing: string[];
}

/**
 * Who holds each record over the story: every connection of the chosen type
 * from a holder to the record, in the order they began (a change of holder
 * is recorded as one connection ending where the next begins), beside who
 * the current-holder field names.
 */
export function kindHolders(model: StoryModel, key: string): KindHolders {
  const category = categoryOf(model, key);
  const missing = missingFor(category, 'ownership');
  const type = category.uses?.ownership?.type;
  const def = fieldOf(category, 'ownership.field', category.uses?.ownership?.field);
  if (missing.length || !type) return { records: [], typeLabel: type ? connectionType(type).label : '', field: def?.name ?? null, missing };
  const want = connectionType(type).key;
  const context = timeContext(model);
  const nameOf = (ref: EntityRef) => (ref.type === 'entry' ? model.entries.get(ref.id)?.name : undefined) ?? 'a record that is gone';
  const words = (a: Anchor) => (a.kind === 'node' ? nodeLabel(model, a.nodeId) : a.kind === 'event' ? `“${model.events.get(a.eventId)?.name ?? 'a deleted event'}”` : formatDate(a.when, (id) => model.events.get(id)?.name, model.calendar));
  const links = deriveConnections(model).connections.filter((c) => c.kind === 'link' && connectionType(c.type).key === want && c.to.type === 'entry');
  const records = recordsOf(model, key).map((entry): HeldRecord => {
    const mine = historyOf(
      links.filter((c) => c.to.id === entry.id),
      (c) => c.validity ?? ALWAYS,
      context,
    );
    const history = mine.map((c) => {
      const { from, until } = c.validity ?? ALWAYS;
      const when = [from ? `from ${words(from)}` : '', until ? `until ${words(until)}` : ''].filter(Boolean).join(' ') || 'no time given';
      return { connection: c, holder: c.from, holderName: nameOf(c.from), when };
    });
    const id = def ? valueOf(entry, def) : '';
    const current = id && model.entries.has(id) ? { id, name: model.entries.get(id)!.name } : null;
    const open = history.filter((h) => !h.connection.validity?.until);
    const note = current && open.length && !open.some((h) => h.holder.id === current.id) ? `${def!.name} names ${current.name}, but the holding recorded as still in force is ${open.map((h) => `${h.holderName}’s`).join(' and ')}.` : null;
    return { entry, history, current, note };
  });
  return { records, typeLabel: connectionType(type).label, field: def?.name ?? null, missing };
}
