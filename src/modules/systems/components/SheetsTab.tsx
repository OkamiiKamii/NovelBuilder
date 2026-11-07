import { entryPath } from '@/modules/characters/hooks';
import { Link } from 'react-router-dom';
import { EntryOptions } from '@/modules/codex/categories';
import type { LoreEntry } from '@/modules/codex/types';
import type { ProjectSystems } from '../service';
import { rankName, type SystemBlueprint, type SystemSheet } from '../types';
import { Commit } from './inputs';
import { Leveling } from './Leveling';
import { SheetView } from './SheetView';

interface SheetsTabProps {
  system: SystemBlueprint;
  sheets: SystemSheet[];
  entries: LoreEntry[];
  api: ProjectSystems;
  selectedId: string | null;
  onSelect: (sheetId: string | null) => void;
  onError: (err: unknown) => void;
  /** Show this one entry's sheet and nobody else's: a character's System tab. */
  only?: LoreEntry;
}

/** Which codex entries are on this blueprint, and what is particular to each. */
export function SheetsTab({ system, sheets, entries, api, selectedId, onSelect, onError, only }: SheetsTabProps) {
  const mine = sheets.flatMap((sheet) => {
    const entry = entries.find((e) => e.id === sheet.entryId);
    return sheet.systemId === system.id && entry && (!only || entry.id === only.id) ? [{ sheet, entry }] : [];
  }).sort((a, b) => a.entry.name.localeCompare(b.entry.name));
  // On a character's own tab their sheet is simply open; there is nobody else to choose.
  const selected = mine.find((m) => m.sheet.id === selectedId) ?? (only ? (mine[0] ?? null) : null);
  const free = entries.filter((e) => !mine.some((m) => m.entry.id === e.id));
  // Read a control's value before calling this: by the time the stored change is worked out, the control has been redrawn.
  const edit = (change: Parameters<ProjectSystems['updateSheet']>[1]) => selected && void api.updateSheet(selected.sheet.id, change).catch(onError);

  return (
    <div className="stack">
      <p className="muted small">Put a character, creature or item on this system to give it a sheet. A sheet keeps only what is its own; everything a class or skill brings is read from the blueprint, so changing the blueprint changes every sheet.</p>
      {only && mine.length === 0 && (
        <div className="actions start">
          <button type="button" className="btn primary" onClick={() => void api.addSheet(system.id, only.id).then((sheet) => onSelect(sheet.id), onError)}>
            Put {only.name} on {system.name}
          </button>
        </div>
      )}
      <div className="toolbar" hidden={Boolean(only)}>
        {mine.map(({ sheet, entry }) => (
          <button key={sheet.id} type="button" className={`btn${sheet.id === selected?.sheet.id ? ' primary' : ''}`} aria-pressed={sheet.id === selected?.sheet.id} onClick={() => onSelect(sheet.id)}>
            {entry.name}
          </button>
        ))}
        {free.length > 0 && (
          <select value="" aria-label="Add a codex entry to this system" onChange={(e) => e.target.value && void api.addSheet(system.id, e.target.value).then((sheet) => onSelect(sheet.id), onError)}>
            <option value="">Add a character or entry…</option>
            <EntryOptions entries={free} />
          </select>
        )}
      </div>
      {!only && entries.length === 0 && <p className="muted">Create a character, or an item in the Codex, first; then it can be given a sheet here.</p>}

      {selected && (
        <div className="sheet-editor">
          <div className="stack" role="group" aria-label={`${selected.entry.name}'s own values`}>
            <div className="details-head">
              <h3 className="grow-text">{selected.entry.name}</h3>
              {!only && <Link to={entryPath(system.projectId, selected.entry)}>Open profile</Link>}
            </div>
            {system.tracks.map((track) => (
              <label key={track.id} className="field">
                <span>
                  {track.name}
                  {(selected.sheet.xp ?? []).some((e) => e.trackId === track.id) && <span className="muted"> (where they started; experience counts from here)</span>}
                </span>
                {track.kind === 'levels' ? (
                  <Commit type="number" label={`${selected.entry.name}'s ${track.name}`} value={String(selected.sheet.progress[track.id] ?? 1)} onCommit={(text) => edit((c) => ({ progress: { ...c.progress, [track.id]: Math.max(1, Math.round(Number(text) || 1)) } }))} />
                ) : (
                  <select value={String(selected.sheet.progress[track.id] ?? track.stages[0]?.id ?? '')} aria-label={`${selected.entry.name}'s ${track.name}`} onChange={(e) => {
                    const stage = e.target.value;
                    edit((c) => ({ progress: { ...c.progress, [track.id]: stage } }));
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
            <Leveling system={system} sheet={selected.sheet} name={selected.entry.name} edit={edit} />
            {system.variables.filter((v) => v.kind !== 'derived').map((v) => (
              <label key={v.id} className="field">
                <span>
                  {v.name}
                  {v.unit && <span className="muted"> ({v.unit})</span>}
                </span>
                {v.kind === 'choice' ? (
                  <select value={String(selected.sheet.values[v.id] ?? v.options[0] ?? '')} aria-label={`${selected.entry.name}'s ${v.name}`} onChange={(e) => {
                    const chosen = e.target.value;
                    edit((c) => ({ values: { ...c.values, [v.id]: chosen } }));
                  }}>
                    {v.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Commit
                    type="number"
                    label={`${selected.entry.name}'s ${v.name}`}
                    value={selected.sheet.values[v.id] === undefined ? '' : String(selected.sheet.values[v.id])}
                    placeholder={`${v.base} (the system's starting value)`}
                    onCommit={(text) => edit((c) => {
                      const { [v.id]: _old, ...rest } = c.values;
                      return { values: text.trim() === '' || !Number.isFinite(Number(text)) ? rest : { ...rest, [v.id]: Number(text) } };
                    })}
                  />
                )}
              </label>
            ))}
            {system.groups.map((group) => {
              const options = system.items.filter((i) => i.groupId === group.id);
              if (!options.length) return null;
              const held = options.filter((i) => selected.sheet.itemIds.includes(i.id));
              return group.single ? (
                <label key={group.id} className="field">
                  <span>{group.name}</span>
                  <select value={held.at(-1)?.id ?? ''} aria-label={`${selected.entry.name}'s ${group.name}`} onChange={(e) => {
                    const chosen = e.target.value;
                    edit((c) => ({ itemIds: [...c.itemIds.filter((id) => !options.some((o) => o.id === id)), ...(chosen ? [chosen] : [])] }));
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
                <fieldset key={group.id} className="plan-group" aria-label={`${selected.entry.name}'s ${group.name}`}>
                  <legend>{group.name}</legend>
                  {options.map((item) => (
                    <label key={item.id} className="check wrap">
                      <input type="checkbox" checked={selected.sheet.itemIds.includes(item.id)} onChange={(e) => {
                        const held = e.target.checked;
                        edit((c) => ({ itemIds: held ? [...c.itemIds, item.id] : c.itemIds.filter((id) => id !== item.id) }));
                      }} />
                      {item.name}
                      {rankName(system, item) && <span className="badge">{rankName(system, item)}</span>}
                    </label>
                  ))}
                </fieldset>
              );
            })}
            <div className="actions start">
              <button type="button" className="btn ghost" onClick={() => void api.removeSheet(selected.sheet.id).then(() => onSelect(null), onError)}>
                Take {selected.entry.name} off this system
              </button>
            </div>
          </div>
          <div className="panel sheet-card" aria-label={`${selected.entry.name}'s sheet`}>
            <h3>Sheet</h3>
            <SheetView system={system} sheet={selected.sheet} />
          </div>
        </div>
      )}
    </div>
  );
}
