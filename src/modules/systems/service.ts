import type { NovelDB } from '@/core/db';
import { createId } from '@/core/id';
import { removeAbilityConnections } from '@/modules/connections/cascade';
import type { ProjectRegistry } from '@/core/projectRegistry';
import { BLANK } from './presets';
import { takesPoints } from './compute';
import { upgradeShape } from './shape';
import { MODIFIER_OPS, VARIABLE_KINDS, toKey, type BlueprintContent, type Named, type SystemBlueprint, type SystemSheet, type XpEntry } from './types';

export class SystemNotFoundError extends Error {
  constructor(id: string) {
    super(`System ${id} not found in this project`);
    this.name = 'SystemNotFoundError';
  }
}

/** Hooks blueprints and sheets into project isolation, duplication and backup. A sheet follows its blueprint and its codex entry to the copies. */
export function registerSystems(registry: ProjectRegistry): void {
  // A project file from an earlier version links ranks and table cells by name.
  registry.registerCollection({ table: 'systems', remap: (row) => upgradeShape(row) });
  registry.registerCollection({
    table: 'systemSheets',
    refs: ['systemId', 'entryId'],
    // Experience follows its chapter to the copy; a branch inherits only what had been earned by the point it forks from.
    remap: (row, mapId) => ({ ...row, xp: ((row as unknown as SystemSheet).xp ?? []).map((e) => ({ ...e, nodeId: e.nodeId ? mapId(e.nodeId) : null })) }),
    fork: (rows, reached) => rows.map((row) => ({ ...row, xp: ((row as unknown as SystemSheet).xp ?? []).filter((e) => e.nodeId === null || reached(e.nodeId)) })),
  });
}

const text = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);
const list = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
const number = (value: unknown, fallback = 0): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

/**
 * Makes a blueprint safe to store without imposing any game rules on it:
 * everything has an id and a name, formula names are unique, and references
 * inside the blueprint point at things that exist.
 */
export function tidy(given: Partial<BlueprintContent>): BlueprintContent {
  // Blueprints from earlier versions, saved modules and old project files link ranks and table cells by name.
  const input = upgradeShape(given as Record<string, unknown>) as Partial<BlueprintContent>;
  const taken = new Set<string>();
  const unique = (wanted: string): string => {
    const base = toKey(wanted);
    let key = base;
    for (let n = 2; taken.has(key); n++) key = `${base}_${n}`;
    taken.add(key);
    return key;
  };
  const variables = list<BlueprintContent['variables'][number]>(input.variables).map((v) => ({
    id: text(v.id) || createId(), name: text(v.name).trim() || 'Unnamed', key: unique(text(v.key) || text(v.name) || 'value'), kind: VARIABLE_KINDS.includes(v.kind) ? v.kind : 'number',
    unit: text(v.unit).trim(), base: number(v.base), formula: text(v.formula), options: list<string>(v.options).map((o) => text(o).trim()).filter(Boolean), note: text(v.note),
  }));
  const tracks = list<BlueprintContent['tracks'][number]>(input.tracks).map((t) => ({
    id: text(t.id) || createId(), name: text(t.name).trim() || 'Unnamed', key: unique(text(t.key) || text(t.name) || 'track'), kind: t.kind === 'stages' ? ('stages' as const) : ('levels' as const),
    cap: Math.max(0, Math.round(number(t.cap))), curve: text(t.curve), curveUnit: text(t.curveUnit).trim(),
    ...(t.kind === 'stages' ? {} : { points: Math.max(0, number(t.points)), sources: [...new Set(list<string>(t.sources).map((s) => text(s).trim()).filter(Boolean))] }),
    stages: list<BlueprintContent['tracks'][number]['stages'][number]>(t.stages).map((s) => ({ id: text(s.id) || createId(), name: text(s.name).trim() || 'Unnamed stage', requires: text(s.requires), note: text(s.note) })),
  }));
  const groups = list<BlueprintContent['groups'][number]>(input.groups).map((g) => ({ id: text(g.id) || createId(), name: text(g.name).trim() || 'Unnamed group', single: g.single === true }));
  const groupIds = new Set(groups.map((g) => g.id));
  const raw = list<BlueprintContent['items'][number]>(input.items).filter((i) => groupIds.has(i.groupId)).map((i) => ({ ...i, id: text(i.id) || createId() }));
  const itemIds = new Set(raw.map((i) => i.id));
  const ranks = list<Named>(input.ranks);
  const rankIds = new Set(ranks.map((r) => r.id));
  const items = raw.map((i) => ({
    id: i.id, groupId: i.groupId, name: text(i.name).trim() || 'Unnamed', description: text(i.description), parentId: i.parentId && i.parentId !== i.id && itemIds.has(i.parentId) ? i.parentId : null,
    rankId: i.rankId && rankIds.has(i.rankId) ? i.rankId : null, requires: text(i.requires),
    modifiers: list<BlueprintContent['items'][number]['modifiers'][number]>(i.modifiers).map((m) => ({ id: text(m.id) || createId(), target: text(m.target), op: MODIFIER_OPS.includes(m.op) ? m.op : ('add' as const), value: text(m.value) })),
    costs: list<BlueprintContent['items'][number]['costs'][number]>(i.costs).map((c) => ({ id: text(c.id) || createId(), target: text(c.target), amount: text(c.amount) })),
    cooldown: text(i.cooldown), affinity: text(i.affinity), evolution: text(i.evolution),
  }));
  const matrices = list<BlueprintContent['matrices'][number]>(input.matrices).map((m) => ({
    id: text(m.id) || createId(), name: text(m.name).trim() || 'Unnamed table', rows: m.rows, columns: m.columns,
    cells: Object.fromEntries(Object.entries(m.cells && typeof m.cells === 'object' ? m.cells : {}).filter(([, v]) => typeof v === 'string' && v.trim())),
  }));
  return { name: text(input.name).trim() || 'Untitled system', description: text(input.description), variables, tracks, ranks, groups, items, matrices };
}

