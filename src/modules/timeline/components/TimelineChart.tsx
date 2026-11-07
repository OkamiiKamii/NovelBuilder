import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent } from 'react';
import { MarkBadge } from '@/modules/canon/components/MarkBadge';
import { markWords as canonWords, type OverlayMark } from '@/modules/canon/overlay';
import type { EventRecord } from '@/modules/model/events';
import { Legend } from '@/modules/viz/components/Legend';
import { stepIndex } from '@/modules/viz/focus';
import { useSize } from '@/modules/viz/hooks';
import { AXIS_WIDTH, domainOf, layoutAxis, type AxisMark, type MarkKind } from '../axis';
import { centreOn, chooseScale, panWindow, readDate, scaleName, STORY_CALENDAR, ticksFor, zoomWindow, type Calendar, type Window } from '../scale';

const ROW = 34;
const HEAD = 24;
const STEP = 1.6;
const KIND_WORDS: Record<MarkKind, string> = { moment: 'an exact moment', uncertain: 'somewhere in that stretch of time', lasting: 'lasting a while', ongoing: 'still going on', unended: 'lasting a while' };
/** How far an event whose end is not given is drawn fading out, in pixels: enough to see it lasts, never a claimed end. */
const TAIL = 48;

/**
 * What a mark is, in words, after its date: its kind, unless the date already
 * says it ("still going on", "end not known"), and which of its ends are known
 * only roughly.
 */
function markWords(m: AxisMark): string {
  const rough = m.startFuzz && m.endFuzz ? 'its start and end are known only roughly' : m.startFuzz ? 'its start is known only roughly' : m.endFuzz ? 'its end is known only roughly' : '';
  return [m.kind === 'ongoing' ? '' : KIND_WORDS[m.kind], rough].filter(Boolean).join('; ');
}

/** A track to draw: which events are on it, and whether it is folded to one line. */
export interface ChartTrack {
  id: string;
  label: string;
  folded: boolean;
  eventIds: string[];
}

interface TimelineChartProps {
  events: EventRecord[];
  /** The tracks to draw, in order; null for one line with every event. */
  tracks: ChartTrack[] | null;
  selectedId: string | null;
  isRelated: (id: string) => boolean;
  onSelect: (id: string) => void;
  /** The story's calendar; the app's own one unless a story gives another. */
  calendar?: Calendar;
  /** Canon and continuity markers, when they are on: an event's marks by its id. */
  marks?: (eventId: string) => OverlayMark | undefined;
}

const short = (text: string) => (text.length > 22 ? `${text.slice(0, 21)}…` : text);

/**
 * Events drawn along story time, zoomable from hours to millennia, on one
 * line or split into tracks. Every track shares one time axis, so an event
 * on two tracks is at the same place on both, and zooming only stretches the
 * line: marks keep their moment and their row. Each mark is a button named
 * with the event, its date, what kind of date it is and its track; one mark
 * at a time is in the tab order. Left and right move along a track, up and
 * down to the nearest event on the next track.
 */
