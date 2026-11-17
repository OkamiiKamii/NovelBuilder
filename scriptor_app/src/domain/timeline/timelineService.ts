// A novel's timeline: every change the author makes to its events, its calendar and its alternate histories. A port
// of flutter_app/lib/features/timeline/data/timeline_service.dart.
//
// Each change is one transaction, made on the records as stored at that moment (so quick edits in a row build on each
// other) and refused, with nothing written, if they changed elsewhere since they were read.

import type { CharacterBackups, CharacterStore } from '../characters/characterService';
import { newId as makeId } from '../ids';
import { StateError, planDelete } from '../model/deletePolicy';
import { EntityRef } from '../model/entityRef';
import type { NovelSnapshot } from '../snapshot/novelSnapshot';
import { EventChanges, timelineCollections } from './eventChanges';

/** Where an event's page is (the Flutter app's address, kept: other screens already link to it). */
export const eventPath = (eventId: string): string => `/plan/event/${eventId}`;

/** The autosave key of a typed change to the timeline (`timeline:<novel>:<key>`). */
export const timelineSaveKey = (novelId: string, key: string): string => `timeline:${novelId}:${key}`;

export class TimelineService {
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

  /** The timeline's records as stored, or null for a novel no longer in the library. */
  read(projectId: string): NovelSnapshot | null {
    return this.store.loadPart(projectId, timelineCollections);
  }

  /** Applies `apply` to the timeline as stored now, and saves the result in one transaction. */
  change<T>(projectId: string, apply: (c: EventChanges) => T): T {
    const before = this.read(projectId);
    if (before === null) throw new StateError('That novel is no longer in the library.');
    const now = this.clock();
    const changes = new EventChanges(before, { now, createId: this.createId });
    const result = apply(changes);
    // The novel shows as changed, as the original app marks it after any change to its content.
    this.store.saveChanges(before, changes.snapshot.copyWith({ project: { ...before.project, updatedAt: now } }));
    return result;
  }

  private whole(projectId: string): NovelSnapshot {
    const s = this.store.load(projectId);
    if (s === null) throw new StateError('That novel is no longer in the library.');
    return s;
  }

  /** Deletes an event after keeping a restore point, and returns the restore point, for Undo. Chapters, scenes and
   * entries it links to are not changed; its connections go with it, and events set to follow it are flagged. */
  deleteEvent(projectId: string, eventId: string, options: { name: string }): string {
    const kept = this.backups.keepRestorePoint(projectId, `Before deleting the event “${options.name}”`);
    if (kept === null) throw new StateError('That novel is no longer in the library.');
    const before = this.whole(projectId);
    const after = planDelete(before, new EntityRef('event', eventId)).snapshot;
    this.store.saveChanges(before, after.copyWith({ project: { ...before.project, updatedAt: this.clock() } }));
    return kept;
  }

  undo(restorePointId: string): void {
    this.backups.restore(restorePointId);
  }
}
