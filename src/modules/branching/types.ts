export const BRANCH_STATUSES = ['main', 'alternate', 'non-canon', 'experimental', 'abandoned'] as const;
export type BranchStatus = (typeof BRANCH_STATUSES)[number];
export const STATUS_LABELS: Record<BranchStatus, string> = { main: 'Main Canon', alternate: 'Alternate Canon', 'non-canon': 'Non-Canon', experimental: 'Experimental', abandoned: 'Abandoned' };
export const STATUS_HINTS: Record<BranchStatus, string> = {
  main: 'The primary, official story.',
  alternate: 'An official alternate universe or second canon path.',
  'non-canon': 'A divergent outcome deliberately kept out of the main story.',
  experimental: 'A what-if, an alternate ending, a drafting trial.',
  abandoned: 'An experiment that has been set down.',
};

/**
 * ZERO CROSS-CONTAMINATION RULE
 * A timeline is a project in its own right. It is created as a complete,
 * separate copy of its parent as the parent stood at the fork point, with
 * its own ids for every row, and from then on it is protected by the same
 * isolation that keeps one novel's data out of another's: no service can
 * reach from one into the other. This record is the only thing that ties
 * the two together, and it holds no story data: just where the timeline
 * came from and how the author classifies it.
 *
 * The one deliberate crossing is a merge the author asks for, chapter by
 * chapter (`mergeChapter`), and promotion, which only changes these labels.
 */
export interface TimelineRecord {
  /** The project this record describes. */
  id: string;
  /** The timeline it was forked from. Null for the original. */
  parentId: string | null;
  /** The chapter, scene or group in the parent it was forked after. Null: forked before the story begins. */
  forkNodeId: string | null;
  /** That node's title when the fork was made, kept for when the parent moves on. */
  forkLabel: string;
  status: BranchStatus;
  note: string;
  /**
   * For chapters, scenes and codex entries inherited at the fork: this
   * timeline's id for the row → the parent's id for the same row. Used only
   * to line chapters up for comparing and merging.
   */
  origins: Record<string, string>;
  createdAt: number;
}

/** One timeline in a family, with where it sits in the tree. */
export interface TimelineNode {
  projectId: string;
  title: string;
  status: BranchStatus;
  /** The nearest ancestor that still exists. */
  parentId: string | null;
  forkLabel: string;
  note: string;
  depth: number;
  children: TimelineNode[];
}
