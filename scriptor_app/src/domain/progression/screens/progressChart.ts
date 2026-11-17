// A value over the story, drawn as steps: each setting holds until the next. The pure parts of
// flutter_app/lib/features/progression/widgets/progress_chart.dart: what can be drawn (`chartSeries`) and where
// everything goes.
//
// The chart: when there are several series, a chip for each (the one shown selected); then a box 180 high, as wide as
// it is given. Inside it, `chartLeft` (72) for the scale's labels and `chartPad` (12) at the right, top and bottom.
// The scale (`chartMarks`): a grid line across (1 wide, outlineVariant) at each mark, its label (labelSmall,
// onSurfaceVariant, one line, at most 64 wide, right-aligned to 8 short of the plot, centred on the line), every
// `step`th label shown (and the last). The line (`chartPath`): primary, 2.5 wide, held flat until the next setting then
// straight up or down; a dot at each setting (radius 4.5; 7 when chosen, with a ring of 10, 2 wide). A tap chooses the
// nearest setting within 40 (`nearestPoint`), else none. Under it, the caption (`chartCaption`).

import { localeCompare } from '../../exchange/collation';
import { dartSort } from '../../manuscript/dartSort';
import { type StoryModel } from '../../model/storyModel';
import { type ProgressCategory, type ProgressChange } from '../../records/progress';
import { dartDoubleTryParse } from '../../records/dartNum';
import { dartToLowerCase, dartTrim } from '../../text/dartString';
import { changeLog } from '../track';

/** A setting drawn: where it sits in the change log, the number drawn, and its words. */
export type ChartPoint = { at: number; y: number; value: string; when: string };

/** One line drawn: a value (or one named value) whose recorded settings are numbers, or steps of its own ladder. */
export type ChartSeries = {
  name: string;
  /** Each setting in the story's order. */
  points: ChartPoint[];
  /** The category's steps, lowest first, when the values are read as steps; empty for plain numbers. */
  ladder: string[];
};

/** What can be drawn of one character's progression: only values set more than once, and only when every setting
 * reads as a number, or as a step of the category's own ladder. Nothing is guessed from words. */
export function chartSeries(model: StoryModel, entryId: string): ChartSeries[] {
  const log = changeLog(model, entryId);
  const lines = new Map<string, { category: ProgressCategory; subject: string; sets: [number, ProgressChange, string][] }>();
  log.forEach((l, i) => {
    const category = l.category;
    if (category === null || l.change.action !== 'set') return;
    if (category.shape !== 'value' && category.shape !== 'named') return;
    const subject = category.shape === 'named' ? dartTrim(l.change.subject) : '';
    const key = `${category.id}|${dartToLowerCase(subject)}`;
    let line = lines.get(key);
    if (line === undefined) lines.set(key, (line = { category, subject, sets: [] }));
    line.sets.push([i, l.change, l.when]);
  });
  const out: ChartSeries[] = [];
  for (const line of lines.values()) {
    if (line.sets.length < 2) continue;
    const ladder = line.category.ladder;
    const steps = new Map(ladder.map((s, i) => [dartToLowerCase(dartTrim(s)), i]));
    const asSteps = ladder.length > 0 && line.sets.every((s) => steps.has(dartToLowerCase(dartTrim(s[1].value))));
    const numbers = line.sets.map((s) => dartDoubleTryParse(dartTrim(s[1].value).split(',').join('')));
    if (!asSteps && numbers.some((n) => n === null)) continue;
    const name = line.subject.length === 0 ? line.category.name : `${line.category.name}: ${line.subject}`;
    out.push({
      name,
      points: line.sets.map(([at, change, said], k) => ({
        at,
        y: asSteps ? steps.get(dartToLowerCase(dartTrim(change.value)))! : numbers[k]!,
        value: change.value,
        when: said,
      })),
      ladder: asSteps ? ladder : [],
    });
  }
  return dartSort(out, (a, b) => localeCompare(a.name, b.name));
}

export const chartHeight = 180;
export const chartLeft = 72;
export const chartPad = 12;

