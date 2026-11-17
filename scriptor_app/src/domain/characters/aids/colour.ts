// Colours as Flutter (3.38) works them out, for the writing aids that draw: a colour's four channels as floats from 0
// to 1, `Color.lerp` (each channel straight between the two, clamped), `withValues(alpha:)`, the luminance and the
// brightness Material estimates from it, and the 8-bit hex a channel is drawn at ((x × 255).round()). And the theme's
// `NovelArt.bound`: the ground, ink and frame a portrait is drawn with for one colour. Pure TypeScript.

/** A colour, each channel 0 to 1. */
export type Rgba = { readonly r: number; readonly g: number; readonly b: number; readonly a: number };

/** `#rrggbb` or `#rrggbbaa` (the alpha last, as CSS and react-native-svg read it). */
export function rgbaOf(hex: string): Rgba {
  const h = hex.replace(/^#/, '');
  const n = (i: number) => parseInt(h.substring(i, i + 2), 16) / 255;
  return { r: n(0), g: n(2), b: n(4), a: h.length >= 8 ? n(6) : 1 };
}

/** Flutter's `Color(0xAARRGGBB)`. */
export function argb(value: number): Rgba {
  return {
    a: ((value >>> 24) & 0xff) / 255,
    r: ((value >>> 16) & 0xff) / 255,
    g: ((value >>> 8) & 0xff) / 255,
    b: (value & 0xff) / 255,
  };
}

export const white = argb(0xffffffff);
export const black = argb(0xff000000);

const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1);

/** Flutter's `Color.lerp(x, y, t)`. */
export function lerpColour(x: Rgba, y: Rgba, t: number): Rgba {
  const l = (a: number, b: number) => clamp01(a * (1 - t) + b * t);
  return { a: l(x.a, y.a), r: l(x.r, y.r), g: l(x.g, y.g), b: l(x.b, y.b) };
}

/** `colour.withValues(alpha: a)`. */
export function withAlpha(colour: Rgba, a: number): Rgba {
  return { ...colour, a };
}

const toByte = (x: number) => Math.min(Math.max(Math.round(x * 255), 0), 255);
const hex2 = (x: number) => toByte(x).toString(16).padStart(2, '0');

/** The colour as it is drawn: `#rrggbb`, or `#rrggbbaa` when it is not opaque. */
export function cssOf(c: Rgba): string {
  const rgb = `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
  return toByte(c.a) === 255 ? rgb : `${rgb}${hex2(c.a)}`;
}

/** Flutter's `Color.computeLuminance()`. */
export function luminanceOf(c: Rgba): number {
  const lin = (x: number) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

/** Material's `ThemeData.estimateBrightnessForColor`: whether light text or dark sits on it ('dark': light ink). */
export function brightnessOf(c: Rgba): 'light' | 'dark' {
  const l = luminanceOf(c);
  return (l + 0.05) * (l + 0.05) > 0.15 ? 'light' : 'dark';
}

/** What a portrait, a jacket or a volume is drawn with, for one colour (`BoundLook`). */
export type BoundLook = { ground: [Rgba, Rgba]; ink: Rgba; frame: Rgba; motif: Rgba; band: Rgba | null };

/** System Monolith's colours (`MonolithTokens`) that the bound look uses. */
export const monolith = {
  textPrimary: argb(0xfff8fafc),
  accentPrimary: argb(0xfff3b63a),
  accentSecondary: argb(0xff38bdf8),
  /** The dark ground of the system style's jackets and spines, top to foot. */
  ground: [argb(0xff171b27), argb(0xff07080b)] as const,
};

/** `NovelArt.bound`: in the system style (System Monolith, Scriptor's look, the default) a dark ground (with `tinted`,
 * a little of `colour` at its top), light ink, gold frame; in the bound style (the book themes) the ground is the
 * colour itself, lightened at its top by `lift` and darkened at its foot by `sink`, the ink dark or light to suit. */
export function boundLook(
  colour: Rgba,
  options: { lift?: number; sink?: number; tinted?: boolean; system?: boolean } = {},
): BoundLook {
  const lift = options.lift ?? 0.08;
  const sink = options.sink ?? 0.35;
  if (options.system ?? true) {
    return {
      ground: options.tinted ? [lerpColour(monolith.ground[0], colour, 0.3), monolith.ground[1]] : [...monolith.ground],
      ink: monolith.textPrimary,
      frame: monolith.accentPrimary,
      motif: monolith.accentSecondary,
      band: colour,
    };
  }
  const ink = brightnessOf(colour) === 'dark' ? argb(0xfffff8ec) : argb(0xff1b140e);
  return {
    ground: [lerpColour(colour, white, lift), lerpColour(colour, black, sink)],
    ink,
    frame: withAlpha(ink, 0.55),
    motif: ink,
    band: null,
  };
}
