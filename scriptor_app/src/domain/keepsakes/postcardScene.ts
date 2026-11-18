// A postcard's painting (and, small, its stamp's), as postcards_page.dart's PostcardScene paints it: the sky in the
// place's light, the sun or moon (or stars by night), the far land (peaks or long hills, snow on the peaks), the near
// ground (water with a shore, dunes, or hills), a line of pines, a tower (a lighthouse with its lamp and beam, else a
// keep), and a huddle of roofs. Drawn from the place's name with Dart's Random, so a place always looks the same. Here
// as shapes for react-native-svg to draw, in order; and the words and colours of the card's two sides.

import { DartRandom } from '../desk/dartRandom';
import { dartToUpperCase } from '../exchange/dartUpperCase';
import { type Postcard } from '../manuscript/postcards';
import { fileSlug } from '../analytics/charts';
import { dartToLowerCase, dartTrim } from '../text/dartString';
import { brand } from './pages';

/** A postcard's size as it is drawn; the picture is 1500 by 1000. */
export const postcardSize = { width: 450, height: 300 } as const;
export const postcardPictureScale = 1500 / 450;

/** The colours of a light: the sky from the top down, the sun (none in a storm), the far land, the near land, the water. */
type Light = { skyTop: string; skyLow: string; sun: string | null; far: string; near: string; water: string };

/** Dawn, noon, dusk, night, storm. */
export const postcardLightColours: readonly Light[] = [
  { skyTop: '#E9A28E', skyLow: '#FCE3C0', sun: '#FFF4D8', far: '#B98A86', near: '#7C5B63', water: '#9DB3C4' },
  { skyTop: '#5FA6D8', skyLow: '#CFE8F6', sun: '#FFF5C4', far: '#86AE9A', near: '#4A7A57', water: '#3A82B4' },
  { skyTop: '#3B2A5C', skyLow: '#E88E5A', sun: '#FFC66E', far: '#6B3F5E', near: '#35213D', water: '#594877' },
  { skyTop: '#0D1530', skyLow: '#2F4272', sun: '#F2EBD3', far: '#26355A', near: '#111934', water: '#1C2B52' },
  { skyTop: '#46515C', skyLow: '#A0ABB2', sun: null, far: '#5D6A70', near: '#384347', water: '#52626B' },
];

