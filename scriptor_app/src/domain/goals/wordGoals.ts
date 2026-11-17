// THE AUTHOR'S WORD GOALS: a daily and a weekly number of words, one of each per novel, kept as rows of the novel's
// `goals` collection (the original app's goals, where deadlines and tasks live too). Pure TypeScript. A port of
// `wordGoals` and `setWordGoal` in flutter_app/lib/features/write/data/manuscript_service.dart, over the rows: read
// with `wordGoalsOf(store.rowsIn(novelId, 'goals'))`, write with
// `store.writeRows(novelId, write ? [write] : [], false)` (the Dart service writes goals without touching the novel).

import { type JsonMap, str } from '../json';
import { intOrNull } from './days';

/** The collection the goals are rows of. */
export const goalsCollection = 'goals';

/** The two word goals the page sets. (`deadline` and `task` goals share the collection; they are not these.) */
export type WordGoalKind = 'daily' | 'weekly';

/** The author's daily and weekly word targets; null when not set. */
export type WordGoals = { daily: number | null; weekly: number | null };

/** A record to write (`value`) or remove (`value` null): the shape of the store's `RowWrite`. */
export type GoalWrite = { collection: string; id: string; value: JsonMap | null };

function firstOfKind(rows: Iterable<JsonMap>, kind: string): JsonMap | null {
  for (const g of rows) if (g['kind'] === kind) return g;
  return null;
}

/** The daily and weekly targets from the `goals` rows: the `targetWords` of the first row of each `kind`, when it is a
 * whole number. */
export function wordGoalsOf(rows: Iterable<JsonMap>): WordGoals {
  const list = [...rows];
  const target = (kind: WordGoalKind) => intOrNull(firstOfKind(list, kind)?.['targetWords']);
  return { daily: target('daily'), weekly: target('weekly') };
}

/** What setting the [kind] goal to [words] writes: with null, 0 or less, the existing row removed (null when there is
 * none: nothing to write); else the goal's row, the existing one (its id, title, createdAt and any other fields kept)
 * or a new one, with the target and these fields:
 * `{id, projectId, kind, title, targetWords, dueDate: null, nodeId: null, category: null, done: false, doneAt: null,
 * createdAt, updatedAt}` (times in milliseconds since the epoch). */
export function wordGoalWrite(
  rows: Iterable<JsonMap>,
  kind: WordGoalKind,
  words: number | null,
  { projectId, nowMs, createId }: { projectId: string; nowMs: number; createId: () => string },
): GoalWrite | null {
  const existing = firstOfKind(rows, kind);
  if (words === null || words <= 0) {
    return existing === null ? null : { collection: goalsCollection, id: str(existing['id']), value: null };
  }
  const id = existing?.['id'] ?? createId();
  const value: JsonMap = {
    ...existing,
    id,
    projectId,
    kind,
    title: existing?.['title'] ?? '',
    targetWords: words,
    dueDate: null,
    nodeId: null,
    category: null,
    done: false,
    doneAt: null,
    createdAt: existing?.['createdAt'] ?? nowMs,
    updatedAt: nowMs,
  };
  return { collection: goalsCollection, id: str(id), value };
}
