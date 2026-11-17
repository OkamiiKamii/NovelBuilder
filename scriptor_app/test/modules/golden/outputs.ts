// Scriptor's outputs for what dump.dart dumps of the Flutter app's genre modules, keyed and shaped the same way, made
// by the ported code (src/domain/modules/*, src/domain/systems/{formula,blueprints}.ts,
// src/domain/progression/snapshots.ts).

import { type JsonMap, mapOrNull, str } from '../../../src/domain/json';
import { Novel } from '../../../src/domain/records/novel';
import { strings } from '../../../src/domain/records/jsonRecord';
import { SysTrack } from '../../../src/domain/records/system';
import { type NovelSnapshot } from '../../../src/domain/snapshot/novelSnapshot';
import { SnapshotSystem, trackLabel } from '../../../src/domain/progression/snapshots';
import { instantiateBlueprint } from '../../../src/domain/systems/blueprints';
import { FormulaError, evaluateFormula, formatNumber, namesIn, parseFormula, unmet } from '../../../src/domain/systems/formula';
import { ModuleChanges, type ModuleStatus, moduleFile, readModuleFile } from '../../../src/domain/modules/moduleChanges';
import { FormatError, ModuleDefinition, arrangedTools, builtinModules, deriveTools, parseDefinition } from '../../../src/domain/modules/moduleDefs';
import { fittingModules, fittingModulesFromStored } from '../../../src/domain/modules/moduleMatch';
import { modulePath } from '../../../src/domain/modules/moduleService';
import { tryOnModule } from '../../../src/domain/modules/tryOn';
import { tryOnShelf, tryOnView } from '../../../src/domain/modules/screens/shelf';
import { configureView, dashboard, workspace } from '../../../src/domain/modules/screens/workspace';
import {
  type ToolAt,
  boardTool,
  calculatorStart,
  calculatorTool,
  cell,
  dartNum,
  dartNumString,
  eventName,
  inventoryTool,
  lineageTool,
  logTool,
  matrixTool,
  metersTool,
  pageTool,
  ranksTool,
  registryTool,
  tableTool,
} from '../../../src/domain/modules/screens/tools';
import { type ToolData } from '../../../src/domain/modules/moduleService';

// ------------------------------------------------------------------------------------------------- tools

function registryJson(at: ToolAt, view: { query?: string; only?: string; recent?: boolean; record?: string | null } = {}): JsonMap {
  const r = registryTool(at, { query: view.query ?? '', only: view.only ?? '', recent: view.recent ?? false, record: view.record ?? null });
  if ('missing' in r) return { missing: r.missing };
  return {
    category: r.category.name,
    newEntry: r.newEntry,
    preset: r.preset?.value ?? null,
    searchLabel: r.searchLabel,
    filter: r.filter === null ? null : { label: r.filter.label, options: r.filter.options, none: r.filter.none, names: r.filter.options.map(r.filter.names) },
    empty: r.empty,
    rows: r.rows.map((x) => [x.title, x.line, x.chip, x.selected, x.path]),
    record:
      r.record === null
        ? null
        : {
            name: r.record.entry.name,
            back: [r.record.back.label, r.record.back.path],
            nameLabel: r.record.nameLabel,
            fields: r.record.fields.map((f) => [f.def.name, f.value, f.shown]),
            note: r.record.note,
          },
    groups: r.filter === null ? [] : r.filter.options.slice(0, -1),
  };
}

function boardJson(at: ToolAt): JsonMap {
  const b = boardTool(at);
  if ('missing' in b) return { missing: b.missing };
  return {
    category: b.category.name,
    group: b.group.name,
    newEntry: b.newEntry,
    columns: b.columns.map((c) => [c.title, c.value, c.label, c.cards.map((x) => [x.entry.name, x.lines])]),
  };
}

function tableJson(at: ToolAt): JsonMap {
  const t = tableTool(at);
  if ('missing' in t) return { missing: t.missing };
  return {
    empty: t.empty,
    header: t.header,
    rows: t.rows.map((e) => [
      e.name,
      ...t.defs.map((d) => {
        const c = cell(at.data, e, t.category, d);
        return [c.label, c.value, c.shown];
      }),
    ]),
  };
}

