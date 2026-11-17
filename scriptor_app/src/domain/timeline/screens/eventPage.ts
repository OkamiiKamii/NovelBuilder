// One event: when, where, who, what it links to, where it sits in the order, and where the reader meets it. Every edit
// is saved through the timeline's checks, built on the event as it is stored at that moment. The pure parts of
// flutter_app/lib/features/timeline/event_page.dart.
//
// The page, top to bottom: the title (its name, "Untitled event") and "<Importance> · <when>"; the actions What depends
// on this event? (comes with Review's consequences) and Timeline (back to /plan); "Things to check" (a card with an
// error border: each issue as a bullet, and when findings are among them, "The rule behind each, and what you can do:
// Timeline review"); Event name (saved as typed); the date editor (dateEditor.ts); Importance, Location (260 each),
// Lasts (124, decimals; only when it has no end and is not going on) and its Unit (124); Ends; the end's date editor
// ("Ends on", fields named "End …", no Undated); Planning status and Canon status (260 each); Plot threads; Labels;
// Characters involved (each with their age, 130, the worked-out one as its hint); Chapters and scenes where this is
// told (each with how it tells it, 210, and Unlink; then "Compare story order and reading order", with Visualize);
// Factions, items and lore involved; Comes after; "Followed by: …"; Description (saved as typed, 4 lines); At the same
// time; Connections; "Changing chapters never changes this date." and Delete event….

import { localeCompare } from '../../collation';
import { type JsonMap, mapOrNull } from '../../json';
import { stableSorted } from '../../reader/stableSort';
import { canonStatusLabel, canonStatusOf, canonStatuses } from '../../records/canon';
import { type RevealRole, type TimelineEvent, UnknownDate, timeUnits } from '../../records/event';
import { maps } from '../../records/jsonRecord';
import { type AgeAt, type LifeStep, ageWords, birthDateOf, lifePath } from '../ages';
import type { Placed } from '../chronology';
import { nodeLabel } from '../narrative';
import { atTheSameTime, togetherWords } from '../overlap';
import { eventStatusLabels, importanceLabels, revealChoices } from './timelinePage';
import type { TimelineData } from './timelineData';

/** How it ends, as the Ends choice holds it: '' (a moment, or when its length is over), 'date', 'unknown' or 'ongoing'. */
export type EndMode = '' | 'date' | 'unknown' | 'ongoing';

export function endModeOf(event: TimelineEvent): EndMode {
  if (event.ongoing) return 'ongoing';
  if (event.raw['end'] === null || event.raw['end'] === undefined) return '';
  return event.end instanceof UnknownDate ? 'unknown' : 'date';
}

/** The Ends choices. */
export function endChoices(event: TimelineEvent): { value: EndMode; label: string }[] {
  return [
    { value: '', label: event.duration !== null ? 'When the time it lasts is over' : 'At once: it is a moment' },
    { value: 'date', label: 'On a date…' },
    { value: 'unknown', label: 'At a time not given' },
    { value: 'ongoing', label: 'Still going on' },
  ];
}

/** What choosing how it ends changes, from the event as stored. A date starts from the end it already has, or the day
 * it begins, for the author to move on. */
export function endChanged(mode: EndMode): (stored: TimelineEvent) => JsonMap {
  return (stored) => {
    switch (mode) {
      case 'ongoing':
        return { ongoing: true };
      case 'unknown':
        return { end: { precision: 'unknown' } };
      case 'date': {
        const end = mapOrNull(stored.raw['end']);
        const when = mapOrNull(stored.raw['when']);
        const from =
          end !== null && end['precision'] !== 'unknown'
            ? end
            : when?.['precision'] === 'exact' || when?.['precision'] === 'approximate'
              ? when
              : null;
        return { end: from ?? { precision: 'exact', year: 1, month: null, day: null, hour: null, minute: null } };
      }
      default:
        return { end: null, ongoing: false };
    }
  };
}