/** A copy of a blueprint's content in which everything has a new id, with references inside it kept intact. */
export function instantiate(given: BlueprintContent): BlueprintContent {
  const content = upgradeShape(given);
  const ids = new Map<string, string>();
  const fresh = (old: string): string => ids.get(old) ?? (ids.set(old, createId()), ids.get(old)!);
  for (const item of content.items) fresh(item.id);
  for (const group of content.groups) fresh(group.id);
  return tidy({
    ...content,
    variables: content.variables.map((v) => ({ ...v, id: createId(), options: [...v.options] })),
    tracks: content.tracks.map((t) => ({ ...t, id: createId(), stages: t.stages.map((s) => ({ ...s, id: createId() })) })),
    ranks: content.ranks.map((r) => ({ ...r })),
    groups: content.groups.map((g) => ({ ...g, id: fresh(g.id) })),
    items: content.items.map((i) => ({ ...i, id: fresh(i.id), groupId: fresh(i.groupId), parentId: i.parentId ? fresh(i.parentId) : null, modifiers: i.modifiers.map((m) => ({ ...m, id: createId() })), costs: i.costs.map((c) => ({ ...c, id: createId() })) })),
    matrices: content.matrices.map((m) => ({ ...m, id: createId(), rows: m.rows.map((r) => ({ ...r })), columns: m.columns.map((c) => ({ ...c })), cells: { ...m.cells } })),
  });
}

