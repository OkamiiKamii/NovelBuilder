// THE CHART OF THE WORLD (FEATURES.md #203), at the head of "The whole world": the world as the book holds it, drawn
// as an old sea chart. Each place at the top of the world is an island; the places inside it lie within its shore,
// their borders dashed as a map draws a border, however deep; the more chapters a place figures in, the larger it is.
// On each shore, as seals, the factions, items, powers and lore linked to it. The world's entries linked to no place
// float **adrift** in the sea below; a press on one asks where it belongs, and records it in a press. Nothing is placed
// by guesswork: where a place lies says only what it is inside, never a direction or a distance. A press on any place
// or seal opens it. The pure parts of flutter_app/lib/features/codex/widgets/world_chart.dart: what is on the chart,
// its layout (every number), its labels, its shores, its sea, and what a press does.
//
// HOW IT IS DRAWN (react-native-svg, in this order), a box `laid.height` high and the page's width wide, radius 12, a
// border of outlineVariant at 70%:
// 1. The sea: a rect of `chartColors.sea` (#2F6F8A at 22% dark / 13% light over surfaceContainerLow); its marks
//    (`seaMarks`): each a path, stroke 1, round caps, #2F6F8A at 45% dark / 28% light.
// 2. The neat line: a rect 8 in from the edges, stroke 1, onSurface at 25%.
// 3. The cartouche (`cartouche`): "The world of " (book face, italic, 12 phone / 13, onSurface at 70%) then the title
//    (heading face, 13 / 15, 700, letter spacing 1.6, onSurface at 90%; in capitals unless the face is all capitals),
//    one line, at most width − 110 / 160; on a box at (20, 20), its text + 28 wide and + 14 high, radius 3, filled
//    #B59A62 at 20% over surfaceContainerHigh, a border 1 (onSurface 45%) and another 3 in (radius 2, width 0.6).
// 4. For each island (depth 0), two ripples: `shorePath(centre, r + 5, seed, 0.06)` at #2F6F8A × 35% and r + 11 × 18%
//    (× 1.4 when dark), stroke 1, no fill.
// 5. Every place in `laid.drawn` order: `shorePath(centre, r, seedOf(id), depth 0 ? 0.06 : 0.035)` filled (an island:
//    #B59A62 at 30% dark / 26% over surfaceContainerHigh; inside: castTone(id) at 20% dark / 16%); its edge: lit 2.4 in
//    the accent, else 1.6 (island) / 1.1, onSurface at 60% / 42%; an island's (or a lit one's) solid, any other dashed
//    5 on 4 off (strokeDasharray "5 4").
// 6. Names over everything (`chartLabels`): each on a wash (rounded 4, 4 out at the sides and 1 above and below,
//    surfaceContainerHigh at 55%), in the heading face, centred, line height 1.1, onSurface at 88% (island) / 80%.
// 7. The seals (`laid.seals`, `sealLook`).
// 8. With anything adrift: a dashed line (3 on 5 off, onSurface 25%) across at height − sea − 4 from 22 to width − 22;
//    on a wide chart "ADRIFT" (heading face 13, 700, spacing 3, onSurface 72%) at x 30 centred 8 above the sea's
//    middle, and "linked to no place" (book face 12, italic, onSurface 60%) at y height − sea/2 + 4; each adrift: its
//    swell (`swellPath`, the sea marks' paint at 1.4), its seal, its name under it (book face 12, onSurface 82%, one
//    line, at most 80 wide, centred, 8 under the seal), or "3 more".
// Then the press targets (`chartTargets`): a circle of max(r, 24) about each, with its label and tip.

import { formatNumber, plural } from '../../desk/format';
import { dartSort } from '../../manuscript/dartSort';
import type { StoryModel } from '../../model/storyModel';
import type { Category } from '../../records/category';
import type { Entry } from '../../records/entry';
import { dartToLowerCase } from '../../text/dartString';
import { dartToUpperCase } from '../../exchange/dartUpperCase';
import { monogram } from '../../characters/screens/library';
import { DartRandom } from '../../characters/views/common';
import { placeTree } from '../../places/explore';
import type { CodexChanges } from '../codexChanges';

