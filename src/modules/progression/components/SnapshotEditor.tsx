import { useId, useState } from 'react';
import { createId } from '@/core/id';
import type { LoreEntry } from '@/modules/codex/types';
import { buildTree, flatten, isDocument } from '@/modules/manuscript/tree';
import type { StoryNode } from '@/modules/manuscript/types';
import { Commit } from '@/modules/systems/components/inputs';
import { rankName, type SystemBlueprint } from '@/modules/systems/types';
import { ConfirmDialog } from '@/shared/ConfirmDialog';
import { SavedText } from '@/shared/SavedText';
import type { ProjectProgression } from '../service';
import { resolveSystem } from '../state';
import { DIMENSION_HINTS, DIMENSION_LABELS, GEAR_KINDS, STATUS_DIMENSIONS, emptySystem, type GearItem, type ProgressSnapshot, type SnapshotSystem } from '../types';

interface SnapshotEditorProps {
  snapshot: ProgressSnapshot;
  name: string;
  systems: SystemBlueprint[];
  entries: LoreEntry[];
  nodes: StoryNode[];
  api: ProjectProgression;
  onDeleted: () => void;
  onError: (err: unknown) => void;
}

/** Edits one snapshot. Every field is the author's to set; the system only ever suggests. */
export function SnapshotEditor({ snapshot, name, systems, entries, nodes, api, onDeleted, onError }: SnapshotEditorProps) {
  const [confirming, setConfirming] = useState(false);
  const kinds = useId();
  // Read a control's value before calling these: by the time the stored change is worked out, the control has been redrawn.
  const edit = (change: Parameters<ProjectProgression['update']>[1]) => void api.update(snapshot.id, change).catch(onError);
  const inSystem = (systemId: string, change: (current: SnapshotSystem) => Partial<SnapshotSystem>) =>
    edit((c) => {
      const current = c.systems[systemId] ?? emptySystem();
      return { systems: { ...c.systems, [systemId]: { ...current, ...change(current) } } };
    });
  const gear = (change: (items: GearItem[]) => GearItem[]) => edit((c) => ({ gear: change(c.gear) }));
  const number = (text: string): number | null => (text.trim() === '' || !Number.isFinite(Number(text)) ? null : Number(text));
  const without = (map: Record<string, number | string>, id: string) => Object.fromEntries(Object.entries(map).filter(([key]) => key !== id));
  const documents = flatten(buildTree(nodes)).filter((t) => isDocument(t.node.kind));
  const codexItems = entries.filter((e) => e.category === 'item').sort((a, b) => a.name.localeCompare(b.name));
  const unused = systems.filter((s) => !snapshot.systems[s.id]);

  return (
    <div className="stack snapshot-editor" role="group" aria-label="Snapshot">
      <div className="grid-2 tight">
        <label className="field">
          <span>True from</span>
          <select value={documents.some((t) => t.node.id === snapshot.nodeId) ? snapshot.nodeId! : snapshot.nodeId === null ? '' : 'gone'} aria-label="True from" onChange={(e) => {
            const nodeId = e.target.value || null;
            if (nodeId !== 'gone') edit(() => ({ nodeId }));
          }}>
            <option value="">Before the story</option>
            {snapshot.nodeId !== null && !documents.some((t) => t.node.id === snapshot.nodeId) && <option value="gone">A chapter that was removed</option>}
            {documents.map(({ node, depth }) => (
              <option key={node.id} value={node.id}>
                {'  '.repeat(depth) + node.title}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Label</span>
          <Commit label="Snapshot label" value={snapshot.label} placeholder="After the evolution" onCommit={(label) => edit(() => ({ label }))} />
        </label>
      </div>

      {systems.filter((s) => snapshot.systems[s.id]).map((system) => {
        const mine = snapshot.systems[system.id];
        const state = resolveSystem(system, mine);
        const plain = resolveSystem(system, { ...mine, auto: true, overrides: {} });
        return (
          <fieldset key={system.id} className="plan-group" aria-label={`${name} in ${system.name}`}>
            <legend>{system.name}</legend>
            <label className="check wrap">
              <input type="checkbox" checked={mine.auto} onChange={(e) => {
                const auto = e.target.checked;
                inSystem(system.id, () => ({ auto }));
              }} />
              Work out formulas and class effects from the system
            </label>
            <p className="muted small">{mine.auto ? 'Suggestions only: anything you set by hand replaces what the system works out.' : 'Nothing is worked out. Every value below is exactly what you enter.'}</p>

            {system.tracks.map((track) => (
              <label key={track.id} className="field">
                <span>{track.name}</span>
                {track.kind === 'levels' ? (
                  <Commit type="number" label={`${track.name} in this snapshot`} value={String(mine.progress[track.id] ?? 1)} onCommit={(text) => inSystem(system.id, (c) => ({ progress: { ...c.progress, [track.id]: Math.max(1, Math.round(Number(text) || 1)) } }))} />
                ) : (
                  <select value={String(mine.progress[track.id] ?? track.stages[0]?.id ?? '')} aria-label={`${track.name} in this snapshot`} onChange={(e) => {
                    const stage = e.target.value;
                    inSystem(system.id, (c) => ({ progress: { ...c.progress, [track.id]: stage } }));
                  }}>
                    {track.stages.map((stage) => (
                      <option key={stage.id} value={stage.id}>
                        {stage.name}
                      </option>
                    ))}
                  </select>
                )}
              </label>
            ))}

            {system.variables.length > 0 && (
              <table className="snap-values">
                <thead>
                  <tr>
                    <th scope="col">Value</th>
                    <th scope="col">{mine.auto ? 'Their own' : 'Entered'}</th>
                    {mine.auto && <th scope="col">System works out</th>}
                    {mine.auto && <th scope="col">Set by hand</th>}
                  </tr>
                </thead>
                <tbody>
                  {system.variables.map((v, i) => {
                    const worked = plain.rows[i];
                    const hand = mine.overrides[v.id];
                    // With the calculator off there is one column: what the author enters is the value.
                    const entered = mine.auto ? mine.values[v.id] : (hand ?? mine.values[v.id]);
                    const save = (value: number | string | null) =>
                      inSystem(system.id, (c) => {
                        if (c.auto && v.kind !== 'derived') return { values: value === null ? without(c.values, v.id) : { ...c.values, [v.id]: value } };
                        if (!c.auto && v.kind !== 'derived') return { values: value === null ? without(c.values, v.id) : { ...c.values, [v.id]: value }, overrides: without(c.overrides, v.id) };
                        return { overrides: value === null ? without(c.overrides, v.id) : { ...c.overrides, [v.id]: value } };
                      });
                    return (
                      <tr key={v.id}>
                        <th scope="row">
                          {v.name}
                          {v.unit && <span className="muted"> ({v.unit})</span>}
                        </th>
                        <td>
                          {v.kind === 'choice' ? (
                            <select value={String(entered ?? v.options[0] ?? '')} aria-label={`${v.name} in this snapshot`} onChange={(e) => save(e.target.value)}>
                              {v.options.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          ) : v.kind === 'derived' && mine.auto ? (
                            <span className="muted small">a formula</span>
                          ) : (
                            <Commit type="number" label={`${v.name} in this snapshot`} value={entered === undefined ? '' : String(entered)} placeholder={v.kind === 'derived' ? '—' : String(v.base)} onCommit={(text) => save(number(text))} />
                          )}
                        </td>
                        {mine.auto && <td className="worked">{worked.error ? <span className="error small">{worked.error}</span> : worked.display}</td>}
                        {mine.auto && (
                          <td>
                            {v.kind !== 'choice' && (
                              <Commit type="number" label={`Set ${v.name} by hand`} value={typeof hand === 'number' ? String(hand) : ''} placeholder="—" onCommit={(text) => {
                                const value = number(text);
                                inSystem(system.id, (c) => ({ overrides: value === null ? without(c.overrides, v.id) : { ...c.overrides, [v.id]: value } }));
                              }} />
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {system.groups.map((group) => {
              const options = system.items.filter((i) => i.groupId === group.id);
              if (!options.length) return null;
              const held = options.filter((i) => mine.itemIds.includes(i.id));
              return group.single ? (
                <label key={group.id} className="field">
                  <span>{group.name}</span>
                  <select value={held.at(-1)?.id ?? ''} aria-label={`${group.name} in this snapshot`} onChange={(e) => {
                    const chosen = e.target.value;
                    inSystem(system.id, (c) => ({ itemIds: [...c.itemIds.filter((id) => !options.some((o) => o.id === id)), ...(chosen ? [chosen] : [])] }));
                  }}>
                    <option value="">None</option>
                    {options.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <fieldset key={group.id} className="plan-group" aria-label={`${group.name} in this snapshot`}>
                  <legend>{group.name}</legend>
                  {options.map((item) => (
                    <label key={item.id} className="check wrap">
                      <input type="checkbox" checked={mine.itemIds.includes(item.id)} onChange={(e) => {
                        const has = e.target.checked;
                        inSystem(system.id, (c) => ({ itemIds: has ? [...c.itemIds, item.id] : c.itemIds.filter((id) => id !== item.id) }));
                      }} />
                      {item.name}
                      {rankName(system, item) && <span className="badge">{rankName(system, item)}</span>}
                    </label>
                  ))}
                </fieldset>
              );
            })}
            {state.available.length > 0 && (
              <p className="small state-available" role="note">
                Now within reach: {state.available.map((item) => item.name).join(', ')}
              </p>
            )}
          </fieldset>
        );
      })}
      {unused.length > 0 && (
        <select value="" aria-label="Track a system in this snapshot" onChange={(e) => {
          const systemId = e.target.value;
          if (systemId) inSystem(systemId, () => ({}));
        }}>
          <option value="">Track {name} in another system…</option>
          {unused.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}

      <fieldset className="plan-group" aria-label="Inventory and gear">
        <legend>Inventory &amp; gear</legend>
        {snapshot.gear.map((item) => (
          <div key={item.id} className="sys-row">
            <Commit label={`Name of ${item.name}`} value={item.name} onCommit={(text) => gear((all) => (text.trim() ? all.map((g) => (g.id === item.id ? { ...g, name: text } : g)) : all))} className="grow" />
            <Commit label={`How ${item.name} is held`} value={item.kind} placeholder="Equipped" onCommit={(kind) => gear((all) => all.map((g) => (g.id === item.id ? { ...g, kind } : g)))} className="short" />
            <Commit label={`Note on ${item.name}`} value={item.note} placeholder="note" onCommit={(note) => gear((all) => all.map((g) => (g.id === item.id ? { ...g, note } : g)))} />
            <button type="button" className="btn ghost icon" aria-label={`Remove ${item.name}`} onClick={() => gear((all) => all.filter((g) => g.id !== item.id))}>
              ✕
            </button>
          </div>
        ))}
        <form
          className="sys-row"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const data = new FormData(form);
            const [typed, linked, kind] = [String(data.get('name') ?? '').trim(), String(data.get('entry') ?? ''), String(data.get('kind') ?? '').trim()];
            const named = typed || codexItems.find((x) => x.id === linked)?.name || '';
            if (!named) return;
            gear((all) => [...all, { id: createId(), name: named, kind, entryId: linked || null, note: '' }]);
            form.reset();
          }}
        >
          <input name="name" aria-label="New gear" placeholder="What they have" className="grow" />
          {codexItems.length > 0 && (
            <select name="entry" aria-label="Codex item" defaultValue="">
              <option value="">Not in the Codex</option>
              {codexItems.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          )}
          <input name="kind" aria-label="How it is held" placeholder="Equipped" list={kinds} className="short" />
          <datalist id={kinds}>
            {GEAR_KINDS.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
          <button type="submit" className="btn">
            Add gear
          </button>
        </form>
      </fieldset>

      <fieldset className="plan-group" aria-label="Status">
        <legend>Status (one thing per line)</legend>
        {STATUS_DIMENSIONS.map((dimension) => (
          <SavedText key={`${snapshot.id}-${dimension}`} multiline rows={2} label={DIMENSION_LABELS[dimension]} value={snapshot.status[dimension] ?? ''} placeholder={DIMENSION_HINTS[dimension]} onSave={(text) => edit((c) => ({ status: { ...c.status, [dimension]: text } }))} />
        ))}
      </fieldset>
      <SavedText key={`${snapshot.id}-notes`} multiline rows={2} label="Notes" value={snapshot.notes} onSave={(notes) => edit(() => ({ notes }))} />

      <div className="entry-foot">
        <span className="muted small">Editing this snapshot never changes any other.</span>
        <button type="button" className="btn danger" onClick={() => setConfirming(true)}>
          Delete snapshot…
        </button>
      </div>
      {confirming && (
        <ConfirmDialog
          title="Delete snapshot"
          confirmLabel="Delete snapshot"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            void api.remove(snapshot.id).then(onDeleted, onError);
          }}
        >
          <p>Delete this snapshot of {name}? The snapshots before and after it are not changed.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
