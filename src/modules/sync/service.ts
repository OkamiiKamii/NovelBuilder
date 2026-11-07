import type { NovelDB } from '@/core/db';
import { createId } from '@/core/id';
import type { ProjectRegistry } from '@/core/projectRegistry';
import { mentionsIn } from '@/modules/manuscript/editor/references';
import { measure } from '@/modules/manuscript/metrics';
import type { ManuscriptService } from '@/modules/manuscript/service';
import type { DocJSON } from '@/modules/manuscript/types';
import type { ProjectService } from '@/modules/projects/service';
import { SNAPSHOT_FORMAT, SNAPSHOT_VERSION } from '@/modules/projects/types';
import { docBlocks } from '@/modules/search/extract';
import { countPending, idOf, resolveConflict, syncOnce, tableOf, type Device, type ProjectStore, type Resolution, type Transport } from './engine';
import type { BaseEntry, Row, SyncConflict, SyncLogEntry, SyncState, SyncSummary } from './types';

/** Device-local bookkeeping. It goes when the project goes, and is never copied, backed up or itself synced. */
export function registerSync(registry: ProjectRegistry): void {
  for (const table of ['syncState', 'syncBase', 'syncConflicts', 'syncLog']) registry.registerCollection({ table, transient: true });
}

/** Where settings that live outside the database are read from and written to. */
export interface SettingsAdapter {
  read(projectId: string): Map<string, string>;
  write(key: string, value: string | null): void;
}
export const NO_SETTINGS: SettingsAdapter = { read: () => new Map(), write: () => {} };

const SETTING_NAMES: [RegExp, string][] = [[/writing-prefs/, 'The editor’s appearance'], [/studio:layout/, 'The workspace layout'], [/studio:shortcuts$/, 'The keyboard shortcuts'], [/studio:session/, 'The active workspace'], [/scratch/, 'The project’s notes']];
const TABLE_NAMES: Record<string, string> = {
  projects: 'Project details', savedViews: 'Saved view', chapters: 'Chapter', chapterPlans: 'Plan', chapterBranches: 'Alternate draft', chapterRevisions: 'An earlier version', loreEntries: 'Codex entry', loreLinks: 'A link between entries', loreSchemas: 'Codex category',
  writingSessions: 'A writing session', goals: 'Goal', characterRelations: 'Relationship', relationSettings: 'Relationship types and attributes', timelineEvents: 'Event', storyCalendars: 'The story calendar', alternateHistories: 'An alternate history', plotThreads: 'Plot thread', canonFacts: 'Canon fact', continuityRules: 'Tracked rule', continuityResolutions: 'A continuity decision',
  systems: 'System', systemSheets: 'A system sheet', progressSnapshots: 'Progression snapshot', progressCategories: 'What is tracked about progression', progressChanges: 'A progression change', placeSettings: 'The levels of place', worldMaps: 'A map', mapPins: 'A place on a map', journeys: 'A journey', travelSettings: 'The travel methods', projectModules: 'Module', moduleRecords: 'A module record', brainstorms: 'Brainstorm', ideas: 'Idea', timelines: 'Timeline status',
};

/** Runs a task that writes what the cloud sent, rather than what the person at this device did: it is neither checked against their role nor recorded as their doing. */
type Unchecked = <T>(projectId: string, task: () => Promise<T>) => Promise<T>;

