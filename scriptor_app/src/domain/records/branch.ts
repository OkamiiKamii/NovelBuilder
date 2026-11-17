// How a novel relates to the novel it was forked from. A port of flutter_app/lib/shared/domain/records/branch.dart.

import { idOrNull, str } from '../json';
import { JsonRecord } from './jsonRecord';

/** The stored keys, in the Dart enum's order. */
export type BranchStatus = 'main' | 'alternate' | 'non-canon' | 'experimental' | 'abandoned';
export const branchStatuses: readonly BranchStatus[] = ['main', 'alternate', 'non-canon', 'experimental', 'abandoned'];

export const branchStatusLabel: Readonly<Record<BranchStatus, string>> = {
  main: 'Main Canon',
  alternate: 'Alternate Canon',
  'non-canon': 'Non-Canon',
  experimental: 'Experimental',
  abandoned: 'Abandoned',
};

export const branchStatusHint: Readonly<Record<BranchStatus, string>> = {
  main: 'The primary, official story.',
  alternate: 'An official alternate universe or second canon path.',
  'non-canon': 'A divergent outcome deliberately kept out of the main story.',
  experimental: 'A what-if, an alternate ending, a drafting trial.',
  abandoned: 'An experiment that has been set down.',
};

/** Dart's `BranchStatus.of`: `main` for anything unknown. */
export function branchStatusOf(value: unknown): BranchStatus {
  return branchStatuses.find((s) => s === value) ?? 'main';
}

/** Timeline/branch metadata: how a novel relates to the novel it was forked from.
 *
 * ZERO CROSS-CONTAMINATION RULE: a branch is a project in its own right, a complete copy with its own ids. This
 * record is the only tie between the two, and it holds no story data. `id` is the project it describes. */
export class BranchRecord extends JsonRecord {
  /** The project it was forked from. Null for the original. */
  get parentId(): string | null {
    return idOrNull(this.raw['parentId']);
  }
  /** The chapter, scene or group it was forked after. Null: before the story begins. */
  get forkNodeId(): string | null {
    return idOrNull(this.raw['forkNodeId']);
  }
  /** That node's title when the fork was made, kept for when the parent moves on. */
  get forkLabel(): string {
    return str(this.raw['forkLabel']);
  }
  get status(): BranchStatus {
    return branchStatusOf(this.raw['status']);
  }
  get note(): string {
    return str(this.raw['note']);
  }
}
