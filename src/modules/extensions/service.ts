import type { NovelDB } from '@/core/db';
import { createId } from '@/core/id';
import type { ProjectRegistry } from '@/core/projectRegistry';
import type { CodexService } from '@/modules/codex/service';
import { CATEGORY_LABELS, FIELD_TYPES, type Category, type FieldType, type TemplateData } from '@/modules/codex/types';
import { tidy, type SystemsService } from '@/modules/systems/service';
import { BUILTIN_MODULES } from './builtin';
import { CORE_PAGES, MODULE_FORMAT, type CorePage, type ModuleDefinition, type ModuleRecord, type ModuleSettings, type ModuleStatus, type ProjectModule, type RecordChanges, type SavedModule, type ToolDef } from './types';

/** Hooks installed modules and what was recorded with their tools into project isolation, duplication and backup. */
export function registerExtensions(registry: ProjectRegistry): void {
  registry.registerCollection({
    table: 'projectModules',
    refs: ['systemId'],
    // Categories made by the author keep their keys in a copy, so the bindings still point at the right ones.
  });
  registry.registerCollection({
    table: 'moduleRecords',
    refs: ['nodeId', 'endNodeId', 'entryIds', 'rowId', 'colId', 'eventId'],
    // In a timeline forked earlier, something logged in a later chapter has not happened; a later "resolved in" is still open.
    fork: (rows, reached) => rows.filter((row) => !row.nodeId || reached(row.nodeId)).map((row) => ({ ...row, endNodeId: reached(row.endNodeId) ? row.endNodeId : null })),
  });
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.map(text).filter(Boolean) : []);
const number = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

function parseTool(raw: unknown, index: number): ToolDef | null {
  const t = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const base = { id: text(t.id) || `tool-${index + 1}`, title: text(t.title) || 'Untitled tool', ...(text(t.hint) ? { hint: text(t.hint) } : {}) };
  switch (t.type) {
    case 'registry':
      return text(t.category) ? { ...base, type: 'registry', category: text(t.category), ...(text(t.groupBy) ? { groupBy: text(t.groupBy) } : {}), ...(strings(t.summary).length ? { summary: strings(t.summary) } : {}) } : null;
    case 'lineage':
      return { ...base, type: 'lineage' };
    case 'board':
      return text(t.category) && text(t.groupBy) ? { ...base, type: 'board', category: text(t.category), groupBy: text(t.groupBy), ...(strings(t.show).length ? { show: strings(t.show) } : {}) } : null;
    case 'table':
      return text(t.category) && strings(t.fields).length ? { ...base, type: 'table', category: text(t.category), fields: strings(t.fields) } : null;
    case 'matrix':
      return text(t.rows) && text(t.columns) ? { ...base, type: 'matrix', rows: text(t.rows), columns: text(t.columns), ...(strings(t.values).length ? { values: strings(t.values) } : {}) } : null;
    case 'meters':
      return text(t.category) && strings(t.fields).length ? { ...base, type: 'meters', category: text(t.category), fields: strings(t.fields), max: Math.max(1, number(t.max, 10)) } : null;
    case 'log': {
      const v = t.value && typeof t.value === 'object' ? (t.value as Record<string, unknown>) : null;
      // Only what the tool actually uses is kept, so a module reads back exactly as it was written.
      return {
        ...base, type: 'log',
        ...(strings(t.states).length ? { states: strings(t.states) } : {}), ...(text(t.about) ? { about: text(t.about) } : {}), ...(text(t.second) ? { second: text(t.second) } : {}),
        ...(t.checklist === true ? { checklist: true } : {}), ...(strings(t.suggestions).length ? { suggestions: strings(t.suggestions) } : {}),
        ...(v ? { value: { label: text(v.label) || 'Value', min: number(v.min, 0), max: number(v.max, 10) } } : {}),
      };
    }
    case 'calculator': {
      const inputs = (Array.isArray(t.inputs) ? (t.inputs as Record<string, unknown>[]) : []).filter((i) => text(i?.key)).map((i) => ({ key: text(i.key), label: text(i.label) || text(i.key), unit: text(i.unit), value: number(i.value, 0) }));
      const outputs = (Array.isArray(t.outputs) ? (t.outputs as Record<string, unknown>[]) : []).filter((o) => text(o?.formula)).map((o) => ({ label: text(o.label) || 'Result', formula: text(o.formula), unit: text(o.unit) }));
      return inputs.length && outputs.length ? { ...base, type: 'calculator', inputs, outputs } : null;
    }
    case 'ranks':
    case 'inventory':
      return { ...base, type: t.type };
    case 'page':
      return CORE_PAGES.includes(t.to as CorePage) ? { ...base, type: 'page', to: t.to as CorePage } : null;
    default:
      // A tool this version of the app does not know is left out; the rest of the module still works.
      return null;
  }
}

