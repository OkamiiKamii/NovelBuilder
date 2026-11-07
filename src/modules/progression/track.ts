import { historyOf, spanOfDate, spanOfEvent, timeContext, validAt, type Anchor } from '@/modules/model/validity';
import type { StoryModel } from '@/modules/model/types';
import { formatDate } from '@/modules/timeline/chronology';
import { nodeLabel } from '@/modules/timeline/narrative';

/**
 * PROGRESSION, CHANGE BY CHANGE
 * How a character changes over the novel, recorded as the changes happen:
 * a level reached, a rank, a title won, an ability gained, equipment lost,
 * a transformation, a class or job taken up, a milestone, a restriction
 * placed or lifted, a cost paid. Nothing is assumed about a character: the
 * author chooses what the novel tracks (categories, in four shapes), and a
 * character shows only what is recorded for them. No levels, no statistics,
 * unless the author records some.
 *
 * Each change says when it happens when that is known: at a chapter or
 * scene (reading order), at an event or on a date (story time), before the
 * story, or "when is not known". Reading order and story time are never
 * compared (see `model/validity.ts`): what a character is like at a point is
 * worked out only from the changes that can be placed against it, and the
 * others are listed as such, never guessed at.
 *
 * System sheets and snapshots (`systems/`, `progression/types.ts`) are kept
 * as they are, for novels with a worked-out system; this sits beside them.
 */

export const PROGRESS_SHAPES = ['value', 'named', 'held', 'moment'] as const;
export type ProgressShape = (typeof PROGRESS_SHAPES)[number];
export const SHAPE_LABELS: Record<ProgressShape, string> = { value: 'One value at a time', named: 'Several named values', held: 'Things gained and lost', moment: 'Moments' };
export const SHAPE_HINTS: Record<ProgressShape, string> = {
  value: 'A level, a rank, a class or job: each change sets it.',
  named: 'Attributes, standings, scores: each change sets one of them, by name.',
  held: 'Titles, abilities, equipment, transformations, restrictions: each change gains or loses one.',
  moment: 'Milestones, costs paid: each is something that happened.',
};

/** Something the novel tracks about its characters, in one of the four shapes. */
export interface ProgressCategory {
  id: string;
  projectId: string;
  name: string;
  shape: ProgressShape;
  /** For one value at a time: its values in order, lowest first, when they form a ladder (ranks, belts, realms). Empty: any value. */
  ladder: string[];
  /** The characters it applies to. Empty: any character. */
  characterIds: string[];
  order: number;
  /** No new changes; those recorded are kept and shown. */
  archived?: boolean;
  createdAt: number;
  updatedAt: number;
}

export const PROGRESS_ACTIONS = ['set', 'gain', 'lose', 'happen'] as const;
export type ProgressAction = (typeof PROGRESS_ACTIONS)[number];
/** The changes each shape takes. */
export const ACTIONS_OF: Record<ProgressShape, ProgressAction[]> = { value: ['set'], named: ['set'], held: ['gain', 'lose'], moment: ['happen'] };
export const ACTION_LABELS: Record<ProgressAction, string> = { set: 'Set to', gain: 'Gained', lose: 'Lost', happen: 'Happened' };

/** One change to one character. */
export interface ProgressChange {
  id: string;
  projectId: string;
  /** The codex entry that changes: usually a character. */
  entryId: string;
  categoryId: string;
  action: ProgressAction;
  /** What changed: the named value ("Strength"), the thing gained or lost ("Fire Lance"), the moment ("First kill"). Empty for one value at a time. */
  subject: string;
  /** What it is set to, for `set`. */
  value: string;
  /** A codex entry the thing is, when there is one: the sword, the order a title belongs to. */
  refId: string | null;
  /** An ability of a system blueprint it gains, loses or names (`<systemId>/<itemId>`), when there is one. */
  abilityId?: string | null;
  /** When it happens: a chapter or scene, an event, or a date. Null: before the story begins. A date of unknown precision: it happens, but when is not known. */
  at: Anchor | null;
  /** What it cost, in the author's words. */
  cost: string;
  note: string;
  createdAt: number;
  updatedAt: number;
}

export const UNKNOWN_TIME: Anchor = { kind: 'date', when: { precision: 'unknown' } };
export const isUnknownTime = (at: Anchor | null): boolean => at?.kind === 'date' && at.when.precision === 'unknown';

