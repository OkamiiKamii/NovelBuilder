// THE CLIMB, on Systems (../climb.ts works it out): for a character whose sheet has experience logged, their level
// chapter by chapter as a line that steps up where they rise, carried on dashed at the pace so far, with the cap ruled
// across the top; and what it says. A row of names when more than one has climbed. Nothing with no experience logged.
// It only reads. The pure parts of flutter_app/lib/features/progression/widgets/climb_view.dart.
//
// Drawn: a box (surfaceContainerLow, radius 14, a border of outlineVariant; padded 16/14/16/12): a trending-up icon
// (18, primary) and "THE CLIMB" (11, weight 700, primary, letter spacing 2); the caption (14.5, italic,
// onSurfaceVariant); the names as chips; then each climb: the chart 160 high (`climbChart`), and each thing it says
// after a dot of 6 in the primary colour (15, onSurface), 4 below.

import { type StoryModel } from '../../model/storyModel';
import { type SystemBlueprint, type SystemSheet } from '../../records/system';
import { dartTrim } from '../../text/dartString';
import { type Climb, climbsOf } from '../climb';

export const climbWords = { heading: 'THE CLIMB' } as const;

/** Who has climbed (each sheet with a climb), the one shown (`chosen`, else the first), and the caption. Null when
 * nobody has experience logged. */
export function climbView(
  model: StoryModel,
  system: SystemBlueprint,
  chosen: string | null,
): { climbing: { sheet: SystemSheet; name: string; climbs: Climb[] }[]; shown: { sheet: SystemSheet; name: string; climbs: Climb[] }; caption: string; chips: { id: string; label: string; selected: boolean }[] } | null {
  const chapters = model.order.chapters.length;
  const chapterOf = model.order.chapterNumber;
  const climbing = model.sheets
    .filter((s) => s.systemId === system.id && model.entries.has(s.entryId))
    .map((s) => {
      const name = dartTrim(model.entries.get(s.entryId)!.name);
      return { sheet: s, name, climbs: climbsOf(system, s, { chapterOf, chapters, who: name }) };
    })
    .filter((c) => c.climbs.length > 0);
  if (climbing.length === 0) return null;
  const shown = climbing.find((c) => c.sheet.id === chosen) ?? climbing[0];
  return {
    climbing,
    shown,
    caption: `How fast ${shown.name.length === 0 ? 'they' : shown.name} rises, chapter by chapter, and where the pace leads.`,
    chips: climbing.length > 1 ? climbing.map((c) => ({ id: c.sheet.id, label: c.name, selected: c.sheet.id === shown.sheet.id })) : [],
  };
}

/** What a screen reader says of a climb's chart. */
export const climbSemantics = (climb: Climb): string => `${climb.track} by chapter: ${climb.actual.map((p) => `chapter ${p[0]}, ${p[1]}`).join('; ')}`;

/** The chart drawn, in a box `width` × `height` (160): chapters across, levels up; the steps taken solid (the line
 * colour, 2.4, round joins) ending in a dot of 4; the pace dashed (the line colour at 55%, 1.6; 5 on, 4 off along the
 * path); the cap ruled (the error colour at 70%, 4 on, 4 off) when it is on the chart; the axes (the grid colour, 1)
 * and the labels (10, the ink colour, the book face): the highest and lowest level right-aligned 4 left of the axis,
 * "Ch. 0" and "Ch. <last>" 3 under the foot. Paths are SVG path strings. */
export function climbChart(
  climb: Climb,
  width: number,
  height: number,
): {
  left: number;
  top: number;
  plotWidth: number;
  plotHeight: number;
  axes: { x1: number; y1: number; x2: number; y2: number }[];
  labels: { text: string; x: number; y: number; anchor: 'end' | 'start'; middle: boolean }[];
  cap: { y: number; dashes: [number, number][] } | null;
  steps: string;
  here: { x: number; y: number };
  pace: string | null;
} {
  const left = 30;
  const bottom = 18;
  const all = [...climb.actual, ...climb.projected];
  const maxChapter = Math.max(1, all[all.length - 1][0]);
  const minLevel = climb.actual[0][1];
  let maxLevel = all.reduce((n, p) => Math.max(n, p[1]), minLevel);
  if (maxLevel === minLevel) maxLevel = minLevel + 1;
  const w = width - left - 4;
  const h = height - bottom - 6;
  const at = (chapter: number, level: number) => ({ x: left + (w * chapter) / maxChapter, y: 6 + h * (1 - (level - minLevel) / (maxLevel - minLevel)) });
  const stepsFrom = (points: readonly [number, number][], from: { x: number; y: number }): string => {
    let d = `M${from.x} ${from.y}`;
    let last = from;
    for (const [c, l] of points) {
      const next = at(c, l);
      d += ` L${next.x} ${last.y} L${next.x} ${next.y}`;
      last = next;
    }
    return d;
  };
  let cap: { y: number; dashes: [number, number][] } | null = null;
  if (climb.cap > 0 && climb.cap <= maxLevel) {
    const y = at(0, climb.cap).y;
    const dashes: [number, number][] = [];
    for (let x = left; x < left + w; x += 8) dashes.push([x, Math.min(x + 4, left + w)]);
    cap = { y, dashes };
  }
  const start = at(climb.actual[0][0], climb.actual[0][1]);
  const here = at(climb.actual[climb.actual.length - 1][0], climb.actual[climb.actual.length - 1][1]);
  return {
    left,
    top: 6,
    plotWidth: w,
    plotHeight: h,
    axes: [
      { x1: left, y1: 6, x2: left, y2: 6 + h },
      { x1: left, y1: 6 + h, x2: left + w, y2: 6 + h },
    ],
    labels: [
      { text: `${maxLevel}`, x: left - 4, y: 6, anchor: 'end', middle: true },
      { text: `${minLevel}`, x: left - 4, y: 6 + h, anchor: 'end', middle: true },
      { text: 'Ch. 0', x: left, y: 6 + h + 3, anchor: 'start', middle: false },
      { text: `Ch. ${maxChapter}`, x: left + w, y: 6 + h + 3, anchor: 'end', middle: false },
    ],
    cap,
    steps: stepsFrom(climb.actual.slice(1), start),
    here,
    pace: climb.projected.length > 0 ? stepsFrom(climb.projected, here) : null,
  };
}

/** The pace's dash pattern along its path, as SVG's `strokeDasharray` (5 drawn, 4 not: every 9). */
export const paceDash = '5 4';
