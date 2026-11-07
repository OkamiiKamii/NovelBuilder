import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { manuscript } from '@/core';
import type { LoreEntry } from '@/modules/codex/types';
import { KIND_LABELS } from '@/modules/manuscript/types';
import { chaptersReferencing } from '../graph';

/** Every chapter and scene that refers to this entry, worked out live from the manuscript and its plans. */
export function MentionedIn({ entry }: { entry: LoreEntry }) {
  const ms = useMemo(() => manuscript.forProject(entry.projectId), [entry.projectId]);
  const nodes = useLiveQuery(() => ms.list(), [ms]) ?? [];
  const plans = useLiveQuery(() => ms.plans(), [ms]) ?? [];
  const references = chaptersReferencing(entry.id, nodes, plans);

  return (
    <section className="stack mentioned-in">
      <h3>Mentioned in</h3>
      {references.length === 0 ? (
        <p className="muted small">No chapter or scene refers to {entry.name} yet. Select words in the editor and link them, or add {entry.name} to a planning sheet.</p>
      ) : (
        <ul className="char-relations">
          {references.map(({ node, inText, inPlan, appears, mentionedOnly }) => (
            <li key={node.id} className="imp-border">
              {/* A link in the text opens the chapter at that link; a plan-only reference opens the chapter. */}
              <Link to={`/project/${entry.projectId}/manuscript/${node.id}`} state={inText ? { mention: entry.id } : { panel: 'notes' }}>
                <strong>{node.title}</strong>
                <span className="muted small">
                  {KIND_LABELS[node.kind]} · {[inText && 'linked in the text', inPlan && 'on the planning sheet', appears && 'appears (your record)', mentionedOnly && 'mentioned, not on the page (your record)'].filter(Boolean).join(' · ')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