// ---------------------------------------------------------------------------------------------------- what is on it

/** One place on the chart: the places inside it, and the world's entries tied to it (its seals). */
export class ChartPlace {
  readonly children: ChartPlace[] = [];
  readonly seals: Entry[] = [];
  constructor(
    readonly entry: Entry,
    readonly depth: number,
    /** How many chapters it figures in (linked or named there). */
    readonly chapters: number,
  ) {}
}

export type WorldChartData = { islands: ChartPlace[]; adrift: Entry[] };

/** What the chart shows, read from the records and nothing else. Every place, inside what it is "Located in" (the
 * place tree); the world's other entries (not places, not characters) each set on the shore of the place it is linked
 * to (the first of them in the tree, when several); and those linked to no place, adrift. */
export function worldChartOf(model: StoryModel, chapters: ReadonlyMap<string, ReadonlySet<number>>): WorldChartData {
  const rows = placeTree(model);
  const byId = new Map<string, ChartPlace>();
  const order = new Map<string, number>();
  const islands: ChartPlace[] = [];
  rows.forEach((row, i) => {
    const p = new ChartPlace(row.entry, row.depth, chapters.get(row.entry.id)?.size ?? 0);
    byId.set(row.entry.id, p);
    order.set(row.entry.id, i);
    const up = row.parentId === null ? undefined : byId.get(row.parentId);
    if (up === undefined) islands.push(p);
    else up.children.push(p);
  });
  const worldly = (e: Entry | undefined) => e !== undefined && e.category !== 'character' && e.category !== 'location';
  const tiedTo = new Map<string, string>();
  for (const l of model.links) {
    if (!l.isEntryLink) continue;
    for (const [a, b] of [
      [l.fromId, l.toId],
      [l.toId, l.fromId],
    ]) {
      if (!worldly(model.entries.get(a)) || !byId.has(b)) continue;
      const was = tiedTo.get(a);
      if (was === undefined || order.get(b)! < order.get(was)!) tiedTo.set(a, b);
    }
  }
  const adrift: Entry[] = [];
  const others = dartSort(
    [...model.entries.values()].filter(worldly),
    (a, b) => {
      const x = dartToLowerCase(a.name);
      const y = dartToLowerCase(b.name);
      return x < y ? -1 : x > y ? 1 : 0;
    },
  );
  for (const e of others) {
    const at = tiedTo.get(e.id);
    if (at !== undefined) byId.get(at)!.seals.push(e);
    else adrift.push(e);
  }
  return { islands, adrift };
}

/** How many places on the chart, however deep. */
export function placeCount(places: readonly ChartPlace[]): number {
  return places.reduce((n, p) => n + 1 + placeCount(p.children), 0);
}

/** The words a link from an entry to the place it belongs in is recorded with, by its kind. */
export function belongsWord(kind: string): string {
  switch (kind) {
    case 'faction':
      return 'holds power in';
    case 'item':
      return 'kept in';
    case 'power':
      return 'known in';
    case 'lore':
      return 'remembered in';
    default:
      return 'found in';
  }
}

/** What a screen reader says of the chart, and the caption under it (centred, bodySmall, italic, onSurfaceVariant). */
export function chartWords(data: WorldChartData): { label: string; caption: string } {
  const places = placeCount(data.islands);
  return {
    label: `Chart of the world: ${plural(places, 'place')}${data.adrift.length === 0 ? '' : `, ${formatNumber(data.adrift.length)} adrift`}`,
    caption: [
      'Each place an island, the places inside it within its shore; the larger, the more chapters it is in. ' +
        'On each shore, what is linked to it.',
      ...(data.adrift.length > 0
        ? [`${formatNumber(data.adrift.length)} adrift, linked to no place: press one to say where it belongs.`]
        : []),
    ].join(' '),
  };
}

// ---------------------------------------------------------------------------------------------------- layout

export type Point = { x: number; y: number };

const distanceOf = (p: Point) => Math.sqrt(p.x * p.x + p.y * p.y);

