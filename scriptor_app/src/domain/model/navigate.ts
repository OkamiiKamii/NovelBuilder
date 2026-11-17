// SELECTION AND NAVIGATION. Whatever a view shows, selecting it means the same thing everywhere: its details show in
// a shared panel (detailsOf), it opens on the page where it is kept, and other views mark it and what it is connected
// to (relatedIds). All by stable id, within one novel; a record deleted since is reported as gone. A port of
// flutter_app/lib/shared/domain/model/navigate.dart (its threadStatusName is in plot/screens/threads.ts).

import { localeCompare } from '../exchange/collation';
import { kindLabel } from '../outline';
import { threadStatusName } from '../plot/screens/threads';
import { stableSorted } from '../reader/stableSort';
import { canonStatusLabel, canonStatusOf } from '../records/canon';
import { nodeStatuses } from '../records/nodeStatus';
import { affinityLabels, affinityOf } from '../relationships/relationTypes';
import { localeNumber } from '../timeline/dates';
import { eventRecord, eventRecords } from '../timeline/eventRecord';
import { atTheSameTime, togetherWords } from '../timeline/overlap';
import { type ConnectionKind, connectionsOf, deriveConnections } from './connections';
import { EntityRef, type EntityView } from './entityRef';
import { type StoryModel } from './storyModel';
import { stageAt } from './storyOrder';

export type DetailItem = { ref: EntityRef; label: string; note: string };

export class Details {
  constructor(
    readonly view: EntityView,
    /** Plain facts about the record itself: its date, status, category. */
    readonly facts: { label: string; value: string }[],
    /** What it is connected to, grouped by how. */
    readonly groups: { title: string; items: DetailItem[] }[],
  ) {}
}

/** How a group of connections reads from the selected record's side: [what it reaches, what reaches it]. */
const groupTitles: Partial<Record<ConnectionKind, readonly [string, string]>> = {
  'part-of': ['Part of', 'Contains'],
  link: ['Connections', 'Connections'],
  relationship: ['Relationships', 'Relationships'],
  field: ['Linked by its fields', 'Linked from fields'],
  mentioned: ['Linked in the text of', 'Linked in its text'],
  present: ['In the plan of', 'In its plan'],
  appearance: ['Your appearance record: in', 'Your appearance records: who appears'],
  participant: ['Events they take part in', 'Who takes part'],
  involved: ['Events involved in', 'Also involved'],
  'occurs-at': ['Takes place at', 'Events here'],
  'told-in': ['Told in', 'Events told here'],
  follows: ['Comes after', 'Followed by'],
  'dated-from': ['Dated from', 'Dates others'],
  'in-thread': ['Plot threads', 'Events'],
  'thread-entry': ['Involves', 'Plot threads'],
  beat: ['Develops in', 'Plot developments here'],
  'resolves-in': ['Meant to resolve in', 'Threads meant to resolve here'],
  holds: ['Abilities', 'Held by'],
  'branches-from': ['Grows out of', 'Grows into'],
};

/** The wordings connections get when the author gave none: already said by the group's title. */
const plain = new Set([
  'Part of',
  'Mentioned in',
  'Present in',
  'Takes part in',
  'Involved in',
  'Takes place at',
  'Told in',
  'Comes after',
  'Dated from',
  'Involves',
  'Develops in',
  'Meant to resolve in',
  'Has',
  'Branches from',
  'Related',
]);

const importance: Record<string, string> = { minor: 'Minor', major: 'Major', climax: 'Climax' };
const eventStatus: Record<string, string> = { idea: 'Idea', planned: 'Planned', confirmed: 'Confirmed' };

/** A number as Dart's `'$n'` writes an int, or a double's shortest form (ages are whole or simple decimals). */
const ageText = (n: number): string => (Number.isInteger(n) ? String(n) : String(n));

