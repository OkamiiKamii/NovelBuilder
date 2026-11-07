import type { NovelDB } from '@/core/db';
import { createId } from '@/core/id';
import type { ProjectRegistry } from '@/core/projectRegistry';
import { storyOrder } from '@/modules/relationships/timeline';
import { settle } from '@/modules/systems/compute';
import { stateAt } from './state';
import { EMPTY_STATUS, STATUS_DIMENSIONS, type GearItem, type ProgressSnapshot, type SnapshotChanges, type SnapshotSystem } from './types';

export class SnapshotNotFoundError extends Error {
  constructor(id: string) {
    super(`Snapshot ${id} not found in this project`);
    this.name = 'SnapshotNotFoundError';
  }
}

/** Hooks snapshots into project isolation, duplication and backup. The character, chapter, systems and gear they point at are re-pointed at the copies. */
export function registerProgression(registry: ProjectRegistry): void {
  registry.registerCollection({
    table: 'progressSnapshots',
    refs: ['entryId', 'nodeId'],
    // Characters are inherited as they were at that point: snapshots from later chapters belong to the parent's future.
    fork: (rows, reached) => rows.filter((row) => row.nodeId === null || reached(row.nodeId)),
    remap: (row, mapId) => {
      const snapshot = row as unknown as ProgressSnapshot;
      return {
        ...row,
        systems: Object.fromEntries(Object.entries(snapshot.systems ?? {}).map(([systemId, state]) => [mapId(systemId), state])),
        gear: (snapshot.gear ?? []).map((item) => ({ ...item, entryId: item.entryId ? mapId(item.entryId) : null })),
      };
    },
  });
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const record = (value: unknown): Record<string, number | string> =>
  Object.fromEntries(Object.entries(value && typeof value === 'object' ? (value as Record<string, unknown>) : {}).filter((e): e is [string, number | string] => typeof e[1] === 'string' || (typeof e[1] === 'number' && Number.isFinite(e[1]))));

export function createProgressionService(db: NovelDB, onProjectChanged: (projectId: string) => Promise<unknown>) {
  /** Every operation is bound to one project; ids from another project are treated as not found. */
  function forProject(projectId: string) {
    async function owned(snapshotId: string): Promise<ProgressSnapshot> {
      const snapshot = await db.progressSnapshots.get(snapshotId);
      if (!snapshot || snapshot.projectId !== projectId) throw new SnapshotNotFoundError(snapshotId);
      return snapshot;
    }
    const write = <T>(task: () => Promise<T>): Promise<T> =>
      db.transaction('rw', db.tables, async () => {
        const result = await task();
        await onProjectChanged(projectId);
        return result;
      });
    const mine = async (table: 'loreEntries' | 'chapters' | 'systems', id: unknown): Promise<string | null> => {
      if (typeof id !== 'string' || !id) return null;
      const row = (await db.table(table).get(id)) as { projectId: string } | undefined;
      return row?.projectId === projectId ? id : null;
    };
    const all = () => db.progressSnapshots.where('projectId').equals(projectId).toArray();

    /** Keeps a snapshot well formed without judging its contents: any number or label the author enters is kept as entered. */
    async function clean(systems: unknown, gear: unknown, status: unknown) {
      const cleanSystems: Record<string, SnapshotSystem> = {};
      for (const [systemId, raw] of Object.entries(systems && typeof systems === 'object' ? (systems as Record<string, Partial<SnapshotSystem>>) : {})) {
        if (!(await mine('systems', systemId))) continue;
        cleanSystems[systemId] = { auto: raw.auto !== false, values: record(raw.values), progress: record(raw.progress), itemIds: [...new Set((Array.isArray(raw.itemIds) ? raw.itemIds : []).filter((id): id is string => typeof id === 'string'))], overrides: record(raw.overrides) };
      }
      const cleanGear: GearItem[] = [];
      for (const item of Array.isArray(gear) ? (gear as Partial<GearItem>[]) : []) {
        if (!text(item.name).trim()) continue;
        cleanGear.push({ id: text(item.id) || createId(), name: text(item.name).trim(), kind: text(item.kind).trim(), entryId: await mine('loreEntries', item.entryId), note: text(item.note) });
      }
      const given = status && typeof status === 'object' ? (status as Record<string, unknown>) : {};
      return { systems: cleanSystems, gear: cleanGear, status: Object.fromEntries(STATUS_DIMENSIONS.map((d) => [d, text(given[d])])) as ProgressSnapshot['status'] };
    }

    return {
      list: all,

      async get(snapshotId: string): Promise<ProgressSnapshot | undefined> {
        const snapshot = await db.progressSnapshots.get(snapshotId);
        return snapshot?.projectId === projectId ? snapshot : undefined;
      },

      /**
       * Logs a character's state at a chapter or scene (`nodeId` null: before
       * the story). It starts as a copy of the state valid at that point, so
       * only what changed needs entering; with nothing logged yet, it starts
       * from the character's system sheets.
       */
      create: (entryId: string, at: { nodeId?: string | null; label?: string } = {}) =>
        write(async () => {
          const entry = await mine('loreEntries', entryId);
          if (!entry) throw new Error('That codex entry is not in this project.');
          const nodeId = await mine('chapters', at.nodeId);
          const nodes = await db.chapters.where('projectId').equals(projectId).toArray();
          const previous = stateAt(await all(), nodes, entryId, nodeId);
          const sheets = (await db.systemSheets.where('projectId').equals(projectId).toArray()).filter((s) => s.entryId === entryId);
          // What each sheet says at this point: experience logged later in the story has not happened yet.
          const { position } = storyOrder(nodes);
          const limit = nodeId === null ? -1 : (position.get(nodeId) ?? Number.MAX_SAFE_INTEGER);
          const reached = (id: string | null) => id === null || (position.get(id) ?? Number.MAX_SAFE_INTEGER) <= limit;
          const blueprints = new Map((await db.systems.where('projectId').equals(projectId).toArray()).map((s) => [s.id, s]));
          const fromSheets: Record<string, SnapshotSystem> = {};
          for (const sheet of sheets) {
            const system = blueprints.get(sheet.systemId);
            if (!system) continue;
            const settled = settle(system, sheet, reached);
            const before = previous?.systems[sheet.systemId];
            // With an earlier snapshot, its numbers stand (the author may have set them by hand); only levels with experience logged move on.
            const levels = Object.fromEntries(system.tracks.filter((t) => t.kind === 'levels' && (sheet.xp ?? []).some((e) => e.trackId === t.id)).map((t) => [t.id, settled.progress[t.id]]));
            fromSheets[sheet.systemId] = before ? { ...structuredClone(before), progress: { ...before.progress, ...levels } } : { auto: true, ...settled, overrides: {} };
          }
          const now = Date.now();
          const snapshot: ProgressSnapshot = {
            id: createId(), projectId, entryId, nodeId, label: text(at.label).trim(),
            ...(await clean(
              // Systems the character has since been put on join in with their sheet as it stands.
              { ...(previous ? structuredClone(previous.systems) : {}), ...fromSheets },
              previous ? previous.gear.map((g) => ({ ...g, id: createId() })) : [],
              previous ? previous.status : EMPTY_STATUS,
            )),
            notes: '', createdAt: now, updatedAt: now,
          };
          await db.progressSnapshots.add(snapshot);
          return snapshot;
        }),

      /**
       * Changes one snapshot, worked out from it as stored right now. Other
       * snapshots are never touched: history is edited one point at a time.
       */
      update: (snapshotId: string, change: (current: ProgressSnapshot) => SnapshotChanges) =>
        write(async () => {
          const current = await owned(snapshotId);
          const next = { ...current, ...change(current) };
          await db.progressSnapshots.update(snapshotId, {
            nodeId: 'nodeId' in next && next.nodeId !== current.nodeId ? await mine('chapters', next.nodeId) : current.nodeId,
            label: text(next.label).trim(), notes: text(next.notes), ...(await clean(next.systems, next.gear, next.status)), updatedAt: Date.now(),
          });
        }),

      remove: (snapshotId: string) =>
        write(async () => {
          await owned(snapshotId);
          await db.progressSnapshots.delete(snapshotId);
        }),
    };
  }

  return { forProject };
}

export type ProgressionService = ReturnType<typeof createProgressionService>;
export type ProjectProgression = ReturnType<ProgressionService['forProject']>;
