// Canon statements and the author's decisions about findings: every change one transaction, made on the records as
// stored at that moment and refused if they changed elsewhere since. The canon part of
// flutter_app/lib/features/review/review_providers.dart's CanonService, and IntegrityService's `decide` and `reopen`
// (features/review/data/integrity_service.dart), which the timeline review, canon and knowledge screens use. Typed
// against the same store as CharacterService.

import { type CharacterStore } from '../characters/characterService';
import { RecordChanges } from '../codex/codexChanges';
import { newId as makeId } from '../ids';
import { type ReviewDecision } from '../records/review';
import { type NovelSnapshot } from '../snapshot/novelSnapshot';
import { dartTrim } from '../text/dartString';
import { CanonChanges, canonCollections } from './canonChanges';

class StateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StateError';
  }
}

/** Keeps the author's decision about a finding (one row a key in `continuityResolutions`), replacing any earlier one.
 * Nothing else changes. */
export function decideIn(
  c: RecordChanges,
  args: { key: string; message: string; kind: ReviewDecision; note?: string; nodeId?: string | null },
): void {
  const existing = c.rows('continuityResolutions').find((r) => r['key'] === args.key) ?? null;
  const nodeId = args.nodeId ?? null;
  c.put('continuityResolutions', {
    ...(existing ?? {}),
    id: existing?.['id'] ?? c.newId(),
    projectId: c.projectId,
    key: args.key,
    kind: args.kind,
    note: dartTrim(args.note ?? ''),
    message: args.message,
    nodeId: nodeId !== null && c.row('chapters', nodeId) !== null ? nodeId : (existing?.['nodeId'] ?? null),
    createdAt: existing?.['createdAt'] ?? c.now,
    updatedAt: c.now,
  });
}

export class CanonService {
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
    return this.store.loadPart(novelId, canonCollections);
  }

  private run<C extends RecordChanges, T>(novelId: string, make: (s: NovelSnapshot, now: number) => C, apply: (c: C) => T): T {
    const before = this.read(novelId);
    if (before === null) throw new StateError('That novel is no longer in the library.');
    const now = this.clock();
    const changes = make(before, now);
    const result = apply(changes);
    this.store.saveChanges(before, changes.snapshot.copyWith({ project: { ...before.project, updatedAt: now } }));
    return result;
  }

  canon<T>(novelId: string, apply: (c: CanonChanges) => T): T {
    return this.run(novelId, (s, now) => new CanonChanges(s, { now, createId: this.createId }), apply);
  }

  /** Keeps the author's decision about a finding, replacing any earlier one. */
  decide(novelId: string, key: string, message: string, kind: ReviewDecision, args: { note?: string; nodeId?: string | null } = {}): void {
    this.run(
      novelId,
      (s, now) => new RecordChanges(s, { now, createId: this.createId }),
      (c) => decideIn(c, { key, message, kind, note: args.note, nodeId: args.nodeId }),
    );
  }

  /** Withdraws a decision, so the finding is raised again if it still applies. */
  reopen(novelId: string, decisionId: string): void {
    this.run(
      novelId,
      (s, now) => new RecordChanges(s, { now, createId: this.createId }),
      (c) => {
        if (c.row('continuityResolutions', decisionId) !== null) c.remove('continuityResolutions', decisionId);
      },
    );
  }
}

/** The autosave key of a typed change to canon (`canon:<novel>:<key>`). */
export const canonSaveKey = (novelId: string, key: string): string => `canon:${novelId}:${key}`;
