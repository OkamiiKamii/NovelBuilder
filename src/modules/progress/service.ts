import type { NovelDB } from '@/core/db';
import { createId } from '@/core/id';
import type { ProjectRegistry } from '@/core/projectRegistry';
import { dayKey } from './time';
import { GOAL_KINDS, TASK_CATEGORIES, type Goal, type GoalInput, type GoalKind, type TaskCategory, type WritingSession } from './types';

/** A pause this long ends a writing session. */
export const SESSION_GAP = 30 * 60_000;

export class GoalNotFoundError extends Error {
  constructor(id: string) {
    super(`Goal ${id} not found in this project`);
    this.name = 'GoalNotFoundError';
  }
}

/** Session logs and goals belong to the book: they are copied and backed up with it. */
export function registerProgress(registry: ProjectRegistry): void {
  // A new timeline starts its own writing log: the sessions that built the parent stay with the parent.
  registry.registerCollection({ table: 'writingSessions', fork: () => [] });
  registry.registerCollection({ table: 'goals', refs: ['nodeId'], fork: (rows, reached) => rows.filter((row) => !row.nodeId || reached(row.nodeId)) });
}

const words = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};
const date = (value: unknown): string | null => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);

export function createProgressService(db: NovelDB) {
  /**
   * Logs a save of manuscript text. Called by the manuscript service inside
   * its own save transaction, so the text and its log entry commit together.
   * `delta` is the change in word count that save made (negative when words
   * were cut; zero for a pure rewording, which still counts as time spent).
   */
  async function recordWriting(projectId: string, delta: number, now = Date.now()): Promise<void> {
    const day = dayKey(now);
    const todays = await db.writingSessions.where('[projectId+day]').equals([projectId, day]).toArray();
    const last = todays.sort((a, b) => a.lastActiveAt - b.lastActiveAt).at(-1);
    const change = { netWords: delta, added: Math.max(0, delta), removed: Math.max(0, -delta) };
    if (last && now - last.lastActiveAt < SESSION_GAP) {
      await db.writingSessions.update(last.id, {
        lastActiveAt: now,
        netWords: last.netWords + change.netWords,
        added: last.added + change.added,
        removed: last.removed + change.removed,
        saves: last.saves + 1,
      });
    } else {
      const session: WritingSession = { id: createId(), projectId, day, startedAt: now, lastActiveAt: now, ...change, saves: 1 };
      await db.writingSessions.add(session);
    }
  }

  /** Every operation is bound to one project. */
  function forProject(projectId: string) {
    async function owned(goalId: string): Promise<Goal> {
      const goal = await db.goals.get(goalId);
      if (!goal || goal.projectId !== projectId) throw new GoalNotFoundError(goalId);
      return goal;
    }

    const clean = (kind: GoalKind, input: GoalInput, base?: Goal) => ({
      title: input.title !== undefined ? input.title.trim() : (base?.title ?? ''),
      targetWords: input.targetWords !== undefined ? words(input.targetWords) : (base?.targetWords ?? null),
      dueDate: input.dueDate !== undefined ? date(input.dueDate) : (base?.dueDate ?? null),
      nodeId: kind === 'deadline' ? (input.nodeId !== undefined ? input.nodeId || null : (base?.nodeId ?? null)) : null,
      category: kind === 'task' ? (TASK_CATEGORIES.includes(input.category as TaskCategory) ? (input.category as TaskCategory) : (base?.category ?? 'other')) : null,
    });

    return {
      sessions: () => db.writingSessions.where('projectId').equals(projectId).toArray(),
      goals: () => db.goals.where('projectId').equals(projectId).toArray(),

      /** Net words logged today, for the editor's status bar. */
      async todayWords(now = Date.now()): Promise<number> {
        const sessions = await db.writingSessions.where('[projectId+day]').equals([projectId, dayKey(now)]).toArray();
        return sessions.reduce((n, s) => n + s.netWords, 0);
      },

      /** Sets the daily or weekly word target. A blank or zero target removes it. */
      async setTarget(kind: 'daily' | 'weekly', target: number | null): Promise<void> {
        await db.transaction('rw', db.goals, async () => {
          const existing = (await db.goals.where('projectId').equals(projectId).toArray()).filter((g) => g.kind === kind);
          const targetWords = words(target);
          const now = Date.now();
          if (!targetWords) return void (await db.goals.bulkDelete(existing.map((g) => g.id)));
          if (existing[0]) await db.goals.update(existing[0].id, { targetWords, updatedAt: now });
          else await db.goals.add({ id: createId(), projectId, kind, title: '', targetWords, dueDate: null, nodeId: null, category: null, done: false, doneAt: null, createdAt: now, updatedAt: now });
        });
      },

      /** Adds a deadline or a task. */
      async addGoal(kind: 'deadline' | 'task', input: GoalInput): Promise<Goal> {
        if (!GOAL_KINDS.includes(kind)) throw new Error('Unknown kind of goal.');
        const fields = clean(kind, input);
        if (!fields.title) throw new Error(kind === 'task' ? 'Give the task a name.' : 'Give the deadline a name.');
        if (kind === 'deadline' && !fields.dueDate) throw new Error('Pick a date for the deadline.');
        const now = Date.now();
        const goal: Goal = { id: createId(), projectId, kind, ...fields, done: false, doneAt: null, createdAt: now, updatedAt: now };
        await db.goals.add(goal);
        return goal;
      },

      async updateGoal(goalId: string, input: GoalInput): Promise<void> {
        const goal = await owned(goalId);
        const fields = clean(goal.kind, input, goal);
        if (!fields.title && (goal.kind === 'task' || goal.kind === 'deadline')) fields.title = goal.title;
        if (goal.kind === 'deadline' && !fields.dueDate) fields.dueDate = goal.dueDate;
        await db.goals.update(goalId, { ...fields, updatedAt: Date.now() });
      },

      /** Checks a task or deadline off, or un-checks it. */
      async setDone(goalId: string, done: boolean): Promise<void> {
        await owned(goalId);
        await db.goals.update(goalId, { done, doneAt: done ? Date.now() : null, updatedAt: Date.now() });
      },

      async removeGoal(goalId: string): Promise<void> {
        await owned(goalId);
        await db.goals.delete(goalId);
      },
    };
  }

  return { recordWriting, forProject };
}

export type ProgressService = ReturnType<typeof createProgressService>;
export type ProjectProgress = ReturnType<ProgressService['forProject']>;
