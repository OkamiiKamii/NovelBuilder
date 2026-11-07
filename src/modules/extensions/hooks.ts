import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { codex, extensions, manuscript } from '@/core';
import { useCategories } from '@/modules/codex/categories';
import { displayValue, viewFields } from '@/modules/codex/schema';
import type { Category, FieldDef, LoreEntry } from '@/modules/codex/types';
import { buildTree, flatten, isDocument } from '@/modules/manuscript/tree';
import type { StoryNode } from '@/modules/manuscript/types';
import { resolveCategory, resolveField } from './service';
import type { ModuleDefinition, ModuleRecord, ModuleSettings, ModuleStatus, ProjectModule, ToolDef } from './types';

/** The modules installed in a project, live. Undefined while loading. */
export const useInstalled = (projectId: string): ProjectModule[] | undefined => useLiveQuery(() => extensions.forProject(projectId).installed(), [projectId]);

/** The modules switched on in a project, in the order they were first turned on. */
export function useEnabledModules(projectId: string): ModuleDefinition[] {
  const installed = useInstalled(projectId);
  return useMemo(() => (installed ?? []).filter((r) => r.enabled).sort((a, b) => a.createdAt - b.createdAt || a.definition.name.localeCompare(b.definition.name)).map((r) => r.definition), [installed]);
}

/** Which enabled modules work on a category, by category key: what a search result or a Codex heading can say a record belongs to. */
export function useCategoryModules(projectId: string): Map<string, string[]> {
  const installed = useInstalled(projectId);
  const categories = useCategories();
  return useMemo(() => {
    const out = new Map<string, string[]>();
    for (const row of (installed ?? []).filter((r) => r.enabled)) {
      for (const incoming of row.definition.schema.categories.filter((c) => !c.builtin)) {
        const key = resolveCategory(incoming.name, categories.list, row.bindings)?.key;
        const name = row.settings?.nav || row.definition.nav || row.definition.name;
        if (key && !out.get(key)?.includes(name)) out.set(key, [...(out.get(key) ?? []), name]);
      }
    }
    return out;
  }, [installed, categories]);
}

/** Where every module stands in a project, live. */
export const useModuleStatus = (projectId: string): ModuleStatus[] | undefined =>
  useLiveQuery(() => extensions.forProject(projectId).status(), [projectId]);

/** A module's tools as the author has arranged them here: hidden ones left out, in their order, under their names, with their own stages. */
export function arrangedTools(module: ModuleDefinition, settings: ModuleSettings = {}): ToolDef[] {
  const order = settings.order ?? [];
  const at = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length + module.tools.findIndex((t) => t.id === id));
  return module.tools
    .filter((tool) => !settings.hidden?.includes(tool.id))
    .sort((a, b) => at(a.id) - at(b.id))
    .map((tool) => ({ ...tool, title: settings.titles?.[tool.id] || tool.title, ...(tool.type === 'log' && settings.states?.[tool.id]?.length ? { states: settings.states[tool.id] } : {}) }));
}

export interface ToolData {
  projectId: string;
  entries: LoreEntry[];
  nodes: StoryNode[];
  /** Chapters and scenes in reading order. */
  documents: { node: StoryNode; depth: number }[];
  records: ModuleRecord[];
  /** A category by the name a module uses for it. */
  category: (name: string) => Category | undefined;
  entriesOf: (category: Category | undefined) => LoreEntry[];
  /** A field by the name a module uses for it. `as` is the module's name for the category, when the author may have renamed either. */
  field: (category: Category | undefined, name: string, as?: string) => FieldDef | undefined;
  /** An entry's stored value for a field, as text. */
  raw: (entry: LoreEntry, category: Category, def: FieldDef) => string;
  /** The same as a reader should see it. */
  shown: (entry: LoreEntry, category: Category, def: FieldDef) => string;
  setValue: (entry: LoreEntry, def: FieldDef, value: string) => Promise<void>;
  position: (nodeId: string | null) => number;
  loading: boolean;
}

/** Everything a module's tools read and write, in the terms modules use: categories and fields by name. */
export function useToolData(projectId: string, bindings?: ProjectModule['bindings']): ToolData {
  const categories = useCategories();
  const entries = useLiveQuery(() => codex.forProject(projectId).list(), [projectId]);
  const nodes = useLiveQuery(() => manuscript.forProject(projectId).list(), [projectId]);
  const records = useLiveQuery(() => extensions.forProject(projectId).records(), [projectId]);
  return useMemo(() => {
    const all = entries ?? [];
    const documents = flatten(buildTree(nodes ?? [])).filter((t) => isDocument(t.node.kind));
    const order = new Map(documents.map((t, i) => [t.node.id, i]));
    const raw: ToolData['raw'] = (entry, category, def) => viewFields(entry, category).category.find((slot) => slot.def.id === def.id)?.field?.value ?? '';
    return {
      projectId, entries: all, nodes: nodes ?? [], documents, records: records ?? [],
      category: (name) => resolveCategory(name, categories.list, bindings),
      entriesOf: (category) => (category ? all.filter((e) => e.category === category.key).sort((a, b) => a.name.localeCompare(b.name)) : []),
      field: (category, name, as) => resolveField(as ?? category?.name ?? '', category, name, bindings),
      raw,
      shown: (entry, category, def) => displayValue({ type: def.type, value: raw(entry, category, def) }, (id) => all.find((e) => e.id === id)?.name),
      setValue: (entry, def, value) => codex.forProject(projectId).setFieldValue(entry.id, def.id, value),
      position: (nodeId) => (nodeId === null ? -1 : (order.get(nodeId) ?? Number.MAX_SAFE_INTEGER)),
      loading: !entries || !nodes || !records,
    };
  }, [projectId, categories, entries, nodes, records, bindings]);
}