class Disc {
  r = 0;
  /** From the centre of what it is inside (or of the chart). */
  at: Point = { x: 0, y: 0 };
  readonly kids: Disc[] = [];
  constructor(readonly place: ChartPlace) {}
}

type Rect = { left: number; top: number; right: number; bottom: number };
const widthOf = (b: Rect) => b.right - b.left;
const heightOf = (b: Rect) => b.bottom - b.top;
const centreOf = (b: Rect): Point => ({ x: b.left + widthOf(b) / 2, y: b.top + heightOf(b) / 2 });

const ownRadius = (p: ChartPlace) => 14 * Math.pow(1 + p.chapters, 0.35);

/** A place's disc: its own size, or round the places inside it with a band above them for its name. */
function discOf(p: ChartPlace, least: (p: ChartPlace) => number): Disc {
  const d = new Disc(p);
  d.kids.push(...p.children.map((c) => discOf(c, least)));
  if (d.kids.length === 0) {
    d.r = ownRadius(p);
    return d;
  }
  pack(d.kids, 4);
  const enclose = d.kids.reduce((m, k) => Math.max(m, distanceOf(k.at) + k.r), 0);
  const band = 10 + enclose * 0.12;
  for (const k of d.kids) k.at = { x: k.at.x + 0, y: k.at.y + band * 0.55 };
  d.r = Math.max(Math.max(ownRadius(p) * 1.15, enclose + band), least(p));
  return d;
}

/** Packs `discs` round the middle, largest first (sorting them so), each where it touches those already set and lies
 * nearest the middle (`aspect` wider than tall reads "nearest" across an ellipse, to fill a wide chart). Then centres
 * them. */
function pack(discs: Disc[], gap: number, aspect = 1): void {
  if (discs.length === 0) return;
  dartSort(discs, (a, b) => (b.r < a.r ? -1 : b.r > a.r ? 1 : 0));
  const score = (p: Point) => (p.x / aspect) * (p.x / aspect) + p.y * p.y;
  const placed: Disc[] = [];
  const free = (p: Point, r: number) => {
    for (const o of placed) {
      if (distanceOf({ x: o.at.x - p.x, y: o.at.y - p.y }) < o.r + r + gap - 1e-6) return false;
    }
    return true;
  };
  const many = discs.length > 40;
  let turn = 1;
  for (const d of discs) {
    if (placed.length === 0) {
      d.at = { x: 0, y: 0 };
      placed.push(d);
      continue;
    }
    if (many) {
      // A great many: out along a sunflower's spiral, to the first free spot.
      const step = discs[0].r * 0.9 + gap;
      // Counted, not `for (;;)` (Hermes once hung on an endless loop); a free spot comes long before the bound.
      for (let tries = 0; tries < 1000000; tries++) {
        const a = turn * 2.399963;
        const root = Math.sqrt(turn);
        const p = { x: Math.cos(a) * aspect * step * root, y: Math.sin(a) * step * root };
        turn++;
        d.at = p;
        if (free(p, d.r)) break;
      }
      placed.push(d);
      continue;
    }
    let best: Point | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    const consider = (p: Point) => {
      const s = score(p);
      if (s < bestScore && free(p, d.r)) {
        bestScore = s;
        best = p;
      }
    };
    for (const a of placed) {
      for (let k = 0; k < 12; k++) {
        const t = (k * Math.PI) / 6;
        const reach = a.r + d.r + gap;
        consider({ x: a.at.x + Math.cos(t) * reach, y: a.at.y + Math.sin(t) * reach });
      }
    }
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i];
        const b = placed[j];
        const ra = a.r + d.r + gap;
        const rb = b.r + d.r + gap;
        const between = { x: b.at.x - a.at.x, y: b.at.y - a.at.y };
        const dist = distanceOf(between);
        if (dist === 0 || dist > ra + rb || dist < Math.abs(ra - rb)) continue;
        const along = (ra * ra - rb * rb + dist * dist) / (2 * dist);
        const h = Math.sqrt(Math.max(0, ra * ra - along * along));
        const unit = { x: between.x / dist, y: between.y / dist };
        const mid = { x: a.at.x + unit.x * along, y: a.at.y + unit.y * along };
        const across = { x: -unit.y * h, y: unit.x * h };
        consider({ x: mid.x + across.x, y: mid.y + across.y });
        consider({ x: mid.x - across.x, y: mid.y - across.y });
      }
    }
    d.at = best ?? { x: placed.reduce((m, o) => Math.max(m, o.at.x + o.r), 0) + d.r + gap, y: 0 };
    placed.push(d);
  }
  const box = centreOf(boundsOf(discs));
  for (const d of discs) d.at = { x: d.at.x - box.x, y: d.at.y - box.y };
}

