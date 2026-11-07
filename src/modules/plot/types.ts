export const THREAD_CATEGORIES = ['main', 'subplot', 'character-arc', 'mystery', 'romance', 'conflict', 'foreshadowing', 'political', 'worldbuilding', 'villain', 'personal-goal', 'custom'] as const;
export type ThreadCategory = (typeof THREAD_CATEGORIES)[number];
export const CATEGORY_LABELS: Record<ThreadCategory, string> = {
  main: 'Main Plot',
  subplot: 'Subplot',
  'character-arc': 'Character Arc',
  mystery: 'Mystery',
  romance: 'Romance',
  conflict: 'Conflict',
  foreshadowing: 'Foreshadowing',
  political: 'Political Storyline',
  worldbuilding: 'Worldbuilding Storyline',
  villain: 'Villain Storyline',
  'personal-goal': 'Personal Goal',
  custom: 'Custom',
};

/** `custom` is the author's own status, named in `customStatus`. */
export const THREAD_STATUSES = ['planned', 'active', 'paused', 'resolved', 'abandoned', 'retconned', 'custom'] as const;
export type ThreadStatus = (typeof THREAD_STATUSES)[number];
export const STATUS_LABELS: Record<ThreadStatus, string> = { planned: 'Planned', active: 'Active', paused: 'Paused', resolved: 'Resolved', abandoned: 'Abandoned', retconned: 'Retconned', custom: 'Custom' };
/** The order statuses are shown in on the dashboard: what is in play first. */
export const STATUS_ORDER: ThreadStatus[] = ['active', 'paused', 'planned', 'resolved', 'abandoned', 'retconned', 'custom'];
/** Threads the story still owes the reader something on. A custom status is the author's own, so nothing is assumed about it. */
export const OPEN_STATUSES: ThreadStatus[] = ['planned', 'active', 'paused'];

/**
 * What a beat is to its thread, as the author records it: where it is
 * introduced, develops, crosses another thread or is resolved; or only that
 * it appears in a scene, with no development recorded. A beat stored before
 * roles existed is a development, as every beat was then.
 */
export const BEAT_ROLES = ['introduction', 'development', 'intersection', 'resolution', 'appears'] as const;
export type BeatRole = (typeof BEAT_ROLES)[number];
export const BEAT_ROLE_LABELS: Record<BeatRole, string> = { introduction: 'Introduction', development: 'Development', intersection: 'Intersection', resolution: 'Resolution', appears: 'Appears (no development)' };
export const roleOf = (beat: Pick<ThreadBeat, 'role'>): BeatRole => beat.role ?? 'development';

/** One development of a thread: what happens to it, and the chapter or scene where it happens. */
export interface ThreadBeat {
  id: string;
  /** Missing on beats made before roles: a development. */
  role?: BeatRole;
  /** For an intersection: the other threads it crosses here, by id. */
  withThreadIds?: string[];
  /** A chapter or scene, by its stable id. Null while the author has not placed it yet. */
  nodeId: string | null;
  title: string;
  note: string;
  createdAt: number;
}

/**
 * A storyline followed across the manuscript. It points at chapters, scenes
 * and codex entries by id only, and never holds or changes manuscript text.
 *
 * NON-INVASIVE DIAGNOSTIC RULE
 * `status` is only ever set by the author. The diagnostics in
 * `diagnostics.ts` read threads and the manuscript's shape and return
 * observations; nothing in this module writes a status, a beat or any other
 * field on the author's behalf.
 */
export interface PlotThread {
  id: string;
  projectId: string;
  title: string;
  /** Primary objective or premise: the question or promise this thread makes. */
  premise: string;
  category: ThreadCategory;
  /** The author's own name for the category, when it is `custom`. */
  customCategory: string;
  status: ThreadStatus;
  /** The author's own name for the status, when it is `custom`. Missing on older rows. */
  customStatus?: string;
  /** Character entries in the codex. */
  characterIds: string[];
  /** Location entries in the codex. */
  locationIds: string[];
  /** Where the thread is meant to resolve: a volume, act, arc, chapter or scene. */
  targetNodeId: string | null;
  /** The same in the author's words ("the midpoint", "book two"), for stories not outlined that far yet. */
  targetNote: string;
  /** Developments, in the order they were added. Shown in reading order. */
  beats: ThreadBeat[];
  notes: string;
  /** The author has said this thread should not be flagged (it is meant to lie quiet). */
  muted: boolean;
  createdAt: number;
  updatedAt: number;
}

export type ThreadChanges = Partial<Pick<PlotThread, 'title' | 'premise' | 'category' | 'customCategory' | 'status' | 'customStatus' | 'characterIds' | 'locationIds' | 'targetNodeId' | 'targetNote' | 'notes' | 'muted'>>;
export type BeatChanges = Partial<Pick<ThreadBeat, 'nodeId' | 'title' | 'note' | 'role' | 'withThreadIds'>>;

/** A thread's status in words: the author's own name for a custom one. */
export const statusName = (thread: Pick<PlotThread, 'status' | 'customStatus'>): string => (thread.status === 'custom' && thread.customStatus?.trim() ? thread.customStatus.trim() : STATUS_LABELS[thread.status]);

export const categoryName = (thread: Pick<PlotThread, 'category' | 'customCategory'>): string =>
  thread.category === 'custom' && thread.customCategory.trim() ? thread.customCategory.trim() : CATEGORY_LABELS[thread.category];

/** How many chapters an active thread may go without a development before it is flagged. */
export const DEFAULT_QUIET_AFTER = 20;
export const QUIET_CHOICES = [5, 10, 15, 20, 30, 50];
