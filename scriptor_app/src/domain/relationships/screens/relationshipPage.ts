// One relationship: who is who, how it evolved, and each stage of its history, with the stage editor and the "add a
// relationship" flow. The logic of flutter_app/lib/features/relationships/relationship_page.dart: what the page
// shows, in its words and order, and what each press changes (a StageInput for RelationChanges.updateStage, or the
// call to make). Changing how it stands adds a stage; a correction changes only the stage corrected.

import { type JsonMap, mapOrNull } from '../../json';
import { type Connection, deriveConnections } from '../../model/connections';
import { type StoryModel } from '../../model/storyModel';
import { EventDate } from '../../records/event';
import { type CharacterRelation, type RelationStage } from '../../records/relation';
import { dartToLowerCase, dartTrim } from '../../text/dartString';
import { formatDate } from '../../timeline/dates';
import { stageDifferences, stageTypeLabel, timelineOf } from '../history';
import { type StageInput } from '../relationChanges';
import {
  type Affinity,
  type RelationCategory,
  type RelationPreset,
  type RelationSettings,
  affinities,
  affinityLabels,
  attributeMax,
  feelingLabel,
  relationCategories,
  relationCategoryLabels,
  relationPresets,
  typeFor,
} from '../relationTypes';
import {
  type Choice,
  type Chooser,
  charactersOf,
  documentChooser,
  documentLabel,
  documentName,
  documentsOf,
  goneChoice,
} from './cast';

export const relationshipPath = (relationId: string): string => `/organize/relationship/${relationId}`;

/** The page of the novel's types and attributes ("Types and attributes…"). */
export const relationSettingsPath = '/organize/relationships/settings';

/** The types offered for a stage: built-in ones the novel offers, its own, and Custom; the stage's own type always. */
export function offeredTypes(settings: RelationSettings, current: string | null = null): RelationPreset[] {
  const hidden = settings.hidden;
  const types = settings.types;
  return [
    ...relationPresets.filter((p) => p.key === 'custom' || !hidden.includes(p.key) || p.key === current),
    ...types.map((t) => typeFor(t.key, types)),
  ];
}

/** The page when the relationship is not there (or no novel is open). The action goes to the Library, or to the
 * Characters page (Organize). */
export function relationshipNotFound(novelOpen: boolean): {
  title: string;
  message: string;
  action: { label: string; to: 'library' | 'organize' };
} {
  return {
    title: 'Relationship not found',
    message: novelOpen ? 'It may have been deleted.' : 'No novel is open.',
    action: novelOpen ? { label: 'Characters', to: 'organize' } : { label: 'Go to Library', to: 'library' },
  };
}

/** A character's name on the page; "Someone deleted" when gone. */
export function nameOn(model: StoryModel, id: string): string {
  return model.entries.get(id)?.name ?? 'Someone deleted';
}

/** A confirmation before a destructive press. */
export type Confirm = { title: string; message: string; confirmLabel: string };

/** The value of the start chooser meaning "Not said". */
export const unknownStart = '\u0000unknown';

/** Where the reader meets a stage (`_StartChooser`): the start of the story (''), not said (`unknownStart`), or a
 * chapter or scene. A value no longer among them shows as the start. */
export function startChooser(model: StoryModel, value: string): Chooser {
  const docs = documentsOf(model);
  const known = value.length === 0 || value === unknownStart || docs.some((d) => d.id === value);
  return {
    label: 'Where the reader meets it',
    value: known ? value : '',
    choices: [
      { value: '', label: 'From the start of the story' },
      { value: unknownStart, label: 'Not said' },
      ...docs.map((d) => ({ value: d.id, label: documentLabel(model, d) })),
    ],
  };
}