function boundsOf(discs: readonly Disc[]): Rect {
  return discs
    .map((d): Rect => ({ left: d.at.x - d.r, top: d.at.y - d.r, right: d.at.x + d.r, bottom: d.at.y + d.r }))
    .reduce((a, b) => ({
      left: Math.min(a.left, b.left),
      top: Math.min(a.top, b.top),
      right: Math.max(a.right, b.right),
      bottom: Math.max(a.bottom, b.bottom),
    }));
}

/** A place as drawn: its centre on the chart and its radius. */
export type Drawn = { place: ChartPlace; centre: Point; r: number };

/** A seal on a shore or adrift: the entry (for "+N", the first one not shown), where, its radius, and how many more. */
export type Seal = { entry: Entry; at: Point; r: number; more: number };

/** The chart laid out at a width: how tall it is, the sea along its foot, and where each place, seal and thing adrift
 * is drawn. */
export type Laid = { height: number; sea: number; compact: boolean; drawn: Drawn[]; seals: Seal[]; adrift: Seal[] };

/** Measures a line of the heading face: its width at `size` with `letterSpacing`, in pixels. */
export type MeasureLine = (text: string, size: number, letterSpacing: number) => number;

/** Lays the chart out at `width`: names (of places with places inside) measured with `measure` (in the heading face,
 * in capitals unless `caps`: the face is all capitals already), the islands packed, the seals and what is adrift set
 * along the shores and the sea. */