/** Reads a module from anywhere (a file, another project) without trusting it. Throws when it is not a module at all. */
export function parseDefinition(raw: unknown): ModuleDefinition {
  const d = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  if (!d || !text(d.name)) throw new Error('That is not a module.');
  const schema = d.schema && typeof d.schema === 'object' ? (d.schema as { categories?: unknown }) : {};
  const categories: TemplateData['categories'] = (Array.isArray(schema.categories) ? (schema.categories as Record<string, unknown>[]) : [])
    .filter((c) => c && typeof c === 'object' && (text(c.name) || c.builtin === true))
    .map((c) => ({
      key: text(c.key), name: text(c.name), singular: text(c.singular) || text(c.name), color: /^#[0-9a-f]{6}$/i.test(text(c.color)) ? text(c.color) : '', builtin: c.builtin === true,
      fields: (Array.isArray(c.fields) ? (c.fields as Record<string, unknown>[]) : []).filter((f) => text(f?.name)).map((f, i) => ({ id: `module-${i}`, name: text(f.name), type: (FIELD_TYPES.includes(f.type as FieldType) ? f.type : 'text') as FieldType, options: strings(f.options) })),
    }));
  const system = d.system && typeof d.system === 'object' ? tidy(d.system as never) : null;
  const tools = (Array.isArray(d.tools) ? d.tools : []).flatMap((t, i) => parseTool(t, i) ?? []);
  return {
    id: text(d.id) || `custom-${createId()}`, name: text(d.name).slice(0, 80), genre: text(d.genre), description: text(d.description),
    ...(text(d.nav) ? { nav: text(d.nav).slice(0, 40) } : {}), ...(text(d.icon) ? { icon: [...text(d.icon)].slice(0, 2).join('') } : {}), ...(strings(d.features).length ? { features: strings(d.features).slice(0, 12) } : {}), ...(strings(d.integrates).length ? { integrates: strings(d.integrates).slice(0, 16) } : {}),
    version: Math.max(1, Math.round(number(d.version, 1))), builtin: false,
    schema: { categories }, system, tools, unlocks: system ? ['systems', 'progression'] : [],
  };
}

/** Tools worked out from a module's categories, for modules made from a project: a table for each, a board where there is a choice to group by, meters where there are numbers. */
export function deriveTools(schema: TemplateData, hasSystem: boolean): ToolDef[] {
  const tools: ToolDef[] = [];
  for (const category of schema.categories.filter((c) => !c.builtin && c.fields.length)) {
    const slug = category.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const choice = category.fields.find((f) => f.type === 'select');
    const numbers = category.fields.filter((f) => f.type === 'number');
    if (choice) tools.push({ id: `${slug}-board`, type: 'board', title: `${category.name} by ${choice.name.toLowerCase()}`, category: category.name, groupBy: choice.name, show: category.fields.filter((f) => f !== choice).slice(0, 2).map((f) => f.name) });
    tools.push({ id: `${slug}-table`, type: 'table', title: category.name, category: category.name, fields: category.fields.slice(0, 5).map((f) => f.name) });
    if (numbers.length) tools.push({ id: `${slug}-meters`, type: 'meters', title: `${category.name}: ${numbers.map((f) => f.name.toLowerCase()).join(', ')}`, category: category.name, fields: numbers.slice(0, 4).map((f) => f.name), max: 10 });
  }
  if (hasSystem) tools.push({ id: 'system', type: 'page', title: 'Systems', to: 'systems' }, { id: 'progression', type: 'page', title: 'Character progression', to: 'progression' });
  return tools;
}

