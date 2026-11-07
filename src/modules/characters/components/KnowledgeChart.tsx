import { useRef, useState, type KeyboardEvent } from 'react';
import type { SwatchShape } from '@/modules/viz/components/Legend';
import type { Spread, SpreadRow } from '../knowledge';
import { AWARENESS, AWARENESS_LABELS, type Awareness } from '../types';

/** Each state has a shape of its own as well as a colour, named in the legend, and a word in every cell: never colour alone. */
export const STATE_SHAPES: Record<Awareness, SwatchShape> = { knows: 'square', partial: 'half', believes: 'dots', suspects: 'hatched', false: 'cross', unaware: 'outline' };
const SHORT: Record<Awareness, string> = { knows: 'Knows', partial: 'Part', believes: 'Believes', suspects: 'Suspects', false: 'False belief', unaware: 'Unaware' };
const NAME_W = 150;
const COL_W = 118;
const HEAD_H = 58;
const ROW_H = 40;

interface KnowledgeChartProps {
  spread: Spread;
  /** The cell chosen, by row and column (the last column is "Now"). */
  chosen: { row: number; col: number } | null;
  onChoose: (row: number, col: number) => void;
  /** What a cell says, read aloud. */
  words: (row: SpreadRow, col: number) => string;
}

const clip = (text: string, n: number) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);

/**
 * Who holds what of a secret, point by point: a row for each character, a
 * column for each chapter or scene (or event) something is recorded at, and
 * a last column for now. Each cell shows the record in force there, with a
 * dot where a record is made and a diamond where they act on it; an arrow
 * shows who told whom. The chart is one stop in the tab order: the arrow
 * keys move between cells, Enter shows what a cell rests on.
 */
