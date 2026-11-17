// How the page looks while writing (FEATURES.md #97): font, size, spacing, width, page colour, and the display-only
// touches (set like a book). Only how text is shown: nothing here changes the stored text. A port of
// flutter_app/lib/features/write/writing_prefs.dart, with the same names, ranges and stored keys; kept per kind of
// device (a phone's comfortable size is not a tablet's).
//
// Scriptor's own choices: the fonts are the app's bundled ones (Serif is Merriweather, Sans is Outfit, Mono is
// JetBrains Mono), "As the app" is the System Monolith page, and paragraphs have a little space between them by default.

import { isMap } from './json';

export const writingFonts = [
  { key: 'serif', label: 'Serif' },
  { key: 'sans', label: 'Sans' },
  { key: 'mono', label: 'Mono' },
] as const;
export type WritingFont = (typeof writingFonts)[number]['key'];

export const writingWidths = [
  { key: 'narrow', label: 'Narrow', maxWidth: 560 },
  { key: 'medium', label: 'Medium', maxWidth: 720 },
  { key: 'wide', label: 'Wide', maxWidth: 920 },
  { key: 'full', label: 'Full', maxWidth: null },
] as const;
export type WritingWidth = (typeof writingWidths)[number]['key'];

export const writingPages = [
  { key: 'app', label: 'As the app', background: '#13161F', text: '#F8FAFC', muted: '#94A3B8' },
  { key: 'light', label: 'Light', background: '#FFFDF9', text: '#25211C', muted: '#6F675C' },
  { key: 'sepia', label: 'Sepia', background: '#F4ECD8', text: '#4A3A28', muted: '#6E5B43' },
  { key: 'dark', label: 'Dark', background: '#191714', text: '#ECE7DE', muted: '#A0978A' },
] as const;
export type WritingPage = (typeof writingPages)[number]['key'];

export const fontSizeRange = { min: 14, max: 28, step: 1 };
export const lineHeightRange = { min: 1.2, max: 2.4, step: 0.1 };
/** Space between paragraphs, in lines of text. */
export const paragraphSpacingRange = { min: 0, max: 2, step: 0.1 };

export type DeviceForm = 'phone' | 'tablet';

export type WritingPrefs = {
  font: WritingFont;
  fontSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  width: WritingWidth;
  page: WritingPage;
  /** A raised first letter and small capitals, and ornamental scene breaks. Display only. */
  setLikeABook: boolean;
};

export function defaultWritingPrefs(form: DeviceForm): WritingPrefs {
  return form === 'phone'
    ? { font: 'serif', fontSize: 17, lineHeight: 1.6, paragraphSpacing: 0.5, width: 'full', page: 'app', setLikeABook: true }
    : { font: 'serif', fontSize: 18, lineHeight: 1.7, paragraphSpacing: 0.5, width: 'medium', page: 'app', setLikeABook: true };
}

/** The setting each kind of device keeps its preferences under (the Flutter app's keys). */
export function writingPrefsKey(form: DeviceForm): string {
  return `writing.prefs.${form}`;
}

/** Reads stored preferences defensively: anything missing, unknown or out of range falls back to its default. */
export function readWritingPrefs(json: unknown, form: DeviceForm): WritingPrefs {
  const base = defaultWritingPrefs(form);
  const m = isMap(json) ? json : {};
  const clamp = (v: unknown, r: { min: number; max: number }, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) && v >= r.min && v <= r.max ? v : fallback;
  const one = <K extends string>(keys: readonly { key: K }[], v: unknown, fallback: K): K =>
    keys.some((k) => k.key === v) ? (v as K) : fallback;
  return {
    font: one(writingFonts, m['font'], base.font),
    fontSize: clamp(m['fontSize'], fontSizeRange, base.fontSize),
    lineHeight: clamp(m['lineHeight'], lineHeightRange, base.lineHeight),
    paragraphSpacing: clamp(m['paragraphSpacing'], paragraphSpacingRange, base.paragraphSpacing),
    width: one(writingWidths, m['width'], base.width),
    page: one(writingPages, m['page'], base.page),
    setLikeABook: typeof m['bookSetting'] === 'boolean' ? m['bookSetting'] : base.setLikeABook,
  };
}

export function writingPrefsToJson(p: WritingPrefs): Record<string, unknown> {
  return {
    font: p.font,
    fontSize: p.fontSize,
    lineHeight: p.lineHeight,
    paragraphSpacing: p.paragraphSpacing,
    width: p.width,
    page: p.page,
    bookSetting: p.setLikeABook,
  };
}

export function pageColours(page: WritingPage) {
  return writingPages.find((p) => p.key === page)!;
}

export function maxWidthOf(width: WritingWidth): number | null {
  return writingWidths.find((w) => w.key === width)!.maxWidth;
}
