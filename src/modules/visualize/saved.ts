import type { NovelDB } from '@/core/db';
import { createId } from '@/core/id';
import type { ProjectRegistry } from '@/core/projectRegistry';
import type { Filter } from '@/modules/model/query';
import type { StoryModel } from '@/modules/model/types';
import { remapValidity, type Anchor } from '@/modules/model/validity';
import { decodeFilter, encodeFilter } from '@/modules/viz/params';
import type { View } from '@/modules/viz/zoom';

/**
 * A SAVED VIEW is a way of looking, not a copy of what is looked at: which
 * view, its filters (record ids and query settings), what is shown, the zoom,
 * and the view's own layout choices, under a name. Opening it reads the
 * records as they are now; a record deleted since is simply not there, and
 * the view says so.
 */
export interface ViewConfig {
  filter: Filter;
  mode: 'visual' | 'list';
  /** Which of the view's layers are on (track kinds, edge kinds…); empty means the view's own default. */
  layers: string[];
  /** Zoom and position of the drawing; null to fit everything in when it opens. */
  scale: View | null;
  /** The view's own choices: grouping, track order, colour by… Kept as given. */
  layout: Record<string, unknown>;
}

export interface SavedView extends ViewConfig {
  id: string;
  projectId: string;
  /** The view it belongs to (`timeline`, `places`…); kept as written even if a later version renames views. */
  view: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export const DEFAULT_CONFIG: ViewConfig = { filter: {}, mode: 'visual', layers: [], scale: null, layout: {} };

const text = (v: unknown) => (typeof v === 'string' ? v : '');
const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

/** A config made safe to store: the filter through the same reading as the page address, the rest checked. */
export function cleanConfig(input: Partial<ViewConfig>): ViewConfig {
  const scale = input.scale && finite(input.scale.x) && finite(input.scale.y) && finite(input.scale.k) && input.scale.k > 0 ? { x: input.scale.x, y: input.scale.y, k: input.scale.k } : null;
  return {
    filter: decodeFilter(new URLSearchParams(encodeFilter(input.filter ?? {}))),
    mode: input.mode === 'list' ? 'list' : 'visual',
    layers: [...new Set((Array.isArray(input.layers) ? input.layers : []).map(text).filter(Boolean))],
    scale,
    layout: input.layout && typeof input.layout === 'object' && !Array.isArray(input.layout) ? { ...input.layout } : {},
  };
}

/** Every record id a config names, with where, for checking they still exist and for rewriting them in copies. */
function remapConfig(config: ViewConfig, mapId: (id: string) => string): ViewConfig {
  const f = config.filter;
  const list = (ids?: string[]) => ids?.map(mapId);
  const anchor = (a?: Anchor | null) => (a ? remapValidity({ from: a, until: null }, mapId)!.from : a);
  // Layout values that are ids (a track order) are rewritten too; anything that is not a known id is left as it is.
  const layout = Object.fromEntries(Object.entries(config.layout).map(([k, v]) => [k, typeof v === 'string' ? mapId(v) : Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? mapId(x) : x)) : v]));
  return {
    ...config,
    layout,
    filter: {
      ...f,
      ...(f.ids ? { ids: list(f.ids) } : {}),
      ...(f.characters ? { characters: list(f.characters) } : {}),
      ...(f.locations ? { locations: list(f.locations) } : {}),
      ...(f.factions ? { factions: list(f.factions) } : {}),
      ...(f.threads ? { threads: list(f.threads) } : {}),
      ...(f.chapters ? { chapters: { ...(f.chapters.from ? { from: mapId(f.chapters.from) } : {}), ...(f.chapters.to ? { to: mapId(f.chapters.to) } : {}) } } : {}),
      ...(f.time ? { time: { ...(f.time.from ? { from: anchor(f.time.from) } : {}), ...(f.time.until ? { until: anchor(f.time.until) } : {}) } } : {}),
    },
  };
}

/** Saved views travel with the project: backed up, copied and forked, with the ids inside them pointing at the copies. */
export function registerSavedViews(registry: ProjectRegistry): void {
  registry.registerCollection({ table: 'savedViews', remap: (row, mapId) => ({ ...row, ...remapConfig(cleanConfig(row as Partial<ViewConfig>), mapId) }) });
}

/**
 * A saved view as it can be opened now: the ids of records deleted since it
 * was saved are left out of its filter, and listed so the view can say how
 * many. The stored view is not changed.
 */
