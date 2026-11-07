import type { NovelDB } from './db';

export type IdMapper = (id: string) => string;
export type Row = Record<string, unknown>;

export interface ProjectCollection {
  /** Dexie table name. Needs `id` primary key and an indexed `projectId`. */
  table: string;
  /**
   * Fields holding the id (or an array of ids) of another project-owned row,
   * e.g. `parentId`. They are rewritten when a project is copied or imported.
   */
  refs?: string[];
  /**
   * Working data that belongs to this device rather than to the book (crash
   * drafts, version history). Deleted with the project, but left out of
   * duplicates and backup files.
   */
  transient?: boolean;
  /**
   * Part of the author's record but bulky (version history). Left out of
   * project copies; included when the whole project is exported as an archive,
   * and restored from one.
   */
  optional?: boolean;
  /** Escape hatch for ids embedded elsewhere (rich-text links, nested JSON). */
  remap?: (row: Row, mapId: IdMapper) => Row;
  /**
   * What of this collection exists at a point in the story, for forking a
   * timeline there. Given the project's rows and a test for whether a
   * chapter, scene or other manuscript node is at or before that point, it
   * returns the rows the new timeline starts with: later chapters and
   * anything that only happens in them left out. Collections that do not
   * depend on the manuscript's order (the codex, system blueprints) need no
   * hook and are inherited whole.
   */
  fork?: (rows: Row[], reached: Reached) => Row[];
}

/** Whether a manuscript node (by id) is at or before the fork point. False for anything that is not a known node id. */
export type Reached = (nodeId: unknown) => boolean;

export interface StatsContribution {
  wordCount?: number;
  counts?: Record<string, number>;
}

export type StatsContributor = (db: NovelDB, projectId: string) => Promise<StatsContribution>;

export interface ProjectRegistry {
  readonly collections: readonly ProjectCollection[];
  readonly statsContributors: readonly StatsContributor[];
  registerCollection(collection: ProjectCollection): void;
  registerStats(contributor: StatsContributor): void;
}

export function createProjectRegistry(): ProjectRegistry {
  const collections: ProjectCollection[] = [];
  const statsContributors: StatsContributor[] = [];
  return {
    collections,
    statsContributors,
    registerCollection(collection) {
      if (collections.some((c) => c.table === collection.table)) {
        throw new Error(`Project collection "${collection.table}" is already registered`);
      }
      collections.push(collection);
    },
    registerStats(contributor) {
      statsContributors.push(contributor);
    },
  };
}