/** One line of "How it evolved". */
function evolutionLine(
  model: StoryModel,
  entry: { stage: RelationStage; range: string; orphaned: boolean },
  changes: readonly string[],
): string {
  const s = entry.stage;
  const story = s.storyAt;
  const eventName = (id: unknown) =>
    (typeof id === 'string' ? model.events.get(id)?.name : undefined) ?? 'an event since deleted';
  const when =
    story === null
      ? null
      : story['kind'] === 'event'
        ? `in story time at “${eventName(story['eventId'])}”`
        : `in story time ${formatDate(EventDate.fromJson(story['when']), (id) => model.events.get(id)?.name ?? null, model.calendar)}`;
  const causes = [
    ...(s.causeEventId !== null ? [`brought about by “${eventName(s.causeEventId)}”`] : []),
    ...(s.causeNodeId !== null ? [`shown in ${documentName(model, s.causeNodeId)}`] : []),
    ...(dartTrim(s.event).length > 0 ? [`origin: ${dartTrim(s.event)}`] : []),
  ];
  return [
    entry.range,
    ...(when !== null ? [when] : []),
    `${stageTypeLabel(s)} · ${feelingLabel(s.affinity)}${s.title.length > 0 ? ` · “${s.title}”` : ''}`,
    ...(changes.length > 0 ? [`changed ${changes.join('; ')}`] : []),
    causes.length > 0 ? causes.join(', ') : 'No cause recorded. None is assumed from when it happened.',
    ...(entry.orphaned ? ['its chapter was deleted, so it counts from the start'] : []),
  ].join(' · ');
}

/** One tracked attribute on a stage card: its heading and a chooser each way. */
export type AttributeView = {
  key: string;
  heading: string;
  sides: { side: 'from' | 'to'; chooser: Chooser<number | null> }[];
};

/** One stage's card: everything it shows, in order. */
export type StageCardView = {
  stageId: string;
  number: number;
  /** "Stage 2 · Chapters 3–5". */
  header: string;
  /** A stage whose chapter is not said can be moved earlier or later. */
  movable: boolean;
  moveEarlierTooltip: string;
  moveLaterTooltip: string;
  /** Null when it is the only stage: the last one is not removed. */
  remove: { tooltip: string; confirm: Confirm } | null;
  start: Chooser;
  /** Each type as "Friends · Social". */
  type: Chooser;
  /** For a Custom type: its own wording to edit. */
  custom: {
    name: { label: string; value: string };
    oneWay: { label: string; value: boolean };
    fromRole: { label: string; value: string };
    /** Only for a one-way type. */
    toRole: { label: string; value: string } | null;
    group: Chooser<RelationCategory>;
  } | null;
  /** For a built-in or own one-way type: "Kael is the Mentor; Mira is the Student." */
  roles: string | null;
  title: { label: string; hint: string; value: string };
  feelingHeading: string;
  feelings: { affinity: Affinity; label: string; selected: boolean }[];
  attributes: AttributeView[];
  storyTime: Chooser<StoryTimeChoice>;
  /** When it is at an event: which. */
  storyEvent: Chooser | null;
  /** When it is on a date: the date editor's input (its `when`, the legend and the precisions offered). */
  storyDate: { when: JsonMap | null; legend: string; offered: readonly string[] } | null;
  cause: Chooser;
  shownIn: Chooser;
  origin: { label: string; value: string; multiline: true };
  notes: { label: string; value: string; multiline: true };
};

export type StoryTimeChoice = '' | 'event' | 'date';

/** An event chooser (`_eventChooser`): not said (''), one since deleted (`goneChoice`), or an event of the novel. */
export function eventChooser(model: StoryModel, label: string, value: string | null): Chooser {
  const known = value === null || model.events.has(value);
  return {
    label,
    value: known ? (value ?? '') : goneChoice,
    choices: [
      { value: '', label: 'Not said' },
      ...(known ? [] : [{ value: goneChoice, label: 'An event since deleted' }]),
      ...[...model.events.values()].map((e) => ({ value: e.id, label: e.name })),
    ],
  };
}

const attributeChoices: Choice<number | null>[] = [
  { value: null, label: 'Not said' },
  ...Array.from({ length: attributeMax + 1 }, (_, i) => ({ value: i, label: `${i}` })),
];