/** The hint under Ends. */
export function endHint(mode: EndMode): string | null {
  if (mode === 'unknown') {
    return 'It lasts a while, but its end is not given yet. The timeline draws it fading out after it begins, and never says it is over.';
  }
  if (mode === 'ongoing') return 'Still going on when the story ends: the timeline draws it to the edge, with an arrow.';
  return null;
}

/** Lasts: what typing a length saves (0 or empty: no duration), and its check. */
export const lastsCheck = (v: number | null): string | null =>
  v !== null && v < 0 ? 'Give a length of 0 or more; it was not changed.' : null;
export const lastsChanged =
  (v: number | null) =>
  (stored: TimelineEvent): JsonMap => ({
    duration: v === null || v === 0 ? null : { amount: v, unit: stored.duration?.unit ?? 'days' },
  });
/** Its unit: changed only while it has a duration. */
export const unitChanged =
  (unit: string) =>
  (stored: TimelineEvent): JsonMap =>
    stored.duration === null ? {} : { duration: { amount: stored.duration.amount, unit } };
export const unitChoices = timeUnits.map((u) => ({ value: u, label: u }));

/** The age field for someone taking part: its hint ("≈ 26", "≈ 25–26", "Age") and check. */
export function ageHint(age: AgeAt | null | undefined): string {
  if (age?.kind === 'known') return `≈ ${ageWords(age)}`;
  if (age?.kind === 'range') return `≈ ${age.min}–${age.max}`;
  return 'Age';
}
export const ageCheck = (v: number | null): string | null =>
  v !== null && (v < 0 || v > 100000) ? 'An age from 0 up; it was not changed.' : null;

/** Changes to who takes part, from the event as stored. */
export const characterChanges = {
  add:
    (id: string) =>
    (stored: TimelineEvent): JsonMap => ({ characters: [...stored.characters, { id, age: null }] }),
  age:
    (id: string, age: number | null) =>
    (stored: TimelineEvent): JsonMap => ({
      characters: stored.characters.map((x) => ({ id: x.id, age: x.id === id ? age : x.age })),
    }),
  remove:
    (id: string) =>
    (stored: TimelineEvent): JsonMap => ({ characters: stored.characters.filter((x) => x.id !== id) }),
};

/** Changes to the chapters that tell it, from the event as stored. */
export const tellingChanges = {
  link:
    (nodeId: string) =>
    (stored: TimelineEvent): JsonMap => ({ nodeIds: [...stored.nodeIds, nodeId] }),
  role:
    (nodeId: string, role: RevealRole | null) =>
    (stored: TimelineEvent): JsonMap => ({
      reveals: [
        ...maps(stored.raw['reveals']).filter((r) => r['nodeId'] !== nodeId),
        ...(role !== null && role !== 'told' ? [{ nodeId, role }] : []),
      ],
    }),
  unlink:
    (nodeId: string) =>
    (stored: TimelineEvent): JsonMap => ({ nodeIds: stored.nodeIds.filter((n) => n !== nodeId) }),
};

export type EventPageView = {
  title: string;
  subtitle: string;
  issues: string[];
  /** Findings are among the issues: the page offers the timeline review. */
  reviewLink: string | null;
  others: Placed[];
  endMode: EndMode;
  importance: { value: string; choices: { value: string; label: string }[] };
  location: { value: string; choices: { value: string; label: string }[] };
  status: { value: string; choices: { value: string; label: string }[] };
  canon: { value: string; choices: { value: string; label: string }[] };
  threads: { chosen: string[]; options: { id: string; label: string }[] };
  cast: { id: string; name: string; age: number | null; hint: string; step: LifeStep | null }[];
  addCharacter: { id: string; label: string }[];
  told: { nodeId: string; label: string; role: RevealRole; roleLabel: string; unlink: string }[];
  linkChapter: { id: string; label: string }[];
  entries: { chosen: string[]; options: { id: string; label: string }[] };
  after: { value: string; choices: { value: string; label: string }[] };
  followers: string | null;
  sameTime: { empty: string | null; lines: { id: string; text: string }[] };
  words: typeof eventWords;
};

