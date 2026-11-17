// How the reader looks: belongs to the person reading on this device, never to the novel. The same choices, ranges and
// defaults as the original app. Only how text is shown: nothing here changes what is stored. Pure TypeScript. A port of
// flutter_app/lib/shared/domain/reader/reader_prefs.dart.

import { type JsonMap, jsonEquals, mapOrNull, numOrNull } from '../json';
import { dartRound } from '../desk/format';
import { type BookFormat, bookFormats } from './book';

export type ReaderFlow = 'paged' | 'scroll';
export const readerFlows: readonly ReaderFlow[] = ['paged', 'scroll'];

export type ReaderFont = 'book' | 'garamond' | 'charter' | 'georgia' | 'sans' | 'humanist';
export const readerFonts: readonly { key: ReaderFont; label: string }[] = [
  { key: 'book', label: 'Book serif' },
  { key: 'garamond', label: 'Garamond' },
  { key: 'charter', label: 'Charter' },
  { key: 'georgia', label: 'Georgia' },
  { key: 'sans', label: 'Clean sans' },
  { key: 'humanist', label: 'Humanist sans' },
];

export type ParagraphStyle = 'auto' | 'indent' | 'spaced';
export const paragraphStyles: readonly { key: ParagraphStyle; label: string }[] = [
  { key: 'auto', label: 'As the format prints them' },
  { key: 'indent', label: 'Indented' },
  { key: 'spaced', label: 'Spaced apart' },
];

export type ReaderScheme = 'white' | 'sepia' | 'dark' | 'custom';
/** The colours are ARGB, as the Flutter app holds them (0 for custom, whose colours are the reader's own). */
export const readerSchemes: readonly { key: ReaderScheme; label: string; background: number; text: number }[] = [
  { key: 'white', label: 'Clean white', background: 0xffffffff, text: 0xff1b1b1b },
  { key: 'sepia', label: 'Sepia', background: 0xfff4ecd8, text: 0xff3b2f20 },
  { key: 'dark', label: 'Dark / OLED', background: 0xff000000, text: 0xffd6d6d6 },
  { key: 'custom', label: 'Custom contrast', background: 0, text: 0 },
];

export type ReaderDevice = 'phone' | 'ereader' | 'tablet';
export const readerDevices: readonly { key: ReaderDevice; label: string; width: number; height: number }[] = [
  { key: 'phone', label: 'Phone', width: 360, height: 680 },
  { key: 'ereader', label: 'E-reader', width: 500, height: 700 },
  { key: 'tablet', label: 'Tablet', width: 700, height: 920 },
];

export type ReaderRange = { readonly min: number; readonly max: number; readonly step: number };

export const readerSizeRange: ReaderRange = { min: 13, max: 28, step: 1 };
export const readerLeadingRange: ReaderRange = { min: 1.2, max: 2.2, step: 0.05 };
/** The longest a line may be, in characters. */
export const readerMeasureRange: ReaderRange = { min: 36, max: 90, step: 2 };
/** First-line indent, in ems. */
export const readerIndentRange: ReaderRange = { min: 0, max: 3, step: 0.25 };
/** Space between paragraphs when they are spaced apart, in lines. */
export const readerSpacingRange: ReaderRange = { min: 0, max: 2, step: 0.1 };

export type ReaderPrefs = {
  readonly format: BookFormat;
  /** Turn pages, or scroll one long column. A web serial always scrolls. */
  readonly flow: ReaderFlow;
  readonly font: ReaderFont;
  /** In logical pixels. */
  readonly size: number;
  readonly leading: number;
  readonly measure: number;
  readonly paragraphs: ParagraphStyle;
  readonly indent: number;
  readonly spacing: number;
  readonly justify: boolean;
  readonly scheme: ReaderScheme;
  readonly customBg: string;
  readonly customText: string;
  readonly device: ReaderDevice;
};

export const defaultReaderPrefs: ReaderPrefs = Object.freeze({
  format: 'novel',
  flow: 'paged',
  font: 'book',
  size: 18,
  leading: 1.55,
  measure: 66,
  paragraphs: 'auto',
  indent: 1.5,
  spacing: 0.8,
  justify: true,
  scheme: 'white',
  customBg: '#fdf6e3',
  customText: '#073642',
  device: 'ereader',
});

const colourPattern = /^#[0-9a-f]{6}$/i;

