import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { diagnose, type ThreadReport } from '../diagnostics';
import { usePlot } from '../hooks';
import { categoryName, statusName } from '../types';

interface LinkedThreadsProps {
  projectId: string;
  /** Which threads belong in this list, and optionally what to say about each. */
  match: (report: ThreadReport) => boolean;
  detail?: (report: ThreadReport) => string;
  empty: string;
}

/** The plot threads that involve a codex entry or develop in a chapter. Editing happens on the Plot threads page. */
export function LinkedThreads({ projectId, match, detail, empty }: LinkedThreadsProps) {
  const { threads, nodes } = usePlot(projectId);
  const mine = useMemo(() => diagnose(threads, nodes).reports, [threads, nodes])
    .filter(match)
    .sort((a, b) => a.thread.title.localeCompare(b.thread.title));
  const base = `/project/${projectId}/plot`;
  return (
    <section className="stack linked-threads">
      <h3>Plot threads</h3>
      {mine.length === 0 ? (
        <p className="muted small">
          {empty} <Link to={base}>Open plot threads</Link>
        </p>
      ) : (
        <ul className="char-relations">
          {mine.map((report) => (
            <li key={report.thread.id} className={`thread-border st-${report.thread.status}`}>
              <Link to={`${base}?thread=${report.thread.id}`}>
                <strong>{report.thread.title}</strong>
                <span className="muted small">{[categoryName(report.thread), statusName(report.thread), detail?.(report)].filter(Boolean).join(' · ')}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
