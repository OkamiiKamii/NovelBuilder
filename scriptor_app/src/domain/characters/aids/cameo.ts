// A CAMEO: a character with no picture drawn as an old silhouette portrait, a bust in an oval on their own colour,
// with the look `cameoLookOf` reads from their profile. A port of flutter_app/lib/features/characters/widgets/cameo.dart:
// what is read from the profile (`cameoLookOf`), the colour tables, and the painter (`_CameoPainter`) as a list of
// shapes in drawing order (`cameoDrawing`), every measure and colour the same, for the screen to draw with
// react-native-svg (paths are SVG path data).
//
// THE DRAWING, in order (w × h the box; the oval centred; everything from "the hood" to "the crown" clipped to it):
//   1. Unless bare: the box filled with the ground, a linear gradient from its top left to its bottom right.
//   2. The oval (bare: the whole box less 1 each side, a gradient from the ground's first colour a tenth towards the
//      ink, to its last; else 66% × 82% of the box, the ground's first colour 14% towards the ink).
//   3. A hood (cloth: the ink 62% towards the ground's foot), behind the head to the shoulders.
//   4. Hair behind the head (not bald, cropped, hooded or short): to the jaw, or long over the shoulders, flaring as it
//      falls; with curls, 7 pairs of circles down its fall.
//   5. Shoulders and neck, carved: a gradient of the ink to the ink 16% towards the ground's foot; the neck in the skin
//      when the skin is written.
//   6. Pointed ears (an elf's, a fae's), in the face's paint.
//   7. The head, an oval, in the skin (a radial gradient lit from the top left) or carved.
//   8. A braid over one shoulder: 6 ovals stepping down and out, each with a shine.
//   9. When there is anything to paint (`painted`): eyes (white, iris, pupil, a glint), brows, a nose and a mouth;
//      freckles, 5 dots each side.
//  10. A beard along the jaw, a moustache over the mouth, in the hair's colour.
//  11. Over the head: the crown of the hair and its fringe; curls round the crown, or a light along the hair.
//  12. The hood's rim over the brow; glasses; an eyepatch and its strap; a scar; a gold crown with a red stone.
//  13. Not clipped: the ring round the oval, and a finer one inside it.
// The departed (`gone`) are drawn in grey: the whole picture through `greyMatrix` (a colour matrix, as an SVG
// feColorMatrix's values).

import { DartRandom } from '../../desk/dartRandom';
import { type CharacterProfile } from '../characterRecords';
import { fieldNamed } from '../cast';
import { type Entry } from '../../records/entry';
import { dartToLowerCase, dartTrim } from '../../text/dartString';
import { type Rgba, argb, black, cssOf, lerpColour, rgbaOf, white, withAlpha } from './colour';
import { type HairCut, type Likeness, type SkinTone, likenessOf, painted } from './likeness';

/** How a character's cameo is drawn, from what is recorded of them. Nothing is guessed: what is not recorded is drawn
 * plainly. */
export type CameoHair = 'short' | 'shoulder' | 'long';
export const cameoHairs: readonly CameoHair[] = ['short', 'shoulder', 'long'];

export type CameoLook = {
  readonly hair: CameoHair;
  readonly silver: boolean;
  readonly pointedEars: boolean;
  readonly gone: boolean;
  readonly seed: number;
  readonly likeness: Likeness;
};

/** The hair a cut gives the cameo. */
export function cameoHairOf(cut: HairCut): CameoHair {
  return cut === 'long' || cut === 'braid' ? 'long' : cut === 'shoulder' ? 'shoulder' : 'short';
}

const wordIn = (text: string, words: readonly string[]) => words.some((w) => new RegExp(`\\b${w}\\b`).test(text));

/** Dart's `int.tryParse` of a run of digits: null past a 64-bit int. */
function wholeOf(digits: string): number | null {
  if (digits.length === 0) return null;
  return BigInt(digits) > 9223372036854775807n ? null : Number(digits);
}

/** From the profile: **Gender** sets the hair (a woman's falls long, a man's is cut short, anything else or nothing at
 * the shoulder), unless **Hair** says how it is worn; an **Age** of sixty or more, or one written as old or elderly,
 * turns it silver; a **Species** of elf or fae gives pointed ears; a **status** of dead, deceased or late shows them
 * in grey. And their likeness (likeness.ts): the colour of their hair, eyes and skin, curls, a beard, glasses, a scar,
 * a hood or a crown, as the Appearance fields say them. A small seed from the id keeps two alike from being the
 * same. */