/** Reads stored preferences defensively: anything missing or invalid falls back to its default. */
export function readerPrefsFromJson(json: unknown): ReaderPrefs {
  const base = defaultReaderPrefs;
  const m = mapOrNull(json) ?? {};
  const one = <T extends string>(values: readonly T[], v: unknown, fallback: T): T =>
    values.find((x) => x === v) ?? fallback;
  const within = (v: unknown, r: ReaderRange, fallback: number): number => {
    const n = numOrNull(v);
    return n === null ? fallback : Math.min(Math.max(n, r.min), r.max);
  };
  const colour = (v: unknown, fallback: string): string =>
    typeof v === 'string' && colourPattern.test(v) ? v.toLowerCase() : fallback;
  return Object.freeze({
    format: one(
      bookFormats.map((f) => f.key),
      m['format'],
      base.format,
    ),
    flow: one(readerFlows, m['flow'], base.flow),
    font: one(
      readerFonts.map((f) => f.key),
      m['font'],
      base.font,
    ),
    size: within(m['size'], readerSizeRange, base.size),
    leading: within(m['leading'], readerLeadingRange, base.leading),
    measure: within(m['measure'], readerMeasureRange, base.measure),
    paragraphs: one(
      paragraphStyles.map((p) => p.key),
      m['paragraphs'],
      base.paragraphs,
    ),
    indent: within(m['indent'], readerIndentRange, base.indent),
    spacing: within(m['spacing'], readerSpacingRange, base.spacing),
    justify: typeof m['justify'] === 'boolean' ? m['justify'] : base.justify,
    scheme: one(
      readerSchemes.map((s) => s.key),
      m['scheme'],
      base.scheme,
    ),
    customBg: colour(m['customBg'], base.customBg),
    customText: colour(m['customText'], base.customText),
    device: one(
      readerDevices.map((d) => d.key),
      m['device'],
      base.device,
    ),
  });
}

export function readerPrefsToJson(prefs: ReaderPrefs): JsonMap {
  return {
    format: prefs.format,
    flow: prefs.flow,
    font: prefs.font,
    size: prefs.size,
    leading: prefs.leading,
    measure: prefs.measure,
    paragraphs: prefs.paragraphs,
    indent: prefs.indent,
    spacing: prefs.spacing,
    justify: prefs.justify,
    scheme: prefs.scheme,
    customBg: prefs.customBg,
    customText: prefs.customText,
    device: prefs.device,
  };
}

/** The preferences with some changed, read back as stored ones are: out of range is clamped, an invalid colour kept as
 * it was (the Flutter app's `copyWith`). */
export function copyReaderPrefs(prefs: ReaderPrefs, changes: Partial<ReaderPrefs>): ReaderPrefs {
  const next: JsonMap = readerPrefsToJson(prefs);
  for (const [key, value] of Object.entries(changes)) if (value !== undefined && value !== null) next[key] = value;
  return readerPrefsFromJson(next);
}

export function readerPrefsEqual(a: ReaderPrefs, b: ReaderPrefs): boolean {
  return jsonEquals(readerPrefsToJson(a), readerPrefsToJson(b));
}

/** What the reader actually draws with, once "auto" and the format have been worked out. */
export type ResolvedLook = {
  readonly flow: ReaderFlow;
  readonly indented: boolean;
  readonly justify: boolean;
  /** `#rrggbb`. */
  readonly background: string;
  readonly text: string;
};

function hex(argb: number): string {
  return `#${(argb & 0xffffff).toString(16).padStart(6, '0')}`;
}

export function resolveLook(prefs: ReaderPrefs): ResolvedLook {
  const serial = prefs.format === 'serial';
  const indented = prefs.paragraphs === 'auto' ? !serial : prefs.paragraphs === 'indent';
  const custom = prefs.scheme === 'custom';
  const scheme = readerSchemes.find((s) => s.key === prefs.scheme)!;
  return {
    flow: serial ? 'scroll' : prefs.flow,
    indented,
    justify: prefs.justify && !serial,
    background: custom ? prefs.customBg : hex(scheme.background),
    text: custom ? prefs.customText : hex(scheme.text),
  };
}

function channel(hexColour: string, at: number): number {
  const value = parseInt(hexColour.substring(at, at + 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
}

function luminance(hexColour: string): number {
  return 0.2126 * channel(hexColour, 1) + 0.7152 * channel(hexColour, 3) + 0.0722 * channel(hexColour, 5);
}

/** The contrast between two `#rrggbb` colours as WCAG measures it, from 1 (none) to 21 (black on white), to one
 * decimal. */
export function contrastOf(a: string, b: string): number {
  const x = Math.max(luminance(a), luminance(b));
  const y = Math.min(luminance(a), luminance(b));
  return dartRound(((x + 0.05) / (y + 0.05)) * 10) / 10;
}

export function contrastVerdict(ratio: number): string {
  return ratio >= 7 ? 'comfortable for long reading' : ratio >= 4.5 ? 'readable' : 'too faint to read comfortably';
}

/** Where someone had got to in a book, on this device. */
export type Bookmark = {
  readonly sectionId: string;
  readonly fraction: number;
  /** The furthest they have read, as a share of the story. */
  readonly furthest: number;
};

export function bookmarkFromJson(json: unknown): Bookmark | null {
  const m = mapOrNull(json);
  if (m === null || typeof m['sectionId'] !== 'string') return null;
  const clamp01 = (n: number) => Math.min(Math.max(n, 0), 1);
  return {
    sectionId: m['sectionId'],
    fraction: clamp01(numOrNull(m['fraction']) ?? 0),
    furthest: clamp01(numOrNull(m['furthest']) ?? 0),
  };
}

export function bookmarkToJson(b: Bookmark): JsonMap {
  return { sectionId: b.sectionId, fraction: b.fraction, furthest: b.furthest };
}
