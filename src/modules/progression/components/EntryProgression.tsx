import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { LoreEntry } from '@/modules/codex/types';
import { buildTree, flatten, isDocument } from '@/modules/manuscript/tree';
import { useProgression } from '../hooks';
import { inStoryOrder, placeOf, stateAt } from '../state';
import { StateView } from './StateView';

/** On a character's profile or a codex entry: its state as of any chapter. */
export function EntryProgression({ entry }: { entry: LoreEntry }) {
  const { snapshots, blueprints, entries, nodes, loading } = useProgression(entry.projectId);
  const [asOf, setAsOf] = useState('');
  if (loading) return null;
  const mine = inStoryOrder(snapshots, nodes, entry.id);
  const base = `/project/${entry.projectId}/progression?entry=${entry.id}`;
  const documents = flatten(buildTree(nodes)).filter((t) => isDocument(t.node.kind));
  const at = documents.some((t) => t.node.id === asOf) ? asOf : null;
  const state = stateAt(snapshots, nodes, entry.id, at);
  return (
    <section className="stack entry-progression">
      <h3>Progression</h3>
      {mine.length === 0 ? (
        <p className="muted small">
          No snapshots of {entry.name} yet. <Link to={base}>Log how they change through the story</Link>
        </p>
      ) : (
        <>
          <div className="toolbar">
            <select value={at ?? ''} aria-label={`${entry.name} as of`} onChange={(e) => setAsOf(e.target.value)}>
              <option value="">As of the end of the story</option>
              {documents.map(({ node, depth }) => (
                <option key={node.id} value={node.id}>
                  {'  '.repeat(depth)}As of {node.title}
                </option>
              ))}
            </select>
            <Link to={base}>
              {mine.length} {mine.length === 1 ? 'snapshot' : 'snapshots'}
            </Link>
          </div>
          {state ? (
            <div className="panel sheet-card" aria-label={`${entry.name}'s state`}>
              <p className="muted small state-source">
                From the snapshot at {placeOf(state, nodes)}
                {state.label && `: ${state.label}`}
              </p>
              <StateView snapshot={state} systems={blueprints} entries={entries} projectId={entry.projectId} />
            </div>
          ) : (
            <p className="muted small">Nothing has been logged for {entry.name} by that point.</p>
          )}
        </>
      )}
    </section>
  );
}