export function cameoLookOf(entry: Entry, profile: CharacterProfile | null): CameoLook {
  const gender = dartToLowerCase(fieldNamed(entry, 'Gender'));
  const age = dartToLowerCase(fieldNamed(entry, 'Age'));
  const species = dartToLowerCase(fieldNamed(entry, 'Species'));
  const status = dartToLowerCase(profile?.status ?? '');
  const fields = new Map<string, string>();
  for (const f of entry.fields) fields.set(dartToLowerCase(dartTrim(f.key)), f.value);
  const likeness = likenessOf(fields);
  const hair: CameoHair =
    likeness.cut !== null
      ? cameoHairOf(likeness.cut)
      : wordIn(gender, ['female', 'woman', 'girl', 'lady', 'she', 'f'])
        ? 'long'
        : wordIn(gender, ['male', 'man', 'boy', 'he', 'm'])
          ? 'short'
          : 'shoulder';
  const years = wholeOf(/\d+/.exec(age)?.[0] ?? '');
  const silver = (years !== null && years >= 60) || wordIn(age, ['old', 'elderly', 'aged', 'ancient', 'venerable']);
  const pointedEars = wordIn(species, ['elf', 'elves', 'elven', 'fae', 'faerie', 'fairy', 'sidhe']);
  const gone = wordIn(status, ['dead', 'deceased', 'late', 'killed', 'fallen', 'departed']);
  let seed = 0;
  for (let i = 0; i < entry.id.length; i++) seed = (seed * 31 + entry.id.charCodeAt(i)) & 0x7fffffff;
  return { hair, silver, pointedEars, gone, seed, likeness };
}

// ---------------------------------------------------------------------------------------------------- the colours

/** The colours a likeness is painted in, by the family its words name. */
export const hairColours: Readonly<Record<string, string>> = {
  black: '#221d1b',
  dark: '#33261f',
  brown: '#5e3b22',
  hazel: '#6e4a26',
  red: '#a34528',
  amber: '#c08a35',
  blond: '#d9b46c',
  grey: '#8e9197',
  silver: '#c6cbd2',
  white: '#eae8e2',
  pale: '#e2d7be',
  blue: '#3f5fa6',
  green: '#3f7a4f',
  violet: '#7a4fa0',
};

export const eyeColours: Readonly<Record<string, string>> = {
  brown: '#6b4226',
  dark: '#3a2a20',
  black: '#221d1b',
  hazel: '#8c6b2d',
  amber: '#c98b26',
  blond: '#c9a04a',
  blue: '#3d7bc8',
  green: '#3d8a57',
  grey: '#7d8896',
  silver: '#aeb7c2',
  white: '#d8dde3',
  pale: '#9db3c8',
  red: '#b0352b',
  violet: '#7d55b3',
};

export const skinColours: Readonly<Record<SkinTone, string>> = {
  fair: '#f1d7c6',
  light: '#e6bd9e',
  olive: '#c79a6c',
  brown: '#99633f',
  deep: '#5c3925',
};

/** A creature's skin, by its colour's family. */
export const creatureSkins: Readonly<Record<string, string>> = {
  green: '#8db07a',
  blue: '#8fa8d2',
  grey: '#a6abb2',
  silver: '#c6cbd1',
  violet: '#a990c6',
  amber: '#d7ae6d',
  blond: '#e3c68e',
  hazel: '#b08a55',
  white: '#eceae4',
  red: '#c8765c',
  black: '#3b3836',
  pale: '#e6dccb',
};

/** The departed in grey, as in an old album: Flutter's `ColorFilter.matrix`, row by row (5 × 4). */
export const greyMatrix: readonly number[] = [
  0.33, 0.59, 0.11, 0, 0, 0.33, 0.59, 0.11, 0, 0, 0.33, 0.59, 0.11, 0, 0, 0, 0, 0, 1, 0,
];

// ---------------------------------------------------------------------------------------------------- the drawing

export type Point = { x: number; y: number };

/** How a shape is filled: a colour, or a gradient. A linear gradient runs from `from` to `to` (in the drawing's own
 * coordinates, as SVG's userSpaceOnUse), its colours evenly spaced; a radial one from `center` out to `radius`. */