export function layOutChart(width: number, data: WorldChartData, options: { caps: boolean; measure: MeasureLine }): Laid {
  const compact = width < 600;
  const sea = data.adrift.length === 0 ? 0 : 84;
  const margin = 34;
  const cartouche = 40;
  const most = (compact ? width * 1.25 : Math.min(580, Math.max(380, width * 0.46))) + sea;
  const roomWidth = width - margin * 2;
  const roomHeight = most - margin * 2 - cartouche - sea;

  // How wide each name with places inside it is, at the least size it is written (on the chart, in pixels).
  const nameWidth = new Map<string, number>();
  const measureAll = (places: readonly ChartPlace[]) => {
    for (const p of places) {
      if (p.children.length > 0) {
        const size = p.depth === 0 ? 10 : 9;
        const text = p.depth === 0 || !options.caps ? dartToUpperCase(p.entry.name) : p.entry.name;
        nameWidth.set(p.entry.id, options.measure(text, size, size * 0.18));
        measureAll(p.children);
      }
    }
  };
  measureAll(data.islands);

  // Lay the world out: the islands packed wide, square or tall, whichever draws the world largest in the chart; then
  // again with each place made large enough to hold its own name inside its shore, at the size it is drawn.
  let islands: Disc[] = [];
  let bestAspect = roomWidth / roomHeight;
  let bestScale = -1;
  // Never more than half as large again as it would be: how much the book is there still decides its size.
  const natural = new Map<string, number>();
  const least = (p: ChartPlace): number => {
    if (bestScale <= 0) return 0;
    const own = natural.get(p.entry.id) ?? Number.POSITIVE_INFINITY;
    return Math.min(((nameWidth.get(p.entry.id) ?? 0) / 2 + 8) / 0.82 / bestScale, own * 1.5);
  };
  const remember = (d: Disc): void => {
    natural.set(d.place.entry.id, d.r);
    d.kids.forEach(remember);
  };
  for (let round = 0; round < 3; round++) {
    islands = data.islands.map((p) => discOf(p, least));
    if (round === 0) islands.forEach(remember);
    let roundAspect = bestAspect;
    let roundScale = -1;
    for (const aspect of islands.length > 40 ? [bestAspect] : [roomWidth / roomHeight, 0.5, 0.75, 1.0, 1.5, 2.2]) {
      pack(islands, 18, aspect);
      const b = boundsOf(islands);
      const s = Math.min(roomWidth / widthOf(b), roomHeight / heightOf(b));
      if (s > roundScale + 1e-9) {
        roundScale = s;
        roundAspect = aspect;
      }
    }
    bestAspect = roundAspect;
    bestScale = roundScale;
    if (nameWidth.size === 0) break;
  }
  pack(islands, 18, bestAspect);
  const bounds = boundsOf(islands);
  const scale = bestScale;
  // No taller than what is drawn needs.
  const height = Math.min(most, heightOf(bounds) * scale + margin * 2 + cartouche + sea + 8);
  const room: Rect = { left: margin, top: margin + cartouche, right: width - margin, bottom: height - margin - sea };
  const drawn: Drawn[] = [];
  const lay = (d: Disc, parent: Point) => {
    const centre = { x: parent.x + d.at.x * scale, y: parent.y + d.at.y * scale };
    drawn.push({ place: d.place, centre, r: d.r * scale });
    for (const k of d.kids) lay(k, centre);
  };
  const roomCentre = centreOf(room);
  const boundsCentre = centreOf(bounds);
  for (const d of islands) {
    lay(d, { x: roomCentre.x - boundsCentre.x * scale, y: roomCentre.y - boundsCentre.y * scale });
  }

  // The seals: along the foot of each shore, six at most and "+N".
  const seals: Seal[] = [];
  for (const d of drawn) {
    const list = d.place.seals;
    if (list.length === 0 || d.r < 14) continue;
    const shown = list.length > 6 ? 5 : list.length;
    const sealR = Math.min(11, Math.max(7, d.r * 0.13));
    const spread = Math.min(0.32, (sealR * 2.6) / d.r);
    const total = shown + (list.length > shown ? 1 : 0);
    for (let i = 0; i < total; i++) {
      const a = Math.PI / 2 + (i - (total - 1) / 2) * spread;
      const reach = d.r * 0.97;
      seals.push({
        entry: i < shown ? list[i] : list[shown],
        at: { x: d.centre.x + Math.cos(a) * reach, y: d.centre.y + Math.sin(a) * reach },
        r: sealR,
        more: i < shown ? 0 : list.length - shown,
      });
    }
  }

  // Adrift: in a row across the sea at the foot, as many as there is room for, then "+N".
  const adrift: Seal[] = [];
  if (data.adrift.length > 0) {
    const slot = 86;
    const startX = compact ? margin + 18 : margin + 120;
    const fits = Math.max(1, Math.floor((width - startX - margin) / slot));
    const shown = data.adrift.length > fits ? fits - 1 : data.adrift.length;
    const y = height - sea / 2 - 6;
    for (let i = 0; i < shown; i++) {
      adrift.push({ entry: data.adrift[i], at: { x: startX + slot * (i + 0.5), y }, r: 12, more: 0 });
    }
    if (shown < data.adrift.length) {
      adrift.push({
        entry: data.adrift[shown],
        at: { x: startX + slot * (shown + 0.5), y },
        r: 12,
        more: data.adrift.length - shown,
      });
    }
  }
  return { height, sea, compact, drawn, seals, adrift };
}

// ---------------------------------------------------------------------------------------------------- the names

/** Lays out a label in the heading face: `text` at `size` (bold or semibold), `letterSpacing`, line height 1.1,
 * centred, wrapped at `maxWidth` in at most `maxLines` lines with an ellipsis. Returns its size and whether it needed
 * more lines than it has. */
export type LayoutLabel = (
  text: string,
  style: { size: number; letterSpacing: number; weight: 700 | 600; maxWidth: number; maxLines: number },
) => { width: number; height: number; exceeded: boolean };

/** A place's name as drawn: its words, its style, its box's top left and size (the wash is 4 out at the sides and 1
 * above and below, radius 4), and its colour's alpha (of onSurface). */