function stageCard(
  model: StoryModel,
  relation: CharacterRelation,
  stage: RelationStage,
  number: number,
  range: string,
  settings: RelationSettings,
  names: { from: string; to: string },
): StageCardView {
  const types = offeredTypes(settings, stage.preset);
  const story = stage.storyAt;
  const start = stage.startUnknown ? unknownStart : (stage.startNodeId ?? '');
  const eventId = story?.['eventId'];
  return {
    stageId: stage.id,
    number,
    header: `Stage ${number} · ${range}`,
    movable: stage.startUnknown,
    moveEarlierTooltip: 'Move this stage earlier',
    moveLaterTooltip: 'Move this stage later',
    remove:
      relation.stages.length > 1
        ? {
            tooltip: 'Remove this stage',
            confirm: {
              title: `Remove stage ${number}?`,
              message: 'The stages around it then meet. The other stages are not changed.',
              confirmLabel: 'Remove stage',
            },
          }
        : null,
    start: startChooser(model, start),
    type: {
      label: 'Type',
      value: types.some((t) => t.key === stage.preset) ? stage.preset : 'custom',
      choices: types.map((t) => ({ value: t.key, label: `${t.label} · ${relationCategoryLabels[t.category]}` })),
    },
    custom:
      stage.preset === 'custom'
        ? {
            name: { label: 'Its name', value: stage.label },
            oneWay: { label: 'One-way: each side has its own role', value: stage.directional },
            fromRole: { label: `${names.from} is…`, value: stage.fromRole },
            toRole: stage.directional ? { label: `${names.to} is…`, value: stage.toRole } : null,
            group: {
              label: 'Group',
              value: relationCategories.find((c) => c === stage.category) ?? 'custom',
              choices: relationCategories.map((c) => ({ value: c, label: relationCategoryLabels[c] })),
            },
          }
        : null,
    roles:
      stage.preset !== 'custom' && stage.directional
        ? `${names.from} is the ${stage.fromRole}; ${names.to} is the ${stage.toRole}.`
        : null,
    title: { label: 'Title of this phase (optional)', hint: 'Rivalry over the Royal Tournament', value: stage.title },
    feelingHeading: 'How they feel',
    feelings: affinities.map((a) => ({ affinity: a, label: affinityLabels[a], selected: stage.affinity === a })),
    attributes: settings.attributes.map((a) => ({
      key: a.key,
      heading: `${a.label}, from 0 to ${attributeMax} (empty: not said)`,
      sides: (
        [
          ['from', names.from, names.to],
          ['to', names.to, names.from],
        ] as const
      ).map(([side, who, toward]) => ({
        side,
        chooser: {
          label: `${who} toward ${toward}`,
          value: side === 'from' ? stage.attribute(a.key).from : stage.attribute(a.key).to,
          choices: attributeChoices,
        },
      })),
    })),
    storyTime: {
      label: 'When in story time',
      value: story?.['kind'] === 'date' ? 'date' : story?.['kind'] === 'event' ? 'event' : '',
      choices: [
        { value: '', label: 'Not said' },
        { value: 'event', label: 'At an event…' },
        { value: 'date', label: 'On a date…' },
      ],
    },
    storyEvent:
      story?.['kind'] === 'event'
        ? eventChooser(model, 'At the event', typeof eventId === 'string' && eventId.length > 0 ? eventId : null)
        : null,
    storyDate:
      story?.['kind'] === 'date'
        ? {
            when: mapOrNull(story['when']),
            legend: 'On a date in story time',
            offered: ['exact', 'approximate', 'relative'],
          }
        : null,
    cause: eventChooser(model, 'Brought about by (an event)', stage.causeEventId),
    shownIn: documentChooser(model, 'Shown in (a chapter or scene)', stage.causeNodeId, 'Not said'),
    origin: { label: 'Origin: what brought this about, in your words', value: stage.event, multiline: true },
    notes: { label: 'Notes', value: stage.notes, multiline: true },
  };
}

/** The whole page, as it reads. */
export type RelationshipPageView = {
  relationId: string;
  fromId: string;
  toId: string;
  /** "Kael and Mira". */
  title: string;
  /** "Rivals · Hostile", or "Relationship" with no stage. */
  subtitle: string;
  /** Back to the first character's profile, at its relationships tab. */
  back: { label: string; characterId: string; tab: 'relationships' };
  whoIsWhoTitle: string;
  /** "Kael (Mentor) → Mira (Student)", or "Kael and Mira: the same both ways now." */
  whoIsWho: string;
  openFrom: string;
  openTo: string;
  swapLabel: string;
  deleteLabel: string;
  deleteConfirm: Confirm;
  evolutionTitle: string;
  evolutionCaption: string;
  /** One line per stage, in order. */
  evolution: string[];
  recordChangeLabel: string;
  settingsLabel: string;
  stages: StageCardView[];
  betweenTitle: string;
  betweenCaption: string;
  /** Other connections between the two; empty: `betweenNone`. */
  between: string[];
  betweenNone: string;
};

/** The page of one relationship; null when it is not in the novel (`relationshipNotFound`). `connections` is the
 * novel's derived connections when the caller has them already. */
