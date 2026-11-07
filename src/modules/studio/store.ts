import { useSyncExternalStore } from 'react';
import { currentForm, device, type Form } from '@/modules/platform/device';
import { DEFAULT_SHORTCUTS, parseShortcuts, rebind, type ActionId } from './shortcuts';

export const MODES = ['drafting', 'planning', 'worldbuilding', 'editing'] as const;
export type Mode = (typeof MODES)[number];
export const MODE_LABELS: Record<Mode, string> = { drafting: 'Drafting', planning: 'Planning', worldbuilding: 'Worldbuilding', editing: 'Editing' };
export const MODE_HINTS: Record<Mode, string> = {
  drafting: 'The manuscript, with as little around it as you like.',
  planning: 'Chapter tree, scene cards and plot threads side by side.',
  worldbuilding: 'The Codex, your systems and how things connect.',
  editing: 'The manuscript with continuity alerts and history to hand.',
};

/**
 * What a side panel can show. `auto` is the familiar default: on the left,
 * the app's navigation (or the chapter list while writing); on the right,
 * the writing tools while writing and the Codex reference elsewhere.
 */
export const PANELS = ['auto', 'nav', 'chapters', 'codex', 'threads', 'reference', 'notes', 'timeline', 'relationships', 'continuity', 'assistant'] as const;
export type Panel = (typeof PANELS)[number];
export const PANEL_LABELS: Record<Panel, string> = {
  auto: 'Standard', nav: 'Navigation', chapters: 'Chapters & scenes', codex: 'Worldbuilding tree', threads: 'Plot threads', reference: 'Character bios & lore', notes: 'Notes',
  timeline: 'Timeline', relationships: 'Relationship inspector', continuity: 'Continuity alerts', assistant: 'AI brainstorm',
};

/** What the centre shows when a workspace is opened: a page of the project. */
export const CENTERS = ['manuscript', 'organizer', 'codex', 'graph', 'continuity', 'plot', 'timeline', 'relationships', 'canon', 'systems', 'progression', 'visualize', 'overview'] as const;
export type Center = (typeof CENTERS)[number];
export const CENTER_LABELS: Record<Center, string> = {
  manuscript: 'Manuscript editor', organizer: 'Chapter & scene organizer', codex: 'Worldbuilding cards', graph: 'Visual story graph', continuity: 'Continuity dashboard', plot: 'Plot threads',
  timeline: 'Timeline', relationships: 'Relationships', canon: 'Canon', systems: 'Systems', progression: 'Character progression', visualize: 'Visualize (every view)', overview: 'Project overview',
};

export const WIDTH = { min: 200, max: 560 };

export interface Dock {
  kind: Panel;
  open: boolean;
  width: number;
}

/**
 * A workspace has two pairs of side panels, because the writing screen and
 * the app's other pages are different places: closing the chapter list
 * while writing must not hide the navigation everywhere else.
 */
export const SLOTS = ['left', 'right', 'writeLeft', 'writeRight'] as const;
export type Slot = (typeof SLOTS)[number];
export type Host = 'pages' | 'writing';
export const slotOf = (host: Host, side: 'left' | 'right'): Slot => (host === 'writing' ? (side === 'left' ? 'writeLeft' : 'writeRight') : side);

export interface ModeLayout {
  center: Center;
  /** On the app's pages. */
  left: Dock;
  right: Dock;
  /** On the writing screen. */
  writeLeft: Dock;
  writeRight: Dock;
  /** Distraction-free writing when this workspace opens. */
  focus: boolean;
  /** Show today's words against the daily goal above the manuscript. */
  goalBar: boolean;
}

export type Layout = Record<Mode, ModeLayout>;

const dock = (kind: Panel, open: boolean, width: number): Dock => ({ kind, open, width });
/** Side panels as the app has always had them: navigation beside the pages; the chapter list and (closed) writing tools beside the manuscript. */
const usual = (): Pick<ModeLayout, 'left' | 'right' | 'writeLeft' | 'writeRight'> => ({ left: dock('auto', true, 232), right: dock('reference', false, 340), writeLeft: dock('auto', true, 264), writeRight: dock('auto', false, 340) });
const mode = (center: Center, more: Partial<ModeLayout> = {}): ModeLayout => ({ center, ...usual(), focus: false, goalBar: false, ...more });

const closed = (layout: Layout, slots: readonly Slot[]): Layout => {
  const out = { ...layout };
  for (const key of MODES) {
    out[key] = { ...out[key] };
    for (const slot of slots) out[key][slot] = { ...out[key][slot], open: false };
  }
  return out;
};

