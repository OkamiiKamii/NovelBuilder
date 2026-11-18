// WRITING GOALS (as in the original app): daily and weekly word targets (at most one of each), deadlines (a date,
// with a word target for the whole manuscript or one part of it if the author likes) and tasks (milestones that have
// nothing to do with word counts). The writing log is never changed here: it is written only as the author writes.
// A port of flutter_app/lib/shared/domain/analytics/goal_changes.dart, and of the GoalService in
// flutter_app/lib/features/progress/progress_providers.dart.

import { type CharacterStore } from '../characters/characterService';
import { ChangeRefused, RecordChanges } from '../codex/codexChanges';
import { newId as makeId } from '../ids';
import { type JsonMap, str, strOrNull } from '../json';
import { type NovelSnapshot } from '../snapshot/novelSnapshot';
import { Goal } from './progress';

/** The collections a change to goals reads and writes. */
export const goalCollections: readonly string[] = ['goals', 'chapters'];

/** The kinds of task, as the original names them. */
export const taskCategories: readonly string[] = ['planning', 'worldbuilding', 'editing', 'other'];
export const taskLabels: Readonly<Record<string, string>> = {
  planning: 'Planning',
  worldbuilding: 'Worldbuilding',
  editing: 'Editing',
  other: 'Other',
};

/** What a deadline or task form gives: undefined leaves a field as it is (on a change), as in the original. */
export type GoalInput = {
  title?: string;
  /** Words typed: anything not a positive number is no target. */
  targetWords?: unknown;
  /** `yyyy-mm-dd`, or '' for none. */
  dueDate?: string;
  /** The part of the manuscript a deadline covers, or '' for the whole manuscript. */
  nodeId?: string;
  category?: string;
};

/** Dart's `num.tryParse` on trimmed text, as far as a typed number goes. */
function numTryParse(text: string): number | null {
  const t = text.trim();
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t) && !/^[+-]?(Infinity|NaN)$/.test(t)) return null;
  return Number(t);
}

function wordsOf(value: unknown): number | null {
  const n = typeof value === 'number' ? value : numTryParse(str(value));
  return n !== null && Number.isFinite(n) && n > 0 ? Math.floor(n + 0.5) : null;
}

const dateOf = (value: unknown): string | null =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;

export class GoalChanges extends RecordChanges {
  get goals(): Goal[] {
    return this.rows('goals').map((r) => new Goal(r));
  }

  private owned(id: string): Goal {
    const r = this.row('goals', id);
    if (r === null) throw new ChangeRefused('That goal is no longer here.');
    return new Goal(r);
  }

  private clean(kind: string, input: GoalInput, base?: Goal): JsonMap {
    return {
      title: input.title !== undefined ? input.title.trim() : (base?.title ?? ''),
      targetWords: input.targetWords !== undefined ? wordsOf(input.targetWords) : (base?.targetWords ?? null),
      dueDate: input.dueDate !== undefined ? dateOf(input.dueDate) : (base?.dueDate ?? null),
      nodeId:
        kind === 'deadline'
          ? input.nodeId !== undefined
            ? input.nodeId === ''
              ? null
              : input.nodeId
            : (base?.nodeId ?? null)
          : null,
      category:
        kind === 'task'
          ? input.category !== undefined && taskCategories.includes(input.category)
            ? input.category
            : (strOrNull(base?.raw['category']) ?? 'other')
          : null,
    };
  }

  /** Sets the daily or weekly word target. A blank or zero target removes it. */
  setTarget(kind: 'daily' | 'weekly', target: unknown): void {
    const existing = this.goals.filter((g) => g.kind === kind);
    const words = wordsOf(target);
    if (words === null) {
      for (const g of existing) this.remove('goals', g.id);
      return;
    }
    if (existing.length > 0) {
      this.put('goals', { ...existing[0].raw, targetWords: words, updatedAt: this.now });
      return;
    }
    this.put('goals', {
      id: this.newId(),
      projectId: this.projectId,
      kind,
      title: '',
      targetWords: words,
      dueDate: null,
      nodeId: null,
      category: null,
      done: false,
      doneAt: null,
      createdAt: this.now,
      updatedAt: this.now,
    });
  }

  /** Adds a deadline or a task. */
  addGoal(kind: string, input: GoalInput): Goal {
    if (kind !== 'deadline' && kind !== 'task') throw new ChangeRefused('Unknown kind of goal.');
    const fields = this.clean(kind, input);
    if (str(fields['title']) === '') {
      throw new ChangeRefused(kind === 'task' ? 'Give the task a name.' : 'Give the deadline a name.');
    }
    if (kind === 'deadline' && fields['dueDate'] === null) throw new ChangeRefused('Pick a date for the deadline.');
    const goal: JsonMap = {
      id: this.newId(),
      projectId: this.projectId,
      kind,
      ...fields,
      done: false,
      doneAt: null,
      createdAt: this.now,
      updatedAt: this.now,
    };
    this.put('goals', goal);
    return new Goal(goal);
  }

  /** Changes a deadline or task. A blank name or (for a deadline) date keeps the one it had. */
  updateGoal(id: string, input: GoalInput): void {
    const goal = this.owned(id);
    const fields = this.clean(goal.kind, input, goal);
    if (str(fields['title']) === '' && (goal.kind === 'task' || goal.kind === 'deadline')) fields['title'] = goal.title;
    if (goal.kind === 'deadline' && fields['dueDate'] === null) fields['dueDate'] = goal.dueDate;
    this.put('goals', { ...goal.raw, ...fields, updatedAt: this.now });
  }

  /** Checks a task or deadline off, or un-checks it. */
  setDone(id: string, done: boolean): void {
    const goal = this.owned(id);
    this.put('goals', { ...goal.raw, done, doneAt: done ? this.now : null, updatedAt: this.now });
  }

  removeGoal(id: string): void {
    this.owned(id);
    this.remove('goals', id);
  }
}

class StateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StateError';
  }
}

/** Goals: every change one transaction, made on the records as stored at that moment and refused if they changed
 * elsewhere since. */
export class GoalService {
  private readonly clock: () => number;
  private readonly createId: () => string;

  constructor(
    readonly store: CharacterStore,
    options: { clock?: () => number; createId?: () => string } = {},
  ) {
    this.clock = options.clock ?? Date.now;
    this.createId = options.createId ?? makeId;
  }

  read(projectId: string): NovelSnapshot | null {
    return this.store.loadPart(projectId, goalCollections);
  }

  change<T>(projectId: string, apply: (c: GoalChanges) => T): T {
    const before = this.read(projectId);
    if (before === null) throw new StateError('That novel is no longer in the library.');
    const now = this.clock();
    const changes = new GoalChanges(before, { now, createId: this.createId });
    const result = apply(changes);
    this.store.saveChanges(before, changes.snapshot.copyWith({ project: { ...before.project, updatedAt: now } }));
    return result;
  }
}
