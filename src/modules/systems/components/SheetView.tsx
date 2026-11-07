import { computeSheet } from '../compute';
import { rankName, type BlueprintContent, type SystemSheet } from '../types';

/** A profile's sheet, worked out from the blueprint as it is now. */
export function SheetView({ system, sheet }: { system: BlueprintContent; sheet: Pick<SystemSheet, 'values' | 'progress' | 'itemIds' | 'xp' | 'spent'> }) {
  const { rows, tracks, items, points, available } = computeSheet(system, sheet);
  const groups = system.groups.filter((g) => items.some((i) => i.item.groupId === g.id));
  return (
    <div className="sheet-view">
      {tracks.length > 0 && (
        <dl className="sheet-tracks">
          {tracks.map((t) => (
            <div key={t.track.id}>
              <dt>{t.track.name}</dt>
              <dd>
                <strong>{t.label}</strong>
                {t.next && <span className="muted small"> · {t.next}</span>}
                {t.unmet.length > 0 && <> <span className="small sheet-unmet">Not yet: {t.unmet.join('; ')}</span></>}
                {t.error && <span className="small error"> · {t.error}</span>}
              </dd>
            </div>
          ))}
          {points && (
            <div>
              <dt>{points.name}</dt>
              <dd>
                <strong className={points.unspent < 0 ? 'sheet-unmet' : ''}>{points.unspent < 0 ? `${-points.unspent} over` : `${points.unspent} to place`}</strong>
                <span className="muted small"> · {points.spent} placed of {points.earned} earned</span>
              </dd>
            </div>
          )}
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
                  {sheet.spent?.[row.variable.id] ? <span className="muted small"> · {sheet.spent[row.variable.id]} placed</span> : null}
                  {row.sources.length > 0 && <span className="muted small"> · from {row.sources.join(', ')}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {groups.map((group) => (
        <div key={group.id} className="sheet-group">
          <h4>{group.name}</h4>
          <ul>
            {items.filter((i) => i.item.groupId === group.id).map(({ item, requires, unmet, costs, effects, error }) => (
              <li key={item.id}>
                <strong>{item.name}</strong>
                {rankName(system, item) && <span className="badge">{rankName(system, item)}</span>}
                {item.affinity && <span className="badge">{item.affinity}</span>}
                <span className="small sheet-item-facts">
                  {[effects.join(', '), costs.length ? `Costs ${costs.map((c) => c.label).join(', ')}` : '', item.cooldown ? `Cooldown: ${item.cooldown}` : ''].filter(Boolean).join(' · ')}
                </span>
                {requires && (
                  <span className={`small ${unmet.length ? 'sheet-unmet' : 'muted'}`}>
                    Requires {requires}
                    {unmet.length > 0 ? ` — not met: ${unmet.join('; ')}` : ' — met'}
                  </span>
                )}
                {item.evolution && <span className="muted small">{item.evolution}</span>}
                {error && <span className="small error">{error}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {available.length > 0 && (
        <p className="small sheet-available">
          <strong>Now within reach:</strong> {available.map((item) => item.name).join(', ')}
        </p>
      )}
      {rows.length + tracks.length + items.length === 0 && <p className="muted small">This blueprint has nothing defined yet.</p>}
    </div>
  );
}
