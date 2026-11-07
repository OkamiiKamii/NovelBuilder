import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CONNECTION_STATUS_LABELS, SOURCE_WORDS, statusOf } from '@/modules/integrity/rules';
import { connectionsOf, deriveConnections } from '@/modules/model/connections';
import { useStoryModel } from '@/modules/model/hooks';
import { resolveRef } from '@/modules/model/model';
import { routeFor } from '@/modules/model/navigate';
import type { EntityRef } from '@/modules/model/types';

/**
 * Every connection a record has, both ways: what it points at and what
 * points at it, read from where each is kept (the shared model). Each opens
 * the record at the other end, so any reference can be followed back. A
 * stored connection shows its status.
 */
export function AllConnections({ projectId, of }: { projectId: string; of: EntityRef }) {
  const model = useStoryModel(projectId);
  const seen = useMemo(() => (model ? connectionsOf(deriveConnections(model).connections, of) : []), [model, of.type, of.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!model) return null;
  const name = (ref: EntityRef) => {
    const found = resolveRef(model, ref);
    return found.found ? found.view.label : 'Something deleted';
  };
  return (
    <details className="all-connections">
      <summary>
        Every connection <span className="muted small">({seen.length})</span>
      </summary>
      {seen.length === 0 ? (
        <p className="muted small">Nothing points here yet, and this points at nothing.</p>
      ) : (
        <>
          <p className="muted small">Both ways: what this points at, and what points at it, read from where each is kept. Each opens the other end.</p>
          <ul className="all-connections-list" aria-label="Every connection">
            {seen.map((s) => {
              const route = routeFor(projectId, model, s.other);
              const other = route ? (
                <Link to={route.to} state={route.state}>
                  {name(s.other)}
                </Link>
              ) : (
                <span>{name(s.other)}</span>
              );
              const label = (s.outgoing ? s.label : s.connection.label) || 'related to';
              const status = statusOf(s.connection);
              return (
                <li key={`${s.connection.id}:${s.outgoing ? 'out' : 'in'}`}>
                  {s.outgoing ? (
                    <>
                      {label} {other}
                    </>
                  ) : (
                    <>
                      {other} {label.charAt(0).toLowerCase() + label.slice(1)} this
                    </>
                  )}
                  {status && <span className={`badge conn-${status}`}> {CONNECTION_STATUS_LABELS[s.connection.canon ?? 'canon']}</span>}
                  <span className="muted small"> · kept in {SOURCE_WORDS[s.connection.source.table] ?? s.connection.source.table}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </details>
  );
}
