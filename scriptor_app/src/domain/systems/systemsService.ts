// Systems' changes to a novel as stored: every change one transaction, made on the records as stored at that moment
// and refused if they changed elsewhere since. The systems part of
// flutter_app/lib/features/progression/progression_providers.dart's ProgressionService (progression changes and
// snapshots are the other Systems work's), and `snapshotsOf`. Typed against the same store as CharacterService.

import { type CharacterStore } from '../characters/characterService';
import { newId as makeId } from '../ids';
import { ProgressSnapshot } from '../progression/snapshots';
import { type NovelSnapshot } from '../snapshot/novelSnapshot';
import { SystemChanges, systemCollections } from './systemChanges';

class StateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StateError';
  }
}

export class SystemsService {
  private readonly clock: () => number;
  private readonly createId: () => string;

  constructor(
    readonly store: CharacterStore,
    options: { clock?: () => number; createId?: () => string } = {},
  ) {
    this.clock = options.clock ?? Date.now;
    this.createId = options.createId ?? makeId;
  }

  read(novelId: string): NovelSnapshot | null {
    return this.store.loadPart(novelId, systemCollections);
  }

  /** Applies `apply` to the novel as stored now and saves the result in one transaction (nothing is saved when it
   * throws: a ChangeRefused is said by the screen, "Not saved: <why>" for typing). */
  change<T>(novelId: string, apply: (c: SystemChanges) => T): T {
    const before = this.read(novelId);
    if (before === null) throw new StateError('That novel is no longer in the library.');
    const now = this.clock();
    const changes = new SystemChanges(before, { now, createId: this.createId });
    const result = apply(changes);
    this.store.saveChanges(before, changes.snapshot.copyWith({ project: { ...before.project, updatedAt: now } }));
    return result;
  }
}

/** The autosave key of a typed change to systems (`systems:<novel>:<key>`). */
export const systemsSaveKey = (novelId: string, key: string): string => `systems:${novelId}:${key}`;

/** The snapshots of the open novel's characters, from the cast's snapshot. */
export function snapshotsOf(s: NovelSnapshot): ProgressSnapshot[] {
  return s.rows('progressSnapshots').map((r) => new ProgressSnapshot(r));
}
