// A module's TOOLS, drawn from their descriptions: the pure parts of flutter_app/lib/features/modules/module_tools.dart
// (what each shows, its words, and what a press changes). Every tool works on the novel's own records: an entry made
// or changed here is the Codex's, seen by search, the story graph and every other module. Presses are returned as
// change functions to run inside ModuleService.change (or useCast's `now` for entry changes: CharacterChanges is a
// CodexChanges).
//
// How each is drawn (the Flutter widgets):
// - NEW ENTRY (on every tool that lists a category, when the novel can be changed): a text field "New <singular>"
//   (hint "New <singular>…") and **Add** (disabled while empty); Enter adds.
// - CELL: the right control for a field (TypedInput: typed values saved as typing stops, choices at once); read-only,
//   the shown value or "—".
// - REGISTRY: New entry (with the filter's choice preset), search "Search <Category>", "Filter by <field>" (a choice:
//   "Any <field>", each group, "Not set"), By name / Recently changed; then the rows (cards 6 apart: title, the line
//   of summary and summary fields in two lines, the group as a chip). A record open shows beside the list from 760
//   wide, else in its place: back to the category, "Open in World", then its name, description, the category's
//   fields and private notes (each saved as typed), and the note under it.
// - BOARD: New entry, then columns 260 wide (12 apart, scrolling sideways; surfaceContainerLow, radius 8, padding 8):
//   "<title>  <count>" (titleSmall), then a card per entry: its link, the shown fields (bodySmall), and its cell.
// - TABLE, MATRIX: a grid scrolling sideways, a header row (bold) and rows, rules between them; matrix cells 170 wide
//   (a choice of the tool's values, or text committed when done; "—" read-only).
// - METERS: a card per entry: its link, then per field a row: the name (120), a bar 160 × 8 (value / max, clamped),
//   the cell (140), "/ <max>".
// - LOG: the arc chart (when the log has values: 180 high, padding 16, axes in outline, a line 2 wide and dots of 4 per
//   series in `arcColours`), the add row (title 280, chapter 240, **Add**), suggestion chips "+ <s>", then a card per
//   line: done box (checklists), title (260), state (200), value (120), remove; chapter, "<second>" chapter, about,
//   timeline event (240 each); notes; and its links (open the chapter, on the timeline, each entry it is about).
// - CALCULATOR: an input 240 wide per input ("<label> (<unit>)", numbers), then "Results": a row per output, its
//   value bold at the right.
// - RANKS, INVENTORY: from the progression snapshots (a card per character; inventory chooses who and as of when).
// - LINEAGE: "Generation N" (titleSmall), cards 260 wide, then the note.
// - PAGE: "Open <title>", or "That page is not in this version of the app."

import { type CodexChanges } from '../../codex/codexChanges';
import { localeCompare } from '../../exchange/collation';
import { type JsonMap, mapOrNull, numOrNull, str, strOrNull } from '../../json';
import { dartSort } from '../../manuscript/dartSort';
import { type Category, type FieldDef } from '../../records/category';
import { type Entry, viewFields } from '../../records/entry';
import { maps, strings } from '../../records/jsonRecord';
import { type StoryNode } from '../../records/storyNode';
import { ProgressSnapshot, inStoryOrder, placeOfSnapshot, stateAt, trackLabel } from '../../progression/snapshots';
import { FormulaError, evaluateFormula, formatNumber as formulaNumber, jsString, parseFormula } from '../../systems/formula';
import { dartToLowerCase, dartTrim } from '../../text/dartString';
import { type Placed, resolveChronology } from '../../timeline/chronology';
import { type ModuleChanges } from '../moduleChanges';
import { buildLineage } from '../moduleDefs';
import { type ToolData, corePagePath, modulePath } from '../moduleService';

/** What every tool is given: the module, the tool as arranged here, the novel's records, and whether it can change. */
export type ToolAt = { moduleId: string; tool: JsonMap; data: ToolData; writes: boolean };

export const unknownToolText = 'This kind of tool is not known to this version of the app.';

/** Said when a tool needs a category or field the Codex no longer has. */
export const missingText = (what: string): string =>
  `This tool needs ${what}, which is not in World. Turning the module off and on again puts back anything of its ` +
  'own that is missing.';

/** Dart's `num.tryParse`: a decimal or exponent number (or hex integer, NaN, Infinity), surrounding space allowed;
 * else null. `whole` says whether Dart would read it as an int. */
export function dartNum(text: string): { value: number; whole: boolean } | null {
  const t = dartTrim(text);
  if (/^[+-]?\d+$/.test(t)) return { value: Number(t), whole: true };
  const hex = /^([+-]?)0[xX]([0-9a-fA-F]+)$/.exec(t);
  if (hex !== null) return { value: (hex[1] === '-' ? -1 : 1) * parseInt(hex[2], 16), whole: true };
  if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return { value: Number(t), whole: false };
  if (/^[+-]?(NaN|Infinity)$/.test(t)) return { value: Number(t.replace('+', '')), whole: false };
  return null;
}

