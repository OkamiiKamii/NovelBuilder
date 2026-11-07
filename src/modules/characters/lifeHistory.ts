import { connectionType } from '@/modules/connections/types';
import { connectionsOf, deriveConnections } from '@/modules/model/connections';
import { eventRecord } from '@/modules/model/events';
import type { EntityRef, StoryModel } from '@/modules/model/types';
import { spanOfDate, spanOfEvent, timeContext, type Anchor } from '@/modules/model/validity';
import type { ProgressSnapshot } from '@/modules/progression/types';
import { changeWords, isUnknownTime, whenWords } from '@/modules/progression/track';
import { sortedStages } from '@/modules/relationships/timeline';
import { AFFINITY_LABELS } from '@/modules/relationships/types';
import { agesOf, birthDateOf, type AgeAt, type Birth } from '@/modules/timeline/ages';
import { formatDate, resolveChronology } from '@/modules/timeline/chronology';
import { nodeLabel } from '@/modules/timeline/narrative';
import { partsOf } from '@/modules/timeline/scale';
import type { CharacterHistory } from './types';

/**
 * A CHARACTER'S LIFE, FROM THE RECORDS
 * Everything the novel already records about one character, put together:
 * the events they take part in (with their age and where they were), the
 * places and groups they are tied to, the chapters they appear in, how their
 * relationships change, and how their abilities and state progress. Each
 * line is a reference to the record it comes from, to open or select there;
 * nothing is copied, and nothing is recorded here.
 *
 * Story time and reading order are kept apart (see `narrative.ts`):
 *  - in story time: events, and ties dated by an event or a date;
 *  - as the reader meets them: appearances, relationship changes, progression
 *    snapshots and milestones (which are all tied to chapters), and ties
 *    dated by a chapter;
 *  - throughout: ties with no time given, and the abilities on their sheet.
 */
export type HistoryKind = 'birth' | 'event' | 'place' | 'affiliation' | 'ability' | 'appearance' | 'relationship' | 'milestone' | 'progress' | 'journey';
export const HISTORY_KINDS: Record<HistoryKind, string> = { birth: 'Birth', event: 'Event', place: 'Place', affiliation: 'Affiliation', ability: 'Ability', appearance: 'Appearance', relationship: 'Relationship', milestone: 'Milestone', progress: 'Progression', journey: 'Journey' };

export interface HistoryItem {
  key: string;
  kind: HistoryKind;
  /** The shared record it comes from; null for a progression snapshot or a milestone, which `to` opens instead. */
  ref: EntityRef | null;
  /** A page that opens it, for the lines that are not records the model holds. */
  to?: { page: 'progression' | 'history' | 'tracker' | 'journeys'; id: string };
  title: string;
  /** More about it: where, how, until when. */
  detail: string;
  /** When: a date in story time, or a chapter in reading order. */
  when: string;
  /** Their age, for an event. */
  age: AgeAt | null;
  /** Where it sorts within its list: story time, or reading position. */
  order: number;
}

export interface LifeHistory {
  name: string;
  birth: Birth;
  /** How their birth is known, in a sentence. */
  born: string;
  story: HistoryItem[];
  reading: HistoryItem[];
  throughout: HistoryItem[];
  /** Things to check, in words. Nothing is changed. */
  issues: string[];
}

/** Extra records the model does not carry: progression snapshots and the author's milestones. */
export interface HistoryExtras {
  snapshots: ProgressSnapshot[];
  milestones: CharacterHistory[];
}

