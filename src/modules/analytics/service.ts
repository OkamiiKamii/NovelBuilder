import type { Table } from 'dexie';
import type { NovelDB } from '@/core/db';
import { computeAnalytics, type Analytics } from './compute';

/** Analytics owns no data: it reads what the other modules have saved and counts it. */
export function createAnalyticsService(db: NovelDB) {
  function forProject(projectId: string) {
    const mine = <T>(table: Table<T, string>): Promise<T[]> => table.where('projectId').equals(projectId).toArray();
    return {
      /** The whole dashboard, from the project as it is saved right now. Reads only. */
      async report(now = Date.now()): Promise<Analytics> {
        const [project, nodes, contents, plans, entries, relations, snapshots, threads, sessions, goals] = await Promise.all([
          db.projects.get(projectId), mine(db.chapters), mine(db.chapterContents), mine(db.chapterPlans), mine(db.loreEntries), mine(db.characterRelations), mine(db.progressSnapshots), mine(db.plotThreads), mine(db.writingSessions), mine(db.goals),
        ]);
        return computeAnalytics({ targetWordCount: project?.targetWordCount ?? null, nodes, docs: new Map<string, unknown>(contents.map((c) => [c.id, c.doc])), plans, entries, relations, snapshots, threads, sessions, goals, now });
      },
    };
  }
  return { forProject };
}
