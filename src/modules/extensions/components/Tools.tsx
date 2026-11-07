import { entryPath } from '@/modules/characters/hooks';
import { useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { codex, extensions } from '@/core';
import { EntryOptions } from '@/modules/codex/categories';
import { TypedInput } from '@/modules/codex/components/TypedInput';
import { viewFields } from '@/modules/codex/schema';
import { useRelationships } from '@/modules/relationships/hooks';
import { useTimeline } from '@/modules/timeline/hooks';
import { SavedText } from '@/shared/SavedText';
import { buildLineage } from '../lineage';
import type { Category, FieldDef, LoreEntry } from '@/modules/codex/types';
import { useProgression } from '@/modules/progression/hooks';
import { inStoryOrder, placeOf, resolveSystem, stateAt } from '@/modules/progression/state';
import { Commit } from '@/modules/systems/components/inputs';
import { evaluate, FormulaError, formatNumber, parse } from '@/modules/systems/formula';
import type { ToolData } from '../hooks';
import type { ModuleRecord, ToolDef } from '../types';

type Tool<T extends ToolDef['type']> = Extract<ToolDef, { type: T }>;
interface Props<T extends ToolDef['type']> {
  tool: Tool<T>;
  moduleId: string;
  data: ToolData;
  onError: (err: unknown) => void;
}

const Missing = ({ what }: { what: string }) => <p className="muted">This tool needs {what}, which is not in the Codex. Turning the module off and on again puts back anything of its own that is missing.</p>;
const profile = (data: ToolData, entry: LoreEntry) => entryPath(data.projectId, entry);

/** Adds an entry to a category without leaving the tool. */
function NewEntry({ category, data, onError, preset }: { category: Category; data: ToolData; onError: (err: unknown) => void; preset?: { def: FieldDef; value: string } }) {
  const [name, setName] = useState('');
  return (
    <form
      className="toolbar new-entry"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        const api = codex.forProject(data.projectId);
        void api.create(category.key, name).then(async (entry) => {
          if (preset?.value) await api.setFieldValue(entry.id, preset.def.id, preset.value);
          setName('');
        }, onError);
      }}
    >
      <input value={name} aria-label={`New ${category.singular.toLowerCase()}`} placeholder={`New ${category.singular.toLowerCase()}…`} onChange={(e) => setName(e.target.value)} />
      <button type="submit" className="btn" disabled={!name.trim()}>
        Add
      </button>
    </form>
  );
}

/** The right control for a field, compact enough for a table cell. */
function Cell({ entry, category, def, data, onError }: { entry: LoreEntry; category: Category; def: FieldDef; data: ToolData; onError: (err: unknown) => void }) {
  const value = data.raw(entry, category, def);
  const label = `${def.name} of ${entry.name}`;
  const save = (next: string) => void data.setValue(entry, def, next).catch(onError);
  if (def.type === 'select' || def.type === 'toggle') {
    const options = def.type === 'toggle' ? ['yes', 'no'] : def.options;
    return (
      <select value={value} aria-label={label} onChange={(e) => save(e.target.value)}>
        <option value="">—</option>
        {value && !options.includes(value) && <option value={value}>{value}</option>}
        {options.map((option) => (
          <option key={option} value={option}>
            {def.type === 'toggle' ? (option === 'yes' ? 'Yes' : 'No') : option}
          </option>
        ))}
      </select>
    );
  }
  if (def.type === 'references' || def.type === 'tags') return <TypedInput label={label} type={def.type} options={def.options} value={value} entries={data.entries.filter((e) => e.id !== entry.id)} onSave={save} />;
  if (def.type === 'reference') {
    return (
      <select value={data.entries.some((e) => e.id === value) ? value : ''} aria-label={label} onChange={(e) => save(e.target.value)}>
        <option value="">—</option>
        <EntryOptions entries={data.entries.filter((e) => e.id !== entry.id)} />
      </select>
    );
  }
  return <Commit label={label} type={def.type === 'number' ? 'number' : 'text'} value={def.type === 'multiselect' ? value.split('\n').join(', ') : value} placeholder="—" multiline={def.type === 'longtext'} onCommit={(text) => save(def.type === 'multiselect' ? text.split(',').map((x) => x.trim()).filter(Boolean).join('\n') : text)} />;
}