export function openSaved(model: StoryModel, saved: Pick<SavedView, 'filter'>): { filter: Filter; missing: string[] } {
  const missing: string[] = [];
  const keep = (ids: string[] | undefined, exists: (id: string) => boolean) => {
    if (!ids) return ids;
    const kept = ids.filter((id) => exists(id) || (missing.push(id), false));
    return kept.length ? kept : undefined;
  };
  const anyRecord = (id: string) => model.nodes.has(id) || model.entries.has(id) || model.events.has(id) || model.threads.has(id) || model.relations.has(id) || model.abilities.has(id);
  const entry = (id: string) => model.entries.has(id);
  const point = (a?: Anchor | null) => {
    if (!a) return a;
    const id = a.kind === 'node' ? a.nodeId : a.kind === 'event' ? a.eventId : a.when.precision === 'relative' ? a.when.anchorId : null;
    if (id && !(a.kind === 'node' ? model.nodes.has(id) : model.events.has(id))) {
      missing.push(id);
      return undefined;
    }
    return a;
  };
  const f = saved.filter;
  const filter: Filter = { ...f };
  for (const [key, exists] of [['ids', anyRecord], ['characters', entry], ['locations', entry], ['factions', entry], ['threads', (id: string) => model.threads.has(id)]] as const) {
    const kept = keep(f[key], exists);
    if (kept) filter[key] = kept;
    else delete filter[key];
  }
  if (f.chapters) {
    const from = f.chapters.from && !model.nodes.has(f.chapters.from) ? (missing.push(f.chapters.from), undefined) : f.chapters.from;
    const to = f.chapters.to && !model.nodes.has(f.chapters.to) ? (missing.push(f.chapters.to), undefined) : f.chapters.to;
    if (from || to) filter.chapters = { ...(from ? { from } : {}), ...(to ? { to } : {}) };
    else delete filter.chapters;
  }
  if (f.time) {
    const from = point(f.time.from);
    const until = point(f.time.until);
    if (from || until) filter.time = { ...(from ? { from } : {}), ...(until ? { until } : {}) };
    else delete filter.time;
  }
  return { filter, missing: [...new Set(missing)] };
}

export class SavedViewNotFoundError extends Error {
  constructor(id: string) {
    super(`Saved view ${id} not found in this project`);
    this.name = 'SavedViewNotFoundError';
  }
}

export function createSavedViewService(db: NovelDB, onProjectChanged: (projectId: string) => Promise<unknown>) {
  function forProject(projectId: string) {
    const write = <T>(task: () => Promise<T>): Promise<T> =>
      db.transaction('rw', db.tables, async () => {
        const result = await task();
        await onProjectChanged(projectId);
        return result;
      });
    async function owned(id: string): Promise<SavedView> {
      const row = await db.savedViews.get(id);
      if (!row || row.projectId !== projectId) throw new SavedViewNotFoundError(id);
      return row;
    }
    const nameOf = (name: string | undefined) => text(name).trim() || 'Untitled view';
    return {
      /** This project's saved views, of one view or all, by name. */
      async list(view?: string): Promise<SavedView[]> {
        const rows = await db.savedViews.where('projectId').equals(projectId).toArray();
        return rows.filter((r) => !view || r.view === view).sort((a, b) => a.name.localeCompare(b.name) || a.createdAt - b.createdAt);
      },
      async get(id: string): Promise<SavedView | undefined> {
        const row = await db.savedViews.get(id);
        return row?.projectId === projectId ? row : undefined;
      },
      save: (view: string, name: string, config: Partial<ViewConfig>) =>
        write(async () => {
          const now = Date.now();
          const row: SavedView = { id: createId(), projectId, view: text(view).trim() || 'timeline', name: nameOf(name), ...cleanConfig(config), createdAt: now, updatedAt: now };
          await db.savedViews.add(row);
          return row;
        }),
      /** Replaces what a saved view shows, keeping its name. */
      update: (id: string, config: Partial<ViewConfig>) =>
        write(async () => {
          const current = await owned(id);
          const next = { ...cleanConfig({ ...current, ...config }), updatedAt: Date.now() };
          await db.savedViews.update(id, next);
          return { ...current, ...next };
        }),
      rename: (id: string, name: string) =>
        write(async () => {
          await owned(id);
          await db.savedViews.update(id, { name: nameOf(name), updatedAt: Date.now() });
        }),
      duplicate: (id: string) =>
        write(async () => {
          const current = await owned(id);
          const now = Date.now();
          const copy: SavedView = { ...structuredClone(current), id: createId(), name: `${current.name} (copy)`, createdAt: now, updatedAt: now };
          await db.savedViews.add(copy);
          return copy;
        }),
      /** Puts a saved view back to how the view opens on its own, keeping its name. */
      restoreDefault: (id: string) =>
        write(async () => {
          await owned(id);
          await db.savedViews.update(id, { ...structuredClone(DEFAULT_CONFIG), updatedAt: Date.now() });
        }),
      remove: (id: string) =>
        write(async () => {
          await owned(id);
          await db.savedViews.delete(id);
        }),
    };
  }
  return { forProject };
}

export type SavedViewService = ReturnType<typeof createSavedViewService>;
