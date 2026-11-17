// Visualize › Timeline: the novel's events drawn along story time (or listed), split into tracks. The pure parts of
// flutter_app/lib/features/timeline/timeline_view_page.dart and widgets/timeline_chart.dart: the words, the bands
// and each mark's geometry (what the chart's painter draws, in the same order and sizes), where a tap lands, and what
// "Jump to date" and "Show from … until" do. Arranging and zooming only change how it looks: nothing here moves an
// event in time or writes anything.
//
// The drawing: a tick row 28 high, then a band per track shown: folded 30 high; else a heading 28, a row of 36 per
// lane (at least one) and 8 below. A rule (outline at 50%) above each band, its heading at (4, top + 5). The marks
// (in the accent colour; `markDrawing` gives every shape):
//  moment     a dot of 5 (a ring of 8, 3 wide, when selected)
//  uncertain  a band from start to end 10 high (radius 5), or when under 14 wide a ring of 7 round its middle; filled
//             at 18%, its edge dashed (4 on, 4 off, 1.5 wide), a dot of 3.5 at its middle
//  lasting    a bar 10 high (radius 3) over the stretch it is certainly going on; hatched (20% fill and lines 5 apart,
//             1.2 wide) over the stretches its start or end falls in
//  ongoing    a lasting bar to the right edge, with an arrow 10 long and 16 high
//  unended    a bar 48 long fading out, and a "?" after it
// A bar sits 8 lower in its row with its name above it; every other mark has its name beside it. Names are at most
// 140 wide (labelWidth - 10), bold when selected.

import { plural } from '../../desk/format';
import type { Calendar } from '../../records/calendar';
import type { TimeAxis, AxisMark, MarkKind, Unplaced } from '../../timeline/axis';
import type { EventRecord } from '../../timeline/eventRecord';
import { type TimeWindow, chooseScale, readDate, scaleName } from '../../timeline/scale';
import type { Grouping, Track } from '../../timeline/tracks';

/** One band of the drawing: a track and its marks, laid out once for the whole story so a mark never changes row
 * while zooming. */
export type ChartTrack = { track: Track; axis: TimeAxis };

export const chartSizes = { lane: 36, header: 28, folded: 30, ticks: 28, labelWidth: 150, bar: 10 } as const;

/** What a mark is, said aloud. */
export function markWords(m: AxisMark): string {
  const rough = m.startFuzz !== null || m.endFuzz !== null;
  switch (m.kind) {
    case 'moment':
      return `${m.title}, ${m.when}, an exact moment`;
    case 'uncertain':
      return `${m.title}, ${m.when}, somewhere in that stretch of time`;
    case 'lasting':
      return `${m.title}, ${m.when}, lasting a while${rough ? '; its start and end are known only roughly' : ''}`;
    case 'ongoing':
      return `${m.title}, ${m.when}`;
    case 'unended':
      return `${m.title}, ${m.when}, lasting a while`;
  }
}

const bandOf = (t: ChartTrack): number =>
  t.track.folded ? chartSizes.folded : chartSizes.header + Math.max(1, t.axis.lanes) * chartSizes.lane + 8;

export function chartHeight(tracks: readonly ChartTrack[]): number {
  return chartSizes.ticks + tracks.reduce((sum, t) => sum + bandOf(t), 0);
}

/** A band's heading. */
export function trackHeading(t: Track): string {
  const n = t.eventIds.length;
  return t.folded ? `${t.label} — folded, ${n} ${n === 1 ? 'event' : 'events'}` : t.label;
}

/** Where story time `t` is drawn in a drawing `width` wide showing `window`. */
export function xOf(window: TimeWindow, t: number, width: number): number {
  return ((t - window.from) / (window.to - window.from)) * width;
}

export type Rect = { left: number; top: number; right: number; bottom: number };

/** Where each mark was drawn, for taps and for screen readers: the band's row, from the mark's start to its end or
 * its name's room, whichever is wider. */
export type ChartHit = { rect: Rect; mark: AxisMark; track: string };

export type ChartBand = { top: number; height: number; heading: string; folded: boolean; track: Track };

export function chartBands(tracks: readonly ChartTrack[]): ChartBand[] {
  let top: number = chartSizes.ticks;
  return tracks.map((t) => {
    const band = { top, height: bandOf(t), heading: trackHeading(t.track), folded: t.track.folded, track: t.track };
    top += band.height;
    return band;
  });
}

