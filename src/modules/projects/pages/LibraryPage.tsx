import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { codex, projects as projectService, systems as systemService, templates as templateService } from '@/core';
import { useFamilies } from '@/modules/branching/hooks';
import { flattenFamily } from '@/modules/branching/tree';
import { PRESETS } from '@/modules/codex/presets';
import { SYSTEM_PRESETS } from '@/modules/systems/presets';
import { ConfirmDialog } from '@/shared/ConfirmDialog';
import { formatNumber } from '@/shared/format';
import { Modal } from '@/shared/Modal';
import { TutorialToggle } from '@/modules/tutorial/Tutorial';
import { StorageStatus } from '@/shared/StorageStatus';
import { ProjectCard, type CardAction } from '../components/ProjectCard';
import { ProjectForm } from '../components/ProjectForm';
import { downloadProject, importProjectFile } from '../files';
import { removeNovel } from '../removal';
import { useProjects, useStatsMap } from '../hooks';
import { PROJECT_STATUSES, STATUS_LABELS, type Project, type ProjectStatus } from '../types';

type SortKey = 'updated' | 'opened' | 'title' | 'created' | 'words';

const SORT_LABELS: Record<SortKey, string> = {
  updated: 'Last edited',
  opened: 'Last opened',
  title: 'Title',
  created: 'Date created',
  words: 'Word count',
};

const genresOf = (p: Project): string[] => [p.primaryGenre, ...p.secondaryGenres].filter(Boolean);

type DialogState = { kind: 'create' } | { kind: 'edit'; project: Project } | { kind: 'delete'; project: Project } | null;