/**
 * The layout each kind of device starts from. The desktop's is the layout
 * the app has always had, as four workspaces. A tablet keeps the navigation
 * beside the page and everything else a tap away; a phone is one column,
 * with every panel put away until it is asked for.
 */
export function standardLayout(form: Form = 'desktop'): Layout {
  const desktop: Layout = {
    drafting: mode('manuscript', { goalBar: true }),
    planning: mode('organizer', { right: dock('threads', false, 320) }),
    worldbuilding: mode('codex', { right: dock('relationships', false, 340) }),
    editing: mode('manuscript', { writeRight: dock('continuity', true, 360) }),
  };
  if (form === 'tablet') return closed(desktop, ['right', 'writeLeft', 'writeRight']);
  if (form === 'phone') return closed(desktop, SLOTS);
  return desktop;
}

export interface Preset {
  id: string;
  name: string;
  description: string;
  /** The workspace it opens in. */
  start: Mode;
  layout: Layout;
}

export const PRESETS: Preset[] = [
  {
    id: 'pure-writer', name: 'Pure Writer', description: 'Nothing but the page: panels closed, distraction-free drafting, a word-count goal bar.', start: 'drafting',
    layout: { ...standardLayout(), drafting: mode('manuscript', { writeLeft: dock('auto', false, 264), writeRight: dock('auto', false, 340), focus: true, goalBar: true }) },
  },
  {
    id: 'worldbuilder', name: 'Worldbuilder', description: 'Codex in the centre, the worldbuilding tree on the left, relationships on the right; lore beside the page while drafting.', start: 'worldbuilding',
    layout: { ...standardLayout(), worldbuilding: mode('codex', { left: dock('codex', true, 280), right: dock('relationships', true, 340) }), drafting: mode('manuscript', { writeRight: dock('reference', true, 360), goalBar: true }) },
  },
  {
    id: 'outliner', name: 'Outliner', description: 'The chapter organizer with plot threads on the left and the timeline on the right.', start: 'planning',
    layout: { ...standardLayout(), planning: mode('organizer', { left: dock('threads', true, 280), right: dock('timeline', true, 300) }), drafting: mode('manuscript', { writeRight: dock('auto', true, 340), goalBar: true }) },
  },
  {
    id: 'revision-editor', name: 'Revision Editor', description: 'The manuscript with chapters on the left and continuity alerts on the right; canon to hand.', start: 'editing',
    layout: { ...standardLayout(), editing: mode('manuscript', { writeLeft: dock('chapters', true, 264), writeRight: dock('continuity', true, 400) }), worldbuilding: mode('canon', { right: dock('reference', true, 340) }) },
  },
  {
    id: 'progression-fantasy', name: 'Progression Fantasy', description: 'Systems and character progression front and centre; character sheets beside the page.', start: 'drafting',
    layout: {
      drafting: mode('manuscript', { writeRight: dock('reference', true, 360), goalBar: true }), planning: mode('progression', { right: dock('threads', true, 300) }),
      worldbuilding: mode('systems', { left: dock('codex', true, 280) }), editing: mode('manuscript', { writeRight: dock('continuity', true, 360) }),
    },
  },
];

const oneOf = <T extends string>(options: readonly T[], value: unknown, fallback: T): T => (options.includes(value as T) ? (value as T) : fallback);
const clampWidth = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? Math.round(Math.min(WIDTH.max, Math.max(WIDTH.min, value))) : fallback);

function parseDock(raw: unknown, base: Dock): Dock {
  const given = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return { kind: oneOf(PANELS, given.kind, base.kind), open: typeof given.open === 'boolean' ? given.open : base.open, width: clampWidth(given.width, base.width) };
}

/** Reads a stored or imported layout defensively: anything missing or invalid falls back to the standard layout. */
export function parseLayout(raw: unknown, form: Form = 'desktop'): Layout {
  const given = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const base = standardLayout(form);
  const out = {} as Layout;
  for (const key of MODES) {
    const m = given[key] && typeof given[key] === 'object' ? (given[key] as Record<string, unknown>) : {};
    out[key] = {
      center: oneOf(CENTERS, m.center, base[key].center), left: parseDock(m.left, base[key].left), right: parseDock(m.right, base[key].right),
      writeLeft: parseDock(m.writeLeft, base[key].writeLeft), writeRight: parseDock(m.writeRight, base[key].writeRight),
      focus: typeof m.focus === 'boolean' ? m.focus : base[key].focus, goalBar: typeof m.goalBar === 'boolean' ? m.goalBar : base[key].goalBar,
    };
  }
  return out;
}

