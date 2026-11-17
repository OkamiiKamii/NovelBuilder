// RELATIONSHIP TYPES (as in the original app): the built-in kinds, the novel's own, and the attributes it tracks. A
// port of flutter_app/lib/shared/domain/relationships/relation_types.dart.

import { type JsonMap, str } from '../json';
import { boolOf, freezeMap, maps, strings } from '../records/jsonRecord';

export type RelationCategory = 'family' | 'social' | 'mentorship' | 'romance' | 'hierarchy' | 'custom';

export const relationCategories: readonly RelationCategory[] = [
  'family',
  'social',
  'mentorship',
  'romance',
  'hierarchy',
  'custom',
];

export const relationCategoryLabels: Readonly<Record<RelationCategory, string>> = {
  family: 'Family',
  social: 'Social',
  mentorship: 'Mentorship',
  romance: 'Romance',
  hierarchy: 'Hierarchy',
  custom: 'Custom',
};

/** `RelationCategory.of`: the group by its name; anything else is Custom. */
export function relationCategoryOf(value: unknown): RelationCategory {
  return relationCategories.find((c) => c === value) ?? 'custom';
}

/** A type as a stage uses it: what the first character is to the second, and the second to the first. */
export class RelationPreset {
  constructor(
    readonly key: string,
    readonly category: RelationCategory,
    readonly label: string,
    readonly fromRole: string,
    readonly toRole: string,
    /** True when the two roles differ (Parent → Child); false when both sides are the same (Friends). */
    readonly directional: boolean,
  ) {}
}

const pair = (key: string, c: RelationCategory, from: string, to: string) =>
  new RelationPreset(key, c, `${from} / ${to}`, from, to, true);
const mutual = (key: string, c: RelationCategory, label: string, role: string) =>
  new RelationPreset(key, c, label, role, role, false);

export const relationPresets: readonly RelationPreset[] = [
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
  new RelationPreset('custom', 'custom', 'Custom', '', '', false),
];

/** A built-in type by key; Custom when there is none. */
export function presetFor(key: string): RelationPreset {
  return relationPresets.find((p) => p.key === key) ?? relationPresets[relationPresets.length - 1];
}

/** How the two feel about each other, from coldest to warmest. */
export type Affinity = 'hostile' | 'reluctant' | 'neutral' | 'friendly' | 'trusting';

export const affinities: readonly Affinity[] = ['hostile', 'reluctant', 'neutral', 'friendly', 'trusting'];

export const affinityLabels: Readonly<Record<Affinity, string>> = {
  hostile: 'Hostile',
  reluctant: 'Reluctant',
  neutral: 'Neutral',
  friendly: 'Friendly',
  trusting: 'Trusting',
};

/** `Affinity.of`: the feeling by its name, or null. */
export function affinityOf(value: unknown): Affinity | null {
  return affinities.find((a) => a === value) ?? null;
}

/** The feeling as a stage shows it: its label, Neutral when not one of the five. */
export function feelingLabel(affinity: unknown): string {
  return affinityLabels[affinityOf(affinity) ?? 'neutral'];
}

/** A built-in type's key, or a type of the author's own: `type:<id>`. */
export const typePrefix = 'type:';

/** A relationship type the author made, offered beside the built-in ones. */
export class RelationType {
  readonly raw: JsonMap;
  constructor(raw: JsonMap) {
    this.raw = freezeMap(raw);
  }

  get id(): string {
    return str(this.raw['id']);
  }
  get label(): string {
    return str(this.raw['label']);
  }
  get category(): RelationCategory {
    return relationCategoryOf(this.raw['category']);
  }
  get fromRole(): string {
    return str(this.raw['fromRole']);
  }
  get toRole(): string {
    return str(this.raw['toRole']);
  }
  get directional(): boolean {
    return boolOf(this.raw['directional']);
  }
  get key(): string {
    return `${typePrefix}${this.id}`;
  }
}

export class TrackedAttribute {
  constructor(
    readonly key: string,
    readonly label: string,
  ) {}

  toJson(): JsonMap {
    return { key: this.key, label: this.label };
  }
}

/** Attributes offered for tracking. None is tracked until the author chooses it. */
export const suggestedAttributes: readonly TrackedAttribute[] = [
  new TrackedAttribute('trust', 'Trust'),
  new TrackedAttribute('affection', 'Affection'),
  new TrackedAttribute('fear', 'Fear'),
  new TrackedAttribute('loyalty', 'Loyalty'),
  new TrackedAttribute('hostility', 'Hostility'),
  new TrackedAttribute('respect', 'Respect'),
];

export const attributeMax = 10;

/** A novel's own relationship settings (one `relationSettings` row). No row: built-in types only, nothing tracked. */
export class RelationSettings {
  readonly raw: JsonMap;
  constructor(raw: JsonMap | null | undefined) {
    this.raw = freezeMap(raw ?? {});
  }

  get types(): RelationType[] {
    return maps(this.raw['types']).map((t) => new RelationType(t));
  }
  get hidden(): string[] {
    return strings(this.raw['hidden']);
  }
  get attributes(): TrackedAttribute[] {
    return maps(this.raw['attributes']).map((a) => new TrackedAttribute(str(a['key']), str(a['label'])));
  }
}

/** The settings of a novel, from its rows (`RelationSettings(rows('relationSettings').firstOrNull)`). */
export function relationSettingsOf(rows: readonly JsonMap[]): RelationSettings {
  return new RelationSettings(rows[0] ?? null);
}

/** A type as a stage uses it: built-in, the novel's own, or Custom when it is neither (or no longer exists). */
export function typeFor(key: string, types: readonly RelationType[] = []): RelationPreset {
  if (key.startsWith(typePrefix)) {
    const own = types.find((t) => t.key === key);
    if (own !== undefined) {
      return new RelationPreset(key, own.category, own.label, own.fromRole, own.toRole, own.directional);
    }
  }
  return presetFor(key);
}
