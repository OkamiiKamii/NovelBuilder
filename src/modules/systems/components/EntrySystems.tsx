import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate } from 'react-router-dom';
import { systems } from '@/core';
import type { LoreEntry } from '@/modules/codex/types';
import { SheetView } from './SheetView';

/** A codex entry's stat sheets: one for each system blueprint it has been placed on. */
export function EntrySystems({ entry }: { entry: LoreEntry }) {
  const navigate = useNavigate();
  const api = systems.forProject(entry.projectId);
  const blueprints = useLiveQuery(() => systems.forProject(entry.projectId).list(), [entry.projectId]);
  const sheets = useLiveQuery(() => systems.forProject(entry.projectId).sheets(), [entry.projectId]);
  if (!blueprints || !sheets || blueprints.length === 0) return null;
  const mine = sheets.filter((s) => s.entryId === entry.id).flatMap((sheet) => {
    const system = blueprints.find((b) => b.id === sheet.systemId);
    return system ? [{ sheet, system }] : [];
  }).sort((a, b) => a.system.name.localeCompare(b.system.name));
  const free = blueprints.filter((b) => !mine.some((m) => m.system.id === b.id)).sort((a, b) => a.name.localeCompare(b.name));
  const base = `/project/${entry.projectId}/characters/systems`;

  return (
    <section className="stack entry-systems">
      <h3>System sheet</h3>
      {mine.length === 0 && <p className="muted small">{entry.name} is not on a system yet.</p>}
      {mine.map(({ sheet, system }) => (
        <div key={sheet.id} className="panel sheet-card" aria-label={`${entry.name} in ${system.name}`}>
          <div className="details-head">
            <strong className="grow-text">{system.name}</strong>
            <Link to={`${base}?system=${system.id}&tab=sheets&sheet=${sheet.id}`}>Edit sheet</Link>
          </div>
          <SheetView system={system} sheet={sheet} />
        </div>
      ))}
      {free.length > 0 && (
        <select
          value=""
          aria-label="Add to a system"
          onChange={(e) => {
            const systemId = e.target.value;
            if (systemId) void api.addSheet(systemId, entry.id).then((sheet) => navigate(`${base}?system=${systemId}&tab=sheets&sheet=${sheet.id}`));
          }}
        >
          <option value="">Add {entry.name} to a system…</option>
          {free.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      )}
    </section>
  );
}
