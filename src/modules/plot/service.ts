import type { NovelDB } from '@/core/db';
import { createId } from '@/core/id';
import { removeConnectionsOf } from '@/modules/connections/cascade';
import type { ProjectRegistry } from '@/core/projectRegistry';
import { BEAT_ROLES, THREAD_CATEGORIES, THREAD_STATUSES, type BeatChanges, type BeatRole, type PlotThread, type ThreadBeat, type ThreadCategory, type ThreadChanges, type ThreadStatus } from './types';

export class ThreadNotFoundError extends Error {
  constructor(id: string) {
    super(`Plot thread ${id} not found in this project`);
    this.name = 'ThreadNotFoundError';
  }
}

/** Hooks plot threads into project isolation, duplication and backup. Every chapter and codex reference is re-pointed at the copies. */
export function registerPlot(registry: ProjectRegistry): void {
  registry.registerCollection({
    table: 'plotThreads',
    refs: ['characterIds', 'locationIds', 'targetNodeId'],
    // Threads are inherited with the developments reached so far; later ones have not happened in the new timeline.
    fork: (rows, reached) =>
      rows.map((row) => {
        const thread = row as unknown as PlotThread;
        return { ...row, beats: (thread.beats ?? []).filter((beat) => beat.nodeId === null || reached(beat.nodeId)), targetNodeId: reached(thread.targetNodeId) ? thread.targetNodeId : null };
      }),
    remap: (row, mapId) => ({
      ...row,
      beats: ((row as unknown as PlotThread).beats ?? []).map((beat) => ({ ...beat, nodeId: beat.nodeId ? mapId(beat.nodeId) : null, ...(beat.withThreadIds ? { withThreadIds: beat.withThreadIds.map(mapId) } : {}) })),
    }),
  });
}