export type CameoFill =
  | { kind: 'color'; color: string }
  | { kind: 'linear'; from: Point; to: Point; colors: string[] }
  | { kind: 'radial'; center: Point; radius: number; colors: string[] };

/** A stroke: its colour, width and ends ('butt', Flutter's default, or 'round'). */
export type CameoStroke = { color: string; width: number; cap: 'butt' | 'round' };

export type CameoShape =
  | { shape: 'rect'; x: number; y: number; width: number; height: number }
  | { shape: 'oval'; cx: number; cy: number; rx: number; ry: number }
  | { shape: 'circle'; cx: number; cy: number; r: number }
  | { shape: 'path'; d: string }
  | { shape: 'line'; x1: number; y1: number; x2: number; y2: number };

/** One thing drawn: what it is of the portrait (`part`), its shape, and its fill or stroke; `clipped` when it is
 * drawn inside the oval only. */
export type CameoOp = CameoShape & { part: string; fill?: CameoFill; stroke?: CameoStroke; clipped: boolean };

export type CameoDrawing = {
  width: number;
  height: number;
  /** The oval everything `clipped` is clipped to. */
  oval: { cx: number; cy: number; rx: number; ry: number };
  ops: CameoOp[];
  /** Drawn through `greyMatrix`. */
  grey: boolean;
};

/** The measures the drawing is made of, for a look in a box: what the seed chose (the shoulders, the head's width, the
 * parting's side) and what follows from them. */
export type CameoMeasures = {
  ow: number;
  oh: number;
  cx: number;
  top: number;
  shoulders: number;
  headRx: number;
  headRy: number;
  headCy: number;
  part: number;
  eyeY: number;
  eyeDx: number;
  eyeW: number;
  eyeH: number;
};

export function cameoMeasures(look: CameoLook, width: number, height: number, bare = false): CameoMeasures {
  const l = look.likeness;
  const ow = bare ? width - 2 : width * 0.66;
  const oh = bare ? height - 2 : height * 0.82;
  const top = height / 2 - oh / 2;
  const rnd = new DartRandom(look.seed);
  const build = l.broad ? 0.05 : l.slight ? -0.045 : 0.0;
  const shoulders = 0.4 + rnd.nextDouble() * 0.06 + build; // half-width, as a share of the oval's width
  const headRx = ow * (0.16 + rnd.nextDouble() * 0.015);
  const headRy = oh * 0.19;
  const headCy = top + oh * 0.4;
  const part = rnd.nextInt(2) === 0 ? 1.0 : -1.0;
  return {
    ow,
    oh,
    cx: width / 2,
    top,
    shoulders,
    headRx,
    headRy,
    headCy,
    part,
    eyeY: headCy + headRy * 0.02,
    eyeDx: headRx * 0.42,
    eyeW: headRx * 0.34,
    eyeH: headRy * 0.13,
  };
}

/** SVG path data, made as Flutter's Path is. */
class PathData {
  private readonly parts: string[] = [];
  private static n(v: number): string {
    return String(Math.round(v * 1000) / 1000);
  }
  moveTo(x: number, y: number): this {
    this.parts.push(`M${PathData.n(x)} ${PathData.n(y)}`);
    return this;
  }
  lineTo(x: number, y: number): this {
    this.parts.push(`L${PathData.n(x)} ${PathData.n(y)}`);
    return this;
  }
  quadTo(x1: number, y1: number, x: number, y: number): this {
    this.parts.push(`Q${[x1, y1, x, y].map(PathData.n).join(' ')}`);
    return this;
  }
  cubicTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): this {
    this.parts.push(`C${[x1, y1, x2, y2, x, y].map(PathData.n).join(' ')}`);
    return this;
  }
  close(): this {
    this.parts.push('Z');
    return this;
  }
  get d(): string {
    return this.parts.join(' ');
  }
}

/** The cameo of `look` in a box `width` × `height`: `ground` the two colours of the ground (light to dark), `ink`
 * the silhouette's, `frame` the ring's (the ink at half strength when not given), `bare` the oval alone, filling the
 * space, with nothing round it (for standing in a group). Colours are `#rrggbb` or `#rrggbbaa`. */
