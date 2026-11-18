// Tracked rules, "Update canon" and the author's decisions, made to a novel as stored: every change one transaction,
// made on the records as stored at that moment and refused if they changed elsewhere since. The tracked-rules part of
// flutter_app/lib/features/review/review_providers.dart's CanonService (`rules`) and the decisions of
// features/review/data/integrity_service.dart (`decide`, `reopen`). Typed against the same store as CharacterService.

import { type CharacterStore } from '../characters/characterService';
import { newId as makeId } from '../ids';
import { type NovelSnapshot } from '../snapshot/novelSnapshot';
import { ContinuityChanges, continuityCollections } from './continuityChanges';

export class ContinuityService {
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
    return this.store.loadPart(novelId, continuityCollections);
  }

  /** Applies `apply` to the novel as stored now and saves the result in one transaction (nothing is saved when it
   * throws: a ChangeRefused is said by the screen). */
  change<T>(novelId: string, apply: (c: ContinuityChanges) => T): T {
    const before = this.read(novelId);
    if (before === null) throw new Error('That novel is no longer in the library.');
    const now = this.clock();
    const changes = new ContinuityChanges(before, { now, createId: this.createId });
    const result = apply(changes);
    this.store.saveChanges(before, changes.snapshot.copyWith({ project: { ...before.project, updatedAt: now } }));
    return result;
  }
}

/** The autosave key of a typed change to tracked rules (`rules:<novel>:<key>`, as the original's). */
export const rulesSaveKey = (novelId: string, key: string): string => `rules:${novelId}:${key}`;
