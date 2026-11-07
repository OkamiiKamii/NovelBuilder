import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { manuscript, relationships } from '@/core';
import { useCurrentProject } from '@/modules/workspace/WorkspaceLayout';
import { Modal } from '@/shared/Modal';
import { useMediaQuery } from '@/shared/useMediaQuery';
import { NetworkMap, type MapEdge } from '../components/NetworkMap';
import { RelationDetails } from '../components/RelationDetails';
import { RelationSettingsPanel, TypeOptions } from '../components/RelationSettings';
import { useRelationships } from '../hooks';
import { layoutMap, stageAt, timelineOf } from '../timeline';
import { AFFINITY_LABELS, NO_SETTINGS } from '../types';

export function RelationshipsPage() {
  const project = useCurrentProject();
  const api = useMemo(() => relationships.forProject(project.id), [project.id]);
  const { relations, entries, order, loading } = useRelationships(project.id);
  const stored = useLiveQuery(() => api.settings(), [api]);
  const settings = stored ?? { id: '', projectId: project.id, updatedAt: 0, ...NO_SETTINGS };
  const nodes = useLiveQuery(() => manuscript.forProject(project.id).list(), [project.id]) ?? [];
  const isMobile = useMediaQuery('(max-width: 1100px)');
  const [params, setParams] = useSearchParams();
  const [atNodeId, setAtNodeId] = useState('');
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [preset, setPreset] = useState('friends');
  const [error, setError] = useState<string | null>(null);

  const characters = useMemo(() => entries.filter((e) => e.category === 'character').sort((a, b) => a.name.localeCompare(b.name)), [entries]);
  const focusId = characters.some((c) => c.id === params.get('focus')) ? params.get('focus') : null;
  const selected = relations.find((r) => r.id === params.get('rel')) ?? null;
  const at = order.position.has(atNodeId) ? atNodeId : null;

  const setParam = (key: string, value: string | null) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  const fail = (err: unknown) => setError(err instanceof Error ? err.message : 'Something went wrong.');

  // Only relationships between entries that still exist are drawn; a state that has not begun by the chosen point is left out.
  const known = useMemo(() => new Set(entries.map((e) => e.id)), [entries]);
  const live = useMemo(() => relations.filter((r) => known.has(r.fromId) && known.has(r.toId)), [relations, known]);
  const mapNodes = useMemo(() => layoutMap(entries, live, focusId), [entries, live, focusId]);
  const edges = useMemo(() => {
    const placed = new Map(mapNodes.map((node) => [node.entry.id, node]));
    return live.flatMap((relation): MapEdge[] => {
      const stage = stageAt(relation, at, order);
      const from = placed.get(relation.fromId);
      const to = placed.get(relation.toId);
      return stage && from && to ? [{ relation, stage, from, to }] : [];
    });
  }, [live, mapNodes, at, order]);
  const name = (id: string) => entries.find((e) => e.id === id)?.name ?? 'Unknown';
  const rows = live
    .filter((r) => !focusId || r.fromId === focusId || r.toId === focusId)
    .map((relation) => ({ relation, stage: stageAt(relation, at, order) }))
    .sort((a, b) => name(a.relation.fromId).localeCompare(name(b.relation.fromId)) || name(a.relation.toId).localeCompare(name(b.relation.toId)));
  const hiddenByFocus = focusId ? live.length - rows.length : 0;

  const details = selected && (
    <RelationDetails key={selected.id} relation={selected} settings={settings} entries={entries} nodes={nodes} order={order} api={api} projectId={project.id} onClose={() => setParam('rel', null)} onError={fail} />
  );

  if (loading) return null;
  return (
    <div className="stack relationships">
      <header className="page-header">
        <div>
          <h1>Relationships</h1>
          <p className="muted">
            {live.length} {live.length === 1 ? 'relationship' : 'relationships'} between {characters.length} {characters.length === 1 ? 'character' : 'characters'}
          </p>
        </div>
        <div className="rel-controls">
          <label className="field">
            <span>Centred on</span>
            <select value={focusId ?? ''} aria-label="Centred on" onChange={(e) => setParam('focus', e.target.value || null)}>
              <option value="">Everyone</option>
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>As of</span>
            <select value={at ?? ''} aria-label="As of" onChange={(e) => setAtNodeId(e.target.value)}>
              <option value="">End of the story</option>
              {order.chapters.map((chapter, i) => (
                <option key={chapter.id} value={chapter.id}>
                  Chapter {i + 1}: {chapter.title}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {error && (
        <p className="notice error" role="alert">
          {error}
          <button type="button" className="btn ghost icon" onClick={() => setError(null)} aria-label="Dismiss">
            ✕
          </button>
        </p>
      )}

      {characters.length < 2 ? (
        <div className="empty">
          <h2>Relationships connect characters</h2>
          <p className="muted">Create at least two characters, then link them here and track how things between them change.</p>
          <Link to="../characters" className="btn primary">
            Open Characters
          </Link>
        </div>
      ) : (
        <>
          <form
            className="rel-new panel"
            onSubmit={(e) => {
              e.preventDefault();
              api.create(fromId, toId, preset).then((relation) => {
                setError(null);
                setFromId('');
                setToId('');
                setParam('rel', relation.id);
              }, fail);
            }}
          >
            <strong>New relationship</strong>
            <select value={fromId} aria-label="First character" onChange={(e) => setFromId(e.target.value)}>
              <option value="">First character…</option>
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select value={preset} aria-label="Relationship type" onChange={(e) => setPreset(e.target.value)}>
              <TypeOptions settings={settings} current={preset} />
            </select>
            <select value={toId} aria-label="Second character" onChange={(e) => setToId(e.target.value)}>
              <option value="">Second character…</option>
              {characters.filter((c) => c.id !== fromId).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button type="submit" className="btn primary" disabled={!fromId || !toId}>
              Link
            </button>
          </form>

          <RelationSettingsPanel settings={settings} api={api} onError={fail} />

          <div className={`rel-body${selected && !isMobile ? ' with-details' : ''}`}>
            <div className="stack">
              {live.length === 0 ? (
                <div className="empty">
                  <p className="muted">No relationships yet. Link two characters above to start the map.</p>
                </div>
              ) : (
                <NetworkMap nodes={mapNodes} edges={edges} selectedId={selected?.id ?? null} onFocus={(id) => setParam('focus', id === focusId ? null : id)} onOpen={(id) => setParam('rel', id)} />
              )}
              {hiddenByFocus > 0 && (
                <p className="muted small">
                  {hiddenByFocus} {hiddenByFocus === 1 ? 'relationship does' : 'relationships do'} not involve {name(focusId!)}.{' '}
                  <button type="button" className="link" onClick={() => setParam('focus', null)}>
                    Show everyone
                  </button>
                </p>
              )}

              {rows.length > 0 && (
                <div className="table-scroll">
                  <table className="sessions rel-table">
                    <thead>
                      <tr>
                        <th scope="col">Between</th>
                        <th scope="col">{at ? 'At this point' : 'Now'}</th>
                        <th scope="col">Affinity</th>
                        <th scope="col">History</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ relation, stage }) => (
                        <tr key={relation.id} className={relation.id === selected?.id ? 'selected' : ''}>
                          <td>
                            <button type="button" className="link" onClick={() => setParam('rel', relation.id)}>
                              {name(relation.fromId)} {stage?.directional ? '→' : '&'} {name(relation.toId)}
                            </button>
                          </td>
                          <td>{stage ? stage.title || stage.label || 'Related' : <span className="muted">Not yet</span>}</td>
                          <td>{stage ? AFFINITY_LABELS[stage.affinity] : '—'}</td>
                          <td className="muted">{timelineOf(relation, order).map((t) => `${t.range}: ${t.stage.label || 'Related'}`).join(' → ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {!isMobile && selected && (
              <aside className="panel rel-drawer" aria-label="Relationship details">
                {details}
              </aside>
            )}
          </div>
        </>
      )}

      {isMobile && selected && (
        <Modal title="Relationship" onClose={() => setParam('rel', null)}>
          {details}
        </Modal>
      )}
    </div>
  );
}
