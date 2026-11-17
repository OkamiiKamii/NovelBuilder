// A CHARACTER'S LIFE, FROM THE RECORDS. A port of flutter_app/lib/shared/domain/timeline/life_history.dart.
//
// Everything the novel already records about one character, put together. Each line is a reference to the record it
// comes from; nothing is copied, and nothing is recorded here. Story time and reading order are kept apart: events and
// ties dated by an event or a date in story time; appearances, relationship changes, snapshots, milestones and ties
// dated by a chapter as the reader meets them; the rest throughout.

import type { CharacterHistoryLine } from '../characters/characterRecords';
import { localeCompare } from '../collation';
import { type JsonMap, idOrNull, str } from '../json';
import { compareNum } from '../manuscript/dartSort';
import { changeWords, connectionsOf, deriveConnections } from '../model/connections';
import { EntityRef } from '../model/entityRef';
import type { StoryModel } from '../model/storyModel';
import { sortedStages } from '../model/storyOrder';
import { type Anchor, DateAnchor, EventAnchor, NodeAnchor, spanOfDate, spanOfEvent } from '../model/validity';
import { stableSorted } from '../reader/stableSort';
import { ExactDate, UnknownDate } from '../records/event';
import { connectionType } from '../records/link';
import { affinityLabels, affinityOf } from '../relationships/relationTypes';
import { dartTrim } from '../text/dartString';
import { type AgeAt, type Birth, agesOf, birthDateOf } from './ages';
import { resolveChronology } from './chronology';
import { formatDate } from './dates';
import { eventRecord } from './eventRecord';
import { nodeLabel } from './narrative';
import { partsOf } from './scale';

/** What kind of line a life history has. */
export type HistoryItemKind =
  | 'birth'
  | 'event'
  | 'place'
  | 'affiliation'
  | 'ability'
  | 'appearance'
  | 'relationship'
  | 'milestone'
  | 'progress'
  | 'journey';

export const historyItemKindLabel: Readonly<Record<HistoryItemKind, string>> = {
  birth: 'Birth',
  event: 'Event',
  place: 'Place',
  affiliation: 'Affiliation',
  ability: 'Ability',
  appearance: 'Appearance',
  relationship: 'Relationship',
  milestone: 'Milestone',
  progress: 'Progression',
  journey: 'Journey',
};

/** A page that opens a line that is not a record the model holds. */
export type HistoryLink = { page: string; id: string };

export class HistoryItem {
  readonly key: string;
  readonly kind: HistoryItemKind;
  /** The shared record it comes from; null for a line `to` opens instead. */
  readonly ref: EntityRef | null;
  readonly to: HistoryLink | null;
  readonly title: string;
  /** More about it: where, how, until when. */
  readonly detail: string;
  /** When: a date in story time, or a chapter in reading order. */
  readonly when: string;
  /** Their age, for an event. */
  readonly age: AgeAt | null;
  /** Where it sorts within its list: story time, or reading position. */
  readonly order: number;

  constructor(args: {
    key: string;
    kind: HistoryItemKind;
    ref: EntityRef | null;
    to?: HistoryLink | null;
    title: string;
    detail: string;
    when: string;
    age: AgeAt | null;
    order: number;
  }) {
    this.key = args.key;
    this.kind = args.kind;
    this.ref = args.ref;
    this.to = args.to ?? null;
    this.title = args.title;
    this.detail = args.detail;
    this.when = args.when;
    this.age = args.age;
    this.order = args.order;
  }
}

export class LifeHistory {
  constructor(
    readonly name: string,
    readonly birth: Birth,
    /** How their birth is known, in a sentence. */
    readonly born: string,
    readonly story: readonly HistoryItem[],
    readonly reading: readonly HistoryItem[],
    readonly throughout: readonly HistoryItem[],
    /** Things to check, in words. Nothing is changed. */
    readonly issues: readonly string[],
  ) {}
}

const isUnknownTime = (at: Anchor | null): boolean => at instanceof DateAnchor && at.when instanceof UnknownDate;

