import { Link } from 'react-router-dom';
import { formatNumber, formatRelative, progress } from '@/shared/format';
import { Cover } from './Cover';
import { STATUS_LABELS, type Project, type ProjectStats } from '../types';

export type CardAction = 'edit' | 'duplicate' | 'pin' | 'archive' | 'export' | 'delete';

interface ProjectCardProps {
  project: Project;
  stats: ProjectStats | undefined;
  /** How many timelines this story has, counting this one. */
  timelines?: number;
  onAction: (action: CardAction, project: Project) => void;
}

export function ProjectCard({ project, stats, timelines = 1, onAction }: ProjectCardProps) {
  const words = stats?.wordCount ?? 0;
  const percent = progress(words, project.targetWordCount);
  const chapters = stats?.counts.chapters ?? 0;
  const genres = [project.primaryGenre, ...project.secondaryGenres].filter(Boolean);

  const item = (action: CardAction, label: string, className = '') => (
    <button
      type="button"
      className={className}
      onClick={(e) => {
        e.currentTarget.closest('details')?.removeAttribute('open');
        onAction(action, project);
      }}
    >
      {label}
    </button>
  );

  return (
    <article className={`card${project.archived ? ' archived' : ''}`} style={{ '--accent': project.accent } as React.CSSProperties}>
      <div className="card-top">
        <span className={`badge status-${project.status}`}>{STATUS_LABELS[project.status]}</span>
        {project.pinned && <span className="badge">Pinned</span>}
        {project.archived && <span className="badge">Archived</span>}
        {timelines > 1 && (
          <Link to={`/project/${project.id}/branches`} className="badge card-timelines">
            {timelines} timelines
          </Link>
        )}
        <details className="menu">
          <summary aria-label={`Actions for ${project.title}`}>⋯</summary>
          <div className="menu-items">
            {item('edit', 'Edit details')}
            {item('duplicate', 'Duplicate')}
            {!project.archived && item('pin', project.pinned ? 'Unpin' : 'Pin to top')}
            {item('export', 'Export backup')}
            {item('archive', project.archived ? 'Restore' : 'Archive')}
            {item('delete', 'Delete…', 'danger-text')}
          </div>
        </details>
      </div>
      <Link to={`/project/${project.id}`} className="card-link">
        <Cover title={project.title} cover={project.cover} accent={project.accent} />
        <div className="card-text">
          <h3>{project.title}</h3>
          {project.subtitle && <p className="subtitle">{project.subtitle}</p>}
          {project.author && <p className="muted">{project.author}</p>}
          {genres.length > 0 && (
            <div className="tags">
              {genres.map((genre) => (
                <span key={genre} className="badge">
                  {genre}
                </span>
              ))}
            </div>
          )}
          {project.synopsis && <p className="synopsis">{project.synopsis}</p>}
        </div>
      </Link>
      <footer className="card-footer">
        {percent !== null && (
          <div className="bar" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
            <div style={{ width: `${percent}%` }} />
          </div>
        )}
        <div className="card-meta">
          <span>
            {formatNumber(words)}
            {project.targetWordCount ? ` / ${formatNumber(project.targetWordCount)}` : ''} words ·{' '}
            {formatNumber(chapters)} {chapters === 1 ? 'chapter' : 'chapters'}
          </span>
          <span>Edited {formatRelative(project.updatedAt)}</span>
        </div>
      </footer>
    </article>
  );
}