function matrixJson(at: ToolAt): JsonMap {
  const m = matrixTool(at);
  if ('missing' in m) return { missing: m.missing };
  return {
    newEntries: m.newEntries.map((n) => n.words),
    empty: m.empty,
    rows: m.rowEntries.map((e) => e.name),
    columns: m.columnEntries.map((e) => e.name),
    values: m.values,
    cells: m.rowEntries.flatMap((r) =>
      m.columnEntries.map((c) => {
        const x = m.cell(r, c);
        return [x.value, x.label, x.shown, x.semanticsLabel];
      }),
    ),
  };
}

function metersJson(at: ToolAt): JsonMap {
  const m = metersTool(at);
  if ('missing' in m) return { missing: m.missing };
  return {
    empty: m.empty,
    maxLabel: m.maxLabel,
    cards: m.cards.map((c) => [c.entry.name, c.meters.map((x) => [x.name, x.share, x.label, x.value])]),
  };
}

function logJson(at: ToolAt): JsonMap {
  const l = logTool(at);
  const chart = l.chart;
  return {
    states: l.states,
    chart:
      chart === null
        ? null
        : 'note' in chart
          ? { note: chart.note }
          : {
              lines: chart.lines.map((line) => line.map((p) => [p.position, p.value])),
              names: chart.names,
              last: chart.last,
              semanticsLabel: chart.semanticsLabel,
              caption: chart.caption,
              legend: chart.legend === null ? null : chart.legend.map((x) => [x.name, x.colour]),
            },
    add: l.add === null ? null : [l.add.label, l.add.hint, l.add.chapter, l.add.none],
    suggestions: l.suggestions,
    chapters: l.chapters.ids.map(l.chapters.name),
    candidates: l.candidates.map((e) => e.name),
    placed: l.placed.map((p) => eventName(l.placed, p.event.id)),
    empty: l.empty,
    lines: l.lines.map((x) => ({
      heading: x.read.heading,
      chapterTitle: x.read.chapter,
      note: x.read.note,
      done: x.done === null ? null : [x.done.value, x.done.label],
      state: x.state === null ? null : [x.state.label, x.state.value],
      value: x.value === null ? null : [x.value.label, typeof x.record['value'] === 'number' ? x.record['value'] : null],
      chapter: [x.chapter.label, x.chapter.value],
      second: x.second === null ? null : [x.second.label, x.second.none, x.second.value],
      about: x.about === null ? null : [x.about.label, x.about.value],
      event: x.event === null ? null : [x.event.label, x.event.value],
      links: x.links.map((k) => (k.kind === 'event' ? `${k.label} ${k.path}` : k.label)),
    })),
  };
}

function calculatorJson(tool: JsonMap): JsonMap {
  const c = calculatorTool(tool, calculatorStart(tool));
  return { inputs: c.inputs.map((i) => i.label), outputs: c.outputs.map((o) => [o.label, o.value]) };
}

const emptyJson = (e: { text: string; action: string; path: string }) => ({ empty: [e.text, e.action, e.path] });

function ranksJson(data: ToolData): JsonMap {
  const r = ranksTool(data);
  if ('empty' in r) return emptyJson(r.empty);
  return { people: r.people.map((p) => [p.entry.name, p.lines]) };
}

function inventoryJson(data: ToolData, who: string, atNode: string): JsonMap {
  const i = inventoryTool(data, who, atNode);
  if ('empty' in i) return emptyJson(i.empty);
  return {
    entry: i.entry.name,
    who: i.who.options.map(i.who.names),
    when: i.when.options.map(i.when.names),
    note: i.note,
    gear: i.gear.map((g) => [g.entry?.name ?? null, g.name, g.kind, g.note]),
  };
}

function lineageJson(data: ToolData): JsonMap {
  const l = lineageTool(data);
  if ('empty' in l) return emptyJson(l.empty);
  return { generations: l.generations.map((g) => [g.heading, g.people.map((p) => [p.entry.name, p.lines])]) };
}