export function LibraryPage() {
  const navigate = useNavigate();
  const everything = useProjects();
  const families = useFamilies();
  // Alternate timelines live inside their story: the library lists each story once, by its original.
  const all = useMemo(() => (everything && families ? everything.filter((p) => families.some((f) => f.projectId === p.id)) : undefined), [everything, families]);
  const timelineCount = (projectId: string) => flattenFamily(families?.find((f) => f.projectId === projectId) ?? { projectId, title: '', status: 'main', parentId: null, forkLabel: '', note: '', depth: 0, children: [] }).length;
  const stats = useStatsMap();
  const fileInput = useRef<HTMLInputElement>(null);
  const savedTemplates = useLiveQuery(() => templateService.list(), []) ?? [];

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<ProjectStatus | 'all'>('all');
  const [genre, setGenre] = useState('all');
  const [sort, setSort] = useState<SortKey>('updated');
  const [showArchived, setShowArchived] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);

  const active = useMemo(() => (all ?? []).filter((p) => !p.archived), [all]);
  const archivedCount = (all?.length ?? 0) - active.length;
  const genres = useMemo(
    () => [...new Set((all ?? []).flatMap(genresOf))].sort((a, b) => a.localeCompare(b)),
    [all],
  );

  const totals = useMemo(() => {
    const words = active.reduce((n, p) => n + (stats.get(p.id)?.wordCount ?? 0), 0);
    const target = active.reduce((n, p) => n + (p.targetWordCount ?? 0), 0);
    return {
      words,
      target,
      inProgress: active.filter((p) => p.status === 'drafting' || p.status === 'revising').length,
      complete: active.filter((p) => p.status === 'complete').length,
    };
  }, [active, stats]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const words = (p: Project) => stats.get(p.id)?.wordCount ?? 0;
    const compare: Record<SortKey, (a: Project, b: Project) => number> = {
      updated: (a, b) => b.updatedAt - a.updatedAt,
      opened: (a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0),
      created: (a, b) => b.createdAt - a.createdAt,
      title: (a, b) => a.title.localeCompare(b.title),
      words: (a, b) => words(b) - words(a),
    };
    return (all ?? [])
      .filter((p) => p.archived === showArchived)
      .filter((p) => status === 'all' || p.status === status)
      .filter((p) => genre === 'all' || genresOf(p).includes(genre))
      .filter(
        (p) => !needle || [p.title, p.subtitle, p.author, p.synopsis, ...genresOf(p), ...p.tags].some((v) => v.toLowerCase().includes(needle)),
      )
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || compare[sort](a, b));
  }, [all, stats, query, status, genre, sort, showArchived]);

  async function run(task: () => Promise<string | void>) {
    try {
      const text = await task();
      setNotice(text ? { text } : null);
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : 'Something went wrong.', error: true });
    }
  }

  function handleAction(action: CardAction, project: Project) {
    switch (action) {
      case 'edit':
        return setDialog({ kind: 'edit', project });
      case 'delete':
        return setDialog({ kind: 'delete', project });
      case 'duplicate':
        return run(async () => `Created "${(await projectService.duplicate(project.id)).title}".`);
      case 'pin':
        return run(() => projectService.setPinned(project.id, !project.pinned));
      case 'archive':
        return run(async () => {
          await projectService.setArchived(project.id, !project.archived);
          return project.archived ? `Restored "${project.title}".` : `Archived "${project.title}".`;
        });
      case 'export':
        return run(() => downloadProject(project));
    }
  }

  const filtered = query.trim() !== '' || status !== 'all' || genre !== 'all';

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Library</h1>
          <p className="muted">Every novel lives in its own isolated workspace.</p>
        </div>
        <div className="actions">
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) run(async () => `Imported "${(await importProjectFile(file)).title}".`);
            }}
          />
          <Link to="/cloud" className="btn">
            Cloud
          </Link>
          <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
            Import
          </button>
          <button type="button" className="btn primary" onClick={() => setDialog({ kind: 'create' })}>
            New project
          </button>
        </div>
      </header>

      <section className="tiles" aria-label="Library totals">
        <div className="tile">
          <strong>{active.length}</strong>
          <span>Projects</span>
        </div>
        <div className="tile">
          <strong>{formatNumber(totals.words)}</strong>
          <span>{totals.target ? `of ${formatNumber(totals.target)} words targeted` : 'Words written'}</span>
        </div>
        <div className="tile">
          <strong>{totals.inProgress}</strong>
          <span>In progress</span>
        </div>
        <div className="tile">
          <strong>{totals.complete}</strong>
          <span>Complete</span>
        </div>
      </section>

      <div className="toolbar">
        <input type="search" placeholder="Search projects…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search projects" />
        <select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus | 'all')} aria-label="Filter by status">
          <option value="all">All statuses</option>
          {PROJECT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        {genres.length > 0 && (
          <select value={genres.includes(genre) ? genre : 'all'} onChange={(e) => setGenre(e.target.value)} aria-label="Filter by genre">
            <option value="all">All genres</option>
            {genres.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        )}
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort by">
          {Object.entries(SORT_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        {(archivedCount > 0 || showArchived) && (
          <label className="check">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Archived ({archivedCount})
          </label>
        )}
      </div>

      {notice && (
        <p className={notice.error ? 'notice error' : 'notice'} role="status">
          {notice.text}
          <button type="button" className="btn ghost icon" onClick={() => setNotice(null)} aria-label="Dismiss">
            ✕
          </button>
        </p>
      )}

      {all === undefined ? null : visible.length === 0 ? (
        <div className="empty">
          {filtered ? (
            <p>No projects match your filters.</p>
          ) : showArchived ? (
            <p>No archived projects.</p>
          ) : (
            <>
              <h2>Start your first novel</h2>
              <p className="muted">Create a project to get a dedicated workspace for its manuscript, lore and plot.</p>
              <button type="button" className="btn primary" onClick={() => setDialog({ kind: 'create' })}>
                New project
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="cards">
          {visible.map((project) => (
            <ProjectCard key={project.id} project={project} stats={stats.get(project.id)} timelines={timelineCount(project.id)} onAction={handleAction} />
          ))}
        </div>
      )}

      <StorageStatus />
      <p className="library-tutorial">
        <TutorialToggle label="Tutorial button" />
      </p>

      {dialog?.kind === 'create' && (
        <Modal title="New project" onClose={() => setDialog(null)}>
          <ProjectForm
            submitLabel="Create project"
            onCancel={() => setDialog(null)}
            templates={[{ label: 'Built in', options: PRESETS }, { label: 'Yours', options: savedTemplates }]}
            systems={SYSTEM_PRESETS}
            onSubmit={async (input, templateId, systemId) => {
              const project = await projectService.create(input);
              const template = [...PRESETS, ...savedTemplates].find((t) => t.id === templateId);
              if (template) await codex.forProject(project.id).applyTemplate(template);
              const system = SYSTEM_PRESETS.find((preset) => preset.id === systemId);
              if (system) await systemService.forProject(project.id).create(system.content);
              navigate(`/project/${project.id}`);
            }}
          />
        </Modal>
      )}
      {dialog?.kind === 'edit' && (
        <Modal title="Edit project" onClose={() => setDialog(null)}>
          <ProjectForm
            initial={dialog.project}
            submitLabel="Save changes"
            onCancel={() => setDialog(null)}
            onSubmit={async (input) => {
              await projectService.update(dialog.project.id, input);
              setDialog(null);
            }}
          />
        </Modal>
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          title="Delete project"
          confirmLabel="Delete forever"
          requireText={dialog.project.title}
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            const { id, title } = dialog.project;
            setDialog(null);
            run(async () => {
              await removeNovel(id);
              return `Deleted "${title}".`;
            });
          }}
        >
          <p>
            This permanently deletes <strong>{dialog.project.title}</strong> and everything in it. It cannot be undone — export a
            backup first if you might want it back.
          </p>
          {timelineCount(dialog.project.id) > 1 && <p className="muted">Its {timelineCount(dialog.project.id) - 1} alternate {timelineCount(dialog.project.id) === 2 ? 'timeline is' : 'timelines are'} not deleted: each becomes a project of its own in the library.</p>}
        </ConfirmDialog>
      )}
    </div>
  );
}
