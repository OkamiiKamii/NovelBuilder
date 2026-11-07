import type { TrendPoint } from '../analytics';

const compact = (n: number): string => {
  const abs = Math.abs(n);
  if (abs < 1000) return String(n);
  const k = n / 1000;
  return `${Number.isInteger(k) || abs >= 10_000 ? Math.round(k) : k.toFixed(1)}K`;
};

/** Rounds up to a clean axis value. */
function niceCeil(value: number): number {
  if (value <= 0) return 0;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return [1, 1.5, 2, 3, 4, 5, 6, 8, 10].map((m) => m * magnitude).find((step) => step >= value)!;
}

interface BarChartProps {
  title: string;
  /** How a point is described in tooltips and the table, e.g. "Week of". */
  periodLabel: string;
  points: TrendPoint[];
  /** Show an x-axis label on every nth bar, counting back from the newest. */
  labelEvery?: number;
}

/**
 * Words per period as columns from a zero baseline. One series, so no legend:
 * the title names it. The current period is in the accent; earlier ones are a
 * quieter step of the same hue. Periods where more was cut than written drop
 * below the line in neutral grey. Each column shows its value on hover or
 * focus, and the same numbers are available as a table.
 */
export function BarChart({ title, periodLabel, points, labelEvery = 1 }: BarChartProps) {
  const top = niceCeil(Math.max(0, ...points.map((p) => p.net)));
  const bottom = niceCeil(Math.max(0, ...points.map((p) => -p.net)));
  const range = top + bottom;
  const peak = points.reduce((best, p) => (p.net > best.net ? p : best), points[0]);
  const words = (n: number) => `${n > 0 ? '' : n < 0 ? '−' : ''}${Math.abs(n).toLocaleString()} ${Math.abs(n) === 1 ? 'word' : 'words'}`;

  return (
    <figure className="chart">
      <figcaption>{title}</figcaption>
      {range === 0 ? (
        <p className="chart-empty muted small">Nothing logged in this period yet. It fills in as you write.</p>
      ) : (
        <div className="chart-body">
          <div className="chart-axis" aria-hidden="true">
            <span style={{ top: 0 }}>{compact(top)}</span>
            <span style={{ top: `${(top / range) * 100}%` }}>0</span>
            {bottom > 0 && <span style={{ top: '100%' }}>−{compact(bottom)}</span>}
          </div>
          <div className="chart-plot" role="list" aria-label={title}>
            <span className="gridline" style={{ top: 0 }} />
            <span className="gridline baseline" style={{ top: `${(top / range) * 100}%` }} />
            {points.map((point, i) => {
              const size = `${(Math.abs(point.net) / range) * 100}%`;
              const labelled = point.net !== 0 && (point.current || point.key === peak.key);
              return (
                <div key={point.key} className="chart-col" role="listitem" tabIndex={0} aria-label={`${periodLabel} ${point.label}: ${words(point.net)}`}>
                  <span
                    className={`column${point.net < 0 ? ' negative' : ''}${point.current ? ' current' : ''}`}
                    style={point.net >= 0 ? { bottom: `${(bottom / range) * 100}%`, height: size } : { top: `${(top / range) * 100}%`, height: size }}
                  >
                    {labelled && <span className="bar-value">{compact(point.net)}</span>}
                  </span>
                  <span className="chart-tip" role="presentation">
                    <strong>{words(point.net)}</strong>
                    {periodLabel} {point.label}
                    {point.current && ' (so far)'}
                  </span>
                  {(points.length - 1 - i) % labelEvery === 0 && <span className="chart-x">{point.label}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}
      <details className="chart-table">
        <summary>Show as table</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">{periodLabel}</th>
              <th scope="col">Net words</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.key}>
                <td>{point.label}</td>
                <td>{point.net.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
