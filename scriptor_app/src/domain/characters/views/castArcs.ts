// ARCS, a view of the cast (feelingArcs.ts reads it): each character's line through the book, from the words of feeling
// in the sentences that name them, bright above the line and dark below; its shape said plainly, with its classic
// name; its highest and lowest chapters. A chapter pressed shows the lines that made it, with **Read it there**. Beside
// each, the arc the author planned in the profile (Starting Point, Current State, Intended Resolution), or the way to
// write one. It only reads.
//
// The pure parts of flutter_app/lib/features/characters/widgets/cast_arcs.dart: what to read (`arcsReading`, then
// feelingArcsJob(service.storedChapters(novelId), order, people)), what is shown, and the line's geometry (`arcLine`).
//
// HOW THE LINE IS DRAWN (arcLine gives every number), in a box `width` × 96 (test key `arc-line-<id>`):
// - the middle (`mid`), dashed: 4 drawn every 8, 1 wide, outlineVariant;
// - a tick for every chapter they are named in: a line 2 wide in their colour at 55%, from `tickTop` to the foot;
// - with readings: the line through them, smoothed (from each point to the next a cubic Bézier whose two control
//   points are at the middle x, at the first point's y and at the next's), 2.5 wide, round caps, in their colour;
//   filled between it and the middle (the path closed down to the middle at the last point and back to the first):
//   above the middle the accent at 18%, below it error at 16% (each clipped to its half);
// - a dot at each reading (radius 3.5 in their colour; 6 when picked, with a ring of 9, onSurface, 1.5 wide).
// A press anywhere picks the chapter whose point is nearest across (`nearestChapter`). The card: a frame, the cameo
// (40 × 48, radius 9, a press opens them), the name (16, bold) and the shape (14.5, italic, the accent).

import { dartSort } from '../../manuscript/dartSort';
import { byCodeUnits } from './common';
import { type Listed, fieldNamed } from '../cast';
import { type CastData } from '../castData';
import { type EyesPerson } from '../castNames';
import {
  type ArcPoint,
  type CharacterArc,
  type FeelingArcs,
  arcChapters,
  arcReadings,
  arcShapeClassic,
  arcShapeLabel,
} from '../feelingArcs';
import { characterPath } from '../screens/create';
import { clamp } from '../pageText';
import { type ReadThere, bookReading, readThere } from './readings';

/** What to read: the chapters' ids in reading order, the cast, and the key the reading is kept by. */
export function arcsReading(cast: CastData): { order: string[]; people: EyesPerson[]; key: string } {
  const { nodes, people, key } = bookReading(cast);
  return { order: nodes.map((n) => n.id), people, key };
}

/** A chapter's feeling, said in a word. */
export function feelingWord(feeling: number | null): string {
  if (feeling === null) return 'no feeling written';
  if (feeling > 0.15) return 'bright';
  if (feeling < -0.15) return 'dark';
  return 'mixed';
}

/** One scale for the cast, set by the strongest feeling in the book (at least 0.25), so the lines can be compared and
 * still fill their height. */
export function arcScale(arcs: FeelingArcs): number {
  let scale = 0.25;
  for (const a of arcs.arcs) for (const p of a.points) if (p.feeling !== null && Math.abs(p.feeling) > scale) scale = Math.abs(p.feeling);
  return scale;
}

/** The height of a line. */
export const arcLineHeight = 96.0;

/** Where a chapter is across a line `width` wide in a book of `chapters`. */
export function arcX(chapter: number, chapters: number, width: number): number {
  return chapters <= 1 ? width / 2 : 8 + ((chapter - 1) * (width - 16)) / (chapters - 1);
}

/** The chapter a press at `x` picks: the one whose point is nearest across (the first of equals), or null with none. */
export function nearestChapter(arc: CharacterArc, chapters: number, width: number, x: number): number | null {
  let best: ArcPoint | null = null;
  for (const p of arc.points) {
    if (best === null || Math.abs(arcX(p.chapter, chapters, width) - x) < Math.abs(arcX(best.chapter, chapters, width) - x)) {
      best = p;
    }
  }
  return best === null ? null : best.chapter;
}

/** Everything the line is drawn with (see the head of this file). `path`: an SVG path of the line; `area`: of its fill
 * (closed); both null with no reading. */
