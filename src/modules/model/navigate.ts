import { STATUS_LABELS as CANON_STATUS_LABELS } from '@/modules/canon/types';
import { isDocument } from '@/modules/manuscript/tree';
import { KIND_LABELS, STATUS_LABELS as NODE_STATUS } from '@/modules/manuscript/types';
import { statusName } from '@/modules/plot/types';
import { stageAt } from '@/modules/relationships/timeline';
import { AFFINITY_LABELS } from '@/modules/relationships/types';
import { atTheSameTime, TOGETHER_WORDS } from '@/modules/timeline/overlap';
import { EVENT_STATUS_LABELS, IMPORTANCE_LABELS } from '@/modules/timeline/types';
import { connectionsOf, deriveConnections } from './connections';
import { eventRecord, eventRecords } from './events';
import { resolveRef } from './model';
import type { ConnectionKind, EntityRef, EntityView, StoryModel } from './types';

/**
 * SELECTION AND NAVIGATION
 * Whatever a view shows, selecting it means the same thing everywhere: its
 * details can be shown in a shared panel (`detailsOf`), the record opens on
 * the page where it is kept (`routeFor`), and other views can mark it and
 * what it is connected to (`relatedIds`). All by stable id, within one
 * novel; a record deleted since is reported as gone, never guessed at.
 */

/** Where a record is kept: its own page, in the same form the rest of the app links to it. */
export interface Destination {
  to: string;
  /** Router state some pages read to open a record (the Organizer). */
  state?: unknown;
  label: string;
}

export function routeFor(projectId: string, model: StoryModel, ref: EntityRef): Destination | null {
  const base = `/project/${projectId}`;
  switch (ref.type) {
    case 'node': {
      const node = model.nodes.get(ref.id);
      if (!node) return null;
      return isDocument(node.kind) ? { to: `${base}/manuscript/${node.id}`, label: 'Open in the editor' } : { to: `${base}/organizer`, state: { select: node.id }, label: 'Open in the Organizer' };
    }
    case 'entry': {
      const entry = model.entries.get(ref.id);
      if (!entry) return null;
      return entry.category === 'character' ? { to: `${base}/characters/${entry.id}`, label: 'Open character profile' } : { to: `${base}/codex/${entry.id}`, label: 'Open in the Codex' };
    }
    case 'event':
      return model.events.has(ref.id) ? { to: `${base}/timeline?event=${encodeURIComponent(ref.id)}`, label: 'Open on the Timeline' } : null;
    case 'thread':
      return model.threads.has(ref.id) ? { to: `${base}/plot?thread=${encodeURIComponent(ref.id)}`, label: 'Open in Plot threads' } : null;
    case 'relation':
      return model.relations.has(ref.id) ? { to: `${base}/relationships?rel=${encodeURIComponent(ref.id)}`, label: 'Open the relationship' } : null;
    case 'ability': {
      const ability = model.abilities.get(ref.id);
      return ability ? { to: `${base}/characters/systems?system=${encodeURIComponent(ability.system.id)}`, label: `Open ${ability.system.name}` } : null;
    }
  }
}

export interface DetailItem {
  ref: EntityRef;
  label: string;
  /** How it is tied to the selected record, in its words: "Flashback in", "Sister", "Age 19". */
  note: string;
}

export interface Details {
  view: EntityView;
  /** Plain facts about the record itself: its date, status, category. */
  facts: { label: string; value: string }[];
  /** What it is connected to, grouped by how. */
  groups: { title: string; items: DetailItem[] }[];
}