function toolJson(moduleId: string, tool: JsonMap, data: ToolData): unknown {
  const at: ToolAt = { moduleId, tool, data, writes: true };
  switch (tool['type']) {
    case 'registry': {
      const plain = registryJson(at);
      const groups = (plain['groups'] as string[] | undefined) ?? [];
      const rows = (plain['rows'] as unknown[] | undefined) ?? [];
      const all = data.entriesOf(data.category(str(tool['category'])));
      return {
        plain,
        recent: registryJson(at, { recent: true }),
        query: registryJson(at, { query: 'a' }),
        notSet: registryJson(at, { only: '—' }),
        first: {
          only: groups.length === 0 ? null : registryJson(at, { only: groups[0] }),
          record: rows.length === 0 ? null : registryJson(at, { record: all[0].id })['record'],
        },
      };
    }
    case 'board':
      return boardJson(at);
    case 'table':
      return tableJson(at);
    case 'matrix':
      return matrixJson(at);
    case 'meters':
      return metersJson(at);
    case 'log':
      return logJson(at);
    case 'calculator':
      return calculatorJson(tool);
    case 'ranks':
      return ranksJson(data);
    case 'inventory': {
      const chapterIds = data.documents.map((d) => d.node.id);
      const plain = inventoryJson(data, '', '');
      const people = 'who' in plain ? (plain['who'] as string[]) : [];
      const last = people.length === 0 || chapterIds.length === 0 ? null : inventoryJson(data, whoLast(data), chapterIds[0]);
      return { plain, last };
    }
    case 'lineage':
      return lineageJson(data);
    case 'page': {
      const p = pageTool(tool);
      return 'missing' in p ? { missing: p.missing } : [p.path, p.label];
    }
    default:
      return 'unknown';
  }
}

/** The last of the tracked characters (in the tool's own order). */
function whoLast(data: ToolData): string {
  const i = inventoryTool(data, '', '');
  if ('empty' in i) return '';
  return i.who.options[i.who.options.length - 1];
}

// ----------------------------------------------------------------------------------------------- workspace

function configureJson(snapshot: NovelSnapshot, moduleId: string): JsonMap {
  const c = configureView(snapshot, moduleId)!;
  return {
    title: c.title,
    nav: c.nav,
    tools: c.tools.map((t) => [t.id, t.shown, t.name, t.up.enabled, t.down.enabled, t.stages?.value ?? null]),
    categories: c.categories.map((k) => k.name),
  };
}

function workspaceJson(snapshot: NovelSnapshot, moduleId: string, writes: boolean): JsonMap | null {
  const w = workspace(str(snapshot.project['id']), snapshot, moduleId, null, writes);
  if (w.kind === 'missing') return null;
  if (w.kind === 'off') return { off: w.module.name };
  const d = dashboard(w.module, w.tools, w.data, (e) => `entry:${e.id}`);
  return {
    title: w.title,
    starter: w.starter !== null,
    chips: [w.chips[0].path, ...w.chips.slice(1).map((c) => [c.id, c.label, c.path])],
    dashboard: {
      tiles: d.tiles.map((t) => [t.label, t.count, t.name, t.path]),
      nothing: d.nothing !== null,
      recent: d.recent.map((r) => [r.title, r.subtitle, r.path]),
      empty: d.empty === null ? null : [d.empty.heading, d.empty.rows.map((r) => [r.title, r.subtitle, r.path])],
    },
    views: Object.fromEntries(w.tools.map((t) => [str(t['id']), toolJson(w.module.id, t, w.data)])),
    configure: configureJson(snapshot, moduleId),
  };
}

// --------------------------------------------------------------------------------------------- try it on

function tryOnJson(snapshot: NovelSnapshot, m: ModuleDefinition, title: string, width: number): JsonMap {
  const t = tryOnModule(snapshot, m);
  const v = tryOnView(t, m, title, width);
  return {
    before: t.before.map((c) => c.name),
    added: t.added.map((c) => c.name),
    gains: t.gains.map((g) => [g.kind.name, g.fields, g.entries]),
    tools: t.tools.map((x) => [x.type, x.title]),
    offersSystem: t.offersSystem,
    changesNothing: t.changesNothing,
    shelf: tryOnShelf(t).map((s) => [s.kind.name, s.fresh, s.more]),
    heading: v.heading,
    shelfLabel: v.shelfLabel,
    kinds: v.kinds,
    gainLines: v.gains,
    toolsHeading: v.toolsHeading,
    shownTools: v.tools.map((x) => x.title),
    moreTools: v.moreTools,
    system: v.system,
  };
}

// ------------------------------------------------------------------------------------------------ the novel

function statusJson(s: ModuleStatus): JsonMap {
  const labels: Record<string, string> = { available: 'Available', enabled: 'Enabled', disabled: 'Disabled', attention: 'Needs attention' };
  return {
    id: s.module.id,
    state: s.state,
    label: labels[s.state],
    reasons: s.reasons,
    installed: s.installed,
    updatable: s.updatable,
    entries: s.entries,
    records: s.records,
    shares: s.shares.map((x) => [x.moduleId, x.name, x.enabled, x.categories]),
  };
}