/** A number as Dart's `'$n'` writes what num.tryParse read: an int plainly, a double with ".0" when whole. */
export function dartNumString(n: { value: number; whole: boolean }): string {
  if (n.whole) return String(n.value);
  if (Number.isNaN(n.value)) return 'NaN';
  if (!Number.isFinite(n.value)) return n.value > 0 ? 'Infinity' : '-Infinity';
  const s = String(n.value);
  return Number.isInteger(n.value) && !/e/.test(s) ? `${s}.0` : s;
}

const lower = (s: string): string => dartToLowerCase(s);

// ------------------------------------------------------------------------------------------- shared bits

/** "New <singular>": the field's label and hint. */
export function newEntryWords(category: Category): { label: string; hint: string; add: string } {
  const singular = lower(category.singular);
  return { label: `New ${singular}`, hint: `New ${singular}…`, add: 'Add' };
}

/** Adds an entry to a category without leaving the tool; `preset` a field's value it starts with (the registry's
 * filter). Null for a name of only spaces. */
export function newEntryChange(
  category: Category,
  name: string,
  preset?: { def: FieldDef; value: string } | null,
): ((c: CodexChanges) => Entry) | null {
  const typed = dartTrim(name);
  if (typed.length === 0) return null;
  return (c) => {
    const entry = c.createEntry(category.key, typed);
    if (preset && preset.value.length > 0) c.setFieldValue(entry.id, preset.def.id, preset.value);
    return entry;
  };
}

/** A cell: its label, value as stored, value as shown (read-only), the entries a link can point at, and the change a
 * value makes (`later` under `key` for typing, now for a choice). */
export function cell(
  data: ToolData,
  entry: Entry,
  category: Category,
  def: FieldDef,
): {
  key: string;
  label: string;
  value: string;
  shown: string;
  semanticsLabel: string;
  entries: Entry[];
  write: (value: string) => (c: CodexChanges) => void;
} {
  const shown = data.shown(entry, category, def);
  const label = `${def.name} of ${entry.name}`;
  return {
    key: `${entry.id}/${def.id}`,
    label,
    value: data.raw(entry, category, def),
    shown: shown.length === 0 ? '—' : shown,
    semanticsLabel: `${label}: ${shown}`,
    entries: data.entries.filter((e) => e.id !== entry.id),
    write: (value) => (c) => c.setFieldValue(entry.id, def.id, value),
  };
}

/** A choice among a few values, with a "none" choice, keeping a value that is no longer among them. */
export function choiceOptions(
  value: string,
  options: readonly string[],
  none: string | null,
  names?: (option: string) => string,
): { initial: string | null; items: { value: string; label: string }[] } {
  const all = [...(value.length > 0 && !options.includes(value) ? [value] : []), ...new Set(options)];
  return {
    initial: value.length === 0 && none !== null ? '' : value.length === 0 ? null : value,
    items: [...(none !== null ? [{ value: '', label: none }] : []), ...all.map((o) => ({ value: o, label: names?.(o) ?? o }))],
  };
}

const entryTitle = (e: Entry): string => (e.name.length === 0 ? 'Untitled' : e.name);

// ------------------------------------------------------------------------------------------------- registry

/** REGISTRY: one category of the world as a working list. `query`, `only` (a group, "—" for not set, "" for any),
 * `recent` (by last change) and `record` (the one open) are the screen's. */
