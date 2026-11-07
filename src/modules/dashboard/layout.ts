import { createId } from '@/core/id';

/**
 * YOUR DASHBOARD
 * Which widgets an author has put on a novel's dashboard, in what order, how
 * big, and set up how. It is a preference of this person on this device
 * (it travels with their other settings when they sync), never a record of
 * the novel: a widget holds a kind, a size and its settings, and the
 * settings name records by id only. What a widget shows is read from the
 * records each time it is drawn, so nothing on the dashboard is a copy.
 */
export const WIDGET_KINDS = ['upcoming', 'threads', 'recent', 'words', 'appearances', 'warnings', 'saved'] as const;
export type WidgetKind = (typeof WIDGET_KINDS)[number];
export const isWidgetKind = (kind: string): kind is WidgetKind => (WIDGET_KINDS as readonly string[]).includes(kind);

export type Width = 1 | 2 | 3;
export type Height = 1 | 2 | 3;
export const WIDTH_LABELS: Record<Width, string> = { 1: 'Narrow (a third)', 2: 'Wide (two thirds)', 3: 'Full width' };
export const HEIGHT_LABELS: Record<Height, string> = { 1: 'Short', 2: 'Medium', 3: 'Tall' };

export interface Widget {
  id: string;
  /** A kind this version knows, or one from a newer version, kept as it is. */
  kind: string;
  /** Columns across, of three. On a narrower screen it takes what there is. */
  w: Width;
  /** How tall it grows before its contents scroll. */
  h: Height;
  /** The author's own title; empty for the kind's own. */
  title: string;
  /** The kind's settings, as stored. Read through `settingsOf`; anything not understood is kept. */
  config: Record<string, unknown>;
}

export interface Layout {
  widgets: Widget[];
}

export const EMPTY_LAYOUT: Layout = { widgets: [] };
export const MAX_WIDGETS = 24;
export const MAX_COUNT = 50;

/** What each kind is, in the words the page uses, and how big it starts. */
export const KIND_INFO: Record<WidgetKind, { title: string; description: string; w: Width; h: Height }> = {
  upcoming: { title: 'Upcoming events', description: 'Events still to be written: told in chapters with no words yet, or later in story time than the latest event told so far.', w: 1, h: 2 },
  threads: { title: 'Plot threads', description: 'Each plot thread with the status you gave it, how many developments it has and where the latest is.', w: 1, h: 2 },
  recent: { title: 'Recently changed', description: 'The chapters, codex entries, events, plot threads and relationships changed most recently.', w: 1, h: 2 },
  words: { title: 'Words per chapter', description: 'The words in each chapter or scene, as the editor counts them, in reading order or by length.', w: 2, h: 2 },
  appearances: { title: 'Character appearances', description: 'The chapters a character is recorded in, from your appearance records and the other records that tie them to a chapter.', w: 2, h: 2 },
  warnings: { title: 'Warnings to look at', description: 'Warnings from every check that you have not decided on yet, most serious first.', w: 1, h: 2 },
  saved: { title: 'Saved views', description: 'Your saved visualizations, to open as you left them.', w: 1, h: 1 },
};

/** A first set for an empty dashboard: places to look, all reading this novel's own records. */
export const STARTER: WidgetKind[] = ['upcoming', 'threads', 'words', 'warnings'];

// The settings of each kind, with what they are when not set.
export type EventOrder = 'reading' | 'story';
export interface UpcomingSettings { from: EventOrder; count: number; threadId: string | null; characterId: string | null }
export type ThreadSort = 'status' | 'title' | 'changed';
export interface ThreadSettings { statuses: string[]; sort: ThreadSort; count: number }
export const RECENT_TYPES = ['node', 'entry', 'event', 'thread', 'relation'] as const;
export type RecentType = (typeof RECENT_TYPES)[number];
export interface RecentSettings { types: RecentType[]; count: number }
export type WordSort = 'reading' | 'longest' | 'shortest';
export interface WordSettings { grain: 'chapters' | 'scenes'; sort: WordSort; count: number; partId: string | null }
export interface AppearanceSettings { characterId: string | null; count: number }
export interface WarningSettings { severities: string[]; count: number }
export interface SavedSettings { view: string | null; count: number }
export interface SettingsByKind {
  upcoming: UpcomingSettings;
  threads: ThreadSettings;
  recent: RecentSettings;
  words: WordSettings;
  appearances: AppearanceSettings;
  warnings: WarningSettings;
  saved: SavedSettings;
}

