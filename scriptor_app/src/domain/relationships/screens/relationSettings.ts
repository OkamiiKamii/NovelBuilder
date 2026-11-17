// The novel's relationship types and the attributes it tracks. The logic of
// flutter_app/lib/features/relationships/relation_settings_page.dart. Nothing is tracked until the author chooses it;
// changing a type re-words the relationships using it; deleting one keeps their wording, as Custom.

import { type StoryModel } from '../../model/storyModel';
import { dartTrim } from '../../text/dartString';
import { type RelationChanges } from '../relationChanges';
import {
  type RelationCategory,
  type RelationSettings,
  type RelationType,
  type TrackedAttribute,
  attributeMax,
  relationCategories,
  relationCategoryLabels,
  relationPresets,
  suggestedAttributes,
} from '../relationTypes';
import { type Chooser } from './cast';
import { type Confirm } from './relationshipPage';

export const relationSettingsTitle = 'Relationship types and attributes';

/** The page with no novel open: its action goes to the Library. */
export const relationSettingsNoNovel = {
  title: 'No novel open',
  message: 'These belong to a novel. Open one from the Library.',
  action: 'Go to Library',
} as const;

export type OwnTypeRow = {
  type: RelationType;
  title: string;
  /** "Hierarchy · Liege → Sworn", "Custom · the same both ways". */
  subtitle: string;
  editTooltip: string;
  deleteTooltip: string;
  deleteConfirm: Confirm;
};

export type BuiltInRow = {
  key: string;
  title: string;
  /** "Social · in use". */
  subtitle: string;
  /** Offered: the switch is on. Turning it changes `offerBuiltIn(key, { offered })`. */
  offered: boolean;
};

export type RelationSettingsView = {
  title: string;
  /** The novel's title. */
  subtitle: string;
  backLabel: string;
  ownTitle: string;
  ownCaption: string;
  newTypeLabel: string;
  /** Empty: `ownNone`. */
  own: OwnTypeRow[];
  ownNone: string;
  builtInTitle: string;
  builtIn: BuiltInRow[];
  attributesTitle: string;
  attributesCaption: string;
  /** The suggested attributes, each a chip: selected when tracked. On: `trackAttribute(key)`; off:
   * `untrackAttribute(key)`. */
  suggested: { attribute: TrackedAttribute; selected: boolean }[];
  /** The author's own tracked attributes, each a chip whose delete is `untrackAttribute(key)`. */
  ownAttributes: { attribute: TrackedAttribute; deleteTooltip: string }[];
  ownAttributeLabel: string;
};

/** The page, as it reads. */
export function relationSettingsView(
  model: StoryModel,
  settings: RelationSettings,
  novelTitle: string,
): RelationSettingsView {
  const inUse = new Set<string>();
  for (const r of model.relations.values()) for (const s of r.stages) inUse.add(s.preset);
  const tracked = new Set(settings.attributes.map((a) => a.key));
  return {
    title: relationSettingsTitle,
    subtitle: novelTitle,
    backLabel: 'Characters',
    ownTitle: 'Your own types',
    ownCaption: 'Offered beside the built-in types. A one-way type has a role for each side (Liege → Sworn).',
    newTypeLabel: 'New type',
    own: settings.types.map((t) => ({
      type: t,
      title: t.label,
      subtitle: `${relationCategoryLabels[t.category]} · ${t.directional ? `${t.fromRole} → ${t.toRole}` : 'the same both ways'}`,
      editTooltip: `Change ${t.label}`,
      deleteTooltip: `Delete ${t.label}`,
      deleteConfirm: {
        title: `Delete the type “${t.label}”?`,
        message: 'Relationships using it keep their wording, as Custom. Nothing about them is lost.',
        confirmLabel: 'Delete type',
      },
    })),
    ownNone: 'None yet.',
    builtInTitle: 'Built-in types offered',
    builtIn: relationPresets
      .filter((p) => p.key !== 'custom')
      .map((p) => ({
        key: p.key,
        title: p.label,
        subtitle: `${relationCategoryLabels[p.category]}${inUse.has(p.key) ? ' · in use' : ''}`,
        offered: !settings.hidden.includes(p.key),
      })),
    attributesTitle: 'Attributes to track',
    attributesCaption:
      `None is tracked until you choose. Each is given at each stage, from 0 to ${attributeMax}, each way: trust ` +
      'need not be returned. Untracking keeps the values given.',
    suggested: suggestedAttributes.map((a) => ({ attribute: a, selected: tracked.has(a.key) })),
    ownAttributes: settings.attributes
      .filter((a) => !suggestedAttributes.some((s) => s.key === a.key))
      .map((a) => ({ attribute: a, deleteTooltip: `Stop tracking ${a.label}` })),
    ownAttributeLabel: 'Your own…',
  };
}

/** A suggested attribute's chip pressed. */
export function suggestedToggled(c: RelationChanges, key: string, on: boolean): void {
  if (on) c.trackAttribute(key);
  else c.untrackAttribute(key);
}

/** "Your own…": the prompt, and what its answer does (nothing for a blank one). */
export const ownAttributePrompt = {
  title: 'Track an attribute of your own',
  label: 'Name',
  hint: 'Debt',
  confirmLabel: 'Track it',
} as const;

export function ownAttributeGiven(c: RelationChanges, name: string | null): void {
  if (name !== null && dartTrim(name).length > 0) c.trackAttribute(name);
}

/** The type dialog's state: what is typed and chosen. */
export type TypeDraft = {
  label: string;
  fromRole: string;
  toRole: string;
  oneWay: boolean;
  category: RelationCategory;
};

/** The dialog for a new type, or for changing one, as it opens. */
export function typeDraftOf(editing: RelationType | null): TypeDraft {
  return {
    label: editing?.label ?? '',
    fromRole: editing?.fromRole ?? '',
    toRole: editing?.toRole ?? '',
    oneWay: editing?.directional ?? false,
    category: editing?.category ?? 'custom',
  };
}

/** The type dialog, as it reads for the draft. */
export function typeDialogView(
  editing: RelationType | null,
  draft: TypeDraft,
): {
  title: string;
  nameLabel: string;
  group: Chooser<RelationCategory>;
  oneWayLabel: string;
  fromLabel: string;
  /** Only for a one-way type. */
  toLabel: string | null;
  cancel: string;
  save: string;
} {
  return {
    title: editing === null ? 'New relationship type' : 'Change the type',
    nameLabel: 'Name',
    group: {
      label: 'Group',
      value: draft.category,
      choices: relationCategories.map((c) => ({ value: c, label: relationCategoryLabels[c] })),
    },
    oneWayLabel: 'One-way: each side has its own role',
    fromLabel: draft.oneWay ? 'The first is the…' : 'Each is a… (optional)',
    toLabel: draft.oneWay ? 'The second is the…' : null,
    cancel: 'Cancel',
    save: 'Save',
  };
}

/** "Save": the type made or changed (the dialog closes); a refusal (ChangeRefused) keeps it open. */
export function saveTypeDraft(c: RelationChanges, editing: RelationType | null, draft: TypeDraft): RelationType {
  return c.saveType({
    typeId: editing?.id ?? null,
    label: draft.label,
    category: draft.category,
    directional: draft.oneWay,
    fromRole: draft.fromRole,
    toRole: draft.toRole,
  });
}