export function registryTool(
  at: ToolAt,
  view: { query: string; only: string; recent: boolean; record: string | null },
):
  | { missing: string }
  | {
      category: Category;
      newEntry: { label: string; hint: string; add: string };
      preset: { def: FieldDef; value: string } | null;
      searchLabel: string;
      filter: { label: string; value: string; options: string[]; none: string; names: (o: string) => string } | null;
      order: { byName: string; recent: string };
      empty: string | null;
      rows: { entry: Entry; title: string; line: string | null; chip: string | null; selected: boolean; path: string }[];
      record: RegistryRecord | null;
    } {
  const { data, tool } = at;
  const category = data.category(str(tool['category']));
  if (category === null) return { missing: missingText(`“${str(tool['category'])}”`) };
  const group = strOrNull(tool['groupBy']) === null ? null : data.field(category, str(tool['groupBy']), str(tool['category']));
  const summary: FieldDef[] = [];
  for (const name of strings(tool['summary'])) {
    const d = data.field(category, name, str(tool['category']));
    if (d !== null) summary.push(d);
  }
  const all = data.entriesOf(category);
  const groupOf = (e: Entry) => (group === null ? '' : data.shown(e, category, group));
  const groups =
    group === null
      ? []
      : [
          ...(group.type === 'select' ? group.options : []),
          ...new Set(
            all
              .map(groupOf)
              .filter((g) => g.length > 0 && !(group.type === 'select' && group.options.includes(g))),
          ),
        ];
  const needle = lower(dartTrim(view.query));
  const listed = all.filter(
    (e) =>
      (view.only.length === 0 || (view.only === '—' ? groupOf(e).length === 0 : groupOf(e) === view.only)) &&
      (needle.length === 0 || [e.name, e.summary, ...e.tags, ...e.fields.map((f) => f.value)].some((t) => lower(t).includes(needle))),
  );
  if (view.recent) dartSort(listed, (a, b) => b.updatedAt - a.updatedAt);
  else dartSort(listed, (a, b) => localeCompare(a.name, b.name));
  const selected = all.find((e) => e.id === view.record) ?? null;
  const preset = group !== null && group.type === 'select' && view.only.length > 0 && view.only !== '—' ? { def: group, value: view.only } : null;
  return {
    category,
    newEntry: newEntryWords(category),
    preset,
    searchLabel: `Search ${category.name}`,
    filter:
      group === null
        ? null
        : {
            label: `Filter by ${group.name}`,
            value: view.only,
            options: [...groups, '—'],
            none: `Any ${lower(group.name)}`,
            names: (o) => (o === '—' ? 'Not set' : o),
          },
    order: { byName: 'By name', recent: 'Recently changed' },
    empty:
      all.length === 0
        ? `No ${lower(category.name)} yet. Nothing is made for you: add the first one above.`
        : listed.length === 0
          ? 'Nothing matches.'
          : null,
    rows: listed.map((e) => {
      const line = [
        ...(dartTrim(e.summary).length > 0 ? [dartTrim(e.summary)] : []),
        ...summary.filter((d) => data.shown(e, category, d).length > 0).map((d) => `${d.name}: ${data.shown(e, category, d)}`),
      ].join(' · ');
      return {
        entry: e,
        title: entryTitle(e),
        line: line.length === 0 ? null : line,
        chip: groupOf(e).length === 0 ? null : groupOf(e),
        selected: e.id === selected?.id,
        path: modulePath(at.moduleId, { tool: str(tool['id']), record: e.id }),
      };
    }),
    record: selected === null ? null : registryRecord(at, category, selected),
  };
}

/** A record open in a registry: its name, description, the category's fields and notes, each saved as typed. */
export type RegistryRecord = {
  entry: Entry;
  back: { label: string; path: string };
  codex: string;
  nameLabel: string;
  descriptionLabel: string;
  descriptionHint: string;
  fields: { def: FieldDef; value: string; shown: string; key: string; entries: Entry[]; write: (v: string) => (c: CodexChanges) => void }[];
  notesLabel: string;
  note: string;
  /** Saved as typed, under these autosave keys: a name of only spaces is not saved. */
  saveName: (v: string) => ((c: CodexChanges) => void) | null;
  saveSummary: (v: string) => (c: CodexChanges) => void;
  saveNotes: (v: string) => (c: CodexChanges) => void;
  keys: { name: string; summary: string; notes: string };
};

/** The registry's open record. */
export function registryRecord(at: ToolAt, category: Category, entry: Entry): RegistryRecord {
  const view = viewFields(entry, category);
  return {
    entry,
    back: { label: category.name, path: modulePath(at.moduleId, { tool: str(at.tool['id']) }) },
    codex: 'Open in World',
    nameLabel: `${category.singular} name`,
    descriptionLabel: 'Description',
    descriptionHint: 'In a line or two',
    fields: view.category.map(([def, field]) => ({
      def,
      value: field?.value ?? '',
      shown: at.data.shown(entry, category, def),
      key: `${entry.id}/${def.id}`,
      entries: at.data.entries.filter((e) => e.id !== entry.id),
      write: (v: string) => (c: CodexChanges) => c.setFieldValue(entry.id, def.id, v),
    })),
    notesLabel: 'Private notes',
    note:
      `This is a record in World under ${category.name}. Its links, canon facts and where the manuscript ` +
      'mentions it are on its World page; fields are added, renamed or removed under “Categories & fields” there.',
    saveName: (v) => (dartTrim(v).length === 0 ? null : (c) => void c.updateEntry(entry.id, { name: v })),
    saveSummary: (v) => (c) => void c.updateEntry(entry.id, { summary: v }),
    saveNotes: (v) => (c) => void c.updateEntry(entry.id, { notes: v }),
    keys: { name: `${entry.id}/name`, summary: `${entry.id}/summary`, notes: `${entry.id}/notes` },
  };
}

// ---------------------------------------------------------------------------------------------------- board