/** How a group of connections reads from the selected record's side: [what it reaches, what reaches it]. */
const GROUPS: Partial<Record<ConnectionKind, [string, string]>> = {
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

/** The wordings `deriveConnections` gives connections when the author gave none: already said by the group's title. */
const PLAIN = new Set(['Part of', 'Mentioned in', 'Present in', 'Takes part in', 'Involved in', 'Takes place at', 'Told in', 'Comes after', 'Dated from', 'Involves', 'Develops in', 'Meant to resolve in', 'Has', 'Branches from', 'Related']);

function factsOf(model: StoryModel, ref: EntityRef): { label: string; value: string }[] {
  const facts: { label: string; value: string }[] = [];
  const add = (label: string, value: string | null | undefined) => value && facts.push({ label, value });
  if (ref.type === 'event') {
    const e = eventRecord(model, ref.id)!;
    add('When', e.label);
    add('Significance', IMPORTANCE_LABELS[e.significance]);
    add('Status', EVENT_STATUS_LABELS[e.status]);
    add('Canon', CANON_STATUS_LABELS[e.canon]);
    add('Description', e.description.trim());
  } else if (ref.type === 'entry') {
    const entry = model.entries.get(ref.id)!;
    add('Kind', model.categories.get(entry.category)?.singular ?? entry.category);
    add('Summary', entry.summary.trim());
  } else if (ref.type === 'node') {
    const node = model.nodes.get(ref.id)!;
    add('Kind', KIND_LABELS[node.kind]);
    add('Status', NODE_STATUS[node.status]);
    add('Words', node.wordCount ? node.wordCount.toLocaleString() : null);
    add('Summary', node.summary.trim());
  } else if (ref.type === 'thread') {
    const thread = model.threads.get(ref.id)!;
    add('Status', statusName(thread));
    add('Developments', String(thread.beats.length));
  } else if (ref.type === 'relation') {
    const relation = model.relations.get(ref.id)!;
    const now = stageAt(relation, null, model.order);
    add('Now', now ? now.title || now.label || 'Related' : 'Not yet begun');
    if (now) {
      const [a, b] = [model.entries.get(relation.fromId)?.name ?? 'Someone', model.entries.get(relation.toId)?.name ?? 'Someone'];
      // Which way it reads: one-way with a role each side, or the same both ways.
      add('Direction', now.directional ? `${a} (${now.fromRole || 'first'}) → ${b} (${now.toRole || 'second'})` : `Both ways: ${a} and ${b}`);
      add('Feeling', AFFINITY_LABELS[now.affinity]);
    }
    add('Stages', String(relation.stages.length));
    return facts;
  } else if (ref.type === 'ability') {
    const ability = model.abilities.get(ref.id)!;
    add('System', ability.system.name);
    add('Group', ability.group);
    add('Description', ability.item.description.trim());
  }
  return facts;
}

/**
 * The details of a selected record: its facts, and everything it is
 * connected to, grouped by how and worded from its side. Null when the
 * record does not exist (deleted since, or from another novel).
 */
export function detailsOf(model: StoryModel, ref: EntityRef): Details | null {
  const found = resolveRef(model, ref);
  if (!found.found) return null;
  const groups = new Map<string, DetailItem[]>();
  const add = (title: string, item: DetailItem) => {
    const list = groups.get(title) ?? groups.set(title, []).get(title)!;
    if (!list.some((i) => i.ref.type === item.ref.type && i.ref.id === item.ref.id && i.note === item.note)) list.push(item);
  };
  const label = (r: EntityRef) => {
    const other = resolveRef(model, r);
    return other.found ? other.view.label : r.id;
  };
  for (const seen of connectionsOf(deriveConnections(model).connections, ref)) {
    const titles = GROUPS[seen.connection.kind] ?? [seen.connection.label, seen.connection.label];
    const words = seen.connection.kind === 'participant' ? ageNote(model, seen.connection.to.id, seen.connection.from.id) : seen.label || seen.theirLabel;
    // A note says something the group title does not: the author's wording, an age, a flashback. The app's own default wordings are left out.
    const note = PLAIN.has(words) || words === titles[seen.outgoing ? 0 : 1] ? '' : words;
    add(titles[seen.outgoing ? 0 : 1], { ref: seen.other, label: label(seen.other), note });
  }
  // A relationship is a record in its own right: its two characters belong in its details.
  if (ref.type === 'relation') {
    const relation = model.relations.get(ref.id)!;
    for (const id of [relation.fromId, relation.toId]) add('Between', { ref: { type: 'entry', id }, label: label({ type: 'entry', id }), note: '' });
  }
  // Events sharing time with this one, whatever links them or not: what else is happening, and where. Never a warning.
  if (ref.type === 'event') {
    for (const { record, how } of atTheSameTime(eventRecords(model), ref.id, model.calendar.minutesPerDay)) {
      const place = record.location ? model.entries.get(record.location.id)?.name : undefined;
      add('At the same time', { ref: { type: 'event', id: record.id }, label: record.title, note: place ? `${TOGETHER_WORDS[how]} · at ${place}` : TOGETHER_WORDS[how] });
    }
  }
  if (ref.type === 'entry') {
    for (const relation of model.relations.values()) {
      if (relation.fromId === ref.id || relation.toId === ref.id) add('Relationship records', { ref: { type: 'relation', id: relation.id }, label: label({ type: 'relation', id: relation.id }), note: '' });
    }
  }
  return {
    view: found.view,
    facts: factsOf(model, ref),
    groups: [...groups].map(([title, items]) => ({ title, items: items.sort((a, b) => a.label.localeCompare(b.label)) })),
  };
}

const ageNote = (model: StoryModel, eventId: string, characterId: string): string => {
  const age = model.events.get(eventId)?.characters.find((c) => c.id === characterId)?.age;
  return age === null || age === undefined ? '' : `Age ${age}`;
};

/** The ids of what a record is directly connected to (and the record's own), for marking it in other views. */
export function relatedIds(model: StoryModel, ref: EntityRef): Set<string> {
  const ids = new Set<string>([ref.id]);
  for (const seen of connectionsOf(deriveConnections(model).connections, ref)) ids.add(seen.other.id);
  for (const relation of model.relations.values()) {
    if (relation.id === ref.id) [relation.fromId, relation.toId].forEach((id) => ids.add(id));
    if (relation.fromId === ref.id || relation.toId === ref.id) ids.add(relation.id);
  }
  return ids;
}
