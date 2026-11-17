// One module's WORKSPACE, its pure parts: the page as it stands (not installed, switched off, or on with its tools),
// the example-system offer, the tool chips, the DASHBOARD (how much there is of each kind of record, what was touched
// last, which records are still empty; every number counted from the novel as it is, each opening the list it counts)
// and CONFIGURE (what it is called, which tools show and in what order, what each is called, the stages a log steps
// through). A port of the logic and words of flutter_app/lib/features/modules/module_page.dart.
//
// The page: its title "<icon> <name in the menus>" over the module's description; **Configure** and **All modules**;
// the example-system card when it offers one not added; a wrap of chips (Dashboard, then each tool) 8 apart; then the
// tool chosen (its title, its hint, the tool) or the dashboard: tiles 170 wide (the count, headlineSmall; the name),
// then "Recently changed" (six rows), then "Still empty  N" (eight rows), each row the entry's name over its kind.

import { type JsonMap, mapOrNull, str } from '../../json';
import { type Category } from '../../records/category';
import { type Entry } from '../../records/entry';
import { strings } from '../../records/jsonRecord';
import { dartSort } from '../../manuscript/dartSort';
import { dartTrim } from '../../text/dartString';
import { ModuleChanges } from '../moduleChanges';
import { ModuleDefinition, arrangedTools, bindingsOf, resolveCategory, settingsOf } from '../moduleDefs';
import { ToolData, modulePath, modulesPath } from '../moduleService';
import { type NovelSnapshot } from '../../snapshot/novelSnapshot';

export const workspaceWords = {
  back: 'All modules',
  notInstalledTitle: 'Module not installed',
  notInstalled: 'This novel does not use that module.',
  off: 'This module is switched off, so its tools are hidden. Everything made with it is still stored.',
  turnOn: 'Turn it on',
  configure: 'Configure',
  dashboard: 'Dashboard',
  addSystem: 'Add the example system',
  nothing:
    'Nothing here yet. Turning the module on creates no records: your world is yours to make. Open any of its tools ' +
    'above to add the first one.',
  recent: 'Recently changed',
  emptyNote: 'Records with a name and nothing else written.',
} as const;

export const starterLine = (module: ModuleDefinition): string =>
  `This module comes with an example system, “${str(module.system!['name'])}”, to reshape or learn from. It is not ` +
  'added unless you ask: it contains sample classes and skills, and your story may want none of them.';

/** The workspace for `moduleId` in a novel: not installed, switched off, or on (its tools as arranged, the tool open,
 * what the tools read, and whether to offer its example system). */
export type Workspace =
  | { kind: 'missing'; title: string; text: string }
  | { kind: 'off'; module: ModuleDefinition; title: string; text: string }
  | {
      kind: 'on';
      module: ModuleDefinition;
      title: string;
      subtitle: string;
      label: string;
      tools: JsonMap[];
      tool: JsonMap | null;
      chips: { id: string | null; label: string; selected: boolean; path: string }[];
      data: ToolData;
      starter: string | null;
    };

export function workspace(
  novelId: string,
  snapshot: NovelSnapshot,
  moduleId: string,
  toolId: string | null,
  writes: boolean,
): Workspace {
  const read = new ModuleChanges(snapshot, {
    now: 0,
    createId: () => {
      throw new Error('reading');
    },
  });
  const row = read.rowFor(moduleId);
  if (row === null) return { kind: 'missing', title: workspaceWords.notInstalledTitle, text: workspaceWords.notInstalled };
  const module = new ModuleDefinition(mapOrNull(row['definition'])!);
  if (row['enabled'] !== true) return { kind: 'off', module, title: module.name, text: workspaceWords.off };
  const settings = settingsOf(row['settings']);
  const tools = arrangedTools(module, row['settings']);
  const tool = tools.find((t) => t['id'] === toolId) ?? null;
  const data = new ToolData(novelId, snapshot, bindingsOf(row['bindings']));
  const starter = module.system !== null && !snapshot.rows('systems').some((s) => s['id'] === row['systemId']) && writes;
  return {
    kind: 'on',
    module,
    title: `${module.icon.length === 0 ? '' : `${module.icon} `}${settings.nav ?? module.nav}`,
    subtitle: module.description,
    label: `${module.name} tools`,
    tools,
    tool,
    chips: [
      { id: null, label: workspaceWords.dashboard, selected: tool === null, path: modulePath(module.id) },
      ...tools.map((t) => ({
        id: str(t['id']),
        label: str(t['title']),
        selected: t['id'] === tool?.['id'],
        path: modulePath(module.id, { tool: str(t['id']) }),
      })),
    ],
    data,
    starter: starter ? starterLine(module) : null,
  };
}