const id = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const oneOf = <T extends string>(v: unknown, values: readonly T[], fallback: T): T => (values.includes(v as T) ? (v as T) : fallback);
const count = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(MAX_COUNT, Math.max(1, Math.round(v))) : fallback);
const words = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length > 0))] : []);

/** A widget's settings as its kind reads them: what is stored where it makes sense, the kind's own otherwise. */
export function settingsOf<K extends WidgetKind>(kind: K, config: Record<string, unknown>): SettingsByKind[K] {
  const c = config;
  const all: { [P in WidgetKind]: () => SettingsByKind[P] } = {
    upcoming: () => ({ from: oneOf(c.from, ['reading', 'story'] as const, 'reading'), count: count(c.count, 6), threadId: id(c.threadId), characterId: id(c.characterId) }),
    threads: () => ({ statuses: words(c.statuses), sort: oneOf(c.sort, ['status', 'title', 'changed'] as const, 'status'), count: count(c.count, 8) }),
    recent: () => {
      const types = words(c.types).filter((t): t is RecentType => (RECENT_TYPES as readonly string[]).includes(t));
      return { types: types.length ? types : [...RECENT_TYPES], count: count(c.count, 8) };
    },
    words: () => ({ grain: oneOf(c.grain, ['chapters', 'scenes'] as const, 'chapters'), sort: oneOf(c.sort, ['reading', 'longest', 'shortest'] as const, 'reading'), count: count(c.count, 12), partId: id(c.partId) }),
    appearances: () => ({ characterId: id(c.characterId), count: count(c.count, 6) }),
    warnings: () => ({ severities: words(c.severities), count: count(c.count, 6) }),
    saved: () => ({ view: id(c.view), count: count(c.count, 8) }),
  };
  return all[kind]() as SettingsByKind[K];
}

const plain = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const width = (v: unknown, fallback: Width): Width => (v === 1 || v === 2 || v === 3 ? v : fallback);

/**
 * A stored layout made safe to use. Whatever cannot be read is left out
 * rather than guessed at; a widget of a kind this version does not know is
 * kept, so opening the dashboard here does not lose it.
 */
export function parseLayout(raw: unknown): Layout {
  const list = plain(raw) && Array.isArray(raw.widgets) ? raw.widgets : [];
  const seen = new Set<string>();
  const widgets: Widget[] = [];
  for (const item of list) {
    if (!plain(item) || typeof item.id !== 'string' || !item.id || seen.has(item.id) || typeof item.kind !== 'string' || !item.kind) continue;
    seen.add(item.id);
    const own = isWidgetKind(item.kind) ? KIND_INFO[item.kind] : { w: 1 as Width, h: 2 as Height };
    widgets.push({ id: item.id, kind: item.kind, w: width(item.w, own.w), h: width(item.h, own.h), title: typeof item.title === 'string' ? item.title.slice(0, 80) : '', config: plain(item.config) ? { ...item.config } : {} });
    if (widgets.length === MAX_WIDGETS) break;
  }
  return { widgets };
}

export const titleOf = (widget: Pick<Widget, 'kind' | 'title'>): string => widget.title.trim() || (isWidgetKind(widget.kind) ? KIND_INFO[widget.kind].title : 'A widget from a newer version');

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Puts a new widget of a kind at a place in the order (the end when not said). */
export function addWidget(layout: Layout, kind: WidgetKind, at: number = layout.widgets.length, newId: string = createId()): Layout {
  if (layout.widgets.length >= MAX_WIDGETS) return layout;
  const widgets = [...layout.widgets];
  widgets.splice(clamp(at, 0, widgets.length), 0, { id: newId, kind, w: KIND_INFO[kind].w, h: KIND_INFO[kind].h, title: '', config: {} });
  return { ...layout, widgets };
}

/** Takes a widget off, saying where it was, so it can be put back. */
export function removeWidget(layout: Layout, widgetId: string): { layout: Layout; removed: { widget: Widget; index: number } | null } {
  const index = layout.widgets.findIndex((w) => w.id === widgetId);
  if (index < 0) return { layout, removed: null };
  return { layout: { ...layout, widgets: layout.widgets.filter((w) => w.id !== widgetId) }, removed: { widget: layout.widgets[index], index } };
}