const lower = (value: string) => value.trim().toLowerCase();

/** The project's category a module means by one of its names: the one bound when it was turned on, or failing that the one of that name. */
export function resolveCategory(name: string, categories: Category[], bindings?: ProjectModule['bindings']): Category | undefined {
  const bound = bindings?.categories[lower(name)];
  return categories.find((c) => c.key === bound) ?? categories.find((c) => lower(c.name) === lower(name));
}

/** A category's field a module means by one of its names, the same way. A field the author archived is not found. */
export function resolveField(categoryName: string, category: Category | undefined, name: string, bindings?: ProjectModule['bindings']) {
  if (!category) return undefined;
  const bound = bindings?.fields[`${lower(categoryName)}/${lower(name)}`];
  return category.fields.find((f) => !f.archived && f.id === bound) ?? category.fields.find((f) => !f.archived && lower(f.name) === lower(name));
}

/**
 * Notes which categories and fields of the project a module's names stand
 * for. What was noted before is kept, so a renamed category or field stays
 * the one the module uses; only names not yet bound are added.
 */
function bind(definition: ModuleDefinition, categories: Category[], before?: ProjectModule['bindings']): NonNullable<ProjectModule['bindings']> {
  const out = { categories: { ...(before?.categories ?? {}) }, fields: { ...(before?.fields ?? {}) } };
  for (const incoming of definition.schema.categories) {
    // A built-in category goes by its original name in a module, whatever the author has since called it.
    const name = incoming.builtin ? (CATEGORY_LABELS[incoming.key] ?? incoming.key) : incoming.name;
    const known = categories.find((c) => c.key === out.categories[lower(name)]);
    const category = known ?? (incoming.builtin ? categories.find((c) => c.key === incoming.key) : categories.find((c) => lower(c.name) === lower(incoming.name)));
    if (!category) continue;
    out.categories[lower(name)] = category.key;
    for (const field of incoming.fields) {
      const id = `${lower(name)}/${lower(field.name)}`;
      if (category.fields.some((f) => f.id === out.fields[id])) continue;
      const def = category.fields.find((f) => lower(f.name) === lower(field.name));
      if (def) out.fields[id] = def.id;
    }
  }
  return out;
}

