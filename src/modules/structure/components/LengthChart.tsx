import { useRef, useState, type KeyboardEvent } from 'react';
import { formatNumber } from '@/shared/format';
import type { LengthBar, PartBand } from '../pacing';

const AXIS_W = 58;
const BAR_W = 30;
const TOP = 46;
const PLOT_H = 190;
const BOTTOM = 26;

interface LengthChartProps {
  bars: LengthBar[];
  bands: PartBand[];
  /** Markers by the bar they fall on. */
  markers: Map<number, string[]>;
  average: number;
  /** A label to pick out: bars without it are dimmed. */
  label: string | null;
  selectedId: string | null;
  onSelect: (nodeId: string) => void;
  /** What a bar says, read aloud. */
  words: (bar: LengthBar, index: number) => string;
}

const clip = (text: string, n: number) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);
/** A round number at or above `n`, for the top of the scale. */
const niceMax = (n: number) => {
  if (n <= 0) return 100;
  const step = 10 ** Math.floor(Math.log10(n));
  return Math.ceil(n / step) * step;
};

/**
 * Words per chapter (or scene), in reading order: a bar for each, the
 * volumes, acts and arcs they sit in as bands behind them, and the author's
 * markers as flags. A chapter with no words yet has an empty, dashed bar.
 * One stop in the tab order: the arrow keys move between bars, Enter
 * selects one.
 */
export function LengthChart({ bars, bands, markers, average, label, selectedId, onSelect, words }: LengthChartProps) {
  const [focus, setFocus] = useState(0);
  const refs = useRef(new Map<number, SVGGElement>());
  const max = niceMax(Math.max(0, ...bars.map((b) => b.words)));
  const width = AXIS_W + bars.length * BAR_W + 16;
  const height = TOP + PLOT_H + BOTTOM;
  const x = (i: number) => AXIS_W + i * BAR_W;
  const y = (w: number) => TOP + PLOT_H - (w / max) * PLOT_H;
  const move = (i: number) => {
    const next = Math.max(0, Math.min(bars.length - 1, i));
    setFocus(next);
    refs.current.get(next)?.focus();
  };
  const onKey = (e: KeyboardEvent, i: number) => {
    const keys: Record<string, () => void> = { ArrowRight: () => move(i + 1), ArrowLeft: () => move(i - 1), Home: () => move(0), End: () => move(bars.length - 1), Enter: () => onSelect(bars[i].nodeId), ' ': () => onSelect(bars[i].nodeId) };
    if (!keys[e.key]) return;
    e.preventDefault();
    keys[e.key]();
  };
  const sceneNumber = (i: number) => bars.slice(0, i + 1).filter((b) => b.chapterId === bars[i].chapterId).length;
  const short = (i: number) => (bars.filter((b) => b.chapterId === bars[i].chapterId).length > 1 ? `${bars[i].chapterNumber}.${sceneNumber(i)}` : `${bars[i].chapterNumber}`);

  return (
    <div className="table-scroll ps-scroll">
      <svg className="ps-chart" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-label={`Length chart: ${bars.length} ${bars.length === 1 ? 'bar' : 'bars'} in reading order, the tallest ${formatNumber(Math.max(0, ...bars.map((b) => b.words)))} words. Arrow keys move between bars, Enter selects one.`}>
        {bands.map((band, i) => (
          <g key={`${band.partId}-${band.from}`} className={`ps-band${i % 2 ? ' odd' : ''}`} aria-hidden="true">
            <rect x={x(band.from)} y={TOP - 4} width={(band.to - band.from + 1) * BAR_W} height={PLOT_H + 4} />
            <text x={x(band.from) + 4} y={TOP - 30} className="ps-band-label">
              {clip(band.title, Math.max(4, Math.floor(((band.to - band.from + 1) * BAR_W) / 7)))}
              <title>{band.title}</title>
            </text>
          </g>
        ))}
        {[0, max / 2, max].map((tick) => (
          <g key={tick} aria-hidden="true">
            <line x1={AXIS_W - 4} x2={width - 8} y1={y(tick)} y2={y(tick)} className="ps-grid" />
            <text x={AXIS_W - 8} y={y(tick)} dy="0.35em" textAnchor="end" className="ps-tick">
              {formatNumber(Math.round(tick))}
            </text>
          </g>
        ))}
        {bars.map((bar, i) => {
          const dim = label !== null && !bar.labels.some((l) => l.toLowerCase() === label.toLowerCase());
          const selected = bar.nodeId === selectedId;
          const h = Math.max(0, TOP + PLOT_H - y(bar.words));
          return (
            <g
              key={bar.nodeId}
              ref={(el) => void (el ? refs.current.set(i, el) : refs.current.delete(i))}
              className={`ps-bar-g${dim ? ' dim' : ''}${selected ? ' selected' : ''}`}
              role="button"
              tabIndex={i === Math.min(focus, bars.length - 1) ? 0 : -1}
              aria-pressed={selected}
              aria-label={words(bar, i)}
              onClick={() => {
                setFocus(i);
                onSelect(bar.nodeId);
              }}
              onKeyDown={(e) => onKey(e, i)}
              onFocus={() => setFocus(i)}
            >
              <rect x={x(i)} y={TOP - 4} width={BAR_W} height={PLOT_H + 4} className="ps-hit" />
              {bar.words > 0 ? <rect x={x(i) + 4} y={TOP + PLOT_H - h} width={BAR_W - 8} height={h} className="ps-bar" /> : <rect x={x(i) + 4} y={TOP + PLOT_H - 8} width={BAR_W - 8} height={8} className="ps-bar empty" />}
              <text x={x(i) + BAR_W / 2} y={TOP + PLOT_H + 16} textAnchor="middle" className="ps-x">
                {short(i)}
              </text>
            </g>
          );
        })}
        {average > 0 && (
          <g aria-hidden="true">
            <line x1={AXIS_W} x2={width - 8} y1={y(average)} y2={y(average)} className="ps-average" />
            <text x={width - 10} y={y(average) - 4} textAnchor="end" className="ps-average-label">
              average {formatNumber(average)}
            </text>
          </g>
        )}
        {[...markers.entries()].map(([i, kinds]) => (
          <g key={i} aria-hidden="true" className="ps-marker">
            <line x1={x(i) + BAR_W / 2} x2={x(i) + BAR_W / 2} y1={TOP - 14} y2={TOP + PLOT_H} />
            <path d={`M${x(i) + BAR_W / 2} ${TOP - 18} l8 4 -8 4z`} />
            <text x={x(i) + BAR_W / 2 + 10} y={TOP - 11} className="ps-marker-label">
              {clip(kinds.join(', '), 18)}
              <title>{kinds.join(', ')}</title>
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
