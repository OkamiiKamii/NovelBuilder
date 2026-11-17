// What each view lists, read from the shared model: the views' written form, everything a drawing shows, in words, in
// an order that makes sense without the drawing. A port of flutter_app/lib/shared/domain/visualize/summaries.dart.

import { localeCompare } from '../exchange/collation';
import { type JsonMap, str } from '../json';
import { deriveConnections } from '../model/connections';
import { type EntityRef } from '../model/entityRef';
import { type StoryModel } from '../model/storyModel';
import { stageAt } from '../model/storyOrder';
import { threadStatusName } from '../plot/screens/threads';
import { progressAt, progressSummary } from '../progression/track';
import { stableSorted } from '../reader/stableSort';
import { eventRecords } from '../timeline/eventRecord';

function chapterLabel(model: StoryModel, nodeId: string): string {
  const node = model.nodes.get(nodeId);
  if (node === undefined) return 'a deleted chapter';
  const n = model.order.chapterNumber.get(nodeId);
  const title = node.title.length === 0 ? 'Untitled' : node.title;
  // A scene says which chapter it is in, as every other view names it.
  if (node.kind === 'scene' && n !== undefined && n !== 0) return `Ch ${n}, scene: ${title}`;
  return node.kind === 'chapter' && n !== undefined && n !== 0 ? `Ch ${n}: ${title}` : title;
}

export type TimelineRow = { id: string; title: string; when: string; dated: boolean; start: number; told: string[] };

/** Events in story order: dated ones by date, then the ones with no date yet, each with where the reader meets it. */
export function timelineRows(model: StoryModel): TimelineRow[] {
  const rows = eventRecords(model).map((e) => ({
    id: e.id,
    title: e.title,
    when: e.label,
    dated: e.span !== null,
    start: e.span?.lo ?? Number.POSITIVE_INFINITY,
    told: e.told.map((t) => (t.role === 'told' ? chapterLabel(model, t.nodeId) : `${chapterLabel(model, t.nodeId)} (${t.role})`)),
  }));
  return stableSorted(rows, (a, b) => {
    if (a.start !== b.start) return a.start < b.start ? -1 : 1;
    return localeCompare(a.title, b.title);
  });
}

/** Relationships as they stand at the end of the story so far, and how many stages each has been through. */
export function relationshipRows(model: StoryModel): { id: string; between: string; now: string; stages: number }[] {
  const name = (id: string) => model.entries.get(id)?.name ?? 'Someone deleted';
  return stableSorted(
    [...model.relations.values()].map((r) => {
      const now = stageAt(r, null, model.order);
      return {
        id: r.id,
        between: `${name(r.fromId)} ${now?.directional === true ? '→' : '&'} ${name(r.toId)}`,
        now: now === null ? 'Not yet begun' : now.title.length > 0 ? now.title : now.label.length > 0 ? now.label : 'Related',
        stages: r.stages.length,
      };
    }),
    (a, b) => localeCompare(a.between, b.between),
  );
}

/** Plot threads with where their developments are placed. */
export function plotRows(
  model: StoryModel,
): { id: string; title: string; status: string | null; developments: number; unplaced: number; chapters: string[] }[] {
  return stableSorted(
    [...model.threads.values()].map((t) => {
      const placed = stableSorted(
        t.beats.filter((b) => b.nodeId !== null && model.nodes.has(b.nodeId)),
        (a, b) => (model.order.position.get(a.nodeId!) ?? 0) - (model.order.position.get(b.nodeId!) ?? 0),
      );
      return {
        id: t.id,
        title: t.title,
        status: threadStatusName(t),
        developments: t.beats.length,
        unplaced: t.beats.length - placed.length,
        chapters: [...new Set(placed.map((b) => chapterLabel(model, b.nodeId!)))],
      };
    }),
    (a, b) => localeCompare(a.title, b.title),
  );
}

/** How connected the novel is: the counts, the most connected records, and any connection whose end is gone. */
export function graphSummary(
  model: StoryModel,
  top = 5,
): { records: number; connections: number; dangling: number; mostConnected: { ref: EntityRef; label: string; count: number }[] } {
  const { connections, dangling } = deriveConnections(model);
  const degree = new Map<string, { ref: EntityRef; label: string; count: number }>();
  for (const c of connections) {
    for (const end of [c.from, c.to]) {
      const was = degree.get(end.key);
      degree.set(end.key, { ref: end, label: was?.label ?? model.resolve(end)?.label ?? end.id, count: (was?.count ?? 0) + 1 });
    }
  }
  const records = model.nodes.size + model.entries.size + model.events.size + model.threads.size + model.abilities.size;
  return {
    records,
    connections: connections.length,
    dangling: dangling.length,
    mostConnected: stableSorted(degree.values(), (a, b) => (a.count !== b.count ? b.count - a.count : localeCompare(a.label, b.label))).slice(0, top),
  };
}