/** The lowest and highest the chart shows: the ladder's steps, or the values (one either side when all are equal). */
export function chartRange(series: ChartSeries): { low: number; high: number } {
  if (series.ladder.length > 0) return { low: 0, high: Math.max(1, series.ladder.length - 1) };
  const ys = series.points.map((p) => p.y);
  let low = ys.reduce((a, b) => Math.min(a, b));
  let high = ys.reduce((a, b) => Math.max(a, b));
  if (low === high) {
    low -= 1;
    high += 1;
  }
  return { low, high };
}

/** Where a setting is drawn in a box `width` × `height`, for a change log of `length` changes (at least 1). */
export function chartOffset(
  p: { at: number; y: number },
  series: ChartSeries,
  length: number,
  width: number,
  height = chartHeight,
): { x: number; y: number } {
  const { low, high } = chartRange(series);
  const w = width - chartLeft - chartPad;
  const h = height - chartPad * 2;
  const x = chartLeft + (length <= 1 ? w / 2 : (p.at / (length - 1)) * w);
  const y = chartPad + h - ((p.y - low) / (high - low)) * h;
  return { x, y };
}

/** A number on the scale: a whole number plainly, else to one place. */
export function chartNumber(v: number): string {
  return v === Math.round(v) ? String((v < 0 ? -Math.round(-v) : Math.round(v)) + 0) : v.toFixed(1);
}

/** The scale: the ladder's own steps, or the lowest, middle and highest values; each with its height, its label, and
 * whether the label is shown. */
export function chartMarks(series: ChartSeries, length: number, width: number, height = chartHeight): { y: number; text: string; labelled: boolean }[] {
  const { low, high } = chartRange(series);
  const marks: [number, string][] =
    series.ladder.length > 0 ? series.ladder.map((s, i) => [i, s]) : [low, (low + high) / 2, high].map((v) => [v, chartNumber(v)]);
  const step = series.ladder.length > 8 ? Math.ceil(series.ladder.length / 8) : 1;
  return marks.map(([v, text], i) => ({
    y: chartOffset({ at: 0, y: v }, series, Math.max(length, 1), width, height).y,
    text,
    labelled: i % step === 0 || i === marks.length - 1,
  }));
}

/** The line as an SVG path: each setting held until the next, across, then up or down. */
export function chartPath(series: ChartSeries, length: number, width: number, height = chartHeight): string {
  const len = Math.max(length, 1);
  const parts: string[] = [];
  series.points.forEach((p, i) => {
    const o = chartOffset(p, series, len, width, height);
    if (i === 0) {
      parts.push(`M${o.x} ${o.y}`);
    } else {
      const before = chartOffset(series.points[i - 1], series, len, width, height);
      parts.push(`L${o.x} ${before.y}`, `L${o.x} ${o.y}`);
    }
  });
  return parts.join(' ');
}

/** The setting a tap at (`x`, `y`) chooses: the nearest within 40, else null. */
export function nearestPoint(series: ChartSeries, length: number, width: number, x: number, y: number, height = chartHeight): number | null {
  let best = -1;
  let far = Number.POSITIVE_INFINITY;
  series.points.forEach((p, i) => {
    const o = chartOffset(p, series, Math.max(length, 1), width, height);
    const dist = Math.hypot(o.x - x, o.y - y);
    if (dist < far) {
      far = dist;
      best = i;
    }
  });
  return far <= 40 ? best : null;
}

const pointWords = (p: ChartPoint): string => `${p.value} (${p.when})`;

/** What a screen reader hears of the chart. */
export function chartLabel(series: ChartSeries): string {
  return `${series.name} over the story, ${series.points.length} settings: ${series.points.map(pointWords).join('; ')}.`;
}

/** The line under the chart: what to do, or the setting chosen. */
export function chartCaption(series: ChartSeries, chosen: number | null): string {
  const point = chosen === null ? null : series.points[chosen];
  return point === null || point === undefined ? 'Tap a point to see when it was set.' : `${series.name}: ${pointWords(point)}`;
}
