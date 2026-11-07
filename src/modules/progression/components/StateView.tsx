import { Link } from 'react-router-dom';
import type { LoreEntry } from '@/modules/codex/types';
import { rankName, type SystemBlueprint } from '@/modules/systems/types';
import { linesOf, resolveSystem } from '../state';
import { DIMENSION_LABELS, STATUS_DIMENSIONS, type ProgressSnapshot } from '../types';

interface StateViewProps {
  snapshot: ProgressSnapshot;
  systems: SystemBlueprint[];
  entries: LoreEntry[];
  projectId: string;
}

/** A character's whole state at one snapshot: where they stand in each system, what they carry, and how they are. */
export function StateView({ snapshot, systems, entries, projectId }: StateViewProps) {
  const states = systems.filter((s) => snapshot.systems[s.id]).map((s) => resolveSystem(s, snapshot.systems[s.id]));
  const status = STATUS_DIMENSIONS.map((d) => ({ dimension: d, lines: linesOf(snapshot.status[d] ?? '') })).filter((s) => s.lines.length);
  const empty = states.length === 0 && snapshot.gear.length === 0 && status.length === 0 && !snapshot.notes.trim();
  return (
    <div className="state-view">
      {states.map(({ system, auto, rows, tracks, items, available }) => (
        <section key={system.id} className="sheet-view" aria-label={system.name}>
          <h4 className="state-system">
            {system.name}
            {!auto && <span className="badge">entered by hand</span>}
          </h4>
          {tracks.length > 0 && (
            <dl className="sheet-tracks">
              {tracks.map((t) => (
                <div key={t.track.id}>
                  <dt>{t.track.name}</dt>
                  <dd>
                    <strong>{t.label}</strong>
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {rows.length > 0 && (
            <table className="sheet-stats">
              <tbody>
                {rows.map((row) => (
                  <tr key={row.variable.id} className={row.variable.kind === 'derived' ? 'derived' : ''}>
                    <th scope="row">{row.variable.name}</th>
                    <td>
                      {row.error ? <span className="error small">{row.error}</span> : row.display}
                      {auto && row.byHand && <span className="muted small"> · set by hand{row.systemSays ? ` (the system works out ${row.systemSays})` : ''}</span>}
                      {row.sources.length > 0 && <span className="muted small"> · from {row.sources.join(', ')}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {system.groups.filter((g) => items.some((i) => i.item.groupId === g.id)).map((group) => (
            <div key={group.id} className="sheet-group">
              <h4>{group.name}</h4>
              <ul>
                {items.filter((i) => i.item.groupId === group.id).map(({ item, requires, unmet, costs }) => (
                  <li key={item.id}>
                    <strong>{item.name}</strong>
                    {rankName(system, item) && <span className="badge">{rankName(system, item)}</span>}
                    <span className="small sheet-item-facts">{[costs.length ? `Costs ${costs.map((c) => c.label).join(', ')}` : '', item.cooldown ? `Cooldown: ${item.cooldown}` : ''].filter(Boolean).join(' · ')}</span>
                    {auto && requires && unmet.length > 0 && <span className="small sheet-unmet">Requires {requires}; not met: {unmet.join('; ')}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {available.length > 0 && (
            <p className="small state-available" role="note">
              Now within reach: {available.map((item) => item.name).join(', ')}
            </p>
          )}
        </section>
      ))}
      {snapshot.gear.length > 0 && (
        <section className="sheet-group" aria-label="Inventory and gear">
          <h4>Inventory &amp; gear</h4>
          <ul>
            {snapshot.gear.map((item) => (
              <li key={item.id}>
                {entries.some((e) => e.id === item.entryId) ? <Link to={`/project/${projectId}/codex/${item.entryId}`}>{item.name}</Link> : <strong>{item.name}</strong>}
                {item.kind && <span className="badge">{item.kind}</span>}
                <span className="muted small">{item.note}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {status.map(({ dimension, lines }) => (
        <section key={dimension} className="sheet-group" aria-label={DIMENSION_LABELS[dimension]}>
          <h4>{DIMENSION_LABELS[dimension]}</h4>
          <ul className="state-lines">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ))}
      {snapshot.notes.trim() && <p className="muted small">{snapshot.notes}</p>}
      {empty && <p className="muted small">Nothing recorded in this snapshot yet.</p>}
    </div>
  );
}
