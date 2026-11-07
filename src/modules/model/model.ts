import type { NovelDB } from '@/core/db';
import { resolveCategories, unknownCategory } from '@/modules/codex/schema';
import type { CategorySchema, LoreEntry, LoreLink } from '@/modules/codex/types';
import { KIND_LABELS, type ChapterPlan, type StoryNode } from '@/modules/manuscript/types';
import type { PlotThread } from '@/modules/plot/types';
import type { ProgressCategory, ProgressChange } from '@/modules/progression/track';
import type { Journey } from '@/modules/travel/types';
import type { Project } from '@/modules/projects/types';
import { storyOrder } from '@/modules/relationships/timeline';
import type { CharacterRelation } from '@/modules/relationships/types';
import type { SystemBlueprint, SystemSheet } from '@/modules/systems/types';
import { calendarFrom, type CalendarSettings } from '@/modules/timeline/calendar';
import type { TimelineEvent } from '@/modules/timeline/types';
import type { TimelineRecord } from '@/modules/branching/types';
import { ENTITY_TYPES, type AbilityRecord, type EntityRef, type EntityType, type EntityView, type StoryModel } from './types';

/** The rows a model is built from, as they come out of the database. */
export interface ModelRows {
  project: Project;
  nodes: StoryNode[];
  plans: ChapterPlan[];
  entries: LoreEntry[];
  schemas: CategorySchema[];
  links: LoreLink[];
  relations: CharacterRelation[];
  events: TimelineEvent[];
  threads: PlotThread[];
  systems: SystemBlueprint[];
  sheets: SystemSheet[];
  /** Where this project sits among its alternate timelines; absent when it has never been forked. */
  timeline?: TimelineRecord | null;
  /** The novel's calendar row; absent for the standard calendar. */
  calendar?: Partial<CalendarSettings> | null;
  /** Progression categories and changes; absent in models built before they existed. */
  progressCategories?: ProgressCategory[];
  progress?: ProgressChange[];
  journeys?: Journey[];
}

const list = <T>(value: T[] | undefined | null): T[] => (Array.isArray(value) ? value : []);

/**
 * Builds the model from rows. Rows written by earlier versions of the app
 * may lack lists added later (mentions, beats, stages, xp…); they are read
 * as empty. Nothing is written back.
 */
export function buildModel(rows: ModelRows): StoryModel {
  const nodes = rows.nodes.map((node) => ({ ...node, mentions: list(node.mentions) }));
  const systems = rows.systems.map((system) => ({ ...system, groups: list(system.groups), items: list(system.items) }));
  const abilities = new Map<string, AbilityRecord>();
  for (const system of systems) {
    const groups = new Map(system.groups.map((g) => [g.id, g.name]));
    for (const item of system.items) abilities.set(abilityId(system.id, item.id), { system, item, group: groups.get(item.groupId) ?? '' });
  }
  return {
    project: rows.project,
    nodes: new Map(nodes.map((n) => [n.id, n])),
    order: storyOrder(nodes),
    plans: new Map(rows.plans.map((p) => [p.id, { ...p, entityIds: list(p.entityIds) }])),
    entries: new Map(rows.entries.map((e) => [e.id, { ...e, fields: list(e.fields), tags: list(e.tags) }])),
    categories: new Map(resolveCategories(rows.schemas).map((c) => [c.key, c])),
    links: rows.links,
    relations: new Map(rows.relations.map((r) => [r.id, { ...r, stages: list(r.stages) }])),
    events: new Map(rows.events.map((e) => [e.id, { ...e, characters: list(e.characters), entryIds: list(e.entryIds), nodeIds: list(e.nodeIds), afterId: e.afterId ?? null, locationId: e.locationId ?? null, end: e.end ?? null, ongoing: e.ongoing === true, threadIds: list(e.threadIds), status: e.status ?? 'confirmed', canon: e.canon ?? 'canon', reveals: list(e.reveals) }])),
    threads: new Map(rows.threads.map((t) => [t.id, { ...t, characterIds: list(t.characterIds), locationIds: list(t.locationIds), beats: list(t.beats), targetNodeId: t.targetNodeId ?? null }])),
    systems: new Map(systems.map((s) => [s.id, s])),
    abilities,
    sheets: rows.sheets.map((s) => ({ ...s, itemIds: list(s.itemIds) })),
    timeline: rows.timeline ?? null,
    calendar: calendarFrom(rows.calendar),
    progressCategories: new Map(list(rows.progressCategories).map((c) => [c.id, { ...c, ladder: list(c.ladder), characterIds: list(c.characterIds) }])),
    progress: list(rows.progress).map((c) => ({ ...c, at: c.at ?? null, refId: c.refId ?? null, abilityId: c.abilityId ?? null })),
    journeys: list(rows.journeys).map((j) => ({ ...j, travellerIds: list(j.travellerIds), via: list(j.via), eventIds: list(j.eventIds), fromId: j.fromId ?? null, toId: j.toId ?? null, departure: j.departure ?? null, arrival: j.arrival ?? null, afterId: j.afterId ?? null })),
  };
}

