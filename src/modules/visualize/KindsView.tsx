import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { connections } from '@/core';
import { EntryOptions } from '@/modules/codex/categories';
import { fieldOf, KIND_VIEW_LABELS, KIND_VIEWS, missingFor, readyViews, type KindView } from '@/modules/codex/capabilities';
import type { Category } from '@/modules/codex/types';
import type { Undecided } from '@/modules/model/query';
import type { EntityRef, StoryModel } from '@/modules/model/types';
import { nodeLabel } from '@/modules/timeline/narrative';
import { ticksFor } from '@/modules/timeline/scale';
import { nearestInDirection } from '@/modules/viz/focus';
import { useSize } from '@/modules/viz/hooks';
import { decodeAnchor, encodeAnchor } from '@/modules/viz/params';
import { Viewport } from '@/modules/viz/components/Viewport';
import { ViewSwitch } from '@/modules/viz/components/ViewSwitch';
import { VizState } from '@/modules/viz/components/VizState';
import { downloadBlob, fileSlug } from '@/shared/download';
import { kindHolders, kindMap, kindRanks, kindsOf, kindTable, kindTimeline, niceTicks, readKind, tableCsv, type Unplaced } from './kinds';
import { timelineRows } from './summaries';
import { Legend } from '@/modules/viz/components/Legend';

/** What each drawing is called beside its list. */
const DRAWN: Record<KindView, string> = { timeline: 'Timeline', map: 'Map', rank: 'Ladder', ownership: 'Holders' };

interface KindsViewProps {
  model: StoryModel;
  projectId: string;
  params: URLSearchParams;
  setParams: (changes: Record<string, string | null>) => void;
  mode: 'visual' | 'list';
  setMode: (mode: 'visual' | 'list') => void;
  pick: (ref: EntityRef) => void;
  selectedId: string | null;
  /** The page's filters: which records they leave in, and what they could not decide. */
  keep: (id: string) => boolean;
  undecided: Undecided[];
  clear: () => void;
}

/** A record's name: selecting it shows its details beside the view. */
function Name({ id, name, pick, selectedId }: { id: string; name: string; pick: (ref: EntityRef) => void; selectedId: string | null }) {
  return (
    <button type="button" className="link viz-pick" aria-pressed={selectedId === id} onClick={() => pick({ type: 'entry', id })}>
      {name}
    </button>
  );
}