export function boardTool(at: ToolAt):
  | { missing: string }
  | {
      category: Category;
      group: FieldDef;
      newEntry: { label: string; hint: string; add: string };
      columns: { title: string; value: string; label: string; cards: { entry: Entry; lines: string[] }[] }[];
    } {
  const { data, tool } = at;
  const name = str(tool['category']);
  const category = data.category(name);
  const group = data.field(category, str(tool['groupBy']), name);
  if (category === null || group === null) return { missing: missingText(`“${name}” with a “${str(tool['groupBy'])}” field`) };
  const entries = data.entriesOf(category);
  const values = entries.map((e) => data.raw(e, category, group));
  // A choice field's options in their own order; anything else, the values there are, smallest first.
  const columns =
    group.type === 'select'
      ? [...group.options, ...new Set(values.filter((v) => v.length > 0 && !group.options.includes(v)))]
      : dartSort([...new Set(values.filter((v) => v.length > 0))], (a, b) => {
          const x = dartNum(a);
          const y = dartNum(b);
          const byNumber = x !== null && y !== null ? (x.value < y.value ? -1 : x.value > y.value ? 1 : 0) : 0;
          return byNumber !== 0 ? byNumber : localeCompare(a, b);
        });
  const shown: FieldDef[] = [];
  for (const n of strings(tool['show'])) {
    const d = data.field(category, n, name);
    if (d !== null) shown.push(d);
  }
  const column = (title: string, value: string) => {
    const cards = entries.filter((e) => data.raw(e, category, group) === value);
    return {
      title,
      value,
      label: `${title}  ${cards.length}`,
      cards: cards.map((e) => ({
        entry: e,
        lines: shown.filter((d) => data.shown(e, category, d).length > 0).map((d) => `${d.name}: ${data.shown(e, category, d)}`),
      })),
    };
  };
  const out = columns.map((v) => column(group.type === 'number' ? `${group.name} ${v}` : v, v));
  if (entries.some((e) => data.raw(e, category, group).length === 0) || columns.length === 0) {
    out.push(column(`No ${lower(group.name)} yet`, ''));
  }
  return { category, group, newEntry: newEntryWords(category), columns: out };
}

// ---------------------------------------------------------------------------------------------------- table

export function tableTool(at: ToolAt):
  | { missing: string }
  | { category: Category; defs: FieldDef[]; newEntry: { label: string; hint: string; add: string }; empty: string | null; header: string[]; rows: Entry[] } {
  const { data } = at;
  const name = str(at.tool['category']);
  const category = data.category(name);
  const defs: FieldDef[] = [];
  for (const n of strings(at.tool['fields'])) {
    const d = data.field(category, n, name);
    if (d !== null) defs.push(d);
  }
  if (category === null || defs.length === 0) return { missing: missingText(`“${name}” and its fields`) };
  const entries = data.entriesOf(category);
  return {
    category,
    defs,
    newEntry: newEntryWords(category),
    empty: entries.length === 0 ? `Nothing in ${category.name} yet.` : null,
    header: [category.singular, ...defs.map((d) => d.name)],
    rows: entries,
  };
}

// --------------------------------------------------------------------------------------------------- matrix

export function matrixTool(at: ToolAt):
  | { missing: string }
  | {
      rows: Category;
      columns: Category;
      newEntries: { category: Category; words: { label: string; hint: string; add: string } }[];
      empty: string | null;
      rowEntries: Entry[];
      columnEntries: Entry[];
      values: string[];
      cell: (row: Entry, column: Entry) => { value: string; label: string; shown: string; semanticsLabel: string };
      set: (row: Entry, column: Entry, value: string) => (m: ModuleChanges) => void;
    } {
  const { data, tool } = at;
  const rows = data.category(str(tool['rows']));
  const columns = data.category(str(tool['columns']));
  if (rows === null || columns === null) return { missing: missingText(`“${str(tool['rows'])}” and “${str(tool['columns'])}”`) };
  const rowEntries = data.entriesOf(rows);
  const columnEntries = data.entriesOf(columns);
  const toolId = str(tool['id']);
  const cells = new Map<string, string>();
  for (const r of data.records) {
    if (r['kind'] === 'cell' && r['moduleId'] === at.moduleId && r['toolId'] === toolId) cells.set(`${r['rowId']}|${r['colId']}`, str(r['state']));
  }
  return {
    rows,
    columns,
    newEntries: [
      { category: rows, words: newEntryWords(rows) },
      ...(columns.key !== rows.key ? [{ category: columns, words: newEntryWords(columns) }] : []),
    ],
    empty:
      rowEntries.length === 0 || columnEntries.length === 0
        ? `Add at least one ${lower(rows.singular)} and one ${lower(columns.singular)} to fill in the matrix.`
        : null,
    rowEntries,
    columnEntries,
    values: strings(tool['values']),
    cell: (r, c) => {
      const value = cells.get(`${r.id}|${c.id}`) ?? '';
      const label = `${r.name} and ${c.name}`;
      return { value, label, shown: value.length === 0 ? '—' : value, semanticsLabel: `${label}: ${value}` };
    },
    set: (r, c, value) => (m) => m.setCell(at.moduleId, toolId, r.id, c.id, value),
  };
}

// --------------------------------------------------------------------------------------------------- meters

