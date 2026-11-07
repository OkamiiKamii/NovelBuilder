import type { NovelDB } from '@/core/db';
import type { ProjectRegistry } from '@/core/projectRegistry';
import { resolveCategories, unknownCategory } from '@/modules/codex/schema';
import { entryBlocks, nodeBlocks } from './extract';
import { buildIndex } from './query';
import type { SearchBlock, SearchEngine } from './types';

/** Bump when extraction changes, so existing projects are re-indexed. */
const INDEX_VERSION = 3;
const CHUNK = 25;

/** The index is derived data: deleted with its project, never part of a backup or copy (it is rebuilt on demand). */
export function registerSearch(registry: ProjectRegistry): void {
  registry.registerCollection({ table: 'searchBlocks', transient: true });
  registry.registerCollection({ table: 'searchState', transient: true });
}

export interface SyncProgress {
  done: number;
  total: number;
}

const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export function createSearchService(db: NovelDB) {
  // Keeps the most recent project's index in memory between searches.
  let cached: { projectId: string; engine: SearchEngine & { size: number } } | null = null;

  /** Every operation is bound to one project: only its text is ever indexed or returned. */
  function forProject(projectId: string) {
    /**
     * Brings the stored index up to date with the manuscript and codex. It
     * compares each entity's last-modified stamp with what was indexed and
     * re-reads only what changed, so it is correct after any kind of change
     * (typing, imports, restores, edits in another tab) without the other
     * modules having to notify it. Work is done in small batches with pauses,
     * so a large first-time index never blocks typing. Returns how many
     * entities were re-indexed or removed.
     */
    async function sync(onProgress?: (progress: SyncProgress) => void): Promise<number> {
      const [nodes, entries, schemas, states] = await Promise.all([
        db.chapters.where('projectId').equals(projectId).toArray(),
        db.loreEntries.where('projectId').equals(projectId).toArray(),
        db.loreSchemas.where('projectId').equals(projectId).toArray(),
        db.searchState.where('projectId').equals(projectId).toArray(),
      ]);
      const indexed = new Map(states.map((s) => [s.id, s.stamp]));
      const categories = new Map(resolveCategories(schemas).map((c) => [c.key, c]));
      const names = new Map(entries.map((e) => [e.id, e.name]));
      // An entry's indexed text also depends on its category's field set (names, types), so that is part of its stamp.
      const schemaStamp = Math.max(0, ...schemas.map((s) => s.updatedAt));
      const current = new Map<string, string>([...nodes.map((n) => [n.id, `v${INDEX_VERSION}|${n.updatedAt}`] as const), ...entries.map((e) => [e.id, `v${INDEX_VERSION}|${e.updatedAt}|${schemaStamp}`] as const)]);

      const gone = states.filter((s) => !current.has(s.id)).map((s) => s.id);
      if (gone.length) {
        await db.transaction('rw', db.searchBlocks, db.searchState, async () => {
          await db.searchBlocks.where('entityId').anyOf(gone).delete();
          await db.searchState.bulkDelete(gone);
        });
      }

      const stale = [...nodes.map((node) => ({ node })), ...entries.map((entry) => ({ entry }))].filter((item) => {
        const entity = 'node' in item ? item.node : item.entry;
        return indexed.get(entity.id) !== current.get(entity.id);
      });

      for (let start = 0; start < stale.length; start += CHUNK) {
        const batch = stale.slice(start, start + CHUNK);
        await db.transaction('rw', db.searchBlocks, db.searchState, db.chapterContents, db.chapterPlans, async () => {
          const ids = batch.map((item) => ('node' in item ? item.node.id : item.entry.id));
          const [docs, plans] = await Promise.all([db.chapterContents.bulkGet(ids), db.chapterPlans.bulkGet(ids)]);
          const blocks: SearchBlock[] = batch.flatMap((item, i) => ('node' in item ? nodeBlocks(item.node, docs[i]?.doc ?? null, plans[i]) : entryBlocks(item.entry, categories.get(item.entry.category) ?? unknownCategory(item.entry.category), (id) => names.get(id))));
          await db.searchBlocks.where('entityId').anyOf(ids).delete();
          await db.searchBlocks.bulkPut(blocks);
          await db.searchState.bulkPut(ids.map((id) => ({ id, projectId, stamp: current.get(id)! })));
        });
        onProgress?.({ done: Math.min(stale.length, start + CHUNK), total: stale.length });
        if (start + CHUNK < stale.length) await pause();
      }
      const changed = gone.length + stale.length;
      if (changed && cached?.projectId === projectId) cached = null;
      return changed;
    }

    return {
      sync,

      blocks: () => db.searchBlocks.where('projectId').equals(projectId).toArray(),

      /** Syncs, then returns a ready-to-query engine (reused from memory when nothing changed). */
      async open(onProgress?: (progress: SyncProgress) => void): Promise<SearchEngine & { size: number }> {
        await sync(onProgress);
        if (cached?.projectId === projectId) return cached.engine;
        const engine = buildIndex(await db.searchBlocks.where('projectId').equals(projectId).toArray());
        cached = { projectId, engine };
        return engine;
      },
    };
  }

  return { forProject };
}

export type SearchService = ReturnType<typeof createSearchService>;