/** Reads one project's records in a single transaction, so the model is never half old and half new. */
export async function loadModel(db: NovelDB, projectId: string): Promise<StoryModel | null> {
  const tables = ['projects', 'timelines', 'chapters', 'chapterPlans', 'loreEntries', 'loreSchemas', 'loreLinks', 'characterRelations', 'timelineEvents', 'plotThreads', 'systems', 'systemSheets', 'storyCalendars', 'progressCategories', 'progressChanges', 'journeys'];
  return db.transaction('r', tables, async () => {
    const project = await db.projects.get(projectId);
    if (!project) return null;
    const of = <T,>(table: string) => db.table<T>(table).where('projectId').equals(projectId).toArray();
    const [nodes, plans, entries, schemas, links, relations, events, threads, systems, sheets] = await Promise.all([
      of<StoryNode>('chapters'), of<ChapterPlan>('chapterPlans'), of<LoreEntry>('loreEntries'), of<CategorySchema>('loreSchemas'), of<LoreLink>('loreLinks'),
      of<CharacterRelation>('characterRelations'), of<TimelineEvent>('timelineEvents'), of<PlotThread>('plotThreads'), of<SystemBlueprint>('systems'), of<SystemSheet>('systemSheets'),
    ]);
    const timeline = (await db.timelines.get(projectId)) ?? null;
    const [calendar] = await of<CalendarSettings>('storyCalendars');
    const [progressCategories, progress, journeys] = await Promise.all([of<ProgressCategory>('progressCategories'), of<ProgressChange>('progressChanges'), of<Journey>('journeys')]);
    return buildModel({ project, nodes, plans, entries, schemas, links, relations, events, threads, systems, sheets, timeline, calendar, progressCategories, progress, journeys });
  });
}

/** An ability's id: the blueprint and the item, since items live inside their blueprint. */
export const abilityId = (systemId: string, itemId: string): string => `${systemId}/${itemId}`;

/** A ref as one string (`entry:<id>`), for URLs and map keys. */
export const refKey = (ref: EntityRef): string => `${ref.type}:${ref.id}`;

/** Reads a ref back from `refKey`. Null for anything that is not one. */
export function parseRefKey(key: string): EntityRef | null {
  const at = key.indexOf(':');
  if (at <= 0) return null;
  const type = key.slice(0, at);
  const id = key.slice(at + 1);
  return ENTITY_TYPES.includes(type as EntityType) && id ? { type: type as EntityType, id } : null;
}

export const sameRef = (a: EntityRef, b: EntityRef): boolean => a.type === b.type && a.id === b.id;

export type Resolved = { found: true; view: EntityView } | { found: false; ref: EntityRef };

/**
 * Finds a record by ref and says what it is called now. A ref to something
 * deleted, or from another project, comes back as `found: false`; it never
 * throws, so a stale link can always be shown for what it is.
 */
export function resolveRef(model: StoryModel, ref: EntityRef): Resolved {
  const view = (label: string, kind: string): Resolved => ({ found: true, view: { ref, label, kind } });
  switch (ref.type) {
    case 'node': {
      const node = model.nodes.get(ref.id);
      return node ? view(node.title || `Untitled ${KIND_LABELS[node.kind]?.toLowerCase() ?? 'item'}`, node.kind) : { found: false, ref };
    }
    case 'entry': {
      const entry = model.entries.get(ref.id);
      return entry ? view(entry.name, entry.category) : { found: false, ref };
    }
    case 'event': {
      const event = model.events.get(ref.id);
      return event ? view(event.name, 'event') : { found: false, ref };
    }
    case 'thread': {
      const thread = model.threads.get(ref.id);
      return thread ? view(thread.title, 'thread') : { found: false, ref };
    }
    case 'relation': {
      const relation = model.relations.get(ref.id);
      if (!relation) return { found: false, ref };
      const name = (id: string) => model.entries.get(id)?.name ?? 'Someone';
      return view(`${name(relation.fromId)} and ${name(relation.toId)}`, 'relation');
    }
    case 'ability': {
      const ability = model.abilities.get(ref.id);
      return ability ? view(ability.item.name, 'ability') : { found: false, ref };
    }
  }
}

/** The display name of a codex category, an unknown one included. */
export const categoryName = (model: StoryModel, key: string): string => (model.categories.get(key) ?? unknownCategory(key)).name;