export function metersTool(at: ToolAt):
  | { missing: string }
  | {
      category: Category;
      newEntry: { label: string; hint: string; add: string };
      empty: string | null;
      max: number;
      maxLabel: string;
      cards: { entry: Entry; meters: { def: FieldDef; name: string; share: number; label: string; value: string }[] }[];
    } {
  const { data } = at;
  const name = str(at.tool['category']);
  const category = data.category(name);
  const fields = strings(at.tool['fields']);
  const defs: FieldDef[] = [];
  for (const n of fields) {
    const d = data.field(category, n, name);
    if (d !== null) defs.push(d);
  }
  if (category === null || defs.length === 0) return { missing: missingText(`“${name}” with ${fields.join(', ')}`) };
  const max = numOrNull(at.tool['max']) ?? 10;
  const entries = data.entriesOf(category);
  return {
    category,
    newEntry: newEntryWords(category),
    empty: entries.length === 0 ? `Nothing in ${category.name} yet.` : null,
    max,
    maxLabel: `/ ${Number.isInteger(max) ? Math.round(max) : max}`,
    cards: entries.map((e) => ({
      entry: e,
      meters: defs.map((d) => {
        const value = dartNum(dartTrim(data.raw(e, category, d)));
        const share = value === null || max <= 0 ? 0 : Math.min(1, Math.max(0, value.value / max));
        return {
          def: d,
          name: d.name,
          share,
          label: `${d.name} meter for ${e.name}`,
          value: value === null ? 'not set' : `${dartNumString(value)} of ${max}`,
        };
      }),
    })),
  };
}

// ------------------------------------------------------------------------------------------------------- log

/** The arc chart's series colours, in turn. */
export const arcColours: readonly string[] = ['#B4532A', '#3D5FA8', '#3F7D4E', '#8A63A8', '#C08A1A'];

/** Values over the course of the story, one line per thing they are about: null with the note when fewer than two
 * points have a chapter and a value. */
export function arcChart(
  records: readonly JsonMap[],
  data: ToolData,
  range: { min: number; max: number; label: string },
):
  | { note: string }
  | {
      lines: { position: number; value: number }[][];
      names: string[];
      last: number;
      semanticsLabel: string;
      caption: string;
      legend: { name: string; colour: string }[] | null;
    } {
  const points = records.filter(
    (r) => typeof r['value'] === 'number' && r['nodeId'] !== null && r['nodeId'] !== undefined && data.position(strOrNull(r['nodeId'])) < 2 ** 52,
  );
  if (points.length < 2) return { note: 'Give at least two points a chapter and a value to see the line.' };
  const first = (r: JsonMap) => strings(r['entryIds'])[0] ?? '';
  const series = [...new Set(points.map(first))];
  const names = series.map((id) => data.model.entries.get(id)?.name ?? 'Everything else');
  const lines = series.map((id) =>
    dartSort(
      points.filter((r) => first(r) === id).map((r) => ({ position: data.position(strOrNull(r['nodeId'])), value: r['value'] as number })),
      (a, b) => a.position - b.position,
    ),
  );
  return {
    lines,
    names,
    last: Math.max(1, data.documents.length - 1),
    semanticsLabel: `${range.label} through the story`,
    caption:
      `${range.label} from ${range.min} to ${range.max}, left to right through the chapters` +
      (series.some((s) => s.length > 0) ? `: ${names.join(', ')}` : ''),
    legend: series.length > 1 ? names.map((name, i) => ({ name, colour: arcColours[i % arcColours.length] })) : null,
  };
}

/** Where a point of the arc chart is drawn in a box `width` × `height` (padding 16; values clamped to the range). */
export function arcPoint(
  p: { position: number; value: number },
  box: { width: number; height: number; last: number; min: number; max: number },
): { x: number; y: number } {
  const pad = 16;
  const span = box.max - box.min === 0 ? 1 : box.max - box.min;
  const v = Math.min(box.max, Math.max(box.min, p.value));
  return {
    x: pad + (p.position / box.last) * (box.width - pad * 2),
    y: box.height - pad - ((v - box.min) / span) * (box.height - pad * 2),
  };
}

/** A log line as the screen shows and edits it. */
export type LogLine = {
  record: JsonMap;
  id: string;
  title: string;
  /** Read-only: "<title> · <state>", the chapter's title, the note. */
  read: { heading: string; chapter: string | null; note: string | null };
  done: { value: boolean; label: string } | null;
  titleLabel: string;
  state: { label: string; value: string; options: string[] } | null;
  value: { label: string; text: string } | null;
  removeLabel: string;
  chapter: { label: string; none: string; value: string | null };
  second: { label: string; none: string; value: string | null } | null;
  about: { label: string; none: string; value: string; options: string[] } | null;
  event: { label: string; none: string; value: string; options: string[] } | null;
  notes: { label: string; hint: string; value: string };
  links: { kind: 'chapter' | 'event' | 'entry'; label: string; id: string; path: string | null }[];
};

