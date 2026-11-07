import type { NovelDB } from '@/core/db';
import { createId } from '@/core/id';
import type { ProjectRegistry, Row } from '@/core/projectRegistry';
import {
  ACCENTS,
  PROJECT_STATUSES,
  SNAPSHOT_FORMAT,
  SNAPSHOT_VERSION,
  type Project,
  type ProjectInput,
  type NovelProject,
  type ProjectStats,
  type ProjectStatus,
} from './types';

export class ProjectNotFoundError extends Error {
  constructor(id: string) {
    super(`Project ${id} not found`);
    this.name = 'ProjectNotFoundError';
  }
}

export class InvalidSnapshotError extends Error {
  constructor(reason: string) {
    super(`Not a valid Novel Builder project file: ${reason}`);
    this.name = 'InvalidSnapshotError';
  }
}

/** A valid file that could not be written (a record the restore could not read, a full disk). Nothing of it is kept. */
export class RestoreFailedError extends Error {
  constructor(cause: unknown) {
    super(`The project could not be restored, and nothing was imported: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
    this.name = 'RestoreFailedError';
  }
}

const str = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value.trim() : fallback);

const list = (value: unknown): string[] =>
  Array.isArray(value) ? [...new Set(value.map((v) => str(v)).filter(Boolean))] : [];

const MAX_COVER_LENGTH = 2_000_000;
const COVER_PATTERN = /^(https?:\/\/\S+$|data:image\/(png|jpeg|webp|gif);base64,)/i;

export function normalizeCover(value: unknown): string | null {
  const cover = str(value);
  return cover && cover.length <= MAX_COVER_LENGTH && COVER_PATTERN.test(cover) ? cover : null;
}

type RawInput = Partial<Record<keyof ProjectInput, unknown>> & { /** pre-v2 files */ genre?: unknown };

/** Coerces untrusted input (forms, imported files) into valid editable fields. */
export function normalizeInput(input: RawInput): ProjectInput {
  const target = Number(input.targetWordCount);
  const deadline = str(input.deadline);
  const primaryGenre = str(input.primaryGenre) || str(input.genre);
  return {
    title: str(input.title) || 'Untitled project',
    subtitle: str(input.subtitle),
    author: str(input.author),
    primaryGenre,
    secondaryGenres: list(input.secondaryGenres).filter((g) => g.toLowerCase() !== primaryGenre.toLowerCase()),
    cover: normalizeCover(input.cover),
    tags: list(input.tags),
    synopsis: str(input.synopsis),
    status: PROJECT_STATUSES.includes(input.status as ProjectStatus) ? (input.status as ProjectStatus) : 'planning',
    targetWordCount: Number.isFinite(target) && target > 0 ? Math.round(target) : null,
    deadline: /^\d{4}-\d{2}-\d{2}$/.test(deadline) ? deadline : null,
    language: str(input.language) || 'en',
    accent: /^#[0-9a-f]{6}$/i.test(str(input.accent)) ? str(input.accent) : ACCENTS[0],
  };
}

export function emptyStats(projectId: string): ProjectStats {
  return { projectId, wordCount: 0, counts: {}, computedAt: 0 };
}

export function createProjectService(db: NovelDB, registry: ProjectRegistry) {
  /** Collections that travel with the book (everything except device-local working data). */
  const durable = () => registry.collections.filter((c) => !c.transient);
  /** What a snapshot carries: optional collections (version history) only when everything is asked for. */
  const carried = (everything: boolean) => durable().filter((c) => everything || !c.optional);
  const ownedRows = (table: string, projectId: string) => db.table<Row>(table).where('projectId').equals(projectId);

  async function require(id: string): Promise<Project> {
    const project = await db.projects.get(id);
    if (!project) throw new ProjectNotFoundError(id);
    return project;
  }

  async function patch(id: string, changes: Partial<Project>, touch = true): Promise<void> {
    const updated = await db.projects.update(id, touch ? { ...changes, updatedAt: Date.now() } : changes);
    if (!updated) throw new ProjectNotFoundError(id);
  }

  async function recomputeStats(projectId: string): Promise<ProjectStats> {
    const stats: ProjectStats = { ...emptyStats(projectId), computedAt: Date.now() };
    for (const contribute of registry.statsContributors) {
      const part = await contribute(db, projectId);
      stats.wordCount += part.wordCount ?? 0;
      for (const [key, n] of Object.entries(part.counts ?? {})) {
        stats.counts[key] = (stats.counts[key] ?? 0) + n;
      }
    }
    await db.projectStats.put(stats);
    return stats;
  }

  async function uniqueTitle(base: string): Promise<string> {
    const taken = new Set((await db.projects.toArray()).map((p) => p.title));
    if (!taken.has(base)) return base;
    for (let n = 2; ; n++) {
      const candidate = `${base} ${n}`;
      if (!taken.has(candidate)) return candidate;
    }
  }

  async function snapshot(id: string, options: { everything?: boolean } = {}): Promise<NovelProject> {
    return db.transaction('r', db.tables, async () => {
      const project = await require(id);
      const collections: NovelProject['collections'] = { chapters: [], characters: [], loreEntries: [], outlines: [] };
      for (const { table } of carried(options.everything ?? false)) {
        collections[table] = await ownedRows(table, id).toArray();
      }
      return { format: SNAPSHOT_FORMAT, version: SNAPSHOT_VERSION, exportedAt: Date.now(), project, collections };
    });
  }

  /**
   * Materialises a snapshot as a brand-new project. Every row gets a fresh id
   * and every reference is rewritten, so the result shares nothing with the
   * source. Duplicate and import are both built on this.
   */
  async function restoreMapped(source: NovelProject, overrides: Partial<ProjectInput> = {}): Promise<{ project: Project; idMap: Map<string, string> }> {
    const projectId = createId();
    // The new ids sort as the old ones did, so whatever is listed by id (records made in the same instant, rows as the
    // database returns them) comes back in the same order: a restored novel reads exactly as the one it was saved from.
    const binary = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
    const oldIds = [...new Set(durable().flatMap(({ table }) => (source.collections[table] ?? []).map((row) => row.id).filter((id): id is string => typeof id === 'string')))].sort(binary);
    const newIds = oldIds.map(() => createId()).sort(binary);
    const idMap = new Map(oldIds.map((id, i) => [id, newIds[i]]));
    // The project's own id, where a record holds it (a link to one of its pages), becomes the new project's.
    const mapId = (id: string) => (id === source.project.id ? projectId : (idMap.get(id) ?? id));
    const mapValue = (value: unknown): unknown =>
      typeof value === 'string' ? mapId(value) : Array.isArray(value) ? value.map(mapValue) : value;

    const now = Date.now();
    // Settings a newer version keeps on the project ride along unchanged; only the long-retired single `genre` is dropped (it became `primaryGenre`).
    const { genre: _retired, ...kept } = source.project as Project & { genre?: unknown };
    const project: Project = {
      ...kept,
      ...normalizeInput({ ...source.project, ...overrides }),
      id: projectId,
      pinned: false,
      archived: false,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: null,
    };

    await db.transaction('rw', db.tables, async () => {
      await db.projects.add(project);
      for (const collection of durable()) {
        const rows = (source.collections[collection.table] ?? []).map((original) => {
          let row: Row = { ...original, id: mapValue(original.id), projectId };
          for (const field of collection.refs ?? []) row[field] = mapValue(row[field]);
          if (collection.remap) row = collection.remap(row, mapId);
          return row;
        });
        if (rows.length) await db.table(collection.table).bulkAdd(rows);
      }
      await recomputeStats(projectId);
    });
    return { project, idMap };
  }
  const restore = async (source: NovelProject, overrides: Partial<ProjectInput> = {}): Promise<Project> => (await restoreMapped(source, overrides)).project;

  return {
    list: () => db.projects.toArray(),
    get: (id: string) => db.projects.get(id),
    allStats: () => db.projectStats.toArray(),
    getStats: async (id: string) => (await db.projectStats.get(id)) ?? emptyStats(id),
    recomputeStats,

    /** Called by content modules after a write: bumps "last edited" and refreshes stats. */
    async contentChanged(id: string): Promise<void> {
      await patch(id, {});
      await recomputeStats(id);
    },

    async create(input: Partial<ProjectInput>): Promise<Project> {
      const now = Date.now();
      const project: Project = {
        ...normalizeInput(input),
        id: createId(),
        pinned: false,
        archived: false,
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: null,
      };
      await db.transaction('rw', db.projects, db.projectStats, async () => {
        await db.projects.add(project);
        await db.projectStats.put(emptyStats(project.id));
      });
      return project;
    },

    async update(id: string, input: Partial<ProjectInput>): Promise<void> {
      const current = await require(id);
      await patch(id, normalizeInput({ ...current, ...input }));
    },

    setPinned: (id: string, pinned: boolean) => patch(id, { pinned }, false),
    setArchived: (id: string, archived: boolean) => patch(id, { archived, pinned: false }),
    markOpened: (id: string) => patch(id, { lastOpenedAt: Date.now() }, false),
    /** Which Visualize views the novel has turned off. Only this setting changes: no record of any view is touched. */
    setViewsOff: (id: string, keys: string[]) => patch(id, { viewsOff: [...new Set(keys.filter((k) => typeof k === 'string' && k.trim()))].sort() }),

    /** Deletes the project and every row it owns in any registered collection. */
    async remove(id: string): Promise<void> {
      await db.transaction('rw', db.tables, async () => {
        for (const { table } of registry.collections) await ownedRows(table, id).delete();
        await db.projectStats.delete(id);
        await db.projects.delete(id);
      });
    },

    async duplicate(id: string): Promise<Project> {
      const source = await snapshot(id);
      return restore(source, { title: await uniqueTitle(`${source.project.title} (Copy)`) });
    },

    /**
     * Starts a new project from this one as it stood at a point in the
     * story. `reached` holds the ids of the manuscript nodes at or before
     * that point; each collection decides what that means for its own rows
     * (see `ProjectCollection.fork`). The result is a separate project
     * that shares nothing with this one: the same isolation every project
     * has. Returns the map from this project's row ids to the new ones.
     */
    async fork(id: string, reached: ReadonlySet<string>, overrides: Partial<ProjectInput> = {}): Promise<{ project: Project; idMap: Map<string, string> }> {
      const source = await snapshot(id);
      const test = (nodeId: unknown): boolean => typeof nodeId === 'string' && reached.has(nodeId);
      const collections = { ...source.collections };
      for (const collection of durable()) {
        if (collection.fork && collections[collection.table]) collections[collection.table] = collection.fork(collections[collection.table], test) as never;
      }
      return restoreMapped({ ...source, collections }, { ...overrides, title: await uniqueTitle(normalizeInput({ ...source.project, ...overrides }).title) });
    },

    /**
     * The project as one JSON-serialisable document. With `everything`, it is
     * the complete archive: all text, drafts, plans, lore, goals, session logs
     * and version history, in documented, readable records.
     */
    exportSnapshot: snapshot,

    async importSnapshot(data: unknown): Promise<Project> {
      const candidate = data as Partial<NovelProject> | null;
      if (!candidate || typeof candidate !== 'object') throw new InvalidSnapshotError('file is not a JSON object');
      if (candidate.format !== SNAPSHOT_FORMAT) throw new InvalidSnapshotError('unrecognised format');
      if (typeof candidate.version !== 'number' || candidate.version > SNAPSHOT_VERSION) {
        throw new InvalidSnapshotError('it was created by a newer version of the app');
      }
      if (!candidate.project || typeof candidate.project !== 'object') throw new InvalidSnapshotError('missing project');

      const raw = candidate.collections && typeof candidate.collections === 'object' ? candidate.collections : {};
      // Records this version has nowhere to keep are not dropped quietly: the file is refused and says what they are.
      const known = new Set(durable().map((c) => c.table));
      const unknown = Object.entries(raw as Record<string, unknown>).filter(([table, rows]) => !known.has(table) && Array.isArray(rows) && rows.length > 0).map(([table, rows]) => `${table} (${(rows as unknown[]).length})`);
      if (unknown.length) throw new InvalidSnapshotError(`it holds records this version of the app cannot keep: ${unknown.join(', ')}. Nothing was imported`);
      // Nor are records it cannot store: one without an id, or two with the same id, stops the import before anything is written.
      const collections: Record<string, Row[]> = {};
      const unreadable: string[] = [];
      for (const { table } of durable()) {
        const rows = (raw as Record<string, unknown>)[table];
        if (rows !== undefined && !Array.isArray(rows)) throw new InvalidSnapshotError(`its ${table} are not a list. Nothing was imported`);
        const list = (rows ?? []) as unknown[];
        const readable = list.filter((r): r is Row => Boolean(r) && typeof r === 'object' && typeof (r as Row).id === 'string');
        if (readable.length < list.length) unreadable.push(`${list.length - readable.length} ${list.length - readable.length === 1 ? 'record' : 'records'} in ${table}`);
        const seen = new Set<string>();
        for (const row of readable) {
          if (seen.has(row.id as string)) throw new InvalidSnapshotError(`two records in ${table} share the id ${row.id}. Nothing was imported`);
          seen.add(row.id as string);
        }
        collections[table] = readable;
      }
      if (unreadable.length) throw new InvalidSnapshotError(`${unreadable.join(', ')} cannot be read (no id, or not a record). Nothing was imported`);
      const title = await uniqueTitle(normalizeInput(candidate.project).title);
      try {
        return await restore({ ...(candidate as NovelProject), collections: collections as NovelProject['collections'] }, { title });
      } catch (error) {
        // The restore is one transaction: whatever stopped it, none of it was kept.
        throw new RestoreFailedError(error);
      }
    },
  };
}

export type ProjectService = ReturnType<typeof createProjectService>;
