// RECORDS BY KIND (as in the original app). Any kind of record as a table, or drawn the ways its category is set up for
// (`Category.uses`): on the story's timeline, on a map, on a ladder of ranks, or by who holds each record over the
// story. Each reads only the fields the author chose; a record whose value cannot be read is listed with the reason,
// never guessed at, and nothing is changed. A port of flutter_app/lib/shared/domain/visualize/kinds.dart.

import { fieldOf, type KindView, missingFor, type Slot } from '../codex/capabilities';
import { displayValue, jsNumber } from '../codex/fieldValues';
import { localeCompare } from '../exchange/collation';
import { mapOrNull, strOrNull } from '../json';
import { type Connection, deriveConnections } from '../model/connections';
import { type EntityRef } from '../model/entityRef';
import { type StoryModel } from '../model/storyModel';
import { type Anchor, DateAnchor, EventAnchor, NodeAnchor, Validity, historyOf, spanOfDate } from '../model/validity';
import { stableSorted } from '../reader/stableSort';
import { Category, type FieldDef } from '../records/category';
import { type Entry } from '../records/entry';
import { ExactDate } from '../records/event';
import { connectionType } from '../records/link';
import { dartTrim } from '../text/dartString';
import { formatDate, jsNum } from '../timeline/dates';
import { nodeLabel } from '../timeline/narrative';

/** The kinds offered: every category but characters (they have views of their own), with their records counted. */
export function kindsOf(model: StoryModel): { category: Category; count: number }[] {
  const counts = new Map<string, number>();
  for (const e of model.entries.values()) counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
  return [...model.categories.values()]
    .filter((c) => c.key !== 'character' && (!c.archived || (counts.get(c.key) ?? 0) > 0))
    .map((c) => ({ category: c, count: counts.get(c.key) ?? 0 }));
}

/** Which kind to show: the one asked for, else the first with records, else the first. */
export function kindKeyOf(model: StoryModel, asked: string | null): string | null {
  const kinds = kindsOf(model);
  return (
    kinds.find((k) => k.category.key === asked)?.category.key ??
    kinds.find((k) => k.count > 0)?.category.key ??
    kinds[0]?.category.key ??
    null
  );
}

const categoryOf = (model: StoryModel, key: string): Category => model.categories.get(key) ?? Category.unknown(key);

const recordsOf = (model: StoryModel, key: string): Entry[] =>
  stableSorted(
    [...model.entries.values()].filter((e) => e.category === key),
    (a, b) => {
      const byName = localeCompare(a.name, b.name);
      return byName !== 0 ? byName : localeCompare(a.id, b.id);
    },
  );

const valueOf = (entry: Entry, def: FieldDef): string => dartTrim(entry.fields.find((f) => f.defId === def.id)?.value ?? '');

/** A record that is not drawn, and why, in words. */
export type Unplaced = { entry: Entry; reason: string };

// ---------------------------------------------------------------------------------------------------- table

export class KindTable {
  constructor(
    readonly category: Category,
    /** The kind's fields, in order; archived ones are left out. */
    readonly columns: FieldDef[],
    readonly rows: { entry: Entry; cells: string[] }[],
  ) {}
}

/** A kind's records as a table: one row a record, one column a field, each value as a reader sees it (a linked record
 * by its name). */
export function kindTable(model: StoryModel, key: string): KindTable {
  const category = categoryOf(model, key);
  const columns = category.fields.filter((f) => !f.archived);
  const nameOf = (id: string) => model.entries.get(id)?.name ?? null;
  return new KindTable(
    category,
    columns,
    recordsOf(model, key).map((entry) => ({ entry, cells: columns.map((def) => displayValue(def.type, valueOf(entry, def), nameOf)) })),
  );
}