/** Where each project is: which workspace is active. */
export interface Session {
  mode: Mode;
}

function parseSession(raw: unknown): Session {
  const given = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return { mode: oneOf(MODES, given.mode, 'drafting') };
}

export const EXPORT_FORMAT = 'novel-builder-workspace';

/** Where a kind of device keeps its layouts. The desktop's keys are the ones the app has always used. */
export const studioKeys = (form: Form) => {
  const root = form === 'desktop' ? 'novel-builder:studio' : `novel-builder:studio:${form}`;
  return { global: `${root}:layout`, project: (id: string) => `${root}:layout:${id}`, session: (id: string) => `${root}:session:${id}`, shortcuts: 'novel-builder:studio:shortcuts' };
};

/**
 * LAYOUT STATE PERSISTENCE RULE
 * Everything here is written to this device's storage the moment it changes
 * and read back on the next launch: the layout of each workspace (the
 * author's own for all projects, or one saved for a single project), the
 * active workspace per project, and the keyboard shortcuts.
 * Storage is injected so the same code runs in tests.
 *
 * DEVICE-AWARE LAYOUT ISOLATION RULE
 * Layouts and the active workspace are kept separately for each kind of
 * device (desktop, tablet, phone). Every read and every write here goes to
 * the keys of the kind of device in use, and to no others: a panel closed
 * on a phone cannot close it on the desktop, on this machine or (through
 * sync, which carries all three sets side by side) on any other. The only
 * way one device's layout reaches another kind is `copyFrom`, which the
 * author has to ask for.
 */