const rgb = (hex: string) => {
  const n = Number.parseInt(hex.replace('#', '').slice(-6), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const hex2 = (c: number) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0').toUpperCase();

/** Flutter's `Color.lerp(a, b, t)` of two opaque colours, as `#RRGGBB`. */
export function lerpColour(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return `#${x.map((v, i) => hex2(v * (1 - t) + y[i] * t)).join('')}`;
}

/** A colour at an alpha, as the shapes carry it. */
export type Paint = { colour: string; alpha: number };
const paint = (colour: string, alpha = 1): Paint => ({ colour, alpha });

/** A shape of the painting. A `clip` path keeps it inside the far land (the snow). */
export type SceneShape =
  | { kind: 'sky'; x: number; y: number; width: number; height: number; top: string; low: string; to: number }
  | { kind: 'rect'; x: number; y: number; width: number; height: number; paint: Paint; clip?: string }
  | { kind: 'circle'; cx: number; cy: number; r: number; paint: Paint }
  | { kind: 'path'; d: string; paint: Paint }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; paint: Paint; width: number };

const n = (v: number) => `${Math.round(v * 1000) / 1000}`;

/** A path as SVG writes it, from points (the first a move, the rest lines), closed. */
function closed(points: readonly [number, number][]): string {
  return `${points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${n(x)} ${n(y)}`).join(' ')} Z`;
}

/** The painting of `card` at `width` by `height`. */
export function postcardScene(card: Postcard, width: number, height: number): SceneShape[] {
  const w = width;
  const h = height;
  const light = postcardLightColours[card.light];
  const s = card.scenery;
  let seed = 3;
  for (let i = 0; i < card.place.length; i++) seed = (seed * 17 + card.place.charCodeAt(i)) & 0x7fffffff;
  const random = new DartRandom(seed);
  const out: SceneShape[] = [];
  // The sky, and the sun or moon (or stars by night).
  out.push({ kind: 'sky', x: 0, y: 0, width: w, height: h, top: light.skyTop, low: light.skyLow, to: h * 0.7 });
  if (card.light === 3) {
    for (let i = 0; i < 26; i++) {
      const cx = random.nextDouble() * w;
      const cy = random.nextDouble() * h * 0.5;
      out.push({ kind: 'circle', cx, cy, r: 0.6 + random.nextDouble(), paint: paint('#FFFFFF', 0xcc / 255) });
    }
  }
  const horizon = h * (s.water ? 0.6 : 0.66);
  if (light.sun !== null) {
    // Low, near the horizon, under the letters.
    const sx = w * (0.6 + random.nextDouble() * 0.25);
    const sy = horizon - h * (0.07 + random.nextDouble() * 0.06);
    out.push({ kind: 'circle', cx: sx, cy: sy, r: h * 0.16, paint: paint(light.sun, 0.18) });
    out.push({ kind: 'circle', cx: sx, cy: sy, r: h * 0.075, paint: paint(light.sun) });
  }
  // The far land: peaks, or long hills.
  const far: [number, number][] = [[0, horizon]];
  if (s.peaks) {
    let x = 0;
    // Each step moves on at least a tenth of the width: bounded.
    for (let turns = 0; x < w && turns < 1000; turns++) {
      const step = w * (0.12 + random.nextDouble() * 0.14);
      far.push([x + step / 2, horizon - h * (0.2 + random.nextDouble() * 0.22)], [x + step, horizon - h * 0.04]);
      x += step;
    }
  } else {
    for (let i = 0; i <= 24; i++) {
      const x = (w * i) / 24;
      far.push([x, horizon - h * (0.06 + 0.04 * Math.sin((x / w) * Math.PI * 3 + (seed % 7)))]);
    }
  }
  far.push([w, horizon + 2], [0, horizon + 2]);
  const farPath = closed(far);
  out.push({ kind: 'path', d: farPath, paint: paint(light.far) });
  if (s.peaks && card.light !== 2) {
    // Snow on the tops.
    out.push({ kind: 'rect', x: 0, y: 0, width: w, height: horizon - h * 0.3, paint: paint('#FFFFFF', 0.75), clip: farPath });
  }
  // The near ground: water with a shore, dunes, or hills.
  const ground = lerpColour(light.near, light.far, 0.15);
  if (s.water) {
    out.push({ kind: 'rect', x: 0, y: horizon, width: w, height: h - horizon, paint: paint(light.water) });
    for (let i = 0; i < 18; i++) {
      const y = horizon + 6 + random.nextDouble() * (h - horizon - 8);
      const x = random.nextDouble() * w;
      out.push({ kind: 'line', x1: x, y1: y, x2: x + 8 + random.nextDouble() * 18, y2: y, paint: paint('#FFFFFF', 0.35), width: 1.4 });
    }
    out.push({
      kind: 'path',
      d: `M0 ${n(horizon + h * 0.08)} Q${n(w * 0.25)} ${n(horizon + h * 0.04)} ${n(w * 0.42)} ${n(h * 0.86)} L${n(w * 0.5)} ${n(h)} L0 ${n(h)} Z`,
      paint: paint(ground),
    });
  } else if (s.dunes) {
    const sand = ['#E2BD7A', '#C99B56', '#AF7F42'];
    sand.forEach((colour, i) => {
      const y = horizon + i * h * 0.1;
      const dune: [number, number][] = [[0, y]];
      for (let j = 0; j <= 20; j++) {
        const x = (w * j) / 20;
        dune.push([x, y + h * 0.04 * Math.sin((x / w) * Math.PI * 2 + i * 1.7 + (seed % 5))]);
      }
      dune.push([w, h], [0, h]);
      out.push({ kind: 'path', d: closed(dune), paint: paint(card.light >= 3 ? lerpColour(colour, light.near, 0.6) : colour) });
    });
  } else {
    const hill: [number, number][] = [[0, horizon + h * 0.04]];
    for (let i = 0; i <= 24; i++) {
      const x = (w * i) / 24;
      hill.push([x, horizon + h * (0.05 + 0.035 * Math.sin((x / w) * Math.PI * 2.2 + (seed % 3)))]);
    }
    hill.push([w, h], [0, h]);
    out.push({ kind: 'path', d: closed(hill), paint: paint(ground) });
  }
  const dark = paint(lerpColour(light.near, '#000000', 0.25));
  // Trees: a dark line of pines along the ground.
  if (s.trees) {
    const base = s.water ? h * 0.9 : horizon + h * 0.1;
    const end = s.water ? w * 0.4 : w;
    let x = -w * 0.01;
    for (let turns = 0; x < end && turns < 1000; turns++) {
      const tall = h * (0.12 + random.nextDouble() * 0.12);
      out.push({ kind: 'path', d: closed([[x, base], [x + w * 0.016, base - tall], [x + w * 0.032, base]]), paint: dark });
      x += w * (0.02 + random.nextDouble() * 0.016);
    }
  }
  // A tower, behind any houses: a lighthouse with its lamp and beam, else a keep with its battlements.
  if (s.tower) {
    const x = s.water ? (s.roofs ? w * 0.22 : w * 0.3) : w * 0.78;
    const base = s.water ? h * 0.9 : horizon + h * 0.08;
    const tall = h * 0.42;
    const wide = w * 0.055;
    out.push({ kind: 'rect', x: x - wide / 2, y: base - tall, width: wide, height: tall, paint: dark });
    if (s.beacon) {
      const lx = x;
      const ly = base - tall - 5;
      const lamp = light.sun ?? '#FFF4D8';
      out.push({ kind: 'path', d: closed([[lx, ly], [w, ly - h * 0.12], [w, ly + h * 0.06]]), paint: paint(lamp, 0.28) });
      out.push({ kind: 'circle', cx: lx, cy: ly, r: 5, paint: paint(lamp) });
      out.push({ kind: 'path', d: closed([[x - wide * 0.7, base - tall], [x, base - tall - 14], [x + wide * 0.7, base - tall]]), paint: dark });
    } else {
      for (let i = 0; i < 3; i++) {
        out.push({ kind: 'rect', x: x - wide / 2 + i * wide * 0.4, y: base - tall - 6, width: wide * 0.22, height: 6, paint: dark });
      }
    }
  }
  // Roofs: a huddle of houses.
  if (s.roofs) {
    const base = s.water ? h * 0.95 : h * 0.97;
    let x = s.water ? w * 0.02 : w * 0.06;
    const end = s.water ? w * 0.4 : w * 0.7;
    const house = paint(lerpColour(light.near, light.skyLow, 0.12));
    const window = paint(light.sun ?? light.skyLow, card.light >= 2 ? 0.9 : 0.5);
    for (let turns = 0; x < end && turns < 1000; turns++) {
      const wide = w * (0.05 + random.nextDouble() * 0.04);
      const high = h * (0.1 + random.nextDouble() * 0.12);
      out.push({ kind: 'rect', x, y: base - high, width: wide, height: high, paint: house });
      out.push({ kind: 'path', d: closed([[x - 2, base - high], [x + wide / 2, base - high - h * 0.06], [x + wide + 2, base - high]]), paint: dark });
      out.push({ kind: 'rect', x: x + wide * 0.35, y: base - high * 0.7, width: wide * 0.3, height: high * 0.22, paint: window });
      x += wide + 2;
    }
  }
  return out;
}

/** The front's lettering colours: the letters light from the sky, their shadow dark from the land. */
export function frontColours(card: Postcard): { letters: string; shadow: string } {
  const light = postcardLightColours[card.light];
  return { letters: lerpColour(light.skyLow, '#FFFFFF', 0.75), shadow: lerpColour(light.near, '#000000', 0.35) };
}

/** The back's words: the greeting, the chapter, who it is from, and the reader it is addressed to. */
export function backWords(card: Postcard, book: string, author: string): {
  greeting: string;
  chapter: string;
  from: string;
  address: string[];
  stamp: string;
  foot: string;
} {
  const title = dartTrim(card.chapterTitle);
  return {
    greeting: `Greetings from ${card.place},`,
    chapter: title.length === 0 ? `Chapter ${card.chapter}` : `Chapter ${card.chapter} · ${title}`,
    from: author.length === 0 || ['novel builder', 'scriptor'].includes(dartToLowerCase(author)) ? book : `${book}, by ${author}`,
    address: ['A reader', `of ${book}`, ''],
    stamp: dartToUpperCase(card.place.split(' ').pop() ?? ''),
    foot: `MADE WITH ${dartToUpperCase(brand)}`,
  };
}

/** The picture's name. */
export const postcardFile = (place: string, back: boolean) => `postcard-from-${dartToLowerCase(fileSlug(place))}${back ? '-back' : ''}.png`;
