// PROGRESSION, CHANGE BY CHANGE (as in the original app). How a character changes over the novel, recorded as the
// changes happen: a level reached, a rank, a title won, an ability gained, equipment lost, a transformation, a class
// taken up, a milestone, a cost paid. Nothing is assumed about a character: the author chooses what the novel tracks
// (categories, in four shapes), and a character shows only what is recorded for them.
//
// Each change says when it happens when that is known: at a chapter or scene (reading order), at an event or on a
// date (story time), before the story, or "when is not known". Reading order and story time are never compared: what
// a character is like at a point is worked out only from the changes that can be placed against it, and the others
// are listed as such, never guessed at. A port of flutter_app/lib/shared/domain/progression/track.dart.

import { localeCompare } from '../exchange/collation';
import { jsonEquals } from '../json';
import { compareNum } from '../manuscript/dartSort';
import { type StoryModel } from '../model/storyModel';
import {
  type Anchor,
  DateAnchor,
  EventAnchor,
  NodeAnchor,
  Validity,
  historyOf,
  spanOfDate,
  spanOfEvent,
  validAt,
} from '../model/validity';
import { UnknownDate } from '../records/event';
import { type ProgressCategory, type ProgressChange } from '../records/progress';
import { stableSorted } from '../reader/stableSort';
import { dartToLowerCase, dartTrim } from '../text/dartString';
import { formatDate } from '../timeline/dates';
import { nodeLabel } from '../timeline/narrative';

export const progressShapes: readonly string[] = ['value', 'named', 'held', 'moment'];
export const shapeLabels: Readonly<Record<string, string>> = {
  value: 'One value at a time',
  named: 'Several named values',
  held: 'Things gained and lost',
  moment: 'Moments',
};
export const shapeHints: Readonly<Record<string, string>> = {
  value: 'A level, a rank, a class or job: each change sets it.',
  named: 'Attributes, standings, scores: each change sets one of them, by name.',
  held: 'Titles, abilities, equipment, transformations, restrictions: each change gains or loses one.',
  moment: 'Milestones, costs paid: each is something that happened.',
};

/** The changes each shape takes. */
export const actionsOf: Readonly<Record<string, readonly string[]>> = {
  value: ['set'],
  named: ['set'],
  held: ['gain', 'lose'],
  moment: ['happen'],
};
export const actionLabels: Readonly<Record<string, string>> = { set: 'Set to', gain: 'Gained', lose: 'Lost', happen: 'Happened' };

/** Categories offered to start from. None is added unless the author chooses it. */
export const progressPresets: readonly { name: string; shape: string }[] = [
  { name: 'Level', shape: 'value' },
  { name: 'Rank', shape: 'value' },
  { name: 'Class or job', shape: 'value' },
  { name: 'Titles', shape: 'held' },
  { name: 'Attributes', shape: 'named' },
  { name: 'Abilities', shape: 'held' },
  { name: 'Equipment', shape: 'held' },
  { name: 'Transformations', shape: 'held' },
  { name: 'Restrictions', shape: 'held' },
  { name: 'Milestones', shape: 'moment' },
  { name: 'Costs paid', shape: 'moment' },
];

/** "When is not known": the change happens, but when is not recorded. */
export const unknownTime = { kind: 'date', when: { precision: 'unknown' } } as const;

export function isUnknownTime(at: Anchor | null): boolean {
  return at instanceof DateAnchor && at.when instanceof UnknownDate;
}

/** Whether a category is offered for a character: it is not archived, and applies to every character or names this
 * one. */
export function appliesTo(category: ProgressCategory, entryId: string): boolean {
  return !category.archived && (category.characterIds.length === 0 || category.characterIds.includes(entryId));
}

// ---------------------------------------------------------------------------------------------------- in words

/** When a change happens, in words. */
export function whenWords(at: Anchor | null, model: StoryModel): string {
  if (at === null) return 'Before the story';
  if (isUnknownTime(at)) return 'When is not known';
  if (at instanceof NodeAnchor) return model.nodes.has(at.nodeId) ? nodeLabel(model, at.nodeId) : 'A chapter that was deleted';
  if (at instanceof EventAnchor) return `At “${model.events.get(at.eventId)?.name ?? 'a deleted event'}”`;
  return formatDate((at as DateAnchor).when, (id) => model.events.get(id)?.name ?? null, model.calendar);
}

