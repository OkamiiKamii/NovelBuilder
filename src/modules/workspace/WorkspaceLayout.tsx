import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, Outlet, useLocation, useMatch, useNavigate, useParams } from 'react-router-dom';
import { ReadOnlyScope } from '@/modules/collab/components/ReadOnly';
import { useMe } from '@/modules/collab/identity';
import { ROLE_LABELS, can, pageAllowed } from '@/modules/sync/access';
import { TimelineTag } from '@/modules/branching/hooks';
import { projects } from '@/core';
import { CategoriesProvider } from '@/modules/codex/categories';
import { Trail, useTrailRecorder } from '@/modules/crossref/components/Trail';
import { useProject, type Project } from '@/modules/projects';
import { ProjectSearch } from '@/modules/search/components/ProjectSearch';
import { getPrefs, setPrefs } from '@/modules/manuscript/preferences';
import { AppBar, QuickNote, TabBar } from '@/modules/platform/components/Shell';
import { useDevice } from '@/modules/platform/device';
import { ShellContext, useEdgeSwipe, type DrawerSide, type Shell } from '@/modules/platform/shell';
import { Dock, StudioBar, useSwitchMode } from '@/modules/studio/Dock';
import { NavPanel } from '@/modules/studio/panels';
import { actionFor, comboOf, displayCombo, type ActionId } from '@/modules/studio/shortcuts';
import { MODES, MODE_LABELS, slotOf, studio, useStudio, type Mode } from '@/modules/studio/store';

const ProjectContext = createContext<Project | null>(null);

/** The novel open in the workspace, or null outside one: for parts of the page that may be shown either way. */
export const useOpenProject = (): Project | null => useContext(ProjectContext);

/** The project the current workspace is scoped to. Only valid under a workspace route. */
export function useCurrentProject(): Project {
  const project = useContext(ProjectContext);
  if (!project) throw new Error('useCurrentProject must be used inside a project workspace');
  return project;
}

const SearchContext = createContext<() => void>(() => {});

/** Opens project-wide search from anywhere inside a workspace. */
export const useOpenSearch = (): (() => void) => useContext(SearchContext);


/** Keyed by project id so no component state survives a switch between projects. */
export function WorkspaceRoute() {
  const { id: projectId = '' } = useParams();
  return <WorkspaceLayout key={projectId} projectId={projectId} />;
}

