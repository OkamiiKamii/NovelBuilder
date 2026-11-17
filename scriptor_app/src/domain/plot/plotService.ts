// Plot threads and plans: every change the author makes to them, one transaction each, made on the records as stored at
// that moment and refused if they changed elsewhere since. A port of PlotService in
// flutter_app/lib/features/plot/plot_providers.dart (its structural markers are Visualize's: Structure and pacing).

import type { CharacterBackups, CharacterStore } from '../characters/characterService';
import { newId as makeId } from '../ids';
import { StateError, planDelete } from '../model/deletePolicy';
import { EntityRef } from '../model/entityRef';
import type { NovelSnapshot } from '../snapshot/novelSnapshot';
import { PlotChanges, plotCollections } from './plotChanges';

export class PlotService {
  private readonly clock: () => number;
  private readonly createId: () => string;

  constructor(
    readonly store: CharacterStore,
    readonly backups: CharacterBackups,
    options: { clock?: () => number; createId?: () => string } = {},
  ) {
    this.clock = options.clock ?? Date.now;
    this.createId = options.createId ?? makeId;
  }

  /** What the plot screens read and change, as stored now. */
  read(projectId: string): NovelSnapshot | null {
    return this.store.loadPart(projectId, plotCollections);
  }

  /** Applies `apply` to the plot as stored now and saves the result in one transaction (nothing is saved when it
   * throws: a ChangeRefused is said by the screen). */
  change<T>(projectId: string, apply: (c: PlotChanges) => T): T {
    const before = this.read(projectId);
    if (before === null) throw new StateError('That novel is no longer in the library.');
    const now = this.clock();
    const changes = new PlotChanges(before, { now, createId: this.createId });
    const result = apply(changes);
    this.store.saveChanges(before, changes.snapshot.copyWith({ project: { ...before.project, updatedAt: now } }));
    return result;
  }

  /** Deletes a thread and its developments, after keeping a restore point. Chapters, scenes and entries it pointed at
   * are not changed; events and other threads' intersections stop naming it. Returns the restore point, for Undo. */
  deleteThread(projectId: string, threadId: string, options: { title: string }): string {
    const kept = this.backups.keepRestorePoint(projectId, `Before deleting the plot thread “${options.title}”`);
    if (kept === null) throw new StateError('That novel is no longer in the library.');
    const before = this.store.load(projectId);
    if (before === null) throw new StateError('That novel is no longer in the library.');
    const after = planDelete(before, new EntityRef('thread', threadId)).snapshot;
    this.store.saveChanges(before, after.copyWith({ project: { ...before.project, updatedAt: this.clock() } }));
    return kept;
  }

  undo(restorePointId: string): void {
    this.backups.restore(restorePointId);
  }
}

/** Where a thread's page is. */
export const threadPath = (threadId: string): string => `/plan/thread/${threadId}`;
/** Where a chapter's or scene's plan is. */
export const chapterPlanPath = (nodeId: string): string => `/plan/chapter/${nodeId}`;
/** The scene board, showing only where a thread is recorded when one is given. */
export const boardPath = (threadId?: string | null): string => (threadId ? `/plan/board?thread=${threadId}` : '/plan/board');
/** Where the thread list is. */
export const threadsPath = '/plan/threads';
/** The autosave key of a typed change to the plot (`plot:<novel>:<key>`). */
export const plotSaveKey = (novelId: string, key: string): string => `plot:${novelId}:${key}`;
