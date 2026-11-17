// ONE CHARACTER'S PROGRESSION, on their Progression tab: what they are like at a point (the end of the story, a chapter,
// an event), the changes in order, and recording a new one; and "What is tracked", the novel's categories. Only what is
// recorded is shown: a character with nothing recorded has no level, no statistics, no empty rows.
//
// The pure parts of flutter_app/lib/features/progression/widgets/tracker.dart: what each part shows, in words, and what
// a press changes, as `(x: TrackChanges) => …` to run inside the novel's change (TrackChanges is trackChanges.ts).
//
// The tracker: a box titled "Progression" with its caption, "Choose what to track…" / "What is tracked…" (a text button
// with a tune icon); with nothing tracked, two lines; else a chooser 320 wide ("Progression as of"), the state (per
// category its name as a label, each line "Subject: **value** (step)" with the uncertain note in the error colour, the
// moments, "Once held: …" small), the unplaced and untracked notes (small), "Over the story" and the chart
// (progressChart.ts), "Changes, in order" (each a row: **words** (was …) · category, the subtitle, edit and delete
// buttons; delete asks first), and "Record a change" with the change form. The form is a wrap of fields: What changes
// (220), When (260), Gained or lost (160, held only), the subject (260, not for one value), Set to (200, value and
// named), Its codex entry (240, held and moment), Its ability in a system (240, held and moment, when the novel has
// abilities), Cost (200), Note (320), then the button.

import { localeCompare } from '../../exchange/collation';
import { type JsonMap } from '../../json';
import { compareNum } from '../../manuscript/dartSort';
import { type StoryModel } from '../../model/storyModel';
import { Anchor, EventAnchor, NodeAnchor, spanOfEvent } from '../../model/validity';
import { type ProgressCategory, type ProgressChange } from '../../records/progress';
import { stableSorted } from '../../reader/stableSort';
import { dartToLowerCase, dartTrim } from '../../text/dartString';
import { nodeLabel } from '../../timeline/narrative';
import {
  actionLabels,
  appliesTo,
  changeLog,
  changeWords,
  isUnknownTime,
  orderedCategories,
  progressPresets,
  progressShapes,
  progressAt,
  shapeHints,
  shapeLabels,
  unknownTime,
  whenWords,
} from '../track';
import { type TrackChanges } from '../trackChanges';
import { type ChartSeries, chartSeries } from './progressChart';

export type Choice = { value: string; label: string };

/** The events in story order (visualize/summaries.dart's `timelineRows`, as far as a menu needs it): dated ones by
 * their start, then the undated, each group by title. */
export function eventsInStoryOrder(model: StoryModel): { id: string; title: string }[] {
  const context = model.timeContext;
  const rows = [...model.events.values()].map((e) => ({
    id: e.id,
    title: e.name,
    start: spanOfEvent(e.id, context)?.lo ?? Number.POSITIVE_INFINITY,
  }));
  return stableSorted(rows, (a, b) => (a.start !== b.start ? compareNum(a.start, b.start) : localeCompare(a.title, b.title))).map(
    (r) => ({ id: r.id, title: r.title }),
  );
}

/** The points a change can be at, as menu entries: each chapter and scene in reading order, each event in story order.
 * Values: `n:<id>` and `e:<id>`. */
export function whenItems(model: StoryModel, prefix = ''): Choice[] {
  const documents = stableSorted(
    [...model.nodes.values()].filter(
      (n) => model.order.position.has(n.id) && (n.kindKey === 'chapter' || n.kindKey === 'scene'),
    ),
    (a, b) => compareNum(model.order.position.get(a.id)!, model.order.position.get(b.id)!),
  );
  return [
    ...documents.map((n) => ({ value: `n:${n.id}`, label: `${prefix}${nodeLabel(model, n.id)}` })),
    ...eventsInStoryOrder(model).map((e) => ({ value: `e:${e.id}`, label: `${prefix}Event: ${e.title}` })),
  ];
}

