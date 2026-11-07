import type { EventDate } from '@/modules/timeline/types';
export const RELATION_CATEGORIES = ['family', 'social', 'mentorship', 'romance', 'hierarchy', 'custom'] as const;
export type RelationCategory = (typeof RELATION_CATEGORIES)[number];
export const RELATION_CATEGORY_LABELS: Record<RelationCategory, string> = { family: 'Family', social: 'Social', mentorship: 'Mentorship', romance: 'Romance', hierarchy: 'Hierarchy', custom: 'Custom' };

export interface RelationPreset {
  key: string;
  category: RelationCategory;
  label: string;
  /** What the first character is to the second, and the second to the first. */
  fromRole: string;
  toRole: string;
  /** True when the two roles differ (Parent → Child); false when both sides are the same (Friends). */
  directional: boolean;
}

const pair = (key: string, category: RelationCategory, fromRole: string, toRole: string): RelationPreset => ({ key, category, label: `${fromRole} / ${toRole}`, fromRole, toRole, directional: true });
const mutual = (key: string, category: RelationCategory, label: string, role: string): RelationPreset => ({ key, category, label, fromRole: role, toRole: role, directional: false });

export const RELATION_PRESETS: RelationPreset[] = [
  pair('parent-child', 'family', 'Parent', 'Child'),
  mutual('siblings', 'family', 'Siblings', 'Sibling'),
  mutual('spouses', 'family', 'Spouses', 'Spouse'),
  mutual('relatives', 'family', 'Relatives', 'Relative'),
  mutual('friends', 'social', 'Friends', 'Friend'),
  mutual('allies', 'social', 'Allies', 'Ally'),
  mutual('rivals', 'social', 'Rivals', 'Rival'),
  mutual('enemies', 'social', 'Enemies', 'Enemy'),
  pair('mentor-student', 'mentorship', 'Mentor', 'Student'),
  mutual('romantic-interest', 'romance', 'Romantic interest', 'Romantic interest'),
  mutual('partners', 'romance', 'Partners', 'Partner'),
  mutual('exes', 'romance', 'Exes', 'Ex'),
  pair('employer-employee', 'hierarchy', 'Employer', 'Employee'),
  pair('master-servant', 'hierarchy', 'Master', 'Servant'),
  pair('ruler-subject', 'hierarchy', 'Ruler', 'Subject'),
  mutual('political', 'hierarchy', 'Political tie', 'Political tie'),
  { key: 'custom', category: 'custom', label: 'Custom', fromRole: '', toRole: '', directional: false },
];
export const presetFor = (key: string): RelationPreset => RELATION_PRESETS.find((p) => p.key === key) ?? RELATION_PRESETS[RELATION_PRESETS.length - 1];

/** How the two feel about each other, from coldest to warmest. */
export const AFFINITIES = ['hostile', 'reluctant', 'neutral', 'friendly', 'trusting'] as const;
export type Affinity = (typeof AFFINITIES)[number];
export const AFFINITY_LABELS: Record<Affinity, string> = { hostile: 'Hostile', reluctant: 'Reluctant', neutral: 'Neutral', friendly: 'Friendly', trusting: 'Trusting' };

/**
 * The state of a relationship from one point in the story until the next
 * stage begins. A relationship's history is its list of stages.
 */
export interface RelationStage {
  id: string;
  /**
   * The volume, arc or chapter where this state begins, by its permanent id;
   * null means "from the start of the story". Because it is an id, the
   * timeline follows the manuscript when chapters are reordered or renamed.
   */
  startNodeId: string | null;
  /** Key of the preset this stage uses, or `custom`. */
  preset: string;
  category: RelationCategory;
  label: string;
  fromRole: string;
  toRole: string;
  directional: boolean;
  /** The author's own name for this phase, e.g. "Rivalry over the Royal Tournament". */
  title: string;
  affinity: Affinity;
  /** What happened to bring this state about. */
  event: string;
  notes: string;
  /** The tracked attributes at this stage, by key, each way. Absent or missing a key: not said. Added with Prompt 24. */
  attributes?: Record<string, AttributeValue>;
  // Added with Prompt 25. Each is the author's own statement; none is ever worked out.
  /** Where the reader meets this change is not said: it follows the stage recorded before it, and is not placed at any chapter. */
  startUnknown?: boolean;
  /** When it changes in the story's own time: at an event, or on a date as rough as the author knows it. Absent: not said. */
  storyAt?: StoryPoint | null;
  /** What brought it about, when the author says: a timeline event. */
  causeEventId?: string | null;
  /** Where it happens in the book, when the author says: a chapter or scene. */
  causeNodeId?: string | null;
}

/** A point in story time: an event, or a date (which may be approximate, or relative to an event). */
export type StoryPoint = { kind: 'event'; eventId: string } | { kind: 'date'; when: EventDate };

/**
 * A relationship between two codex entries (characters), with its history.
 * It refers to the entries by id only; the entries themselves are never
 * touched by anything in this module, and a relationship is deleted together
 * with either of its characters.
 */
export interface CharacterRelation {
  id: string;
  projectId: string;
  fromId: string;
  toId: string;
  stages: RelationStage[];
  createdAt: number;
  updatedAt: number;
}

export type StageChanges = Partial<Omit<RelationStage, 'id'>>;

/** A built-in type's key, or a type of the author's own: `type:<id>`. */
export const TYPE_PREFIX = 'type:';

/** A relationship type the author made, offered beside the built-in ones and used like them. */
export interface RelationType {
  id: string;
  label: string;
  category: RelationCategory;
  /** What the first character is to the second, and the second to the first. The same for a mutual type. */
  fromRole: string;
  toRole: string;
  directional: boolean;
}

/** Something a relationship can be measured by, each way, when the author chooses to track it. */
export interface TrackedAttribute {
  key: string;
  label: string;
}

/** Attributes offered for tracking. None is tracked until the author chooses it; the author may add their own. */
export const SUGGESTED_ATTRIBUTES: TrackedAttribute[] = [
  { key: 'trust', label: 'Trust' },
  { key: 'affection', label: 'Affection' },
  { key: 'fear', label: 'Fear' },
  { key: 'loyalty', label: 'Loyalty' },
  { key: 'hostility', label: 'Hostility' },
  { key: 'respect', label: 'Respect' },
];

/** Attributes are measured from 0 (none) to this. */
export const ATTRIBUTE_MAX = 10;

/**
 * How one attribute stands at a stage, each way: how the first character
 * feels toward the second (`from`), and the second toward the first (`to`).
 * Trust need not be returned. Null: not said.
 */
export interface AttributeValue {
  from: number | null;
  to: number | null;
}

/** A novel's own relationship settings: one row per project. No row: built-in types only, nothing tracked. */
export interface RelationSettings {
  id: string;
  projectId: string;
  types: RelationType[];
  /** Built-in types the author has chosen not to be offered. Ones already in use still show where they are used. */
  hidden: string[];
  attributes: TrackedAttribute[];
  updatedAt: number;
}

export const NO_SETTINGS: Omit<RelationSettings, 'id' | 'projectId' | 'updatedAt'> = { types: [], hidden: [], attributes: [] };

/** A type as a stage uses it: a built-in one, one of the author's own, or Custom when it is neither (or no longer exists). */
export function typeFor(key: string, types: RelationType[] = []): RelationPreset {
  if (key.startsWith(TYPE_PREFIX)) {
    const own = types.find((t) => `${TYPE_PREFIX}${t.id}` === key);
    if (own) return { key, category: own.category, label: own.label, fromRole: own.fromRole, toRole: own.toRole, directional: own.directional };
  }
  return presetFor(key);
}