export function createSyncService(db: NovelDB, registry: ProjectRegistry, projects: ProjectService, manuscript: ManuscriptService, settings: SettingsAdapter = NO_SETTINGS, unchecked: Unchecked = (_projectId, task) => task()) {
  /** The tables that make up a project: everything that travels with the book, including its version history. */
  const tables = () => registry.collections.filter((c) => !c.transient).map((c) => c.table);
  const running = new Map<string, Promise<SyncSummary>>();
  // Keeps entries written in the same millisecond in the order they happened.
  let logged = 0;

  function store(projectId: string): ProjectStore {
    const titles = new Map<string, string>();
    const defaults = (): SyncState => ({ id: projectId, projectId, enabled: false, cursor: 0, lastSyncAt: null, lastError: null, pending: 0, syncing: false });
    return {
      projectId,
      newId: createId,

      async readLocal() {
        const rows = new Map<string, Row>();
        const project = await db.projects.get(projectId);
        if (!project) return rows;
        rows.set(`projects:${projectId}`, project as unknown as Row);
        for (const table of tables()) for (const row of await db.table<Row>(table).where('projectId').equals(projectId).toArray()) rows.set(`${table}:${row.id as string}`, row);
        const lineage = await db.timelines.get(projectId);
        if (lineage) rows.set(`timelines:${projectId}`, lineage as unknown as Row);
        for (const [key, value] of settings.read(projectId)) rows.set(`settings:${key}`, { id: key, value });
        titles.clear();
        for (const [key, row] of rows) if (tableOf(key) === 'chapters') titles.set(row.id as string, String(row.title ?? ''));
        return rows;
      },

      async apply(changes) {
        const known = new Set(tables());
        const touched = new Set<string>();
        await unchecked(projectId, () => db.transaction('rw', db.tables, async () => {
          for (const { key, row } of changes) {
            const [table, id] = [tableOf(key), idOf(key)];
            if (table === 'settings') continue;
            if (table === 'projects') {
              // Another device never deletes a project here, and what is this device's own stays its own.
              if (row && id === projectId) {
                const mine = await db.projects.get(projectId);
                await db.projects.put({ ...(row as never as NonNullable<typeof mine>), id: projectId, lastOpenedAt: mine?.lastOpenedAt ?? null });
              }
            } else if (table === 'timelines') {
              if (id !== projectId) continue;
              if (row) await db.timelines.put(row as never);
              else await db.timelines.delete(id);
            } else if (known.has(table)) {
              // Only rows that say they belong to this project are ever written.
              if (row && row.projectId !== projectId) continue;
              if (!row) {
                const mine = await db.table<Row>(table).get(id);
                if (mine?.projectId === projectId) await db.table(table).delete(id);
              } else if (table === 'chapterContents') {
                // The save counter moves on, so an editor that has this chapter open sees that the text changed under it.
                const mine = await db.chapterContents.get(id);
                await db.chapterContents.put({ ...(row as never as NonNullable<typeof mine>), rev: (mine?.rev ?? 0) + 1, savedAt: Date.now() });
              } else await db.table(table).put(row);
              if (table === 'chapters' || table === 'chapterContents') touched.add(id);
            }
          }
          // Word counts and link lists are worked out here from the text this device now has.
          for (const nodeId of touched) {
            const [node, content] = [await db.chapters.get(nodeId), await db.chapterContents.get(nodeId)];
            if (!node || node.projectId !== projectId) continue;
            const metrics = measure(docBlocks(content?.doc ?? null).map((b) => b.text));
            await db.chapters.update(nodeId, content ? { wordCount: metrics.words, charCount: metrics.characters, mentions: mentionsIn(content.doc) } : { wordCount: 0, charCount: 0, mentions: [] });
          }
          if (await db.projects.get(projectId)) await projects.recomputeStats(projectId);
        }));
        for (const { key, row } of changes) if (tableOf(key) === 'settings') settings.write(idOf(key), row ? String(row.value ?? '') : null);
      },

      async readBase() {
        return new Map((await db.syncBase.where('projectId').equals(projectId).toArray()).map((entry) => [entry.key, entry]));
      },
      async writeBase(entries) {
        await db.syncBase.bulkPut(entries.map((entry): BaseEntry => ({ id: `${projectId}|${entry.key}`, projectId, ...entry })));
      },
      conflicts: () => db.syncConflicts.where('projectId').equals(projectId).toArray(),
      async putConflict(conflict) {
        await db.syncConflicts.put(conflict);
      },
      async removeConflict(id) {
        await db.syncConflicts.delete(id);
      },
      async state() {
        return (await db.syncState.get(projectId)) ?? defaults();
      },
      async setState(changes) {
        await db.syncState.put({ ...((await db.syncState.get(projectId)) ?? defaults()), ...changes });
      },
      async log(entry) {
        await db.syncLog.add({ id: createId(), projectId, at: Date.now(), seq: ++logged, ...entry });
      },
      label(key, row) {
        const [table, id] = [tableOf(key), idOf(key)];
        if (table === 'settings') return SETTING_NAMES.find(([pattern]) => pattern.test(id))?.[1] ?? 'A setting';
        if (table === 'chapterContents') return `The text of ${titles.get(id) ?? 'a chapter'}`;
        const name = [row?.title, row?.name, row?.subject, row?.label].find((value) => typeof value === 'string' && value.trim());
        return name ? `${TABLE_NAMES[table] ?? 'Item'}: ${name as string}` : (TABLE_NAMES[table] ?? 'An item');
      },
    };
  }

  return {
    store,
    state: (projectId: string) => store(projectId).state(),
    conflicts: (projectId: string) => db.syncConflicts.where('projectId').equals(projectId).toArray(),
    /** The history of syncs for a project, oldest first. */
    log: async (projectId: string): Promise<SyncLogEntry[]> => (await db.syncLog.where('projectId').equals(projectId).toArray()).sort((a, b) => a.at - b.at || a.seq - b.seq),
    /** Projects on this device that are set to sync. */
    enabled: async (): Promise<string[]> => (await db.syncState.toArray()).filter((s) => s.enabled).map((s) => s.projectId),

    enable: (projectId: string) => store(projectId).setState({ enabled: true, lastError: null }),
    /** Stops syncing this project on this device. Nothing is deleted here or in the cloud. */
    disable: (projectId: string) => store(projectId).setState({ enabled: false, syncing: false }),

    /** How many local changes are waiting, worked out now and remembered for the status line. */
    async pending(projectId: string): Promise<number> {
      const s = store(projectId);
      const pending = await countPending(s);
      if ((await s.state()).pending !== pending) await s.setState({ pending });
      return pending;
    },

    /**
     * Syncs one project now. If a sync of it is already under way, that one
     * is waited for instead of starting another. A failure (no connection, a
     * refused key) is recorded and reported; local data is never affected.
     */
    syncNow(projectId: string, transport: Transport, device: Device): Promise<SyncSummary> {
      const existing = running.get(projectId);
      if (existing) return existing;
      const s = store(projectId);
      const run = (async () => {
        await s.setState({ syncing: true });
        try {
          return await syncOnce(s, transport, device);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Sync failed.';
          await s.setState({ lastError: message, pending: await countPending(s).catch(() => 0) });
          throw err;
        } finally {
          await s.setState({ syncing: false });
          running.delete(projectId);
        }
      })();
      running.set(projectId, run);
      return run;
    },

    /**
     * Settles a conflict as the author chose. When that replaces text on
     * this device, the text being replaced goes into the chapter's version
     * history first, so it can still be read and brought back.
     */
    resolve: (projectId: string, conflictId: string, resolution: Resolution) =>
      resolveConflict(store(projectId), conflictId, resolution, async (conflict: SyncConflict) => {
        if (conflict.table !== 'chapterContents' || !conflict.local) return;
        const doc = conflict.local.doc as DocJSON;
        await manuscript.forProject(projectId).keepInHistory(conflict.rowId, doc, measure(docBlocks(doc).map((b) => b.text)), 'conflict', 'This device’s version, before a sync conflict was settled').catch(() => {});
      }),

    /**
     * Brings a cloud backup back as a new project beside the existing one.
     * Nothing on this device is replaced: the author compares and keeps what
     * they want.
     */
    async restoreBackup(state: Record<string, Row>, when: number) {
      const project = Object.entries(state).find(([key]) => tableOf(key) === 'projects')?.[1];
      if (!project) throw new Error('That backup has no project in it.');
      const collections: Record<string, Row[]> = {};
      for (const [key, row] of Object.entries(state)) {
        const table = tableOf(key);
        if (table !== 'projects' && table !== 'settings' && table !== 'timelines') (collections[table] ??= []).push(row);
      }
      const title = `${String(project.title ?? 'Untitled')} (cloud backup of ${new Date(when).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })})`;
      return projects.importSnapshot({ format: SNAPSHOT_FORMAT, version: SNAPSHOT_VERSION, exportedAt: when, project: { ...project, title }, collections });
    },
  };
}

export type SyncService = ReturnType<typeof createSyncService>;