export function relationshipPageView(
  model: StoryModel,
  settings: RelationSettings,
  relationId: string,
  connections: readonly Connection[] = deriveConnections(model).connections,
): RelationshipPageView | null {
  const relation = model.relations.get(relationId);
  if (relation === undefined) return null;
  const name = (id: string) => nameOn(model, id);
  const from = name(relation.fromId);
  const to = name(relation.toId);
  const timeline = timelineOf(relation, model.order);
  const latest = timeline.length === 0 ? null : timeline[timeline.length - 1].stage;
  const between = connections.filter(
    (c) =>
      c.kind === 'link' &&
      [relation.fromId, relation.toId].every((id) => c.from.id === id || c.to.id === id) &&
      c.from.type === 'entry' &&
      c.to.type === 'entry',
  );
  return {
    relationId: relation.id,
    fromId: relation.fromId,
    toId: relation.toId,
    title: `${from} and ${to}`,
    subtitle: latest === null ? 'Relationship' : `${stageTypeLabel(latest)} · ${feelingLabel(latest.affinity)}`,
    back: { label: from, characterId: relation.fromId, tab: 'relationships' },
    whoIsWhoTitle: 'Who is who',
    whoIsWho:
      latest !== null && latest.directional
        ? `${from} (${latest.fromRole}) → ${to} (${latest.toRole})`
        : `${from} and ${to}: the same both ways now.`,
    openFrom: `Open ${from}`,
    openTo: `Open ${to}`,
    swapLabel: 'Swap who is who',
    deleteLabel: 'Delete relationship…',
    deleteConfirm: {
      title: 'Delete this relationship?',
      message: `Its whole history goes, with the connections recorded on it. ${from} and ${to} are not changed.`,
      confirmLabel: 'Delete relationship',
    },
    evolutionTitle: 'How it evolved',
    evolutionCaption:
      'Every state in order, what changed from the one before, and what brought it about, as you recorded it.',
    evolution: timeline.map((t, i) =>
      evolutionLine(
        model,
        t,
        stageDifferences(i === 0 ? null : timeline[i - 1].stage, t.stage, {
          fromName: from,
          toName: to,
          attributes: settings.attributes,
        }),
      ),
    ),
    recordChangeLabel: 'Record a change…',
    settingsLabel: 'Types and attributes…',
    stages: timeline.map((t, i) => stageCard(model, relation, t.stage, i + 1, t.range, settings, { from, to })),
    betweenTitle: 'Also recorded between them',
    betweenCaption:
      'Connections made elsewhere between the same two characters: their own records, read from where they are kept.',
    between: between.map(
      (c) => `${name(c.from.id)} ${c.label.length === 0 ? 'related to' : dartToLowerCase(c.label)} ${name(c.to.id)}`,
    ),
    betweenNone: 'None.',
  };
}

// --------------------------------------------------------------------------------------------------- the presses

/** "Swap who is who": `RelationChanges.reverse(relationId)`. "Delete relationship…" (after `deleteConfirm`): go to the
 * first character's relationships tab, then `RelationChanges.removeRelation(relationId)`. "Record a change…": the
 * dialog below, then `addStage(relationId, nodeId, { unknown })` and `recordedChangeMessage`. */
export const recordChangeDialog = {
  title: 'Record a change',
  text: 'Where does the reader meet it? Every earlier stage stays exactly as it is.',
  cancel: 'Cancel',
  confirm: 'Add the stage',
} as const;

/** What the "Record a change" dialog gives for the start chosen there (its value starts as ''). */
export function whereChosen(where: string): { nodeId: string | null; unknown: boolean } {
  return { nodeId: where.length === 0 || where === unknownStart ? null : where, unknown: where === unknownStart };
}

export const recordedChangeMessage =
  'A new stage is added, starting as things stood. Change it below; every earlier stage is kept as it was.';

/** Typing in a stage's text is saved through autosave under this key (`relateLater`); the rest is saved at once. */
export function stageSaveKey(stageId: string, what: 'label' | 'from' | 'to' | 'title' | 'event' | 'notes'): string {
  return `stage:${stageId}:${what}`;
}

/** Moving a stage: `moveStage(relationId, stageId, -1)` earlier, `+1` later. Removing one (after its confirm):
 * `removeStage(relationId, stageId)`. Every StageInput below goes to `updateStage(relationId, stageId, input)`. */
export function startChosen(v: string): StageInput {
  return v === unknownStart ? { startUnknown: true } : { start: { value: v.length === 0 ? null : v } };
}

