// The changes modules make to a novel, as the original app's extension service makes them: turning one on or off,
// its starter system, how the author arranges it, where every module stands, what its tools record, and packaging
// part of a novel as a module of the author's own. A port of flutter_app/lib/shared/domain/modules/module_changes.dart.

import { ChangeRefused, CodexChanges } from '../codex/codexChanges';
import { type JsonMap, listOf, mapOrNull, numOrNull, str, strOrNull } from '../json';
import { dartSort } from '../manuscript/dartSort';
import { builtinCategoryKeys } from '../records/category';
import { maps, strings } from '../records/jsonRecord';
import { instantiateBlueprint, tidyBlueprint } from '../systems/blueprints';
import { dartToLowerCase, dartTrim } from '../text/dartString';
import {
  FormatError,
  ModuleDefinition,
  bind,
  bindingsJson,
  bindingsOf,
  builtinCategoryLabel,
  builtinModules,
  deriveTools,
  moduleFileFormat,
  parseDefinition,
  resolveCategory,
} from './moduleDefs';

/** Where a module stands in a novel, worked out from what is stored. */
export type ModuleState = 'available' | 'enabled' | 'disabled' | 'attention';
export const moduleStates: readonly ModuleState[] = ['available', 'enabled', 'disabled', 'attention'];
export const moduleStateLabel: Readonly<Record<ModuleState, string>> = {
  available: 'Available',
  enabled: 'Enabled',
  disabled: 'Disabled',
  attention: 'Needs attention',
};

/** Another module that uses some of the same categories, and so the same records. */
export type ModuleShare = { moduleId: string; name: string; enabled: boolean; categories: string[] };

export type ModuleStatus = {
  module: ModuleDefinition;
  state: ModuleState;
  /** Why it needs attention, in words for the author. */
  reasons: string[];
  /** The version installed here, when it is installed. */
  installed: number | null;
  /** A newer version of a built-in module is available than the one installed here. */
  updatable: boolean;
  /** Entries in the categories it brought, and lines and cells recorded with its tools. */
  entries: number;
  records: number;
  shares: ModuleShare[];
};

const text = (v: unknown): string => (typeof v === 'string' ? dartTrim(v) : '');
const textList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => text(x).length > 0).map(text) : []);
const lower = (v: string): string => dartToLowerCase(dartTrim(v));
/** Dart's `String.compareTo`: by code units. */
const compareStrings = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The changes modules make to a novel. Read and written through a snapshot of the novel; saved by whoever made it,
 * all at once. */
export class ModuleChanges extends CodexChanges {
  installed(): readonly JsonMap[] {
    return this.rows('projectModules');
  }

  rowFor(moduleId: string): JsonMap | null {
    return this.installed().find((r) => r['moduleId'] === moduleId) ?? null;
  }

  /** The modules switched on, as their definitions, in the order they were first turned on. */
  enabled(): ModuleDefinition[] {
    const on = this.installed().filter((r) => r['enabled'] === true);
    dartSort(on, (a, b) => {
      const x = numOrNull(a['createdAt']) ?? 0;
      const y = numOrNull(b['createdAt']) ?? 0;
      const c = x < y ? -1 : x > y ? 1 : 0;
      return c !== 0 ? c : compareStrings(str(mapOrNull(a['definition'])?.['name']), str(mapOrNull(b['definition'])?.['name']));
    });
    return on.map((r) => new ModuleDefinition(mapOrNull(r['definition'])!));
  }

  /** Turns a module on. Its categories and fields are merged into the codex (anything already there is left as it is)
   * and its tools appear. No record is created: a starter system is only offered. Turning on a built-in module that
   * has since been improved brings this novel's copy up to date, which only ever adds. */
  enable(definition: ModuleDefinition): JsonMap {
    const existing = this.rowFor(definition.id);
    const existingBindings = existing === null ? null : bindingsOf(existing['bindings']);
    const before = new Set(this.categories().map((c) => c.key));
    const current = this.categories();
    // What the author has renamed since it was last on is still the module's: a category goes in under its present
    // name, and a field already bound is not added again.
    const schema = definition.categories.map((incoming): JsonMap => {
      const builtin = incoming['builtin'] === true;
      const key = str(incoming['key']);
      const name = builtin ? (builtinCategoryKeys.includes(key) ? builtinCategoryLabel(key) : key) : str(incoming['name']);
      const bound = current.find((c) => c.key === existingBindings?.categories.get(lower(name))) ?? null;
      if (bound === null) return incoming;
      const boundFields = bound.fields;
      const fields = maps(incoming['fields']).filter(
        (f) => !boundFields.some((have) => have.id === existingBindings?.fields.get(`${lower(name)}/${lower(str(f['name']))}`)),
      );
      return builtin ? { ...incoming, fields } : { ...incoming, name: bound.name, fields };
    });
    let after = this.addKinds(schema);
    const created = [
      ...new Set([...strings(existing?.['createdCategories']), ...after.filter((c) => !before.has(c.key)).map((c) => c.key)]),
    ];
    // Categories it brought that were tucked away when it was last turned off come back.
    for (const key of created) {
      if (after.find((c) => c.key === key)?.archived ?? false) this.saveCategory(key, () => ({ archived: false }));
    }
    after = this.categories();
    const row: JsonMap = {
      id: existing?.['id'] ?? this.newId(),
      projectId: this.projectId,
      moduleId: definition.id,
      enabled: true,
      definition: definition.raw,
      createdCategories: created,
      systemId: existing?.['systemId'] ?? null,
      bindings: bindingsJson(bind(definition, after, existingBindings)),
    };
    if (existing?.['settings'] !== undefined && existing?.['settings'] !== null) row['settings'] = existing['settings'];
    row['createdAt'] = existing?.['createdAt'] ?? this.now;
    row['updatedAt'] = this.now;
    this.put('projectModules', row);
    return row;
  }