export type ChartLabel = {
  id: string;
  text: string;
  size: number;
  weight: 700 | 600;
  letterSpacing: number;
  maxWidth: number;
  maxLines: number;
  at: Point;
  width: number;
  height: number;
  alpha: number;
};

/** Names: over everything. A place with places inside is named across its shore's top, where the shore is wide enough
 * for the name; any other in its middle, on two lines if need be; one too small for its name, just under its shore (or,
 * with places inside, above it). Places with a radius under 5 are not named. */
export function chartLabels(drawn: readonly Drawn[], options: { caps: boolean; layout: LayoutLabel }): ChartLabel[] {
  const out: ChartLabel[] = [];
  for (const d of drawn) {
    const p = d.place;
    if (d.r < 5) continue;
    const top = p.depth === 0;
    const leaf = p.children.length === 0;
    const words = top || !options.caps ? dartToUpperCase(p.entry.name) : p.entry.name;
    let fontSize = Math.min(top ? 17 : 13, Math.max(8, d.r * (top ? 0.2 : 0.24)));
    const weight: 700 | 600 = top ? 700 : 600;
    const label = (width: number, lines: number) => {
      const spacing = fontSize * (top ? 0.18 : 0.08);
      return { ...options.layout(words, { size: fontSize, letterSpacing: spacing, weight, maxWidth: width, maxLines: lines }), spacing, maxWidth: width, lines };
    };
    const room = d.r * 2 * (leaf ? 0.86 : 0.8);
    let text = label(room, leaf ? 2 : 1);
    // Counted, not `for (;;)`: the size falls by one a turn and stops at 8, well inside the bound.
    for (let tries = 0; tries < 64; tries++) {
      text = label(room, leaf ? 2 : 1);
      const fits = !text.exceeded && text.height < d.r * 1.5;
      if (fits || fontSize <= 8) break;
      fontSize -= 1;
    }
    // Inside the shore however worn it is: measured on a circle a little smaller than the place.
    const inner = d.r * 0.9;
    const half = text.width / 2 + 6;
    const fits = !text.exceeded && text.height < d.r * 1.5 && (leaf || half < inner);
    let at: Point;
    if (fits && leaf) {
      at = { x: d.centre.x - text.width / 2, y: d.centre.y - text.height / 2 };
    } else if (fits) {
      const down = Math.sqrt(inner * inner - half * half);
      at = { x: d.centre.x - text.width / 2, y: d.centre.y - down + 2 };
    } else {
      // Too small for its name: a place with places inside is named above its shore (clear of an island's ripples),
      // any other below, so the two never meet.
      fontSize = top ? 10 : 9;
      text = label(150, 1);
      at = leaf
        ? { x: d.centre.x - text.width / 2, y: d.centre.y + d.r + 3 }
        : { x: d.centre.x - text.width / 2, y: d.centre.y - d.r - text.height - (top ? 13 : 3) };
    }
    out.push({
      id: p.entry.id,
      text: words,
      size: fontSize,
      weight,
      letterSpacing: text.spacing,
      maxWidth: text.maxWidth,
      maxLines: text.lines,
      at,
      width: text.width,
      height: text.height,
      alpha: top ? 0.88 : 0.8,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------- shores and sea

/** A place's seed for its shore: the same for the same place every time. */
export function seedOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0x7fffffff;
  return h;
}

/** Flutter's `Offset.lerp` at one half. */
const half = (a: Point, b: Point): Point => ({ x: a.x * (1 - 0.5) + b.x * 0.5, y: a.y * (1 - 0.5) + b.y * 0.5 });

/** The points of a shore round `centre`: a circle of radius `r` worn irregular (72 of them). */
export function shorePoints(centre: Point, r: number, seed: number, wear: number): Point[] {
  const random = new DartRandom(seed);
  const waves: { f: number; phase: number; w: number }[] = [];
  for (let k = 0; k < 4; k++) {
    const f = 2 + k * 2 + random.nextInt(2);
    const phase = random.nextDouble() * 2 * Math.PI;
    waves.push({ f, phase, w: 1 / (k + 1) });
  }
  const n = 72;
  const points: Point[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * 2 * Math.PI;
    let bump = 0;
    for (const w of waves) bump += w.w * Math.sin(w.f * t + w.phase);
    const rr = r * (1 + (wear * bump) / 2.08);
    points.push({ x: centre.x + Math.cos(t) * rr, y: centre.y + Math.sin(t) * rr });
  }
  return points;
}

/** A shore as an SVG path: through the middles of its points, each point a quadratic's control, closed. */
export function shorePath(centre: Point, r: number, seed: number, wear: number): string {
  const points = shorePoints(centre, r, seed, wear);
  const n = points.length;
  const first = half(points[n - 1], points[0]);
  const parts = [`M${first.x} ${first.y}`];
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const next = half(p, points[(i + 1) % n]);
    parts.push(`Q${p.x} ${p.y} ${next.x} ${next.y}`);
  }
  parts.push('Z');
  return parts.join(' ');
}

/** The sea's small waves, the same each time: each an SVG path. */
export function seaMarks(width: number, height: number): string[] {
  const random = new DartRandom(11);
  const count = Math.min(160, Math.max(20, (width * height) / 9000));
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const p = { x: random.nextDouble() * width, y: random.nextDouble() * height };
    const w = 5 + random.nextDouble() * 5;
    out.push(`M${p.x - w} ${p.y} Q${p.x - w / 2} ${p.y - 3} ${p.x} ${p.y} Q${p.x + w / 2} ${p.y - 3} ${p.x + w} ${p.y}`);
  }
  return out;
}

/** The swell an adrift seal bobs on. */
export function swellPath(s: Seal): string {
  const { x, y } = s.at;
  const r = s.r;
  return `M${x - 20} ${y + r + 3} Q${x - 10} ${y + r - 1} ${x} ${y + r + 3} Q${x + 10} ${y + r + 7} ${x + 20} ${y + r + 3}`;
}

/** The chart's colours that are its own (the sea, the land), and how much of each is laid over the theme. */
export const chartColors = { sea: '#2F6F8A', land: '#B59A62', seaAlpha: { dark: 0.22, light: 0.13 } } as const;

/** The cartouche's box for its text, measured: at (20, 20), the text + 28 by + 14; the text at 14 in, 7 down. */
export function cartouche(textWidth: number, textHeight: number, compact: boolean, width: number) {
  return {
    box: { x: 20, y: 20, width: textWidth + 28, height: textHeight + 14 },
    text: { x: 34, y: 27 },
    maxTextWidth: width - (compact ? 110 : 160),
    lead: 'The world of ',
    leadSize: compact ? 12 : 13,
    titleSize: compact ? 13 : 15,
  };
}

/** A wax seal: a shadow (black at 18%, 1.5 down), a disc of its kind's colour (outline for "+N"; × 1.2 when lit), a
 * ring 1.6 in (white at 45%, 1 wide), and its initials (or "+3") in the book face, 700, size r × 0.9 (× 0.8 for "+N"),
 * black at 87% on a light colour, else white. */
export function sealLook(s: Seal, lit: string | null): { lit: boolean; mark: string; size: number; radius: number } {
  const isLit = lit === s.entry.id && s.more === 0;
  return {
    lit: isLit,
    mark: s.more > 0 ? `+${s.more}` : monogram(s.entry.name),
    size: s.r * (s.more > 0 ? 0.8 : 0.9),
    radius: s.r * (isLit ? 1.2 : 1),
  };
}

// ---------------------------------------------------------------------------------------------------- presses

/** What a place's tip and label say of it: its chapters (with chapters in the book), the places inside, its seals. */
export function placeWhere(p: ChartPlace, hasChapters: boolean): string {
  return [
    ...(hasChapters ? [p.chapters === 0 ? 'not in the manuscript yet' : `in ${plural(p.chapters, 'chapter')}`] : []),
    ...(p.children.length > 0 ? [`${plural(p.children.length, 'place')} inside`] : []),
    ...(p.seals.length > 0 ? [`${formatNumber(p.seals.length)} on its shore`] : []),
  ].join(', ');
}

/** A press target on the chart: a circle about `at` of radius max(r, 24), what a screen reader says, its tip, what a
 * press does, and the id it lights (a pointer over it), if any. */
export type ChartTarget = {
  at: Point;
  r: number;
  label: string;
  tip: string;
  press:
    | { kind: 'open'; entry: Entry }
    | { kind: 'shore'; heading: string; entries: Entry[] }
    | { kind: 'adrift'; heading: string; entries: Entry[] }
    | { kind: 'belong'; entry: Entry };
  lights: string | null;
};

export function chartTargets(laid: Laid, data: WorldChartData, kindOf: (e: Entry) => Category, hasChapters: boolean): ChartTarget[] {
  const out: ChartTarget[] = [];
  const target = (at: Point, r: number, label: string, tip: string, press: ChartTarget['press'], lights: string | null) =>
    out.push({ at, r: Math.max(r, 24), label, tip, press, lights });
  for (const d of laid.drawn) {
    if (d.r < 6) continue;
    const where = placeWhere(d.place, hasChapters);
    target(
      d.centre,
      d.r,
      `${d.place.entry.name}, a place on the chart, ${where}`,
      [d.place.entry.name, where].filter((s) => s.length > 0).join(' · '),
      { kind: 'open', entry: d.place.entry },
      d.place.entry.id,
    );
  }
  for (const s of laid.seals) {
    if (s.more > 0) {
      target(s.at, s.r, `${s.more} more on this shore`, `${s.more} more`, {
        kind: 'shore',
        heading: 'On this shore',
        entries: laid.drawn.filter((d) => d.place.seals.includes(s.entry)).flatMap((d) => d.place.seals),
      }, null);
    } else {
      const kind = kindOf(s.entry).singular;
      target(s.at, s.r, `${s.entry.name}, ${kind}, on the shore`, `${s.entry.name} · ${kind}`, { kind: 'open', entry: s.entry }, s.entry.id);
    }
  }
  for (const s of laid.adrift) {
    if (s.more > 0) {
      target(s.at, s.r, `${s.more} more adrift. Say where they belong`, `${s.more} more adrift`, {
        kind: 'adrift',
        heading: 'Adrift',
        entries: data.adrift,
      }, null);
    } else {
      target(
        s.at,
        s.r,
        `${s.entry.name}, adrift: linked to no place. Say where it belongs`,
        `${s.entry.name} · adrift: where does it belong?`,
        { kind: 'belong', entry: s.entry },
        s.entry.id,
      );
    }
  }
  return out;
}

/** WHERE DOES IT BELONG? (a sheet, at most 70% of the screen): every place in the world as the tree has them (each
 * indented 20 a level, a landscape icon at the top, else an arrow into it), and "Open <name>". A press on a place
 * links the entry to it (`belongTo`) and says "The Lantern Guild holds power in Old Merrow." with **Open**. In the
 * "+N" lists (a sheet headed "On this shore" or "Adrift"), each entry (its thumb of 32, its name, its kind; "Place it"
 * for those adrift) opens it, or asks where it belongs. */
export function belongSheet(entry: Entry, data: WorldChartData) {
  const places: { place: ChartPlace; depth: number }[] = [];
  const walk = (list: readonly ChartPlace[]) => {
    for (const p of list) {
      places.push({ place: p, depth: p.depth });
      walk(p.children);
    }
  };
  walk(data.islands);
  const word = belongsWord(entry.category);
  return {
    title: `Where does ${entry.name} belong?`,
    note: `It is linked to the place you choose (“${word}”), and stands on its shore.`,
    places: places.map(({ place, depth }) => ({ place, depth, indent: 20 + depth * 20, top: depth === 0 })),
    open: `Open ${entry.name}`,
    word,
  };
}

/** A press on a place in "Where does it belong?": the link made, and what is said (with **Open**). */
export function belongTo(c: CodexChanges, entry: Entry, place: Entry): { tell: string; action: string } {
  const word = belongsWord(entry.category);
  c.linkEntries(entry.id, place.id, word);
  return { tell: `${entry.name} ${word} ${place.name}.`, action: 'Open' };
}

export const placeIt = 'Place it';