export function logTool(at: ToolAt): {
  states: string[];
  chart: ReturnType<typeof arcChart> | null;
  range: { min: number; max: number; label: string } | null;
  add: { label: string; hint: string; chapter: string; none: string; add: string } | null;
  suggestions: string[];
  chapters: { ids: string[]; name: (id: string) => string };
  candidates: Entry[];
  placed: Placed[];
  empty: string | null;
  lines: LogLine[];
} {
  const { data, tool } = at;
  const toolId = str(tool['id']);
  const states = strings(tool['states']);
  const value = mapOrNull(tool['value']);
  const second = strOrNull(tool['second']);
  const about = strOrNull(tool['about']);
  const candidates = about === null ? data.entries : data.entriesOf(data.category(about));
  const placed = resolveChronology(data.model.events.values(), data.model.calendar);
  const records = data.records.filter((r) => r['kind'] === 'log' && r['moduleId'] === at.moduleId && r['toolId'] === toolId);
  // Stable: by chapter, then the order they were added.
  dartSort(records, (a, b) => {
    const pa = data.position(strOrNull(a['nodeId']));
    const pb = data.position(strOrNull(b['nodeId']));
    const byPlace = pa < pb ? -1 : pa > pb ? 1 : 0;
    const ca = numOrNull(a['createdAt']) ?? 0;
    const cb = numOrNull(b['createdAt']) ?? 0;
    return byPlace !== 0 ? byPlace : ca < cb ? -1 : ca > cb ? 1 : 0;
  });
  const chapterIds = data.documents.map((d) => d.node.id);
  const chapterName = (id: string) => {
    const d = data.documents.find((x) => x.node.id === id);
    return d === undefined ? id : `${'   '.repeat(d.depth)}${d.node.title.length === 0 ? 'Untitled' : d.node.title}`;
  };
  const range = value === null ? null : { min: numOrNull(value['min']) ?? 0, max: numOrNull(value['max']) ?? 10, label: str(value['label'], 'Value') };
  const valid = (id: string | null) => (id !== null && chapterIds.includes(id) ? id : null);
  return {
    states,
    chart: range === null ? null : arcChart(records, data, range),
    range,
    add: at.writes
      ? { label: `New entry in ${str(tool['title'])}`, hint: 'What happens?', chapter: 'Chapter for the new entry', none: 'No chapter yet', add: 'Add' }
      : null,
    suggestions: at.writes ? strings(tool['suggestions']).filter((s) => !records.some((r) => r['title'] === s)) : [],
    chapters: { ids: chapterIds, name: chapterName },
    candidates,
    placed,
    empty: records.length === 0 ? 'Nothing logged yet.' : null,
    lines: records.map((r): LogLine => {
      const title = str(r['title']);
      const node = data.model.nodes.get(strOrNull(r['nodeId']) ?? '') ?? null;
      const event = placed.find((p) => p.event.id === r['eventId']) ?? null;
      const aboutEntries = strings(r['entryIds'])
        .map((id) => data.model.entries.get(id))
        .filter((e): e is Entry => e !== undefined);
      return {
        record: r,
        id: str(r['id']),
        title,
        read: {
          heading: [title, ...(str(r['state']).length > 0 ? [str(r['state'])] : [])].join(' · '),
          chapter: node === null ? null : node.title,
          note: str(r['note']).length > 0 ? str(r['note']) : null,
        },
        done: tool['checklist'] === true ? { value: r['done'] === true, label: `${title} done` } : null,
        titleLabel: `Title of ${title}`,
        state: states.length > 0 ? { label: `State of ${title}`, value: str(r['state']), options: states } : null,
        value: range === null ? null : { label: `${range.label} of ${title}`, text: typeof r['value'] === 'number' ? String(r['value']) : '' },
        removeLabel: `Remove ${title}`,
        chapter: { label: `Chapter of ${title}`, none: 'No chapter yet', value: valid(strOrNull(r['nodeId'])) },
        second: second === null ? null : { label: `${second}: ${title}`, none: `${second}: not yet`, value: valid(strOrNull(r['endNodeId'])) },
        about:
          candidates.length === 0
            ? null
            : { label: `${title} is about`, none: 'About…', value: strings(r['entryIds'])[0] ?? '', options: candidates.map((e) => e.id) },
        event:
          placed.length === 0
            ? null
            : {
                label: `Timeline event of ${title}`,
                none: 'Timeline event…',
                value: placed.some((p) => p.event.id === r['eventId']) ? str(r['eventId']) : '',
                options: placed.map((p) => p.event.id),
              },
        notes: { label: `Notes on ${title}`, hint: 'Notes: what led to it, what it changes', value: str(r['note']) },
        links: [
          ...(node === null ? [] : [{ kind: 'chapter' as const, label: `Open ${node.title.length === 0 ? 'Untitled' : node.title}`, id: node.id, path: null }]),
          ...(event === null ? [] : [{ kind: 'event' as const, label: 'On the timeline', id: event.event.id, path: `/plan/event/${event.event.id}` }]),
          ...aboutEntries.map((e) => ({ kind: 'entry' as const, label: e.name, id: e.id, path: null })),
        ],
      };
    }),
  };
}