export const workspaceBackPath = modulesPath;

const categoryOf = (tool: JsonMap): string | null =>
  ['registry', 'board', 'table', 'meters'].includes(tool['type'] as string) ? str(tool['category']) : null;

/** A row of the dashboard's lists: the entry, its kind, and where a press goes (into the registry, or its page). */
export type DashboardRow = { entry: Entry; title: string; subtitle: string; path: string; inRegistry: boolean };

/** A module's front page. Each tile's `path` opens the list it counts. */
export function dashboard(
  module: ModuleDefinition,
  tools: readonly JsonMap[],
  data: ToolData,
  entryPath: (entry: Entry) => string,
): {
  tiles: { label: string; count: number; name: string; path: string }[];
  nothing: string | null;
  recent: DashboardRow[];
  empty: { heading: string; note: string; rows: DashboardRow[] } | null;
} {
  // One tile per category the module works on: the first tool that lists it is where the tile leads.
  const lists: { tool: JsonMap; category: Category; entries: Entry[] }[] = [];
  for (const tool of tools) {
    const category = data.category(categoryOf(tool) ?? '');
    if (category !== null && !lists.some((l) => l.category.key === category.key)) {
      lists.push({ tool, category, entries: data.entriesOf(category) });
    }
  }
  const logs = tools
    .filter((t) => t['type'] === 'log' || t['type'] === 'matrix')
    .map((tool) => ({ tool, count: data.records.filter((r) => r['moduleId'] === module.id && r['toolId'] === tool['id']).length }));
  // "Its own" records: those in categories the module brings, not the built-in ones it only adds fields to.
  const own = new Set<string>();
  for (const c of module.categories) {
    if (c['builtin'] === true) continue;
    const key = data.category(str(c['name']))?.key;
    if (key !== undefined) own.add(key);
  }
  const mine = lists.filter((l) => own.has(l.category.key));
  const recentAll = mine.flatMap((l) => l.entries.map((e) => ({ entry: e, list: l })));
  dartSort(recentAll, (a, b) => b.entry.updatedAt - a.entry.updatedAt);
  const empty = mine.flatMap((l) =>
    l.entries
      .filter(
        (e) => dartTrim(e.summary).length === 0 && dartTrim(e.description).length === 0 && !e.fields.some((f) => dartTrim(f.value).length > 0),
      )
      .map((e) => ({ entry: e, list: l })),
  );
  const row = (r: { entry: Entry; list: (typeof lists)[number] }): DashboardRow => {
    const inRegistry = r.list.tool['type'] === 'registry';
    return {
      entry: r.entry,
      title: r.entry.name.length === 0 ? 'Untitled' : r.entry.name,
      subtitle: r.list.category.singular,
      path: inRegistry ? modulePath(module.id, { tool: str(r.list.tool['id']), record: r.entry.id }) : entryPath(r.entry),
      inRegistry,
    };
  };
  return {
    tiles: [
      ...lists.map((l) => ({
        label: `${l.entries.length} ${l.category.name}: open ${str(l.tool['title'])}`,
        count: l.entries.length,
        name: l.category.name,
        path: modulePath(module.id, { tool: str(l.tool['id']) }),
      })),
      ...logs
        .filter((l) => l.count > 0)
        .map((l) => ({
          label: `${l.count} in ${str(l.tool['title'])}: open it`,
          count: l.count,
          name: str(l.tool['title']),
          path: modulePath(module.id, { tool: str(l.tool['id']) }),
        })),
    ],
    nothing: lists.every((l) => l.entries.length === 0) && logs.every((l) => l.count === 0) ? workspaceWords.nothing : null,
    recent: recentAll.slice(0, 6).map(row),
    empty: empty.length === 0 ? null : { heading: `Still empty  ${empty.length}`, note: workspaceWords.emptyNote, rows: empty.slice(0, 8).map(row) },
  };
}

// ------------------------------------------------------------------------------------------------------- configure

/** How a module is arranged in this novel: its name in the menus, its tools in their order (each shown or not, its
 * name, and for a log with stages, its stages), and the categories it works on (each opening Categories & fields). */
