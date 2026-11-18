// The record check's fixes and decisions. Each is one transaction on the whole novel as stored, refused (with nothing
// written) if it changed elsewhere since; nothing happens until the author chooses it. A port of
// flutter_app/lib/features/review/data/integrity_service.dart, typed against the same store and backups as
// CharacterService. Decisions are kept the same way the canon service keeps them (canon/canonService.ts decideIn).

import { decideIn } from '../canon/canonService';
import { type CharacterBackups, type CharacterStore } from '../characters/characterService';
import { RecordChanges } from '../codex/codexChanges';
import { newId as makeId } from '../ids';
import { type ReviewDecision, ReviewItem } from '../records/review';
import { type NovelSnapshot } from '../snapshot/novelSnapshot';
import * as fix from './fixes';

class StateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StateError';
  }
}

export class IntegrityService {
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

  private whole(projectId: string): NovelSnapshot {
    const s = this.store.load(projectId);
    if (s === null) throw new StateError('That novel is no longer in the library.');
    return s;
  }

  private apply(projectId: string, change: (s: NovelSnapshot, now: number) => NovelSnapshot): void {
    const before = this.whole(projectId);
    const now = this.clock();
    this.store.saveChanges(before, change(before, now).copyWith({ project: { ...before.project, updatedAt: now } }));
  }

  removeReference(projectId: string, table: string, rowId: string, missingId: string): void {
    this.apply(projectId, (s, now) => fix.removeReference(s, table, rowId, missingId, { now }));
  }

  pointField(projectId: string, entryId: string, fieldId: string, words: string, targetId: string): void {
    this.apply(projectId, (s, now) => fix.pointField(s, entryId, fieldId, words, targetId, { now }));
  }

  /** What a merge would do. Reads only. */
  mergePlan(projectId: string, keepId: string, mergeId: string): fix.MergePlan {
    return fix.mergePlan(this.whole(projectId), keepId, mergeId);
  }

  /** Merges, after keeping a restore point. Returns the restore point, for Undo. */
  merge(projectId: string, keepId: string, mergeId: string, names: string): string {
    const kept = this.backups.keepRestorePoint(projectId, `Before merging ${names}`);
    if (kept === null) throw new StateError('That novel is no longer in the library.');
    this.apply(projectId, (s, now) => fix.mergeEntries(s, keepId, mergeId, { now }));
    return kept;
  }

  undo(restorePointId: string): void {
    this.backups.restore(restorePointId);
  }

  /** Records the author's decision about a finding ("not duplicates"), replacing any earlier one. Nothing else
   * changes. */
  decide(projectId: string, key: string, message: string, kind: ReviewDecision, args: { note?: string; nodeId?: string | null } = {}): void {
    this.apply(projectId, (s, now) => {
      const c = new RecordChanges(s, { now, createId: this.createId });
      decideIn(c, { key, message, kind, note: args.note, nodeId: args.nodeId });
      return c.snapshot;
    });
  }

  /** Withdraws a decision, so the finding is raised again if it still applies. */
  reopen(projectId: string, decisionId: string): void {
    this.apply(projectId, (s, now) => {
      const c = new RecordChanges(s, { now, createId: this.createId });
      if (c.row('continuityResolutions', decisionId) !== null) c.remove('continuityResolutions', decisionId);
      return c.snapshot;
    });
  }

  decisions(projectId: string): ReviewItem[] {
    return this.store.rowsIn(projectId, 'continuityResolutions').map((r) => new ReviewItem(r));
  }
}