const csvCell = (text: string): string => (/[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text);

/** The table as CSV (RFC 4180): a name column, then one column a field. */
export function tableCsv(table: KindTable): string {
  return [['Name', ...table.columns.map((c) => c.name)], ...table.rows.map((r) => [r.entry.name, ...r.cells])]
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n');
}

// ---------------------------------------------------------------------------------------------------- timeline

export class TimedRecord {
  constructor(
    readonly entry: Entry,
    readonly start: ExactDate,
    readonly end: ExactDate | null,
    /** Minutes of story time, as events are placed. */
    readonly lo: number,
    readonly hi: number,
    readonly label: string,
    /** Why only part of it is drawn ("drawn at its start only: …"), or null. */
    readonly note: string | null,
  ) {}
}

export type KindTimeline = { placed: TimedRecord[]; unplaced: Unplaced[]; missing: string[] };

const wholeNumber = /^-?\d+$/;
const dateValue = /^(-?\d+)-(\d{1,2})-(\d{1,2})$/;

/** A value as a date of the story's calendar: a Number is a year, a Date a day. The reason it is not one, otherwise. */
function storyDate(def: FieldDef, value: string, model: StoryModel): { when: ExactDate | null; reason: string | null } {
  if (value.length === 0) return { when: null, reason: `${def.name} is empty.` };
  if (def.type === 'number') {
    if (!wholeNumber.test(value)) return { when: null, reason: `${def.name} holds “${value}”, not a year (a whole number).` };
    return { when: new ExactDate(Number.parseInt(value, 10)), reason: null };
  }
  const m = dateValue.exec(value);
  if (m === null) return { when: null, reason: `${def.name} holds “${value}”, not a date.` };
  const when = new ExactDate(Number.parseInt(m[1], 10), { month: Number.parseInt(m[2], 10), day: Number.parseInt(m[3], 10) });
  const problem = model.calendar.dateProblem(when);
  return problem !== null ? { when: null, reason: `${def.name}: ${problem}` } : { when, reason: null };
}

/** A kind's records on the story's timeline, from the field set as each one's date (and, if set, its end). */
export function kindTimeline(model: StoryModel, key: string): KindTimeline {
  const category = categoryOf(model, key);
  const missing = missingFor(category, 'timeline');
  const timeline = mapOrNull(category.uses['timeline']) ?? {};
  const startDef = fieldOf(category, 'timeline.start', timeline['start']);
  if (missing.length > 0 || startDef === null) return { placed: [], unplaced: [], missing };
  const endDef = fieldOf(category, 'timeline.end', timeline['end']);
  const context = model.timeContext;
  const nameOf = (id: string) => model.events.get(id)?.name ?? null;
  const placed: TimedRecord[] = [];
  const unplaced: Unplaced[] = [];
  for (const entry of recordsOf(model, key)) {
    const start = storyDate(startDef, valueOf(entry, startDef), model);
    if (start.when === null) {
      unplaced.push({ entry, reason: start.reason! });
      continue;
    }
    const span = spanOfDate(start.when, context);
    if (span === null) {
      unplaced.push({ entry, reason: `${startDef.name} cannot be placed in the novel’s calendar.` });
      continue;
    }
    let end: ExactDate | null = null;
    let note: string | null = null;
    let hi = span.hi;
    const endValue = endDef === null ? '' : valueOf(entry, endDef);
    if (endDef !== null && endValue.length > 0) {
      const read = storyDate(endDef, endValue, model);
      const endSpan = read.when === null ? null : spanOfDate(read.when, context);
      if (read.when === null) note = `drawn at its start only: ${read.reason}`;
      else if (endSpan === null) note = `drawn at its start only: ${endDef.name} cannot be placed in the novel’s calendar.`;
      else if (endSpan.hi <= span.lo) note = `drawn at its start only: ${endDef.name} is before ${startDef.name}.`;
      else {
        end = read.when;
        hi = endSpan.hi;
      }
    }
    const label =
      end !== null
        ? `${formatDate(start.when, nameOf, model.calendar)} to ${formatDate(end, nameOf, model.calendar)}`
        : formatDate(start.when, nameOf, model.calendar);
    placed.push(new TimedRecord(entry, start.when, end, span.lo, hi, label, note));
  }
  const sorted = stableSorted(placed, (a, b) => {
    const byStart = a.lo < b.lo ? -1 : a.lo > b.lo ? 1 : 0;
    return byStart !== 0 ? byStart : localeCompare(a.entry.name, b.entry.name);
  });
  return { placed: sorted, unplaced, missing };
}

// ---------------------------------------------------------------------------------------------------- map

export type MapPoint = { entry: Entry; x: number; y: number };
export type KindMap = { points: MapPoint[]; unplaced: Unplaced[]; axes: { x: string; y: string }; missing: string[] };

/** Dart's `double.toStringAsFixed(10)` then `double.parse`: rounds to 10 decimals. */
const fixed10 = (t: number): number => Number.parseFloat(t.toFixed(10));

/** Round numbers between two values, for a map's grid: about `count` of them, at 1, 2 or 5 times a power of ten. */
export function niceTicks(lo: number, hi: number, count = 5): number[] {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / count;
  const power = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
  const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= raw)!;
  const out: number[] = [];
  // At most a few dozen ticks: about `count`, and the loop is counted.
  let t = Math.ceil(lo / step) * step;
  for (let guard = 0; t <= hi + step * 1e-9 && guard < 10000; guard++, t += step) out.push(fixed10(t));
  return out;
}

