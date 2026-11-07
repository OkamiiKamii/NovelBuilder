import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { manuscript } from '@/core';
import type { SearchArrival } from '@/modules/search/components/ProjectSearch';
import { useCurrentProject } from '@/modules/workspace/WorkspaceLayout';
import { Dock, StudioBar } from '@/modules/studio/Dock';
import { studio, useStudio } from '@/modules/studio/store';
import { ReadOnlyScope } from '@/modules/collab/components/ReadOnly';
import { useMe } from '@/modules/collab/identity';
import { can } from '@/modules/sync/access';
import { FloatingCard } from '@/modules/platform/components/Shell';
import { useDevice } from '@/modules/platform/device';
import { useShell } from '@/modules/platform/shell';
import { ChapterEditor, EditorBar, type EditorControl } from '../components/ChapterEditor';
import { SidePanel } from '../components/SidePanel';
import { TocSidebar } from '../components/TocSidebar';
import { useCollapsed, useStory } from '../hooks';
import { getLastChapter, setLastChapter, setPrefs, usePrefs } from '../preferences';
import { flatten, isDocument, pathTo } from '../tree';

const FONT_STACKS = {
  serif: "'Iowan Old Style', Palatino, 'Palatino Linotype', Georgia, serif",
  sans: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  mono: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
};
const WIDTHS = { narrow: '34rem', medium: '42rem', wide: '56rem', full: 'none' };

