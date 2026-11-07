import { useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { manuscript } from '@/core';
import { appearanceMatrix, documentsOf, evidenceWords, STATE_LABELS, type CellState, type MatrixColumn, type MatrixRow } from '@/modules/characters/appearances';
import { useMe } from '@/modules/collab/identity';
import { NODE_STATUSES, STATUS_LABELS, type NodeStatus } from '@/modules/manuscript/types';
import type { EntityRef, StoryModel } from '@/modules/model/types';
import { can } from '@/modules/sync/access';
import { Legend, type SwatchShape } from '@/modules/viz/components/Legend';
import { ViewSwitch } from '@/modules/viz/components/ViewSwitch';
import { VizState } from '@/modules/viz/components/VizState';
import { decodeFilter } from '@/modules/viz/params';

const GLYPH: Record<CellState, string> = { appears: '●', mentioned: '◐', other: '○', none: '' };
const SHAPES: Record<Exclude<CellState, 'none'>, SwatchShape> = { appears: 'circle', mentioned: 'half', other: 'ring' };

interface AppearancesViewProps {
  model: StoryModel;
  projectId: string;
  params: URLSearchParams;
  setParams: (changes: Record<string, string | null>) => void;
  mode: 'visual' | 'list';
  setMode: (mode: 'visual' | 'list') => void;
  pick: (ref: EntityRef) => void;
  /** Clears the page's own filters (character, search, range, thread, place). */
  clear: () => void;
}

/**
 * CHARACTER APPEARANCES
 * Characters against chapters (or scenes), from recorded associations only:
 * the author's appearance records, and the other records that tie a
 * character to a chapter, each shown for what it is. A blank cell is
 * nothing recorded, never proof that a character is not in the text.
 */
/** About how many cells the matrix draws at first; more rows are drawn when asked. */
const CELL_BUDGET = 6000;

export function AppearancesView({ model, projectId, params, setParams, mode, setMode, pick, clear }: AppearancesViewProps) {
  const me = useMe(projectId);
  const writable = can(me.role, 'write');
  const asked = decodeFilter(params);
  const grain = params.get('agrain') === 'scenes' ? 'scenes' : 'chapters';
  const status = NODE_STATUSES.includes(params.get('astatus') as NodeStatus) ? (params.get('astatus') as NodeStatus) : null;
  const all = params.get('aall') === '1';
  const [showAll, setShowAll] = useState({ from: all, value: all });
  if (showAll.from !== all) setShowAll({ from: all, value: all });
  const [focus, setFocus] = useState({ row: 0, col: 0 });
  // How many characters' rows are drawn: a large matrix comes in steps, so the page opens quickly.
  const [rowsAsked, setRowsAsked] = useState<number | null>(null);
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const [error, setError] = useState<string | null>(null);

  const characters = [...model.entries.values()].filter((e) => e.category === 'character');
  if (!characters.length) return <VizState status={{ kind: 'empty', message: 'No characters yet. Make one on the Characters page; then record, in each chapter’s plan, who appears there.' }} />;
  if (!model.order.chapters.length) return <VizState status={{ kind: 'empty', message: 'No chapters yet. Add chapters in the Organizer; then record, in each one’s plan, who appears there.' }} />;

  const filter = { grain, characterIds: asked.characters, text: asked.text, from: asked.chapters?.from ?? null, to: asked.chapters?.to ?? null, threadId: asked.threads?.[0] ?? null, placeId: asked.locations?.[0] ?? null, status, all: showAll.value } as const;
  const matrix = appearanceMatrix(model, filter);
  const { columns, rows } = matrix;
  const [cellChar, cellNode] = (params.get('acell') ?? '').split('~');
  const chosen = { row: rows.findIndex((r) => r.characterId === cellChar), col: columns.findIndex((c) => c.nodeId === cellNode) };
  // Rows drawn: enough for about CELL_BUDGET cells, more when asked, and always the chosen cell's row.
  const step = Math.max(20, Math.floor(CELL_BUDGET / Math.max(1, columns.length)));
  const drawnRows = rows.slice(0, Math.max(rowsAsked ?? step, chosen.row + 1));
  const documents = documentsOf(model).filter((n) => n.kind === 'chapter');
  const threads = [...model.threads.values()].sort((a, b) => a.title.localeCompare(b.title));
  const places = [...model.entries.values()].filter((e) => e.category === 'location').sort((a, b) => a.name.localeCompare(b.name));
  const filtered = Boolean(filter.from || filter.to || filter.threadId || filter.placeId || status || asked.characters?.length || asked.text);
  const cellWords = (row: MatrixRow, col: number) => {
    const cell = row.cells[col];
    const column = columns[col];
    return `${row.name}, ${column.label}: ${STATE_LABELS[cell.state].toLowerCase()}${cell.evidence.length ? ` (${evidenceWords(cell.evidence, model, column.nodeId).join('; ')})` : ''}`;
  };
  const choose = (row: number, col: number) => setParams({ acell: `${rows[row].characterId}~${columns[col].nodeId}` });
  const move = (row: number, col: number) => {
    const next = { row: Math.max(0, Math.min(drawnRows.length - 1, row)), col: Math.max(0, Math.min(columns.length - 1, col)) };
    setFocus(next);
    refs.current.get(`${next.row}:${next.col}`)?.focus();
  };
  const onKey = (e: KeyboardEvent, row: number, col: number) => {
    const keys: Record<string, () => void> = { ArrowRight: () => move(row, col + 1), ArrowLeft: () => move(row, col - 1), ArrowDown: () => move(row + 1, col), ArrowUp: () => move(row - 1, col), Home: () => move(row, 0), End: () => move(row, columns.length - 1), Enter: () => choose(row, col), ' ': () => choose(row, col) };
    if (!keys[e.key]) return;
    e.preventDefault();
    keys[e.key]();
  };
  const record = (column: MatrixColumn, characterId: string, as: 'appears' | 'mentioned' | null) => {
    const plan = model.plans.get(column.nodeId);
    const [appear, mention] = [(plan?.appearIds ?? []).filter((id) => id !== characterId), (plan?.mentionIds ?? []).filter((id) => id !== characterId)];
    const changes = as === 'appears' ? { appearIds: [...appear, characterId] } : as === 'mentioned' ? { mentionIds: [...mention, characterId] } : { appearIds: appear, mentionIds: mention };
    void manuscript.forProject(projectId).updatePlan(column.nodeId, changes).then(() => setError(null), (e) => setError(e instanceof Error ? e.message : String(e)));
  };

  const controls = (
    <div className="viz-toolbar ap-controls">
      <div className="segmented" role="group" aria-label="Columns for">
        {(['chapters', 'scenes'] as const).map((g) => (
          <button key={g} type="button" className={grain === g ? 'active' : ''} aria-pressed={grain === g} onClick={() => setParams({ agrain: g === 'scenes' ? 'scenes' : null })}>
            {g === 'chapters' ? 'Chapters' : 'Scenes'}
          </button>
        ))}
      </div>
      <label className="field">
        <span>From chapter</span>
        <select aria-label="From chapter" value={filter.from ?? ''} onChange={(e) => setParams({ from: e.target.value || null })}>
          <option value="">The first</option>
          {documents.map((d, i) => (
            <option key={d.id} value={d.id}>
              {i + 1}. {d.title}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>To chapter</span>
        <select aria-label="To chapter" value={filter.to ?? ''} onChange={(e) => setParams({ to: e.target.value || null })}>
          <option value="">The last</option>
          {documents.map((d, i) => (
            <option key={d.id} value={d.id}>
              {i + 1}. {d.title}
            </option>
          ))}
        </select>
      </label>
      {threads.length > 0 && (
        <label className="field">
          <span>Plot thread</span>
          <select aria-label="Only where a plot thread is" value={filter.threadId ?? ''} onChange={(e) => setParams({ threads: e.target.value || null })}>
            <option value="">Any</option>
            {threads.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </label>
      )}
      {places.length > 0 && (
        <label className="field">
          <span>Place</span>
          <select aria-label="Only where a place is" value={filter.placeId ?? ''} onChange={(e) => setParams({ places: e.target.value || null })}>
            <option value="">Any</option>
            {places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="field">
        <span>Status</span>
        <select aria-label="Chapter status" value={status ?? ''} onChange={(e) => setParams({ astatus: e.target.value || null })}>
          <option value="">Any</option>
          {NODE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={showAll.value}
          onChange={(e) => {
            setShowAll({ from: all, value: e.target.checked });
            setParams({ aall: e.target.checked ? '1' : null });
          }}
        />
        Show characters with nothing recorded here
      </label>
      <ViewSwitch mode={mode} onChange={setMode} visualLabel="Matrix" />
    </div>
  );

  const selected = chosen.row >= 0 && chosen.col >= 0 ? { row: rows[chosen.row], column: columns[chosen.col], cell: rows[chosen.row].cells[chosen.col] } : null;
  const ownRecord = selected ? ((model.plans.get(selected.column.nodeId)?.appearIds ?? []).includes(selected.row.characterId) ? 'appears' : (model.plans.get(selected.column.nodeId)?.mentionIds ?? []).includes(selected.row.characterId) ? 'mentioned' : null) : null;
  const base = `/project/${projectId}`;

  return (
    <div className="stack appearances-view">
      <p className="notice ap-about">
        <strong>From what is recorded.</strong> Each cell shows your appearance record (appears, or only mentioned) if you made one, and otherwise any other record tying the character to that chapter: a link in the text, the plan’s “Entities involved”, or an event they take part in that the chapter tells. Nothing is read from the text itself. A blank cell means nothing is recorded, not that the character is absent.
      </p>
      {controls}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!columns.length ? (
        <VizState
          status={{
            kind: 'empty',
            message: 'No chapters match these filters.',
            action: (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  clear();
                  setParams({ astatus: null });
                }}
              >
                Clear filters
              </button>
            ),
          }}
        />
      ) : (
        <>
          <p role="status" className="ap-facts">
            {rows.length} {rows.length === 1 ? 'character' : 'characters'} × {columns.length} {grain === 'chapters' ? (columns.length === 1 ? 'chapter' : 'chapters') : columns.length === 1 ? 'column' : 'columns'} · {rows.reduce((n, r) => n + r.recorded, 0)} cells with a record
            {matrix.hidden > 0 && ` · ${matrix.hidden} ${matrix.hidden === 1 ? 'character' : 'characters'} with nothing recorded here not shown`}
            {filtered && ' · filtered'}
          </p>
          {!rows.length ? (
            <VizState
              status={{
                kind: 'empty',
                message: 'Nothing is recorded for anyone in these chapters. That is not the same as nobody being in them.',
                action: (
                  <button type="button" className="btn" onClick={() => setParams({ aall: '1' })}>
                    Show every character
                  </button>
                ),
              }}
            />
          ) : mode === 'visual' ? (
            <>
              <div className="table-scroll">
                <table className="ap-matrix" aria-label="Characters by chapter: arrow keys move between cells, Enter opens one">
                  <thead>
                    <tr>
                      <th scope="col">Character</th>
                      {columns.map((c) => (
                        <th key={c.nodeId} scope="col" title={c.label} aria-label={c.label}>
                          {c.short}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {drawnRows.map((row, r) => (
                      <tr key={row.characterId}>
                        <th scope="row">
                          <button type="button" className="link" onClick={() => pick({ type: 'entry', id: row.characterId })}>
                            {row.name}
                          </button>
                        </th>
                        {row.cells.map((cell, c) => (
                          <td key={columns[c].nodeId} className={`ap-${cell.state}${chosen.row === r && chosen.col === c ? ' chosen' : ''}`}>
                            <button
                              type="button"
                              ref={(el) => void (el ? refs.current.set(`${r}:${c}`, el) : refs.current.delete(`${r}:${c}`))}
                              tabIndex={focus.row === r && focus.col === c ? 0 : -1}
                              aria-pressed={chosen.row === r && chosen.col === c}
                              aria-label={cellWords(row, c)}
                              onKeyDown={(e) => onKey(e, r, c)}
                              onFocus={() => setFocus({ row: r, col: c })}
                              onClick={() => {
                                setFocus({ row: r, col: c });
                                choose(r, c);
                              }}
                            >
                              {GLYPH[cell.state]}
                            </button>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {drawnRows.length < rows.length && (
                <p className="small ap-more" role="status">
                  Showing the first {drawnRows.length} of {rows.length} characters, by name, so the table stays quick. The list shows everyone.{' '}
                  <button type="button" className="btn ghost small" onClick={() => setRowsAsked(drawnRows.length + step)}>
                    Show {Math.min(step, rows.length - drawnRows.length)} more
                  </button>{' '}
                  <button type="button" className="btn ghost small" onClick={() => setRowsAsked(rows.length)}>
                    Show all {rows.length} (may be slow)
                  </button>
                </p>
              )}
              <Legend title="What a cell shows" items={[...(Object.keys(SHAPES) as (keyof typeof SHAPES)[]).map((s) => ({ key: s, label: s === 'other' ? 'Other records (a link in the text, the plan, an event)' : STATE_LABELS[s] + (s === 'mentioned' ? ', not on the page' : ''), color: 'var(--text)', shape: SHAPES[s] })), { key: 'none', label: 'Blank: nothing recorded (not the same as absent)', color: 'var(--muted)', shape: 'empty' }]} />
            </>
          ) : (
            <ul className="viz-list ap-list" aria-label="Where each character is recorded">
              {rows.map((row) => {
                const by = (state: CellState) => columns.filter((_, c) => row.cells[c].state === state).map((c) => c.label);
                return (
                  <li key={row.characterId}>
                    <strong>{row.name}</strong>
                    {(['appears', 'mentioned', 'other'] as const).map((s) => by(s).length > 0 && <div key={s} className="small">{STATE_LABELS[s]}: {by(s).join(', ')}</div>)}
                    <div className="muted small">Nothing recorded: {by('none').length ? by('none').join(', ') : 'none'}</div>
                  </li>
                );
              })}
            </ul>
          )}
          {selected && (
            <section className="stack ap-detail" aria-label={`Selected: ${selected.row.name} in ${selected.column.label}`}>
              <h3>
                {selected.row.name} in {selected.column.label}
              </h3>
              <p>
                <strong>{STATE_LABELS[selected.cell.state]}.</strong>{' '}
                {selected.cell.state === 'none' ? 'Nothing ties them to it in your records. They may still be in the text.' : ''}
              </p>
              {selected.cell.evidence.length > 0 && (
                <ul className="small">
                  {evidenceWords(selected.cell.evidence, model, selected.column.nodeId).map((w, i) => (
                    <li key={i}>
                      {w}
                      {selected.cell.evidence[i].eventId && (
                        <>
                          {' '}
                          <button type="button" className="link" onClick={() => pick({ type: 'event', id: selected.cell.evidence[i].eventId! })}>
                            Show the event
                          </button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <p className="small ap-links">
                <Link to={`${base}/manuscript/${selected.column.nodeId}`}>Open {selected.column.label} in the manuscript →</Link>
                <Link to={`${base}/characters/${selected.row.characterId}`}>Open {selected.row.name} →</Link>
                <Link to={`${base}/organizer`} state={{ select: selected.column.nodeId }}>
                  Its plan in the Organizer →
                </Link>
              </p>
              {writable && (
                <div className="actions start" role="group" aria-label="Your record">
                  <button type="button" className="btn" disabled={ownRecord === 'appears'} onClick={() => record(selected.column, selected.row.characterId, 'appears')}>
                    Record: appears here
                  </button>
                  <button type="button" className="btn" disabled={ownRecord === 'mentioned'} onClick={() => record(selected.column, selected.row.characterId, 'mentioned')}>
                    Record: mentioned here
                  </button>
                  {ownRecord && (
                    <button type="button" className="btn ghost" onClick={() => record(selected.column, selected.row.characterId, null)}>
                      Remove my record
                    </button>
                  )}
                </div>
              )}
              {writable && grain === 'chapters' && selected.cell.evidence.some((e) => e.nodeId !== selected.column.nodeId) && <p className="muted small">A record made here is on the chapter itself; its scenes keep their own.</p>}
            </section>
          )}
        </>
      )}
    </div>
  );
}