/** A menu value as a point in the story: `n:<id>`, `e:<id>`; anything else is null. */
export function anchorOfValue(value: string): JsonMap | null {
  if (value.startsWith('n:')) return { kind: 'node', nodeId: value.substring(2) };
  if (value.startsWith('e:')) return { kind: 'event', eventId: value.substring(2) };
  return null;
}

/** A change's time as a menu value: '' not known, `start` before the story, `n:`/`e:` a chapter or event. */
export function whenValue(c: ProgressChange): string {
  const at = c.at;
  if (at === null) return 'start';
  if (isUnknownTime(at)) return '';
  if (at instanceof NodeAnchor) return `n:${at.nodeId}`;
  if (at instanceof EventAnchor) return `e:${at.eventId}`;
  return '';
}

/** What a When value records: null before the story, a chapter or event, else "when is not known". */
export function atOf(value: string): JsonMap | null {
  if (value === 'start') return null;
  return anchorOfValue(value) ?? { kind: unknownTime.kind, when: { ...unknownTime.when } };
}

// ---------------------------------------------------------------------------------------------------- the tracker

export type TrackerLine = {
  /** "Strength: " for a named value, else empty. */
  lead: string;
  value: string;
  /** " (3 of 5)", or null. */
  step: string | null;
  /** " · or Level set to 5 (Chapter 3): which comes later cannot be told", in the error colour; or null. */
  uncertain: string | null;
};

export type TrackerLogRow = {
  change: ProgressChange;
  words: string;
  /** " (was 3)", or null. */
  before: string | null;
  /** " · Level", or that its category was removed. */
  category: string;
  subtitle: string;
  editTooltip: string;
  deleteTooltip: string;
  confirm: { title: string; message: string; confirmLabel: string };
  /** Said once it is deleted. */
  deleted: string;
};

export type TrackerView = {
  name: string;
  title: string;
  caption: string;
  /** "Choose what to track…" or "What is tracked…". */
  chooseLabel: string;
  /** With nothing tracked, the two lines said in place of everything else. */
  nothingTracked: { line: string; more: string } | null;
  asOfLabel: string;
  asOfChoices: Choice[];
  asOf: string;
  /** "Nothing recorded for X yet." or that nothing can be placed by then; null when there is a state to show. */
  nothing: string | null;
  semanticsLabel: string;
  categories: { name: string; lines: TrackerLine[]; moments: string | null; lost: string | null }[];
  unplaced: string | null;
  untracked: string | null;
  overTheStory: { heading: string; series: ChartSeries[]; length: number } | null;
  log: { heading: string; rows: TrackerLogRow[] } | null;
  /** "Record a change" when some category applies to them; else the line said instead. */
  record: string | null;
  noneApplies: string | null;
};