/** Places as a tree: what lies inside what comes from "located-in" connections (a place with none is at the top), and
 * each place says how many events happened there. A place inside itself, through a loop, is shown once at the top. */
export function placeRows(model: StoryModel): { id: string; name: string; depth: number; events: number }[] {
  const places = [...model.entries.values()].filter((e) => e.category === 'location');
  const ids = new Set(places.map((p) => p.id));
  const parent = new Map<string, string>();
  for (const link of model.links) {
    if (link.type === 'located-in' && ids.has(link.fromId) && ids.has(link.toId) && !parent.has(link.fromId)) parent.set(link.fromId, link.toId);
  }
  const events = new Map<string, number>();
  for (const e of model.events.values()) {
    const at = e.locationId;
    if (at !== null) events.set(at, (events.get(at) ?? 0) + 1);
  }
  const inLoop = (id: string): boolean => {
    const seen = new Set<string>();
    // At most one step a place, then it repeats.
    for (let at: string | undefined = id, guard = 0; at !== undefined && guard <= places.length + 1; at = parent.get(at), guard++) {
      if (seen.has(at)) return true;
      seen.add(at);
    }
    return false;
  };
  const children = new Map<string, string[]>();
  const roots: string[] = [];
  for (const place of places) {
    const up = parent.get(place.id);
    if (up === undefined || inLoop(place.id)) roots.push(place.id);
    else {
      let list = children.get(up);
      if (list === undefined) children.set(up, (list = []));
      list.push(place.id);
    }
  }
  const byId = new Map(places.map((p) => [p.id, p]));
  const rows: { id: string; name: string; depth: number; events: number }[] = [];
  const shown = new Set<string>();
  const walk = (list: readonly string[], depth: number) => {
    for (const id of stableSorted(list, (a, b) => localeCompare(byId.get(a)!.name, byId.get(b)!.name))) {
      if (shown.has(id)) continue;
      shown.add(id);
      rows.push({ id, name: byId.get(id)!.name, depth, events: events.get(id) ?? 0 });
      walk(children.get(id) ?? [], depth + 1);
    }
  };
  walk(roots, 0);
  return rows;
}

/** One character's progression at the end of the story, in one line: "Level 4 · Rank Lieutenant · Abilities: Fire
 * Lance, Ward". Empty when nothing is recorded. */
export function progressSummaryAtEnd(model: StoryModel, entryId: string): string {
  return progressSummary(progressAt(model, entryId, null));
}

export type ProgressionRow = { id: string; name: string; abilities: number; snapshots: number; changes: number; now: string };

/** Characters with something tracked about how they change: the abilities their sheets hold, their snapshots, and
 * their logged changes. Only who has something recorded is listed: nobody is assumed to have a level or a sheet. */
export function progressionRows(model: StoryModel, snapshots: readonly JsonMap[]): ProgressionRow[] {
  const counts = new Map<string, { abilities: number; snapshots: number; changes: number }>();
  const at = (id: string) => counts.get(id) ?? { abilities: 0, snapshots: 0, changes: 0 };
  for (const sheet of model.sheets) {
    const c = at(sheet.entryId);
    counts.set(sheet.entryId, { ...c, abilities: c.abilities + sheet.itemIds.length });
  }
  for (const s of snapshots) {
    const id = str(s['entryId']);
    const c = at(id);
    counts.set(id, { ...c, snapshots: c.snapshots + 1 });
  }
  for (const p of model.progress) {
    const c = at(p.entryId);
    counts.set(p.entryId, { ...c, changes: c.changes + 1 });
  }
  const rows: ProgressionRow[] = [];
  for (const [id, c] of counts) {
    const entry = model.entries.get(id);
    if (entry === undefined) continue;
    rows.push({ id, name: entry.name, abilities: c.abilities, snapshots: c.snapshots, changes: c.changes, now: c.changes > 0 ? progressSummaryAtEnd(model, id) : '' });
  }
  return stableSorted(rows, (a, b) => localeCompare(a.name, b.name));
}
