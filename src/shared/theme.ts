import { useSyncExternalStore } from 'react';

/** The app's colours: follow the device, or always light (parchment) or always dark (midnight). Kept on this device. */
export const THEMES = ['auto', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_LABELS: Record<Theme, string> = { auto: 'Match this device', light: 'Light (parchment)', dark: 'Dark (midnight)' };

const KEY = 'novel-builder:theme';
const listeners = new Set<() => void>();
const read = (): Theme => {
  try {
    const stored = localStorage.getItem(KEY);
    return THEMES.includes(stored as Theme) ? (stored as Theme) : 'auto';
  } catch {
    return 'auto';
  }
};
let current: Theme | null = null;
export const getTheme = (): Theme => (current ??= read());

function apply(theme: Theme): void {
  if (typeof document === 'undefined') return;
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

export function setTheme(theme: Theme): void {
  current = theme;
  try {
    if (theme === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // kept for this visit only
  }
  apply(theme);
  listeners.forEach((listener) => listener());
}
/** Puts the remembered choice on the page. Called once when the app starts. */
export const startTheme = (): void => apply(getTheme());
export const useTheme = (): Theme =>
  useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, getTheme);