  /** Turns a module off. Its tools go away, and the categories it introduced are tucked out of the "new entry" menus
   * when they are empty and no other module that is on uses them. Nothing is deleted. */
  disable(moduleId: string): void {
    const row = this.rowFor(moduleId);
    if (row === null || row['enabled'] !== true) return;
    const cats = this.categories();
    const others = this.installed().filter((r) => r['enabled'] === true && r['moduleId'] !== moduleId);
    const inUse = new Set<string>();
    for (const r of others) {
      for (const k of bindingsOf(r['bindings']).categories.values()) inUse.add(k);
      for (const k of strings(r['createdCategories'])) inUse.add(k);
    }
    const entries = this.rows('loreEntries');
    for (const key of strings(row['createdCategories'])) {
      if (inUse.has(key) || entries.some((e) => e['category'] === key)) continue;
      if (cats.some((c) => c.key === key && !c.archived)) this.saveCategory(key, () => ({ archived: true }));
    }
    this.put('projectModules', { ...row, enabled: false, updatedAt: this.now });
  }

  /** Adds a module's starter system to the novel, once. Returns its id. */
  addStarterSystem(moduleId: string): string {
    const row = this.rowFor(moduleId);
    const system = mapOrNull(mapOrNull(row?.['definition'])?.['system']);
    if (row === null || system === null) throw new ChangeRefused('That module has no starter system.');
    const had = strOrNull(row['systemId']);
    if (had !== null && this.row('systems', had) !== null) return had;
    const id = this.newId();
    this.put('systems', {
      id,
      projectId: this.projectId,
      ...instantiateBlueprint(system, () => this.newId()),
      createdAt: this.now,
      updatedAt: this.now,
    });
    this.put('projectModules', { ...row, systemId: id, updatedAt: this.now });
    return id;
  }

  /** Saves how the author has arranged a module here. */
  configure(moduleId: string, change: (current: JsonMap) => JsonMap): void {
    const row = this.rowFor(moduleId);
    if (row === null) throw new ChangeRefused('That module is not installed in this novel.');
    const next = change(mapOrNull(row['settings']) ?? {});
    const ids = new Set(maps(mapOrNull(row['definition'])?.['tools']).map((t) => str(t['id'])));
    const nav = text(next['nav']);
    const titles: JsonMap = {};
    for (const [k, v] of Object.entries(mapOrNull(next['titles']) ?? {})) {
      if (ids.has(k) && text(v).length > 0) titles[k] = text(v).length > 60 ? text(v).substring(0, 60) : text(v);
    }
    const states: JsonMap = {};
    for (const [k, v] of Object.entries(mapOrNull(next['states']) ?? {})) {
      if (ids.has(k) && textList(v).length > 0) states[k] = [...new Set(textList(v))];
    }
    const settings: JsonMap = {
      hidden: textList(next['hidden']).filter((id) => ids.has(id)),
      order: [...new Set(textList(next['order']).filter((id) => ids.has(id)))],
      titles,
      states,
    };
    if (nav.length > 0) settings['nav'] = nav.length > 40 ? nav.substring(0, 40) : nav;
    this.put('projectModules', { ...row, settings, updatedAt: this.now });
  }