/** The tracker for `entryId` as of `asOf` ('end', or a When value), or null when the entry is gone. */
export function trackerView(model: StoryModel, entryId: string, asOf: string): TrackerView | null {
  const entry = model.entries.get(entryId);
  if (entry === undefined) return null;
  const name = entry.name;
  const categories = [...model.progressCategories.values()];
  const offered = categories.filter((c) => appliesTo(c, entryId));
  const log = changeLog(model, entryId);
  const point = asOf === 'end' ? null : Anchor.fromJson(anchorOfValue(asOf));
  const state = progressAt(model, entryId, point);
  const pointWords = point === null ? 'the end of the story' : whenWords(point, model);
  const words = (c: ProgressChange) => log.find((l) => l.change.id === c.id)?.words ?? '';
  const base = {
    name,
    title: 'Progression',
    caption:
      `How ${name} changes over the story: only what you record, each change at the chapter, scene or event it happens ` +
      'at, when that is known.',
    chooseLabel: categories.length === 0 ? 'Choose what to track…' : 'What is tracked…',
    asOfLabel: 'Progression as of',
    asOfChoices: [{ value: 'end', label: 'The end of the story' }, ...whenItems(model)],
    asOf,
    semanticsLabel: `${name} as of ${pointWords}`,
  };
  if (categories.length === 0) {
    return {
      ...base,
      nothingTracked: {
        line: 'This novel tracks nothing about how characters change yet.',
        more:
          'Choose what to track (levels, ranks, titles, attributes, abilities, equipment, transformations, a class or ' +
          'job, milestones, restrictions, costs, or your own) and record each change as it happens. Nothing is ' +
          `assumed: ${name} shows only what you record.`,
      },
      nothing: null,
      categories: [],
      unplaced: null,
      untracked: null,
      overTheStory: null,
      log: null,
      record: null,
      noneApplies: null,
    };
  }
  const series = chartSeries(model, entryId);
  return {
    ...base,
    nothingTracked: null,
    nothing:
      log.length === 0
        ? `Nothing recorded for ${name} yet.`
        : state.categories.length === 0
          ? `Nothing recorded for ${name} can be placed at or before ${pointWords}.`
          : null,
    categories:
      log.length === 0
        ? []
        : state.categories.map((s) => ({
            name: s.category.name,
            lines: s.lines.map((l) => ({
              lead: s.category.shape === 'named' ? `${l.subject}: ` : '',
              value: l.value,
              step: l.step === null ? null : ` (${l.step})`,
              uncertain:
                l.uncertain.length === 0
                  ? null
                  : ` · or ${l.uncertain.map((u) => `${words(u)} (${whenWords(u.at, model)})`).join(', ')}: which comes later cannot be told`,
            })),
            moments: s.moments.length === 0 ? null : s.moments.map((m) => m.subject).join(', '),
            lost: s.lost.length === 0 ? null : `Once held: ${s.lost.join(', ')}`,
          })),
    unplaced:
      state.unplaced.length === 0
        ? null
        : `Not placed against ${pointWords} (recorded in story time against reading order, or with no time known): ` +
          `${state.unplaced.map((c) => `${words(c)} (${whenWords(c.at, model)})`).join('; ')}.`,
    untracked:
      state.untracked.length === 0
        ? null
        : `Also tracked in this novel, nothing recorded for ${name}: ${state.untracked.map((c) => c.name).join(', ')}.`,
    overTheStory: series.length === 0 ? null : { heading: 'Over the story', series, length: log.length },
    log:
      log.length === 0
        ? null
        : {
            heading: 'Changes, in order',
            rows: log.map((l) => ({
              change: l.change,
              words: l.words,
              before: l.before === null ? null : ` (was ${l.before})`,
              category: ` · ${l.category?.name ?? 'A category that was removed'}`,
              subtitle: [l.when, ...(l.change.cost.length > 0 ? [`cost: ${l.change.cost}`] : []), ...(l.change.note.length > 0 ? [l.change.note] : [])].join(' · '),
              editTooltip: `Edit “${l.words}”`,
              deleteTooltip: `Delete “${l.words}”`,
              confirm: {
                title: 'Delete this change',
                message: `Delete “${l.words}” (${l.when})? Nothing else about ${name} changes. This cannot be undone.`,
                confirmLabel: 'Delete the change',
              },
              deleted: `Deleted: ${l.words}.`,
            })),
          },
    record: offered.length > 0 ? 'Record a change' : null,
    noneApplies:
      offered.length > 0 ? null : `None of what this novel tracks applies to ${name}. Change that under “What is tracked…”.`,
  };
}

/** Deleting a change from the log. */
export const removeChange =
  (id: string) =>
  (x: TrackChanges): boolean => {
    x.removeChange(id);
    return true;
  };

// ---------------------------------------------------------------------------------------------------- the form

/** What the form holds as it is filled in (an edit starts from the change). */
export type ChangeFormState = {
  categoryId: string;
  action: string;
  subject: string;
  value: string;
  refId: string;
  abilityId: string;
  when: string;
  cost: string;
  note: string;
};