export function lifeHistory(model: StoryModel, characterId: string, extras: HistoryExtras = { snapshots: [], milestones: [] }): LifeHistory | null {
  const me = model.entries.get(characterId);
  if (!me) return null;
  const calendar = model.calendar;
  const context = timeContext(model);
  const placed = resolveChronology([...model.events.values()], calendar);
  // Story time for an event: its own, or for an undated one placed after another, just after that one's; nothing for one with no place at all.
  const storyTime = new Map<string, number>();
  let last = -Infinity;
  placed.forEach((p, i) => {
    if (!p.anchored) return;
    if (p.value !== null) last = p.value;
    storyTime.set(p.event.id, (Number.isFinite(last) ? last : -1e15) + i * 1e-6);
  });
  const nameOf = (ref: EntityRef) => (ref.type === 'entry' ? model.entries.get(ref.id)?.name : ref.type === 'ability' ? model.abilities.get(ref.id)?.item.name : ref.type === 'event' ? model.events.get(ref.id)?.name : undefined) ?? 'a deleted record';
  const position = (nodeId: string | null) => (nodeId === null ? -1 : (model.order.position.get(nodeId) ?? Number.MAX_SAFE_INTEGER));
  const chapter = (nodeId: string | null) => (nodeId === null ? 'Before the story' : nodeLabel(model, nodeId));

  const story: HistoryItem[] = [];
  const reading: HistoryItem[] = [];
  const throughout: HistoryItem[] = [];
  const seen = connectionsOf(deriveConnections(model).connections, { type: 'entry', id: characterId });

  // Events: as a participant, as involved, or through a typed link.
  const how = new Map<string, string>();
  for (const s of seen) {
    // Progression changes at an event are lines of their own (below), not a way of taking part in it.
    if (s.other.type !== 'event' || !model.events.has(s.other.id) || s.connection.kind === 'progress' || s.connection.kind === 'travel') continue;
    const words = s.connection.kind === 'participant' ? 'takes part' : s.connection.kind === 'involved' ? 'involved' : s.label || connectionType(s.connection.type).label;
    if (!how.has(s.other.id) || s.connection.kind === 'participant') how.set(s.other.id, words);
  }
  const ages = agesOf(characterId, model.events, calendar, birthDateOf(me), [...how.keys()]);
  for (const [eventId, words] of how) {
    const e = eventRecord(model, eventId)!;
    const place = e.location ? model.entries.get(e.location.id)?.name : undefined;
    story.push({ key: `event:${eventId}`, kind: 'event', ref: { type: 'event', id: eventId }, title: e.title, detail: [words, place ? `at ${place}` : ''].filter(Boolean).join(' · '), when: e.span ? e.label : 'Not placed in time', age: ages.at.get(eventId) ?? null, order: storyTime.get(eventId) ?? Infinity });
  }
  const birthDate = birthDateOf(me);
  if (birthDate && ages.birth.basis.some((b) => b.startsWith('the date of birth'))) {
    const span = ages.birth.basis.length ? ages.birth.span : null;
    story.push({ key: 'birth', kind: 'birth', ref: { type: 'entry', id: characterId }, title: 'Born', detail: 'the date of birth on their profile', when: birthDate, age: null, order: span?.lo ?? -Infinity });
  }

  // Ties to places, groups, abilities and other characters that the author made as connections, placed by when they hold.
  const anchorWords = (a: Anchor) => (a.kind === 'node' ? chapter(a.nodeId) : a.kind === 'event' ? `“${model.events.get(a.eventId)?.name ?? 'a deleted event'}”` : formatDate(a.when, (id) => model.events.get(id)?.name, calendar));
  for (const s of seen) {
    if (s.connection.kind !== 'link' && s.connection.kind !== 'field') continue;
    if (s.other.type !== 'entry' && s.other.type !== 'ability') continue;
    const other = s.other.type === 'entry' ? model.entries.get(s.other.id) : undefined;
    const kind: HistoryKind = s.other.type === 'ability' ? 'ability' : other?.category === 'location' ? 'place' : other?.category === 'character' ? 'relationship' : 'affiliation';
    const words = s.label || (s.connection.kind === 'link' ? connectionType(s.connection.type).label : '') || 'Linked to';
    const { from, until } = s.connection.validity ?? { from: null, until: null };
    const span = [from ? `from ${anchorWords(from)}` : '', until ? `until ${anchorWords(until)}` : ''].filter(Boolean).join(' ');
    const item = { key: `link:${s.connection.id}:${s.outgoing}`, kind, ref: s.other, title: `${words} ${nameOf(s.other)}`, detail: span, age: null };
    const anchor = from ?? until;
    if (!anchor) throughout.push({ ...item, when: 'No time given', order: 0 });
    else if (anchor.kind === 'node') reading.push({ ...item, when: chapter(anchor.nodeId), order: position(anchor.nodeId) });
    else {
      const at = anchor.kind === 'event' ? spanOfEvent(anchor.eventId, context) : spanOfDate(anchor.when, context);
      // Dated from an event, it comes just after that event.
      const order = anchor.kind === 'event' && storyTime.has(anchor.eventId) ? storyTime.get(anchor.eventId)! + 1e-7 : (at?.lo ?? Infinity);
      story.push({ ...item, when: anchorWords(anchor), order });
    }
  }

  // Appearances: the author's appearance records (on the page, only mentioned, whose point of view), as the
  // appearances matrix reads them; and the other records that tie them to a chapter, linked in its text or listed in its plan.
  const appearances = new Map<string, { record: 'appears' | 'mentioned' | 'pov' | null; ways: string[] }>();
  for (const s of seen) {
    const kind = s.connection.kind;
    if (s.other.type !== 'node' || (kind !== 'mentioned' && kind !== 'present' && kind !== 'appearance')) continue;
    const at = appearances.get(s.other.id) ?? appearances.set(s.other.id, { record: null, ways: [] }).get(s.other.id)!;
    if (kind !== 'appearance') at.ways.push(kind === 'mentioned' ? 'linked in the text' : 'in the chapter plan');
    else if (s.connection.id.startsWith('pov:')) {
      at.record ??= 'pov';
      at.ways.push('their point of view');
    } else if (s.connection.label.startsWith('Mentioned')) {
      if (at.record !== 'appears') at.record = 'mentioned';
      at.ways.push('mentioned, not on the page (your appearance record)');
    } else {
      at.record = 'appears';
      at.ways.push('on the page (your appearance record)');
    }
  }
  const verb = { appears: 'Appears in', mentioned: 'Mentioned in', pov: 'Point of view in' } as const;
  const andList = (list: string[]) => (list.length > 2 ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}` : list.join(' and '));
  for (const [nodeId, { record, ways }] of appearances) reading.push({ key: `node:${nodeId}`, kind: 'appearance', ref: { type: 'node', id: nodeId }, title: `${record ? verb[record] : 'Appears in'} ${nodeLabel(model, nodeId)}`, detail: andList([...new Set(ways)]), when: chapter(nodeId), age: null, order: position(nodeId) });

  // Relationship changes, each stage from where it begins.
  for (const relation of model.relations.values()) {
    if (relation.fromId !== characterId && relation.toId !== characterId) continue;
    const otherName = model.entries.get(relation.fromId === characterId ? relation.toId : relation.fromId)?.name ?? 'someone deleted';
    sortedStages(relation, model.order).forEach((stage, i) =>
      reading.push({ key: `relation:${relation.id}:${stage.id}`, kind: 'relationship', ref: { type: 'relation', id: relation.id }, title: `${i === 0 ? 'Relationship with' : 'Relationship changes with'} ${otherName}: ${stage.title || stage.label || 'related'}`, detail: AFFINITY_LABELS[stage.affinity] ?? '', when: chapter(stage.startNodeId), age: null, order: position(stage.startNodeId) }),
    );
  }

  // Ability and state changes, as the progression tracker records them; and the author's milestones.
  for (const snap of extras.snapshots.filter((s) => s.entryId === characterId)) {
    reading.push({ key: `snap:${snap.id}`, kind: 'ability', ref: null, to: { page: 'progression', id: snap.id }, title: snap.label.trim() || 'State recorded', detail: 'progression snapshot', when: chapter(snap.nodeId), age: null, order: position(snap.nodeId) });
  }
  for (const line of extras.milestones.filter((m) => m.entryId === characterId && m.kind === 'story')) {
    reading.push({ key: `milestone:${line.id}`, kind: 'milestone', ref: null, to: { page: 'history', id: line.id }, title: line.text, detail: 'milestone', when: chapter(line.nodeId), age: null, order: position(line.nodeId) });
  }

  // Progression changes, placed by when they happen: a chapter or scene in reading order, an event or date in story time, before the story at the very start; with no time known, throughout.
  for (const change of model.progress.filter((c) => c.entryId === characterId)) {
    const category = model.progressCategories.get(change.categoryId);
    const item = { key: `progress:${change.id}`, kind: 'progress' as const, ref: null, to: { page: 'tracker' as const, id: change.id }, title: changeWords(change, category, model), detail: [category?.name ?? '', change.cost ? `cost: ${change.cost}` : ''].filter(Boolean).join(' · '), when: whenWords(change.at, model), age: null };
    const at = change.at;
    if (at === null || at.kind === 'node') reading.push({ ...item, order: position(at === null ? null : at.nodeId) });
    else if (isUnknownTime(at)) throughout.push({ ...item, order: 2 });
    else {
      const span = at.kind === 'event' ? spanOfEvent(at.eventId, context) : spanOfDate(at.when, context);
      const order = at.kind === 'event' && storyTime.has(at.eventId) ? storyTime.get(at.eventId)! + 2e-7 : (span?.lo ?? Infinity);
      story.push({ ...item, order });
    }
  }

  // Journeys, placed by when they set out (or arrive, when that is all that is known): a chapter in reading order, an event or a date in story time; with no time known, throughout.
  for (const journey of model.journeys.filter((j) => j.travellerIds.includes(characterId))) {
    const place = (id: string | null) => (id ? (model.entries.get(id)?.name ?? 'a place that is gone') : 'somewhere not recorded');
    const at = journey.departure ?? journey.arrival;
    const item = { key: `journey:${journey.id}`, kind: 'journey' as const, ref: null, to: { page: 'journeys' as const, id: journey.id }, title: `Travels from ${place(journey.fromId)} to ${place(journey.toId)}`, detail: journey.method, when: at ? whenWords(at, model) : 'When is not known', age: null };
    if (!at) throughout.push({ ...item, order: 3 });
    else if (at.kind === 'node') reading.push({ ...item, order: position(at.nodeId) });
    else {
      const span = at.kind === 'event' ? spanOfEvent(at.eventId, context) : spanOfDate(at.when, context);
      story.push({ ...item, order: at.kind === 'event' && storyTime.has(at.eventId) ? storyTime.get(at.eventId)! + 3e-7 : (span?.lo ?? Infinity) });
    }
  }

  // The abilities on their system sheets: held, with no time given.
  for (const sheet of model.sheets.filter((s) => s.entryId === characterId)) {
    for (const itemId of sheet.itemIds) {
      const id = `${sheet.systemId}/${itemId}`;
      const ability = model.abilities.get(id);
      if (ability) throughout.push({ key: `holds:${id}`, kind: 'ability', ref: { type: 'ability', id }, title: `Holds ${ability.item.name}`, detail: ability.system.name, when: 'On their sheet', age: null, order: 1 });
    }
  }

  const sort = (list: HistoryItem[]) => list.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  const issues: string[] = [];
  if (ages.birth.unread) issues.push(`The date of birth on ${me.name}’s profile, “${ages.birth.unread}”, could not be read as a date${calendar.standard ? '' : ` in ${calendar.name}`}, so ages are not counted from it. Write it as a year (1000), a year and month (1000-3), or a full date (1000-3-1).`);
  if (ages.birth.conflict) issues.push(`What is recorded about ${me.name}’s age does not agree (${ages.birth.basis.join('; ')}), so no age is worked out from it together. Each age given at an event still shows.`);
  for (const [eventId, issue] of ages.issues) issues.push(`“${model.events.get(eventId)?.name}”: ${issue.replace(/^Stated/, `${me.name} is stated`).replace(/^Takes part/, `${me.name} takes part`)}`);
  return { name: me.name, birth: ages.birth, born: bornWords(ages.birth, model), story: sort(story), reading: sort(reading), throughout: sort(throughout), issues };
}

/** When they were born, in a sentence, and what that is worked out from. */
function bornWords(birth: Birth, model: StoryModel): string {
  if (!birth.span) {
    if (birth.conflict) return 'When they were born cannot be worked out: what is recorded does not agree.';
    return 'When they were born is not recorded. Give a date of birth on their profile, or their age at any dated event (0 at their birth), and their ages are worked out from it.';
  }
  const c = model.calendar;
  const day = (t: number) => {
    const p = partsOf(t, c);
    return formatDate({ precision: 'exact', year: p.year, month: p.month + 1, day: p.day + 1, hour: null, minute: null }, undefined, c);
  };
  const [lo, hi] = [day(birth.span.lo), day(birth.span.hi)];
  return `Born ${lo === hi ? `on ${lo}` : `between ${lo} and ${hi}`}, worked out from ${birth.basis.join(' and ')}.`;
}