function factsOf(model: StoryModel, ref: EntityRef): { label: string; value: string }[] {
  const facts: { label: string; value: string }[] = [];
  const add = (label: string, value: string | null | undefined) => {
    if (value !== null && value !== undefined && value.length > 0) facts.push({ label, value });
  };
  switch (ref.type) {
    case 'event': {
      const e = eventRecord(model, ref.id)!;
      add('When', e.label);
      add('Significance', importance[e.event.importanceKey]);
      add('Status', eventStatus[e.event.statusKey] ?? 'Confirmed');
      add('Canon', canonStatusLabel[canonStatusOf(e.event.canonKey) ?? 'canon']);
      add('Description', e.event.description.trim());
      break;
    }
    case 'entry': {
      const entry = model.entries.get(ref.id)!;
      add('Kind', model.categories.get(entry.category)?.singular ?? entry.category);
      add('Summary', entry.summary.trim());
      break;
    }
    case 'node': {
      const node = model.nodes.get(ref.id)!;
      add('Kind', node.kind === null ? null : kindLabel[node.kind]);
      add('Status', nodeStatuses.find((s) => s.key === node.status)?.label ?? null);
      add('Words', node.wordCount !== 0 ? localeNumber(node.wordCount) : null);
      add('Summary', node.summary.trim());
      break;
    }
    case 'thread': {
      const thread = model.threads.get(ref.id)!;
      add('Status', threadStatusName(thread));
      add('Developments', `${thread.beats.length}`);
      break;
    }
    case 'relation': {
      const relation = model.relations.get(ref.id)!;
      const now = stageAt(relation, null, model.order);
      add('Now', now === null ? 'Not yet begun' : now.title.length > 0 ? now.title : now.label.length > 0 ? now.label : 'Related');
      if (now !== null) {
        const a = model.entries.get(relation.fromId)?.name ?? 'Someone';
        const b = model.entries.get(relation.toId)?.name ?? 'Someone';
        add(
          'Direction',
          now.directional
            ? `${a} (${now.fromRole.length === 0 ? 'first' : now.fromRole}) → ${b} (${now.toRole.length === 0 ? 'second' : now.toRole})`
            : `Both ways: ${a} and ${b}`,
        );
        const feeling = affinityOf(now.affinity);
        add('Feeling', feeling === null ? null : affinityLabels[feeling]);
      }
      add('Stages', `${relation.stages.length}`);
      break;
    }
    case 'ability': {
      const ability = model.abilities.get(ref.id)!;
      add('System', ability.system.name);
      add('Group', ability.group);
      const d = ability.item.raw['description'];
      add('Description', (d === null || d === undefined ? '' : String(d)).trim());
      break;
    }
  }
  return facts;
}

function ageNote(model: StoryModel, eventId: string, characterId: string): string {
  const age = model.events.get(eventId)?.characters.find((c) => c.id === characterId)?.age ?? null;
  return age === null ? '' : `Age ${ageText(age)}`;
}

/** The details of a selected record: its facts, and everything it is connected to, grouped by how and worded from its
 * side. Null when the record does not exist (deleted since, or another novel's). */
export function detailsOf(model: StoryModel, ref: EntityRef): Details | null {
  const found = model.resolve(ref);
  if (found === null) return null;
  const groups = new Map<string, DetailItem[]>();
  const add = (title: string, item: DetailItem) => {
    let list = groups.get(title);
    if (list === undefined) groups.set(title, (list = []));
    if (!list.some((i) => i.ref.equals(item.ref) && i.note === item.note)) list.push(item);
  };
  const label = (r: EntityRef) => model.resolve(r)?.label ?? r.id;
  for (const seen of connectionsOf(deriveConnections(model).connections, ref)) {
    const c = seen.connection;
    const titles = groupTitles[c.kind] ?? ([c.label, c.label] as const);
    const words =
      c.kind === 'participant' ? ageNote(model, c.to.id, c.from.id) : seen.label.length > 0 ? seen.label : seen.theirLabel;
    const title = seen.outgoing ? titles[0] : titles[1];
    // A note says something the group title does not: the author's wording, an age, a flashback.
    const note = plain.has(words) || words === title ? '' : words;
    add(title, { ref: seen.other, label: label(seen.other), note });
  }
  // A relationship is a record in its own right: its two characters belong in its details.
  if (ref.type === 'relation') {
    const relation = model.relations.get(ref.id)!;
    for (const id of [relation.fromId, relation.toId]) {
      const r = new EntityRef('entry', id);
      add('Between', { ref: r, label: label(r), note: '' });
    }
  }
  // Events sharing time with this one, whatever links them: what else is happening, and where. Never a warning.
  if (ref.type === 'event') {
    for (const { record, how } of atTheSameTime(eventRecords(model), ref.id, model.calendar.minutesPerDay)) {
      const locationId = record.event.locationId;
      const place = locationId === null ? undefined : model.entries.get(locationId)?.name;
      add('At the same time', {
        ref: new EntityRef('event', record.id),
        label: record.title,
        note: place !== undefined ? `${togetherWords[how]} · at ${place}` : togetherWords[how],
      });
    }
  }
  if (ref.type === 'entry') {
    for (const relation of model.relations.values()) {
      if (relation.fromId === ref.id || relation.toId === ref.id) {
        const r = new EntityRef('relation', relation.id);
        add('Relationship records', { ref: r, label: label(r), note: '' });
      }
    }
  }
  return new Details(
    found,
    factsOf(model, ref),
    [...groups].map(([title, items]) => ({ title, items: stableSorted(items, (a, b) => localeCompare(a.label, b.label)) })),
  );
}

/** The ids of what a record is directly connected to (and its own), for marking it in other views. */
export function relatedIds(model: StoryModel, ref: EntityRef): Set<string> {
  const ids = new Set([ref.id]);
  for (const seen of connectionsOf(deriveConnections(model).connections, ref)) ids.add(seen.other.id);
  for (const relation of model.relations.values()) {
    if (relation.id === ref.id) {
      ids.add(relation.fromId);
      ids.add(relation.toId);
    }
    if (relation.fromId === ref.id || relation.toId === ref.id) ids.add(relation.id);
  }
  return ids;
}
