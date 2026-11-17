// ALTERNATE HISTORIES: other courses of events for this novel, kept apart from its main timeline. Each holds only what
// is different, and the rest is the main timeline's own events. Nothing here changes the main timeline, merges into it,
// or changes a history's canon status by itself. The pure parts of flutter_app/lib/features/timeline/histories_page.dart
// and widgets/what_if.dart.
//
// The page (/plan/histories, ?history=<id> for the one open): the Plan switch; with none yet, the What if…? card; the
// Histories (each a card: its name, "<status> · <kind>", where it branches from, its counts; tinted when open); Start an
// alternate history (Name 260, Kind 220, Canon status 220, Branches from 300, Departs at 300, Caused by 300 for a
// time-travel branch, What it explores; Start the history); the open history (selectedHistory); and, with any, Compare
// (two choosers 300 wide, the summary, "Show the events that are the same too", and each difference).

import { type JsonMap, mapOrNull } from '../../json';
import type { BranchStatus } from '../../records/branch';
import type { TimelineEvent } from '../../records/event';
import { dartTrim } from '../../text/dartString';
import { type Placed, resolveChronology } from '../chronology';
import {
  type AlternateHistory,
  type EventDifference,
  compareTimelines,
  comparisonSummary,
  historyEvents,
  historyKindLabel,
  historyKinds,
  historyStatusLabel,
  historyStatuses,
  mainTimeline,
  originWords,
  staleChanges,
} from '../histories';
import type { TimelineData } from './timelineData';

/** What a history's canon status means, in a sentence. */
export const canonWords: Readonly<Partial<Record<BranchStatus, string>>> = {
  alternate: 'Alternate canon: an official second course of events. The main timeline stays as it is.',
  'non-canon': 'Not canon. The main timeline is the novel’s canon and stays as it is.',
  experimental: 'An experiment, not canon. The main timeline stays as it is.',
  abandoned: 'Set aside, not canon. The main timeline stays as it is.',
};

export const historiesPath = (id: string | null): string => (id === null ? '/plan/histories' : `/plan/histories?history=${id}`);

/** A timeline by name: the main one, or a history's in quotes. */
export function timelineName(data: TimelineData, id: string | null): string {
  return id === null ? mainTimeline : `“${data.histories.get(id)?.name ?? 'a deleted history'}”`;
}

/** What a history holds, in a line: "2 changed · 1 not happening · 1 only here", or "No differences yet". */
export function counts(h: AlternateHistory): string {
  const parts = [
    ...(h.changed.size > 0 ? [`${h.changed.size} changed`] : []),
    ...(h.removed.length > 0 ? [`${h.removed.length} not happening`] : []),
    ...(h.added.length > 0 ? [`${h.added.length} only here`] : []),
  ];
  return parts.length === 0 ? 'No differences yet' : parts.join(' · ');
}

/** The timelines a chooser offers: the main one (canon), then each history with its status. */
export function timelineChoices(data: TimelineData): { value: string; label: string }[] {
  return [
    { value: 'main', label: `${mainTimeline} (canon)` },
    ...data.historyList.map((h) => ({ value: h.id, label: `${h.name} (${historyStatusLabel(h.status)})` })),
  ];
}

/** An event as a chooser lists it: "The siege (Year 10)". */
export const eventChoice = (p: Placed) => ({ value: p.event.id, label: `${p.event.name} (${p.label})` });

/** The list of histories. */
export function historyCards(data: TimelineData, selectedId: string | null): {
  empty: string | null;
  cards: { id: string; name: string; status: string; origin: string; counts: string; selected: boolean }[];
} {
  const main = data.model.events;
  const byId = data.histories;
  const cal = data.calendar;
  return {
    empty:
      data.historyList.length === 0
        ? 'No alternate histories yet. Start one below: it reads exactly as the timeline it branches from until you change something.'
        : null,
    cards: data.historyList.map((h) => ({
      id: h.id,
      name: h.name,
      status: `${historyStatusLabel(h.status)} · ${historyKindLabel[h.kind]}`,
      origin: originWords(h, historyEvents(main, byId, h.baseId), byId, cal),
      counts: counts(h),
      selected: h.id === selectedId,
    })),
  };
}