export function KnowledgeChart({ spread, chosen, onChoose, words }: KnowledgeChartProps) {
  const cols = spread.points.length + 1;
  const [focus, setFocus] = useState({ row: 0, col: 0 });
  const refs = useRef(new Map<string, SVGGElement>());
  const width = NAME_W + cols * COL_W + 8;
  const height = HEAD_H + spread.rows.length * ROW_H + 8;
  const rowOf = new Map(spread.rows.map((r, i) => [r.characterId, i]));
  const move = (row: number, col: number) => {
    const next = { row: Math.max(0, Math.min(spread.rows.length - 1, row)), col: Math.max(0, Math.min(cols - 1, col)) };
    setFocus(next);
    refs.current.get(`${next.row}:${next.col}`)?.focus();
  };
  const onKey = (e: KeyboardEvent, row: number, col: number) => {
    const keys: Record<string, () => void> = { ArrowRight: () => move(row, col + 1), ArrowLeft: () => move(row, col - 1), ArrowDown: () => move(row + 1, col), ArrowUp: () => move(row - 1, col), Home: () => move(row, 0), End: () => move(row, cols - 1), Enter: () => onChoose(row, col), ' ': () => onChoose(row, col) };
    if (!keys[e.key]) return;
    e.preventDefault();
    keys[e.key]();
  };
  const cellX = (col: number) => NAME_W + col * COL_W;
  const rowY = (row: number) => HEAD_H + row * ROW_H;

  return (
    <div className="table-scroll kn-chart-scroll">
      <svg className="kn-chart" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-label={`Who holds what of the secret: ${spread.rows.length} ${spread.rows.length === 1 ? 'character' : 'characters'} across ${spread.points.length} ${spread.axis === 'reading' ? (spread.points.length === 1 ? 'chapter or scene' : 'chapters and scenes') : spread.points.length === 1 ? 'event' : 'events'}, and now. Arrow keys move between cells, Enter shows what a cell rests on.`}>
        <defs>
          <pattern id="kn-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" className="kn-pattern" />
          </pattern>
          <pattern id="kn-cross" width="8" height="8" patternUnits="userSpaceOnUse">
            <path d="M0 0 L8 8 M8 0 L0 8" className="kn-pattern" />
          </pattern>
          <pattern id="kn-dots" width="7" height="7" patternUnits="userSpaceOnUse">
            <circle cx="3.5" cy="3.5" r="1.2" className="kn-pattern-dot" />
          </pattern>
          <marker id="kn-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
            <path d="M0 0 10 5 0 10z" className="kn-arrow-head" />
          </marker>
        </defs>
        {[...spread.points.map((p) => ({ label: p.label, marks: p.marks as string[] })), { label: 'Now', marks: [] as string[] }].map((p, col) => (
          <g key={col} className="kn-head" aria-hidden="true">
            <text x={cellX(col) + COL_W / 2} y={22} textAnchor="middle">
              {clip(p.label, 18)}
              <title>{p.label}</title>
            </text>
            {p.marks.length > 0 && (
              <text x={cellX(col) + COL_W / 2} y={40} textAnchor="middle" className="kn-mark-label">
                {p.marks.map((m) => (m === 'first' ? 'first figures' : 'revealed')).join(' · ')}
              </text>
            )}
          </g>
        ))}
        {spread.rows.map((row, r) => (
          <g key={row.characterId}>
            <text x={NAME_W - 10} y={rowY(r) + ROW_H / 2} dy="0.35em" textAnchor="end" className="kn-name" aria-hidden="true">
              {clip(row.name, 18)}
            </text>
            {[...row.cells.map((c) => ({ state: c.record?.state ?? null, here: c.here.length, need: c.needs.length > 0, summary: false })), { state: row.now.state, here: 0, need: false, summary: row.now.source === 'summary' }].map((cell, col) => {
              const [x, y, w, h] = [cellX(col) + 4, rowY(r) + 4, COL_W - 8, ROW_H - 8];
              const isChosen = chosen?.row === r && chosen.col === col;
              return (
                <g
                  key={col}
                  ref={(el) => void (el ? refs.current.set(`${r}:${col}`, el) : refs.current.delete(`${r}:${col}`))}
                  className={`kn-cell-g${isChosen ? ' chosen' : ''}`}
                  role="button"
                  tabIndex={focus.row === r && focus.col === col ? 0 : -1}
                  aria-pressed={isChosen}
                  aria-label={words(row, col)}
                  onClick={() => {
                    setFocus({ row: r, col });
                    onChoose(r, col);
                  }}
                  onKeyDown={(e) => onKey(e, r, col)}
                  onFocus={() => setFocus({ row: r, col })}
                >
                  <rect x={x} y={y} width={w} height={h} rx={4} className={`kn-cell ${cell.state ? `kn-${cell.state}` : 'kn-none'}${cell.summary ? ' summary' : ''}`} />
                  {cell.state === 'partial' && <rect x={x} y={y} width={w / 2} height={h} rx={4} className="kn-half" />}
                  {cell.state && ['suspects', 'false', 'believes'].includes(cell.state) && <rect x={x} y={y} width={w} height={h} rx={4} fill={`url(#kn-${cell.state === 'suspects' ? 'hatch' : cell.state === 'false' ? 'cross' : 'dots'})`} className="kn-overlay" />}
                  <text x={x + w / 2} y={y + h / 2} dy="0.35em" textAnchor="middle" className={`kn-cell-text${cell.state ? '' : ' muted'}`}>
                    {cell.state ? SHORT[cell.state] : col === cols - 1 ? 'Not recorded' : '—'}
                  </text>
                  {cell.here > 0 && <circle cx={x + 8} cy={y + h / 2} r={4} className="kn-here" />}
                  {cell.need && <path d={`M${x + w - 9} ${y + h / 2 - 6} l6 6 -6 6 -6 -6z`} className="kn-need" />}
                </g>
              );
            })}
          </g>
        ))}
        {spread.tellings.map((t) => {
          const [from, to] = [rowOf.get(t.fromId), rowOf.get(t.toId)];
          if (from === undefined || to === undefined) return null;
          const x = cellX(t.point) + 3;
          const [y1, y2] = [rowY(from) + ROW_H / 2, rowY(to) + ROW_H / 2];
          const bend = Math.min(26, 10 + Math.abs(to - from) * 4);
          return <path key={t.recordId} d={`M${x} ${y1} C${x - bend} ${y1} ${x - bend} ${y2} ${x} ${y2}`} className="kn-told" markerEnd="url(#kn-arrow)" aria-hidden="true" />;
        })}
      </svg>
    </div>
  );
}

/** The legend's items: every state, then the marks. */
export const knowledgeLegend = () => [
  ...AWARENESS.map((s) => ({ key: s, label: AWARENESS_LABELS[s], color: `var(--kn-${s})`, shape: STATE_SHAPES[s] })),
  { key: 'none', label: 'Nothing recorded yet', color: 'var(--muted)', shape: 'empty' as SwatchShape },
  { key: 'summary', label: 'Now, from the simple lists (no recorded history)', color: 'var(--muted)', shape: 'dashed' as SwatchShape },
  { key: 'here', label: 'A record made here', color: 'var(--text)', shape: 'circle' as SwatchShape },
  { key: 'need', label: 'Acts on it here (your mark)', color: 'var(--accent)', shape: 'diamond' as SwatchShape },
  { key: 'told', label: 'Told by (from the teller to the learner)', color: 'var(--text)', shape: 'arrow' as SwatchShape },
];