/** Puts back a widget taken off, where it was. */
export function restoreWidget(layout: Layout, widget: Widget, index: number): Layout {
  if (layout.widgets.some((w) => w.id === widget.id) || layout.widgets.length >= MAX_WIDGETS) return layout;
  const widgets = [...layout.widgets];
  widgets.splice(clamp(index, 0, widgets.length), 0, widget);
  return { ...layout, widgets };
}

/** Moves a widget to a place in the order, counted from 0. */
export function moveWidget(layout: Layout, widgetId: string, to: number): Layout {
  const from = layout.widgets.findIndex((w) => w.id === widgetId);
  if (from < 0) return layout;
  const target = clamp(to, 0, layout.widgets.length - 1);
  if (target === from) return layout;
  const widgets = [...layout.widgets];
  const [widget] = widgets.splice(from, 1);
  widgets.splice(target, 0, widget);
  return { ...layout, widgets };
}

const change = (layout: Layout, widgetId: string, edit: (w: Widget) => Widget): Layout => ({ ...layout, widgets: layout.widgets.map((w) => (w.id === widgetId ? edit(w) : w)) });

export const resizeWidget = (layout: Layout, widgetId: string, size: { w?: Width; h?: Height }): Layout => change(layout, widgetId, (w) => ({ ...w, w: width(size.w, w.w), h: width(size.h, w.h) }));

/** Changes some of a widget's settings, keeping the rest, and its title when given. A setting set to null is cleared. */
export const configureWidget = (layout: Layout, widgetId: string, settings: Record<string, unknown>, title?: string): Layout =>
  change(layout, widgetId, (w) => {
    const config = { ...w.config };
    for (const [key, value] of Object.entries(settings)) {
      if (value === null || value === undefined) delete config[key];
      else config[key] = value;
    }
    return { ...w, config, title: title === undefined ? w.title : title.slice(0, 80) };
  });

/** Where a novel's dashboard is kept in this browser. */
export const dashboardKey = (projectId: string): string => `novel-builder:dashboard:${projectId}`;

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * The dashboards of this browser. Reading never throws: a layout that cannot
 * be read is an empty dashboard, and one that cannot be written lasts for
 * this visit, and says so.
 */
export function createDashboardStore(storage: Storage) {
  const listeners = new Set<() => void>();
  const cache = new Map<string, Layout>();
  /** Layouts that could not be written, kept for this visit. */
  const unsaved = new Set<string>();
  let version = 0;
  const notify = () => {
    version++;
    listeners.forEach((listener) => listener());
  };

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    version: () => version,
    /** Forgets what was read, so the next read comes from storage again (another tab, or sync, changed it). */
    refresh() {
      for (const key of [...cache.keys()]) if (!unsaved.has(key)) cache.delete(key);
      notify();
    },
    layout(projectId: string): Layout {
      const key = dashboardKey(projectId);
      const known = cache.get(key);
      if (known) return known;
      let layout = EMPTY_LAYOUT;
      try {
        const raw = storage.getItem(key);
        layout = raw ? parseLayout(JSON.parse(raw)) : EMPTY_LAYOUT;
      } catch {
        // unreadable or corrupt: an empty dashboard, and the stored text is left alone until the author changes the layout
      }
      cache.set(key, layout);
      return layout;
    },
    save(projectId: string, layout: Layout) {
      const key = dashboardKey(projectId);
      cache.set(key, layout);
      try {
        if (layout.widgets.length) storage.setItem(key, JSON.stringify({ version: 1, widgets: layout.widgets }));
        else storage.removeItem(key);
        unsaved.delete(key);
      } catch {
        unsaved.add(key);
      }
      notify();
    },
    /** Whether the layout shown could not be kept in this browser. */
    unsaved: (projectId: string): boolean => unsaved.has(dashboardKey(projectId)),
  };
}

export type DashboardStore = ReturnType<typeof createDashboardStore>;

const noStorage: Storage = {
  getItem: () => null,
  setItem: () => {
    throw new Error('No storage');
  },
  removeItem: () => {},
};
const browserStorage = (): Storage => {
  try {
    return typeof localStorage === 'undefined' ? noStorage : localStorage;
  } catch {
    return noStorage;
  }
};

/** The app's one dashboard store. */
export const dashboards = createDashboardStore(browserStorage());

if (typeof window !== 'undefined') window.addEventListener('storage', (e) => (e.key === null || e.key.startsWith('novel-builder:dashboard:')) && dashboards.refresh());