export const eventWords = {
  name: 'Event name',
  importance: 'Importance',
  location: 'Location',
  lasts: 'Lasts',
  unit: 'Unit',
  ends: 'Ends',
  endsOn: 'Ends on',
  endPrefix: 'End',
  status: 'Planning status',
  canon: 'Canon status',
  threads: 'Plot threads',
  characters: 'Characters involved',
  charactersCaption:
    'Their age at this event (0 for their birth). Leave it empty to have it worked out from their other records.',
  addCharacter: 'Add a character',
  nobody: 'No one yet.',
  toldTitle: 'Chapters and scenes where this is told',
  toldCaption:
    'In reading order, each with how it tells it. Where it is told never changes when it happens, and no chapter is moved.',
  linkChapter: 'Link a chapter or scene',
  notLinked: 'Not linked to a chapter yet.',
  compareOrders: 'Compare story order and reading order',
  entries: 'Factions, items and lore involved',
  after: 'Comes after (previous event)',
  description: 'Description',
  sameTime: 'At the same time',
  thingsToCheck: 'Things to check',
  footer: 'Changing chapters never changes this date.',
  delete: 'Delete event…',
  consequences: 'What depends on this event?',
  back: 'Timeline',
  missingTitle: 'This event is not here',
  missingNoNovel: 'Open a novel from the Library to see its timeline.',
  missing: 'It may have been deleted. The timeline lists every event the novel has.',
  openTimeline: 'Open the timeline',
} as const;