/** The form that starts a history, as the author fills it in. */
export type StartForm = {
  name: string;
  kind: string;
  status: string;
  baseId: string | null;
  originId: string | null;
  causeId: string | null;
  note: string;
};

export const startForm: StartForm = {
  name: '',
  kind: 'hypothetical',
  status: 'experimental',
  baseId: null,
  originId: null,
  causeId: null,
  note: '',
};

/** The start form's choosers, for the form as it stands. */
export function startChoices(data: TimelineData, form: StartForm): {
  kind: { value: string; label: string }[];
  status: { value: string; label: string }[];
  base: { value: string; label: string }[];
  origin: { value: string; label: string }[];
  /** Only for a time-travel branch. */
  cause: { value: string; label: string }[] | null;
} {
  const draftBase = resolveChronology(historyEvents(data.model.events, data.histories, form.baseId).values(), data.calendar);
  return {
    kind: historyKinds.map((k) => ({ value: k, label: historyKindLabel[k] })),
    status: historyStatuses.map((s) => ({ value: s, label: historyStatusLabel(s) })),
    base: timelineChoices(data),
    origin: [{ value: '', label: 'Across the whole timeline' }, ...draftBase.map(eventChoice)],
    cause: form.kind === 'time-travel' ? [{ value: '', label: 'Not said' }, ...draftBase.map(eventChoice)] : null,
  };
}

/** The start form's words. */
export const startWords = {
  title: 'Start an alternate history',
  name: 'Name',
  nameHint: 'If the Keep had held',
  kind: 'Kind',
  status: 'Canon status',
  base: 'Branches from',
  origin: 'Departs at',
  cause: 'Caused by',
  note: 'What it explores',
  noteHint: 'Optional',
  start: 'Start the history',
} as const;

/** The two timelines compared: by default the open history against what it branches from (or the first history). */
export function comparePair(
  data: TimelineData,
  chosen: { a: string | null; b: string | null },
  selected: AlternateHistory | null,
): { a: string | null; b: string | null } {
  const pick = (c: string | null, fallback: string | null) =>
    c === null ? fallback : c === 'main' ? null : data.histories.has(c) ? c : fallback;
  return {
    a: pick(chosen.a, selected?.baseId ?? null),
    b: pick(chosen.b, selected?.id ?? data.historyList[0]?.id ?? null),
  };
}

/** Comparing two timelines: the summary, and a line for each difference (the same ones only when asked). */
export function comparison(
  data: TimelineData,
  a: string | null,
  b: string | null,
  showSame: boolean,
): { summary: string; diffs: EventDifference[]; lines: { id: string; name: string; inA: string; inB: string; what: string }[] } {
  const main = data.model.events;
  const byId = data.histories;
  const diffs = compareTimelines(historyEvents(main, byId, a), historyEvents(main, byId, b), data.calendar);
  const nameA = timelineName(data, a);
  const nameB = timelineName(data, b);
  return {
    summary: comparisonSummary(diffs, nameA, nameB),
    diffs,
    lines: diffs
      .filter((d) => showSame || d.difference !== 'same')
      .map((d) => {
        const shown = (d.b ?? d.a)!;
        return {
          id: d.id,
          name: shown.name,
          inA: `In ${nameA}: ${d.a === null ? 'Does not happen' : `${d.a.name === shown.name ? '' : `${d.a.name}: `}${d.whenA}`}`,
          inB: `In ${nameB}: ${d.b === null ? 'Does not happen' : d.whenB}`,
          what:
            d.difference === 'same'
              ? 'The same'
              : d.difference === 'changed'
                ? `Changed: ${d.fields.join(', ')}`
                : d.difference === 'moved'
                  ? `Moved ${d.direction ?? ''}: its date depends on one that changed`.replaceAll('  ', ' ')
                  : d.difference === 'only-a'
                    ? `Only in ${nameA}`
                    : `Only in ${nameB}`,
        };
      }),
  };
}

export const compareWords = {
  title: 'Compare',
  a: 'Compare',
  b: 'with',
  showSame: 'Show the events that are the same too',
} as const;