/** A timeline event as the log's choice names it: "<name> (<when>)". */
export function eventName(placed: readonly Placed[], id: string): string {
  const p = placed.find((x) => x.event.id === id);
  if (p === undefined) return id;
  return p.label.length === 0 ? p.event.name : `${p.event.name} (${p.label})`;
}

/** The log's changes. */
export const logChanges = {
  /** A new line: its title, the chapter chosen, the first stage. Null for a title of only spaces. */
  add: (at: ToolAt, title: string, chapter: string | null): ((m: ModuleChanges) => void) | null => {
    if (dartTrim(title).length === 0) return null;
    const states = strings(at.tool['states']);
    return (m) => void m.addRecord(at.moduleId, str(at.tool['id']), { title, nodeId: chapter, state: states[0] ?? '' });
  },
  update: (recordId: string, changes: JsonMap) => (m: ModuleChanges) => m.updateRecord(recordId, changes),
  remove: (recordId: string) => (m: ModuleChanges) => m.removeRecord(recordId),
  /** A value typed: blank clears it; what is not a number clears it too (as num.tryParse). */
  value: (typed: string): JsonMap => ({ value: dartTrim(typed).length === 0 ? null : (dartNum(typed)?.value ?? null) }),
  about: (id: string): JsonMap => ({ entryIds: id.length === 0 ? [] : [id] }),
  event: (id: string): JsonMap => ({ eventId: id.length === 0 ? null : id }),
};

// ----------------------------------------------------------------------------------------------- calculator

/** The calculator's inputs as first shown: each by its key in lower case, its value as text. */
export function calculatorStart(tool: JsonMap): Map<string, string> {
  return new Map(maps(tool['inputs']).map((i) => [lower(str(i['key'])), String(numOrNull(i['value']) ?? 0)]));
}

/** Dart's `double.tryParse`, surrounding space allowed. */
const doubleTryParse = (text: string): number | null => {
  const t = dartTrim(text);
  if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return Number(t);
  if (/^[+-]?(NaN|Infinity)$/.test(t)) return Number(t.replace('+', ''));
  return null;
};

/** The calculator as typed: each input's label, and each output worked out ("12.5 m", a message when it cannot be). */
export function calculatorTool(
  tool: JsonMap,
  values: ReadonlyMap<string, string>,
): { inputs: { key: string; label: string; value: string }[]; resultsLabel: string; outputs: { label: string; value: string }[] } {
  const scope = {
    value: (name: string) => (values.has(lower(name)) ? (doubleTryParse(values.get(lower(name))!) ?? 0) : null),
    holds: () => null,
  };
  return {
    inputs: maps(tool['inputs']).map((i) => ({ key: lower(str(i['key'])), label: `${str(i['label'])} (${str(i['unit'])})`, value: values.get(lower(str(i['key']))) ?? '' })),
    resultsLabel: 'Results',
    outputs: maps(tool['outputs']).map((o) => {
      let value: string;
      try {
        const v = evaluateFormula(parseFormula(str(o['formula'])), scope);
        value = typeof v === 'number' ? `${formulaNumber(v)} ${str(o['unit'])}` : jsString(v);
      } catch (e) {
        value = e instanceof FormulaError ? e.message : 'Cannot be worked out';
      }
      return { label: str(o['label']), value };
    }),
  };
}

// ----------------------------------------------------------------------------------- ranks and inventory

const snapshotsOf = (data: ToolData): ProgressSnapshot[] => data.snapshot.rows('progressSnapshots').map((r) => new ProgressSnapshot(r));

const trackedOf = (data: ToolData, snapshots: readonly ProgressSnapshot[]): Entry[] =>
  dartSort(
    data.entries.filter((e) => snapshots.some((s) => s.entryId === e.id)),
    (a, b) => localeCompare(a.name, b.name),
  );

/** Said where a tool has nothing to show yet, with where to go. */
export type ToolEmpty = { text: string; action: string; path: string };

/** RANKS: each tracked character's level or realm, snapshot by snapshot ("Chapter 3: Cultivation Core Formation"). */
export function ranksTool(data: ToolData): { empty: ToolEmpty } | { people: { entry: Entry; lines: string[] }[] } {
  const snapshots = snapshotsOf(data);
  const tracked = trackedOf(data, snapshots);
  const nodes: StoryNode[] = [...data.model.nodes.values()];
  if (tracked.length === 0) {
    return {
      empty: {
        text: 'No progression snapshots yet. Log how a character changes on their profile, and their climb appears here.',
        action: 'Open the cast',
        path: '/organize',
      },
    };
  }
  return {
    people: tracked.map((e) => ({
      entry: e,
      lines: inStoryOrder(snapshots, nodes, e.id).map((s) => {
        const systems = s.systems;
        const parts: string[] = [];
        for (const b of data.model.systems.values()) {
          const snap = systems.get(b.id);
          if (snap === undefined) continue;
          for (const t of b.tracks) parts.push(`${t.name} ${trackLabel(t, snap.progress).replace(/ of \d+$/, '')}`);
        }
        const joined = parts.join(' · ');
        return `${placeOfSnapshot(s, nodes)}: ${joined.length === 0 ? (s.label.length === 0 ? 'No system' : s.label) : joined}`;
      }),
    })),
  };
}