export function chartHits(tracks: readonly ChartTrack[], window: TimeWindow, width: number): ChartHit[] {
  const hits: ChartHit[] = [];
  let top: number = chartSizes.ticks;
  for (const t of tracks) {
    if (t.track.folded) {
      top += chartSizes.folded;
      continue;
    }
    for (const m of t.axis.marks) {
      const left = xOf(window, m.start, width);
      const right = m.kind === 'ongoing' ? width : Math.max(xOf(window, m.end, width), left);
      const y = top + chartSizes.header + m.lane * chartSizes.lane;
      hits.push({
        rect: { left: left - 6, top: y + 2, right: Math.max(right, left + chartSizes.labelWidth), bottom: y + chartSizes.lane - 2 },
        mark: m,
        track: t.track.label,
      });
    }
    top += chartSizes.header + Math.max(1, t.axis.lanes) * chartSizes.lane + 8;
  }
  return hits;
}

/** The mark under a tap at (x, y), the last drawn first (as the painter's `hit`): each mark's room grown by 4. */
export function hitAt(hits: readonly ChartHit[], x: number, y: number): string | null {
  for (let i = hits.length - 1; i >= 0; i--) {
    const r = hits[i].rect;
    if (x >= r.left - 4 && x < r.right + 4 && y >= r.top - 4 && y < r.bottom + 4) return hits[i].mark.id;
  }
  return null;
}

/** A shape of a mark, in drawing order. `fill` is the accent at `alpha`; `ring` the selection's outline (onSurface,
 * 3 wide). */
export type MarkShape =
  | { kind: 'circle'; cx: number; cy: number; r: number; paint: 'fill' | 'ring' }
  | { kind: 'rrect'; left: number; top: number; right: number; bottom: number; radius: number; paint: 'fill' | 'tint' | 'dashed' | 'ring' }
  | { kind: 'hatch'; left: number; top: number; right: number; bottom: number; lines: { x1: number; y1: number; x2: number; y2: number }[] }
  | { kind: 'arrow'; points: [number, number][] }
  | { kind: 'fade'; left: number; top: number; right: number; bottom: number }
  | { kind: 'question'; x: number; y: number };

/** A mark as drawn: its shapes, and where its name goes. A bar's name sits on the line `bottom` (just above the bar);
 * any other mark's name is centred on `y`, starting at `x`. */
export type MarkDrawing = {
  id: string;
  selected: boolean;
  shapes: MarkShape[];
  label: { text: string; x: number; y: number; above: boolean; maxWidth: number; bold: boolean };
};

/** How many hatch lines a stretch takes at most (a guard: the painter's loop ends on its own). */
const hatchLimit = 4000;

function hatched(left: number, top: number, right: number, bottom: number): MarkShape | null {
  if (right - left <= 0) return null;
  const h = bottom - top;
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  let x = left - h;
  for (let i = 0; i < hatchLimit && x < right; i++, x += 5) lines.push({ x1: x, y1: bottom, x2: x + h, y2: top });
  return { kind: 'hatch', left, top, right, bottom, lines };
}

