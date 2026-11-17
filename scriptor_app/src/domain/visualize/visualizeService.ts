// Saved views and which views are on: the only things the Visualize workspace stores. Nothing is stored for a view's
// content; every view reads the novel's records as they are. A port of
// flutter_app/lib/features/visualize/visualize_providers.dart's VisualizeService.

import { type CharacterStore } from '../characters/characterService';
import { newId as makeId } from '../ids';
import { type NovelSnapshot } from '../snapshot/novelSnapshot';
import { SavedViewChanges } from './savedViews';

export class VisualizeService {
  private readonly clock: () => number;
  private readonly createId: () => string;

  constructor(
    readonly store: CharacterStore,
    options: { clock?: () => number; createId?: () => string } = {},
  ) {
    this.clock = options.clock ?? Date.now;
    this.createId = options.createId ?? makeId;
  }

  read(projectId: string): NovelSnapshot | null {
    return this.store.loadPart(projectId, ['savedViews']);
  }

  /** One change, made on the saved views as stored now and saved in one transaction (nothing is saved when it throws). */
  change<T>(projectId: string, apply: (c: SavedViewChanges) => T): T {
    const before = this.read(projectId);
    if (before === null) throw new Error('That novel is no longer in the library.');
    const now = this.clock();
    const changes = new SavedViewChanges(before, { now, createId: this.createId });
    const result = apply(changes);
    this.store.saveChanges(before, changes.snapshot.copyWith({ project: { ...changes.snapshot.project, updatedAt: now } }));
    return result;
  }
}
