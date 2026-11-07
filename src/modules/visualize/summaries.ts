import { statusName } from '@/modules/plot/types';
import { progressAt, progressSummary } from '@/modules/progression/track';
import { stageAt } from '@/modules/relationships/timeline';
import { deriveConnections } from '@/modules/model/connections';
import { eventRecords } from '@/modules/model/events';
import { resolveRef } from '@/modules/model/model';
import type { EntityRef, StoryModel } from '@/modules/model/types';

/**
 * What each view lists, read from the shared model. These lists are the
 * views' written form: everything a drawing will show, in words, in an order
 * that makes sense without the drawing.
 */

const chapterLabel = (model: StoryModel, nodeId: string): string => {
  const node = model.nodes.get(nodeId);
  if (!node) return 'a deleted chapter';
  const n = model.order.chapterNumber.get(nodeId);
  // A scene says which chapter it is in, as every other view names it (`narrative.ts`, the structure chart, the dashboard).
  if (node.kind === 'scene' && n) return `Ch ${n}, scene: ${node.title || 'Untitled'}`;
  return node.kind === 'chapter' && n ? `Ch ${n}: ${node.title || 'Untitled'}` : node.title || 'Untitled';
};

/** Events in story order: dated ones by date, then the ones with no date yet, each with where the reader meets it. */
export function timelineRows(model: StoryModel) {
  return eventRecords(model)
    .map((e) => ({ id: e.id, title: e.title, when: e.label, dated: e.span !== null, start: e.span?.lo ?? Infinity, told: e.told.map((t) => (t.role === 'told' ? chapterLabel(model, t.ref.id) : `${chapterLabel(model, t.ref.id)} (${t.role})`)) }))
    .sort((a, b) => a.start - b.start || a.title.localeCompare(b.title));
}

/** Relationships as they stand at the end of the story so far, and how many stages each has been through. */
export function relationshipRows(model: StoryModel) {
  const name = (id: string) => model.entries.get(id)?.name ?? 'Someone deleted';
  return [...model.relations.values()]
    .map((r) => {
      const now = stageAt(r, null, model.order);
      return { id: r.id, between: `${name(r.fromId)} ${now?.directional ? '→' : '&'} ${name(r.toId)}`, now: now ? now.title || now.label || 'Related' : 'Not yet begun', stages: r.stages.length };
    })
    .sort((a, b) => a.between.localeCompare(b.between));
}

/** Plot threads with where their developments are placed. */
export function plotRows(model: StoryModel) {
  return [...model.threads.values()]
    .map((t) => {
      const placed = t.beats.filter((b) => b.nodeId && model.nodes.has(b.nodeId)).sort((a, b) => (model.order.position.get(a.nodeId!) ?? 0) - (model.order.position.get(b.nodeId!) ?? 0));
      return { id: t.id, title: t.title, status: statusName(t), developments: t.beats.length, unplaced: t.beats.length - placed.length, chapters: [...new Set(placed.map((b) => chapterLabel(model, b.nodeId!)))] };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

/** How connected the project is: the counts, the most connected records, and any connection whose end is gone. */
export function graphSummary(model: StoryModel, top = 5) {
  const { connections, dangling } = deriveConnections(model);
  const degree = new Map<string, { ref: EntityRef; label: string; count: number }>();
  for (const c of connections) {
    for (const end of [c.from, c.to]) {
      const key = `${end.type}:${end.id}`;
      const found = resolveRef(model, end);
      const entry = degree.get(key) ?? { ref: end, label: found.found ? found.view.label : end.id, count: 0 };
      entry.count++;
      degree.set(key, entry);
    }
  }
  const records = model.nodes.size + model.entries.size + model.events.size + model.threads.size + model.abilities.size;
  return { records, connections: connections.length, dangling: dangling.length, mostConnected: [...degree.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, top) };
}

/**
 * Places as a tree: what lies inside what comes from "located-in"
 * connections (a place with none is at the top), and each place says how
 * many events happened there. A place inside itself, through a loop of
 * connections, is shown once at the top rather than lost.
 */
export function placeRows(model: StoryModel) {
  const places = [...model.entries.values()].filter((e) => e.category === 'location');
  const ids = new Set(places.map((p) => p.id));
  const parent = new Map<string, string>();
  for (const link of model.links) {
    if (link.type === 'located-in' && ids.has(link.fromId) && ids.has(link.toId) && !parent.has(link.fromId)) parent.set(link.fromId, link.toId);
  }
  const events = new Map<string, number>();
  for (const e of model.events.values()) if (e.locationId) events.set(e.locationId, (events.get(e.locationId) ?? 0) + 1);
  const children = new Map<string, typeof places>();
  const roots: typeof places = [];
  const inLoop = (id: string) => {
    const seen = new Set<string>();
    for (let at: string | undefined = id; at; at = parent.get(at)) {
      if (seen.has(at)) return true;
      seen.add(at);
    }
    return false;
  };
  for (const place of places) {
    const up = parent.get(place.id);
    if (!up || inLoop(place.id)) roots.push(place);
    else (children.get(up) ?? children.set(up, []).get(up)!).push(place);
  }
  const rows: { id: string; name: string; depth: number; events: number }[] = [];
  const shown = new Set<string>();
  const walk = (list: typeof places, depth: number) => {
    for (const place of [...list].sort((a, b) => a.name.localeCompare(b.name))) {
      if (shown.has(place.id)) continue;
      shown.add(place.id);
      rows.push({ id: place.id, name: place.name, depth, events: events.get(place.id) ?? 0 });
      walk(children.get(place.id) ?? [], depth + 1);
    }
  };
  walk(roots, 0);
  return rows;
}

/** Characters with something tracked about how they change: the abilities their sheets hold, and their logged states. */
export function progressionRows(model: StoryModel, snapshots: { entryId: string }[]) {
  const counts = new Map<string, { abilities: number; snapshots: number; changes: number }>();
  const bump = (id: string) => counts.get(id) ?? counts.set(id, { abilities: 0, snapshots: 0, changes: 0 }).get(id)!;
  for (const sheet of model.sheets) bump(sheet.entryId).abilities += sheet.itemIds.length;
  for (const s of snapshots) bump(s.entryId).snapshots++;
  for (const c of model.progress) bump(c.entryId).changes++;
  // Only who has something recorded is listed: nobody is assumed to have a level, a sheet or anything else.
  return [...counts]
    .filter(([id]) => model.entries.has(id))
    .map(([id, c]) => ({ id, name: model.entries.get(id)!.name, ...c, now: c.changes ? progressSummary(progressAt(model, id, 'end')) : '' }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