export function ManuscriptPage() {
  const project = useCurrentProject();
  const { chapterId } = useParams();
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const arrival = routerLocation.state as SearchArrival | null;
  const prefs = usePrefs();
  const dev = useDevice();
  const isMobile = dev.drawers;
  // What this person's role lets them do with the text, and whether they have plans and lore to look at beside it.
  const me = useMe(project.id);
  const access = can(me.role, 'write') ? 'write' : can(me.role, 'suggest') ? 'suggest' : 'read';
  const noPanel = !can(me.role, 'readPlanning');
  const shell = useShell();

  // Bound to this project: nothing here can address another project's nodes.
  const ms = useMemo(() => manuscript.forProject(project.id), [project.id]);
  const { nodes, tree } = useStory(ms);
  const { collapsed, toggle, expand } = useCollapsed(project.id);
  const control = useRef<EditorControl | null>(null);
  const [inspected, setInspected] = useState<string | null>(null);

  // On small screens the side areas are drawers that start closed and are never persisted.
  const drawer = shell.drawer === 'left' ? 'nav' : shell.drawer === 'right' ? 'panel' : null;
  const setDrawer = (next: 'nav' | 'panel' | null) => shell.setDrawer(next === 'nav' ? 'left' : next === 'panel' ? 'right' : null);
  // A tablet looks things up on a card that floats over the page.
  const [floating, setFloating] = useState<string | null>(null);
  // Elsewhere the two side panels belong to the current workspace: which is open, how wide, and what it shows.
  const { mode, current } = useStudio(project.id);
  const navOpen = isMobile ? drawer === 'nav' : current.writeLeft.open;
  const panelOpen = !noPanel && (isMobile ? drawer === 'panel' : current.writeRight.open);
  const toggleNav = () => (isMobile ? setDrawer(drawer === 'nav' ? null : 'nav') : studio.updateDock(project.id, mode, 'writeLeft', { open: !current.writeLeft.open }));
  const togglePanel = () => (isMobile ? setDrawer(drawer === 'panel' ? null : 'panel') : studio.updateDock(project.id, mode, 'writeRight', { open: !current.writeRight.open }));
  /** Brings up the writing tools on the right, on the tab asked for. */
  const showTools = (panelTab: 'notes' | 'codex') => {
    setPrefs({ panelTab });
    // A drawer is not part of the saved layout: only what the panel shows is set, and only if it has to change.
    if (!isMobile) studio.updateDock(project.id, mode, 'writeRight', { open: true, kind: 'auto' });
    else if (current.writeRight.kind !== 'auto') studio.updateDock(project.id, mode, 'writeRight', { kind: 'auto' });
    if (isMobile) setDrawer('panel');
  };

  const base = `/project/${project.id}/manuscript`;
  const documents = useMemo(() => flatten(tree).filter((t) => isDocument(t.node.kind)), [tree]);
  const location = chapterId && nodes ? pathTo(nodes, chapterId).slice(0, -1).map((n) => n.title).join(' › ') : '';
  const openNode = nodes?.find((n) => n.id === chapterId);
  const parentId = openNode?.parentId ?? null;

  useEffect(() => {
    if (chapterId) return setLastChapter(project.id, chapterId);
    if (!documents.length) return;
    const last = getLastChapter(project.id);
    const target = documents.find((t) => t.node.id === last) ?? documents[0];
    navigate(`${base}/${target.node.id}`, { replace: true });
  }, [chapterId, documents, project.id, base, navigate]);

  // Keep the open chapter or scene visible in the contents.
  useEffect(() => {
    expand(parentId);
  }, [parentId, expand]);

  // Arriving from a search result for a note or summary: show the notes panel.
  useEffect(() => {
    if (arrival?.panel !== 'notes') return;
    showTools('notes');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routerLocation.key]);

  const jump = useMemo(() => (arrival?.jump ? { ...arrival.jump, key: routerLocation.key } : null), [arrival, routerLocation.key]);

  const mention = useMemo(() => (arrival?.mention ? { entryId: arrival.mention, key: routerLocation.key } : null), [arrival, routerLocation.key]);

  /** Shows a codex entry beside the text, without leaving the chapter. */
  const inspect = (entryId: string) => {
    if (noPanel) return;
    if (dev.form === 'tablet' && !panelOpen) return setFloating(entryId);
    setInspected(entryId);
    showTools('codex');
  };

  const open = (id: string | null) => {
    setDrawer(null);
    navigate(id ? `${base}/${id}` : base);
  };

  const style = {
    '--write-font': FONT_STACKS[prefs.font],
    '--write-size': `${prefs.fontSize}px`,
    '--write-leading': prefs.lineHeight,
    '--write-gap': `${prefs.paragraphSpacing}em`,
    '--write-width': WIDTHS[prefs.width],
  } as CSSProperties;

  const chrome = { panelOpen, noPanel, onToggleNav: toggleNav, onTogglePanel: togglePanel, onLore: () => showTools('codex') };

  return (
    <div className="ms" data-theme={prefs.theme} data-focus={prefs.focus || undefined} style={style}>
      <StudioBar projectId={project.id} target={project.targetWordCount} writing />
      <Dock
        projectId={project.id}
        side="left"
        host="writing"
        className="ms-nav"
        label="Contents"
        controls="bottom"
        open={navOpen}
        onClose={toggleNav}
        resizable={!isMobile}
        // While writing, Standard on the left is the chapter list, with its tools for adding and jumping.
        render={(kind) =>
          kind === 'auto' || kind === 'chapters' ? (
            // Someone who cannot change the book still finds their way around it: the links work, the tools for adding do not.
            <ReadOnlyScope active={access !== 'write'} className="toc-scope">
              <TocSidebar projectId={project.id} projectTitle={project.title} nodes={nodes ?? []} tree={tree} activeId={chapterId} collapsed={collapsed} onToggle={toggle} ms={ms} onOpen={open} onClose={toggleNav} />
            </ReadOnlyScope>
          ) : undefined
        }
      />

      {chapterId ? (
        <ChapterEditor key={chapterId} mode={access} chapterId={chapterId} ms={ms} prefs={prefs} location={location} draft={openNode?.branchName ?? null} control={control} jump={jump} mention={mention} onInspect={inspect} {...chrome} />
      ) : (
        <section className="ms-center">
          <EditorBar {...chrome} />
          {nodes && documents.length === 0 && access !== 'write' && (
            <div className="ms-empty">
              <h2>Nothing to read yet</h2>
              <p className="muted">{me.role === 'viewer' ? 'No chapter has been marked Final or Published yet.' : 'This manuscript has no chapters yet.'}</p>
            </div>
          )}
          {nodes && documents.length === 0 && access === 'write' && (
            <div className="ms-empty">
              <h2>Start writing</h2>
              <p className="muted">This manuscript has no chapters yet.</p>
              <button type="button" className="btn primary" onClick={async () => open((await ms.create('chapter')).id)}>
                Create the first chapter
              </button>
            </div>
          )}
        </section>
      )}

      {!noPanel && <Dock
        projectId={project.id}
        side="right"
        host="writing"
        className="ms-panel"
        label="Plan and reference"
        controls="bottom"
        open={panelOpen}
        onClose={togglePanel}
        resizable={!isMobile}
        // Standard on the right is the writing tools: plan, other chapters, history and the Codex.
        render={(kind) =>
          kind === 'auto' ? <SidePanel readOnly={access !== 'write'} projectId={project.id} prefs={prefs} nodes={nodes ?? []} tree={tree} nodeId={chapterId} ms={ms} control={control} codexEntry={inspected} onCodexEntry={setInspected} onClose={togglePanel} /> : undefined
        }
      />}

      {floating && (
        <FloatingCard
          projectId={project.id}
          entryId={floating}
          onEntry={(entryId) => (entryId ? setFloating(entryId) : setFloating(null))}
          onClose={() => setFloating(null)}
          onDock={() => {
            setInspected(floating);
            setFloating(null);
            showTools('codex');
          }}
        />
      )}
      {isMobile && drawer && <div className="ms-backdrop" onClick={() => setDrawer(null)} />}
    </div>
  );
}