export function createSystemsService(db: NovelDB, onProjectChanged: (projectId: string) => Promise<unknown>) {
  /** Every operation is bound to one project; ids from another project are treated as not found. */
  function forProject(projectId: string) {
    async function owned(systemId: string): Promise<SystemBlueprint> {
      const system = await db.systems.get(systemId);
      if (!system || system.projectId !== projectId) throw new SystemNotFoundError(systemId);
      return system;
    }
    async function ownedSheet(sheetId: string): Promise<SystemSheet> {
      const sheet = await db.systemSheets.get(sheetId);
      if (!sheet || sheet.projectId !== projectId) throw new Error('That sheet is not in this project.');
      return sheet;
    }
    const write = <T>(task: () => Promise<T>): Promise<T> =>
      db.transaction('rw', db.tables, async () => {
        const result = await task();
        await onProjectChanged(projectId);
        return result;
      });

    return {
      list: () => db.systems.where('projectId').equals(projectId).toArray(),

      async get(systemId: string): Promise<SystemBlueprint | undefined> {
        const system = await db.systems.get(systemId);
        return system?.projectId === projectId ? system : undefined;
      },

      /** Creates a blueprint: empty, or as a fresh copy of a preset or of any other blueprint's content. */
      create: (content: BlueprintContent = BLANK) =>
        write(async () => {
          const now = Date.now();
          const system: SystemBlueprint = { id: createId(), projectId, ...instantiate(content), createdAt: now, updatedAt: now };
          await db.systems.add(system);
          return system;
        }),

      /**
       * Changes a blueprint. The change is worked out from the blueprint as
       * it is stored right now, so quick edits in a row never overwrite one
       * another.
       */
      update: (systemId: string, change: (current: SystemBlueprint) => Partial<BlueprintContent>) =>
        write(async () => {
          const current = await owned(systemId);
          const next = tidy({ ...current, ...change(current) });
          // An item taken out of the blueprint takes its connections with it.
          const kept = new Set(next.items.map((i) => i.id));
          const gone = (current.items ?? []).map((i) => i.id).filter((id) => !kept.has(id));
          if (gone.length) await removeAbilityConnections(db, projectId, systemId, gone);
          await db.systems.update(systemId, { ...next, updatedAt: Date.now() });
        }),

      /** Deletes a blueprint and the sheets made from it. Codex entries are not changed. */
      remove: (systemId: string) =>
        write(async () => {
          await owned(systemId);
          await db.systemSheets.where('projectId').equals(projectId).filter((s) => s.systemId === systemId).delete();
          await removeAbilityConnections(db, projectId, systemId);
          await db.systems.delete(systemId);
        }),

      sheets: () => db.systemSheets.where('projectId').equals(projectId).toArray(),

      /** Puts a codex entry on a blueprint. An entry has one sheet per blueprint; asking again returns it. */
      addSheet: (systemId: string, entryId: string) =>
        write(async () => {
          await owned(systemId);
          const entry = await db.loreEntries.get(entryId);
          if (!entry || entry.projectId !== projectId) throw new Error('That codex entry is not in this project.');
          const existing = await db.systemSheets.where('projectId').equals(projectId).filter((s) => s.systemId === systemId && s.entryId === entryId).first();
          if (existing) return existing;
          const now = Date.now();
          const sheet: SystemSheet = { id: createId(), projectId, systemId, entryId, values: {}, progress: {}, itemIds: [], xp: [], spent: {}, note: '', createdAt: now, updatedAt: now };
          await db.systemSheets.add(sheet);
          return sheet;
        }),

      /**
       * Changes what is particular to one entry: its own numbers, where it
       * stands, and what it holds. Assigning a class or skill stores only
       * its id; what it brings is read from the blueprint. Experience and
       * placed points are kept as entered: nothing here checks that a
       * character "can afford" them.
       */
      updateSheet: (sheetId: string, change: (current: SystemSheet) => Partial<Pick<SystemSheet, 'values' | 'progress' | 'itemIds' | 'xp' | 'spent' | 'note'>>) =>
        write(async () => {
          const current = await ownedSheet(sheetId);
          const system = await owned(current.systemId);
          const next = { ...current, ...change(current) };
          const known = new Set(system.items.map((i) => i.id));
          let itemIds = [...new Set(list<string>(next.itemIds))].filter((id) => known.has(id));
          // A group that allows one at a time keeps the one chosen last.
          for (const group of system.groups.filter((g) => g.single)) {
            const inGroup = itemIds.filter((id) => system.items.find((i) => i.id === id)!.groupId === group.id);
            itemIds = itemIds.filter((id) => !inGroup.slice(0, -1).includes(id));
          }
          const values = Object.fromEntries(Object.entries(next.values ?? {}).filter(([id, v]) => system.variables.some((x) => x.id === id) && (typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v)))));
          const progress = Object.fromEntries(Object.entries(next.progress ?? {}).filter(([id]) => system.tracks.some((t) => t.id === id)));
          const levelled = new Set(system.tracks.filter((t) => t.kind === 'levels').map((t) => t.id));
          const xp: XpEntry[] = [];
          for (const e of list<XpEntry>(next.xp)) {
            if (!levelled.has(e.trackId) || typeof e.amount !== 'number' || !Number.isFinite(e.amount) || e.amount === 0) continue;
            const node = typeof e.nodeId === 'string' ? await db.chapters.get(e.nodeId) : undefined;
            xp.push({ id: text(e.id) || createId(), trackId: e.trackId, amount: e.amount, source: text(e.source).trim(), nodeId: node?.projectId === projectId ? node.id : null, note: text(e.note).trim() });
          }
          const spent = Object.fromEntries(Object.entries(next.spent ?? {}).filter(([id, n]) => system.variables.some((x) => x.id === id && takesPoints(x)) && typeof n === 'number' && Number.isFinite(n) && n !== 0));
          await db.systemSheets.update(sheetId, { values, progress, itemIds, xp, spent, note: text(next.note), updatedAt: Date.now() });
        }),

      removeSheet: (sheetId: string) =>
        write(async () => {
          await ownedSheet(sheetId);
          await db.systemSheets.delete(sheetId);
        }),
    };
  }

  return { forProject };
}

export type SystemsService = ReturnType<typeof createSystemsService>;
export type ProjectSystems = ReturnType<SystemsService['forProject']>;
