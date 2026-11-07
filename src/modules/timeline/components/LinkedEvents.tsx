import { Link } from 'react-router-dom';
import { useTimeline } from '../hooks';
import { REVEAL_CHOICES, type TimelineEvent } from '../types';

interface LinkedEventsProps {
  projectId: string;
  /** Which events belong in this list. */
  match: (event: TimelineEvent) => boolean;
  /** Adds this to the link, e.g. `character=<id>` to open the life path. */
  query?: string;
  empty: string;
  /** The chapter or scene this list is for: each event says how it is told there, when not plainly. */
  nodeId?: string;
}

/** The timeline events linked to a chapter, scene or codex entry, in chronological order. Editing happens on the timeline. */
export function LinkedEvents({ projectId, match, query = '', empty, nodeId }: LinkedEventsProps) {
  const { placed } = useTimeline(projectId);
  const mine = placed.filter((p) => match(p.event));
  const base = `/project/${projectId}/timeline`;
  return (
    <section className="stack linked-events">
      <h3>Timeline events</h3>
      {nodeId && mine.length > 0 && <p className="muted small">In the order they happen in the story, which need not be the order of the chapters.</p>}
      {mine.length === 0 ? (
        <p className="muted small">
          {empty} <Link to={base}>Open the timeline</Link>
        </p>
      ) : (
        <ul className="char-relations">
          {mine.map(({ event, label }) => (
            <li key={event.id} className={`imp-border imp-${event.importance}`}>
              <Link to={`${base}?event=${event.id}${query ? `&${query}` : ''}`}>
                <strong>{event.name}</strong>
                <span className="muted small">{label}</span>
                {nodeId && (event.reveals ?? []).some((r) => r.nodeId === nodeId) && <span className="badge">{REVEAL_CHOICES[event.reveals!.find((r) => r.nodeId === nodeId)!.role]}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