/** The open history: what it is, where it departs and why, its edits, what is stale or reaches back, and its events. */
export function selectedHistory(data: TimelineData, h: AlternateHistory): {
  title: string;
  status: string;
  rest: string;
  origin: string;
  cause: string | null;
  note: string | null;
  departs: { value: string; choices: { value: string; label: string }[] };
  stale: string | null;
  before: string | null;
  events: {
    id: string;
    label: string;
    name: string;
    added: boolean;
    changed: string | null;
    changeLabel: string;
    restore: string | null;
    remove: { label: string; semantics: string };
  }[];
  removed: { id: string; name: string; restore: string }[];
} {
  const cal = data.calendar;
  const main = data.model.events;
  const byId = data.histories;
  const base = historyEvents(main, byId, h.baseId);
  const mine = historyEvents(main, byId, h.id);
  const baseOrder = resolveChronology(base.values(), cal);
  const stale = staleChanges(main, byId, h);
  const origin = h.originEventId === null ? null : (baseOrder.find((p) => p.event.id === h.originEventId) ?? null);
  const cause = h.causeEventId === null ? null : (baseOrder.find((p) => p.event.id === h.causeEventId) ?? null);
  const before =
    origin?.value == null
      ? []
      : [...h.changed.keys()].filter((id) => {
          const v = baseOrder.find((p) => p.event.id === id)?.value ?? null;
          return v !== null && v < origin.value!;
        });
  const addedIds = new Set(h.added.map((e) => e.id));
  const baseName = timelineName(data, h.baseId);
  return {
    title: h.name,
    status: historyStatusLabel(h.status),
    rest: ` · ${historyKindLabel[h.kind]}. ${canonWords[h.status] ?? ''}`,
    origin: originWords(h, base, byId, cal),
    cause:
      cause === null
        ? null
        : `Caused by “${cause.event.name}” (${cause.label})${origin !== null && cause.value !== null && origin.value !== null && cause.value > origin.value ? ', which comes later in story time than where this history departs: the change reaches back.' : '.'}`,
    note: h.note.length > 0 ? h.note : null,
    departs: {
      value: h.originEventId !== null && base.has(h.originEventId) ? h.originEventId : '',
      choices: [{ value: '', label: 'Across the whole timeline' }, ...baseOrder.map(eventChoice)],
    },
    stale:
      stale.length === 0
        ? null
        : `${stale.length === 1 ? '1 change points' : `${stale.length} changes point`} at events no longer in ${baseName}. They are not applied.`,
    before:
      before.length === 0
        ? null
        : `${before.map((id) => `“${base.get(id)?.name ?? 'null'}”`).join(', ')} ${before.length === 1 ? 'is' : 'are'} changed, though ${before.length === 1 ? 'it comes' : 'they come'} before where this history departs. That may be what you mean (a time-travel branch reaches back), or a slip.`,
    events: resolveChronology(mine.values(), cal).map((p) => {
      const e = p.event;
      const added = addedIds.has(e.id);
      const changed = h.changed.has(e.id);
      const was = base.get(e.id);
      const fields =
        changed && was !== undefined
          ? (compareTimelines(new Map([[e.id, was]]), new Map([[e.id, e]]), cal)[0]?.fields ?? [])
          : [];
      return {
        id: e.id,
        label: p.label,
        name: e.name,
        added,
        changed: changed ? `Changed here${fields.length === 0 ? '' : `: ${fields.join(', ')}`}` : null,
        changeLabel: `Change how “${e.name}” goes here`,
        restore: changed ? `Restore “${e.name}” as ${baseName} has it` : null,
        remove: added
          ? { label: 'Delete', semantics: `Delete “${e.name}”` }
          : { label: 'Does not happen here', semantics: 'Does not happen here' },
      };
    }),
    removed: h.removed
      .filter((id) => base.has(id))
      .map((id) => ({ id, name: base.get(id)!.name, restore: `Restore “${base.get(id)!.name}” as ${baseName} has it` })),
  };
}

export const selectedWords = {
  name: 'Name',
  status: 'Canon status',
  kind: 'Kind',
  departs: 'Departs at',
  forget: 'Forget them',
  events: 'Events in this history',
  onlyHere: 'Only in this history',
  change: 'Change',
  restore: 'Restore',
  notHappening: 'Do not happen in this history',
  newEvent: 'Name of an event only in this history',
  newEventHint: 'The parley at the gate',
  addEvent: 'Add an event only here',
  delete: 'Delete this history…',
} as const;