export function configureView(
  snapshot: NovelSnapshot,
  moduleId: string,
): {
  title: string;
  navLabel: string;
  nav: string;
  toolsHeading: string;
  tools: {
    id: string;
    title: string;
    shown: boolean;
    showLabel: string;
    nameLabel: string;
    name: string;
    up: { label: string; enabled: boolean };
    down: { label: string; enabled: boolean };
    stages: { label: string; hint: string; value: string } | null;
  }[];
  categoriesHeading: string;
  categories: Category[];
  done: string;
} | null {
  const read = new ModuleChanges(snapshot, {
    now: 0,
    createId: () => {
      throw new Error('reading');
    },
  });
  const row = read.rowFor(moduleId);
  if (row === null) return null;
  const module = new ModuleDefinition(mapOrNull(row['definition'])!);
  const settings = mapOrNull(row['settings']) ?? {};
  const order = strings(settings['order']);
  const all = module.tools;
  const at = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length + all.findIndex((t) => t['id'] === id));
  const tools = dartSort([...all], (a, b) => at(str(a['id'])) - at(str(b['id'])));
  const hidden = strings(settings['hidden']);
  const titles = mapOrNull(settings['titles']) ?? {};
  const states = mapOrNull(settings['states']) ?? {};
  const bindings = bindingsOf(row['bindings']);
  const categories = read.categories();
  const used: Category[] = [];
  for (const c of module.categories) {
    const found =
      resolveCategory(c['builtin'] === true ? str(c['key']) : str(c['name']), categories, bindings) ??
      categories.find((x) => c['builtin'] === true && x.key === c['key']) ??
      null;
    if (found !== null) used.push(found);
  }
  return {
    title: `Configure ${module.name}`,
    navLabel: 'Name in the menus',
    nav: str(settings['nav'], module.nav),
    toolsHeading: 'Tools: show, name and order',
    tools: tools.map((t, i) => ({
      id: str(t['id']),
      title: str(t['title']),
      shown: !hidden.includes(t['id'] as string),
      showLabel: `Show ${str(t['title'])}`,
      nameLabel: `Name of ${str(t['title'])}`,
      name: str(titles[t['id'] as string], str(t['title'])),
      up: { label: `Move ${str(t['title'])} up`, enabled: i !== 0 },
      down: { label: `Move ${str(t['title'])} down`, enabled: i !== tools.length - 1 },
      stages:
        t['type'] === 'log' && strings(t['states']).length > 0
          ? {
              label: `Stages of ${str(t['title'])}`,
              hint: 'Stages, separated by commas',
              value: (strings(states[t['id'] as string]).length === 0 ? strings(t['states']) : strings(states[t['id'] as string])).join(', '),
            }
          : null,
    })),
    categoriesHeading: 'Categories & fields',
    categories: used,
    done: 'Done',
  };
}

/** The settings changes of Configure, each `(settings) => settings` for ModuleChanges.configure. */
export const configureChanges = {
  /** The name in the menus: the module's own clears it. */
  nav: (module: ModuleDefinition, v: string) => (s: JsonMap): JsonMap => ({ ...s, nav: dartTrim(v) === module.nav ? '' : v }),
  shown: (toolId: string, shown: boolean) => (s: JsonMap): JsonMap => ({
    ...s,
    hidden: shown ? strings(s['hidden']).filter((id) => id !== toolId) : [...strings(s['hidden']), toolId],
  }),
  /** A tool's name: its own clears it. */
  title: (tool: JsonMap, v: string) => (s: JsonMap): JsonMap => ({
    ...s,
    titles: { ...(mapOrNull(s['titles']) ?? {}), [str(tool['id'])]: dartTrim(v) === tool['title'] ? '' : v },
  }),
  /** Moves a tool up (-1) or down (1) in the order shown by configureView. */
  move: (orderedIds: readonly string[], toolId: string, by: number): ((s: JsonMap) => JsonMap) | null => {
    const ids = [...orderedIds];
    const from = ids.indexOf(toolId);
    const to = from + by;
    if (to < 0 || to >= ids.length) return null;
    ids[from] = ids[to];
    ids[to] = toolId;
    return (s) => ({ ...s, order: ids });
  },
  /** A log's stages, typed with commas: the log's own clears them. */
  stages: (tool: JsonMap, typed: string) => (s: JsonMap): JsonMap => {
    const list = typed
      .split(',')
      .map((x) => dartTrim(x))
      .filter((x) => x.length > 0);
    return {
      ...s,
      states: {
        ...(mapOrNull(s['states']) ?? {}),
        [str(tool['id'])]: list.join('|') === strings(tool['states']).join('|') ? [] : list,
      },
    };
  },
};

/** Where a category's fields are shaped (Categories & fields, opened on it). */
export const kindsPathFor = (key: string): string => `/organize/kinds?kind=${encodeURIComponent(key)}`;
