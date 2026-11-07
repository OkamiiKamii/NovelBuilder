import { unknownCategory } from '@/modules/codex/schema';
import { wordingOf } from '@/modules/connections/types';
import { REVEAL_LABELS } from '@/modules/timeline/types';
import { changeWords } from '@/modules/progression/track';
import { stageAt } from '@/modules/relationships/timeline';
import { abilityId, resolveRef } from './model';
import type { Connection, ConnectionKind, ConnectionSource, DanglingConnection, EntityRef, EntityType, StoryModel } from './types';

const ref = (type: EntityType, id: string): EntityRef => ({ type, id });

/**
 * Every connection in the project, read from where each one was made, at
 * full detail (scenes are not folded into chapters). Connections whose end
 * no longer exists come back in `dangling` with what is missing, so a view
 * can say so instead of quietly showing less.
 */
export function deriveConnections(model: StoryModel): { connections: Connection[]; dangling: DanglingConnection[] } {
  const all = new Map<string, Connection>();
  const add = (id: string, kind: ConnectionKind, from: EntityRef, to: EntityRef, label: string, source: ConnectionSource, extra: Pick<Connection, 'directed'> & Partial<Pick<Connection, 'reverseLabel'>>) => {
    if (!from.id || !to.id || all.has(id)) return;
    all.set(id, { id, kind, from, to, label, ...(extra.reverseLabel ? { reverseLabel: extra.reverseLabel } : {}), directed: extra.directed, source });
  };

  for (const node of model.nodes.values()) {
    if (node.parentId) add(`part-of:${node.id}`, 'part-of', ref('node', node.id), ref('node', node.parentId), 'Part of', { table: 'chapters', id: node.id }, { directed: true });
    for (const entryId of node.mentions ?? []) add(`mentioned:${node.id}:${entryId}`, 'mentioned', ref('entry', entryId), ref('node', node.id), 'Mentioned in', { table: 'chapters', id: node.id }, { directed: true });
  }
  for (const plan of model.plans.values()) {
    for (const entryId of plan.entityIds) add(`present:${plan.id}:${entryId}`, 'present', ref('entry', entryId), ref('node', plan.id), 'Present in', { table: 'chapterPlans', id: plan.id }, { directed: true });
    for (const entryId of plan.appearIds ?? []) add(`appearance:${plan.id}:${entryId}`, 'appearance', ref('entry', entryId), ref('node', plan.id), 'Appears in', { table: 'chapterPlans', id: plan.id }, { directed: true });
    for (const entryId of plan.povIds ?? []) add(`pov:${plan.id}:${entryId}`, 'appearance', ref('entry', entryId), ref('node', plan.id), 'Point of view in', { table: 'chapterPlans', id: plan.id }, { directed: true });
    for (const entryId of plan.mentionIds ?? []) add(`appearance:${plan.id}:${entryId}`, 'appearance', ref('entry', entryId), ref('node', plan.id), 'Mentioned in, not on the page', { table: 'chapterPlans', id: plan.id }, { directed: true });
  }

  // One row serves both directions, each side with its own wording: the author's, or the kind's where it has a converse.
  for (const link of model.links) {
    const { forward, backward, reciprocal } = wordingOf(link);
    all.set(`link:${link.id}`, {
      id: `link:${link.id}`, kind: 'link', from: ref(link.fromType ?? 'entry', link.fromId), to: ref(link.toType ?? 'entry', link.toId), label: forward || (link.type ? '' : 'Related'),
      ...(backward ? { reverseLabel: backward } : {}), directed: !reciprocal, source: { table: 'loreLinks', id: link.id },
      ...(link.type ? { type: link.type } : {}), ...(link.notes ? { notes: link.notes } : {}), ...(link.canon ? { canon: link.canon } : {}), ...(link.validity ? { validity: link.validity } : {}),
    });
  }
  // Progression changes: at the chapter, scene or event they happen at, and with the codex entry they name.
  for (const change of model.progress ?? []) {
    const words = changeWords(change, model.progressCategories?.get(change.categoryId), model);
    const source = { table: 'progressChanges', id: change.id };
    const at = change.at;
    // Worded to read from either end: "Changes (Level set to 3) in Ch 2", "Mira changes (Level set to 3) in this"; "Gained the Ember Crown", "Mira gained this".
    if (at?.kind === 'node') add(`progress:${change.id}`, 'progress', ref('entry', change.entryId), ref('node', at.nodeId), `Changes (${words}) in`, source, { directed: true });
    if (at?.kind === 'event') add(`progress:${change.id}`, 'progress', ref('entry', change.entryId), ref('event', at.eventId), `Changes (${words}) at`, source, { directed: true });
    const verb = change.action === 'gain' ? 'Gained' : change.action === 'lose' ? 'Lost' : `Changes (${words}) with`;
    if (change.refId) add(`progress-ref:${change.id}`, 'progress', ref('entry', change.entryId), ref('entry', change.refId), verb, source, { directed: true });
    if (change.abilityId) add(`progress-ability:${change.id}`, 'progress', ref('entry', change.entryId), ref('ability', change.abilityId), verb, source, { directed: true });
  }
  // Journeys: where each traveller leaves from, goes to and by way of; when they set out and arrive; the events it is part of.
  for (const journey of model.journeys ?? []) {
    const source = { table: 'journeys', id: journey.id };
    for (const t of journey.travellerIds) {
      const from = ref('entry', t);
      if (journey.fromId) add(`travel-from:${journey.id}:${t}`, 'travel', from, ref('entry', journey.fromId), 'Leaves from', source, { directed: true });
      if (journey.toId) add(`travel-to:${journey.id}:${t}`, 'travel', from, ref('entry', journey.toId), 'Travels to', source, { directed: true });
      journey.via.forEach((v, i) => add(`travel-via:${journey.id}:${t}:${i}`, 'travel', from, ref('entry', v), 'Travels by way of', source, { directed: true }));
      for (const e of journey.eventIds) add(`travel-event:${journey.id}:${t}:${e}`, 'travel', from, ref('event', e), 'Travels as part of', source, { directed: true });
      for (const [which, at] of [['leaves', journey.departure], ['arrives', journey.arrival]] as const) {
        if (at?.kind === 'node') add(`travel-${which}:${journey.id}:${t}`, 'travel', from, ref('node', at.nodeId), which === 'leaves' ? 'Sets out in' : 'Arrives in', source, { directed: true });
        if (at?.kind === 'event') add(`travel-${which}:${journey.id}:${t}`, 'travel', from, ref('event', at.eventId), which === 'leaves' ? 'Sets out at' : 'Arrives at', source, { directed: true });
      }
    }
  }
  for (const relation of model.relations.values()) {
    const stage = stageAt(relation, null, model.order);
    const directed = Boolean(stage?.directional);
    const label = (directed && stage?.fromRole) || stage?.title || stage?.label || 'Related';
    add(`relationship:${relation.id}`, 'relationship', ref('entry', relation.fromId), ref('entry', relation.toId), label, { table: 'characterRelations', id: relation.id }, { directed, reverseLabel: (directed && stage?.toRole) || undefined });
  }
  for (const entry of model.entries.values()) {
    const category = model.categories.get(entry.category) ?? unknownCategory(entry.category);
    const defs = new Map(category.fields.map((def) => [def.id, def]));
    for (const field of entry.fields) {
      const def = field.defId ? defs.get(field.defId) : undefined;
      const type = def ? def.type : field.type;
      if (type !== 'reference' && type !== 'references') continue;
      const name = def?.name || field.key || 'Linked';
      const targets = type === 'reference' ? [field.value] : field.value.split('\n');
      for (const target of targets.map((t) => t.trim()).filter(Boolean)) add(`field:${entry.id}:${field.id}:${target}`, 'field', ref('entry', entry.id), ref('entry', target), name, { table: 'loreEntries', id: entry.id, field: field.id }, { directed: true });
    }
  }

  for (const event of model.events.values()) {
    const source = { table: 'timelineEvents', id: event.id };
    const here = ref('event', event.id);
    for (const character of event.characters) add(`participant:${event.id}:${character.id}`, 'participant', ref('entry', character.id), here, 'Takes part in', source, { directed: true });
    for (const entryId of event.entryIds) add(`involved:${event.id}:${entryId}`, 'involved', ref('entry', entryId), here, 'Involved in', source, { directed: true });
    if (event.locationId) add(`occurs-at:${event.id}`, 'occurs-at', here, ref('entry', event.locationId), 'Takes place at', source, { directed: true });
    const roles = new Map((event.reveals ?? []).map((r) => [r.nodeId, r.role]));
    for (const nodeId of event.nodeIds) add(`told-in:${event.id}:${nodeId}`, 'told-in', here, ref('node', nodeId), REVEAL_LABELS[roles.get(nodeId) ?? 'told'], source, { directed: true });
    for (const threadId of event.threadIds ?? []) add(`in-thread:${event.id}:${threadId}`, 'in-thread', here, ref('thread', threadId), 'Part of', source, { directed: true });
    if (event.afterId) add(`follows:${event.id}`, 'follows', here, ref('event', event.afterId), 'Comes after', source, { directed: true });
    if (event.when.precision === 'relative' && event.when.anchorId) add(`dated-from:${event.id}`, 'dated-from', here, ref('event', event.when.anchorId), 'Dated from', source, { directed: true });
  }

  for (const thread of model.threads.values()) {
    const source = { table: 'plotThreads', id: thread.id };
    const here = ref('thread', thread.id);
    for (const entryId of [...thread.characterIds, ...thread.locationIds]) add(`thread-entry:${thread.id}:${entryId}`, 'thread-entry', here, ref('entry', entryId), 'Involves', source, { directed: true });
    for (const beat of thread.beats) if (beat.nodeId) add(`beat:${thread.id}:${beat.id}`, 'beat', here, ref('node', beat.nodeId), beat.title || 'Develops in', source, { directed: true });
    if (thread.targetNodeId) add(`resolves-in:${thread.id}`, 'resolves-in', here, ref('node', thread.targetNodeId), 'Meant to resolve in', source, { directed: true });
  }

  for (const sheet of model.sheets) {
    for (const itemId of sheet.itemIds) add(`holds:${sheet.id}:${itemId}`, 'holds', ref('entry', sheet.entryId), ref('ability', abilityId(sheet.systemId, itemId)), 'Has', { table: 'systemSheets', id: sheet.id }, { directed: true });
  }
  for (const { system, item } of model.abilities.values()) {
    if (item.parentId) add(`branches-from:${system.id}/${item.id}`, 'branches-from', ref('ability', abilityId(system.id, item.id)), ref('ability', abilityId(system.id, item.parentId)), 'Branches from', { table: 'systems', id: system.id }, { directed: true });
  }

  const connections: Connection[] = [];
  const dangling: DanglingConnection[] = [];
  for (const connection of all.values()) {
    const missing = [connection.from, connection.to].filter((end) => !resolveRef(model, end).found);
    if (missing.length) dangling.push({ connection, missing });
    else connections.push(connection);
  }
  return { connections, dangling };
}

/** A connection as one of its ends sees it, in the same terms as the codex's related entries. */
export interface SeenConnection {
  connection: Connection;
  other: EntityRef;
  /** This side's own wording; empty when this side has none. */
  label: string;
  /** The other side's wording; empty when it has none. */
  theirLabel: string;
  /** Whether the meaning reads from this record to the other (for a directed connection). */
  outgoing: boolean;
}

/**
 * A record's connections as seen from that record. Each side keeps its own
 * wording: one side's label is never shown as the other's, so "Orrin
 * considers Mira a rival" does not read as Mira thinking the same.
 */
export function connectionsOf(connections: Connection[], self: EntityRef): SeenConnection[] {
  const out: SeenConnection[] = [];
  for (const connection of connections) {
    const isFrom = connection.from.type === self.type && connection.from.id === self.id;
    const isTo = connection.to.type === self.type && connection.to.id === self.id;
    if (isFrom) out.push({ connection, other: connection.to, label: connection.label, theirLabel: connection.reverseLabel ?? '', outgoing: true });
    if (isTo) out.push({ connection, other: connection.from, label: connection.reverseLabel ?? '', theirLabel: connection.label, outgoing: false });
  }
  return out;
}