/** A kind's records on a plane, from the two Number fields set as across and up. */
export function kindMap(model: StoryModel, key: string): KindMap {
  const category = categoryOf(model, key);
  const missing = missingFor(category, 'map');
  const map = mapOrNull(category.uses['map']) ?? {};
  const xDef = fieldOf(category, 'map.x', map['x']);
  const yDef = fieldOf(category, 'map.y', map['y']);
  if (missing.length > 0 || xDef === null || yDef === null) {
    return { points: [], unplaced: [], axes: { x: xDef?.name ?? '', y: yDef?.name ?? '' }, missing };
  }
  const points: MapPoint[] = [];
  const unplaced: Unplaced[] = [];
  for (const entry of recordsOf(model, key)) {
    const reasons: string[] = [];
    for (const def of [xDef, yDef]) {
      const v = valueOf(entry, def);
      if (v.length === 0) reasons.push(`${def.name} is empty.`);
      else if (jsNumber(v) === null) reasons.push(`${def.name} holds “${v}”, not a number.`);
    }
    if (reasons.length > 0) unplaced.push({ entry, reason: reasons.join(' ') });
    else points.push({ entry, x: jsNumber(valueOf(entry, xDef))!, y: jsNumber(valueOf(entry, yDef))! });
  }
  return { points, unplaced, axes: { x: xDef.name, y: yDef.name }, missing };
}

// ---------------------------------------------------------------------------------------------------- rank

export type RankLevel = { label: string; entries: Entry[] };
export type KindRanks = { levels: RankLevel[]; unplaced: Unplaced[]; field: string; missing: string[] };

/** A kind's records on a ladder, highest first, from the field set as their rank: a Number by its value, a Choice (one)
 * by the order of its choices, lowest first. A Choice field's levels are all its choices, held or not. */
export function kindRanks(model: StoryModel, key: string): KindRanks {
  const category = categoryOf(model, key);
  const missing = missingFor(category, 'rank');
  const def = fieldOf(category, 'rank', category.uses['rank']);
  if (missing.length > 0 || def === null) return { levels: [], unplaced: [], field: def?.name ?? '', missing };
  const unplaced: Unplaced[] = [];
  const at = new Map<string, Entry[]>();
  for (const entry of recordsOf(model, key)) {
    const v = valueOf(entry, def);
    if (v.length === 0) unplaced.push({ entry, reason: `${def.name} is empty.` });
    else if (def.type === 'number' && jsNumber(v) === null) unplaced.push({ entry, reason: `${def.name} holds “${v}”, not a number.` });
    else if (def.type === 'select' && !def.options.includes(v)) unplaced.push({ entry, reason: `${def.name} holds “${v}”, not one of its choices.` });
    else {
      const k = def.type === 'number' ? jsNum(jsNumber(v)!) : v;
      let list = at.get(k);
      if (list === undefined) at.set(k, (list = []));
      list.push(entry);
    }
  }
  const labels = def.type === 'select' ? [...def.options].reverse() : stableSorted(at.keys(), (a, b) => Number(b) - Number(a));
  return { levels: labels.map((l) => ({ label: l, entries: at.get(l) ?? [] })), unplaced, field: def.name, missing };
}

