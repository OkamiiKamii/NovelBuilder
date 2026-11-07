import { createId } from '@/core/id';
import { curveTable } from '../compute';
import { MODIFIER_OPS, OP_LABELS, VARIABLE_KIND_LABELS, rankName, toKey, type Group, type Matrix, type ModifierOp, type Named, type SysItem, type SysVariable, type SystemBlueprint, type Track, type VariableKind } from '../types';
import { Commit, Formula, keyAfterRename, move, patch, remove, split, type Change } from './inputs';

interface TabProps {
  system: SystemBlueprint;
  change: Change;
}

const X = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <button type="button" className="btn ghost icon" aria-label={label} title={label} onClick={onClick}>
    ✕
  </button>
);

/**
 * Names other parts of the blueprint point at by id (ranks, the rows and
 * columns of a table): renaming one keeps everything on it, and removing
 * one is the only way to let go of it.
 */
function NamedList({ noun, of, names, placeholder, onChange }: { noun: string; of?: string; names: Named[]; placeholder?: string; onChange: (edit: (current: Named[]) => Named[]) => void }) {
  const where = of ? ` of ${of}` : '';
  return (
    <>
      {names.length > 0 && (
        <ol className="sys-stages">
          {names.map((n, i) => (
            <li key={n.id} className="sys-row">
              <span className="beat-at">{i + 1}</span>
              <Commit label={`Name of ${noun} ${i + 1}${where}`} value={n.name} placeholder={placeholder} onCommit={(name) => name.trim() && onChange((all) => patch(all, n.id, { name: name.trim() }))} className="grow" />
              <button type="button" className="btn ghost icon" aria-label={`Move ${n.name} up`} disabled={i === 0} onClick={() => onChange((all) => move(all, n.id, -1))}>
                ↑
              </button>
              <button type="button" className="btn ghost icon" aria-label={`Move ${n.name} down`} disabled={i === names.length - 1} onClick={() => onChange((all) => move(all, n.id, 1))}>
                ↓
              </button>
              <X label={`Remove the ${noun} ${n.name}${where}`} onClick={() => onChange((all) => remove(all, n.id))} />
            </li>
          ))}
        </ol>
      )}
      <div className="actions start">
        <button type="button" className="btn" onClick={() => onChange((all) => [...all, { id: createId(), name: `${noun[0].toUpperCase()}${noun.slice(1)} ${all.length + 1}` }])}>
          + {noun[0].toUpperCase()}
          {noun.slice(1)}
          {of ? ` in ${of}` : ''}
        </button>
      </div>
    </>
  );
}

/** A table with new rows or columns, keeping only the cells that still have both. */
const withRows = (table: Matrix, rows: Named[], columns: Named[]): Matrix => {
  const live = new Set(rows.flatMap((r) => columns.map((c) => `${r.id}|${c.id}`)));
  return { ...table, rows, columns, cells: Object.fromEntries(Object.entries(table.cells).filter(([key]) => live.has(key))) };
};