/** A new form, or one for changing `initial`. */
export function changeFormStart(initial: ProgressChange | null = null): ChangeFormState {
  return {
    categoryId: initial?.categoryId ?? '',
    action: initial?.action ?? 'set',
    subject: initial?.subject ?? '',
    value: initial?.value ?? '',
    refId: initial?.refId ?? '',
    abilityId: initial?.abilityId ?? '',
    when: initial === null ? '' : whenValue(initial),
    cost: initial?.cost ?? '',
    note: initial?.note ?? '',
  };
}

export type ChangeFormView = {
  category: ProgressCategory;
  shape: string;
  /** The action the form records, from the shape (a thing held: gained unless "lose" is chosen). */
  action: string;
  semanticsLabel: string;
  categoryChoices: Choice[];
  /** The category cannot change when a recorded change is being changed. */
  categoryLocked: boolean;
  whenChoices: Choice[];
  /** Gained or lost: for a thing held. */
  gainedOrLost: Choice[] | null;
  /** The subject field: its label and hint, and what was recorded before (a menu, "Recorded before"); null for one
   * value at a time. */
  subject: { label: string; hint: string; before: string[] } | null;
  /** "Set to", with the category's steps as a menu ("Its steps"): for a value or a named value. */
  value: { label: string; steps: string[] } | null;
  /** "Its codex entry (optional)": None, then every other entry by name; for a thing held and a moment. */
  refChoices: Choice[] | null;
  /** The entry chosen, when it is still there; else ''. */
  refValue: string;
  /** "Its ability in a system (optional)": None, then each "System: ability"; when the novel has abilities. */
  abilityChoices: Choice[] | null;
  abilityValue: string;
  submitLabel: string;
  /** "Cancel" while a recorded change is being changed. */
  cancel: string | null;
};

/** The form for recording a change of `entryId`'s (or changing `initial`), as `form` holds it; null when no category
 * is offered. */
export function changeForm(
  model: StoryModel,
  entryId: string,
  form: ChangeFormState,
  initial: ProgressChange | null = null,
  editing = false,
): ChangeFormView | null {
  const offered = stableSorted(
    [...model.progressCategories.values()].filter((c) => appliesTo(c, entryId) || c.id === initial?.categoryId),
    (a, b) => {
      const o = compareNum(a.order, b.order);
      return o !== 0 ? o : localeCompare(a.name, b.name);
    },
  );
  const category = offered.find((c) => c.id === form.categoryId) ?? offered[0];
  if (category === undefined) return null;
  const shape = category.shape;
  const action = shape === 'held' ? (form.action === 'lose' ? 'lose' : 'gain') : shape === 'moment' ? 'happen' : 'set';
  const subjects = [
    ...new Set(
      model.progress.filter((c) => c.categoryId === category.id && c.entryId === entryId && c.subject.length > 0).map((c) => c.subject),
    ),
  ];
  const others = stableSorted(
    [...model.entries.values()].filter((e) => e.id !== entryId),
    (a, b) => localeCompare(a.name, b.name),
  );
  const heldOrMoment = shape === 'held' || shape === 'moment';
  return {
    category,
    shape,
    action,
    semanticsLabel: initial === null ? 'Record a change' : 'Change the recorded change',
    categoryChoices: offered.map((c) => ({ value: c.id, label: c.name })),
    categoryLocked: initial !== null,
    whenChoices: [{ value: '', label: 'When is not known' }, { value: 'start', label: 'Before the story' }, ...whenItems(model)],
    gainedOrLost: shape === 'held' ? ['gain', 'lose'].map((a) => ({ value: a, label: actionLabels[a] })) : null,
    subject:
      shape === 'value'
        ? null
        : {
            label: shape === 'named' ? 'Which' : shape === 'held' ? 'What' : 'What happened',
            hint:
              shape === 'named'
                ? 'Strength, Standing with the guild…'
                : shape === 'held'
                  ? 'Fire Lance, the Ember Crown, Wolf form…'
                  : 'First kill, Oath sworn…',
            before: subjects,
          },
    value: shape === 'value' || shape === 'named' ? { label: 'Set to', steps: category.ladder } : null,
    refChoices: heldOrMoment ? [{ value: '', label: 'None' }, ...others.map((e) => ({ value: e.id, label: e.name }))] : null,
    refValue: others.some((e) => e.id === form.refId) ? form.refId : '',
    abilityChoices:
      heldOrMoment && model.abilities.size > 0
        ? [
            { value: '', label: 'None' },
            ...[...model.abilities].map(([id, a]) => ({ value: id, label: `${a.system.name}: ${a.item.name}` })),
          ]
        : null,
    abilityValue: model.abilities.has(form.abilityId) ? form.abilityId : '',
    submitLabel: initial === null ? 'Record the change' : 'Save the change',
    cancel: editing && initial !== null ? 'Cancel' : null,
  };
}