export function BoardTool({ tool, data, onError }: Props<'board'>) {
  const category = data.category(tool.category);
  const group = data.field(category, tool.groupBy, tool.category);
  if (!category || !group) return <Missing what={`“${tool.category}” with a “${tool.groupBy}” field`} />;
  const entries = data.entriesOf(category);
  const values = entries.map((e) => data.raw(e, category, group));
  // A choice field's options in their own order; anything else, the values there are, smallest first.
  const columns = group.type === 'select' ? [...group.options, ...new Set(values.filter((v) => v && !group.options.includes(v)))] : [...new Set(values.filter(Boolean))].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
  const shown = (tool.show ?? []).flatMap((name) => data.field(category, name, tool.category) ?? []);
  const column = (title: string, value: string) => {
    const cards = entries.filter((e) => data.raw(e, category, group) === value);
    return (
      <section key={value || 'unset'} className="board-column" aria-label={title}>
        <h3>
          {title} <span className="muted">{cards.length}</span>
        </h3>
        {cards.map((entry) => (
          <article key={entry.id} className="board-card">
            <Link to={profile(data, entry)}>{entry.name}</Link>
            {shown.map((def) => {
              const text = data.shown(entry, category, def);
              return text ? (
                <p key={def.id} className="small">
                  <span className="muted">{def.name}:</span> {text}
                </p>
              ) : null;
            })}
            <Cell entry={entry} category={category} def={group} data={data} onError={onError} />
          </article>
        ))}
      </section>
    );
  };
  return (
    <div className="stack">
      <NewEntry category={category} data={data} onError={onError} />
      <div className="board">
        {columns.map((value) => column(group.type === 'number' ? `${group.name} ${value}` : value, value))}
        {(entries.some((e) => !data.raw(e, category, group)) || columns.length === 0) && column(`No ${group.name.toLowerCase()} yet`, '')}
      </div>
    </div>
  );
}

