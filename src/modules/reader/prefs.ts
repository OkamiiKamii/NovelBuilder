import { useSyncExternalStore } from 'react';
import { FORMATS, type Format } from './book';

export const FONTS = {
  book: { label: 'Book serif', stack: "'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif" },
  garamond: { label: 'Garamond', stack: "'EB Garamond', 'Adobe Garamond Pro', Garamond, 'Times New Roman', serif" },
  charter: { label: 'Charter', stack: "Charter, 'Bitstream Charter', Cambria, Georgia, serif" },
  georgia: { label: 'Georgia', stack: "Georgia, 'Times New Roman', serif" },
  sans: { label: 'Clean sans', stack: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif" },
  humanist: { label: 'Humanist sans', stack: "Optima, 'Gill Sans', 'Trebuchet MS', Verdana, sans-serif" },
} as const;
export type FontKey = keyof typeof FONTS;

export const SCHEMES = {
  white: { label: 'Clean white', bg: '#ffffff', text: '#1b1b1b' },
  sepia: { label: 'Sepia', bg: '#f4ecd8', text: '#3b2f20' },
  dark: { label: 'Dark / OLED', bg: '#000000', text: '#d6d6d6' },
  custom: { label: 'Custom contrast', bg: '', text: '' },
} as const;
export type SchemeKey = keyof typeof SCHEMES;

export const DEVICES = { phone: { label: 'Phone', width: 360, height: 680 }, ereader: { label: 'E-reader', width: 500, height: 700 }, tablet: { label: 'Tablet', width: 700, height: 920 } } as const;
export type DeviceKey = keyof typeof DEVICES;

export const RANGES = { size: { min: 13, max: 28, step: 1 }, leading: { min: 1.2, max: 2.2, step: 0.05 }, measure: { min: 36, max: 90, step: 2 }, indent: { min: 0, max: 3, step: 0.25 }, spacing: { min: 0, max: 2, step: 0.1 } };

export interface ReaderPrefs {
  format: Format;
  /** Turn pages, or scroll one long column. A web serial always scrolls. */
  flow: 'paged' | 'scroll';
  font: FontKey;
  /** In pixels. */
  size: number;
  leading: number;
  /** The longest a line may be, in characters. */
  measure: number;
  /** `auto` follows the format: indented like print for a novel and an ebook, spaced apart for the web. */
  paragraphs: 'auto' | 'indent' | 'spaced';
  /** First-line indent, in ems. */
  indent: number;
  /** Space between paragraphs when they are spaced apart, in lines. */
  spacing: number;
  justify: boolean;
  scheme: SchemeKey;
  customBg: string;
  customText: string;
  device: DeviceKey;
}

export const defaultPrefs = (): ReaderPrefs => ({ format: 'novel', flow: 'paged', font: 'book', size: 18, leading: 1.55, measure: 66, paragraphs: 'auto', indent: 1.5, spacing: 0.8, justify: true, scheme: 'white', customBg: '#fdf6e3', customText: '#073642', device: 'ereader' });

const oneOf = <T extends string>(options: readonly T[], value: unknown, fallback: T): T => (options.includes(value as T) ? (value as T) : fallback);
const within = (value: unknown, { min, max }: { min: number; max: number }, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback);
const colour = (value: unknown, fallback: string): string => (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback);

/** Reads stored preferences defensively: anything missing or invalid falls back to its default. */
export function parsePrefs(raw: unknown): ReaderPrefs {
  const given = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const base = defaultPrefs();
  return {
    format: oneOf(FORMATS, given.format, base.format), flow: oneOf(['paged', 'scroll'] as const, given.flow, base.flow), font: oneOf(Object.keys(FONTS) as FontKey[], given.font, base.font),
    size: within(given.size, RANGES.size, base.size), leading: within(given.leading, RANGES.leading, base.leading), measure: within(given.measure, RANGES.measure, base.measure),
    paragraphs: oneOf(['auto', 'indent', 'spaced'] as const, given.paragraphs, base.paragraphs), indent: within(given.indent, RANGES.indent, base.indent), spacing: within(given.spacing, RANGES.spacing, base.spacing),
    justify: typeof given.justify === 'boolean' ? given.justify : base.justify, scheme: oneOf(Object.keys(SCHEMES) as SchemeKey[], given.scheme, base.scheme),
    customBg: colour(given.customBg, base.customBg), customText: colour(given.customText, base.customText), device: oneOf(Object.keys(DEVICES) as DeviceKey[], given.device, base.device),
  };
}

/** What the reader actually draws with, once "auto" and the format have been worked out. */
export function resolve(prefs: ReaderPrefs): { flow: 'paged' | 'scroll'; indented: boolean; justify: boolean; bg: string; text: string } {
  const serial = prefs.format === 'serial';
  const indented = prefs.paragraphs === 'auto' ? !serial : prefs.paragraphs === 'indent';
  const scheme = prefs.scheme === 'custom' ? { bg: prefs.customBg, text: prefs.customText } : SCHEMES[prefs.scheme];
  return { flow: serial ? 'scroll' : prefs.flow, indented, justify: prefs.justify && !serial, bg: scheme.bg, text: scheme.text };
}

const channel = (hex: string, at: number): number => {
  const value = parseInt(hex.slice(at, at + 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string): number => 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
/** The contrast between two colours as WCAG measures it, from 1 (none) to 21 (black on white). */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return Math.round(((x + 0.05) / (y + 0.05)) * 10) / 10;
}
export const contrastVerdict = (ratio: number): string => (ratio >= 7 ? 'comfortable for long reading' : ratio >= 4.5 ? 'readable' : 'too faint to read comfortably');

const KEY = 'novel-builder:reader';
/** The reader's look belongs to the person reading on this device. It is kept here and is not part of any project. */
export function createPrefsStore(storage: Pick<Storage, 'getItem' | 'setItem'> | null) {
  let current: ReaderPrefs | null = null;
  const listeners = new Set<() => void>();
  const read = (): ReaderPrefs => {
    try {
      return parsePrefs(JSON.parse(storage?.getItem(KEY) ?? 'null'));
    } catch {
      return defaultPrefs();
    }
  };
  return {
    get: (): ReaderPrefs => (current ??= read()),
    set(changes: Partial<ReaderPrefs>) {
      current = parsePrefs({ ...(current ?? read()), ...changes });
      try {
        storage?.setItem(KEY, JSON.stringify(current));
      } catch {
        // kept for this visit only
      }
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
const local = (): Storage | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
};
export const readerPrefs = createPrefsStore(local());
export const useReaderPrefs = (): ReaderPrefs => useSyncExternalStore(readerPrefs.subscribe, readerPrefs.get);

/** Where someone had got to in a book, on this device. */
export interface Bookmark {
  sectionId: string;
  fraction: number;
  /** The furthest they have read, as a share of the story. */
  furthest: number;
}
const markKey = (projectId: string) => `novel-builder:reader:at:${projectId}`;
export function readBookmark(projectId: string): Bookmark | null {
  try {
    const raw = JSON.parse(local()?.getItem(markKey(projectId)) ?? 'null') as Partial<Bookmark> | null;
    return raw && typeof raw.sectionId === 'string' ? { sectionId: raw.sectionId, fraction: Number(raw.fraction) || 0, furthest: Number(raw.furthest) || 0 } : null;
  } catch {
    return null;
  }
}
export function writeBookmark(projectId: string, bookmark: Bookmark): void {
  try {
    local()?.setItem(markKey(projectId), JSON.stringify(bookmark));
  } catch {
    // not essential
  }
}