/** The change the form records (or the edit it makes to `initial`), and what is said once it is saved. */
export function submitChange(
  model: StoryModel,
  entryId: string,
  view: ChangeFormView,
  form: ChangeFormState,
  initial: ProgressChange | null = null,
): { change: (x: TrackChanges) => ProgressChange; said: (saved: ProgressChange) => string } {
  const input: JsonMap = {
    entryId,
    categoryId: view.category.id,
    action: view.action,
    subject: form.subject,
    value: form.value,
    refId: form.refId.length === 0 ? null : form.refId,
    abilityId: form.abilityId.length === 0 ? null : form.abilityId,
    at: atOf(form.when),
    cost: form.cost,
    note: form.note,
  };
  return {
    change: (x) => (initial === null ? x.record(input) : x.updateChange(initial.id, input)),
    said: (saved) => `${initial === null ? 'Recorded' : 'Saved'}: ${changeWords(saved, view.category, model)}.`,
  };
}

/** After a new change is recorded, the form clears its words and its entry and ability; the category and when stay. */
export function clearedForm(form: ChangeFormState): ChangeFormState {
  return { ...form, subject: '', value: '', cost: '', note: '', refId: '', abilityId: '' };
}

// ---------------------------------------------------------------------------------------------------- what is tracked

export type TrackedRow = {
  category: ProgressCategory;
  used: number;
  nameLabel: string;
  shapeLabel: string;
  shapeChoices: Choice[];
  /** The shape stays once changes are recorded in it. */
  shapeLocked: boolean;
  /** "3 changes · archived". */
  count: string;
  /** For one value at a time: its steps, as typed ("Squire, Knight, Captain"). */
  ladder: { label: string; hint: string; text: string } | null;
  /** Who it is for: "For every character" or "For Mira, Kai"; with each character to tick. */
  forWhom: { title: string; characters: { id: string; name: string; on: boolean }[]; note: string } | null;
  archiveLabel: string;
  /** "Remove X", only when nothing is recorded in it. */
  removeLabel: string | null;
};

export type TrackedView = {
  title: string;
  intro: string;
  empty: string | null;
  rows: TrackedRow[];
  /** The offered categories the novel does not have yet ("Start from"), each with its shape's hint. */
  startFrom: { heading: string; presets: { name: string; hint: string }[] } | null;
  own: { heading: string; nameLabel: string; nameHint: string; shapeLabel: string; shapes: Choice[]; add: string };
  done: string;
};