/** Attributes, resource pools, formulas and choices. */
export function VariablesTab({ system, change }: TabProps) {
  const set = (id: string, changes: Partial<SysVariable>) => change((s) => ({ variables: patch(s.variables, id, changes) }));
  const add = (kind: VariableKind) => {
    const name = { number: 'New attribute', resource: 'New resource', derived: 'New formula', choice: 'New choice' }[kind];
    change((s) => ({ variables: [...s.variables, { id: createId(), name, key: '', kind, unit: '', base: kind === 'resource' ? 100 : kind === 'number' ? 10 : 0, formula: '', options: [], note: '' }] }));
  };
  return (
    <div className="stack">
      <p className="muted small">
        Name things as your world names them. The short name is what formulas use, and it stays put if you rename the thing itself. Formulas understand + − × ÷ ^, brackets, min, max,
        floor, ceil, round, abs, sqrt, clamp and if(condition, then, otherwise).
      </p>
      {system.variables.length > 0 && (
        <ul className="sys-rows" aria-label="Attributes and resources">
          {system.variables.map((v) => (
            <li key={v.id} className={`sys-row kind-${v.kind}`}>
              <span className="badge">{VARIABLE_KIND_LABELS[v.kind]}</span>
              <Commit label={`Name of ${v.name}`} value={v.name} onCommit={(name) => change((s) => ({ variables: patch(s.variables, v.id, { name, key: keyAfterRename(s, v.key, v.name, name) }) }))} className="grow" />
              <Commit label={`Short name of ${v.name}`} value={v.key} onCommit={(key) => set(v.id, { key: toKey(key) })} className="mono short" />
              {v.kind === 'derived' ? (
                <Formula system={system} kind="number" label={`Formula for ${v.name}`} value={v.formula} placeholder="strength * 1.5" onCommit={(formula) => set(v.id, { formula })} />
              ) : v.kind === 'choice' ? (
                <Commit label={`Choices for ${v.name}`} value={v.options.join(', ')} placeholder="Fire, Water, Earth" onCommit={(text) => set(v.id, { options: split(text) })} className="grow" />
              ) : (
                <Commit label={`Starting value of ${v.name}`} type="number" value={String(v.base)} onCommit={(text) => set(v.id, { base: Number(text) || 0 })} className="short" />
              )}
              {v.kind !== 'choice' && <Commit label={`Unit of ${v.name}`} value={v.unit} placeholder="unit" onCommit={(unit) => set(v.id, { unit })} className="short" />}
              <X label={`Remove ${v.name}`} onClick={() => change((s) => ({ variables: remove(s.variables, v.id) }))} />
            </li>
          ))}
        </ul>
      )}
      <div className="actions start wrap">
        {(Object.keys(VARIABLE_KIND_LABELS) as VariableKind[]).map((kind) => (
          <button key={kind} type="button" className="btn" onClick={() => add(kind)}>
            + {VARIABLE_KIND_LABELS[kind]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Levels with a curve, or named stages with what each one takes. */
export function TracksTab({ system, change }: TabProps) {
  const set = (id: string, changes: Partial<Track>) => change((s) => ({ tracks: patch(s.tracks, id, changes) }));
  const stages = (id: string, edit: (stages: Track['stages']) => Track['stages']) => change((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? { ...t, stages: edit(t.stages) } : t)) }));
  const add = (kind: Track['kind']) => change((s) => ({ tracks: [...s.tracks, { id: createId(), name: kind === 'levels' ? 'Level' : 'New ladder', key: '', kind, cap: kind === 'levels' ? 100 : 0, curve: '', curveUnit: '', points: 0, sources: [], stages: [] }] }));
  return (
    <div className="stack">
      <p className="muted small">A way of advancing is either numbered (levels with a cap and a curve) or a ladder of named stages (realms, ranks, circles), each with what it takes to reach.</p>
      {system.tracks.map((track) => (
        <fieldset key={track.id} className="plan-group" aria-label={track.name}>
          <legend>{track.kind === 'levels' ? 'Numbered levels' : 'Named stages'}</legend>
          <div className="sys-row">
            <Commit label={`Name of ${track.name}`} value={track.name} onCommit={(name) => change((s) => ({ tracks: patch(s.tracks, track.id, { name, key: keyAfterRename(s, track.key, track.name, name) }) }))} className="grow" />
            <Commit label={`Short name of ${track.name}`} value={track.key} onCommit={(key) => set(track.id, { key: toKey(key) })} className="mono short" />
            <X label={`Remove ${track.name}`} onClick={() => change((s) => ({ tracks: remove(s.tracks, track.id) }))} />
          </div>
          {track.kind === 'levels' ? (
            <>
              <div className="sys-row">
                <label className="inline">
                  Highest
                  <Commit label={`Cap of ${track.name}`} type="number" value={String(track.cap)} onCommit={(text) => set(track.id, { cap: Number(text) || 0 })} className="short" />
                </label>
                <label className="inline grow">
                  To pass a level
                  <Formula system={system} kind="number" extra={{ [track.key]: 1 }} label={`Curve of ${track.name}`} value={track.curve} placeholder={`100 * ${track.key} ^ 1.5`} onCommit={(curve) => set(track.id, { curve })} />
                </label>
                <Commit label={`Unit of the ${track.name} curve`} value={track.curveUnit} placeholder="XP" onCommit={(curveUnit) => set(track.id, { curveUnit })} className="short" />
              </div>
              <div className="sys-row">
                <label className="inline">
                  Points each level brings
                  <Commit label={`Points per level of ${track.name}`} type="number" value={String(track.points ?? 0)} onCommit={(text) => set(track.id, { points: Math.max(0, Number(text) || 0) })} className="short" />
                </label>
                <label className="inline grow">
                  Earned from
                  <Commit label={`Sources of ${track.curveUnit || 'experience'} for ${track.name}`} value={(track.sources ?? []).join(', ')} placeholder="Combat, Quest, Training" onCommit={(text) => set(track.id, { sources: split(text) })} className="grow" />
                </label>
              </div>
              {track.curve.trim() && (
                <p className="muted small curve">
                  {curveTable(system, track, [1, 2, 5, 10, 25, 50, Math.max(1, track.cap - 1)].filter((n, i, all) => all.indexOf(n) === i)).map((row) => `${track.name} ${row.level} → ${row.level + 1}: ${row.cost}`).join(' · ')}
                </p>
              )}
            </>
          ) : (
            <>
              <ol className="sys-stages">
                {track.stages.map((stage, i) => (
                  <li key={stage.id}>
                    <div className="sys-row">
                      <span className="beat-at">{i + 1}</span>
                      <Commit label={`Name of stage ${i + 1} of ${track.name}`} value={stage.name} onCommit={(name) => stages(track.id, (all) => patch(all, stage.id, { name }))} className="grow" />
                      <button type="button" className="btn ghost icon" aria-label={`Move ${stage.name} up`} disabled={i === 0} onClick={() => stages(track.id, (all) => move(all, stage.id, -1))}>
                        ↑
                      </button>
                      <button type="button" className="btn ghost icon" aria-label={`Move ${stage.name} down`} disabled={i === track.stages.length - 1} onClick={() => stages(track.id, (all) => move(all, stage.id, 1))}>
                        ↓
                      </button>
                      <X label={`Remove ${stage.name}`} onClick={() => stages(track.id, (all) => remove(all, stage.id))} />
                    </div>
                    {i > 0 && <Formula system={system} kind="condition" label={`What ${stage.name} requires`} value={stage.requires} placeholder="What it takes, e.g. qi >= 1000 AND Pill: Foundation Pill" onCommit={(requires) => stages(track.id, (all) => patch(all, stage.id, { requires }))} />}
                    <Commit label={`Notes on ${stage.name}`} value={stage.note} placeholder="The bottleneck, the breakthrough, the price" onCommit={(note) => stages(track.id, (all) => patch(all, stage.id, { note }))} />
                  </li>
                ))}
              </ol>
              <div className="actions start">
                <button type="button" className="btn" onClick={() => stages(track.id, (all) => [...all, { id: createId(), name: `Stage ${all.length + 1}`, requires: '', note: '' }])}>
                  + Stage in {track.name}
                </button>
              </div>
            </>
          )}
        </fieldset>
      ))}
      <div className="actions start wrap">
        <button type="button" className="btn" onClick={() => add('levels')}>
          + Numbered levels
        </button>
        <button type="button" className="btn" onClick={() => add('stages')}>
          + Ladder of named stages
        </button>
      </div>
    </div>
  );
}

function ItemEditor({ system, change, item, group }: TabProps & { item: SysItem; group: Group }) {
  const set = (changes: Partial<SysItem>) => change((s) => ({ items: patch(s.items, item.id, changes) }));
  // Lists inside the item are changed from the item as it is stored now, so quick edits in a row never undo one another.
  // (A value from the page is read before the change is queued: by the time it runs, a select may show its old value again.)
  const edit = (changes: (current: SysItem) => Partial<SysItem>) => change((s) => ({ items: s.items.map((i) => (i.id === item.id ? { ...i, ...changes(i) } : i)) }));
  const numeric = system.variables.filter((v) => v.kind !== 'choice');
  const siblings = system.items.filter((i) => i.groupId === group.id && i.id !== item.id);
  const parent = system.items.find((i) => i.id === item.parentId);
  return (
    <details className="sys-item">
      <summary>
        <strong>{item.name}</strong>
        {rankName(system, item) && <span className="badge">{rankName(system, item)}</span>}
        {parent && <span className="muted small">from {parent.name}</span>}
        {item.requires.trim() && <span className="muted small">requires {item.requires}</span>}
      </summary>
      <div className="stack sys-item-body">
        <div className="sys-row">
          <Commit label={`Name of ${item.name}`} value={item.name} onCommit={(name) => set({ name })} className="grow" />
          <select value={item.rankId ?? ''} aria-label={`Rank of ${item.name}`} onChange={(e) => set({ rankId: e.target.value || null })}>
            <option value="">No rank</option>
            {system.ranks.map((rank) => (
              <option key={rank.id} value={rank.id}>
                {rank.name}
              </option>
            ))}
          </select>
          <select value={item.parentId ?? ''} aria-label={`${item.name} grows out of`} onChange={(e) => set({ parentId: e.target.value || null })}>
            <option value="">Stands alone</option>
            {siblings.map((other) => (
              <option key={other.id} value={other.id}>
                Grows out of {other.name}
              </option>
            ))}
          </select>
          <X label={`Remove ${item.name}`} onClick={() => change((s) => ({ items: remove(s.items, item.id) }))} />
        </div>
        <Commit multiline label={`Description of ${item.name}`} value={item.description} placeholder="What it is" onCommit={(description) => set({ description })} />
        <label className="field">
          <span>Requires</span>
          <Formula system={system} kind="condition" label={`What ${item.name} requires`} value={item.requires} placeholder="Class: Void Mage AND level >= 50" onCommit={(requires) => set({ requires })} />
        </label>
        <div className="field">
          <span>Gives</span>
          {item.modifiers.map((m) => (
            <div key={m.id} className="sys-row">
              <select value={m.target} aria-label={`What ${item.name} changes`} onChange={(e) => {
                const target = e.target.value;
                edit((i) => ({ modifiers: patch(i.modifiers, m.id, { target }) }));
              }}>
                {!numeric.some((v) => v.key === m.target) && <option value={m.target}>{m.target || 'Choose…'}</option>}
                {numeric.map((v) => (
                  <option key={v.id} value={v.key}>
                    {v.name}
                  </option>
                ))}
              </select>
              <select value={m.op} aria-label={`How ${item.name} changes it`} className="short" onChange={(e) => {
                const op = e.target.value as ModifierOp;
                edit((i) => ({ modifiers: patch(i.modifiers, m.id, { op }) }));
              }}>
                {MODIFIER_OPS.map((op) => (
                  <option key={op} value={op}>
                    {OP_LABELS[op]}
                  </option>
                ))}
              </select>
              <Formula system={system} kind="number" label={`Amount ${item.name} gives`} value={m.value} placeholder="5" onCommit={(value) => edit((i) => ({ modifiers: patch(i.modifiers, m.id, { value }) }))} />
              <X label={`Remove this effect of ${item.name}`} onClick={() => edit((i) => ({ modifiers: remove(i.modifiers, m.id) }))} />
            </div>
          ))}
          <div className="actions start">
            <button type="button" className="btn" disabled={!numeric.length} onClick={() => edit((i) => ({ modifiers: [...i.modifiers, { id: createId(), target: numeric[0].key, op: 'add', value: '1' }] }))}>
              + Effect on {item.name}
            </button>
          </div>
        </div>
        <div className="field">
          <span>Costs</span>
          {item.costs.map((c) => (
            <div key={c.id} className="sys-row">
              <Formula system={system} kind="number" label={`Amount ${item.name} costs`} value={c.amount} placeholder="20" onCommit={(amount) => edit((i) => ({ costs: patch(i.costs, c.id, { amount }) }))} />
              <select value={c.target} aria-label={`What ${item.name} costs`} onChange={(e) => {
                const target = e.target.value;
                edit((i) => ({ costs: patch(i.costs, c.id, { target }) }));
              }}>
                {!numeric.some((v) => v.key === c.target) && <option value={c.target}>{c.target || 'Choose…'}</option>}
                {numeric.map((v) => (
                  <option key={v.id} value={v.key}>
                    {v.name}
                  </option>
                ))}
              </select>
              <X label={`Remove this cost of ${item.name}`} onClick={() => edit((i) => ({ costs: remove(i.costs, c.id) }))} />
            </div>
          ))}
          <div className="actions start">
            <button type="button" className="btn" disabled={!numeric.length} onClick={() => edit((i) => ({ costs: [...i.costs, { id: createId(), target: (system.variables.find((v) => v.kind === 'resource') ?? numeric[0]).key, amount: '10' }] }))}>
              + Cost of {item.name}
            </button>
          </div>
        </div>
        <div className="grid-2 tight">
          <label className="field">
            <span>Cooldown or limit</span>
            <Commit label={`Cooldown of ${item.name}`} value={item.cooldown} placeholder="30 seconds · once a day · a full verse" onCommit={(cooldown) => set({ cooldown })} />
          </label>
          <label className="field">
            <span>Element, school or affinity</span>
            <Commit label={`Affinity of ${item.name}`} value={item.affinity} placeholder="Fire" onCommit={(affinity) => set({ affinity })} />
          </label>
        </div>
        <label className="field">
          <span>How it evolves</span>
          <Commit label={`Evolution of ${item.name}`} value={item.evolution} placeholder="Becomes Inferno after 1,000 casts" onCommit={(evolution) => set({ evolution })} />
        </label>
      </div>
    </details>
  );
}

/** Classes, skills, titles, affixes: whatever a profile can hold, in groups the author names. */
export function KitsTab({ system, change }: TabProps) {
  // Children sit under what they grow out of.
  const ordered = (group: Group): { item: SysItem; depth: number }[] => {
    const inGroup = system.items.filter((i) => i.groupId === group.id);
    const walk = (parentId: string | null, depth: number): { item: SysItem; depth: number }[] => inGroup.filter((i) => (inGroup.some((p) => p.id === i.parentId) ? i.parentId : null) === parentId).flatMap((item) => [{ item, depth }, ...(depth < 8 ? walk(item.id, depth + 1) : [])]);
    return walk(null, 0);
  };
  return (
    <div className="stack">
      <fieldset className="plan-group" aria-label="Ranks">
        <legend>Ranks, lowest first</legend>
        <NamedList noun="rank" names={system.ranks} placeholder="Common, Advanced, Unique…" onChange={(edit) => change((s) => ({ ranks: edit(s.ranks) }))} />
      </fieldset>
      {system.groups.map((group) => (
        <fieldset key={group.id} className="plan-group" aria-label={group.name}>
          <legend>{group.name}</legend>
          <div className="sys-row">
            <Commit label={`Name of the group ${group.name}`} value={group.name} onCommit={(name) => change((s) => ({ groups: patch(s.groups, group.id, { name }) }))} className="grow" />
            <label className="check">
              <input type="checkbox" checked={group.single} onChange={(e) => {
                  const single = e.target.checked;
                  change((s) => ({ groups: patch(s.groups, group.id, { single }) }));
                }} />
              One at a time
            </label>
            <X label={`Remove the group ${group.name}`} onClick={() => change((s) => ({ groups: remove(s.groups, group.id), items: s.items.filter((i) => i.groupId !== group.id) }))} />
          </div>
          {ordered(group).map(({ item, depth }) => (
            <div key={item.id} style={{ marginLeft: depth * 18 }}>
              <ItemEditor system={system} change={change} item={item} group={group} />
            </div>
          ))}
          <div className="actions start">
            <button type="button" className="btn" onClick={() => change((s) => ({ items: [...s.items, { id: createId(), groupId: group.id, name: 'New entry', description: '', parentId: null, rankId: null, requires: '', modifiers: [], costs: [], cooldown: '', affinity: '', evolution: '' }] }))}>
              + Add to {group.name}
            </button>
          </div>
        </fieldset>
      ))}
      <div className="actions start">
        <button type="button" className="btn" onClick={() => change((s) => ({ groups: [...s.groups, { id: createId(), name: 'New group', single: false }] }))}>
          + Group (classes, skills, titles…)
        </button>
      </div>
    </div>
  );
}

/** Grids of free text: how elements meet, what affixes combine into. */
export function TablesTab({ system, change }: TabProps) {
  return (
    <div className="stack">
      {system.matrices.length === 0 && <p className="muted small">A table sets things against each other: which element beats which, what two affixes make together.</p>}
      {system.matrices.map((m) => (
        <fieldset key={m.id} className="plan-group" aria-label={m.name}>
          <legend>{m.name}</legend>
          <div className="sys-row">
            <Commit label={`Name of the table ${m.name}`} value={m.name} onCommit={(name) => change((s) => ({ matrices: patch(s.matrices, m.id, { name }) }))} className="grow" />
            <X label={`Remove the table ${m.name}`} onClick={() => change((s) => ({ matrices: remove(s.matrices, m.id) }))} />
          </div>
          <div className="grid-2 tight">
            <div className="field">
              <span>Rows</span>
              <NamedList noun="row" of={m.name} names={m.rows} onChange={(edit) => change((s) => ({ matrices: s.matrices.map((x) => (x.id === m.id ? withRows(x, edit(x.rows), x.columns) : x)) }))} />
            </div>
            <div className="field">
              <span>Columns</span>
              <NamedList noun="column" of={m.name} names={m.columns} onChange={(edit) => change((s) => ({ matrices: s.matrices.map((x) => (x.id === m.id ? withRows(x, x.rows, edit(x.columns)) : x)) }))} />
            </div>
          </div>
          {m.rows.length > 0 && m.columns.length > 0 && (
            <div className="matrix-scroll">
              <table className="matrix">
                <thead>
                  <tr>
                    <td />
                    {m.columns.map((column) => (
                      <th key={column.id} scope="col">
                        {column.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {m.rows.map((row) => (
                    <tr key={row.id}>
                      <th scope="row">{row.name}</th>
                      {m.columns.map((column) => (
                        <td key={column.id}>
                          <Commit label={`${row.name} against ${column.name}`} value={m.cells[`${row.id}|${column.id}`] ?? ''} placeholder="—" onCommit={(text) => change((s) => ({ matrices: s.matrices.map((x) => (x.id === m.id ? { ...x, cells: { ...x.cells, [`${row.id}|${column.id}`]: text } } : x)) }))} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </fieldset>
      ))}
      <div className="actions start">
        <button type="button" className="btn" onClick={() => change((s) => ({ matrices: [...s.matrices, { id: createId(), name: 'New table', rows: [], columns: [], cells: {} }] }))}>
          + Table
        </button>
      </div>
    </div>
  );
}