const cats = (m: ModuleChanges) =>
  m.categories().map((c) => [c.key, c.name, c.singular, c.color, c.archived, c.fields.map((f) => [f.id, f.name, f.raw['type'], f.options, f.archived])]);

const rowJson = (row: JsonMap): JsonMap => Object.fromEntries(Object.entries(row).filter(([k]) => k !== 'definition'));

export function novel(s: NovelSnapshot): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const title = str(s.project['title']);
  const read = new ModuleChanges(s, {
    now: 0,
    createId: () => {
      throw new Error('reading');
    },
  });
  out['status'] = read.status(builtinModules).map(statusJson);
  out['enabled'] = read.enabled().map((d) => d.id);
  for (const m of builtinModules) {
    out[`tryOn:${m.id}`] = tryOnJson(s, m, title, 390);
    out[`tryOnWide:${m.id}`] = tryOnJson(s, m, title, 1000)['shownTools'];
  }
  for (const r of read.installed()) out[`here:${r['moduleId']}`] = workspaceJson(s, str(r['moduleId']), true);
  for (const m of builtinModules) {
    let n = 0;
    const nid = () => `n${++n}`;
    const on = new ModuleChanges(s, { now: 1000, createId: nid });
    const row = on.enable(m);
    const off = new ModuleChanges(on.snapshot, { now: 2000, createId: nid });
    off.disable(m.id);
    const again = new ModuleChanges(off.snapshot, { now: 3000, createId: nid });
    again.enable(m);
    let starter: unknown = null;
    if (m.system !== null) {
      const st = new ModuleChanges(on.snapshot, { now: 1500, createId: nid });
      const id = st.addStarterSystem(m.id);
      const twice = st.addStarterSystem(m.id);
      starter = { system: st.row('systems', id), twice: twice === id, row: rowJson(st.rowFor(m.id)!) };
    }
    const conf = new ModuleChanges(on.snapshot, { now: 4000, createId: nid });
    const ids = m.tools.map((t) => str(t['id']));
    const log = m.tools.find((t) => t['type'] === 'log' && strings(t['states']).length > 0) ?? null;
    conf.configure(m.id, () => ({
      hidden: [...(ids.length > 0 ? [ids[0]] : []), 'nonsense'],
      order: [...ids].reverse(),
      titles: { ...(ids.length > 1 ? { [ids[1]]: '  Renamed tool  ' } : {}), nonsense: 'x' },
      states: log === null ? {} : { [str(log['id'])]: ['Second', 'First', 'Second', ' '] },
      nav: 'My workspace',
    }));
    const confRow = conf.rowFor(m.id)!;
    out[`on:${m.id}`] = {
      row: rowJson(row),
      categories: cats(on),
      off: { categories: cats(off), row: rowJson(off.rowFor(m.id)!) },
      again: { categories: cats(again), row: rowJson(again.rowFor(m.id)!) },
      status: again
        .status(builtinModules)
        .filter((x) => x.module.id === m.id)
        .map(statusJson),
      enabled: again.enabled().map((d) => d.id),
      starter,
      configured: {
        settings: confRow['settings'],
        arranged: arrangedTools(new ModuleDefinition(mapOrNull(confRow['definition'])!), confRow['settings']).map((t) => [t['id'], t['title'], t['states'] ?? null]),
      },
      workspace: workspaceJson(on.snapshot, m.id, true),
      workspaceArranged: workspaceJson(conf.snapshot, m.id, true)?.['title'],
      workspaceOff: workspaceJson(off.snapshot, m.id, true),
    };
  }
  const novel = new Novel(s.project);
  out['fits'] = fittingModulesFromStored({
    genres: [novel.primaryGenre, ...novel.secondaryGenres],
    tags: novel.tags,
    synopsis: novel.synopsis,
    storedContents: s.rows('chapterContents').map((r) => JSON.stringify(r)),
  }).map((f) => [f.moduleId, f.words, f.score]);
  let b = 0;
  const bid = () => `b${++b}`;
  const maker = new ModuleChanges(s, { now: 5000, createId: bid });
  const keys = maker
    .categories()
    .filter((c) => !c.archived && c.fields.some((f) => !f.archived))
    .map((c) => c.key);
  const systems = s.rows('systems');
  try {
    const built = maker.buildFrom({
      name: `Made from ${title}`,
      genre: 'Its kind',
      description: 'What it is',
      categoryKeys: keys,
      systemId: systems.length === 0 ? null : str(systems[0]['id']),
    });
    const file: unknown = JSON.parse(JSON.stringify(moduleFile(built)));
    out['built'] = { raw: built.raw, read: readModuleFile(file, { newId: bid }).raw };
  } catch (e) {
    out['built'] = { error: e instanceof Error ? e.message : String(e) };
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------- misc

/** `fits` takes the random books the Dart made (Dart's Random cannot be drawn here), and matches them again. */
export function misc(dartFits: readonly { chapters: string[]; genres: string[]; tags: string[]; synopsis: string; on: string[] }[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let n = 0;
  const id = () => `m${++n}`;
  out['builtin'] = builtinModules.map((m) => parseDefinition(m.raw, { newId: id }).raw);
  out['starters'] = builtinModules.filter((m) => m.system !== null).map((m) => instantiateBlueprint(m.system!, id));
  const odd: unknown[] = [
    null,
    { name: '  ' },
    {
      name: `Odd ${'x'.repeat(90)}`,
      nav: 'N'.repeat(50),
      icon: '🐉✦★',
      version: 2.5,
      features: [...Array.from({ length: 14 }, (_, i) => `f${i}`), 3, ''],
      schema: {
        categories: [
          { name: 'Gadgets', color: '#ABCDEF', fields: [{ name: 'Power', type: 'number' }, { name: '' }, { name: 'Kind', type: 'weird' }] },
          { builtin: true, key: 'item', fields: [{ name: 'Charge', type: 'select', options: ['Low', ' ', 'High'] }] },
          { name: '', builtin: false },
          { name: 'Bad colour', color: 'red' },
        ],
      },
      tools: [
        { type: 'registry' },
        { type: 'registry', category: 'Gadgets', groupBy: 'Kind', summary: ['Power', ''] },
        { type: 'board', category: 'Gadgets' },
        { type: 'meters', category: 'Gadgets', fields: ['Power'], max: 0 },
        { type: 'log', value: { min: 2 }, checklist: true, states: ['A', 'B'] },
        { type: 'calculator', inputs: [{ key: 'a', value: 3 }], outputs: [{ formula: 'a * 2' }] },
        { type: 'calculator', inputs: [], outputs: [{ formula: '1' }] },
        { type: 'page', to: 'nowhere' },
        { type: 'page', to: 'graph', title: 'Graph' },
        { type: 'ranks', id: 'r', hint: ' A hint ' },
        { type: 'mystery' },
        'not a tool',
      ],
      system: {
        name: 'Rules',
        variables: [{ name: 'Strength', base: 10.0 }, { name: 'Strength' }, { kind: 'odd', options: [' a ', ''] }],
        tracks: [
          { name: 'Level', cap: 99.6, points: -2, sources: ['x', ' x ', ''] },
          { name: 'Realm', kind: 'stages', stages: [{ name: 'One', grants: ['i1', 'gone'] }, { name: '' }] },
        ],
        groups: [{ id: 'g1', name: 'Skills' }],
        items: [
          { id: 'i1', groupId: 'g1', name: 'Bolt', parentId: 'i1', modifiers: [{ op: 'pow' }], costs: [{}] },
          { groupId: 'gone' },
        ],
        ranks: ['Bronze', { name: 'Silver' }],
        matrices: [{ name: 'Table', cells: { a: ' ', b: 'yes' } }],
      },
    },
  ];
  out['odd'] = odd.map((raw) => {
    try {
      return parseDefinition(raw, { newId: id }).raw;
    } catch (e) {
      if (e instanceof FormatError) return `error: ${e.message}`;
      throw e;
    }
  });
  out['derived'] = deriveTools(
    [
      {
        name: 'Space Ships!',
        fields: [
          { name: 'Class', type: 'select' },
          { name: 'Crew', type: 'number' },
          { name: 'Speed', type: 'number' },
          { name: 'Notes', type: 'longtext' },
          { name: 'Hull', type: 'number' },
          { name: 'Shields', type: 'number' },
          { name: 'Guns', type: 'number' },
        ],
      },
      { name: 'Empty', fields: [] },
      { name: 'Built', builtin: true, fields: [{ name: 'X' }] },
    ],
    true,
  );
  const values: Record<string, number | string> = { strength: 12, level: 12, agility: 23, class: 'Void Mage', realm: 2, zero: 0 };
  const scope = {
    value: (name: string) => values[name.toLowerCase()] ?? null,
    holds: (group: string, name: string) =>
      group.toLowerCase() === 'class' ? name.toLowerCase() === 'void mage' : group.toLowerCase() === 'title' ? false : null,
  };
  const formulas = [
    'strength * 1.5',
    'intelligence / 10',
    '100 * level ^ 1.5',
    'max(1, floor(agility / 5))',
    'Class: Void Mage AND level >= 50',
    'NOT (realm < 3) OR Title: Chosen',
    '2 × 3 ÷ 4 − 1',
    'level ≥ 12 and level ≤ 12 and level ≠ 3',
    'if(level > 10, "high", "low")',
    'if(level)',
    'clamp(agility, 1, 10) + round(2.5) + ceil(-1.5) + abs(-3) + sqrt(16) + min(3, 1, 2)',
    'class = "void mage"',
    'class + 1',
    'level / zero',
    'level % zero',
    '7 % 3 + -7 % 3',
    '[strength] + 1',
    "'quoted' = 'QUOTED '",
    '“curly”',
    'nope(1)',
    'floor(1, 2)',
    'min()',
    '(1 + 2',
    '1 +',
    '',
    '   ',
    '1 2',
    '#',
    'Class:',
    'yes and not no',
    '-level',
    '+3',
    '2 ^ 3 ^ 2',
    '!true || false && true',
    'a <> b',
    '10 == 10.0',
    '1e3',
    '.5 + 0.25',
    'Title: Chosen or level > 1',
    'Weapon: Sword',
  ];
  out['formulas'] = formulas.map((formula) => {
    try {
      const node = parseFormula(formula);
      let value: unknown;
      try {
        value = evaluateFormula(node, scope);
      } catch (e) {
        if (!(e instanceof FormulaError)) throw e;
        value = `error: ${e.message}`;
      }
      let notMet: string[] | null;
      try {
        notMet = unmet(node, scope);
      } catch (e) {
        if (!(e instanceof FormulaError)) throw e;
        notMet = null;
      }
      return [formula, value, notMet, namesIn(node)];
    } catch (e) {
      if (!(e instanceof FormulaError)) throw e;
      return [formula, `parse: ${e.message}`, null, null];
    }
  });
  out['formatted'] = [0, 1, 1.005, 2.675, -3.14159, 1e21, 12.5, 0.1 + 0.2, Infinity].map(formatNumber);
  out['fits'] = dartFits.map((x) => ({
    chapters: x.chapters,
    genres: x.genres,
    tags: x.tags,
    synopsis: x.synopsis,
    on: x.on,
    fits: fittingModules({ genres: x.genres, tags: x.tags, synopsis: x.synopsis, chapters: x.chapters, on: new Set(x.on), limit: 10 }).map((f) => [
      f.moduleId,
      f.words,
      f.score,
    ]),
  }));
  const tracks = [
    new SysTrack({ id: 't1', name: 'Level', kind: 'levels', cap: 100 }),
    new SysTrack({ id: 't2', name: 'Level', kind: 'levels', cap: 0 }),
    new SysTrack({ id: 't3', name: 'Realm', kind: 'stages', stages: [{ id: 's1', name: 'Qi' }, { id: 's2', name: 'Core' }] }),
    new SysTrack({ id: 't4', name: 'Empty', kind: 'stages', stages: [] }),
  ];
  out['tracks'] = [
    {},
    { t1: 12, t2: 7.5, t3: 's2', t4: 'x' },
    { t1: 250, t2: '  3e1 ', t3: 'gone' },
    { t1: 0, t2: 'abc', t3: 7 },
    { t1: 2.5, t2: -4 },
    { t1: '0x10', t2: '' },
  ].map((progress) => tracks.map((t) => trackLabel(t, new SnapshotSystem({ progress }).progress)));
  out['numbers'] = ['5', '5.0', ' 12 ', '1e3', '0x1f', '-0x1f', '.5', '5.', 'abc', '', 'NaN', 'Infinity', '-Infinity', '+3', '1_000', '00', '-0'].map(
    (t) => {
      const v = dartNum(t);
      return [t, v === null ? null : dartNumString(v)];
    },
  );
  out['paths'] = [
    modulePath('mystery'),
    modulePath('mystery', { tool: 'people' }),
    modulePath('custom-1 2', { tool: 'a b*c', record: "x'y(z)!~" }),
    modulePath('é/ü', { record: 'r&s=t' }),
  ];
  return out;
}