/** The event page for one event, or null when there is no such event. */
export function eventPage(data: TimelineData, eventId: string): EventPageView | null {
  const placed = data.placedById.get(eventId);
  if (placed === undefined) return null;
  const event = placed.event;
  const model = data.model;
  const cal = data.calendar;
  const id = event.id;
  const others = data.placed.filter((p) => p.event.id !== id);
  const cast = event.characters.flatMap((c) => {
    const entry = model.entries.get(c.id);
    return entry === undefined ? [] : [{ id: c.id, age: c.age, entry }];
  });
  const steps = new Map(
    cast.map((c) => [
      c.id,
      lifePath(data.placed, c.id, { calendar: cal, birthDate: birthDateOf(c.entry) }).find((s) => s.placed.event.id === id) ?? null,
    ]),
  );
  const findings = data.findingsOf(id);
  const issues = [
    ...placed.issues,
    ...cast.flatMap((c) => {
      const issue = steps.get(c.id)?.issue ?? null;
      return issue === null
        ? []
        : [issue.replace(/^Stated/, `${c.entry.name} is stated`).replace(/^Takes part/, `${c.entry.name} takes part`)];
    }),
    ...findings.map((f) => f.message),
  ];
  const record = data.recordById.get(id)!;
  const followers = others.filter((p) => p.event.afterId === id).map((p) => p.event.name);
  const sameTime = atTheSameTime(data.records, id, cal.minutesPerDay);
  const linked = record.told.filter((t) => model.nodes.has(t.nodeId));
  const statusKey = event.statusKey;
  const canonKey = canonStatusOf(event.canonKey) ?? 'canon';
  return {
    title: event.name.length === 0 ? 'Untitled event' : event.name,
    subtitle: `${importanceLabels[event.importanceKey] ?? 'Minor'} · ${record.label}`,
    issues,
    reviewLink: findings.length > 0 ? 'The rule behind each, and what you can do: Timeline review' : null,
    others,
    endMode: endModeOf(event),
    importance: {
      value: event.importanceKey in importanceLabels ? event.importanceKey : 'minor',
      choices: Object.entries(importanceLabels).map(([value, label]) => ({ value, label })),
    },
    location: {
      value: data.places.some((p) => p.id === event.locationId) ? (event.locationId ?? '') : '',
      choices: [
        { value: '', label: data.places.length === 0 ? 'No locations in the world yet' : 'Not set' },
        ...data.places.map((p) => ({ value: p.id, label: p.name })),
      ],
    },
    status: {
      value: statusKey in eventStatusLabels ? statusKey : 'confirmed',
      choices: Object.entries(eventStatusLabels).map(([value, label]) => ({ value, label })),
    },
    canon: { value: canonKey, choices: canonStatuses.map((s) => ({ value: s, label: canonStatusLabel[s] })) },
    threads: {
      chosen: event.threadIds,
      options: data.threads.map((t) => ({ id: t.id, label: t.title.length === 0 ? 'Untitled thread' : t.title })),
    },
    cast: cast.map((c) => ({
      id: c.id,
      name: c.entry.name.length === 0 ? 'Unnamed' : c.entry.name,
      age: c.age,
      hint: ageHint(steps.get(c.id)?.ageAt),
      step: steps.get(c.id) ?? null,
    })),
    addCharacter: data.cast
      .characters()
      .filter((c) => !event.characters.some((x) => x.id === c.id))
      .map((c) => ({ id: c.id, label: c.name })),
    told: linked.map((t) => ({
      nodeId: t.nodeId,
      label: nodeLabel(model, t.nodeId),
      role: t.role,
      roleLabel: `How ${nodeLabel(model, t.nodeId)} tells it`,
      unlink: `Unlink ${nodeLabel(model, t.nodeId)}`,
    })),
    linkChapter: data.cast.documents
      .filter((d) => !event.nodeIds.includes(d.id))
      .map((d) => ({ id: d.id, label: nodeLabel(model, d.id) })),
    entries: {
      chosen: event.entryIds,
      options: stableSorted(
        data.cast.entries.filter((e) => e.category !== 'character'),
        (a, b) => localeCompare(a.name, b.name),
      ).map((e) => ({ id: e.id, label: e.name.length === 0 ? 'Untitled' : e.name })),
    },
    after: {
      value: others.some((p) => p.event.id === event.afterId) ? (event.afterId ?? '') : '',
      choices: [
        { value: '', label: 'Not set' },
        ...others.map((p) => ({ value: p.event.id, label: p.event.name.length === 0 ? 'Untitled event' : p.event.name })),
      ],
    },
    followers: followers.length > 0 ? `Followed by: ${followers.join(', ')}` : null,
    sameTime: {
      empty:
        record.bounds === null
          ? 'Not placed in time yet, so nothing can be compared.'
          : sameTime.length === 0
            ? 'Nothing else happens then.'
            : null,
      lines: sameTime.map((x) => {
        const placeId = x.record.event.locationId;
        const place = placeId === null ? undefined : model.entries.get(placeId);
        return {
          id: x.record.id,
          text: `${x.record.title} · ${togetherWords[x.how]}${place !== undefined ? ` · at ${place.name}` : ''}`,
        };
      }),
    },
    words: eventWords,
  };
}

/** The reveal choices, as the "How … tells it" chooser offers them. */
export const revealRoleChoices = Object.entries(revealChoices).map(([value, label]) => ({ value: value as RevealRole, label }));

/** Asked before an event is deleted, and the toast after. */
export function deleteEventDialog(event: TimelineEvent, followed: boolean): {
  name: string;
  title: string;
  message: string;
  confirm: string;
  cancel: string;
  deleted: string;
  undo: string;
} {
  const name = event.name.length === 0 ? 'Untitled event' : event.name;
  return {
    name,
    title: `Delete ${name}?`,
    message: `Chapters, scenes and entries it links to are not changed, and its connections go with it.${followed ? ' Events set to follow it will be flagged so you can place them again.' : ''} You can undo this.`,
    confirm: 'Delete',
    cancel: 'Cancel',
    deleted: `Deleted ${name}.`,
    undo: 'Undo',
  };
}
