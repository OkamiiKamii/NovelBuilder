import { useRef, useState, type KeyboardEvent } from 'react';

/** One bar: what it is, in short and in full, its value, and more about it for the tooltip. */
export interface BarDatum {
  key: string;
  short: string;
  label: string;
  value: number;
  detail: string;
  /** Selecting it picks a record; false for bars that are not one (a band of lengths). */
  selectable: boolean;
}

const compact = (n: number): string => {
  if (Math.abs(n) < 1000) return String(n);
  const k = n / 1000;
  return `${Number.isInteger(k) || Math.abs(n) >= 10_000 ? Math.round(k) : k.toFixed(1)}K`;
};

/** Rounds up to a clean axis value. */
function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return [1, 1.5, 2, 3, 4, 5, 6, 8, 10].map((m) => m * magnitude).find((step) => step >= value)!;
}

interface ChartProps {
  /** Names the chart for a screen reader, with what it shows. */
  label: string;
  /** What a bar's value counts, one and many: ["word", "words"]. */
  units: [string, string];
  bars: BarDatum[];
  selectedKey: string | null;
  onSelect: (bar: BarDatum) => void;
}

/**
 * Columns from a zero baseline, along the story: one series in the chart
 * colour, so no legend (the title names it). Each column shows its value and
 * more on hover or focus; the highest is labelled. One stop in the tab order:
 * the arrow keys move between columns, Enter selects the record one is.
 * Many columns scroll sideways rather than shrink to nothing.
 */
export function ColumnChart({ label, units, bars, selectedKey, onSelect }: ChartProps) {
  const count = (n: number) => `${n.toLocaleString()} ${n === 1 ? units[0] : units[1]}`;
  const [current, setCurrent] = useState(0);
  const refs = useRef(new Map<number, HTMLDivElement>());
  const top = niceCeil(Math.max(0, ...bars.map((b) => b.value)));
  const peak = bars.reduce((best, b) => (b.value > best.value ? b : best), bars[0]);
  const every = Math.max(1, Math.ceil(bars.length / 24));
  const move = (to: number) => {
    const next = Math.max(0, Math.min(bars.length - 1, to));
    setCurrent(next);
    refs.current.get(next)?.focus();
  };
  const onKey = (e: KeyboardEvent, i: number) => {
    const keys: Record<string, () => void> = { ArrowRight: () => move(i + 1), ArrowLeft: () => move(i - 1), Home: () => move(0), End: () => move(bars.length - 1), Enter: () => bars[i].selectable && onSelect(bars[i]), ' ': () => bars[i].selectable && onSelect(bars[i]) };
    if (!keys[e.key]) return;
    e.preventDefault();
    keys[e.key]();
  };
  return (
    <div className="table-scroll">
      <div className="chart-body viz-columns" style={bars.length > 40 ? { minWidth: `${34 + bars.length * 10}px` } : undefined}>
        <div className="chart-axis" aria-hidden="true">
          <span style={{ top: 0 }}>{compact(top)}</span>
          {Number.isInteger(top / 2) && <span style={{ top: '50%' }}>{compact(top / 2)}</span>}
          <span style={{ top: '100%' }}>0</span>
        </div>
        <div className="chart-plot" role="list" aria-label={`${label} Arrow keys move between columns${bars.some((b) => b.selectable) ? ', Enter selects one' : ''}.`}>
          <span className="gridline" style={{ top: 0 }} />
          {Number.isInteger(top / 2) && <span className="gridline" style={{ top: '50%' }} />}
          <span className="gridline baseline" style={{ top: '100%' }} />
          {bars.map((bar, i) => (
            <div
              key={bar.key}
              ref={(el) => void (el ? refs.current.set(i, el) : refs.current.delete(i))}
              className={`chart-col${bar.key === selectedKey ? ' selected' : ''}`}
              role="listitem"
              tabIndex={i === Math.min(current, bars.length - 1) ? 0 : -1}
              aria-label={`${bar.label}: ${count(bar.value)}. ${bar.detail}${bar.key === selectedKey ? '. Selected' : ''}`}
              onFocus={() => setCurrent(i)}
              onKeyDown={(e) => onKey(e, i)}
              onClick={() => (setCurrent(i), bar.selectable && onSelect(bar))}
            >
              <span className="column current" style={{ bottom: 0, height: `${(bar.value / top) * 100}%` }}>
                {bar.key === peak.key && bar.value > 0 && <span className="bar-value">{compact(bar.value)}</span>}
              </span>
              <span className="chart-tip" role="presentation">
                <strong>{count(bar.value)}</strong>
                {bar.label}
                <span className="chart-tip-detail">{bar.detail}</span>
              </span>
              {i % every === 0 && <span className="chart-x">{bar.short}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Horizontal bars for things with names (characters, threads, labels),
 * longest first: the name, the bar, and its value at the tip. A name that
 * is a record is a button that selects it; more shows on hover or focus.
 */
export function BarList({ label, units, bars, selectedKey, onSelect }: ChartProps) {
  const count = (n: number) => `${n.toLocaleString()} ${n === 1 ? units[0] : units[1]}`;
  const top = Math.max(1, ...bars.map((b) => b.value));
  return (
    <ul className="viz-barlist" aria-label={label}>
      {bars.map((bar) => (
        <li key={bar.key} className={bar.key === selectedKey ? 'selected' : ''}>
          {bar.selectable ? (
            <button type="button" className="link viz-bar-name" aria-pressed={bar.key === selectedKey} aria-label={`${bar.label}: ${count(bar.value)}. ${bar.detail}`} onClick={() => onSelect(bar)}>
              {bar.short}
            </button>
          ) : (
            <span className="viz-bar-name" aria-label={`${bar.label}: ${count(bar.value)}. ${bar.detail}`}>
              {bar.short}
            </span>
          )}
          <span className="status-track" aria-hidden="true">
            <span style={{ width: `${(bar.value / top) * 100}%` }} />
          </span>
          <strong aria-hidden="true">{bar.value.toLocaleString()}</strong>
          <span className="chart-tip" role="presentation">
            <strong>{count(bar.value)}</strong>
            {bar.detail}
          </span>
        </li>
      ))}
    </ul>
  );
}