export function createExtensionService(db: NovelDB, codex: CodexService, systems: SystemsService, onProjectChanged: (projectId: string) => Promise<unknown>) {
  const saved = () => db.customModules.toArray();
  /** Every module that can be turned on: the built-in ones, then the author's own. */
  const available = async (): Promise<ModuleDefinition[]> => [...BUILTIN_MODULES, ...(await saved()).sort((a, b) => a.createdAt - b.createdAt).map((m) => m.definition)];

  /** Every operation is bound to one project; another project's modules and records are out of reach. */
  function forProject(projectId: string) {
    const rows = () => db.projectModules.where('projectId').equals(projectId).toArray();
    const rowFor = async (moduleId: string) => (await rows()).find((r) => r.moduleId === moduleId);
    const write = <T>(task: () => Promise<T>): Promise<T> =>
      db.transaction('rw', db.tables, async () => {
        const result = await task();
        await onProjectChanged(projectId);
        return result;
      });
    async function ownedRecord(recordId: string): Promise<ModuleRecord> {
      const record = await db.moduleRecords.get(recordId);
      if (!record || record.projectId !== projectId) throw new Error('That record is not in this project.');
      return record;
    }
    const mine = async (table: 'loreEntries' | 'chapters', id: unknown): Promise<string | null> => {
      if (typeof id !== 'string' || !id) return null;
      const row = (await db.table(table).get(id)) as { projectId: string } | undefined;
      return row?.projectId === projectId ? id : null;
    };
    const entryIds = async (ids: unknown): Promise<string[]> => {
      const out: string[] = [];
      for (const id of Array.isArray(ids) ? ids : []) if (await mine('loreEntries', id)) out.push(id as string);
      return [...new Set(out)];
    };
    const event = async (id: unknown): Promise<string | null> => {
      if (typeof id !== 'string' || !id) return null;
      const row = await db.timelineEvents.get(id);
      return row?.projectId === projectId ? id : null;
    };
    const api = codex.forProject(projectId);

    return {
      installed: rows,
      /** The modules switched on in this project, as their definitions. */
      async enabled(): Promise<ModuleDefinition[]> {
        return (await rows()).filter((r) => r.enabled).sort((a, b) => a.createdAt - b.createdAt || a.definition.name.localeCompare(b.definition.name)).map((r) => r.definition);
      },

      /**
       * Turns a module on. Its categories and fields are merged into the
       * Codex (anything already there is left as it is) and its tools
       * appear. No record is created: a starter system is only offered.
       * Turning on a built-in module that has since been improved brings
       * this project's copy up to date, which only ever adds.
       */
      async enable(module: string | ModuleDefinition): Promise<ProjectModule> {
        const existing = await rowFor(typeof module === 'string' ? module : module.id);
        const definition = typeof module === 'string' ? ((await available()).find((m) => m.id === module) ?? existing?.definition) : module;
        if (!definition) throw new Error('That module is not available.');
        const before = new Set((await api.categories()).map((c) => c.key));
        // What the author has renamed since it was last on is still the module's: a category goes in under its present name, and a field already bound is not added again.
        const current = await api.categories();
        const schema = {
          categories: definition.schema.categories.map((incoming) => {
            const name = incoming.builtin ? (CATEGORY_LABELS[incoming.key] ?? incoming.key) : incoming.name;
            const bound = current.find((c) => c.key === existing?.bindings?.categories[lower(name)]);
            if (!bound) return incoming;
            const fields = incoming.fields.filter((f) => !bound.fields.some((have) => have.id === existing?.bindings?.fields[`${lower(name)}/${lower(f.name)}`]));
            return incoming.builtin ? { ...incoming, fields } : { ...incoming, name: bound.name, fields };
          }),
        };
        const after = await api.applyTemplate(schema);
        const created = [...new Set([...(existing?.createdCategories ?? []), ...after.filter((c) => !before.has(c.key)).map((c) => c.key)])];
        // Categories it brought that were tucked away when it was last turned off come back.
        for (const key of created) if (after.find((c) => c.key === key)?.archived) await api.saveCategory(key, { archived: false });
        const now = Date.now();
        const row: ProjectModule = {
          id: existing?.id ?? createId(), projectId, moduleId: definition.id, enabled: true, definition, createdCategories: created, systemId: existing?.systemId ?? null,
          bindings: bind(definition, after, existing?.bindings), ...(existing?.settings ? { settings: existing.settings } : {}), createdAt: existing?.createdAt ?? now, updatedAt: now,
        };
        await write(() => db.projectModules.put(row));
        return row;
      },

      /**
       * Turns a module off. Its tools and sidebar entry go away, and the
       * categories it introduced are tucked out of the "new entry" menus
       * when they are empty and no other module that is on uses them.
       * Nothing is deleted: entries, field values, a system added from it
       * and everything recorded with its tools stay exactly as they are, and
       * turning it back on brings it all back.
       */
      async disable(moduleId: string): Promise<void> {
        const row = await rowFor(moduleId);
        if (!row || !row.enabled) return;
        const categories = await api.categories();
        const others = (await rows()).filter((r) => r.enabled && r.moduleId !== moduleId);
        const inUse = new Set(others.flatMap((r) => [...Object.values(r.bindings?.categories ?? {}), ...r.createdCategories]));
        const entries = await db.loreEntries.where('projectId').equals(projectId).toArray();
        for (const key of row.createdCategories) {
          if (inUse.has(key) || entries.some((e) => e.category === key)) continue;
          if (categories.some((c) => c.key === key && !c.archived)) await api.saveCategory(key, { archived: true });
        }
        await write(() => db.projectModules.update(row.id, { enabled: false, updatedAt: Date.now() }));
      },

      /** Adds a module's starter system to the project, once. It is an example to reshape, and nothing adds it but the author. */
      async addStarterSystem(moduleId: string) {
        const row = await rowFor(moduleId);
        if (!row?.definition.system) throw new Error('That module has no starter system.');
        if (row.systemId && (await systems.forProject(projectId).get(row.systemId))) return (await systems.forProject(projectId).get(row.systemId))!;
        const system = await systems.forProject(projectId).create(row.definition.system);
        await write(() => db.projectModules.update(row.id, { systemId: system.id, updatedAt: Date.now() }));
        return system;
      },

      /** Saves how the author has arranged a module here: which tools show, in what order, under what names, with what stages. */
      configure: (moduleId: string, change: (current: ModuleSettings) => ModuleSettings): Promise<void> =>
        // Read and written in one step, so two quick changes (a rename, then a reorder) build on each other instead of the second undoing the first.
        write(async () => {
          const row = await rowFor(moduleId);
          if (!row) throw new Error('That module is not installed in this project.');
          const next = change(row.settings ?? {});
          const ids = new Set(row.definition.tools.map((t) => t.id));
          const settings: ModuleSettings = {
            hidden: strings(next.hidden).filter((id) => ids.has(id)),
            order: [...new Set(strings(next.order).filter((id) => ids.has(id)))],
            titles: Object.fromEntries(Object.entries(next.titles ?? {}).filter(([id, title]) => ids.has(id) && text(title)).map(([id, title]) => [id, text(title).slice(0, 60)])),
            states: Object.fromEntries(Object.entries(next.states ?? {}).filter(([id, list]) => ids.has(id) && strings(list).length).map(([id, list]) => [id, [...new Set(strings(list))]])),
            ...(text(next.nav) ? { nav: text(next.nav).slice(0, 40) } : {}),
          };
          await db.projectModules.update(row.id, { settings, updatedAt: Date.now() });
        }),

      /**
       * Where every module stands in this project: available, enabled,
       * disabled or needing attention; how much was made with it; and which
       * other modules work on the same records. Read from what is stored.
       */
      async status(): Promise<ModuleStatus[]> {
        const installed = await rows();
        const library = await available();
        const all = [...library, ...installed.filter((r) => !library.some((m) => m.id === r.moduleId)).map((r) => r.definition)];
        const categories = await api.categories();
        const entries = await db.loreEntries.where('projectId').equals(projectId).toArray();
        const records = await db.moduleRecords.where('projectId').equals(projectId).toArray();
        const named = (definition: ModuleDefinition) => definition.schema.categories.map((c) => (c.builtin ? `key:${c.key}` : `name:${c.name.trim().toLowerCase()}`));
        const label = (id: string) => (id.startsWith('key:') ? (categories.find((c) => c.key === id.slice(4))?.name ?? id.slice(4)) : (categories.find((c) => c.name.trim().toLowerCase() === id.slice(5))?.name ?? id.slice(5)));
        return all.map((module) => {
          const row = installed.find((r) => r.moduleId === module.id);
          const definition = row?.definition ?? module;
          // What counts as made with it: entries in the categories it brings of its own (not the built-in ones it only adds fields to).
          const own = definition.schema.categories.filter((c) => !c.builtin).flatMap((c) => resolveCategory(c.name, categories, row?.bindings)?.key ?? []);
          const updatable = Boolean(row && module.builtin && module.version > row.definition.version);
          const reasons: string[] = [];
          if (row?.enabled) {
            const missing = [...new Set(definition.tools.flatMap((tool) => ('category' in tool ? [tool.category] : tool.type === 'matrix' ? [tool.rows, tool.columns] : tool.type === 'log' && tool.about ? [tool.about] : [])))].filter((name) => !resolveCategory(name, categories, row.bindings));
            if (missing.length) reasons.push(`${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} no longer in the Codex. Turn the module off and on again to put ${missing.length === 1 ? 'it' : 'them'} back.`);
            if (updatable) reasons.push(`A newer version (${module.version}) is available; this project has version ${row.definition.version}. Updating only adds fields and tools.`);
          }
          const mine = new Set(named(definition));
          return {
            module: definition,
            state: !row ? 'available' : !row.enabled ? 'disabled' : reasons.length ? 'attention' : 'enabled',
            reasons, installed: row ? row.definition.version : null, updatable,
            usage: { entries: entries.filter((e) => own.includes(e.category)).length, records: records.filter((r) => r.moduleId === module.id).length },
            shares: all.filter((other) => other.id !== module.id).flatMap((other) => {
              const theirs = installed.find((r) => r.moduleId === other.id);
              const shared = named(theirs?.definition ?? other).filter((id) => mine.has(id));
              return shared.length ? [{ moduleId: other.id, name: other.name, enabled: Boolean(theirs?.enabled), categories: shared.map(label) }] : [];
            }),
          } satisfies ModuleStatus;
        });
      },

      records: () => db.moduleRecords.where('projectId').equals(projectId).toArray(),

      addRecord: (moduleId: string, toolId: string, input: RecordChanges = {}) =>
        write(async () => {
          const now = Date.now();
          const record: ModuleRecord = {
            id: createId(), projectId, moduleId, toolId, kind: 'log', title: text(input.title) || 'Untitled', state: text(input.state), nodeId: await mine('chapters', input.nodeId), endNodeId: await mine('chapters', input.endNodeId),
            entryIds: await entryIds(input.entryIds), eventId: await event(input.eventId), value: typeof input.value === 'number' && Number.isFinite(input.value) ? input.value : null, note: typeof input.note === 'string' ? input.note : '', done: input.done === true, rowId: null, colId: null, createdAt: now, updatedAt: now,
          };
          await db.moduleRecords.add(record);
          return record;
        }),

      updateRecord: (recordId: string, changes: RecordChanges) =>
        write(async () => {
          await ownedRecord(recordId);
          const next: Partial<ModuleRecord> = { updatedAt: Date.now() };
          if (typeof changes.title === 'string') next.title = changes.title.trim() || 'Untitled';
          if (typeof changes.state === 'string') next.state = changes.state.trim();
          if (typeof changes.note === 'string') next.note = changes.note;
          if (typeof changes.done === 'boolean') next.done = changes.done;
          if ('value' in changes) next.value = typeof changes.value === 'number' && Number.isFinite(changes.value) ? changes.value : null;
          if ('nodeId' in changes) next.nodeId = await mine('chapters', changes.nodeId);
          if ('endNodeId' in changes) next.endNodeId = await mine('chapters', changes.endNodeId);
          if ('entryIds' in changes) next.entryIds = await entryIds(changes.entryIds);
          if ('eventId' in changes) next.eventId = await event(changes.eventId);
          await db.moduleRecords.update(recordId, next);
        }),

      removeRecord: (recordId: string) =>
        write(async () => {
          await ownedRecord(recordId);
          await db.moduleRecords.delete(recordId);
        }),

      /** Sets one cell of a matrix: what a row's entry has to do with a column's. An empty value clears it. */
      setCell: (moduleId: string, toolId: string, rowId: string, colId: string, value: string) =>
        write(async () => {
          if (!(await mine('loreEntries', rowId)) || !(await mine('loreEntries', colId))) throw new Error('Those entries are not in this project.');
          const existing = (await db.moduleRecords.where('projectId').equals(projectId).toArray()).find((r) => r.kind === 'cell' && r.moduleId === moduleId && r.toolId === toolId && r.rowId === rowId && r.colId === colId);
          const now = Date.now();
          if (!value.trim()) return existing ? db.moduleRecords.delete(existing.id) : undefined;
          if (existing) return db.moduleRecords.update(existing.id, { state: value.trim(), updatedAt: now });
          await db.moduleRecords.add({ id: createId(), projectId, moduleId, toolId, kind: 'cell', title: '', state: value.trim(), nodeId: null, endNodeId: null, entryIds: [], value: null, note: '', done: false, rowId, colId, createdAt: now, updatedAt: now });
        }),

      /**
       * Packages part of this project as a module: the chosen categories
       * with their fields, and the chosen system blueprints' rules. No
       * entries, characters or text go into it: only the shape of things.
       */
      async buildFrom(input: { name: string; genre?: string; description?: string; categoryKeys: string[]; systemId?: string | null }): Promise<ModuleDefinition> {
        const snapshot = await api.schemaSnapshot();
        const categories = snapshot.categories.filter((c) => input.categoryKeys.includes(c.key)).map((c) => ({ ...c, key: c.builtin ? c.key : '', name: c.builtin ? '' : c.name, fields: c.fields.map((f, i) => ({ id: `module-${i}`, name: f.name, type: f.type, options: [...f.options] })) }));
        const blueprint = input.systemId ? await systems.forProject(projectId).get(input.systemId) : undefined;
        const system = blueprint ? tidy(blueprint) : null;
        if (!text(input.name)) throw new Error('Give the module a name.');
        if (!categories.length && !system) throw new Error('Choose at least one category or a system to put in the module.');
        const named = snapshot.categories.filter((c) => input.categoryKeys.includes(c.key) && !c.builtin).map((c) => ({ ...c, builtin: false }));
        return parseDefinition({ id: `custom-${createId()}`, name: input.name, genre: input.genre, description: input.description, version: 1, schema: { categories }, system, tools: deriveTools({ categories: named }, Boolean(system)) });
      },
    };
  }

  return {
    forProject,
    available,
    saved,
    /** Keeps a module in the author's library on this device, replacing an earlier version of the same module. */
    async save(definition: ModuleDefinition): Promise<SavedModule> {
      const clean = parseDefinition(definition);
      const row: SavedModule = { id: clean.id, definition: clean, createdAt: (await db.customModules.get(clean.id))?.createdAt ?? Date.now() };
      await db.customModules.put(row);
      return row;
    },
    /** Takes a module out of the library. Projects that have it installed keep their own copy. */
    remove: (moduleId: string) => db.customModules.delete(moduleId),
    /** A module as a file's worth of JSON, to keep or to share. */
    exportModule: (definition: ModuleDefinition): string => JSON.stringify({ format: MODULE_FORMAT, version: 1, module: { ...definition, builtin: false } }, null, 2),
    /** Reads a module file into the library. Throws when the file is something else. */
    async importModule(json: string): Promise<SavedModule> {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(json) as Record<string, unknown>;
      } catch {
        throw new Error('That file is not a module.');
      }
      if (!data || data.format !== MODULE_FORMAT || !data.module) throw new Error('That file is not a module.');
      const definition = parseDefinition(data.module);
      // A file never replaces a built-in module, whatever id it claims.
      if (BUILTIN_MODULES.some((m) => m.id === definition.id)) definition.id = `custom-${createId()}`;
      const row: SavedModule = { id: definition.id, definition, createdAt: (await db.customModules.get(definition.id))?.createdAt ?? Date.now() };
      await db.customModules.put(row);
      return row;
    },
  };
}

export type ExtensionService = ReturnType<typeof createExtensionService>;
export type ProjectExtensions = ReturnType<ExtensionService['forProject']>;