// ---------------------------------------------------------------------------------------------------- who holds it

export class Holding {
  constructor(
    readonly connection: Connection,
    readonly holder: EntityRef,
    readonly holderName: string,
    /** When it holds, in words: "from Ch 2 until “The siege”", or "no time given". */
    readonly when: string,
  ) {}
}

export class HeldRecord {
  constructor(
    readonly entry: Entry,
    /** Every recorded holding, in the order they began. */
    readonly history: Holding[],
    /** Who the current-holder field names, if it is set and filled in. */
    readonly current: { id: string; name: string } | null,
    /** A difference worth a look between the field and the history, in words, or null. Never fixed for the author. */
    readonly note: string | null,
  ) {}
}

export type KindHolders = { records: HeldRecord[]; typeLabel: string; field: string | null; missing: string[] };

/** Who holds each record over the story: every connection of the chosen type from a holder to the record, in the order
 * they began, beside who the current-holder field names. */
export function kindHolders(model: StoryModel, key: string): KindHolders {
  const category = categoryOf(model, key);
  const missing = missingFor(category, 'ownership' satisfies KindView);
  const ownership = mapOrNull(category.uses['ownership']) ?? {};
  const type = strOrNull(ownership['type']);
  const def = fieldOf(category, 'ownership.field' satisfies Slot, ownership['field']);
  if (missing.length > 0 || type === null || type.length === 0) {
    return { records: [], typeLabel: type === null || type.length === 0 ? '' : connectionType(type).label, field: def?.name ?? null, missing };
  }
  const want = connectionType(type).key;
  const context = model.timeContext;
  const nameOf = (ref: EntityRef) => (ref.type === 'entry' ? model.entries.get(ref.id)?.name : undefined) ?? 'a record that is gone';
  const words = (a: Anchor): string => {
    if (a instanceof NodeAnchor) return nodeLabel(model, a.nodeId);
    if (a instanceof EventAnchor) return `“${model.events.get(a.eventId)?.name ?? 'a deleted event'}”`;
    return formatDate((a as DateAnchor).when, (id) => model.events.get(id)?.name ?? null, model.calendar);
  };
  const links = deriveConnections(model).connections.filter((c) => c.kind === 'link' && connectionType(c.type).key === want && c.to.type === 'entry');
  const records = recordsOf(model, key).map((entry) => {
    const mine = historyOf(
      links.filter((c) => c.to.id === entry.id),
      (c) => c.validity ?? Validity.always,
      context,
    );
    const history = mine.map((c) => {
      const v = c.validity ?? Validity.always;
      const when = [...(v.from !== null ? [`from ${words(v.from)}`] : []), ...(v.until !== null ? [`until ${words(v.until)}`] : [])].join(' ');
      return new Holding(c, c.from, nameOf(c.from), when.length === 0 ? 'no time given' : when);
    });
    const id = def === null ? '' : valueOf(entry, def);
    const current = id.length > 0 && model.entries.has(id) ? { id, name: model.entries.get(id)!.name } : null;
    const open = history.filter((h) => h.connection.validity?.until == null);
    const note =
      current !== null && open.length > 0 && !open.some((h) => h.holder.id === current.id)
        ? `${def!.name} names ${current.name}, but the holding recorded as still in force is ${open.map((h) => `${h.holderName}’s`).join(' and ')}.`
        : null;
    return new HeldRecord(entry, history, current, note);
  });
  return { records, typeLabel: connectionType(type).label, field: def?.name ?? null, missing };
}