export function createStudioStore(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>, form: () => Form = () => 'desktop') {
  const KEYS = { get global() { return studioKeys(form()).global; }, project: (id: string) => studioKeys(form()).project(id), session: (id: string) => studioKeys(form()).session(id), shortcuts: 'novel-builder:studio:shortcuts' };
  const listeners = new Set<() => void>();
  let version = 0;
  const cache = new Map<string, unknown>();

  const read = (key: string): unknown => {
    if (cache.has(key)) return cache.get(key);
    let value: unknown = null;
    try {
      const raw = storage.getItem(key);
      value = raw ? JSON.parse(raw) : null;
    } catch {
      // unreadable or corrupt: treated as not set
    }
    cache.set(key, value);
    return value;
  };
  const write = (key: string, value: unknown) => {
    cache.set(key, value);
    try {
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, JSON.stringify(value));
    } catch {
      // storage unavailable: the change lasts for this visit
    }
    version++;
    listeners.forEach((listener) => listener());
  };

  const hasOwn = (projectId: string): boolean => read(KEYS.project(projectId)) !== null;
  const layoutOf = (projectId: string): Layout => parseLayout(read(hasOwn(projectId) ? KEYS.project(projectId) : KEYS.global), form());
  /** Another kind of device's layout for this project, as that device would see it. Reading only. */
  const layoutFor = (projectId: string, other: Form): Layout => {
    const keys = studioKeys(other);
    return parseLayout(read(read(keys.project(projectId)) !== null ? keys.project(projectId) : keys.global), other);
  };
  const sessionOf = (projectId: string): Session => parseSession(read(KEYS.session(projectId)));
  const saveLayout = (projectId: string, layout: Layout) => write(hasOwn(projectId) ? KEYS.project(projectId) : KEYS.global, layout);

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    version: () => version,
    /** Forgets what was read, so the next read comes from storage again (another tab changed it). */
    refresh() {
      cache.clear();
      version++;
      listeners.forEach((listener) => listener());
    },

    layout: layoutOf,
    layoutFor,
    /** The kind of device whose layouts are being read and written. */
    form,
    /** Replaces this kind of device's layout with a copy of another's. Only ever done because the author asked. */
    copyFrom(projectId: string, other: Form) {
      saveLayout(projectId, parseLayout(layoutFor(projectId, other), form()));
    },
    session: sessionOf,
    /** Whether this project has a layout of its own rather than the author's global one. */
    hasOwn,
    shortcuts: (): Record<ActionId, string> => parseShortcuts(read(KEYS.shortcuts) ?? DEFAULT_SHORTCUTS),

    setMode(projectId: string, next: Mode) {
      write(KEYS.session(projectId), { ...sessionOf(projectId), mode: next });
    },
    updateMode(projectId: string, target: Mode, changes: Partial<ModeLayout>) {
      const layout = layoutOf(projectId);
      saveLayout(projectId, parseLayout({ ...layout, [target]: { ...layout[target], ...changes } }, form()));
    },
    updateDock(projectId: string, target: Mode, side: Slot, changes: Partial<Dock>) {
      const layout = layoutOf(projectId);
      saveLayout(projectId, parseLayout({ ...layout, [target]: { ...layout[target], [side]: { ...layout[target][side], ...changes } } }, form()));
    },
    /** Puts the left panel on the right and the right on the left. */
    swapDocks(projectId: string, target: Mode, host: Host) {
      const layout = layoutOf(projectId);
      const [a, b] = [slotOf(host, 'left'), slotOf(host, 'right')];
      // "Standard" means something different on each side, so the left one is named for what it is before it moves.
      const moved = { ...layout[target][a], kind: layout[target][a].kind === 'auto' ? (host === 'writing' ? 'chapters' : 'nav') : layout[target][a].kind } as Dock;
      saveLayout(projectId, { ...layout, [target]: { ...layout[target], [a]: layout[target][b], [b]: moved } });
    },
    applyPreset(projectId: string, presetId: string): Preset | null {
      const preset = presetId === 'standard' ? { id: 'standard', name: 'Standard', description: '', start: 'drafting' as Mode, layout: standardLayout(form()) } : PRESETS.find((p) => p.id === presetId);
      if (!preset) return null;
      saveLayout(projectId, parseLayout(preset.layout, form()));
      write(KEYS.session(projectId), { ...sessionOf(projectId), mode: preset.start });
      return preset;
    },
    /** Gives this project a layout of its own (starting from the current one), or returns it to the global layout. */
    setScope(projectId: string, scope: 'project' | 'global') {
      if (scope === 'project' && !hasOwn(projectId)) write(KEYS.project(projectId), layoutOf(projectId));
      if (scope === 'global' && hasOwn(projectId)) write(KEYS.project(projectId), null);
    },
    /** The layout and shortcuts as a file's worth of JSON. */
    exportConfig(projectId: string): string {
      return JSON.stringify({ format: EXPORT_FORMAT, version: 1, layout: layoutOf(projectId), shortcuts: parseShortcuts(read(KEYS.shortcuts) ?? DEFAULT_SHORTCUTS) }, null, 2);
    },
    /** Loads a layout (and shortcuts, when the file has them) saved with `exportConfig`. Throws when the file is something else. */
    importConfig(projectId: string, json: string) {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(json) as Record<string, unknown>;
      } catch {
        throw new Error('That file is not a workspace layout.');
      }
      if (!data || data.format !== EXPORT_FORMAT || !data.layout) throw new Error('That file is not a workspace layout.');
      saveLayout(projectId, parseLayout(data.layout, form()));
      if (data.shortcuts) write(KEYS.shortcuts, parseShortcuts(data.shortcuts));
    },
    setShortcut(action: ActionId, combo: string) {
      write(KEYS.shortcuts, rebind(parseShortcuts(read(KEYS.shortcuts) ?? DEFAULT_SHORTCUTS), action, combo));
    },
    resetShortcuts() {
      write(KEYS.shortcuts, null);
    },
  };
}

export type StudioStore = ReturnType<typeof createStudioStore>;

const memory = new Map<string, string>();
const safeStorage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = {
  getItem: (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return memory.get(key) ?? null;
    }
  },
  setItem: (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      memory.set(key, value);
    }
  },
  removeItem: (key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      memory.delete(key);
    }
  },
};

/** The app's one store. */
export const studio = createStudioStore(safeStorage, currentForm);
// A rotated tablet or a resized window may now be a different kind of device, with its own layout to show.
let shownForm = currentForm();
device.subscribe(() => {
  if (currentForm() === shownForm) return;
  shownForm = currentForm();
  studio.refresh();
});
if (typeof window !== 'undefined') window.addEventListener('storage', (e) => e.key?.startsWith('novel-builder:studio') && studio.refresh());

/** A project's workspace: its active mode, that mode's layout, and everything needed to change them. */
export function useStudio(projectId: string) {
  useSyncExternalStore(studio.subscribe, studio.version);
  const layout = studio.layout(projectId);
  const session = studio.session(projectId);
  return { mode: session.mode, session, layout, current: layout[session.mode], own: studio.hasOwn(projectId), shortcuts: studio.shortcuts() };
}

/** Where a workspace's centre lives, as a path under the project. */
export const centerPath = (center: Center): string => (center === 'overview' ? '' : center);