/** Asked before a history is deleted. */
export function deleteHistoryDialog(data: TimelineData, h: AlternateHistory): { title: string; message: string; confirm: string } {
  return {
    title: 'Delete this alternate history?',
    message: `“${h.name}” and its differences are deleted. The main timeline and its events are not touched. Histories based on this one are based on ${timelineName(data, h.baseId)} instead, keeping their own differences.`,
    confirm: 'Delete history',
  };
}

/** How an event goes in a history: the change sheet's draft, from the event as it is there. */
export function changeDraft(e: TimelineEvent): JsonMap {
  return {
    name: e.name,
    when: mapOrNull(e.raw['when']) ?? { precision: 'unknown' },
    locationId: e.locationId,
    ongoing: e.ongoing,
    description: e.description,
  };
}

export const changeWords = {
  title: (e: TimelineEvent) => `How “${e.name}” goes in this history`,
  name: 'Event name in this history',
  place: 'Where it happens in this history',
  notSet: 'Not set',
  ongoing: 'Still going on when the story ends',
  description: 'What happens in this history',
  cancel: 'Cancel',
  save: 'Save for this history',
} as const;

/** The change sheet's place chooser, for the draft. */
export function changePlaceChoices(data: TimelineData, draft: JsonMap): { value: string; choices: { value: string; label: string }[] } {
  const id = draft['locationId'];
  return {
    value: typeof id === 'string' && data.places.some((p) => p.id === id) ? id : '',
    choices: [{ value: '', label: 'Not set' }, ...data.places.map((p) => ({ value: p.id, label: p.name }))],
  };
}

// ---------------------------------------------------------------------------------------------------------- what if

/** A starting question: its words, and the event it departs at (when it turns on one). */
export type WhatIfStarter = { question: string; eventId: string | null };

/** Questions to begin from, out of the novel's own story: its first events ("What if The Fall of Emberhold never
 * happened?", departing there) and its people ("What if Mira chose otherwise?"), then a few that fit any story. At
 * most six. */
export function whatIfStarters(args: { events: readonly { id: string; name: string }[]; people: readonly string[] }): WhatIfStarter[] {
  const out: WhatIfStarter[] = [
    ...args.events
      .slice(0, 3)
      .filter((e) => dartTrim(e.name).length > 0)
      .map((e) => ({ question: `What if ${dartTrim(e.name)} never happened?`, eventId: e.id })),
    ...args.people
      .slice(0, 2)
      .filter((p) => dartTrim(p).length > 0)
      .map((p) => ({ question: `What if ${dartTrim(p)} chose otherwise?`, eventId: null })),
    { question: 'What if the hero failed?', eventId: null },
    { question: 'What if it all happened ten years earlier?', eventId: null },
  ];
  return out.slice(0, 6);
}

/** The history's name from a question as written: trimmed, with its question mark. */
export function whatIfName(question: string): string {
  const q = dartTrim(question);
  if (q.length === 0) return q;
  return /[?!.…]$/.test(q) ? q : `${q}?`;
}

/** The starters for this novel: its events in story order, its people. */
export function whatIfFor(data: TimelineData): WhatIfStarter[] {
  return whatIfStarters({
    events: resolveChronology(data.model.events.values(), data.calendar).map((p) => ({ id: p.event.id, name: p.event.name })),
    people: data.cast.characters().map((c) => c.name),
  });
}

/** WHAT IF…?: an alternate history begun as a question. In a frame padded 22/20/22/18: "What if…?" (20, bold), the
 * line (16, italic, faint), a rule, The question (19; hint "What if the Keep had held?"), "Or begin from one of these"
 * and the starters as chips (a fork icon when it turns on an event, a question mark when not), then Branch the story
 * (only with a question). Nothing is made until the press. */
export const whatIfWords = {
  title: 'What if…?',
  line: 'Try another course of events without touching the timeline. Ask the question; the history keeps only what you change.',
  question: 'The question',
  hint: 'What if the Keep had held?',
  begin: 'Or begin from one of these',
  branch: 'Branch the story',
} as const;

