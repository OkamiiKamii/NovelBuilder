export const PROJECT_STATUSES = ['planning', 'drafting', 'revising', 'complete', 'on-hold'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  planning: 'Planning',
  drafting: 'Drafting',
  revising: 'Revising',
  complete: 'Complete',
  'on-hold': 'On hold',
};

export const ACCENTS = ['#b4532a', '#8a6d1f', '#3f7d4e', '#2b7a8c', '#3d5fa8', '#7a4fa3', '#a8436b', '#5c6370'] as const;

export const GENRE_SUGGESTIONS = [
  'Fantasy', 'Sci-Fi', 'LitRPG', 'Action', 'Adventure', 'Progression Fantasy', 'Cultivation', 'Romance',
  'Mystery', 'Thriller', 'Horror', 'Historical', 'Slice of Life', 'Comedy', 'Drama', 'Dystopian',
] as const;

/** Project metadata record: one row per novel, keyed by `id` (the project id). */
export interface Project {
  id: string;
  title: string;
  subtitle: string;
  author: string;
  primaryGenre: string;
  secondaryGenres: string[];
  /** An http(s) image URL, or an uploaded image stored as a data URL. */
  cover: string | null;
  tags: string[];
  synopsis: string;
  status: ProjectStatus;
  targetWordCount: number | null;
  /** ISO date (yyyy-mm-dd) */
  deadline: string | null;
  language: string;
  accent: string;
  pinned: boolean;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number | null;
  /**
   * The Visualize views this novel has turned off, by key (Optional Prompt D). Absent or empty: every view is on.
   * Only the views are hidden; no record of theirs is touched. A key this version does not know is kept as it is.
   */
  viewsOff?: string[];
}

/** The fields a user edits. Everything else is managed by the service. */
export type ProjectInput = Pick<
  Project,
  'title' | 'subtitle' | 'author' | 'primaryGenre' | 'secondaryGenres' | 'cover' | 'tags' | 'synopsis' | 'status' | 'targetWordCount' | 'deadline' | 'language' | 'accent'
>;

export interface ProjectStats {
  projectId: string;
  wordCount: number;
  /** Open-ended so each phase can report its own totals: chapters, scenes, characters... */
  counts: Record<string, number>;
  computedAt: number;
}

export const SNAPSHOT_FORMAT = 'novel-builder/project';
/**
 * The version of the project file format. A file is refused, with a reason,
 * by any version of the app older than the file; files from older versions
 * are read and brought up to date on the way in.
 *  3  every collection in the project registry
 *  4  ranks and table rows of system blueprints carry ids (items point at
 *     `rankId`); stored connections may be typed, join any records and say
 *     when they hold; events may have an end, threads, status, canon and how
 *     each chapter tells them. Older files read as before.
 */
export const SNAPSHOT_VERSION = 4;

/**
 * Collection names reserved for later phases. A phase that adds one of these
 * creates a Dexie table with the same name and registers it in the project
 * registry; until then it serialises as an empty array.
 */
export const RESERVED_COLLECTIONS = ['chapters', 'characters', 'loreEntries', 'outlines'] as const;
export type ReservedCollection = (typeof RESERVED_COLLECTIONS)[number];

export type ProjectRow = Record<string, unknown>;

/**
 * A whole novel as one JSON-serialisable document: its metadata plus every
 * row it owns, grouped by collection. This is the unit of export, import and
 * duplication. In the database the rows live in per-collection tables scoped
 * by `projectId` rather than nested in the project record, so opening a
 * project never loads the entire manuscript.
 */
export interface NovelProject {
  format: typeof SNAPSHOT_FORMAT;
  version: number;
  exportedAt: number;
  project: Project;
  collections: Record<ReservedCollection, ProjectRow[]> & Record<string, ProjectRow[]>;
}