/** Categories offered to start from. None is added unless the author chooses it. */
export const PROGRESS_PRESETS: { name: string; shape: ProgressShape }[] = [
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

/** Whether a category is offered for a character: it is not archived, and applies to every character or names this one. */
export const appliesTo = (category: Pick<ProgressCategory, 'characterIds' | 'archived'>, entryId: string): boolean => !category.archived && (category.characterIds.length === 0 || category.characterIds.includes(entryId));

// ---------------------------------------------------------------------------------------------------- in words

type Words = Pick<StoryModel, 'nodes' | 'order' | 'events' | 'calendar' | 'entries'>;

/** When a change happens, in words. */
export function whenWords(at: Anchor | null, model: Words): string {
  if (at === null) return 'Before the story';
  if (isUnknownTime(at)) return 'When is not known';
  if (at.kind === 'node') return model.nodes.has(at.nodeId) ? nodeLabel(model as StoryModel, at.nodeId) : 'A chapter that was deleted';
  if (at.kind === 'event') return `At “${model.events.get(at.eventId)?.name ?? 'a deleted event'}”`;
  return formatDate(at.when, (id) => model.events.get(id)?.name, model.calendar);
}

/** What a change says, in words: "Level set to 4", "Gained Fire Lance", "Strength set to 6", "First kill". */
export function changeWords(change: Pick<ProgressChange, 'action' | 'subject' | 'value' | 'refId' | 'abilityId'>, category: Pick<ProgressCategory, 'name' | 'shape'> | undefined, model: Pick<StoryModel, 'entries'> & Partial<Pick<StoryModel, 'abilities'>>): string {
  const thing = change.subject.trim() || (change.refId ? model.entries.get(change.refId)?.name : '') || (change.abilityId ? model.abilities?.get(change.abilityId)?.item.name : '') || category?.name || 'Something';
  switch (change.action) {
    case 'set':
      return category?.shape === 'named' ? `${thing} set to ${change.value || '—'}` : `${category?.name ?? 'Value'} set to ${change.value || '—'}`;
    case 'gain':
      return `Gained ${thing}`;
    case 'lose':
      return `Lost ${thing}`;
    default:
      return thing;
  }
}

// ---------------------------------------------------------------------------------------------------- in order

const asValidity = (c: ProgressChange) => ({ from: c.at, until: null });

/**
 * One entry's changes in order: from before the story first, then those in
 * story time by date, then those in reading order by position, then those
 * whose time is not known or cannot be placed; within each, in the order
 * they were recorded.
 */
export function inOrder(model: StoryModel, entryId: string): ProgressChange[] {
  const mine = model.progress.filter((c) => c.entryId === entryId).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  return historyOf(mine, asValidity, timeContext(model));
}

/** Which of three orders a change sits in: story time, reading order, or none it can be placed in. Before the story is before all of them. */
function axisOf(change: ProgressChange, model: StoryModel): 'start' | 'story' | 'reading' | 'none' {
  if (change.at === null) return 'start';
  if (change.at.kind === 'node') return model.order.position.has(change.at.nodeId) ? 'reading' : 'none';
  const context = timeContext(model);
  return (change.at.kind === 'event' ? spanOfEvent(change.at.eventId, context) : spanOfDate(change.at.when, context)) ? 'story' : 'none';
}

// ---------------------------------------------------------------------------------------------------- what they are like at a point

export interface ProgressLine {
  /** The named value or the thing held; empty for one value at a time. */
  subject: string;
  /** What it is: the value, or for a thing held, its name. */
  value: string;
  /** The change it comes from. */
  change: ProgressChange;
  /** For a ladder: where the value sits ("3 of 5"), or that it is not one of its steps. */
  step: string | null;
  /** Changes in another order (story time against reading order) that may come later: which is the latest cannot be told. */
  uncertain: ProgressChange[];
}
export interface CategoryState {
  category: ProgressCategory;
  lines: ProgressLine[];
  /** For moments: those that have happened by then. */
  moments: ProgressChange[];
  /** Things held once and since lost, for the record. */
  lost: string[];
}
export interface ProgressState {
  /** Only categories with something recorded for this entry, in the categories' order. */
  categories: CategoryState[];
  /** At a point: changes that cannot be placed against it (another order, or no time known): listed, never applied. */
  unplaced: ProgressChange[];
  /** Categories that apply to this entry with nothing recorded for them. Never shown as empty values. */
  untracked: ProgressCategory[];
}

const key = (text: string) => text.trim().toLowerCase();

/**
 * What an entry is like at a point: at a chapter or scene, at an event or a
 * date, or at the end of the story (`'end'`). At a point, a change counts
 * when it can be placed at or before it; one that cannot be placed against
 * it (a chapter against an event, or no time known) is listed in
 * `unplaced`. At the end, every change has happened; where the order of a
 * named value's changes cannot be told, the line says so.
 */
export function progressAt(model: StoryModel, entryId: string, at: Anchor | 'end'): ProgressState {
  const context = timeContext(model);
  const ordered = inOrder(model, entryId);
  const counted: ProgressChange[] = [];
  const unplaced: ProgressChange[] = [];
  for (const c of ordered) {
    if (at === 'end') counted.push(c);
    else {
      const holds = isUnknownTime(c.at) ? 'unknown' : validAt(asValidity(c), at, context);
      if (holds === true) counted.push(c);
      else if (holds === 'unknown') unplaced.push(c);
    }
  }
  const categories = [...model.progressCategories.values()].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  const states: CategoryState[] = [];
  for (const category of categories) {
    const mine = counted.filter((c) => c.categoryId === category.id);
    if (!mine.length) continue;
    const bySubject = new Map<string, ProgressChange[]>();
    for (const c of mine.filter((c) => c.action !== 'happen')) {
      const k = category.shape === 'value' ? '' : key(changeWords({ ...c, action: 'happen' }, category, model));
      bySubject.set(k, [...(bySubject.get(k) ?? []), c]);
    }
    const lines: ProgressLine[] = [];
    const lost: string[] = [];
    for (const changes of bySubject.values()) {
      const last = changes.at(-1)!;
      // The latest of each order: if more than one order has changes past the start, which is latest cannot be told.
      const axes = new Map<string, ProgressChange>();
      for (const c of changes) axes.set(axisOf(c, model), c);
      axes.delete('start');
      const uncertain = axes.size > 1 ? [...axes.values()].filter((c) => c !== last) : [];
      const name = changeWords({ ...last, action: 'happen' }, category, model);
      if (category.shape === 'held') {
        if (last.action === 'gain' || uncertain.some((c) => c.action === 'gain')) lines.push({ subject: name, value: name, change: last, step: null, uncertain });
        else lost.push(name);
        continue;
      }
      const ladderAt = category.ladder.findIndex((v) => key(v) === key(last.value));
      const step = category.shape === 'value' && category.ladder.length ? (ladderAt >= 0 ? `${ladderAt + 1} of ${category.ladder.length}` : 'not one of its steps') : null;
      lines.push({ subject: category.shape === 'value' ? '' : name, value: last.value, change: last, step, uncertain });
    }
    states.push({ category, lines: lines.sort((a, b) => a.subject.localeCompare(b.subject)), moments: mine.filter((c) => c.action === 'happen'), lost });
  }
  const recorded = new Set(ordered.map((c) => c.categoryId));
  const untracked = categories.filter((c) => appliesTo(c, entryId) && !recorded.has(c.id));
  return { categories: states, unplaced, untracked };
}

/** An entry's progression in one line: "Level 4 · Rank Lieutenant · Abilities: Fire Lance, Ward". Empty when nothing is recorded. */
export function progressSummary(state: ProgressState): string {
  const few = (names: string[]) => (names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : names.join(', '));
  return state.categories
    .map(({ category, lines, moments }) => {
      if (category.shape === 'value') return lines[0] ? `${category.name} ${lines[0].value}` : '';
      const names = category.shape === 'moment' ? moments.map((m) => m.subject) : category.shape === 'named' ? lines.map((l) => `${l.subject} ${l.value}`) : lines.map((l) => l.value);
      return names.length ? `${category.name}: ${few(names)}` : '';
    })
    .filter(Boolean)
    .join(' · ');
}

/** Each change in order, with what it was before for a value set (the previous change of that value in the same order of changes). */
export function changeLog(model: StoryModel, entryId: string): { change: ProgressChange; category: ProgressCategory | undefined; words: string; before: string | null; when: string }[] {
  const seen = new Map<string, string>();
  return inOrder(model, entryId).map((change) => {
    const category = model.progressCategories.get(change.categoryId);
    const k = `${change.categoryId}|${category?.shape === 'named' ? key(change.subject) : ''}`;
    const before = change.action === 'set' ? (seen.get(k) ?? null) : null;
    if (change.action === 'set') seen.set(k, change.value);
    return { change, category, words: changeWords(change, category, model), before, when: whenWords(change.at, model) };
  });
}

/** A change with one reference taken out: a point in time that is gone becomes "when is not known"; a codex entry or ability that is gone is no longer linked. */
export function withoutProgressReference(change: ProgressChange, id: string): ProgressChange {
  const at = change.at;
  const gone = at !== null && ((at.kind === 'node' && at.nodeId === id) || (at.kind === 'event' && at.eventId === id) || (at.kind === 'date' && at.when.precision === 'relative' && at.when.anchorId === id));
  return { ...change, at: gone ? UNKNOWN_TIME : at, refId: change.refId === id ? null : change.refId, abilityId: change.abilityId === id ? null : (change.abilityId ?? null) };
}