function WorkspaceLayout({ projectId }: { projectId: string }) {
  const project = useProject(projectId);
  const exists = Boolean(project);
  // The writing screen brings its own chrome so the canvas gets the whole window.
  const writing = useMatch('/project/:id/manuscript/*') !== null;
  const reading = useMatch('/project/:id/read/*') !== null;
  const [searching, setSearching] = useState(false);
  const { shortcuts, mode: activeMode } = useStudio(projectId);
  useTrailRecorder(projectId);
  const openSearch = useCallback(() => setSearching(true), []);
  const me = useMe(projectId);

  // On a narrow screen the side panels slide over the page. Which one is out is of the moment: it is never saved, so
  // it cannot disturb the layout this or any other device keeps.
  const dev = useDevice();
  const [drawer, setDrawer] = useState<DrawerSide | null>(null);
  const [noting, setNoting] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setDrawer(null), [pathname, dev.drawers]);
  useEdgeSwipe(dev.drawers, drawer, setDrawer);
  const shell = useMemo<Shell>(() => ({ drawer, setDrawer, openNote: () => setNoting(true), openSearch }), [drawer, openSearch]);
  const drawersRef = useRef(dev.drawers);
  drawersRef.current = dev.drawers;

  const navigate = useNavigate();
  const switchMode = useSwitchMode(projectId);
  const run = useRef<(action: ActionId) => void>(() => {});
  run.current = (action) => {
    const { mode } = studio.session(projectId);
    if (action === 'search') setSearching(true);
    else if ((action === 'toggle-left' || action === 'toggle-right') && drawersRef.current) {
      const side: DrawerSide = action === 'toggle-left' ? 'left' : 'right';
      setDrawer((current) => (current === side ? null : side));
    } else if (action === 'toggle-left' || action === 'toggle-right') {
      const slot = slotOf(writing ? 'writing' : 'pages', action === 'toggle-left' ? 'left' : 'right');
      studio.updateDock(projectId, mode, slot, { open: !studio.layout(projectId)[mode][slot].open });
    } else if (action === 'next-mode') switchMode(MODES[(MODES.indexOf(mode) + 1) % MODES.length]);
    else if (action === 'focus') setPrefs({ focus: !getPrefs().focus });
    else if (action === 'snapshot') navigate(`/project/${projectId}/progression`);
    else switchMode(action.slice(5) as Mode);
  };

  // Every shortcut is the author's to rebind; this only looks up what the key press is bound to.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = actionFor(studio.shortcuts(), comboOf(e));
      if (!action) return;
      e.preventDefault();
      run.current(action);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!exists) return;
    // Recompute on entry so the dashboard never shows stale totals.
    void projects.markOpened(projectId).then(() => projects.recomputeStats(projectId)).catch(() => {});
  }, [exists, projectId]);

  if (project === undefined) return null;
  if (project === null) {
    return (
      <div className="page">
        <div className="empty">
          <h2>Project not found</h2>
          <p className="muted">It may have been deleted, or the link is wrong.</p>
          <Link to="/" className="btn primary">
            Back to library
          </Link>
        </div>
      </div>
    );
  }

  // What this person's role lets them open and change here.
  const page = pathname.split('/')[3] ?? '';
  if (!pageAllowed(me.role, page)) return <Navigate to={`/project/${project.id}/manuscript`} replace />;
  const writes = can(me.role, 'write');
  // A page shown to someone who may read it but not change it: everything that can be typed into is switched off.
  // Buttons still work, for opening and moving about; one that would change something is refused by the database.
  const readOnly = !writes && !['team', 'studio'].includes(page);

  const searchKey = displayCombo(shortcuts.search);
  const searchDialog = (
    <>
      {searching && <ProjectSearch projectId={project.id} projectTitle={project.title} onClose={() => setSearching(false)} />}
      {noting && writes && <QuickNote projectId={project.id} onClose={() => setNoting(false)} />}
    </>
  );

  // The reader preview, like the writing screen, has the whole window to itself.
  if (writing || reading) {
    return (
      <ProjectContext.Provider value={project}>
        <CategoriesProvider projectId={project.id}>
          <SearchContext.Provider value={openSearch}>
            <ShellContext.Provider value={shell}>
              <Outlet />
              {searchDialog}
            </ShellContext.Provider>
          </SearchContext.Provider>
        </CategoriesProvider>
      </ProjectContext.Provider>
    );
  }

  return (
    <ProjectContext.Provider value={project}>
      <CategoriesProvider projectId={project.id}>
      <SearchContext.Provider value={openSearch}>
      <ShellContext.Provider value={shell}>
      <div className="workspace" data-drawers={dev.drawers || undefined} style={{ '--accent': project.accent } as React.CSSProperties}>
        {dev.drawers && <AppBar projectId={project.id} title={project.title} />}
        <Dock
          projectId={project.id}
          side="left"
          host="pages"
          className="sidebar"
          label="Left panel"
          controls="bottom"
          open={dev.drawers ? drawer === 'left' : undefined}
          onClose={dev.drawers ? () => setDrawer(null) : undefined}
          resizable={!dev.drawers}
          // Standard on the left is the app's own navigation.
          render={(kind) => (kind === 'auto' ? <NavPanel projectId={project.id} /> : undefined)}
          header={
            <>
              <Link to="/" className="back">
                ← Library
              </Link>
              <div className="sidebar-title">
                <strong>{project.title}</strong>
                <TimelineTag projectId={project.id} />
                {project.author && <span className="muted">{project.author}</span>}
                {me.role !== 'owner' && <span className="badge role-badge">Shared with you · {ROLE_LABELS[me.role]}</span>}
              </div>
              <button type="button" className="search-open" onClick={openSearch}>
                <span>Search project…</span>
                <kbd>{searchKey}</kbd>
              </button>
              {dev.form === 'phone' && (
                <label className="field">
                  <span>Workspace</span>
                  <select value={activeMode} aria-label="Workspace" onChange={(e) => switchMode(e.target.value as Mode)}>
                    {MODES.map((key) => (
                      <option key={key} value={key}>
                        {MODE_LABELS[key]}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          }
        />
        <main className="workspace-main">
          <StudioBar projectId={project.id} target={project.targetWordCount} />
          <Trail projectId={project.id} />
          {readOnly ? (
            <>
              <p className="readonly-note" role="status">
                You are here as {ROLE_LABELS[me.role]}: this page is for reading.{can(me.role, 'suggest') ? ' Use Comments or Suggest an edit to propose a change.' : ''}
              </p>
              <ReadOnlyScope active>
                <Outlet />
              </ReadOnlyScope>
            </>
          ) : (
            <Outlet />
          )}
        </main>
        <Dock
          projectId={project.id}
          side="right"
          host="pages"
          className="dock-shell-right"
          label="Right panel"
          render={() => undefined}
          open={dev.drawers ? drawer === 'right' : undefined}
          onClose={dev.drawers ? () => setDrawer(null) : undefined}
          resizable={!dev.drawers}
        />
        {dev.drawers && drawer && <div className="ms-backdrop" onClick={() => setDrawer(null)} />}
        {dev.form === 'phone' && <TabBar projectId={project.id} pages={(name) => pageAllowed(me.role, name)} notes={writes} />}
      </div>
      {searchDialog}
      </ShellContext.Provider>
      </SearchContext.Provider>
      </CategoriesProvider>
    </ProjectContext.Provider>
  );
}
