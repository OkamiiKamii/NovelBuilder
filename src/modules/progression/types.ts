export const STATUS_DIMENSIONS = ['condition', 'transformations', 'reputation', 'knowledge', 'goals'] as const;
export type StatusDimension = (typeof STATUS_DIMENSIONS)[number];
export const DIMENSION_LABELS: Record<StatusDimension, string> = {
  condition: 'Physical condition & injuries',
  transformations: 'Active transformations',
  reputation: 'Reputation & standing',
  knowledge: 'Knowledge & secrets known',
  goals: 'Personal goals',
};
export const DIMENSION_HINTS: Record<StatusDimension, string> = {
  condition: 'Broken left arm\nExhausted',
  transformations: 'Wolf form (until dawn)',
  reputation: 'Ash Guild: trusted\nThe Crown: wanted',
  knowledge: 'Knows the prince is alive',
  goals: 'Find her brother',
};

export const GEAR_KINDS = ['Equipped', 'Weapon', 'Bound artifact', 'Key item', 'Carried'];

/** Something the character has at this point. May point at an item in the Codex; never changes it. */
export interface GearItem {
  id: string;
  name: string;
  /** How it is held, in the author's words. `GEAR_KINDS` are only suggestions. */
  kind: string;
  /** A codex entry for the item, when there is one. */
  entryId: string | null;
  note: string;
}

/**
 * A character's standing in one system at one point in the story. The same
 * shape as a system sheet, plus:
 *
 * AUTHOR PRIMACY & MANUAL OVERRIDE RULE
 * `auto` is the author's choice, per snapshot and per system, of whether the
 * blueprint's formulas and class effects are applied at all. `overrides`
 * holds any value the author has set by hand; a value set by hand always
 * wins over what the system would work out, and nothing ever rewrites it.
 */
export interface SnapshotSystem {
  auto: boolean;
  values: Record<string, number | string>;
  progress: Record<string, number | string>;
  itemIds: string[];
  overrides: Record<string, number | string>;
}

/**
 * A character's whole state at one point in the story. Each snapshot is
 * complete in itself: reading the state at a chapter never has to replay
 * history, and editing one snapshot never alters another.
 */
export interface ProgressSnapshot {
  id: string;
  projectId: string;
  /** The codex entry: usually a character, but anything that changes can be tracked. */
  entryId: string;
  /** The chapter or scene it is true from. Null: before the story begins. */
  nodeId: string | null;
  /** "Before the evolution", "After the tournament". */
  label: string;
  /** By system id. */
  systems: Record<string, SnapshotSystem>;
  gear: GearItem[];
  /** One line per thing, per dimension. */
  status: Record<StatusDimension, string>;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export type SnapshotChanges = Partial<Pick<ProgressSnapshot, 'nodeId' | 'label' | 'systems' | 'gear' | 'status' | 'notes'>>;

export const EMPTY_STATUS: Record<StatusDimension, string> = { condition: '', transformations: '', reputation: '', knowledge: '', goals: '' };
export const emptySystem = (): SnapshotSystem => ({ auto: true, values: {}, progress: {}, itemIds: [], overrides: {} });
