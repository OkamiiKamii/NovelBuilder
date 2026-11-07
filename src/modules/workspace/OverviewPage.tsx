import { Link } from 'react-router-dom';
import { Cover, STATUS_LABELS, useProjectStats } from '@/modules/projects';
import { daysUntil, formatDate, formatNumber, formatRelative, progress } from '@/shared/format';
import { useCurrentProject } from './WorkspaceLayout';

export function OverviewPage() {
  const project = useCurrentProject();
  const stats = useProjectStats(project.id);
  const percent = progress(stats.wordCount, project.targetWordCount);
  const remaining = project.targetWordCount ? Math.max(0, project.targetWordCount - stats.wordCount) : null;
  const daysLeft = project.deadline ? daysUntil(project.deadline) : null;
  const pace = remaining !== null && daysLeft !== null && daysLeft > 0 ? Math.ceil(remaining / daysLeft) : null;

  return (
    <div className="stack wide">
      <header className="page-header">
        <div className="overview-head">
          {project.cover && <Cover title={project.title} cover={project.cover} accent={project.accent} className="cover-preview" />}
          <div>
            <h1>{project.title}</h1>
            {project.subtitle && <p className="subtitle">{project.subtitle}</p>}
            <p className="muted">
              {[project.author, project.primaryGenre, ...project.secondaryGenres].filter(Boolean).join(' · ')}
              {project.archived && ' · Archived'}
            </p>
          </div>
        </div>
        <div className="actions">
          <span className={`badge status-${project.status}`}>{STATUS_LABELS[project.status]}</span>
          <Link to="manuscript" className="btn primary">
            {stats.wordCount ? 'Continue writing' : 'Start writing'}
          </Link>
        </div>
      </header>

      <section className="tiles">
        <div className="tile">
          <strong>{formatNumber(stats.wordCount)}</strong>
          <span>{project.targetWordCount ? `of ${formatNumber(project.targetWordCount)} words` : 'Words'}</span>
          {percent !== null && (
            <div className="bar" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
              <div style={{ width: `${percent}%` }} />
            </div>
          )}
        </div>
        <div className="tile">
          <strong>{formatNumber(stats.counts.chapters ?? 0)}</strong>
          <span>Chapters</span>
        </div>
        {Object.entries(stats.counts).filter(([key]) => key !== 'chapters').map(([key, count]) => (
          <div className="tile" key={key}>
            <strong>{formatNumber(count)}</strong>
            <span className="capitalize">{key}</span>
          </div>
        ))}
        <div className="tile">
          {project.deadline && daysLeft !== null ? (
            <>
              <strong>{daysLeft >= 0 ? daysLeft : `${-daysLeft} over`}</strong>
              <span>
                {daysLeft >= 0 ? 'Days until' : 'Days past'} {formatDate(project.deadline)}
              </span>
            </>
          ) : (
            <>
              <strong>—</strong>
              <span>No deadline set</span>
            </>
          )}
        </div>
        {pace !== null && (
          <div className="tile">
            <strong>{formatNumber(pace)}</strong>
            <span>Words per day to finish on time</span>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Synopsis</h2>
        {project.synopsis ? (
          <p className="prose">{project.synopsis}</p>
        ) : (
          <p className="muted">
            No synopsis yet. <Link to="settings">Add one in settings.</Link>
          </p>
        )}
        {project.tags.length > 0 && (
          <div className="tags">
            {project.tags.map((tag) => (
              <span key={tag} className="badge">
                {tag}
              </span>
            ))}
          </div>
        )}
      </section>

      <p className="muted small">
        Created {formatRelative(project.createdAt)} · Edited {formatRelative(project.updatedAt)}
      </p>
    </div>
  );
}
