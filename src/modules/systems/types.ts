/**
 * UNRESTRICTED CUSTOMIZATION RULE
 * Nothing in a blueprint is a fixed game concept. Variables, progression
 * tracks, groups ("Classes", "Titles", "Mutations"…), ranks, units and
 * formulas are all named and shaped by the author. The code only knows the
 * four shapes below: a value, a ladder, a set of things a profile can hold,
 * and a grid.
 */

export const VARIABLE_KINDS = ['number', 'resource', 'derived', 'choice'] as const;
export type VariableKind = (typeof VARIABLE_KINDS)[number];
export const VARIABLE_KIND_LABELS: Record<VariableKind, string> = { number: 'Attribute', resource: 'Resource pool', derived: 'Formula', choice: 'Choice' };

/** A named value: a stat, a pool, something worked out from others, or one of a list of labels. */
export interface SysVariable {
  id: string;
  name: string;
  /** How formulas refer to it. Stays the same when the name is changed, so formulas keep working. */
  key: string;
  kind: VariableKind;
  /** Free text: "HP", "per minute", "li", "%". */
  unit: string;
  /** Starting value for an attribute or resource. */
  base: number;
  /** For a formula: how it is worked out, e.g. `strength * 1.5`. */
  formula: string;
  /** For a choice: the labels to choose from. */
  options: string[];
  note: string;
}

/** A step on a ladder of named stages: a realm, a rank, a tier. */
export interface Stage {
  id: string;
  name: string;
  /** A condition for reaching it: `qi >= 1000 AND Item: Foundation Pill`. */
  requires: string;
  /** The bottleneck or breakthrough in the author's words. */
  note: string;
}

/** A way of advancing: numbered levels with a curve, or named stages in order. */
export interface Track {
  id: string;
  name: string;
  key: string;
  kind: 'levels' | 'stages';
  /** Highest level, for numbered levels. */
  cap: number;
  /** What it takes to go from one level to the next, as a formula of this track's key. */
  curve: string;
  curveUnit: string;
  /** For numbered levels: points to place on attributes that each level after the first brings. 0 or absent: none. */
  points?: number;
  /** For numbered levels: what experience comes from, in the author's words ("Combat", "Quests"). Offered when logging; never enforced. */
  sources?: string[];
  stages: Stage[];
}

export const MODIFIER_OPS = ['add', 'multiply', 'set'] as const;
export type ModifierOp = (typeof MODIFIER_OPS)[number];
export const OP_LABELS: Record<ModifierOp, string> = { add: '+', multiply: '×', set: '=' };

export interface Modifier {
  id: string;
  /** Key of the variable it changes. */
  target: string;
  op: ModifierOp;
  /** A number or a formula. */
  value: string;
}

export interface Cost {
  id: string;
  /** Key of the variable that is spent. */
  target: string;
  amount: string;
}

/** A kind of thing a profile can hold: "Classes", "Skills", "Titles", "Affixes", "Mutations". */
export interface Group {
  id: string;
  name: string;
  /** A profile holds one of these at a time (a class) rather than any number (skills). */
  single: boolean;
}

/** One class, skill, title, affix, power… Everything except the name is optional. */
export interface SysItem {
  id: string;
  groupId: string;
  name: string;
  description: string;
  /** What it branches from or evolves out of, within the same blueprint. */
  parentId: string | null;
  /** One of the blueprint's ranks, by id, so renaming the rank keeps the item on it. */
  rankId: string | null;
  /** A condition: `Class: Void Mage AND level >= 50`. */
  requires: string;
  modifiers: Modifier[];
  costs: Cost[];
  cooldown: string;
  /** Element, school, affinity, origin: whatever the author sorts by. */
  affinity: string;
  /** When and into what it evolves, in words or as a condition. */
  evolution: string;
}

/** Something a blueprint names and points at by id: a rank, a row or column of a table. */
export interface Named {
  id: string;
  name: string;
}

/** A grid of free text: an elemental interaction chart, an affix table. */
export interface Matrix {
  id: string;
  name: string;
  rows: Named[];
  columns: Named[];
  /** Keyed by `rowId|columnId`. */
  cells: Record<string, string>;
}

export interface SystemBlueprint {
  id: string;
  projectId: string;
  name: string;
  description: string;
  variables: SysVariable[];
  tracks: Track[];
  /** Ranks for items, lowest first. */
  ranks: Named[];
  groups: Group[];
  items: SysItem[];
  matrices: Matrix[];
  createdAt: number;
  updatedAt: number;
}

export type BlueprintContent = Pick<SystemBlueprint, 'name' | 'description' | 'variables' | 'tracks' | 'ranks' | 'groups' | 'items' | 'matrices'>;

/**
 * A codex entry's place in a system: a character's stat sheet, or an item's.
 * It stores only what is particular to this entry (its own numbers, how far
 * it has advanced, and which classes, skills or powers it holds, by id).
 * Everything those bring with them is read from the blueprint each time, so
 * changing the blueprint changes every sheet.
 */
/**
 * Experience gained (or lost) at a point in the story. A sheet's level on a
 * track is its starting level plus what its logged experience buys on the
 * track's curve, so the level is never typed twice or left out of date.
 */
export interface XpEntry {
  id: string;
  trackId: string;
  /** Negative for a loss. */
  amount: number;
  /** Where it came from, in the author's words. */
  source: string;
  /** The chapter or scene it was earned in. Null: before the story. */
  nodeId: string | null;
  note: string;
}

export interface SystemSheet {
  id: string;
  projectId: string;
  systemId: string;
  entryId: string;
  /** This entry's own value for a variable, by variable id. Absent: the blueprint's starting value. */
  values: Record<string, number | string>;
  /** Where it stands on each track, by track id: a level number (the starting level, once experience is logged), or a stage id. */
  progress: Record<string, number | string>;
  itemIds: string[];
  /** Experience logged against numbered-level tracks. Absent on sheets made before levelling existed. */
  xp?: XpEntry[];
  /** Points placed on attributes, by variable id. They add to the attribute's own value. */
  spent?: Record<string, number>;
  note: string;
  createdAt: number;
  updatedAt: number;
}

/** The name of an item's rank as it is now; empty when it has none. */
export const rankName = (system: Pick<SystemBlueprint, 'ranks'>, item: Pick<SysItem, 'rankId'>): string => (item.rankId ? (system.ranks.find((r) => r.id === item.rankId)?.name ?? '') : '');

/** Turns a name into something a formula can use: "Max Health" becomes `max_health`. */
export const toKey = (name: string): string => name.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '') || 'value';
