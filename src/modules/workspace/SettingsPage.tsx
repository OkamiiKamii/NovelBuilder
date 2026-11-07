import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { projects } from '@/core';
import { downloadProject, ProjectForm } from '@/modules/projects';
import { removeNovel } from '@/modules/projects/removal';
import { ConfirmDialog } from '@/shared/ConfirmDialog';
import { StorageStatus } from '@/shared/StorageStatus';
import { THEMES, THEME_LABELS, setTheme, useTheme, type Theme } from '@/shared/theme';
import { MatterForm } from '@/modules/reader/MatterForm';
import { CalendarForm } from '@/modules/timeline/components/CalendarForm';
import { TutorialToggle } from '@/modules/tutorial/Tutorial';
import { useCurrentProject } from './WorkspaceLayout';

export function SettingsPage() {
  const project = useCurrentProject();
  const navigate = useNavigate();
  const theme = useTheme();
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guard = (task: () => Promise<void>) => () =>
    task().catch((err) => setError(err instanceof Error ? err.message : 'Something went wrong.'));

  return (
    <div className="stack narrow">
      <h1>Project settings</h1>
      <section className="panel">
        <h2>Details</h2>
        <ProjectForm
          initial={project}
          submitLabel="Save changes"
          onSubmit={async (input) => {
            await projects.update(project.id, input);
            setSaved(true);
          }}
        />
        {saved && (
          <p className="notice" role="status">
            Changes saved.
          </p>
        )}
      </section>

      <CalendarForm projectId={project.id} />

      <section className="panel stack" aria-label="Appearance">
        <h2>Appearance</h2>
        <label className="field theme-choice">
          <span>Theme</span>
          <select value={theme} aria-label="Theme" onChange={(e) => setTheme(e.target.value as Theme)}>
            {THEMES.map((t) => (
              <option key={t} value={t}>
                {THEME_LABELS[t]}
              </option>
            ))}
          </select>
          <span className="muted small">For the whole app on this device. The Characters pages are warm parchment in the light theme and midnight blue in the dark one. (The writing screen has its own themes, under Aa.)</span>
        </label>
      </section>

      <MatterForm projectId={project.id} />

      <section className="panel stack" aria-label="Modules">
        <h2>Modules</h2>
        <p className="muted small">Optional tools for a kind of story: fantasy, progression, science fiction, mystery, romance, horror, superheroes, history, contemporary life, politics. Switch on only what this novel uses.</p>
        <div className="actions start">
          <Link className="btn" to={`/project/${project.id}/modules`}>
            Open the Module Manager
          </Link>
        </div>
      </section>

      <section className="panel stack" aria-label="Tutorial">
        <h2>Tutorial</h2>
        <p className="muted small">A short guide to each feature, with an example. The button sits at the bottom right of every screen while this is on.</p>
        <TutorialToggle />
      </section>

      <section className="panel">
        <h2>Manage</h2>
        <StorageStatus />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="rows">
          <div className="row">
            <div>
              <strong>Duplicate</strong>
              <p className="muted">Make a fully independent copy of this project and everything in it.</p>
            </div>
            <button type="button" className="btn" onClick={guard(async () => navigate(`/project/${(await projects.duplicate(project.id)).id}`))}>
              Duplicate
            </button>
          </div>
          <div className="row">
            <div>
              <strong>Export backup</strong>
              <p className="muted">
                Download the whole project as one file, version history included. Use Import in the library to restore it on this or another
                device.
              </p>
            </div>
            <button type="button" className="btn" onClick={guard(() => downloadProject(project))}>
              Export
            </button>
          </div>
          <div className="row">
            <div>
              <strong>{project.archived ? 'Restore' : 'Archive'}</strong>
              <p className="muted">
                {project.archived ? 'Move this project back into the library.' : 'Hide this project from the library without deleting it.'}
              </p>
            </div>
            <button type="button" className="btn" onClick={guard(() => projects.setArchived(project.id, !project.archived))}>
              {project.archived ? 'Restore' : 'Archive'}
            </button>
          </div>
          <div className="row">
            <div>
              <strong>Delete</strong>
              <p className="muted">Permanently remove this project and all of its data.</p>
            </div>
            <button type="button" className="btn danger" onClick={() => setConfirmDelete(true)}>
              Delete…
            </button>
          </div>
        </div>
      </section>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete project"
          confirmLabel="Delete forever"
          requireText={project.title}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={guard(async () => {
            await removeNovel(project.id);
            navigate('/', { replace: true });
          })}
        >
          <p>
            This permanently deletes <strong>{project.title}</strong> and everything in it. It cannot be undone.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