export function TimelineChart({ events, tracks, selectedId, isRelated, onSelect, calendar = STORY_CALENDAR, marks }: TimelineChartProps) {
  const time = { day: calendar.minutesPerDay, year: calendar.minutesPerYear };
  const domain = domainOf(events, time) ?? { from: 0, to: time.year };
  const hatch = `tl-hatch-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const byId = new Map(events.map((e) => [e.id, e]));
  const labelled = tracks !== null;
  const bands = (tracks ?? [{ id: '__all', label: '', folded: false, eventIds: events.map((e) => e.id) }]).map((t) => {
    const axis = layoutAxis(t.eventIds.map((id) => byId.get(id)).filter((e): e is EventRecord => Boolean(e)), AXIS_WIDTH, domain, time);
    return { ...t, marks: axis.marks, lanes: axis.lanes };
  });
  // Undated events are listed apart, only those on the tracks shown.
  const onTracks = tracks && new Set(tracks.flatMap((t) => t.eventIds));
  const unplaced = layoutAxis(onTracks ? events.filter((e) => onTracks.has(e.id)) : events, AXIS_WIDTH, domain, time).unplaced;
  const dated = new Set(bands.flatMap((b) => b.marks.map((m) => m.id))).size;
  // Where each band starts, top to bottom.
  const tops: number[] = [];
  let height = 0;
  for (const band of bands) {
    tops.push(height);
    height += (labelled ? HEAD : 0) + (band.folded ? 6 : 14 + Math.max(1, band.lanes) * ROW);
  }
  const axisY = height + 6;
  height = axisY + 30;

  const all: Window = domain;
  const [visible, setWindow] = useState<Window>(all);
  const [focus, setFocus] = useState<[number, number]>([0, 0]);
  const [jump, setJump] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });
  const [problem, setProblem] = useState<string | null>(null);
  const refs = useRef(new Map<string, SVGGElement>());
  const [sizeRef, size] = useSize<HTMLDivElement>();
  const area = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; window: Window } | null>(null);
  const width = Math.max(320, size.width);
  const x = (t: number) => ((t - visible.from) / (visible.to - visible.from)) * width;
  const scale = chooseScale(visible, width, calendar);
  const latest = useRef({ window: visible, all, width });
  latest.current = { window: visible, all, width };

  // The mark that takes Tab: the one last focused, or the first there is.
  const open = bands.map((b, i) => (!b.folded && b.marks.length ? i : -1)).filter((i) => i >= 0);
  const current: [number, number] = open.includes(focus[0]) ? [focus[0], Math.min(focus[1], bands[focus[0]].marks.length - 1)] : [open[0] ?? -1, 0];

  // When the events change (one added, a filter applied), show all of them again.
  const extent = `${domain.from}|${domain.to}`;
  useEffect(() => setWindow({ from: domain.from, to: domain.to }), [extent]); // eslint-disable-line react-hooks/exhaustive-deps

  // The wheel zooms at the pointer; listened to directly so the page does not scroll instead.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { window: w, all: a, width: wd } = latest.current;
      const px = e.clientX - el.getBoundingClientRect().left;
      setWindow(zoomWindow(w, e.deltaY < 0 ? STEP : 1 / STEP, w.from + (px / wd) * (w.to - w.from), a));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [dated > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoom = (factor: number) => setWindow((w) => zoomWindow(w, factor, (w.from + w.to) / 2, all));

  const moveTo = (band: number, index: number) => {
    const mark = bands[band]?.marks[index];
    if (!mark) return;
    setFocus([band, index]);
    if (mark.start > visible.to || Math.max(mark.start, mark.end) < visible.from) setWindow((w) => centreOn(w, mark.start));
    refs.current.get(`${band}:${index}`)?.focus();
  };

  const onMarkKey = (e: KeyboardEvent, band: number, index: number, mark: AxisMark) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(mark.id);
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      // The next open track that way, at the event nearest in time.
      const others = e.key === 'ArrowUp' ? open.filter((i) => i < band).reverse() : open.filter((i) => i > band);
      const target = others[0];
      if (target === undefined) return;
      e.preventDefault();
      const marks = bands[target].marks;
      const nearest = marks.reduce((best, m, i) => (Math.abs(m.start - mark.start) < Math.abs(marks[best].start - mark.start) ? i : best), 0);
      moveTo(target, nearest);
      return;
    }
    const next = stepIndex(bands[band].marks.length, index, e.key, 'horizontal');
    if (next === null || next === index) return;
    e.preventDefault();
    moveTo(band, next);
  };

  /** Keys on the drawing itself: + and − zoom, 0 shows everything, the arrows move along the line. */
  const onAreaKey = (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    const moves: Record<string, () => void> = { '+': () => zoom(STEP), '=': () => zoom(STEP), '-': () => zoom(1 / STEP), _: () => zoom(1 / STEP), '0': () => setWindow(all), ArrowLeft: () => setWindow((w) => panWindow(w, -0.25)), ArrowRight: () => setWindow((w) => panWindow(w, 0.25)) };
    if (!moves[e.key]) return;
    e.preventDefault();
    moves[e.key]();
  };

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.target instanceof Element && e.target.closest('[data-mark]')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, window: visible };
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const { x: startX, window: start } = drag.current;
    setWindow(panWindow(start, -(e.clientX - startX) / width));
  };

  const goTo = (e: FormEvent) => {
    e.preventDefault();
    const date = readDate(jump, calendar);
    if (!date) return setProblem(`“${jump}” is not a date this timeline can read. Try a year (10, -500), a year and month (10-6), or “${calendar.months[5]} 10”.`);
    setProblem(null);
    // The date with its neighbours either side: a day with the days around it, a month with the months, a year with the years.
    const span = date.length * 3;
    setWindow({ from: date.t + date.length / 2 - span / 2, to: date.t + date.length / 2 + span / 2 });
  };

  const showRange = (e: FormEvent) => {
    e.preventDefault();
    const from = readDate(range.from, calendar);
    const to = readDate(range.to, calendar);
    if (!from || !to) return setProblem('Give the range as two dates this timeline can read, such as 10 and 20, or 10-1 and 10-6.');
    if (to.t + to.length <= from.t) return setProblem('The range ends before it starts.');
    setProblem(null);
    setWindow({ from: from.t, to: to.t + to.length });
  };

  return (
    <div className="stack timeline-chart">
      {dated > 0 && (
        <>
          <div className="timeline-controls">
            <div className="viz-zoom-inline" role="group" aria-label="Zoom the timeline">
              <button type="button" className="btn ghost icon" aria-label="Zoom in" title="Zoom in (+)" onClick={() => zoom(STEP)}>
                +
              </button>
              <button type="button" className="btn ghost icon" aria-label="Zoom out" title="Zoom out (−)" onClick={() => zoom(1 / STEP)}>
                −
              </button>
              <button type="button" className="btn ghost" onClick={() => setWindow(all)}>
                Fit all
              </button>
              <span className="muted small" aria-live="polite">
                Showing {scaleName(scale.unit, scale.step)}
              </span>
            </div>
            <form className="timeline-form" onSubmit={goTo}>
              <input aria-label="Jump to date" placeholder="Jump to: 10, 10-6, -500" value={jump} onChange={(e) => setJump(e.target.value)} />
              <button type="submit" className="btn">
                Go
              </button>
            </form>
            <form className="timeline-form" onSubmit={showRange}>
              <input aria-label="Show from" placeholder="From" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
              <input aria-label="Show until" placeholder="Until" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
              <button type="submit" className="btn">
                Show range
              </button>
            </form>
          </div>
          {problem && (
            <p className="error small" role="alert">
              {problem}
            </p>
          )}
          <div
            ref={(el) => {
              area.current = el;
              sizeRef(el);
            }}
            className="timeline-scroll timeline-area"
            tabIndex={0}
            role="group"
            aria-label="Timeline drawing. Plus and minus zoom, 0 shows everything, the arrow keys move along it."
            onKeyDown={onAreaKey}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
          >
            <svg width={width} height={height} role="group" aria-label={`Timeline of ${dated} dated ${dated === 1 ? 'event' : 'events'}, in the order they happen${labelled ? `, on ${bands.length} ${bands.length === 1 ? 'track' : 'tracks'}` : ''}. Use the arrow keys to move along it.`}>
              <defs>
                <pattern id={hatch} width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width={6} height={6} className="tl-hatch-ground" />
                  <line x1={0} y1={0} x2={0} y2={6} className="tl-hatch-line" />
                </pattern>
              </defs>
              <line x1={0} y1={axisY} x2={width} y2={axisY} className="axis-line" />
              {ticksFor(visible, width, calendar).map((t) => (
                <g key={t.t} transform={`translate(${x(t.t)} ${axisY})`} aria-hidden="true">
                  <line y1={0} y2={6} className="axis-line" />
                  <text y={20} textAnchor="middle" className="axis-label">
                    {t.label}
                  </text>
                </g>
              ))}
              {bands.map((band, b) => (
                <g key={band.id} role={labelled ? 'group' : undefined} aria-label={labelled ? `${band.label}: ${band.eventIds.length} ${band.eventIds.length === 1 ? 'event' : 'events'}${band.folded ? ', folded' : ''}` : undefined}>
                  {labelled && (
                    <>
                      {b > 0 && <line x1={0} y1={tops[b]} x2={width} y2={tops[b]} className="tl-band-line" />}
                      <text x={6} y={tops[b] + 16} className="tl-band-label" aria-hidden="true">
                        {band.label}
                        {band.folded ? ` — folded, ${band.eventIds.length} ${band.eventIds.length === 1 ? 'event' : 'events'}` : ''}
                      </text>
                    </>
                  )}
                  {!band.folded &&
                    band.marks.map((m, i) => {
                      const y = tops[b] + (labelled ? HEAD : 0) + 24 + m.lane * ROW;
                      const left = x(m.start);
                      const right = m.kind === 'ongoing' ? width + 20 : x(m.end);
                      const selected = m.id === selectedId;
                      const mark = marks?.(m.id);
                      return (
                        <g
                          key={m.id}
                          ref={(el) => void (el ? refs.current.set(`${b}:${i}`, el) : refs.current.delete(`${b}:${i}`))}
                          data-mark
                          role="button"
                          tabIndex={b === current[0] && i === current[1] ? 0 : -1}
                          aria-pressed={selected}
                          aria-label={`${m.title}, ${m.when}${markWords(m) ? `, ${markWords(m)}` : ''}${labelled ? `, on the ${band.label} track` : ''}${canonWords(mark) ? `. ${canonWords(mark)}` : ''}`}
                          className={`tl-mark kind-${m.kind}${selected ? ' selected' : isRelated(m.id) ? ' related' : ''}`}
                          onClick={() => (setFocus([b, i]), onSelect(m.id))}
                          onFocus={() => setFocus([b, i])}
                          onKeyDown={(e) => onMarkKey(e, b, i, m)}
                        >
                          {m.kind === 'moment' && <circle cx={left} cy={y} r={6} className="tl-shape" />}
                          {m.kind === 'uncertain' && (
                            <>
                              <rect x={left} y={y - 6} width={Math.max(right - left, 4)} height={12} rx={6} className="tl-shape" />
                              <circle cx={(left + right) / 2} cy={y} r={2.5} className="tl-centre" />
                            </>
                          )}
                          {(m.kind === 'lasting' || m.kind === 'ongoing' || m.kind === 'unended') &&
                            (() => {
                              // Solid while it is certainly going on; hatched over the stretch a rough start or end falls in.
                              const coreFrom = x(m.startFuzz ? m.startFuzz.hi : m.start);
                              const coreTo = m.kind === 'ongoing' ? right : m.kind === 'unended' ? coreFrom : x(m.endFuzz ? m.endFuzz.lo : m.end);
                              return (
                                <>
                                  {m.startFuzz && <rect x={x(m.startFuzz.lo)} y={y - 6} width={Math.max(x(m.startFuzz.hi) - x(m.startFuzz.lo), 4)} height={12} rx={2} className="tl-shape tl-fuzz" style={{ fill: `url(#${hatch})` }} />}
                                  {coreTo > coreFrom && <rect x={coreFrom} y={y - 6} width={Math.max(coreTo - coreFrom, 4)} height={12} rx={2} className="tl-shape" />}
                                  {m.endFuzz && <rect x={x(m.endFuzz.lo)} y={y - 6} width={Math.max(x(m.endFuzz.hi) - x(m.endFuzz.lo), 4)} height={12} rx={2} className="tl-shape tl-fuzz" style={{ fill: `url(#${hatch})` }} />}
                                  {!m.startFuzz && coreTo <= coreFrom && <rect x={coreFrom} y={y - 6} width={4} height={12} rx={2} className="tl-shape" />}
                                  {m.kind === 'unended' &&
                                    [0.75, 0.5, 0.3, 0.14].map((opacity, k) => <rect key={k} x={coreFrom + 4 + (k * TAIL) / 4} y={y - 4} width={TAIL / 4 - 1} height={8} className="tl-tail" opacity={opacity} />)}
                                  {m.kind === 'unended' && (
                                    <text x={coreFrom + 8 + TAIL} y={y + 4} className="tl-unknown" aria-hidden="true">
                                      ?
                                    </text>
                                  )}
                                  {m.kind === 'ongoing' && <path d={`M${width - 12} ${y - 9} L${width - 2} ${y} L${width - 12} ${y + 9}`} className="tl-arrow" />}
                                </>
                              );
                            })()}
                          <text x={Math.max(left, 0) + (m.kind === 'moment' ? 10 : 4)} y={y - 10} className="tl-label">
                            {short(m.title)}
                          </text>
                          <MarkBadge mark={mark} x={Math.max(left, 10)} y={y + 15} />
                          <title>{`${m.title} — ${m.when}`}</title>
                        </g>
                      );
                    })}
                </g>
              ))}
            </svg>
          </div>
          <Legend
            title="What the marks mean"
            items={[
              { key: 'moment', label: 'Exact moment', color: 'var(--accent)', shape: 'circle' },
              { key: 'uncertain', label: 'Somewhere in this stretch (date given to the month, season or year)', color: 'var(--accent)', shape: 'dashed' },
              { key: 'lasting', label: 'Lasts a while', color: 'var(--accent)', shape: 'line' },
              { key: 'rough', label: 'Start or end known only roughly (hatched over the stretch it falls in)', color: 'var(--accent)', shape: 'hatched' },
              { key: 'ongoing', label: 'Still going on', color: 'var(--accent)', shape: 'arrow' },
              { key: 'unended', label: 'Lasts, but its end is not given', color: 'var(--accent)', shape: 'fade' },
            ]}
          />
        </>
      )}
      {unplaced.length > 0 && (
        <section className="tl-unplaced" aria-labelledby="tl-unplaced-title">
          <h3 id="tl-unplaced-title">Not placed in time ({unplaced.length})</h3>
          <p className="muted small">These events have no date that can be worked out, so they are not put anywhere on the line.</p>
          <ul>
            {unplaced.map((u) => (
              <li key={u.id} className={u.id === selectedId ? 'selected' : isRelated(u.id) ? 'related' : ''}>
                <button type="button" className="link" aria-pressed={u.id === selectedId} onClick={() => onSelect(u.id)}>
                  {u.title}
                </button>{' '}
                <span className="muted small">{u.reason}</span>
                {canonWords(marks?.(u.id)) && <span className="mk-words small"> {canonWords(marks?.(u.id))}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
