import { useSyncExternalStore } from 'react';
import { currentForm, device, type Form } from '@/modules/platform/device';

export const THEMES = ['light', 'sepia', 'dark', 'focus'] as const;
export const FONTS = ['serif', 'sans', 'mono'] as const;
export const WIDTHS = ['narrow', 'medium', 'wide', 'full'] as const;
export const PANEL_TABS = ['notes', 'reference', 'history', 'codex'] as const;

export interface WritingPrefs {
  theme: (typeof THEMES)[number];
  font: (typeof FONTS)[number];
  fontSize: number;
  lineHeight: number;
  /** Space between paragraphs, in lines of text. */
  paragraphSpacing: number;
  width: (typeof WIDTHS)[number];
  focus: boolean;
  navOpen: boolean;
  panelOpen: boolean;
  panelTab: (typeof PANEL_TABS)[number];
  /** Underline unlinked codex names in the text as link suggestions. Off unless the author turns it on. */
  suggestLinks: boolean;
}

export const FONT_SIZE = { min: 14, max: 28, step: 1 };
export const LINE_HEIGHT = { min: 1.2, max: 2.4, step: 0.1 };
export const PARAGRAPH_SPACING = { min: 0, max: 2, step: 0.1 };

/** Text size, page width and focus mode suit a screen, so each kind of device keeps its own. The desktop's key is the one the app has always used. */
export const prefsKey = (form: Form): string => (form === 'desktop' ? 'novel-builder:writing-prefs' : `novel-builder:writing-prefs:${form}`);
const key = () => prefsKey(currentForm());

function defaults(): WritingPrefs {
  const dark = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
  if (currentForm() === 'phone') return { theme: dark ? 'dark' : 'light', font: 'serif', fontSize: 17, lineHeight: 1.6, paragraphSpacing: 0, width: 'full', focus: false, navOpen: false, panelOpen: false, panelTab: 'notes', suggestLinks: false };
  return { theme: dark ? 'dark' : 'light', font: 'serif', fontSize: 18, lineHeight: 1.7, paragraphSpacing: 0, width: 'medium', focus: false, navOpen: true, panelOpen: false, panelTab: 'notes', suggestLinks: false };
}

const oneOf = <T extends string>(options: readonly T[], value: unknown, fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback;
const clamp = (value: unknown, { min, max }: { min: number; max: number }, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
const bool = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback);

/** Reads stored preferences defensively: anything invalid falls back to its default. */
export function parsePrefs(raw: string | null, base: WritingPrefs = defaults()): WritingPrefs {
  let stored: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object') stored = parsed as Record<string, unknown>;
  } catch {
    // corrupt value: use defaults
  }
  return {
    theme: oneOf(THEMES, stored.theme, base.theme),
    font: oneOf(FONTS, stored.font, base.font),
    fontSize: clamp(stored.fontSize, FONT_SIZE, base.fontSize),
    lineHeight: clamp(stored.lineHeight, LINE_HEIGHT, base.lineHeight),
    paragraphSpacing: clamp(stored.paragraphSpacing, PARAGRAPH_SPACING, base.paragraphSpacing),
    width: oneOf(WIDTHS, stored.width, base.width),
    focus: bool(stored.focus, base.focus),
    navOpen: bool(stored.navOpen, base.navOpen),
    panelOpen: bool(stored.panelOpen, base.panelOpen),
    panelTab: oneOf(PANEL_TABS, stored.panelTab, base.panelTab),
    suggestLinks: bool(stored.suggestLinks, base.suggestLinks),
  };
}

function read(): WritingPrefs {
  try {
    return parsePrefs(localStorage.getItem(key()));
  } catch {
    return defaults();
  }
}

let current: WritingPrefs | null = null;
const listeners = new Set<() => void>();
const snapshot = () => (current ??= read());

function subscribe(listener: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key !== key()) return;
    current = read();
    listener();
  };
  listeners.add(listener);
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function setPrefs(changes: Partial<WritingPrefs>): void {
  current = { ...snapshot(), ...changes };
  try {
    localStorage.setItem(key(), JSON.stringify(current));
  } catch {
    // storage unavailable: keep the change for this session only
  }
  listeners.forEach((listener) => listener());
}

/** Reads the preferences from storage again, after something outside the app's own controls changed them (sync). */
export function reloadPrefs(): void {
  current = read();
  listeners.forEach((listener) => listener());
}

let prefsForm = currentForm();
device.subscribe(() => {
  if (currentForm() === prefsForm) return;
  prefsForm = currentForm();
  reloadPrefs();
});

/** The preferences as they are right now, for code that is not a component. */
export const getPrefs = (): WritingPrefs => snapshot();

/** Writing preferences belong to the writer, not to a project, so they are shared by every workspace. */
export const usePrefs = (): WritingPrefs => useSyncExternalStore(subscribe, snapshot);

const lastChapterKey = (projectId: string) => `novel-builder:last-chapter:${projectId}`;

export function getLastChapter(projectId: string): string | null {
  try {
    return localStorage.getItem(lastChapterKey(projectId));
  } catch {
    return null;
  }
}

export function setLastChapter(projectId: string, chapterId: string): void {
  try {
    localStorage.setItem(lastChapterKey(projectId), chapterId);
  } catch {
    // not essential
  }
}
