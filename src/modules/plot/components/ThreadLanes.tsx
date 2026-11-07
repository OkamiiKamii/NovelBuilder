import { useRef, useState, type KeyboardEvent } from 'react';
import { MarkBadge } from '@/modules/canon/components/MarkBadge';
import type { OverlayMark } from '@/modules/canon/overlay';
import type { SwatchShape } from '@/modules/viz/components/Legend';
import type { Lane, Lanes } from '../lanes';
import { BEAT_ROLE_LABELS, statusName, type BeatRole } from '../types';

const NAME_W = 180;
const COL_W = 46;
const HEAD_H = 34;
const ROW_H = 46;

/** Each role has its own shape, named in the legend; a chapter with only the thread's events shows a triangle. Never colour alone. */
export const ROLE_SHAPES: Record<BeatRole, SwatchShape> = { introduction: 'ring', development: 'circle', intersection: 'diamond', resolution: 'square', appears: 'dot' };

interface ThreadLanesProps {
  lanes: Lanes;
  selectedThreadId: string | null;
  /** The cell chosen, by lane and chapter column. */
  chosen: { lane: number; col: number } | null;
  onChoose: (lane: number, col: number) => void;
  onSelectThread: (threadId: string) => void;
  /** What a cell says, read aloud. */
  words: (lane: Lane, col: number) => string;
  /** Canon and continuity markers, when they are on: what to mark on a cell. */
  cellMark?: (lane: Lane, col: number) => OverlayMark | null | undefined;
}

const clip = (text: string, n: number) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);

function Mark({ role, x, y }: { role: BeatRole | null; x: number; y: number }) {
  if (role === 'introduction') return <circle cx={x} cy={y} r={7} className="pl-mark pl-introduction" />;
  if (role === 'development') return <circle cx={x} cy={y} r={6} className="pl-mark pl-development" />;
  if (role === 'intersection') return <path d={`M${x} ${y - 8} L${x + 8} ${y} L${x} ${y + 8} L${x - 8} ${y} Z`} className="pl-mark pl-intersection" />;
  if (role === 'resolution') return <rect x={x - 6.5} y={y - 6.5} width={13} height={13} className="pl-mark pl-resolution" />;
  if (role === 'appears') return <circle cx={x} cy={y} r={3.5} className="pl-mark pl-appears" />;
  return <path d={`M${x} ${y - 7} L${x + 7} ${y + 6} L${x - 7} ${y + 6} Z`} className="pl-mark pl-event" />;
}

/**
 * Each thread as a lane across the chapters, in reading order. A mark is
 * something the author recorded in that chapter (its shape says the beat's
 * role); a solid line joins neighbouring chapters, and a dashed one crosses
 * chapters where nothing is recorded, with how many. An intersection is a
 * line to the lane of the thread it crosses. One stop in the tab order: the
 * arrow keys move between cells (the first column is the thread itself),
 * Enter shows what a cell holds or selects the thread.
 */