export const typeChosen = (key: string): StageInput => ({ preset: key });
export const nameTyped = (v: string): StageInput => ({ label: v });
export const oneWayChosen = (on: boolean): StageInput => ({ directional: on });
export const fromRoleTyped = (v: string): StageInput => ({ fromRole: v });
export const toRoleTyped = (v: string): StageInput => ({ toRole: v });
export const groupChosen = (c: RelationCategory): StageInput => ({ category: c });
export const titleTyped = (v: string): StageInput => ({ title: v });
export const feelingChosen = (a: Affinity): StageInput => ({ affinity: a });
export const originTyped = (v: string): StageInput => ({ event: v });
export const notesTyped = (v: string): StageInput => ({ notes: v });

/** One side of a tracked attribute chosen (a value from 0 to 10, or null for "not said"); the other side is kept. */
export function attributeChosen(key: string, side: 'from' | 'to', v: number | null): StageInput {
  return { attributes: new Map([[key, { from: v, to: v, setFrom: side === 'from', setTo: side === 'to' }]]) };
}

/** "When in story time" chosen: what to change, a message to show instead, or nothing (the choice already holds). */
export function storyTimeChosen(
  model: StoryModel,
  stage: RelationStage,
  v: StoryTimeChoice,
): { input: StageInput } | { tell: string } | null {
  const kind = stage.storyAt?.['kind'];
  if (v === '') return { input: { storyEventId: { value: null } } };
  if (v === 'event' && kind !== 'event') {
    const first = model.events.keys().next();
    if (first.done === true) {
      return { tell: 'There are no events on the timeline yet. Add one under Plan, or give a date.' };
    }
    return { input: { storyEventId: { value: first.value } } };
  }
  if (v === 'date' && kind !== 'date') {
    return {
      input: {
        storyDate: { value: { precision: 'exact', year: 1, month: null, day: null, hour: null, minute: null } },
      },
    };
  }
  return null;
}

/** An event chosen for "At the event": the StageInput, or null when the choice was the deleted one. */
export function storyEventChosen(v: string | null): StageInput | null {
  return v === goneChoice ? null : { storyEventId: { value: v === null || v.length === 0 ? null : v } };
}

/** The date editor's change to the stage's date: `edit` makes the new date from the one stored. */
export function storyDateEdited(stage: RelationStage, edit: (when: JsonMap) => JsonMap): StageInput {
  return { storyDate: { value: edit(mapOrNull(stage.storyAt?.['when']) ?? {}) } };
}

/** An event chosen for "Brought about by": the StageInput, or null when the choice was the deleted one. */
export function causeEventChosen(v: string | null): StageInput | null {
  return v === goneChoice ? null : { causeEventId: { value: v === null || v.length === 0 ? null : v } };
}

/** A chapter or scene chosen for "Shown in": the StageInput, or null when the choice was the deleted one. */
export function shownInChosen(v: string | null): StageInput | null {
  return v === goneChoice ? null : { causeNodeId: { value: v === null || v.length === 0 ? null : v } };
}

// --------------------------------------------------------------------------------------- adding a relationship

/** "Add a relationship" from a character (`addRelationshipFlow`): who can be chosen (characters not yet tied to this
 * one, by name), the types offered, and the words. With nobody left, `tell` instead of the dialog. The press makes
 * `RelationChanges.createRelation(fromId, otherId, typeKey)` and opens `relationshipPath` of the new relationship. */
export function addRelationshipDialog(
  model: StoryModel,
  settings: RelationSettings,
  fromId: string,
):
  | { tell: string }
  | {
      title: string;
      with: { label: string; choices: Choice[] };
      type: { label: string; helper: string; value: string; choices: Choice[] };
      cancel: string;
      confirm: string;
    } {
  const tied = new Set<string>();
  for (const r of model.relations.values()) {
    if (r.fromId === fromId) tied.add(r.toId);
    else if (r.toId === fromId) tied.add(r.fromId);
  }
  const others = charactersOf(model, fromId).filter((e) => !tied.has(e.id));
  if (others.length === 0) {
    return { tell: 'Every other character already has a relationship with this one. Record a change on it instead.' };
  }
  return {
    title: 'Add a relationship',
    with: { label: 'With', choices: others.map((e) => ({ value: e.id, label: e.name })) },
    type: {
      label: 'Type',
      helper: 'For a one-way type, this character takes the first role (the Parent, the Mentor).',
      value: 'friends',
      choices: offeredTypes(settings).map((t) => ({ value: t.key, label: t.label })),
    },
    cancel: 'Cancel',
    confirm: 'Add',
  };
}