/** Every mark of a band as the painter draws it: `centre` is the middle of the mark's row. */
export function markDrawing(m: AxisMark, centre: number, window: TimeWindow, width: number, selected: string | null): MarkDrawing {
  let y = centre;
  const x = (t: number) => xOf(window, t, width);
  const left = x(m.start);
  const right = m.kind === 'ongoing' ? width : Math.max(x(m.end), left);
  const isSelected = m.id === selected;
  const h = chartSizes.bar;
  let labelAt = left + 8;
  const bar = m.kind === 'lasting' || m.kind === 'ongoing' || (m.kind === 'uncertain' && Math.max(x(m.end), left) - left >= 14);
  if (bar) y += 8;
  const shapes: MarkShape[] = [];
  switch (m.kind) {
    case 'moment':
      shapes.push({ kind: 'circle', cx: left, cy: y, r: 5, paint: 'fill' });
      if (isSelected) shapes.push({ kind: 'circle', cx: left, cy: y, r: 8, paint: 'ring' });
      break;
    case 'uncertain': {
      const middle = (left + right) / 2;
      const small = right - left < 14;
      const rect = small
        ? { left: middle - 7, top: y - 7, right: middle + 7, bottom: y + 7, radius: 7 }
        : { left, top: y - h / 2, right, bottom: y + h / 2, radius: 5 };
      shapes.push({ kind: 'rrect', ...rect, paint: 'tint' });
      shapes.push({ kind: 'rrect', ...rect, paint: 'dashed' });
      shapes.push({ kind: 'circle', cx: middle, cy: y, r: 3.5, paint: 'fill' });
      if (isSelected) {
        shapes.push({ kind: 'rrect', left: rect.left - 3, top: rect.top - 3, right: rect.right + 3, bottom: rect.bottom + 3, radius: rect.radius + 3, paint: 'ring' });
      }
      labelAt = Math.max(right, middle + 7) + 6;
      break;
    }
    case 'lasting':
    case 'ongoing': {
      const solidFrom = m.startFuzz === null ? left : x(m.startFuzz.hi);
      const solidTo = m.endFuzz === null ? right : x(m.endFuzz.lo);
      if (m.startFuzz !== null) {
        const s = hatched(left, y - h / 2, Math.max(left, solidFrom), y + h / 2);
        if (s) shapes.push(s);
      }
      if (m.endFuzz !== null) {
        const s = hatched(Math.min(right, solidTo), y - h / 2, right, y + h / 2);
        if (s) shapes.push(s);
      }
      shapes.push({ kind: 'rrect', left: solidFrom, top: y - h / 2, right: Math.max(solidTo, solidFrom + 2), bottom: y + h / 2, radius: 3, paint: 'fill' });
      if (m.kind === 'ongoing') {
        shapes.push({ kind: 'arrow', points: [[width - 10, y - 8], [width, y], [width - 10, y + 8]] });
      }
      if (isSelected) {
        shapes.push({ kind: 'rrect', left: left - 3, top: y - h / 2 - 3, right: right + 3, bottom: y + h / 2 + 3, radius: 0, paint: 'ring' });
      }
      break;
    }
    case 'unended':
      shapes.push({ kind: 'fade', left, top: y - h / 2, right: left + 48, bottom: y + h / 2 });
      shapes.push({ kind: 'question', x: left + 50, y: y - 9 });
      if (isSelected) shapes.push({ kind: 'rrect', left: left - 3, top: y - h / 2 - 3, right: left + 51, bottom: y + h / 2 + 3, radius: 0, paint: 'ring' });
      labelAt = left + 62;
      break;
  }
  return {
    id: m.id,
    selected: isSelected,
    shapes,
    label: {
      text: m.title === '' ? 'Untitled event' : m.title,
      x: bar ? Math.max(2, left + 2) : labelAt,
      y: bar ? y - h / 2 - 1 : y,
      above: bar,
      maxWidth: chartSizes.labelWidth - 10,
      bold: isSelected,
    },
  };
}

/** The whole drawing: bands, then each band's marks (folded bands draw none). */
export function chartDrawing(
  tracks: readonly ChartTrack[],
  window: TimeWindow,
  width: number,
  selected: string | null,
): { height: number; bands: (ChartBand & { marks: MarkDrawing[] })[] } {
  const bands = chartBands(tracks).map((b, i) => {
    const t = tracks[i];
    const marks = b.folded
      ? []
      : t.axis.marks.map((m) =>
          markDrawing(m, b.top + chartSizes.header + m.lane * chartSizes.lane + chartSizes.lane / 2, window, width, selected),
        );
    return { ...b, marks };
  });
  return { height: chartHeight(tracks), bands };
}

/** The legend: every kind of mark as a shape and in words, never colour alone. */
export const timelineLegend: readonly { kind: MarkKind; words: string }[] = [
  { kind: 'moment', words: 'Exact moment: a dot' },
  { kind: 'uncertain', words: 'Somewhere in this stretch: a dashed band, with a dot at its middle' },
  { kind: 'lasting', words: 'Lasts a while: a bar; hatched where its start or end is known only roughly' },
  { kind: 'ongoing', words: 'Still going on: a bar to the edge, with an arrow' },
  { kind: 'unended', words: 'End not given: a bar fading out, with “?”' },
];

/** What the drawing is said to be, as a screen reader hears it. */
export const chartSemantics =
  'Timeline drawing. Tap an event to choose it; with one chosen, the arrow keys move between events. ' +
  'Otherwise the arrow keys move along time, plus and minus zoom, and 0 shows all of it.';

/** The line over the drawing. */
export function timelineSummary(args: {
  dated: number;
  grouping: Grouping;
  shown: number;
  filtered: boolean;
  matching: number;
  all: number;
}): string {
  return (
    `Timeline of ${plural(args.dated, 'dated event')}, in the order they happen` +
    `${args.grouping.kind === 'none' ? '' : `, on ${plural(args.shown, 'track')}`}` +
    `${args.filtered ? ` (${args.matching} of ${args.all} events match)` : ''}.`
  );
}

/** What the zoom shows, in words ("Showing years"). */
export function showingWords(window: TimeWindow, calendar: Calendar): string {
  const s = chooseScale(window, 900, calendar);
  return `Showing ${scaleName(s.unit, s.step)}`;
}