export function cameoDrawing(
  look: CameoLook,
  options: {
    width: number;
    height: number;
    ground: readonly [string, string] | readonly string[];
    ink: string;
    frame?: string | null;
    bare?: boolean;
  },
): CameoDrawing {
  const { width: w, height: h } = options;
  const bare = options.bare ?? false;
  const ground = [rgbaOf(options.ground[0]), rgbaOf(options.ground[options.ground.length - 1])] as const;
  const groundFirst = ground[0];
  const groundLast = ground[1];
  const ink = rgbaOf(options.ink);
  const frame = options.frame ? rgbaOf(options.frame) : withAlpha(ink, 0.5);
  const l = look.likeness;
  const paintedFace = painted(l);
  const ops: CameoOp[] = [];
  let clipped = false;
  const css = cssOf;
  const colour = (c: Rgba): CameoFill => ({ kind: 'color', color: css(c) });
  const add = (part: string, shape: CameoShape, paint: { fill?: CameoFill; stroke?: CameoStroke }) =>
    ops.push({ ...shape, part, ...paint, clipped });
  const ovalOf = (cx: number, cy: number, width: number, height: number): CameoShape => ({
    shape: 'oval',
    cx,
    cy,
    rx: width / 2,
    ry: height / 2,
  });
  const linear = (left: number, top: number, right: number, bottom: number, colors: Rgba[]): CameoFill => ({
    kind: 'linear',
    from: { x: left, y: top },
    to: { x: right, y: bottom },
    colors: colors.map(css),
  });

  if (!bare) add('ground', { shape: 'rect', x: 0, y: 0, width: w, height: h }, { fill: linear(0, 0, w, h, [...ground]) });

  // The oval: a paler inlay of the ground, ringed; bare, the whole space, on the ground's own colours.
  const m = cameoMeasures(look, w, h, bare);
  const { ow, oh, cx, top, shoulders, headRx, headRy, headCy, part } = m;
  const oval = { cx: w / 2, cy: h / 2, rx: ow / 2, ry: oh / 2 };
  const ovalLeft = w / 2 - ow / 2;
  const ovalRight = w / 2 + ow / 2;
  const ovalBottom = h / 2 + oh / 2;
  if (bare) {
    add('oval', { shape: 'oval', ...oval }, {
      fill: linear(ovalLeft, top, ovalRight, ovalBottom, [lerpColour(groundFirst, ink, 0.1), groundLast]),
    });
  } else {
    add('oval', { shape: 'oval', ...oval }, { fill: colour(lerpColour(groundFirst, ink, 0.14)) });
  }
  clipped = true;

  // Carved, as a cameo is: lit from the top left, a little shade below.
  const body = linear(ovalLeft, top + oh * 0.2, ovalRight, ovalBottom, [ink, lerpColour(ink, groundLast, 0.16)]);
  // The skin, when it is written: the face, the neck and the ears in it, lit the same way.
  const skinHex = l.skin !== null ? skinColours[l.skin] : l.skinFamily === null ? undefined : creatureSkins[l.skinFamily];
  const skinColour = skinHex === undefined ? null : rgbaOf(skinHex);
  const head = { cx, cy: headCy, rx: headRx, ry: headRy };
  let face: CameoFill = body;
  if (skinColour !== null) {
    // Flutter's RadialGradient(center: (-0.35, -0.4), radius: 1.1) over the head grown by 0.3 of its half-width.
    const grow = headRx * 0.3;
    const rw = headRx * 2 + grow * 2;
    const rh = headRy * 2 + grow * 2;
    face = {
      kind: 'radial',
      center: { x: cx + -0.35 * (rw / 2), y: headCy + -0.4 * (rh / 2) },
      radius: 1.1 * Math.min(rw, rh),
      colors: [css(lerpColour(skinColour, white, 0.12)), css(lerpColour(skinColour, black, 0.18))],
    };
  }
  // The hair: its colour when written; silver when they are old; else a shade into the ground, against the face.
  const hairHex = l.hair === null ? undefined : hairColours[l.hair];
  const hairInk =
    hairHex !== undefined ? rgbaOf(hairHex) : look.silver ? argb(0xffcdd2d9) : lerpColour(ink, groundLast, 0.34);
  const hair = colour(hairInk);
  const hairShine = lerpColour(hairInk, white, 0.22);
  const bald = l.cut === 'bald';
  const cropped = l.cut === 'cropped';
  // What is worn over the head: a hood, the cloth a shade into the ground.
  const cloth = colour(lerpColour(ink, groundLast, 0.62));

  // A hood: behind the head, falling to the shoulders.
  if (l.hood) {
    const hood = new PathData()
      .moveTo(cx - headRx * 1.75, top + oh * 0.78)
      .cubicTo(cx - headRx * 1.9, headCy - headRy * 0.6, cx - headRx * 1.25, headCy - headRy * 1.75, cx, headCy - headRy * 1.72)
      .cubicTo(cx + headRx * 1.25, headCy - headRy * 1.75, cx + headRx * 1.9, headCy - headRy * 0.6, cx + headRx * 1.75, top + oh * 0.78)
      .close();
    add('hood', { shape: 'path', d: hood.d }, { fill: cloth });
  }

  // Behind the head: hair that falls to the jaw, or long over the shoulders, flaring as it falls.
  if (!bald && !cropped && !l.hood && look.hair !== 'short') {
    const long = look.hair === 'long' && l.cut !== 'braid';
    const end = headCy + (long ? oh * 0.4 : headRy * 1.05);
    const flare = long ? 1.75 : 1.32;
    const back = new PathData()
      .moveTo(cx - headRx * 1.12, headCy - headRy * 0.2)
      .cubicTo(cx - headRx * 1.25, headCy + headRy * 0.6, cx - headRx * flare, end - oh * 0.08, cx - headRx * (flare - 0.1), end)
      .quadTo(cx, end + oh * (long ? 0.03 : 0.015), cx + headRx * (flare - 0.1), end)
      .cubicTo(cx + headRx * flare, end - oh * 0.08, cx + headRx * 1.25, headCy + headRy * 0.6, cx + headRx * 1.12, headCy - headRy * 0.2)
      .close();
    add('hair behind', { shape: 'path', d: back.d }, { fill: hair });
    if (l.curly) {
      // Curls along the fall of it.
      for (let i = 0; i <= 6; i++) {
        const t = i / 6;
        const y = headCy - headRy * 0.1 + (end - headCy) * t;
        const spread = headRx * (1.15 + (flare - 1.15) * t);
        for (const side of [-1.0, 1.0]) {
          add('curl', { shape: 'circle', cx: cx + side * spread, cy: y, r: headRx * 0.24 }, { fill: hair });
        }
      }
    }
  }

  // Shoulders and neck: the neck in the skin, when it is written.
  const bottom = ovalBottom + 2;
  const neckTop = headCy + headRy * 0.7;
  const shoulder = new PathData()
    .moveTo(cx - ow * shoulders, bottom)
    .quadTo(cx - ow * shoulders * 0.96, top + oh * 0.72, cx - ow * 0.13, top + oh * 0.67)
    .lineTo(cx - ow * 0.075, neckTop)
    .lineTo(cx + ow * 0.075, neckTop)
    .lineTo(cx + ow * 0.13, top + oh * 0.67)
    .quadTo(cx + ow * shoulders * 0.96, top + oh * 0.72, cx + ow * shoulders, bottom)
    .close();
  add('shoulders', { shape: 'path', d: shoulder.d }, { fill: body });
  if (skinColour !== null) {
    const neck = new PathData()
      .moveTo(cx - ow * 0.075, neckTop)
      .lineTo(cx + ow * 0.075, neckTop)
      .lineTo(cx + ow * 0.095, top + oh * 0.68)
      .quadTo(cx, top + oh * 0.73, cx - ow * 0.095, top + oh * 0.68)
      .close();
    add('neck', { shape: 'path', d: neck.d }, { fill: face });
  }

  // Pointed ears, under the head's edge.
  if (look.pointedEars) {
    for (const side of [-1.0, 1.0]) {
      const ear = new PathData()
        .moveTo(cx + side * headRx * 0.85, headCy - headRy * 0.05)
        .lineTo(cx + side * headRx * 1.55, headCy - headRy * 0.55)
        .lineTo(cx + side * headRx * 0.9, headCy + headRy * 0.25)
        .close();
      add('ear', { shape: 'path', d: ear.d }, { fill: face });
    }
  }

  // The head.
  add('head', { shape: 'oval', ...head }, { fill: face });

  // A braid over one shoulder.
  if (l.cut === 'braid' && !l.hood) {
    const side = -part;
    let y = headCy + headRy * 0.35;
    for (let i = 0; i < 6; i++) {
      const x = cx + side * (headRx * 1.0 + i * headRx * 0.06);
      add('braid', ovalOf(x, y, headRx * 0.42, headRy * 0.34), { fill: hair });
      add('braid shine', ovalOf(x - headRx * 0.06, y - headRy * 0.05, headRx * 0.16, headRy * 0.1), {
        fill: colour(hairShine),
      });
      y += headRy * 0.3;
    }
  }

  // The face, when there is something to paint: eyes of their colour (or the carving's shade), brows in the hair's,
  // a line of a nose, a mouth.
  const shade = skinColour === null ? lerpColour(ink, groundLast, 0.6) : lerpColour(skinColour, black, 0.55);
  const { eyeY, eyeDx, eyeW, eyeH } = m;
  if (paintedFace) {
    const irisHex = l.eyes === null ? undefined : eyeColours[l.eyes];
    const iris = irisHex === undefined ? shade : rgbaOf(irisHex);
    for (const side of [-1.0, 1.0]) {
      const at = { x: cx + side * eyeDx, y: eyeY };
      if (l.eyepatch && side === part) continue;
      add('eye', ovalOf(at.x, at.y, eyeW, eyeH), { fill: colour(lerpColour(skinColour ?? ink, white, 0.7)) });
      add('iris', { shape: 'circle', cx: at.x, cy: at.y, r: eyeH * 0.48 }, { fill: colour(iris) });
      add('pupil', { shape: 'circle', cx: at.x, cy: at.y, r: eyeH * 0.2 }, { fill: colour(argb(0xff15110e)) });
      add('glint', { shape: 'circle', cx: at.x - eyeH * 0.12, cy: at.y - eyeH * 0.14, r: eyeH * 0.09 }, {
        fill: colour(white),
      });
      // The brow.
      const brow = new PathData()
        .moveTo(at.x - eyeW * 0.6, at.y - eyeH * 1.25)
        .quadTo(at.x, at.y - eyeH * 1.9, at.x + eyeW * 0.6, at.y - eyeH * 1.3);
      add('brow', { shape: 'path', d: brow.d }, {
        stroke: { color: css(l.hair !== null && !bald ? hairInk : shade), width: Math.max(0.8, headRy * 0.06), cap: 'round' },
      });
    }
    const lineWidth = Math.max(0.6, headRy * 0.035);
    // The nose, a stroke and its foot; the mouth.
    const nose = new PathData()
      .moveTo(cx + part * headRx * 0.04, eyeY + eyeH * 0.6)
      .quadTo(cx - part * headRx * 0.1, headCy + headRy * 0.32, cx + part * headRx * 0.06, headCy + headRy * 0.36);
    add('nose', { shape: 'path', d: nose.d }, { stroke: { color: css(withAlpha(shade, 0.7)), width: lineWidth, cap: 'round' } });
    const mouth = new PathData()
      .moveTo(cx - headRx * 0.22, headCy + headRy * 0.56)
      .quadTo(cx, headCy + headRy * 0.64, cx + headRx * 0.22, headCy + headRy * 0.56);
    const lips = withAlpha(lerpColour(shade, argb(0xff9c3b33), skinColour === null ? 0 : 0.45), 0.85);
    add('mouth', { shape: 'path', d: mouth.d }, { stroke: { color: css(lips), width: lineWidth, cap: 'round' } });
    if (l.freckles) {
      const dot = colour(lerpColour(skinColour ?? ink, argb(0xff7a4a2a), 0.5));
      const r = new DartRandom(look.seed + 7);
      for (const side of [-1.0, 1.0]) {
        for (let i = 0; i < 5; i++) {
          const x = cx + side * (headRx * 0.32 + r.nextDouble() * headRx * 0.3);
          const y = headCy + headRy * (0.2 + r.nextDouble() * 0.18);
          add('freckle', { shape: 'circle', cx: x, cy: y, r: Math.max(0.5, headRx * 0.035) }, { fill: dot });
        }
      }
    }
  }

  // A beard along the jaw; a moustache over the mouth.
  if (l.beard) {
    const beard = new PathData()
      .moveTo(cx - headRx * 0.98, headCy + headRy * 0.05)
      .quadTo(cx - headRx * 0.95, headCy + headRy * 1.15, cx, headCy + headRy * 1.28)
      .quadTo(cx + headRx * 0.95, headCy + headRy * 1.15, cx + headRx * 0.98, headCy + headRy * 0.05)
      .quadTo(cx + headRx * 0.7, headCy + headRy * 0.6, cx + headRx * 0.32, headCy + headRy * 0.66)
      .quadTo(cx, headCy + headRy * 0.78, cx - headRx * 0.32, headCy + headRy * 0.66)
      .quadTo(cx - headRx * 0.7, headCy + headRy * 0.6, cx - headRx * 0.98, headCy + headRy * 0.05)
      .close();
    add('beard', { shape: 'path', d: beard.d }, { fill: hair });
  }
  if (l.moustache || l.beard) {
    const tache = new PathData()
      .moveTo(cx - headRx * 0.36, headCy + headRy * 0.55)
      .quadTo(cx - headRx * 0.1, headCy + headRy * 0.36, cx, headCy + headRy * 0.44)
      .quadTo(cx + headRx * 0.1, headCy + headRy * 0.36, cx + headRx * 0.36, headCy + headRy * 0.55)
      .quadTo(cx, headCy + headRy * 0.5, cx - headRx * 0.36, headCy + headRy * 0.55)
      .close();
    add('moustache', { shape: 'path', d: tache.d }, { fill: hair });
  }

  // Over the head: the crown of the hair, and a fringe swept from a parting to one side (none when bald; close to the
  // head when cropped; under the hood, only the fringe).
  if (!bald) {
    const temple = headCy - headRy * (look.hair === 'short' ? 0.25 : 0.05) - (cropped ? headRy * 0.12 : 0);
    const lift = cropped ? 1.28 : 1.5;
    const left = { x: cx - headRx * (cropped ? 1.02 : 1.08), y: temple };
    const right = { x: cx + headRx * (cropped ? 1.02 : 1.08), y: temple };
    const parting = { x: cx + part * headRx * 0.35, y: headCy - headRy * (cropped ? 0.75 : 0.62) };
    const crown = new PathData()
      .moveTo(left.x, left.y)
      .cubicTo(cx - headRx * 1.18, headCy - headRy * lift, cx + headRx * 1.18, headCy - headRy * lift, right.x, right.y)
      // The fringe comes back from the far temple to the parting, then sweeps down across the brow.
      .quadTo(cx + part * headRx * 0.95, headCy - headRy * 0.55, parting.x, parting.y)
      .quadTo(cx - part * headRx * 0.55, headCy - headRy * 0.35, left.x, left.y)
      .close();
    add('hair', { shape: 'path', d: crown.d }, { fill: hair });
    if (l.curly && !l.hood) {
      // Curls round the crown.
      for (let i = 0; i <= 8; i++) {
        const a = Math.PI * (1.08 + (0.84 * i) / 8);
        add('curl', {
          shape: 'circle',
          cx: cx + Math.cos(a) * headRx * 1.0,
          cy: headCy + Math.sin(a) * headRy * 1.0 - headRy * 0.05,
          r: headRx * 0.22,
        }, { fill: hair });
      }
    } else if (l.hair !== null) {
      // A light along the hair, as on a painted miniature.
      const light = new PathData()
        .moveTo(cx - headRx * 0.7, headCy - headRy * 0.85)
        .quadTo(cx - headRx * 0.2, headCy - headRy * 1.12, cx + headRx * 0.3, headCy - headRy * 0.98);
      add('hair light', { shape: 'path', d: light.d }, {
        stroke: { color: css(withAlpha(hairShine, 0.7)), width: Math.max(0.8, headRy * 0.07), cap: 'round' },
      });
    }
  }

  // The hood's rim over the brow.
  if (l.hood) {
    const rim = new PathData()
      .moveTo(cx - headRx * 1.25, headCy + headRy * 0.2)
      .quadTo(cx - headRx * 1.3, headCy - headRy * 1.45, cx, headCy - headRy * 1.38)
      .quadTo(cx + headRx * 1.3, headCy - headRy * 1.45, cx + headRx * 1.25, headCy + headRy * 0.2)
      .lineTo(cx + headRx * 1.05, headCy + headRy * 0.2)
      .quadTo(cx + headRx * 1.1, headCy - headRy * 1.12, cx, headCy - headRy * 1.1)
      .quadTo(cx - headRx * 1.1, headCy - headRy * 1.12, cx - headRx * 1.05, headCy + headRy * 0.2)
      .close();
    add('hood rim', { shape: 'path', d: rim.d }, { fill: cloth });
  }

  // Glasses: two rims and a bridge.
  if (l.glasses) {
    const rim: CameoStroke = { color: '#2a2420', width: Math.max(0.8, headRy * 0.05), cap: 'butt' };
    for (const side of [-1.0, 1.0]) {
      add('glasses', { shape: 'circle', cx: cx + side * eyeDx, cy: eyeY, r: eyeW * 0.62 }, { stroke: rim });
    }
    add('glasses bridge', { shape: 'line', x1: cx - eyeDx + eyeW * 0.62, y1: eyeY, x2: cx + eyeDx - eyeW * 0.62, y2: eyeY }, {
      stroke: rim,
    });
  }

  // An eyepatch, over the eye on the parting's side, and its strap.
  if (l.eyepatch) {
    add('eyepatch strap', {
      shape: 'line',
      x1: cx - part * headRx * 1.0,
      y1: eyeY - headRy * 0.55,
      x2: cx + part * headRx * 1.0,
      y2: eyeY + headRy * 0.15,
    }, { stroke: { color: '#1e1a17', width: Math.max(0.8, headRy * 0.05), cap: 'butt' } });
    add('eyepatch', ovalOf(cx + part * eyeDx, eyeY, eyeW * 1.15, eyeH * 2.3), { fill: { kind: 'color', color: '#1e1a17' } });
  }

  // A scar across the eye away from the parting.
  if (l.scar) {
    const at = { x: cx - part * eyeDx, y: eyeY };
    add('scar', {
      shape: 'line',
      x1: at.x - part * eyeW * 0.2,
      y1: at.y - eyeH * 2.4,
      x2: at.x + part * eyeW * 0.35,
      y2: at.y + eyeH * 2.6,
    }, { stroke: { color: css(withAlpha(argb(0xffb4473f), 0.85)), width: Math.max(0.8, headRy * 0.045), cap: 'round' } });
  }

  // A crown on the head, gold.
  if (l.crown) {
    const gold: CameoFill = { kind: 'color', color: '#e2b84a' };
    const y = headCy - headRy * (l.hood ? 1.32 : 1.02);
    const bandW = headRx * 1.5;
    const bandH = headRy * 0.16;
    const band = { left: cx - bandW / 2, top: y - bandH / 2, right: cx + bandW / 2 };
    const points = new PathData().moveTo(band.left, band.top);
    for (let i = 0; i < 5; i++) {
      const x0 = band.left + (bandW * i) / 4;
      if (i > 0) points.lineTo(x0 - bandW / 8, band.top);
      points.lineTo(x0, band.top - headRy * (i % 2 === 0 ? 0.32 : 0.22));
    }
    points.lineTo(band.right, band.top).close();
    add('crown points', { shape: 'path', d: points.d }, { fill: gold });
    add('crown band', { shape: 'rect', x: band.left, y: band.top, width: bandW, height: bandH }, { fill: gold });
    add('crown stone', { shape: 'circle', cx, cy: y, r: headRy * 0.05 }, { fill: { kind: 'color', color: '#b0302a' } });
  }
  clipped = false;

  // The ring, and a finer one inside it.
  add('ring', { shape: 'oval', ...oval }, { stroke: { color: css(frame), width: Math.max(1.5, w * 0.012), cap: 'butt' } });
  const inset = w * 0.025;
  add('inner ring', { shape: 'oval', cx: oval.cx, cy: oval.cy, rx: oval.rx - inset, ry: oval.ry - inset }, {
    stroke: { color: css(withAlpha(frame, frame.a * 0.6)), width: 0.8, cap: 'butt' },
  });

  return { width: w, height: h, oval, ops, grey: look.gone };
}

/** The look drawn with the likeness `now` in place of the one read (as "Draw their face" shows it as it goes): the
 * hair from the cut now chosen; with none chosen, the hair `was` read (when it had no cut either), else the shoulder. */
export function lookWith(was: CameoLook, now: Likeness): CameoLook {
  return {
    hair: now.cut !== null ? cameoHairOf(now.cut) : was.likeness.cut === null ? was.hair : 'shoulder',
    silver: was.silver,
    pointedEars: was.pointedEars,
    gone: was.gone,
    seed: was.seed,
    likeness: now,
  };
}