  /** Where every module stands in this novel: available, enabled, disabled or needing attention; how much was made
   * with it; and which other modules work on the same records. `library` is every module that can be turned on. */
  status(library: readonly ModuleDefinition[]): ModuleStatus[] {
    const rows = this.installed();
    const all = [
      ...library,
      ...rows.filter((r) => !library.some((m) => m.id === r['moduleId'])).map((r) => new ModuleDefinition(mapOrNull(r['definition'])!)),
    ];
    const cats = this.categories();
    const entries = this.rows('loreEntries');
    const records = this.rows('moduleRecords');
    const named = (d: ModuleDefinition): string[] =>
      d.categories.map((c) => (c['builtin'] === true ? `key:${str(c['key'])}` : `name:${lower(str(c['name']))}`));
    const label = (id: string): string =>
      id.startsWith('key:')
        ? (cats.find((c) => c.key === id.substring(4))?.name ?? id.substring(4))
        : (cats.find((c) => lower(c.name) === id.substring(5))?.name ?? id.substring(5));
    return all.map((module): ModuleStatus => {
      const row = rows.find((r) => r['moduleId'] === module.id) ?? null;
      const definition = row === null ? module : new ModuleDefinition(mapOrNull(row['definition'])!);
      const bindings = row === null ? null : bindingsOf(row['bindings']);
      const own: string[] = [];
      for (const c of definition.categories) {
        if (c['builtin'] === true) continue;
        const key = resolveCategory(str(c['name']), cats, bindings)?.key;
        if (key !== undefined) own.push(key);
      }
      const updatable = row !== null && module.builtin && module.version > definition.version;
      const reasons: string[] = [];
      if (row?.['enabled'] === true) {
        const wanted = new Set<string>();
        for (const tool of definition.tools) {
          if ('category' in tool) wanted.add(str(tool['category']));
          else if (tool['type'] === 'matrix') {
            wanted.add(str(tool['rows']));
            wanted.add(str(tool['columns']));
          } else if (tool['type'] === 'log' && text(tool['about']).length > 0) wanted.add(str(tool['about']));
        }
        const missing = [...wanted].filter((name) => resolveCategory(name, cats, bindings) === null);
        if (missing.length > 0) {
          reasons.push(
            `${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} no longer in World. Turn the module off ` +
              `and on again to put ${missing.length === 1 ? 'it' : 'them'} back.`,
          );
        }
        if (updatable) {
          reasons.push(
            `A newer version (${module.version}) is available; this project has version ${definition.version}. ` +
              'Updating only adds fields and tools.',
          );
        }
      }
      const mine = new Set(named(definition));
      const shares: ModuleShare[] = [];
      for (const other of all) {
        if (other.id === module.id) continue;
        const theirs = rows.find((r) => r['moduleId'] === other.id) ?? null;
        const shared = named(theirs === null ? other : new ModuleDefinition(mapOrNull(theirs['definition'])!)).filter((id) =>
          mine.has(id),
        );
        if (shared.length === 0) continue;
        shares.push({ moduleId: other.id, name: other.name, enabled: theirs?.['enabled'] === true, categories: shared.map(label) });
      }
      return {
        module: definition,
        state:
          row === null ? 'available' : row['enabled'] !== true ? 'disabled' : reasons.length > 0 ? 'attention' : 'enabled',
        reasons,
        installed: row === null ? null : definition.version,
        updatable,
        entries: entries.filter((e) => own.includes(e['category'] as string)).length,
        records: records.filter((r) => r['moduleId'] === module.id).length,
        shares,
      };
    });
  }

  private mine(collection: string, id: unknown): string | null {
    return typeof id === 'string' && id.length > 0 && this.row(collection, id) !== null ? id : null;
  }

  private entryIds(ids: unknown): string[] {
    const out = new Set<string>();
    for (const id of listOf(ids)) {
      const mine = this.mine('loreEntries', id);
      if (mine !== null) out.add(mine);
    }
    return [...out];
  }

  /** Adds a line to a module's log. */
  addRecord(moduleId: string, toolId: string, input: JsonMap = {}): JsonMap {
    const value = input['value'];
    const record: JsonMap = {
      id: this.newId(),
      projectId: this.projectId,
      moduleId,
      toolId,
      kind: 'log',
      title: text(input['title']).length > 0 ? text(input['title']) : 'Untitled',
      state: text(input['state']),
      nodeId: this.mine('chapters', input['nodeId']),
      endNodeId: this.mine('chapters', input['endNodeId']),
      entryIds: this.entryIds(input['entryIds']),
      eventId: this.mine('timelineEvents', input['eventId']),
      value: typeof value === 'number' && Number.isFinite(value) ? value : null,
      note: typeof input['note'] === 'string' ? input['note'] : '',
      done: input['done'] === true,
      rowId: null,
      colId: null,
      createdAt: this.now,
      updatedAt: this.now,
    };
    this.put('moduleRecords', record);
    return record;
  }