export function createPlotService(db: NovelDB, onProjectChanged: (projectId: string) => Promise<unknown>) {
  /** Every operation is bound to one project; ids from another project are treated as not found. */
  function forProject(projectId: string) {
    async function owned(threadId: string): Promise<PlotThread> {
      const thread = await db.plotThreads.get(threadId);
      if (!thread || thread.projectId !== projectId) throw new ThreadNotFoundError(threadId);
      return thread;
    }
    const write = <T>(task: () => Promise<T>): Promise<T> =>
      db.transaction('rw', db.tables, async () => {
        const result = await task();
        await onProjectChanged(projectId);
        return result;
      });

    /** Keeps only ids of this project's rows in `table` (optionally of one codex category, or only chapters and scenes). */
    async function existing(table: 'loreEntries' | 'chapters', ids: unknown, only?: string): Promise<string[]> {
      const wanted = [...new Set((Array.isArray(ids) ? ids : []).filter((id): id is string => typeof id === 'string' && id !== ''))];
      const rows = (await db.table(table).bulkGet(wanted)) as ({ projectId: string; category?: string; kind?: string } | undefined)[];
      return wanted.filter((_, i) => {
        const row = rows[i];
        if (row?.projectId !== projectId) return false;
        if (only === 'document') return row.kind === 'chapter' || row.kind === 'scene';
        return !only || row.category === only;
      });
    }
    const documentId = async (id: unknown): Promise<string | null> => (await existing('chapters', [id], 'document'))[0] ?? null;
    /** The other threads of this project an intersection names; never the thread itself. */
    async function crossed(threadId: string, ids: unknown): Promise<string[]> {
      const wanted = [...new Set((Array.isArray(ids) ? ids : []).filter((id): id is string => typeof id === 'string' && id !== '' && id !== threadId))];
      const rows = await db.plotThreads.bulkGet(wanted);
      return wanted.filter((_, i) => rows[i]?.projectId === projectId);
    }
    const roleFrom = (role: unknown): BeatRole | undefined => (BEAT_ROLES.includes(role as BeatRole) ? (role as BeatRole) : undefined);

    /** Rewrites a thread's developments from the list as it is stored right now, so quick edits never clobber one another. */
    const editBeats = (threadId: string, edit: (beats: ThreadBeat[]) => Promise<ThreadBeat[]> | ThreadBeat[]) =>
      write(async () => {
        const thread = await owned(threadId);
        await db.plotThreads.update(threadId, { beats: await edit(thread.beats), updatedAt: Date.now() });
      });

    return {
      list: () => db.plotThreads.where('projectId').equals(projectId).toArray(),

      async get(threadId: string): Promise<PlotThread | undefined> {
        const thread = await db.plotThreads.get(threadId);
        return thread?.projectId === projectId ? thread : undefined;
      },

      create: (title?: string) =>
        write(async () => {
          const now = Date.now();
          const thread: PlotThread = {
            id: createId(), projectId, title: title?.trim() || 'New thread', premise: '', category: 'subplot', customCategory: '', status: 'planned',
            characterIds: [], locationIds: [], targetNodeId: null, targetNote: '', beats: [], notes: '', muted: false, createdAt: now, updatedAt: now,
          };
          await db.plotThreads.add(thread);
          return thread;
        }),

      /**
       * Updates a thread. This is the only way a thread's status ever changes:
       * by the author choosing it. Pass a function to base the change on the
       * thread as it is stored right now.
       */
      update: (threadId: string, edit: ThreadChanges | ((current: PlotThread) => ThreadChanges)) =>
        write(async () => {
          const current = await owned(threadId);
          const changes = typeof edit === 'function' ? edit(current) : edit;
          const next: ThreadChanges & { updatedAt: number } = { updatedAt: Date.now() };
          if (typeof changes.title === 'string') next.title = changes.title.trim() || 'Untitled thread';
          if (typeof changes.premise === 'string') next.premise = changes.premise;
          if (typeof changes.notes === 'string') next.notes = changes.notes;
          if (typeof changes.targetNote === 'string') next.targetNote = changes.targetNote;
          if (typeof changes.customCategory === 'string') next.customCategory = changes.customCategory.slice(0, 60);
          if (typeof changes.muted === 'boolean') next.muted = changes.muted;
          if (THREAD_CATEGORIES.includes(changes.category as ThreadCategory)) next.category = changes.category;
          if (THREAD_STATUSES.includes(changes.status as ThreadStatus)) next.status = changes.status;
          if (typeof changes.customStatus === 'string') next.customStatus = changes.customStatus.slice(0, 40);
          if ('characterIds' in changes) next.characterIds = await existing('loreEntries', changes.characterIds, 'character');
          if ('locationIds' in changes) next.locationIds = await existing('loreEntries', changes.locationIds, 'location');
          if ('targetNodeId' in changes) next.targetNodeId = (await existing('chapters', [changes.targetNodeId]))[0] ?? null;
          await db.plotThreads.update(threadId, next);
        }),

      /**
       * Records a development. A chapter or scene from another project, or one that does not exist, is left unplaced.
       * One that only marks the thread as appearing in a scene needs no title: none is made up for it.
       */
      async addBeat(threadId: string, input: BeatChanges = {}): Promise<ThreadBeat> {
        const role = roleFrom(input.role);
        const beat: ThreadBeat = { id: createId(), nodeId: await documentId(input.nodeId), title: input.title?.trim() || (role === 'appears' ? '' : 'New development'), note: input.note ?? '', createdAt: Date.now() };
        if (role) beat.role = role;
        if (input.withThreadIds !== undefined) beat.withThreadIds = await crossed(threadId, input.withThreadIds);
        await editBeats(threadId, (beats) => [...beats, beat]);
        return beat;
      },

      /** Changes one development. The others are left exactly as stored, including any whose chapter has since been deleted. */
      updateBeat: (threadId: string, beatId: string, changes: BeatChanges) =>
        editBeats(threadId, async (beats) => {
          const nodeId = 'nodeId' in changes ? await documentId(changes.nodeId) : undefined;
          const withThreadIds = 'withThreadIds' in changes ? await crossed(threadId, changes.withThreadIds) : undefined;
          const role = roleFrom(changes.role);
          return beats.map((beat) =>
            beat.id !== beatId
              ? beat
              : {
                  ...beat,
                  ...(nodeId !== undefined ? { nodeId } : {}),
                  ...(role ? { role } : {}),
                  ...(withThreadIds !== undefined ? { withThreadIds } : {}),
                  ...(typeof changes.title === 'string' ? { title: changes.title.trim() || ((role ?? beat.role) === 'appears' ? '' : 'Untitled development') } : {}),
                  ...(typeof changes.note === 'string' ? { note: changes.note } : {}),
                },
          );
        }),

      removeBeat: (threadId: string, beatId: string) => editBeats(threadId, (beats) => beats.filter((beat) => beat.id !== beatId)),

      /** Deletes a thread and its developments. Chapters, scenes and codex entries it pointed at are not changed. */
      remove: (threadId: string) =>
        write(async () => {
          await owned(threadId);
          await removeConnectionsOf(db, [threadId]);
          // Events keep everything else; they just stop belonging to a thread that is gone.
          await db.timelineEvents.where('projectId').equals(projectId).filter((e) => (e.threadIds ?? []).includes(threadId)).modify((e) => void (e.threadIds = (e.threadIds ?? []).filter((id) => id !== threadId)));
          // Intersections in other threads keep everything but the thread that is gone.
          await db.plotThreads.where('projectId').equals(projectId).filter((t) => t.beats.some((b) => (b.withThreadIds ?? []).includes(threadId))).modify((t) => void (t.beats = t.beats.map((b) => (b.withThreadIds?.includes(threadId) ? { ...b, withThreadIds: b.withThreadIds.filter((id) => id !== threadId) } : b))));
          await db.plotThreads.delete(threadId);
        }),
    };
  }

  return { forProject };
}

export type PlotService = ReturnType<typeof createPlotService>;
export type ProjectPlot = ReturnType<PlotService['forProject']>;