/** The thing a change is about, by name: its own words, else its codex entry's or ability's name, else its category. */
function thingOf(
  subject: string,
  refId: string | null,
  abilityId: string | null,
  category: ProgressCategory | null,
  model: StoryModel,
): string {
  if (dartTrim(subject).length > 0) return dartTrim(subject);
  const ref = refId === null ? '' : (model.entries.get(refId)?.name ?? '');
  if (ref.length > 0) return ref;
  const ability = abilityId === null ? '' : (model.abilities.get(abilityId)?.item.name ?? '');
  if (ability.length > 0) return ability;
  return category?.name ?? 'Something';
}

/** What a change says, in words: "Level set to 4", "Gained Fire Lance", "Strength set to 6", "First kill". */
export function changeWords(
  change: ProgressChange,
  category: ProgressCategory | null,
  model: StoryModel,
  action?: string,
): string {
  const thing = thingOf(change.subject, change.refId, change.abilityId, category, model);
  const value = change.value.length === 0 ? '—' : change.value;
  switch (action ?? change.action) {
    case 'set':
      return category?.shape === 'named' ? `${thing} set to ${value}` : `${category?.name ?? 'Value'} set to ${value}`;
    case 'gain':
      return `Gained ${thing}`;
    case 'lose':
      return `Lost ${thing}`;
    default:
      return thing;
  }
}

// ---------------------------------------------------------------------------------------------------- in order

const asValidity = (c: ProgressChange): Validity => new Validity(c.at, null);

/** One entry's changes in order: from before the story first, then those in story time by date, then those in reading
 * order by position, then those whose time is not known or cannot be placed; within each, in the order recorded. */
export function inOrder(model: StoryModel, entryId: string): ProgressChange[] {
  const mine = stableSorted(
    model.progress.filter((c) => c.entryId === entryId),
    (a, b) => {
      const byTime = compareNum(a.createdAt, b.createdAt);
      return byTime !== 0 ? byTime : localeCompare(a.id, b.id);
    },
  );
  return historyOf(mine, asValidity, model.timeContext);
}

/** Which of three orders a change sits in: story time, reading order, or none it can be placed in. Before the story is
 * before all of them. */
function axisOf(change: ProgressChange, model: StoryModel): string {
  const at = change.at;
  if (at === null) return 'start';
  if (at instanceof NodeAnchor) return model.order.position.has(at.nodeId) ? 'reading' : 'none';
  const context = model.timeContext;
  const span =
    at instanceof EventAnchor
      ? spanOfEvent(at.eventId, context)
      : at instanceof DateAnchor
        ? spanOfDate(at.when, context)
        : null;
  return span !== null ? 'story' : 'none';
}

// ---------------------------------------------------------------------------------------------------- at a point

export class ProgressLine {
  constructor(
    /** The named value or the thing held; empty for one value at a time. */
    readonly subject: string,
    /** What it is: the value, or for a thing held, its name. */
    readonly value: string,
    readonly change: ProgressChange,
    /** For a ladder: where the value sits ("3 of 5"), or that it is not one of its steps. */
    readonly step: string | null,
    /** Changes in another order that may come later: which is the latest cannot be told. */
    readonly uncertain: ProgressChange[],
  ) {}
}

export class CategoryState {
  constructor(
    readonly category: ProgressCategory,
    readonly lines: ProgressLine[],
    /** For moments: those that have happened by then. */
    readonly moments: ProgressChange[],
    /** Things held once and since lost, for the record. */
    readonly lost: string[],
  ) {}
}

export class ProgressState {
  constructor(
    /** Only categories with something recorded for this entry, in the categories' order. */
    readonly categories: CategoryState[],
    /** At a point: changes that cannot be placed against it (another order, or no time known): listed, never applied. */
    readonly unplaced: ProgressChange[],
    /** Categories that apply to this entry with nothing recorded for them. Never shown as empty values. */
    readonly untracked: ProgressCategory[],
  ) {}
}

const keyOf = (text: string): string => dartToLowerCase(dartTrim(text));

/** The novel's categories in their order. */
export function orderedCategories(model: StoryModel): ProgressCategory[] {
  return stableSorted(model.progressCategories.values(), (a, b) => {
    const byOrder = compareNum(a.order, b.order);
    return byOrder !== 0 ? byOrder : localeCompare(a.name, b.name);
  });
}

/** What an entry is like at a point: at a chapter or scene, at an event or a date, or at the end of the story (`at`
 * null). At a point, a change counts when it can be placed at or before it; one that cannot be placed against it is
 * listed in `unplaced`. At the end, every change has happened; where the order of a named value's changes cannot be
 * told, the line says so. */