  updateRecord(recordId: string, changes: JsonMap): void {
    const record = this.row('moduleRecords', recordId);
    if (record === null) throw new ChangeRefused('That record is not in this novel.');
    const next: JsonMap = { ...record, updatedAt: this.now };
    if (typeof changes['title'] === 'string') next['title'] = text(changes['title']).length === 0 ? 'Untitled' : text(changes['title']);
    if (typeof changes['state'] === 'string') next['state'] = text(changes['state']);
    if (typeof changes['note'] === 'string') next['note'] = changes['note'];
    if (typeof changes['done'] === 'boolean') next['done'] = changes['done'];
    if ('value' in changes) {
      const v = changes['value'];
      next['value'] = typeof v === 'number' && Number.isFinite(v) ? v : null;
    }
    if ('nodeId' in changes) next['nodeId'] = this.mine('chapters', changes['nodeId']);
    if ('endNodeId' in changes) next['endNodeId'] = this.mine('chapters', changes['endNodeId']);
    if ('entryIds' in changes) next['entryIds'] = this.entryIds(changes['entryIds']);
    if ('eventId' in changes) next['eventId'] = this.mine('timelineEvents', changes['eventId']);
    this.put('moduleRecords', next);
  }

  removeRecord(recordId: string): void {
    if (this.row('moduleRecords', recordId) === null) throw new ChangeRefused('That record is not in this novel.');
    this.remove('moduleRecords', recordId);
  }

  /** Sets one cell of a matrix: what a row's entry has to do with a column's. An empty value clears it. */
  setCell(moduleId: string, toolId: string, rowId: string, colId: string, value: string): void {
    if (this.mine('loreEntries', rowId) === null || this.mine('loreEntries', colId) === null) {
      throw new ChangeRefused('Those entries are not in this novel.');
    }
    const existing =
      this.rows('moduleRecords').find(
        (r) => r['kind'] === 'cell' && r['moduleId'] === moduleId && r['toolId'] === toolId && r['rowId'] === rowId && r['colId'] === colId,
      ) ?? null;
    if (dartTrim(value).length === 0) {
      if (existing !== null) this.remove('moduleRecords', str(existing['id']));
      return;
    }
    if (existing !== null) {
      this.put('moduleRecords', { ...existing, state: dartTrim(value), updatedAt: this.now });
      return;
    }
    this.put('moduleRecords', {
      id: this.newId(),
      projectId: this.projectId,
      moduleId,
      toolId,
      kind: 'cell',
      title: '',
      state: dartTrim(value),
      nodeId: null,
      endNodeId: null,
      entryIds: [],
      value: null,
      note: '',
      done: false,
      rowId,
      colId,
      createdAt: this.now,
      updatedAt: this.now,
    });
  }

  /** Packages part of this novel as a module: the chosen categories with their fields, and a chosen system's rules.
   * No entries, characters or text go into it: only the shape of things. */
  buildFrom(args: { name: string; genre?: string; description?: string; categoryKeys: readonly string[]; systemId?: string | null }): ModuleDefinition {
    const snapshot = this.schemaSnapshot();
    const chosen = snapshot.filter((c) => args.categoryKeys.includes(c['key'] as string));
    const categories = chosen.map((c) => ({
      ...c,
      key: c['builtin'] === true ? c['key'] : '',
      name: c['builtin'] === true ? '' : c['name'],
      fields: maps(c['fields']).map((f, i) => ({ id: `module-${i}`, name: f['name'], type: f['type'], options: [...strings(f['options'])] })),
    }));
    const blueprint = args.systemId === null || args.systemId === undefined ? null : this.row('systems', args.systemId);
    const system = blueprint === null ? null : tidyBlueprint(blueprint, () => this.newId());
    if (text(args.name).length === 0) throw new ChangeRefused('Give the module a name.');
    if (categories.length === 0 && system === null) {
      throw new ChangeRefused('Choose at least one category or a system to put in the module.');
    }
    const named = chosen.filter((c) => c['builtin'] !== true).map((c) => ({ ...c, builtin: false }));
    return parseDefinition(
      {
        id: `custom-${this.newId()}`,
        name: args.name,
        genre: args.genre ?? '',
        description: args.description ?? '',
        version: 1,
        schema: { categories },
        system,
        tools: deriveTools(named, system !== null),
      },
      { newId: () => this.newId() },
    );
  }
}

/** A module as a file's worth of JSON, to keep or share. */
export function moduleFile(definition: ModuleDefinition): JsonMap {
  return { format: moduleFileFormat, version: 1, module: { ...definition.raw, builtin: false } };
}

/** Reads a module file. Throws FormatError when the file is something else. A file never replaces a built-in module,
 * whatever id it claims. */
export function readModuleFile(data: unknown, args: { newId: () => string }): ModuleDefinition {
  const file = mapOrNull(data);
  if (file === null || file['format'] !== moduleFileFormat || file['module'] === null || file['module'] === undefined) {
    throw new FormatError('That file is not a module.');
  }
  const definition = parseDefinition(file['module'], args);
  if (builtinModules.some((m) => m.id === definition.id)) {
    return new ModuleDefinition({ ...definition.raw, id: `custom-${args.newId()}` });
  }
  return definition;
}