/** The records a view could not draw, each with the reason. */
function NotDrawn({ items, what }: { items: Unplaced[]; what: string }) {
  if (!items.length) return null;
  return (
    <section className="kind-unplaced" aria-label={`Not ${what}`}>
      <h3>
        Not {what} ({items.length})
      </h3>
      <ul className="small">
        {items.map((u) => (
          <li key={u.entry.id}>
            <strong>{u.entry.name}</strong>: {u.reason}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * RECORDS BY KIND
 * One kind of Codex record (the author's own kinds, and the built-in ones)
 * as a table, or drawn the ways its category is set up for in the Codex. A
 * way it is not set up for says what is missing and shows the table.
 */
export function KindsView({ model, projectId, params, setParams, mode, setMode, pick, selectedId, keep, undecided, clear }: KindsViewProps) {
  const kinds = kindsOf(model);
  const { key, show } = readKind(params, model);
  const category = key ? model.categories.get(key) : undefined;
  const codexLink = `/project/${projectId}/codex`;
  if (!category) return <VizState status={{ kind: 'empty', message: 'No kinds of record yet. Add one in the Codex, under Categories & fields.' }} />;
  const ready = readyViews(category);
  const count = kinds.find((k) => k.category.key === category.key)?.count ?? 0;
  const table = kindTable(model, category.key);
  const missing = show === 'table' ? [] : missingFor(category, show);
  const props = { model, category, mode, pick, selectedId, keep };

  let body: ReactNode;
  if (!count) body = <VizState status={{ kind: 'empty', message: `No ${category.name.toLowerCase()} yet. Add them in the Codex.`, action: <Link to={codexLink}>Open the Codex</Link> }} />;
  else if (!table.rows.some((r) => keep(r.entry.id))) body = <VizState status={{ kind: 'no-results', onClearFilters: clear }} undecided={undecided} />;
  else
    body = (
      <VizState status={{ kind: 'ready' }} undecided={undecided}>
        {missing.length > 0 && (
          <div className="notice kind-missing" role="status">
            <p>
              {category.name} can’t be shown {KIND_VIEW_LABELS[show as KindView].toLowerCase()} yet:
            </p>
            <ul>
              {missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
            <p>
              Set it up in the Codex (Categories & fields → {category.name} → Visualizations). Meanwhile, here is the table. <Link to={codexLink}>Open the Codex</Link>
            </p>
          </div>
        )}
        {show === 'table' || missing.length ? <KindTable {...props} /> : show === 'timeline' ? <KindTimeline {...props} /> : show === 'map' ? <KindMap {...props} /> : show === 'rank' ? <KindRanks {...props} /> : <KindHolders {...props} />}
      </VizState>
    );

  const graphWords = category.graph === false ? 'left out of the knowledge graph' : `in the knowledge graph${fieldOf(category, 'graphLabel', category.uses?.graphLabel) ? `, labelled by ${fieldOf(category, 'graphLabel', category.uses?.graphLabel)!.name}` : ''}${category.uses?.graphLinks ? `, drawing ${category.uses.graphLinks.length ? category.fields.filter((f) => category.uses!.graphLinks!.includes(f.id)).map((f) => f.name).join(', ') : 'none of its link fields'}` : ''}`;

  return (
    <div className="stack kinds-view">
      <div className="viz-toolbar">
        <label className="field viz-who">
          <span>Kind of record</span>
          <select aria-label="Kind of record" value={category.key} onChange={(e) => setParams({ kind: e.target.value })}>
            {kinds.map((k) => (
              <option key={k.category.key} value={k.category.key}>
                {k.category.name} ({k.count})
              </option>
            ))}
          </select>
        </label>
        <div className="chips" role="group" aria-label="Ways to show it">
          {(['table', ...KIND_VIEWS] as const).map((v) => (
            <button key={v} type="button" className={`chip-toggle${v === show ? ' on' : ''}`} aria-pressed={v === show} onClick={() => setParams({ kshow: v === 'table' ? null : v })}>
              {v === 'table' ? 'Table' : KIND_VIEW_LABELS[v]}
              {v !== 'table' && !ready.includes(v) && <span className="muted small"> · not set up</span>}
            </button>
          ))}
        </div>
        {show !== 'table' && !missing.length && <ViewSwitch mode={mode} onChange={setMode} visualLabel={DRAWN[show]} />}
        <button type="button" className="btn ghost" disabled={!count} onClick={() => downloadBlob(new Blob([tableCsv(table)], { type: 'text/csv;charset=utf-8' }), `${fileSlug(category.name)}.csv`)}>
          Download the table (CSV)
        </button>
      </div>
      <p className="muted small">
        {category.name}: {count} {count === 1 ? 'record' : 'records'}. Set up to be shown {ready.length ? ready.map((v) => KIND_VIEW_LABELS[v].toLowerCase()).join(', ') : 'only as a table'}; {graphWords}. <Link to={codexLink}>Change this in the Codex</Link>
      </p>
      {body}
    </div>
  );
}

interface PartProps {
  model: StoryModel;
  category: Category;
  mode: 'visual' | 'list';
  pick: (ref: EntityRef) => void;
  selectedId: string | null;
  keep: (id: string) => boolean;
}
const rowClass = (selectedId: string | null, id: string) => (selectedId === id ? 'viz-row selected' : 'viz-row');

/** Every record and its fields, each value as a reader sees it. */
function KindTable({ model, category, pick, selectedId, keep }: PartProps) {
  const table = kindTable(model, category.key);
  const short = (text: string) => (text.length > 120 ? `${text.slice(0, 119)}…` : text);
  return (
    <div className="table-scroll">
      <table className="sessions kind-table">
        <caption className="visually-hidden">{category.name}: every record and its fields</caption>
        <thead>
          <tr>
            <th scope="col">Name</th>
            {table.columns.map((c) => (
              <th key={c.id} scope="col">
                {c.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows
            .filter((r) => keep(r.entry.id))
            .map((r) => (
              <tr key={r.entry.id} className={rowClass(selectedId, r.entry.id)}>
                <th scope="row">
                  <Name id={r.entry.id} name={r.entry.name} pick={pick} selectedId={selectedId} />
                </th>
                {r.cells.map((cell, i) => (
                  <td key={table.columns[i].id} title={cell.length > 120 ? cell : undefined}>
                    {short(cell)}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

/** On the story's timeline: one row a record, a dot for a moment, a bar from start to end. */
function KindTimeline({ model, category, mode, pick, selectedId, keep }: PartProps) {
  const [ref, size] = useSize<HTMLDivElement>();
  const timeline = kindTimeline(model, category.key);
  const placed = timeline.placed.filter((t) => keep(t.entry.id));
  const unplaced = timeline.unplaced.filter((u) => keep(u.entry.id));
  const drawn = (
    <>
      {placed.length === 0 && <p className="muted">None of the records shown has a date that can be placed.</p>}
      <NotDrawn items={unplaced} what="on the timeline" />
    </>
  );
  if (mode === 'list' || !placed.length)
    return (
      <>
        <ol className="viz-list" aria-label={`${category.name} in story order`}>
          {placed.map((t) => (
            <li key={t.entry.id} className={rowClass(selectedId, t.entry.id)}>
              <Name id={t.entry.id} name={t.entry.name} pick={pick} selectedId={selectedId} /> <span className="muted">{t.label}</span>
              {t.note && <div className="muted small">{t.note}</div>}
            </li>
          ))}
        </ol>
        {drawn}
      </>
    );
  const lo = Math.min(...placed.map((t) => t.span.lo));
  const hi = Math.max(...placed.map((t) => t.span.hi));
  const pad = Math.max((hi - lo) * 0.04, 60 * 24 * 30);
  const window = { from: lo - pad, to: hi + pad };
  const at = (t: number) => `${((t - window.from) / (window.to - window.from)) * 100}%`;
  const ticks = ticksFor(window, Math.max(size.width - 200, 240), model.calendar);
  return (
    <>
      <div className="kind-timeline" ref={ref}>
        <div className="kt-row kt-head" aria-hidden="true">
          <span />
          <span className="kt-track kt-axis">
            {ticks.map((t) => (
              <span key={t.t} className="kt-tick" style={{ left: at(t.t) }}>
                {t.label}
              </span>
            ))}
          </span>
        </div>
        <ol className="kt-rows" aria-label={`${category.name} on the story’s timeline, in story order`}>
          {placed.map((t) => (
            <li key={t.entry.id} className={`kt-row ${rowClass(selectedId, t.entry.id)}`}>
              <span className="kt-name">
                <Name id={t.entry.id} name={t.entry.name} pick={pick} selectedId={selectedId} />
                <span className="muted small">{t.label}</span>
              </span>
              <span className="kt-track" aria-hidden="true">
                {ticks.map((tick) => (
                  <span key={tick.t} className="kt-grid" style={{ left: at(tick.t) }} />
                ))}
                {t.end ? <span className="kt-bar" style={{ left: at(t.span.lo), width: `calc(${at(t.span.hi)} - ${at(t.span.lo)})` }} /> : <span className="kt-dot" style={{ left: at(t.span.lo) }} />}
              </span>
              {t.note && <span className="kt-note muted small">{t.note}</span>}
            </li>
          ))}
        </ol>
      </div>
      <Legend
        title="What the timeline shows"
        items={[
          ...(placed.some((t) => !t.end) ? [{ key: 'moment', label: 'A moment: one date', color: 'var(--accent)', shape: 'circle' as const }] : []),
          ...(placed.some((t) => t.end) ? [{ key: 'span', label: 'A stretch of time: from one date to another', color: 'var(--accent)', shape: 'line' as const }] : []),
        ]}
      />
      {drawn}
    </>
  );
}

/** On a plane, by the two Number fields set as across and up; up is up. */
function KindMap({ model, category, mode, pick, selectedId, keep }: PartProps) {
  const map = kindMap(model, category.key);
  const points = map.points.filter((p) => keep(p.entry.id));
  const unplaced = map.unplaced.filter((u) => keep(u.entry.id));
  const refs = useRef(new Map<string, SVGGElement>());
  const [current, setCurrent] = useState<string | null>(null);
  if (mode === 'list' || !points.length)
    return (
      <>
        {points.length === 0 && <p className="muted">None of the records shown has both numbers.</p>}
        {points.length > 0 && (
          <div className="table-scroll">
            <table className="sessions">
              <caption className="visually-hidden">{category.name} by where they are</caption>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">{map.axes.x} (across)</th>
                  <th scope="col">{map.axes.y} (up)</th>
                </tr>
              </thead>
              <tbody>
                {points.map((p) => (
                  <tr key={p.entry.id} className={rowClass(selectedId, p.entry.id)}>
                    <th scope="row">
                      <Name id={p.entry.id} name={p.entry.name} pick={pick} selectedId={selectedId} />
                    </th>
                    <td>{p.x}</td>
                    <td>{p.y}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <NotDrawn items={unplaced} what="on the map" />
      </>
    );
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  // One scale for both directions, so distances keep their proportions; about 600 units across the larger spread.
  const scale = 600 / Math.max(maxX - minX, maxY - minY, 1e-9);
  const sx = (x: number) => (x - minX) * scale;
  const sy = (y: number) => (maxY - y) * scale;
  const marks = points.map((p) => ({ id: p.entry.id, x: sx(p.x), y: sy(p.y), point: p }));
  const bounds = { minX: -60, minY: -40, maxX: Math.max(...marks.map((m) => m.x)) + 80, maxY: Math.max(...marks.map((m) => m.y)) + 50 };
  const [gx, gy] = [niceTicks(minX, maxX), niceTicks(minY, maxY)];
  const focusId = current && marks.some((m) => m.id === current) ? current : marks[0].id;
  const onKey = (e: KeyboardEvent, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      pick({ type: 'entry', id });
      return;
    }
    const next = nearestInDirection(marks, id, e.key);
    if (!next) return;
    e.preventDefault();
    e.stopPropagation();
    setCurrent(next.id);
    refs.current.get(next.id)?.focus();
  };
  return (
    <>
      <Viewport label={`Map of ${points.length} ${points.length === 1 ? category.singular.toLowerCase() : category.name.toLowerCase()}: ${map.axes.x} across, ${map.axes.y} up. Arrow keys move between them, Enter selects.`} bounds={bounds} of="the map">
        {(view) => (
          <>
            {gx.map((x) => (
              <g key={`x${x}`} className="km-grid">
                <line x1={sx(x)} y1={-20} x2={sx(x)} y2={sy(minY) + 20} />
                <text x={sx(x)} y={sy(minY) + 34} textAnchor="middle" style={{ fontSize: 11 / Math.max(view.k, 0.6) }}>
                  {x}
                </text>
              </g>
            ))}
            {gy.map((y) => (
              <g key={`y${y}`} className="km-grid">
                <line x1={-20} y1={sy(y)} x2={sx(maxX) + 20} y2={sy(y)} />
                <text x={-26} y={sy(y)} textAnchor="end" dy="0.35em" style={{ fontSize: 11 / Math.max(view.k, 0.6) }}>
                  {y}
                </text>
              </g>
            ))}
            {marks.map((m) => {
              const selected = selectedId === m.id;
              return (
                <g
                  key={m.id}
                  ref={(el) => void (el ? refs.current.set(m.id, el) : refs.current.delete(m.id))}
                  className={`km-point${selected ? ' selected' : ''}`}
                  data-mark
                  role="button"
                  tabIndex={m.id === focusId ? 0 : -1}
                  aria-pressed={selected}
                  aria-label={`${m.point.entry.name}: ${map.axes.x} ${m.point.x}, ${map.axes.y} ${m.point.y}`}
                  transform={`translate(${m.x} ${m.y})`}
                  onClick={() => pick({ type: 'entry', id: m.id })}
                  onKeyDown={(e) => onKey(e, m.id)}
                  onFocus={() => setCurrent(m.id)}
                >
                  <circle r={7 / Math.max(view.k, 0.6)} style={{ fill: category.color }} />
                  <text x={10 / Math.max(view.k, 0.6)} dy="0.35em" className="viz-label" style={{ fontSize: 12 / Math.max(view.k, 0.6) }}>
                    {m.point.entry.name.length > 24 ? `${m.point.entry.name.slice(0, 23)}…` : m.point.entry.name}
                  </text>
                  <title>{`${m.point.entry.name}: ${map.axes.x} ${m.point.x}, ${map.axes.y} ${m.point.y}`}</title>
                </g>
              );
            })}
          </>
        )}
      </Viewport>
      <Legend title="What the map shows" items={[{ key: 'point', label: `${category.singular}, at its ${map.axes.x} and ${map.axes.y}`, color: category.color, shape: 'circle' }]} />
      <p className="muted small">
        Across: {map.axes.x}. Up: {map.axes.y}. One step across is the same length as one step up.
      </p>
      <NotDrawn items={unplaced} what="on the map" />
    </>
  );
}

/** On a ladder of ranks, highest at the top. */
function KindRanks({ model, category, mode, pick, selectedId, keep }: PartProps) {
  const ranks = kindRanks(model, category.key);
  const levels = ranks.levels.map((l) => ({ ...l, entries: l.entries.filter((e) => keep(e.id)) }));
  const unplaced = ranks.unplaced.filter((u) => keep(u.entry.id));
  const most = Math.max(1, ...levels.map((l) => l.entries.length));
  return (
    <>
      {mode === 'list' ? (
        <ol className="viz-list" aria-label={`${category.name} by ${ranks.field}, highest first`}>
          {levels.map((l) => (
            <li key={l.label}>
              <strong>{l.label}</strong>:{' '}
              {l.entries.length ? (
                l.entries.map((e, i) => (
                  <span key={e.id}>
                    {i > 0 && ', '}
                    <Name id={e.id} name={e.name} pick={pick} selectedId={selectedId} />
                  </span>
                ))
              ) : (
                <span className="muted">none</span>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <ol className="kind-ladder" aria-label={`${category.name} by ${ranks.field}, highest first`}>
          {levels.map((l) => (
            <li key={l.label} className="kl-level">
              <span className="kl-label">{l.label}</span>
              <span className="kl-rung" aria-hidden="true">
                <span className="kl-fill" style={{ width: `${(l.entries.length / most) * 100}%`, background: category.color }} />
              </span>
              <span className="kl-count muted small">{l.entries.length}</span>
              <ul className="kl-records" aria-label={`Ranked ${l.label}`}>
                {l.entries.map((e) => (
                  <li key={e.id} className={selectedId === e.id ? 'selected' : undefined}>
                    <Name id={e.id} name={e.name} pick={pick} selectedId={selectedId} />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
      <NotDrawn items={unplaced} what="ranked" />
    </>
  );
}

/** Who holds each record over the story: each holding in the order it began, then who the current-holder field names. */
function KindHolders({ model, category, mode, pick, selectedId, keep }: PartProps) {
  const held = kindHolders(model, category.key);
  const records = held.records.filter((r) => keep(r.entry.id));
  return (
    <ul className={mode === 'list' ? 'viz-list' : 'kind-holders'} aria-label={`${category.name} and who holds them (${held.typeLabel})`}>
      {records.map((r) => (
        <li key={r.entry.id} className={rowClass(selectedId, r.entry.id)}>
          <Name id={r.entry.id} name={r.entry.name} pick={pick} selectedId={selectedId} />
          {mode === 'list' ? (
            <span>
              {': '}
              {r.history.length ? r.history.map((h) => `${h.holderName} (${h.when})`).join(', then ') : 'no holding recorded'}
              {r.current && `. ${held.field}: ${r.current.name}`}.
            </span>
          ) : (
            <ol className="kh-chain" aria-label={`Who has held ${r.entry.name}, in order`}>
              {r.history.map((h) => (
                <li key={h.connection.id} className="kh-holding">
                  <button type="button" className="link" onClick={() => pick(h.holder)}>
                    {h.holderName}
                  </button>
                  <span className="muted small">{h.when}</span>
                </li>
              ))}
              {!r.history.length && <li className="muted small">No holding recorded</li>}
              {r.current && (
                <li className="kh-holding kh-field">
                  <span className="small">{held.field}:</span>{' '}
                  <button type="button" className="link" onClick={() => pick({ type: 'entry', id: r.current!.id })}>
                    {r.current.name}
                  </button>
                </li>
              )}
            </ol>
          )}
          {r.note && (
            <small className="field-issue" role="note">
              {r.note}
            </small>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Recording who holds a record, beside the view: a first holder, a new
 * holder from a point in the story (the holding before it ends there and is
 * kept, as history), or that nobody holds it from then on.
 */
export function HolderEditor({ model, projectId, entryId }: { model: StoryModel; projectId: string; entryId: string }) {
  const entry = model.entries.get(entryId);
  const category = entry ? model.categories.get(entry.category) : undefined;
  const type = category?.uses?.ownership?.type;
  const [holder, setHolder] = useState('');
  const [when, setWhen] = useState('');
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  if (!entry || !category || !type || missingFor(category, 'ownership').length) return null;
  const open = kindHolders(model, category.key).records.find((r) => r.entry.id === entryId)?.history.filter((h) => !h.connection.validity?.until) ?? [];
  const chapters = [...model.nodes.values()].filter((n) => model.order.position.has(n.id)).sort((a, b) => model.order.position.get(a.id)! - model.order.position.get(b.id)!);
  const events = timelineRows(model);
  const others = [...model.entries.values()].filter((e) => e.id !== entryId).sort((a, b) => a.name.localeCompare(b.name));
  const api = connections.forProject(projectId);
  const record = async () => {
    const at = decodeAnchor(when);
    if (holder === 'nobody') {
      if (!open.length) throw new Error(`Nobody is recorded as holding ${entry.name} now.`);
      if (!at) throw new Error('Choose when it stops being held.');
      for (const h of open) await api.end(h.connection.source.id, at);
      return `Recorded: nobody holds ${entry.name} from then on.`;
    }
    const to = { type: 'entry' as const, id: entryId };
    const from = { type: 'entry' as const, id: holder };
    if (open.length === 1) {
      if (!at) throw new Error(`Choose when it passes to them: ${open[0].holderName} holds it until then.`);
      // The stored connection, by its own id (the model names it `link:<id>`).
      await api.change(open[0].connection.source.id, at, { from });
    } else await api.create({ from, to, type, ...(at ? { validity: { from: at, until: null } } : {}) });
    return `Recorded: ${model.entries.get(holder)?.name} holds ${entry.name}${at ? ' from then on' : ''}.`;
  };
  return (
    <form
      className="stack tight viz-editor"
      aria-label={`Record who holds ${entry.name}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (!holder) return;
        void record().then(
          (text) => {
            setHolder('');
            setWhen('');
            setMessage({ text });
          },
          (err) => setMessage({ text: err instanceof Error ? err.message : String(err), error: true }),
        );
      }}
    >
      <h4>Record who holds it</h4>
      <p className="muted small">{open.length ? `Held now by ${open.map((h) => h.holderName).join(' and ')}. A new holder takes over from the point you choose; the earlier holding is kept as history.` : 'Nobody is recorded as holding it now.'}</p>
      <label className="field">
        <span>Holder</span>
        <select aria-label="Holder" value={holder} onChange={(e) => setHolder(e.target.value)}>
          <option value="">Choose…</option>
          {open.length > 0 && <option value="nobody">Nobody: it stops being held</option>}
          <EntryOptions entries={others} />
        </select>
      </label>
      <label className="field">
        <span>From</span>
        <select aria-label="From when" value={when} onChange={(e) => setWhen(e.target.value)}>
          <option value="">The start of the story</option>
          <optgroup label="A chapter or scene">
            {chapters.map((n) => (
              <option key={n.id} value={encodeAnchor({ kind: 'node', nodeId: n.id })}>
                {nodeLabel(model, n.id)}
              </option>
            ))}
          </optgroup>
          <optgroup label="An event">
            {events.map((ev) => (
              <option key={ev.id} value={encodeAnchor({ kind: 'event', eventId: ev.id })}>
                {ev.title}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      <div className="actions start">
        <button type="submit" className="btn" disabled={!holder}>
          Record it
        </button>
      </div>
      {message && (
        <p className={message.error ? 'error' : 'notice'} role={message.error ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}
    </form>
  );
}