export function progressAt(model: StoryModel, entryId: string, at: Anchor | null): ProgressState {
  const context = model.timeContext;
  const ordered = inOrder(model, entryId);
  const counted: ProgressChange[] = [];
  const unplaced: ProgressChange[] = [];
  for (const c of ordered) {
    if (at === null) {
      counted.push(c);
    } else {
      const holds = isUnknownTime(c.at) ? 'unknown' : validAt(asValidity(c), at, context);
      if (holds === 'yes') counted.push(c);
      else if (holds === 'unknown') unplaced.push(c);
    }
  }
  const categories = orderedCategories(model);
  const states: CategoryState[] = [];
  for (const category of categories) {
    const mine = counted.filter((c) => c.categoryId === category.id);
    if (mine.length === 0) continue;
    const bySubject = new Map<string, ProgressChange[]>();
    for (const c of mine.filter((c) => c.action !== 'happen')) {
      const k = category.shape === 'value' ? '' : keyOf(changeWords(c, category, model, 'happen'));
      let list = bySubject.get(k);
      if (list === undefined) bySubject.set(k, (list = []));
      list.push(c);
    }
    const lines: ProgressLine[] = [];
    const lost: string[] = [];
    for (const changes of bySubject.values()) {
      const last = changes[changes.length - 1];
      // The latest of each order: if more than one order has changes past the start, which is latest cannot be told.
      const axes = new Map<string, ProgressChange>();
      for (const c of changes) axes.set(axisOf(c, model), c);
      axes.delete('start');
      const uncertain = axes.size > 1 ? [...axes.values()].filter((c) => !jsonEquals(c.raw, last.raw)) : [];
      const name = changeWords(last, category, model, 'happen');
      if (category.shape === 'held') {
        if (last.action === 'gain' || uncertain.some((c) => c.action === 'gain')) {
          lines.push(new ProgressLine(name, name, last, null, uncertain));
        } else {
          lost.push(name);
        }
        continue;
      }
      const ladderAt = category.ladder.findIndex((v) => keyOf(v) === keyOf(last.value));
      const step =
        category.shape === 'value' && category.ladder.length > 0
          ? ladderAt >= 0
            ? `${ladderAt + 1} of ${category.ladder.length}`
            : 'not one of its steps'
          : null;
      lines.push(new ProgressLine(category.shape === 'value' ? '' : name, last.value, last, step, uncertain));
    }
    states.push(
      new CategoryState(
        category,
        stableSorted(lines, (a, b) => localeCompare(a.subject, b.subject)),
        mine.filter((c) => c.action === 'happen'),
        lost,
      ),
    );
  }
  const recorded = new Set(ordered.map((c) => c.categoryId));
  return new ProgressState(
    states,
    unplaced,
    categories.filter((c) => appliesTo(c, entryId) && !recorded.has(c.id)),
  );
}

/** An entry's progression in one line: "Level 4 · Rank Lieutenant · Abilities: Fire Lance, Ward". Empty when nothing
 * is recorded. */
export function progressSummary(state: ProgressState): string {
  const few = (names: string[]) =>
    names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : names.join(', ');
  return state.categories
    .map((s) => {
      const category = s.category;
      if (category.shape === 'value') return s.lines.length === 0 ? '' : `${category.name} ${s.lines[0].value}`;
      const names =
        category.shape === 'moment'
          ? s.moments.map((m) => m.subject)
          : category.shape === 'named'
            ? s.lines.map((l) => `${l.subject} ${l.value}`)
            : s.lines.map((l) => l.value);
      return names.length === 0 ? '' : `${category.name}: ${few(names)}`;
    })
    .filter((x) => x.length > 0)
    .join(' · ');
}

/** One change in the log: the change, its category (null when removed), its words, what it was before (for a value
 * set), and when. */
export type LogLine = {
  change: ProgressChange;
  category: ProgressCategory | null;
  words: string;
  before: string | null;
  when: string;
};

/** Each change in order, with what it was before for a value set (the previous change of that value in the same order
 * of changes). */
export function changeLog(model: StoryModel, entryId: string): LogLine[] {
  const seen = new Map<string, string>();
  return inOrder(model, entryId).map((change) => {
    const category = model.progressCategories.get(change.categoryId) ?? null;
    const k = `${change.categoryId}|${category?.shape === 'named' ? keyOf(change.subject) : ''}`;
    const before = change.action === 'set' ? (seen.get(k) ?? null) : null;
    if (change.action === 'set') seen.set(k, change.value);
    return { change, category, words: changeWords(change, category, model), before, when: whenWords(change.at, model) };
  });
}