/** INVENTORY: what a character carries at a point in the story. `who` and `atNode` are the screen's choices. */
export function inventoryTool(
  data: ToolData,
  who: string,
  atNode: string,
):
  | { empty: ToolEmpty }
  | {
      entry: Entry;
      who: { label: string; value: string; options: string[]; names: (id: string) => string };
      when: { label: string; value: string; options: string[]; none: string; names: (id: string) => string };
      note: string | null;
      gear: { entry: Entry | null; name: string; kind: string | null; note: string | null }[];
    } {
  const snapshots = snapshotsOf(data);
  const tracked = trackedOf(data, snapshots);
  const nodes: StoryNode[] = [...data.model.nodes.values()];
  if (tracked.length === 0) {
    return {
      empty: {
        text: 'No progression snapshots yet. Log a character’s gear on their profile, and it appears here.',
        action: 'Open the cast',
        path: '/organize',
      },
    };
  }
  const entry = tracked.find((e) => e.id === who) ?? tracked[0];
  const chapterIds = data.documents.map((d) => d.node.id);
  const state = stateAt(snapshots, nodes, entry.id, chapterIds.includes(atNode) ? atNode : null);
  return {
    entry,
    who: { label: 'Inventory of', value: entry.id, options: tracked.map((e) => e.id), names: (id) => data.model.entries.get(id)?.name ?? id },
    when: {
      label: 'Inventory as of',
      value: atNode,
      options: chapterIds,
      none: 'At the end of the story',
      names: (id) => `As of ${data.model.nodes.get(id)?.title ?? id}`,
    },
    note:
      state === null
        ? `Nothing logged for ${entry.name} by then.`
        : state.gear.length === 0
          ? `${entry.name} carries nothing at ${placeOfSnapshot(state, nodes)}.`
          : null,
    gear: (state?.gear ?? []).map((g) => ({
      entry: g.entryId === null ? null : (data.model.entries.get(g.entryId) ?? null),
      name: g.name,
      kind: g.kind.length > 0 ? g.kind : null,
      note: g.note.length > 0 ? g.note : null,
    })),
  };
}

// --------------------------------------------------------------------------------------------------- lineage

/** LINEAGE: a family tree, drawn from the family relationships kept in Relationships. */
export function lineageTool(data: ToolData):
  | { empty: ToolEmpty }
  | { generations: { heading: string; people: { entry: Entry; lines: string[] }[] }[]; note: string } {
  const people = new Map<string, Entry>();
  for (const e of data.entries) if (e.category === 'character') people.set(e.id, e);
  const rows = buildLineage([...data.model.relations.values()], data.model.order, (id) => people.has(id));
  const names = (ids: readonly string[]) =>
    ids
      .map((id) => people.get(id)?.name)
      .filter((n): n is string => n !== undefined)
      .join(', ');
  if (rows.length === 0) {
    return {
      empty: {
        text:
          'No family relationships yet. Record who is whose parent, sibling or spouse in Relationships and the tree ' +
          'is drawn from them.',
        action: 'Open Relationships',
        path: '/visualize',
      },
    };
  }
  return {
    generations: rows.map((row, i) => ({
      heading: `Generation ${i + 1}`,
      people: dartSort([...row], (a, b) => localeCompare(people.get(a.id)!.name, people.get(b.id)!.name)).map((kin) => ({
        entry: people.get(kin.id)!,
        lines: [
          ...(kin.parents.length > 0 ? [`Child of ${names(kin.parents)}`] : []),
          ...(kin.partners.length > 0 ? [`Married to ${names(kin.partners)}`] : []),
          ...(kin.siblings.length > 0 ? [`Sibling of ${names(kin.siblings)}`] : []),
          ...(kin.children.length > 0 ? [`Parent of ${names(kin.children)}`] : []),
          ...(kin.relatives.length > 0 ? [`Related to ${names(kin.relatives)}`] : []),
        ],
      })),
    })),
    note:
      'Read from the relationships as they stand at the end of the story. To change the tree, change a ' +
      'relationship in Relationships.',
  };
}

// ------------------------------------------------------------------------------------------------------ page

/** PAGE: a core page the module points at (the Flutter app's path for it; the screen maps those not built yet). */
export function pageTool(tool: JsonMap): { path: string; label: string } | { missing: string } {
  const path = corePagePath(str(tool['to']));
  return path === null ? { missing: 'That page is not in this version of the app.' } : { path, label: `Open ${str(tool['title'])}` };
}