const unreadable =
  'is not a date this timeline can read. Try a year (10, -500), a year and month (10-6), a day (10-6-14) or a month by name (June 10).';

/** "Jump to date": what was typed, shown with its neighbours (three times its length); or why not. */
export function jumpTo(text: string, calendar: Calendar, hasDates: boolean): { window: TimeWindow } | { message: string } {
  const read = readDate(text, calendar);
  if (read === null || !hasDates) return { message: `“${text.trim()}” ${unreadable}` };
  return { window: { from: read.t - read.length, to: read.t + 2 * read.length } };
}

/** "Show from … until …": that stretch, from the start of the first to the end of the second; or why not. */
export function showRange(from: string, until: string, calendar: Calendar): { window: TimeWindow } | { message: string } {
  const a = readDate(from, calendar);
  const b = readDate(until, calendar);
  if (a === null || b === null) return { message: `“${(a === null ? from : until).trim()}” ${unreadable}` };
  if (b.t + b.length <= a.t) return { message: 'The stretch ends before it starts, so there is nothing to show.' };
  return { window: { from: a.t, to: b.t + b.length } };
}

/** The marks in story order (by start, then title), for moving from one event to the next. */
export function marksInOrder(tracks: readonly ChartTrack[]): AxisMark[] {
  const marks = new Map<string, AxisMark>();
  for (const t of tracks) {
    if (t.track.folded) continue;
    for (const m of t.axis.marks) if (!marks.has(m.id)) marks.set(m.id, m);
  }
  return [...marks.values()].sort((a, b) => (a.start !== b.start ? a.start - b.start : a.title < b.title ? -1 : a.title > b.title ? 1 : 0));
}

/** Events with no date that can be worked out, listed apart with why (each once). */
export function unplacedLines(unplaced: readonly Unplaced[]): { id: string; text: string }[] {
  const seen = new Set<string>();
  const out: { id: string; text: string }[] = [];
  for (const u of unplaced) {
    if (seen.has(u.id)) continue;
    seen.add(u.id);
    out.push({ id: u.id, text: `${u.title === '' ? 'Untitled event' : u.title}: ${u.reason}` });
  }
  return out;
}

/** The list form: a track's events in story order (those with no date last), as rows. */
export function trackRows(track: Track, records: ReadonlyMap<string, EventRecord>): { id: string; title: string; subtitle: string }[] {
  const rows = track.eventIds.map((id) => records.get(id)).filter((r): r is EventRecord => r !== undefined);
  const start = (r: EventRecord) => r.bounds?.start.lo ?? Infinity;
  // Dart's List.sort with a comparison that only looks at the start: ties keep no promised order; a stable sort here.
  const sorted = rows.map((r, i) => ({ r, i })).sort((a, b) => (start(a.r) !== start(b.r) ? (start(a.r) < start(b.r) ? -1 : 1) : a.i - b.i));
  return sorted.map(({ r }) => ({
    id: r.id,
    title: r.title === '' ? 'Untitled event' : r.title,
    subtitle: r.bounds === null ? 'Not placed in time' : r.label,
  }));
}

/** The "Arrange tracks" button. */
export const arrangeLabel = (shown: number, all: number): string => `Arrange tracks (${shown} of ${all} shown)`;

export const timelineWords = {
  title: 'Timeline',
  drawing: 'Drawing',
  list: 'List',
  shown: 'Timeline shown',
  tracksBy: 'Tracks by',
  emptyTitle: 'No events yet',
  emptyMessage: 'Events you add on the timeline are drawn here, in the order they happen.',
  addEvent: 'Add event',
  allHidden: 'Every track is hidden, so there is nothing to show.',
  showAll: 'Show all tracks',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  back: 'Back in time',
  on: 'On in time',
  fit: 'Fit all',
  goTo: 'Go to a date or a stretch',
  hide: 'Hide',
  jump: 'Jump to date',
  jumpHint: '10, 10-6, June 10',
  go: 'Go',
  from: 'Show from',
  until: 'until',
  show: 'Show',
  sameTime: 'At the same time',
  edit: 'Edit this event',
  inHistory: 'Change it in its alternate history',
  notPlaced: 'Not placed in time',
  fold: 'Fold',
  onlyThis: 'Only this',
  showingOnly: (label: string) => `Showing only “${label}”.`,
  folded: (n: number) => `Folded: ${plural(n, 'event')}.`,
  unplaced: (n: number) => `Not placed in time (${n})`,
} as const;
