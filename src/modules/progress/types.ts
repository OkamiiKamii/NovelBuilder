/**
 * One stretch of writing on one calendar day. Every save of manuscript text
 * is logged against the current session; a pause longer than the session gap,
 * or a new day, starts another. Words can go down as well as up: cutting and
 * revising are writing too, so a session with a negative total is still a
 * session.
 */
export interface WritingSession {
  id: string;
  projectId: string;
  /** Local calendar day, `yyyy-mm-dd`. */
  day: string;
  startedAt: number;
  lastActiveAt: number;
  /** Words added minus words removed. */
  netWords: number;
  added: number;
  removed: number;
  saves: number;
}

export const GOAL_KINDS = ['daily', 'weekly', 'deadline', 'task'] as const;
export type GoalKind = (typeof GOAL_KINDS)[number];

export const TASK_CATEGORIES = ['planning', 'worldbuilding', 'editing', 'other'] as const;
export type TaskCategory = (typeof TASK_CATEGORIES)[number];
export const TASK_LABELS: Record<TaskCategory, string> = { planning: 'Planning', worldbuilding: 'Worldbuilding', editing: 'Editing', other: 'Other' };

/**
 * A goal the author has set. `daily` and `weekly` are word targets (at most
 * one of each per project); `deadline` is a date, optionally with a word
 * target for the whole manuscript or one part of it; `task` is a milestone
 * that has nothing to do with word counts.
 */
export interface Goal {
  id: string;
  projectId: string;
  kind: GoalKind;
  title: string;
  targetWords: number | null;
  /** `yyyy-mm-dd` */
  dueDate: string | null;
  /** For a deadline: the volume, arc or chapter it covers; null means the whole manuscript. */
  nodeId: string | null;
  category: TaskCategory | null;
  done: boolean;
  doneAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export type GoalInput = Partial<Pick<Goal, 'title' | 'targetWords' | 'dueDate' | 'nodeId' | 'category'>>;