export function arcLine(
  arc: CharacterArc,
  chapters: number,
  scale: number,
  width: number,
  picked: number | null,
): {
  width: number;
  height: number;
  mid: number;
  dashes: { x1: number; x2: number }[];
  ticks: { x: number; top: number; bottom: number }[];
  points: { chapter: number; x: number; y: number; radius: number; ring: number | null }[];
  path: string | null;
  area: string | null;
} {
  const height = arcLineHeight;
  const ticks = 8.0;
  const mid = (height - ticks) / 2;
  const reach = mid - 8;
  const yOf = (f: number) => mid - clamp(f / scale, -1.0, 1.0) * reach;
  const xOf = (c: number) => arcX(c, chapters, width);
  const dashes: { x1: number; x2: number }[] = [];
  for (let x = 0.0; x < width; x += 8) dashes.push({ x1: x, x2: x + 4 });
  const readings = arc.points.filter((p) => p.feeling !== null);
  const pts = readings.map((p) => ({ x: xOf(p.chapter), y: yOf(p.feeling!) }));
  let path: string | null = null;
  let area: string | null = null;
  if (pts.length > 0) {
    let d = `M${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const cx = (a.x + b.x) / 2;
      d += ` C${cx} ${a.y} ${cx} ${b.y} ${b.x} ${b.y}`;
    }
    path = d;
    area = `${d} L${pts[pts.length - 1].x} ${mid} L${pts[0].x} ${mid} Z`;
  }
  return {
    width,
    height,
    mid,
    dashes,
    ticks: arc.points.map((p) => ({ x: xOf(p.chapter), top: height - ticks + 2, bottom: height })),
    points: readings.map((p, i) => ({
      chapter: p.chapter,
      x: pts[i].x,
      y: pts[i].y,
      radius: p.chapter === picked ? 6 : 3.5,
      ring: p.chapter === picked ? 9 : null,
    })),
    path,
    area,
  };
}

/** The arc they were meant to have, from their profile. */
export type PlannedArc = { heading: string; lines: { label: string; text: string }[] } | { plan: string; path: string };

/** One character's card. */
export type ArcCard = {
  arc: CharacterArc;
  listed: Listed;
  key: string;
  name: string;
  shape: string;
  path: string;
  semanticsLabel: string;
  said: string;
  /** The chapter pressed, or the hint to press one. */
  picked:
    | { hint: string }
    | {
        point: ArcPoint;
        heading: string;
        none: string | null;
        lines: { quote: string; read: ReadThere; tooltip: string }[];
      };
  flat: string | null;
  planned: PlannedArc;
};

function arcCard(arc: CharacterArc, l: Listed, chapters: number, picked: number | null): ArcCard {
  const shape = arc.shape;
  const name = l.entry.name;
  const point = picked === null ? null : (arc.points.find((p) => p.chapter === picked) ?? null);
  const from = fieldNamed(l.entry, 'Starting Point');
  const to = fieldNamed(l.entry, 'Intended Resolution');
  const now = fieldNamed(l.entry, 'Current State');
  return {
    arc,
    listed: l,
    key: `arc-${arc.id}`,
    name,
    shape:
      shape === null
        ? 'Too short a line yet to name its shape'
        : arcShapeClassic[shape].length === 0
          ? arcShapeLabel[shape]
          : `${arcShapeLabel[shape]}: ${arcShapeClassic[shape]}`,
    path: characterPath(arc.id),
    semanticsLabel: `${name} through the book: ${arc.points.map((p) => `chapter ${p.chapter} ${feelingWord(p.feeling)}`).join(', ')}`,
    said: [
      `Named in ${arc.points.length} of ${chapters} chapters`,
      ...(arc.high !== null && (arc.high.feeling ?? 0) > 0 ? [`brightest in chapter ${arc.high.chapter}`] : []),
      ...(arc.low !== null && (arc.low.feeling ?? 0) < 0 ? [`darkest in chapter ${arc.low.chapter}`] : []),
    ].join(' · '),
    picked:
      point === null
        ? { hint: 'Press the line at a chapter to see the words that put it there.' }
        : {
            point,
            heading: `Chapter ${point.chapter}: ${feelingWord(point.feeling)} · named ${point.mentions} ${point.mentions === 1 ? 'time' : 'times'}`,
            none: point.lines.length === 0 ? 'No word of feeling in the sentences that name them here.' : null,
            lines: point.lines.map((line) => ({
              quote: `“${line.sentence}”`,
              read: readThere(point.nodeId, line.sentence, line.block),
              tooltip: 'Read it there',
            })),
          },
    flat:
      shape === 'flat'
        ? `A flat line can be a choice (a steady one who changes others), or a sign the book has not moved ${name} yet.`
        : null,
    planned:
      from.length > 0 || to.length > 0
        ? {
            heading: 'THE ARC YOU PLANNED',
            lines: [
              ...(from.length > 0 ? [{ label: 'From', text: from }] : []),
              ...(now.length > 0 ? [{ label: 'Now', text: now }] : []),
              ...(to.length > 0 ? [{ label: 'To', text: to }] : []),
            ],
          }
        : { plan: 'Plan their arc', path: characterPath(arc.id) },
  };
}

/** The view, once read (`arcs`: what feelingArcsJob gave). `picked`: the chapter pressed on each line, by character. */
export function castArcs(
  cast: CastData,
  arcs: FeelingArcs,
  picked: ReadonlyMap<string, number>,
): { empty: string } | { caption: string; scale: number; cards: ArcCard[]; thin: string | null } {
  const byId = new Map(cast.list.map((l) => [l.entry.id, l]));
  const scale = arcScale(arcs);
  if (arcs.arcs.length === 0) {
    return {
      empty:
        arcs.chapters === 0
          ? 'No chapter has words yet. Once there are, each character’s line through the book is drawn here.'
          : 'No one in the cast is in enough of the book to draw a line yet: one is drawn once a character is named in ' +
            `${arcChapters} chapters, with something felt about them in ${arcReadings}.`,
    };
  }
  return {
    caption:
      'Each character’s line through the book, read from the words of feeling in the sentences that name them. Above ' +
      'the line, bright: hope, laughed, safe. Below, dark: fear, wept, alone.',
    scale,
    cards: arcs.arcs.flatMap((arc) => {
      const l = byId.get(arc.id);
      return l === undefined ? [] : [arcCard(arc, l, arcs.chapters, picked.get(arc.id) ?? null)];
    }),
    thin:
      arcs.thin.length === 0
        ? null
        : `Too little on the page to draw yet: ${dartSort(
            arcs.thin.map((id) => byId.get(id)?.entry.name ?? 'someone'),
            byCodeUnits,
          ).join(', ')}.`,
  };
}

/** A chapter pressed on `id`'s line: the chapters picked after it (the same again unpicks it). */
export function arcPicked(picked: ReadonlyMap<string, number>, id: string, chapter: number): Map<string, number> {
  const next = new Map(picked);
  if (next.get(id) === chapter) next.delete(id);
  else next.set(id, chapter);
  return next;
}