/** The "What is tracked" dialog. */
export function trackedView(model: StoryModel): TrackedView {
  const categories = orderedCategories(model);
  const changes = model.progress;
  const characters = stableSorted(
    [...model.entries.values()].filter((e) => e.category === 'character').map((e) => ({ id: e.id, name: e.name })),
    (a, b) => localeCompare(a.name, b.name),
  );
  const used = (c: ProgressCategory) => changes.filter((p) => p.categoryId === c.id).length;
  const shapes = progressShapes.map((s) => ({ value: s, label: shapeLabels[s] }));
  const missing = progressPresets.filter((p) => !categories.some((c) => dartToLowerCase(c.name) === dartToLowerCase(p.name)));
  return {
    title: 'What is tracked',
    intro:
      'What this novel tracks about how its characters change. Nothing is tracked until you add it, and a ' +
      'character shows only what you record for them: no levels or statistics unless you record some.',
    empty: categories.length === 0 ? 'Nothing is tracked yet.' : null,
    rows: categories.map((c) => {
      const n = used(c);
      return {
        category: c,
        used: n,
        nameLabel: `Name of ${c.name}`,
        shapeLabel: `Shape of ${c.name}`,
        shapeChoices: shapes,
        shapeLocked: n > 0,
        count: `${n} ${n === 1 ? 'change' : 'changes'}${c.archived ? ' · archived' : ''}`,
        ladder:
          c.shape === 'value'
            ? { label: `Steps of ${c.name}, lowest first`, hint: 'If it is a ladder: Squire, Knight, Captain', text: c.ladder.join(', ') }
            : null,
        forWhom:
          characters.length === 0
            ? null
            : {
                title:
                  c.characterIds.length === 0
                    ? 'For every character'
                    : `For ${characters.filter((p) => c.characterIds.includes(p.id)).map((p) => p.name).join(', ')}`,
                characters: characters.map((p) => ({ ...p, on: c.characterIds.includes(p.id) })),
                note: 'None ticked: it applies to every character.',
              },
        archiveLabel: c.archived ? `Restore ${c.name}` : `Archive ${c.name}`,
        removeLabel: n === 0 ? `Remove ${c.name}` : null,
      };
    }),
    startFrom:
      missing.length === 0
        ? null
        : { heading: 'Start from', presets: missing.map((p) => ({ name: p.name, hint: shapeHints[p.shape] })) },
    own: {
      heading: 'Your own',
      nameLabel: 'New category name',
      nameHint: 'Cultivation realm, Oaths, Scars…',
      shapeLabel: 'Its shape',
      shapes,
      add: 'Add',
    },
    done: 'Done',
  };
}

/** What the dialog's presses change, each as `(x: TrackChanges) => …`, with what is said after (when anything is). */
export const trackedChanges = {
  rename: (c: ProgressCategory, name: string) => (x: TrackChanges) => x.saveCategory(c.id, { name }),
  reshape: (c: ProgressCategory, shape: string) => (x: TrackChanges) => x.saveCategory(c.id, { shape }),
  /** The steps as typed, split at commas. */
  ladder: (c: ProgressCategory, typed: string) => (x: TrackChanges) => x.saveCategory(c.id, { ladder: typed.split(',') }),
  forCharacter: (c: ProgressCategory, characterId: string, on: boolean) => (x: TrackChanges) =>
    x.saveCategory(c.id, {
      characterIds: on ? [...c.characterIds, characterId] : c.characterIds.filter((id) => id !== characterId),
    }),
  archive: (c: ProgressCategory) => (x: TrackChanges) => x.saveCategory(c.id, { archived: !c.archived }),
  remove: (c: ProgressCategory) => ({
    change: (x: TrackChanges) => {
      x.removeCategory(c.id);
      return true;
    },
    said: `Stopped tracking ${c.name}.`,
  }),
  preset: (name: string) => ({ change: (x: TrackChanges) => x.addPreset(name), said: `Now tracking ${name}.` }),
  /** Your own: only with a name. */
  own: (typed: string, shape: string) => {
    const name = dartTrim(typed);
    return name.length === 0
      ? null
      : { change: (x: TrackChanges) => x.saveCategory(null, { name, shape }), said: `Now tracking ${name}.` };
  },
};
