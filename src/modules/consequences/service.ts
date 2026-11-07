import type { Table } from 'dexie';
import type { NovelDB } from '@/core/db';
import { analyze, type Report, type Subject, type World } from './analyze';

/**
 * Consequence analysis owns no data. It reads what the other modules have
 * recorded and reports on it; there is nothing here to save, copy or back
 * up, and no way for it to change a project.
 */
export function createConsequenceService(db: NovelDB) {
  function forProject(projectId: string) {
    const mine = <T>(table: Table<T, string>): Promise<T[]> => table.where('projectId').equals(projectId).toArray();

    /** Everything the analysis reads, as it is saved right now. */
    async function gather(): Promise<World> {
      const [nodes, contents, plans, entries, relations, threads, events, facts, rules, snapshots, systems] = await Promise.all([
        mine(db.chapters), mine(db.chapterContents), mine(db.chapterPlans), mine(db.loreEntries), mine(db.characterRelations), mine(db.plotThreads),
        mine(db.timelineEvents), mine(db.canonFacts), mine(db.continuityRules), mine(db.progressSnapshots), mine(db.systems),
      ]);
      return { nodes, docs: new Map<string, unknown>(contents.map((c) => [c.id, c.doc])), plans, entries, relations, threads, events, facts, rules, snapshots, systems };
    }

    return {
      gather,
      /** Runs an analysis. Reads only. */
      async analyze(subject: Subject, options: { include?: string[]; exclude?: string[] } = {}): Promise<Report> {
        return analyze(await gather(), subject, options);
      },
    };
  }
  return { forProject };
}

export type ConsequenceService = ReturnType<typeof createConsequenceService>;