/** When a progression change or a journey happens, in words. */
export function whenWords(at: Anchor | null, model: StoryModel): string {
  if (at === null) return 'Before the story';
  if (isUnknownTime(at)) return 'When is not known';
  if (at instanceof NodeAnchor) return model.nodes.has(at.nodeId) ? nodeLabel(model, at.nodeId) : 'A chapter that was deleted';
  if (at instanceof EventAnchor) return `At “${model.events.get(at.eventId)?.name ?? 'a deleted event'}”`;
  return formatDate((at as DateAnchor).when, (id) => model.events.get(id)?.name ?? null, model.calendar);
}

const maxSafe = 9007199254740991.0;

/** A character's life from the records, or null when there is no such entry. */
export function lifeHistory(
  model: StoryModel,
  characterId: string,
  options: { snapshots?: readonly JsonMap[]; milestones?: readonly CharacterHistoryLine[] } = {},
): LifeHistory | null {
  const snapshots = options.snapshots ?? [];
  const milestones = options.milestones ?? [];
  const me = model.entries.get(characterId);
  if (me === undefined) return null;
  const calendar = model.calendar;
  const context = model.timeContext;
  const placed = resolveChronology(model.events.values(), calendar);
  // Story time for an event: its own, or for an undated one placed after another, just after that one's.
  const storyTime = new Map<string, number>();
  let last = -Infinity;
  placed.forEach((p, i) => {
    if (!p.anchored) return;
    if (p.value !== null) last = p.value;
    storyTime.set(p.event.id, (Number.isFinite(last) ? last : -1e15) + i * 1e-6);
  });
  const nameOf = (ref: EntityRef): string =>
    (ref.type === 'entry'
      ? model.entries.get(ref.id)?.name
      : ref.type === 'ability'
        ? model.abilities.get(ref.id)?.item.name
        : ref.type === 'event'
          ? model.events.get(ref.id)?.name
          : undefined) ?? 'a deleted record';
  const position = (nodeId: string | null): number =>
    nodeId === null ? -1 : (model.order.position.get(nodeId) ?? maxSafe);
  const chapter = (nodeId: string | null): string => (nodeId === null ? 'Before the story' : nodeLabel(model, nodeId));

  const story: HistoryItem[] = [];
  const reading: HistoryItem[] = [];
  const throughout: HistoryItem[] = [];
  const seen = connectionsOf(deriveConnections(model).connections, new EntityRef('entry', characterId));

  // Events: as a participant, as involved, or through a typed link.
  const how = new Map<string, string>();
  for (const s of seen) {
    const kind = s.connection.kind;
    // Progression changes at an event are lines of their own (below), not a way of taking part in it.
    if (s.other.type !== 'event' || !model.events.has(s.other.id)) continue;
    if (kind === 'progress' || kind === 'travel') continue;
    const words =
      kind === 'participant'
        ? 'takes part'
        : kind === 'involved'
          ? 'involved'
          : s.label.length > 0
            ? s.label
            : connectionType(s.connection.type).label;
    if (!how.has(s.other.id) || kind === 'participant') how.set(s.other.id, words);
  }
  const birthDate = birthDateOf(me);
  const ages = agesOf(characterId, model.events, { calendar, birthDate, eventIds: [...how.keys()] });
  for (const [eventId, words] of how) {
    const e = eventRecord(model, eventId)!;
    const place = e.event.locationId === null ? null : (model.entries.get(e.event.locationId)?.name ?? null);
    story.push(
      new HistoryItem({
        key: `event:${eventId}`,
        kind: 'event',
        ref: new EntityRef('event', eventId),
        title: e.title,
        detail: [words, ...(place !== null && place.length > 0 ? [`at ${place}`] : [])].join(' · '),
        when: e.span !== null ? e.label : 'Not placed in time',
        age: ages.at.get(eventId) ?? null,
        order: storyTime.get(eventId) ?? Infinity,
      }),
    );
  }
  if (birthDate !== null && ages.birth.basis.some((b) => b.startsWith('the date of birth'))) {
    story.push(
      new HistoryItem({
        key: 'birth',
        kind: 'birth',
        ref: new EntityRef('entry', characterId),
        title: 'Born',
        detail: 'the date of birth on their profile',
        when: birthDate,
        age: null,
        order: ages.birth.span?.lo ?? -Infinity,
      }),
    );
  }

  // Ties the author made as connections, placed by when they hold.
  const anchorWords = (a: Anchor): string => {
    if (a instanceof NodeAnchor) return chapter(a.nodeId);
    if (a instanceof EventAnchor) return `“${model.events.get(a.eventId)?.name ?? 'a deleted event'}”`;
    return formatDate((a as DateAnchor).when, (id) => model.events.get(id)?.name ?? null, calendar);
  };
  for (const s of seen) {
    const kind = s.connection.kind;
    if (kind !== 'link' && kind !== 'field') continue;
    if (s.other.type !== 'entry' && s.other.type !== 'ability') continue;
    const other = s.other.type === 'entry' ? (model.entries.get(s.other.id) ?? null) : null;
    const itemKind: HistoryItemKind =
      s.other.type === 'ability'
        ? 'ability'
        : other?.category === 'location'
          ? 'place'
          : other?.category === 'character'
            ? 'relationship'
            : 'affiliation';
    const typeWords = kind === 'link' ? connectionType(s.connection.type).label : '';
    const words = s.label.length > 0 ? s.label : typeWords.length > 0 ? typeWords : 'Linked to';
    const from = s.connection.validity?.from ?? null;
    const until = s.connection.validity?.until ?? null;
    const span = [
      ...(from !== null ? [`from ${anchorWords(from)}`] : []),
      ...(until !== null ? [`until ${anchorWords(until)}`] : []),
    ].join(' ');
    const item = (when: string, order: number) =>
      new HistoryItem({
        key: `link:${s.connection.id}:${s.outgoing}`,
        kind: itemKind,
        ref: s.other,
        title: `${words} ${nameOf(s.other)}`,
        detail: span,
        when,
        age: null,
        order,
      });
    const anchor = from ?? until;
    if (anchor === null) {
      throughout.push(item('No time given', 0));
    } else if (anchor instanceof NodeAnchor) {
      reading.push(item(chapter(anchor.nodeId), position(anchor.nodeId)));
    } else if (anchor instanceof EventAnchor) {
      // Dated from an event, it comes just after that event.
      const at = spanOfEvent(anchor.eventId, context);
      const t = storyTime.get(anchor.eventId);
      story.push(item(anchorWords(anchor), t !== undefined ? t + 1e-7 : (at?.lo ?? Infinity)));
    } else {
      story.push(item(anchorWords(anchor), spanOfDate((anchor as DateAnchor).when, context)?.lo ?? Infinity));
    }
  }

  // Appearances: the author's appearance records, and the other records that tie them to a chapter (linked in its
  // text or listed in its plan).
  const appearances = new Map<string, { record: string | null; ways: string[] }>();
  for (const s of seen) {
    const kind = s.connection.kind;
    if (s.other.type !== 'node') continue;
    if (kind !== 'mentioned' && kind !== 'present' && kind !== 'appearance') continue;
    let at = appearances.get(s.other.id) ?? { record: null, ways: [] };
    if (kind !== 'appearance') {
      at.ways.push(kind === 'mentioned' ? 'linked in the text' : 'in the chapter plan');
    } else if (s.connection.id.startsWith('pov:')) {
      at.ways.push('their point of view');
      at = { record: at.record ?? 'pov', ways: at.ways };
    } else if (s.connection.label.startsWith('Mentioned')) {
      at.ways.push('mentioned, not on the page (your appearance record)');
      at = { record: at.record !== 'appears' ? 'mentioned' : at.record, ways: at.ways };
    } else {
      at.ways.push('on the page (your appearance record)');
      at = { record: 'appears', ways: at.ways };
    }
    appearances.set(s.other.id, at);
  }
  const verb: Record<string, string> = { appears: 'Appears in', mentioned: 'Mentioned in', pov: 'Point of view in' };
  const andList = (list: readonly string[]) =>
    list.length > 2 ? `${list.slice(0, list.length - 1).join(', ')} and ${list[list.length - 1]}` : list.join(' and ');
  for (const [nodeId, { record, ways }] of appearances) {
    reading.push(
      new HistoryItem({
        key: `node:${nodeId}`,
        kind: 'appearance',
        ref: new EntityRef('node', nodeId),
        title: `${record !== null ? verb[record] : 'Appears in'} ${nodeLabel(model, nodeId)}`,
        detail: andList([...new Set(ways)]),
        when: chapter(nodeId),
        age: null,
        order: position(nodeId),
      }),
    );
  }

  // Relationship changes, each stage from where it begins.
  for (const relation of model.relations.values()) {
    if (relation.fromId !== characterId && relation.toId !== characterId) continue;
    const otherId = relation.fromId === characterId ? relation.toId : relation.fromId;
    const otherName = model.entries.get(otherId)?.name ?? 'someone deleted';
    sortedStages(relation, model.order).forEach((stage, i) => {
      const what = stage.title.length > 0 ? stage.title : stage.label.length > 0 ? stage.label : 'related';
      const affinity = affinityOf(stage.affinity);
      reading.push(
        new HistoryItem({
          key: `relation:${relation.id}:${stage.id}`,
          kind: 'relationship',
          ref: new EntityRef('relation', relation.id),
          title: `${i === 0 ? 'Relationship with' : 'Relationship changes with'} ${otherName}: ${what}`,
          detail: affinity === null ? '' : affinityLabels[affinity],
          when: chapter(stage.startNodeId),
          age: null,
          order: position(stage.startNodeId),
        }),
      );
    });
  }

  // Ability and state changes, as the progression tracker records them; and the author's milestones.
  for (const snap of snapshots.filter((s) => s['entryId'] === characterId)) {
    const label = dartTrim(str(snap['label']));
    const nodeId = idOrNull(snap['nodeId']);
    reading.push(
      new HistoryItem({
        key: `snap:${String(snap['id'] ?? null)}`,
        kind: 'ability',
        ref: null,
        to: { page: 'progression', id: str(snap['id']) },
        title: label.length > 0 ? label : 'State recorded',
        detail: 'progression snapshot',
        when: chapter(nodeId),
        age: null,
        order: position(nodeId),
      }),
    );
  }
  for (const line of milestones.filter((m) => m.entryId === characterId && m.isStory)) {
    reading.push(
      new HistoryItem({
        key: `milestone:${line.id}`,
        kind: 'milestone',
        ref: null,
        to: { page: 'history', id: line.id },
        title: line.text,
        detail: 'milestone',
        when: chapter(line.nodeId),
        age: null,
        order: position(line.nodeId),
      }),
    );
  }

  // Progression changes, placed by when they happen.
  for (const change of model.progress.filter((c) => c.entryId === characterId)) {
    const category = model.progressCategories.get(change.categoryId) ?? null;
    const at = change.at;
    const item = (order: number) =>
      new HistoryItem({
        key: `progress:${change.id}`,
        kind: 'progress',
        ref: null,
        to: { page: 'tracker', id: change.id },
        title: changeWords(change, category, model),
        detail: [
          ...(category !== null && category.name.length > 0 ? [category.name] : []),
          ...(str(change.raw['cost']).length > 0 ? [`cost: ${str(change.raw['cost'])}`] : []),
        ].join(' · '),
        when: whenWords(at, model),
        age: null,
        order,
      });
    if (at === null) {
      reading.push(item(position(null)));
    } else if (at instanceof NodeAnchor) {
      reading.push(item(position(at.nodeId)));
    } else if (isUnknownTime(at)) {
      throughout.push(item(2));
    } else if (at instanceof EventAnchor) {
      const span = spanOfEvent(at.eventId, context);
      const t = storyTime.get(at.eventId);
      story.push(item(t !== undefined ? t + 2e-7 : (span?.lo ?? Infinity)));
    } else {
      story.push(item(spanOfDate((at as DateAnchor).when, context)?.lo ?? Infinity));
    }
  }

  // Journeys, placed by when they set out (or arrive, when that is all that is known).
  for (const journey of model.journeys.filter((j) => j.travellerIds.includes(characterId))) {
    const place = (id: string | null) =>
      id === null ? 'somewhere not recorded' : (model.entries.get(id)?.name ?? 'a place that is gone');
    const at = journey.departure ?? journey.arrival;
    const item = (order: number) =>
      new HistoryItem({
        key: `journey:${journey.id}`,
        kind: 'journey',
        ref: null,
        to: { page: 'journeys', id: journey.id },
        title: `Travels from ${place(journey.fromId)} to ${place(journey.toId)}`,
        detail: str(journey.raw['method']),
        when: at === null ? 'When is not known' : whenWords(at, model),
        age: null,
        order,
      });
    if (at === null) {
      throughout.push(item(3));
    } else if (at instanceof NodeAnchor) {
      reading.push(item(position(at.nodeId)));
    } else if (at instanceof EventAnchor) {
      const span = spanOfEvent(at.eventId, context);
      const t = storyTime.get(at.eventId);
      story.push(item(t !== undefined ? t + 3e-7 : (span?.lo ?? Infinity)));
    } else {
      story.push(item(spanOfDate((at as DateAnchor).when, context)?.lo ?? Infinity));
    }
  }

  // The abilities on their system sheets: held, with no time given.
  for (const sheet of model.sheets.filter((s) => s.entryId === characterId)) {
    for (const itemId of sheet.itemIds) {
      const id = `${sheet.systemId}/${itemId}`;
      const ability = model.abilities.get(id);
      if (ability === undefined) continue;
      throughout.push(
        new HistoryItem({
          key: `holds:${id}`,
          kind: 'ability',
          ref: new EntityRef('ability', id),
          title: `Holds ${ability.item.name}`,
          detail: ability.system.name,
          when: 'On their sheet',
          age: null,
          order: 1,
        }),
      );
    }
  }

  const sort = (list: readonly HistoryItem[]) =>
    stableSorted(list, (a, b) => (a.order !== b.order ? compareNum(a.order, b.order) : localeCompare(a.title, b.title)));
  const issues = [
    ...(ages.birth.unread !== null
      ? [
          `The date of birth on ${me.name}’s profile, “${ages.birth.unread}”, could not be read as a date${calendar.standard ? '' : ` in ${calendar.name}`}, so ages are not counted from it. Write it as a year (1000), a year and month (1000-3), or a full date (1000-3-1).`,
        ]
      : []),
    ...(ages.birth.conflict
      ? [
          `What is recorded about ${me.name}’s age does not agree (${ages.birth.basis.join('; ')}), so no age is worked out from it together. Each age given at an event still shows.`,
        ]
      : []),
    ...[...ages.issues].map(
      ([eventId, issue]) =>
        `“${model.events.get(eventId)?.name ?? 'null'}”: ${issue.replace(/^Stated/, `${me.name} is stated`).replace(/^Takes part/, `${me.name} takes part`)}`,
    ),
  ];
  return new LifeHistory(me.name, ages.birth, bornWords(ages.birth, model), sort(story), sort(reading), sort(throughout), issues);
}

/** When they were born, in a sentence, and what that is worked out from. */
function bornWords(birth: Birth, model: StoryModel): string {
  const span = birth.span;
  if (span === null) {
    if (birth.conflict) return 'When they were born cannot be worked out: what is recorded does not agree.';
    return 'When they were born is not recorded. Give a date of birth on their profile, or their age at any dated event (0 at their birth), and their ages are worked out from it.';
  }
  const c = model.calendar;
  const day = (t: number) => {
    const p = partsOf(t, c);
    return formatDate(new ExactDate(p.year, { month: p.month + 1, day: p.day + 1 }), null, c);
  };
  const lo = day(span.lo);
  const hi = day(span.hi);
  return `Born ${lo === hi ? `on ${lo}` : `between ${lo} and ${hi}`}, worked out from ${birth.basis.join(' and ')}.`;
}