export function ThreadLanes({ lanes, selectedThreadId, chosen, onChoose, onSelectThread, words, cellMark }: ThreadLanesProps) {
  const cols = lanes.chapters.length;
  const [focus, setFocus] = useState({ lane: 0, col: -1 });
  const refs = useRef(new Map<string, SVGGElement>());
  const width = NAME_W + cols * COL_W + 10;
  const height = HEAD_H + lanes.lanes.length * ROW_H + 6;
  const x = (col: number) => NAME_W + col * COL_W + COL_W / 2;
  const y = (lane: number) => HEAD_H + lane * ROW_H + ROW_H / 2;
  const laneOf = new Map(lanes.lanes.map((l, i) => [l.thread.id, i]));
  const move = (lane: number, col: number) => {
    const next = { lane: Math.max(0, Math.min(lanes.lanes.length - 1, lane)), col: Math.max(-1, Math.min(cols - 1, col)) };
    setFocus(next);
    refs.current.get(`${next.lane}:${next.col}`)?.focus();
  };
  const choose = (lane: number, col: number) => (col < 0 ? onSelectThread(lanes.lanes[lane].thread.id) : onChoose(lane, col));
  const onKey = (e: KeyboardEvent, lane: number, col: number) => {
    const keys: Record<string, () => void> = { ArrowRight: () => move(lane, col + 1), ArrowLeft: () => move(lane, col - 1), ArrowDown: () => move(lane + 1, col), ArrowUp: () => move(lane - 1, col), Home: () => move(lane, -1), End: () => move(lane, cols - 1), Enter: () => choose(lane, col), ' ': () => choose(lane, col) };
    if (!keys[e.key]) return;
    e.preventDefault();
    keys[e.key]();
  };
  const focusable = (lane: number, col: number) => ({
    ref: (el: SVGGElement | null) => void (el ? refs.current.set(`${lane}:${col}`, el) : refs.current.delete(`${lane}:${col}`)),
    tabIndex: focus.lane === lane && focus.col === col ? 0 : -1,
    onKeyDown: (e: KeyboardEvent) => onKey(e, lane, col),
    onFocus: () => setFocus({ lane, col }),
    onClick: () => {
      setFocus({ lane, col });
      choose(lane, col);
    },
  });

  return (
    <div className="table-scroll pl-scroll">
      <svg className="pl-lanes" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-label={`Plot-thread lanes: ${lanes.lanes.length} ${lanes.lanes.length === 1 ? 'thread' : 'threads'} across ${cols} ${cols === 1 ? 'chapter' : 'chapters'}. Arrow keys move between cells, Enter shows what a cell holds.`}>
        {lanes.chapters.map((c, i) => (
          <text key={c.id} x={x(i)} y={HEAD_H - 12} textAnchor="middle" className="pl-head" aria-hidden="true">
            {c.number}
            <title>{`Chapter ${c.number}: ${c.title}`}</title>
          </text>
        ))}
        {lanes.lanes.map((lane, l) => {
          const marked = lane.cells.map((c, i) => (c.places.length ? i : -1)).filter((i) => i >= 0);
          const selected = lane.thread.id === selectedThreadId;
          return (
            <g key={lane.thread.id} className={`pl-lane${selected ? ' selected' : ''}`}>
              <rect x={0} y={HEAD_H + l * ROW_H + 2} width={width} height={ROW_H - 4} className="pl-band" />
              <g className="pl-name-g" role="button" aria-pressed={selected} aria-label={`${lane.thread.title}, ${statusName(lane.thread)}. Select the thread`} {...focusable(l, -1)}>
                <rect x={4} y={HEAD_H + l * ROW_H + 4} width={NAME_W - 10} height={ROW_H - 8} rx={6} className="pl-name-box" />
                <text x={12} y={y(l) - 4} className="pl-name">
                  {clip(lane.thread.title, 22)}
                </text>
                <text x={12} y={y(l) + 12} className={`pl-status st-${lane.thread.status}`}>
                  {clip(statusName(lane.thread), 24)}
                </text>
              </g>
              {marked.slice(1).map((to, i) => {
                const from = marked[i];
                const gap = to - from > 1;
                return (
                  <g key={`${from}-${to}`} aria-hidden="true">
                    <line x1={x(from)} y1={y(l)} x2={x(to)} y2={y(l)} className={gap ? 'pl-line pl-gap' : 'pl-line'} />
                    {gap && (
                      <text x={(x(from) + x(to)) / 2} y={y(l) - 9} textAnchor="middle" className="pl-gap-label">
                        {to - from - 1} ch.
                      </text>
                    )}
                  </g>
                );
              })}
              {lane.crossings.map((c) => {
                const other = laneOf.get(c.otherId);
                if (other === undefined) return null;
                return (
                  <g key={`${c.beatId}-${c.otherId}`} aria-hidden="true">
                    <line x1={x(c.column)} y1={y(l)} x2={x(c.column)} y2={y(other)} className="pl-cross" />
                    <circle cx={x(c.column)} cy={y(other)} r={4.5} className="pl-cross-end" />
                  </g>
                );
              })}
              {lane.cells.map((cell, col) => {
                const isChosen = chosen?.lane === l && chosen.col === col;
                const count = cell.beats.length + cell.eventIds.length;
                return (
                  <g key={col} className={`pl-cell${isChosen ? ' chosen' : ''}`} role="button" aria-pressed={isChosen} aria-label={words(lane, col)} {...focusable(l, col)}>
                    <rect x={NAME_W + col * COL_W + 2} y={HEAD_H + l * ROW_H + 4} width={COL_W - 4} height={ROW_H - 8} rx={4} className="pl-hit" />
                    {cell.places.length > 0 && <Mark role={cell.role} x={x(col)} y={y(l)} />}
                    {count > 1 && (
                      <text x={x(col) + 12} y={y(l) - 8} className="pl-count">
                        {count}
                      </text>
                    )}
                    {cellMark && <MarkBadge mark={cellMark(lane, col)} x={x(col) + 10} y={y(l) + 10} />}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** The legend: each role, events, and the lines. */
export const lanesLegend = () => [
  ...(Object.keys(ROLE_SHAPES) as BeatRole[]).map((role) => ({ key: role, label: BEAT_ROLE_LABELS[role], color: `var(--pl-${role})`, shape: ROLE_SHAPES[role] })),
  { key: 'event', label: 'An event of the thread, told in that chapter', color: 'var(--pl-event)', shape: 'triangle' as SwatchShape },
  { key: 'line', label: 'Recorded in neighbouring chapters', color: 'var(--text)', shape: 'line' as SwatchShape },
  { key: 'gap', label: 'Chapters in between with nothing recorded (how many)', color: 'var(--muted)', shape: 'dashed' as SwatchShape },
  { key: 'cross', label: 'An intersection with another thread', color: 'var(--accent)', shape: 'dotted' as SwatchShape },
];
