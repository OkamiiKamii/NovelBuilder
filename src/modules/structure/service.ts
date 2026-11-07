import type { NovelDB } from '@/core/db';
import { createId } from '@/core/id';
import type { ProjectRegistry } from '@/core/projectRegistry';
import type { MarkerChanges, StructureMarker } from './types';

export class MarkerNotFoundError extends Error {
  constructor() {
    super('That marker is no longer there.');
    this.name = 'MarkerNotFoundError';
  }
}

/** Structural markers travel with their novel: copied, backed up and deleted with it; a fork keeps those in the chapters it has. */
export function registerStructure(registry: ProjectRegistry): void {
  registry.registerCollection({
    table: 'structureMarkers',
    refs: ['nodeId', 'eventId'],
    fork: (rows, reached) => rows.filter((row) => !row.nodeId || reached(row.nodeId)),
  });
}

export function createStructureService(db: NovelDB, onProjectChanged: (projectId: string) => Promise<unknown>) {
  return {
    forProject(projectId: string) {
      const write = <T>(task: () => Promise<T>): Promise<T> =>
        db.transaction('rw', db.tables, async () => {
          const result = await task();
          await onProjectChanged(projectId);
          return result;
        });
      return {
        /** Every marker of the novel, in the order they were made. Place them in the book with `pacing.ts`. */
        list: async (): Promise<StructureMarker[]> => (await db.structureMarkers.where('projectId').equals(projectId).toArray()).sort((a, b) => a.createdAt - b.createdAt),

        /** Adds a marker (`markerId` null) or changes one. It needs a kind; where it is may be a chapter or scene, an event, both or neither. */
        save: (markerId: string | null, changes: MarkerChanges) =>
          write(async () => {
            const was = markerId ? await db.structureMarkers.get(markerId) : undefined;
            if (markerId && was?.projectId !== projectId) throw new MarkerNotFoundError();
            const now = Date.now();
            const next: StructureMarker = { ...(was ?? { id: createId(), projectId, kind: '', title: '', nodeId: null, eventId: null, note: '', createdAt: now, updatedAt: now }), ...changes, updatedAt: now };
            next.kind = (next.kind ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
            if (!next.kind) throw new Error('Say what kind of marker it is.');
            next.title = (next.title ?? '').trim().slice(0, 120);
            next.note = next.note ?? '';
            if (next.nodeId) {
              const node = await db.chapters.get(next.nodeId);
              if (node?.projectId !== projectId || (node.kind !== 'chapter' && node.kind !== 'scene')) throw new Error('That chapter or scene is not in this novel.');
            }
            if (next.eventId && (await db.timelineEvents.get(next.eventId))?.projectId !== projectId) throw new Error('That event is not in this novel.');
            await db.structureMarkers.put(next);
            return next;
          }),

        remove: (markerId: string) =>
          write(async () => {
            const marker = await db.structureMarkers.get(markerId);
            if (marker?.projectId === projectId) await db.structureMarkers.delete(markerId);
          }),
      };
    },
  };
}

export type StructureService = ReturnType<typeof createStructureService>;
