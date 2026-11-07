import { Link, useNavigate } from 'react-router-dom';
import { canon } from '@/core';
import type { LoreEntry } from '@/modules/codex/types';
import { useCanon } from '../hooks';
import type { FactReview } from '../review';
import { STATUS_LABELS, STATUS_ORDER, type CanonFact } from '../types';
import { History, historyOf } from './History';

const byStatus = (a: CanonFact, b: CanonFact) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.subject.localeCompare(b.subject);

function FactList({ projectId, reviews }: { projectId: string; reviews: FactReview[] }) {
  return (
    <ul className="char-relations">
      {reviews.map(({ fact, flags }) => (
        <li key={fact.id} className={`thread-border cs-${fact.status}`}>
          <Link to={`/project/${projectId}/canon?fact=${fact.id}`}>
            <strong>
              {fact.subject} <span className={`thread-status cs-${fact.status}`}>{STATUS_LABELS[fact.status]}</span>
            </strong>
            <span className="small">{fact.statement.trim() || <span className="muted">No statement yet</span>}</span>
            {flags.length > 0 && <span className="event-flag small">Appears to conflict with another statement</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** The facts established in a chapter or scene. Editing happens on the Canon page. */
export function LinkedFacts({ projectId, nodeId, empty }: { projectId: string; nodeId: string; empty: string }) {
  const { reviews } = useCanon(projectId);
  const mine = reviews.filter(({ fact }) => fact.sources.some((s) => s.type === 'chapter' && s.refId === nodeId)).sort((a, b) => byStatus(a.fact, b.fact));
  return (
    <section className="stack linked-facts">
      <h3>Canon established here</h3>
      {mine.length === 0 ? (
        <p className="muted small">
          {empty} <Link to={`/project/${projectId}/canon`}>Open canon</Link>
        </p>
      ) : (
        <FactList projectId={projectId} reviews={mine} />
      )}
    </section>
  );
}

/** A codex entry's place in canon: every fact about it, and how those facts changed over time. */
export function EntryCanon({ entry }: { entry: LoreEntry }) {
  const navigate = useNavigate();
  const { reviews } = useCanon(entry.projectId);
  const mine = reviews.filter(({ fact }) => fact.entryIds.includes(entry.id)).sort((a, b) => byStatus(a.fact, b.fact));
  // A fact recorded and never touched again has no story to tell yet.
  const history = historyOf(mine.map((r) => r.fact).filter((fact) => fact.history.length > 1));

  const add = async () => {
    const api = canon.forProject(entry.projectId);
    const fact = await api.create({ entryIds: [entry.id] });
    await api.addSource(fact.id, { type: 'entry', refId: entry.id });
    navigate(`/project/${entry.projectId}/canon?fact=${fact.id}`);
  };

  return (
    <section className="stack entry-canon">
      <h3>Canon</h3>
      {mine.length === 0 ? <p className="muted small">No facts about {entry.name} are recorded yet.</p> : <FactList projectId={entry.projectId} reviews={mine} />}
      <div className="actions start">
        <button type="button" className="btn" onClick={() => void add()}>
          Record a fact about {entry.name}
        </button>
      </div>
      {history.length > 0 && (
        <>
          <h4>Canon history</h4>
          <History items={history} showSubject />
        </>
      )}
    </section>
  );
}