export function TableTool({ tool, data, onError }: Props<'table'>) {
  const category = data.category(tool.category);
  const defs = tool.fields.flatMap((name) => data.field(category, name, tool.category) ?? []);
  if (!category || !defs.length) return <Missing what={`“${tool.category}” and its fields`} />;
  const entries = data.entriesOf(category);
  return (
    <div className="stack">
      <NewEntry category={category} data={data} onError={onError} />
      {entries.length === 0 ? (
        <p className="muted">Nothing in {category.name} yet.</p>
      ) : (
        <div className="matrix-scroll">
          <table className="tool-table">
            <thead>
              <tr>
                <th scope="col">{category.singular}</th>
                {defs.map((def) => (
                  <th key={def.id} scope="col">
                    {def.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <th scope="row">
                    <Link to={profile(data, entry)}>{entry.name}</Link>
                  </th>
                  {defs.map((def) => (
                    <td key={def.id}>
                      <Cell entry={entry} category={category} def={def} data={data} onError={onError} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function MatrixTool({ tool, moduleId, data, onError }: Props<'matrix'>) {
  const [rows, columns] = [data.category(tool.rows), data.category(tool.columns)];
  if (!rows || !columns) return <Missing what={`“${tool.rows}” and “${tool.columns}”`} />;
  const [rowEntries, columnEntries] = [data.entriesOf(rows), data.entriesOf(columns)];
  const cells = new Map(data.records.filter((r) => r.kind === 'cell' && r.moduleId === moduleId && r.toolId === tool.id).map((r) => [`${r.rowId}|${r.colId}`, r.state]));
  const set = (row: LoreEntry, column: LoreEntry, value: string) => void extensions.forProject(data.projectId).setCell(moduleId, tool.id, row.id, column.id, value).catch(onError);
  return (
    <div className="stack">
      <div className="toolbar">
        <NewEntry category={rows} data={data} onError={onError} />
        {columns.key !== rows.key && <NewEntry category={columns} data={data} onError={onError} />}
      </div>
      {rowEntries.length === 0 || columnEntries.length === 0 ? (
        <p className="muted">
          Add at least one {rows.singular.toLowerCase()} and one {columns.singular.toLowerCase()} to fill in the matrix.
        </p>
      ) : (
        <div className="matrix-scroll">
          <table className="tool-table">
            <thead>
              <tr>
                <td />
                {columnEntries.map((column) => (
                  <th key={column.id} scope="col">
                    <Link to={profile(data, column)}>{column.name}</Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowEntries.map((row) => (
                <tr key={row.id}>
                  <th scope="row">
                    <Link to={profile(data, row)}>{row.name}</Link>
                  </th>
                  {columnEntries.map((column) => {
                    const value = cells.get(`${row.id}|${column.id}`) ?? '';
                    const label = `${row.name} and ${column.name}`;
                    return (
                      <td key={column.id} className={value ? `cell-${tool.values?.indexOf(value)}` : ''}>
                        {tool.values?.length ? (
                          <select value={value} aria-label={label} onChange={(e) => set(row, column, e.target.value)}>
                            <option value="">—</option>
                            {value && !tool.values.includes(value) && <option value={value}>{value}</option>}
                            {tool.values.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <Commit label={label} value={value} placeholder="—" onCommit={(text) => set(row, column, text)} />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function MetersTool({ tool, data, onError }: Props<'meters'>) {
  const category = data.category(tool.category);
  const defs = tool.fields.flatMap((name) => data.field(category, name, tool.category) ?? []);
  if (!category || !defs.length) return <Missing what={`“${tool.category}” with ${tool.fields.join(', ')}`} />;
  const entries = data.entriesOf(category);
  return (
    <div className="stack">
      <NewEntry category={category} data={data} onError={onError} />
      {entries.length === 0 && <p className="muted">Nothing in {category.name} yet.</p>}
      <ul className="meters">
        {entries.map((entry) => (
          <li key={entry.id}>
            <Link to={profile(data, entry)}>{entry.name}</Link>
            {defs.map((def) => {
              const value = Number(data.raw(entry, category, def));
              const known = data.raw(entry, category, def).trim() !== '' && Number.isFinite(value);
              return (
                <div key={def.id} className="meter">
                  <span className="muted small">{def.name}</span>
                  <span className="bar" role="meter" aria-label={`${def.name} meter for ${entry.name}`} aria-valuenow={known ? value : undefined} aria-valuemin={0} aria-valuemax={tool.max}>
                    <span style={{ width: `${known ? Math.max(0, Math.min(100, (value / tool.max) * 100)) : 0}%` }} />
                  </span>
                  <Cell entry={entry} category={category} def={def} data={data} onError={onError} />
                  <span className="muted small">/ {tool.max}</span>
                </div>
              );
            })}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Values over the course of the story, one line per thing they are about. */
function ArcChart({ records, data, range, label }: { records: ModuleRecord[]; data: ToolData; range: { min: number; max: number }; label: string }) {
  const points = records.filter((r) => r.value !== null && r.nodeId && data.position(r.nodeId) < Number.MAX_SAFE_INTEGER);
  if (points.length < 2) return <p className="muted small">Give at least two points a chapter and a value to see the line.</p>;
  const last = Math.max(1, data.documents.length - 1);
  const [width, height, pad] = [640, 180, 24];
  const x = (r: ModuleRecord) => pad + (data.position(r.nodeId) / last) * (width - pad * 2);
  const y = (r: ModuleRecord) => height - pad - ((Math.min(range.max, Math.max(range.min, r.value!)) - range.min) / (range.max - range.min || 1)) * (height - pad * 2);
  const series = [...new Set(points.map((r) => r.entryIds[0] ?? ''))];
  const colours = ['#b4532a', '#3d5fa8', '#3f7d4e', '#8a63a8', '#c08a1a'];
  return (
    <figure className="arc-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label} through the story`}>
        <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} className="axis" />
        <line x1={pad} y1={pad} x2={pad} y2={height - pad} className="axis" />
        {series.map((id, i) => {
          const mine = points.filter((r) => (r.entryIds[0] ?? '') === id).sort((a, b) => data.position(a.nodeId) - data.position(b.nodeId));
          return (
            <g key={id || 'all'} style={{ color: colours[i % colours.length] }}>
              <polyline points={mine.map((r) => `${x(r)},${y(r)}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="2" />
              {mine.map((r) => (
                <circle key={r.id} cx={x(r)} cy={y(r)} r="4" fill="currentColor">
                  <title>{`${r.title}: ${r.value} (${data.nodes.find((n) => n.id === r.nodeId)?.title})`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      <figcaption className="muted small">
        {label} from {range.min} to {range.max}, left to right through the chapters
        {series.filter(Boolean).length > 0 && `: ${series.map((id) => data.entries.find((e) => e.id === id)?.name ?? 'Everything else').join(', ')}`}
      </figcaption>
    </figure>
  );
}

export function LogTool({ tool, moduleId, data, onError }: Props<'log'>) {
  const { placed } = useTimeline(data.projectId);
  const [title, setTitle] = useState('');
  const [at, setAt] = useState('');
  const api = extensions.forProject(data.projectId);
  const about = tool.about ? data.category(tool.about) : undefined;
  const candidates = tool.about ? data.entriesOf(about) : data.entries;
  const records = data.records.filter((r) => r.kind === 'log' && r.moduleId === moduleId && r.toolId === tool.id).sort((a, b) => data.position(a.nodeId) - data.position(b.nodeId) || a.createdAt - b.createdAt);
  const add = (name: string) => name.trim() && void api.addRecord(moduleId, tool.id, { title: name, nodeId: at || null, state: tool.states?.[0] ?? '' }).then(() => setTitle(''), onError);
  const update = (record: ModuleRecord, changes: Parameters<typeof api.updateRecord>[1]) => void api.updateRecord(record.id, changes).catch(onError);
  const chapters = (value: string | null, label: string, none: string, onPick: (id: string | null) => void): ReactNode => (
    <select value={data.documents.some((t) => t.node.id === value) ? value! : ''} aria-label={label} onChange={(e) => onPick(e.target.value || null)}>
      <option value="">{none}</option>
      {data.documents.map(({ node, depth }) => (
        <option key={node.id} value={node.id}>
          {'  '.repeat(depth) + node.title}
        </option>
      ))}
    </select>
  );
  return (
    <div className="stack">
      {tool.value && <ArcChart records={records} data={data} range={tool.value} label={tool.value.label} />}
      <form
        className="toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          add(title);
        }}
      >
        <input value={title} aria-label={`New entry in ${tool.title}`} placeholder="What happens?" onChange={(e) => setTitle(e.target.value)} />
        {chapters(at, 'Chapter for the new entry', 'No chapter yet', (id) => setAt(id ?? ''))}
        <button type="submit" className="btn" disabled={!title.trim()}>
          Add
        </button>
      </form>
      {tool.suggestions && tool.suggestions.filter((s) => !records.some((r) => r.title === s)).length > 0 && (
        <div className="actions start wrap">
          {tool.suggestions.filter((s) => !records.some((r) => r.title === s)).map((suggestion) => (
            <button key={suggestion} type="button" className="badge reason" onClick={() => add(suggestion)}>
              + {suggestion}
            </button>
          ))}
        </div>
      )}
      {records.length === 0 ? (
        <p className="muted">Nothing logged yet.</p>
      ) : (
        <ol className="tool-log" aria-label={tool.title}>
          {records.map((record) => {
            const node = data.nodes.find((n) => n.id === record.nodeId);
            return (
              <li key={record.id} className={record.done ? 'done' : ''}>
                <div className="sys-row">
                  {tool.checklist && <input type="checkbox" checked={record.done} aria-label={`${record.title} done`} onChange={(e) => update(record, { done: e.target.checked })} />}
                  <Commit label={`Title of ${record.title}`} value={record.title} onCommit={(text) => update(record, { title: text })} className="grow" />
                  {tool.states && tool.states.length > 0 && (
                    <select value={record.state} aria-label={`State of ${record.title}`} onChange={(e) => update(record, { state: e.target.value })}>
                      {!tool.states.includes(record.state) && <option value={record.state}>{record.state || '—'}</option>}
                      {tool.states.map((state) => (
                        <option key={state} value={state}>
                          {state}
                        </option>
                      ))}
                    </select>
                  )}
                  {tool.value && <Commit type="number" label={`${tool.value.label} of ${record.title}`} value={record.value === null ? '' : String(record.value)} placeholder={tool.value.label} onCommit={(text) => update(record, { value: text.trim() === '' ? null : Number(text) })} className="short" />}
                  <button type="button" className="btn ghost icon" aria-label={`Remove ${record.title}`} onClick={() => void api.removeRecord(record.id).catch(onError)}>
                    ✕
                  </button>
                </div>
                <div className="sys-row">
                  {chapters(record.nodeId, `Chapter of ${record.title}`, 'No chapter yet', (id) => update(record, { nodeId: id }))}
                  {tool.second && chapters(record.endNodeId, `${tool.second}: ${record.title}`, `${tool.second}: not yet`, (id) => update(record, { endNodeId: id }))}
                  {candidates.length > 0 && (
                    <select value={record.entryIds[0] ?? ''} aria-label={`${record.title} is about`} onChange={(e) => update(record, { entryIds: e.target.value ? [e.target.value] : [] })}>
                      <option value="">About…</option>
                      <EntryOptions entries={candidates} />
                    </select>
                  )}
                  {placed.length > 0 && (
                    <select value={placed.some((p) => p.event.id === record.eventId) ? record.eventId! : ''} aria-label={`Timeline event of ${record.title}`} onChange={(e) => update(record, { eventId: e.target.value || null })}>
                      <option value="">Timeline event…</option>
                      {placed.map(({ event, label }) => (
                        <option key={event.id} value={event.id}>
                          {event.name}
                          {label ? ` (${label})` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <Commit multiline label={`Notes on ${record.title}`} value={record.note} placeholder="Notes: what led to it, what it changes" onCommit={(text) => update(record, { note: text })} />
                <span className="small tool-log-links">
                  {node && <Link to={`/project/${data.projectId}/manuscript/${node.id}`}>Open {node.title}</Link>}
                  {placed.some((p) => p.event.id === record.eventId) && <Link to={`/project/${data.projectId}/timeline?event=${record.eventId}`}>On the timeline</Link>}
                  {record.entryIds.flatMap((id) => data.entries.find((e) => e.id === id) ?? []).map((entry) => (
                    <Link key={entry.id} to={profile(data, entry)}>
                      {entry.name}
                    </Link>
                  ))}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export function CalculatorTool({ tool }: Props<'calculator'>) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(tool.inputs.map((input) => [input.key.toLowerCase(), String(input.value)])));
  const scope = { value: (name: string) => (name.toLowerCase() in values ? Number(values[name.toLowerCase()]) || 0 : undefined), holds: () => undefined };
  return (
    <div className="stack calculator">
      <div className="grid-2 tight">
        {tool.inputs.map((input) => (
          <label key={input.key} className="field">
            <span>
              {input.label} <span className="muted">({input.unit})</span>
            </span>
            <input type="number" step="any" value={values[input.key.toLowerCase()] ?? ''} aria-label={input.label} onChange={(e) => setValues({ ...values, [input.key.toLowerCase()]: e.target.value })} />
          </label>
        ))}
      </div>
      <dl className="sheet-tracks" aria-label="Results">
        {tool.outputs.map((output) => {
          let result: string;
          try {
            const value = evaluate(parse(output.formula), scope);
            result = typeof value === 'number' ? `${formatNumber(value)} ${output.unit}` : String(value);
          } catch (err) {
            result = err instanceof FormulaError ? err.message : 'Cannot be worked out';
          }
          return (
            <div key={output.label}>
              <dt>{output.label}</dt>
              <dd>
                <strong>{result}</strong>
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

/** Each tracked character's level or realm, snapshot by snapshot. */
export function RanksTool({ data }: Props<'ranks'>) {
  const { snapshots, blueprints, entries, nodes, loading } = useProgression(data.projectId);
  if (loading) return null;
  const tracked = entries.filter((e) => snapshots.some((s) => s.entryId === e.id)).sort((a, b) => a.name.localeCompare(b.name));
  if (!tracked.length) {
    return (
      <p className="muted">
        No progression snapshots yet. <Link to={`/project/${data.projectId}/progression`}>Log how a character changes</Link> and their climb appears here.
      </p>
    );
  }
  return (
    <ul className="meters">
      {tracked.map((entry) => {
        const mine = inStoryOrder(snapshots, nodes, entry.id);
        const steps = mine.map((snapshot) => ({
          snapshot,
          tracks: blueprints.filter((b) => snapshot.systems[b.id]).flatMap((b) => resolveSystem(b, snapshot.systems[b.id]).tracks.map((t) => ({ name: t.track.name, label: t.label.replace(/ of \d+$/, ''), level: Number.parseFloat(t.label) }))),
        }));
        const numeric = steps.filter((s) => Number.isFinite(s.tracks[0]?.level));
        const top = Math.max(1, ...numeric.map((s) => s.tracks[0].level));
        return (
          <li key={entry.id}>
            <Link to={`/project/${data.projectId}/progression?entry=${entry.id}`}>{entry.name}</Link>
            <ol className="rank-steps" aria-label={`${entry.name}'s progression`}>
              {steps.map(({ snapshot, tracks }) => (
                <li key={snapshot.id}>
                  <span className="beat-at">{placeOf(snapshot, nodes)}</span>
                  {tracks.map((t) => `${t.name} ${t.label}`).join(' · ') || snapshot.label || 'No system'}
                </li>
              ))}
            </ol>
            {numeric.length > 1 && (
              <svg className="sparkline" viewBox="0 0 200 40" role="img" aria-label={`${entry.name}'s ${numeric[0].tracks[0].name} over the story`}>
                <polyline fill="none" stroke="currentColor" strokeWidth="2" points={numeric.map((s, i) => `${4 + (i / (numeric.length - 1)) * 192},${36 - (s.tracks[0].level / top) * 32}`).join(' ')} />
              </svg>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** What a character carries at a point in the story, as tiles. */
export function InventoryTool({ data }: Props<'inventory'>) {
  const { snapshots, entries, nodes, loading } = useProgression(data.projectId);
  const [who, setWho] = useState('');
  const [at, setAt] = useState('');
  if (loading) return null;
  const tracked = entries.filter((e) => snapshots.some((s) => s.entryId === e.id)).sort((a, b) => a.name.localeCompare(b.name));
  if (!tracked.length) {
    return (
      <p className="muted">
        No progression snapshots yet. <Link to={`/project/${data.projectId}/progression`}>Log a character’s gear</Link> and it appears here.
      </p>
    );
  }
  const entry = tracked.find((e) => e.id === who) ?? tracked[0];
  const state = stateAt(snapshots, nodes, entry.id, data.documents.some((t) => t.node.id === at) ? at : null);
  return (
    <div className="stack">
      <div className="toolbar">
        <select value={entry.id} aria-label="Inventory of" onChange={(e) => setWho(e.target.value)}>
          {tracked.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <select value={at} aria-label="Inventory as of" onChange={(e) => setAt(e.target.value)}>
          <option value="">At the end of the story</option>
          {data.documents.map(({ node, depth }) => (
            <option key={node.id} value={node.id}>
              {'  '.repeat(depth)}As of {node.title}
            </option>
          ))}
        </select>
      </div>
      {!state ? (
        <p className="muted">Nothing logged for {entry.name} by then.</p>
      ) : state.gear.length === 0 ? (
        <p className="muted">
          {entry.name} carries nothing at {placeOf(state, nodes)}.
        </p>
      ) : (
        <ul className="tiles-grid" aria-label={`${entry.name}'s inventory`}>
          {state.gear.map((item) => (
            <li key={item.id} className="tile-item">
              {entries.some((e) => e.id === item.entryId) ? <Link to={`/project/${data.projectId}/codex/${item.entryId}`}>{item.name}</Link> : <strong>{item.name}</strong>}
              <span className="muted small">{item.kind}</span>
              {item.note && <span className="small">{item.note}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * REGISTRY
 * One category of the worldbuilding database as a working list. The records
 * are the project's own codex entries: what is made or changed here is what
 * the Codex, search, the story graph and every other module see.
 */
export function RegistryTool({ tool, data, onError }: Props<'registry'>) {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [only, setOnly] = useState('');
  const [sort, setSort] = useState<'name' | 'recent'>('name');
  const category = data.category(tool.category);
  if (!category) return <Missing what={`“${tool.category}”`} />;
  const group = tool.groupBy ? data.field(category, tool.groupBy, tool.category) : undefined;
  const summary = (tool.summary ?? []).flatMap((name) => data.field(category, name, tool.category) ?? []);
  const api = codex.forProject(data.projectId);
  const all = data.entriesOf(category);
  const groupOf = (entry: LoreEntry) => (group ? data.shown(entry, category, group) : '');
  const groups = group ? [...(group.type === 'select' ? group.options : []), ...new Set(all.map(groupOf).filter((v) => v && !(group.type === 'select' && group.options.includes(v))))] : [];
  const needle = query.trim().toLowerCase();
  const listed = all
    .filter((entry) => (!only || (only === '—' ? !groupOf(entry) : groupOf(entry) === only)) && (!needle || [entry.name, entry.summary, ...entry.tags, ...entry.fields.map((f) => f.value)].some((text) => text.toLowerCase().includes(needle))))
    .sort((a, b) => (sort === 'recent' ? b.updatedAt - a.updatedAt : a.name.localeCompare(b.name)));
  const selected = all.find((entry) => entry.id === params.get('record')) ?? null;
  const open = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('record', id);
    else next.delete('record');
    setParams(next, { replace: true });
  };
  const view = selected ? viewFields(selected, category) : null;
  const others = data.entries.filter((e) => e.id !== selected?.id);
  const preset = group && group.type === 'select' && only && only !== '—' ? { def: group, value: only } : undefined;

  return (
    <div className="registry" data-open={selected ? '' : undefined}>
      <div className="registry-list stack">
        <NewEntry category={category} data={data} onError={onError} preset={preset} />
        <div className="toolbar">
          <input type="search" value={query} aria-label={`Search ${category.name}`} placeholder={`Search ${category.name.toLowerCase()}…`} onChange={(e) => setQuery(e.target.value)} />
          {group && (
            <select value={only} aria-label={`Filter by ${group.name}`} onChange={(e) => setOnly(e.target.value)}>
              <option value="">Any {group.name.toLowerCase()}</option>
              {groups.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
              <option value="—">Not set</option>
            </select>
          )}
          <select value={sort} aria-label={`Sort ${category.name}`} onChange={(e) => setSort(e.target.value as 'name' | 'recent')}>
            <option value="name">By name</option>
            <option value="recent">Recently changed</option>
          </select>
        </div>
        {all.length === 0 ? (
          <p className="muted">No {category.name.toLowerCase()} yet. Nothing is made for you: add the first one above.</p>
        ) : listed.length === 0 ? (
          <p className="muted">Nothing matches.</p>
        ) : (
          <ul className="registry-rows" aria-label={category.name}>
            {listed.map((entry) => (
              <li key={entry.id}>
                <button type="button" className={entry.id === selected?.id ? 'active' : ''} aria-current={entry.id === selected?.id ? 'true' : undefined} onClick={() => open(entry.id)}>
                  <strong>{entry.name}</strong>
                  {groupOf(entry) && <span className="badge">{groupOf(entry)}</span>}
                  <span className="muted small">{[entry.summary, ...summary.map((def) => (data.shown(entry, category, def) ? `${def.name}: ${data.shown(entry, category, def)}` : ''))].filter(Boolean).join(' · ')}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {selected && view && (
        <section className="registry-record panel stack" aria-label={selected.name}>
          <div className="details-head">
            <button type="button" className="btn ghost registry-back" onClick={() => open(null)}>
              ← {category.name}
            </button>
            <Link to={profile(data, selected)}>Open in the Codex</Link>
          </div>
          <SavedText key={`${selected.id}-name`} label={`${category.singular} name`} value={selected.name} onSave={(name) => name.trim() && void api.update(selected.id, { name }).catch(onError)} />
          <SavedText key={`${selected.id}-summary`} label="Description" multiline rows={3} value={selected.summary} placeholder="In a line or two" onSave={(text) => void api.update(selected.id, { summary: text }).catch(onError)} />
          <div className="typed-fields" key={selected.id}>
            {view.category.map(({ def, field }) => (
              <div key={def.id} className={def.type === 'longtext' || def.type === 'references' ? 'field wide' : 'field'}>
                <span>{def.name}</span>
                <TypedInput label={def.name} type={def.type} options={def.options} value={field?.value ?? ''} entries={others} onSave={(value) => void api.setFieldValue(selected.id, def.id, value).catch(onError)} />
              </div>
            ))}
          </div>
          <SavedText key={`${selected.id}-notes`} label="Private notes" multiline rows={2} value={selected.notes} onSave={(notes) => void api.update(selected.id, { notes }).catch(onError)} />
          <p className="muted small">
            This is a record in the Codex under {category.name}. Its links to characters, places and events, its canon facts and where the manuscript mentions it are on its Codex page; fields are added, renamed or removed under “Categories &amp; fields” there.
          </p>
        </section>
      )}
    </div>
  );
}

/** A family tree, drawn from the family relationships kept in Relationships. */
export function LineageTool({ data }: Props<'lineage'>) {
  const { relations, order, loading } = useRelationships(data.projectId);
  if (loading) return null;
  const people = new Map(data.entries.filter((e) => e.category === 'character').map((e) => [e.id, e]));
  const rows = buildLineage(relations, order, (id) => people.has(id));
  const names = (ids: string[]) => ids.flatMap((id) => people.get(id)?.name ?? []).join(', ');
  if (rows.length === 0) {
    return (
      <p className="muted">
        No family relationships yet. Record who is whose parent, sibling or spouse in <Link to={`/project/${data.projectId}/relationships`}>Relationships</Link> and the tree is drawn from them.
      </p>
    );
  }
  return (
    <div className="stack">
      <ol className="lineage" aria-label="Family tree">
        {rows.map((row, i) => (
          <li key={i} aria-label={`Generation ${i + 1}`}>
            <span className="muted small lineage-gen">Generation {i + 1}</span>
            <ul>
              {row.sort((a, b) => (people.get(a.id)?.name ?? '').localeCompare(people.get(b.id)?.name ?? '')).map((kin) => (
                <li key={kin.id} className="board-card">
                  <Link to={profile(data, people.get(kin.id)!)}>{people.get(kin.id)!.name}</Link>
                  {kin.parents.length > 0 && <p className="small">Child of {names(kin.parents)}</p>}
                  {kin.partners.length > 0 && <p className="small">Married to {names(kin.partners)}</p>}
                  {kin.siblings.length > 0 && <p className="small">Sibling of {names(kin.siblings)}</p>}
                  {kin.children.length > 0 && <p className="small">Parent of {names(kin.children)}</p>}
                  {kin.relatives.length > 0 && <p className="small">Related to {names(kin.relatives)}</p>}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      <p className="muted small">
        Read from the relationships as they stand at the end of the story. To change the tree, change a relationship in <Link to={`/project/${data.projectId}/relationships`}>Relationships</Link>.
      </p>
    </div>
  );
}

export function PageTool({ tool, data }: Props<'page'>) {
  return (
    <div className="actions start">
      <Link className="btn primary" to={`/project/${data.projectId}/${tool.to === 'systems' ? 'characters/systems' : tool.to}`}>
        Open {tool.title}
      </Link>
    </div>
  );
}

/** Draws a tool from its description. */
export function ToolView(props: Props<ToolDef['type']>) {
  const { tool } = props;
  switch (tool.type) {
    case 'registry':
      return <RegistryTool {...props} tool={tool} />;
    case 'lineage':
      return <LineageTool {...props} tool={tool} />;
    case 'board':
      return <BoardTool {...props} tool={tool} />;
    case 'table':
      return <TableTool {...props} tool={tool} />;
    case 'matrix':
      return <MatrixTool {...props} tool={tool} />;
    case 'meters':
      return <MetersTool {...props} tool={tool} />;
    case 'log':
      return <LogTool {...props} tool={tool} />;
    case 'calculator':
      return <CalculatorTool {...props} tool={tool} />;
    case 'ranks':
      return <RanksTool {...props} tool={tool} />;
    case 'inventory':
      return <InventoryTool {...props} tool={tool} />;
    case 'page':
      return <PageTool {...props} tool={tool} />;
  }
}
