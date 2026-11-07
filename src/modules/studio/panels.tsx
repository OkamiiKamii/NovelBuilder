import { entryPath } from '@/modules/characters/hooks';
import { useMe } from '@/modules/collab/identity';
import { pageAllowed } from '@/modules/sync/access';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { codex, continuity, db, manuscript, plot, relationships } from '@/core';
import { Brainstorm } from '@/modules/assistant/components/Brainstorm';
import { useCategories } from '@/modules/codex/categories';
import { QuickReference } from '@/modules/codex/components/QuickReference';
import { useEnabledModules, useInstalled } from '@/modules/extensions/hooks';
import type { AuditResult } from '@/modules/continuity/audit';
import { SEVERITY_LABELS } from '@/modules/continuity/types';
import { buildTree, flatten, isDocument } from '@/modules/manuscript/tree';
import { OPEN_STATUSES, statusName } from '@/modules/plot/types';
import { useTimeline } from '@/modules/timeline/hooks';
import { WORKSPACE_SECTIONS } from '@/modules/workspace/sections';
import type { Panel } from './store';
import { viewsOn } from '@/modules/visualize/modules';
import { useOpenProject } from '@/modules/workspace/WorkspaceLayout';

/** The app's pages. Shared by the sidebar and by any panel set to show navigation. */
export const PAGES: { to: string; label: string; end?: boolean }[] = [
  { to: '.', label: 'Overview', end: true }, { to: 'dashboard', label: 'Dashboard' }, { to: 'manuscript', label: 'Manuscript' }, { to: 'read', label: 'Reader preview' }, { to: 'organizer', label: 'Organizer' }, { to: 'board', label: 'Scene board' }, { to: 'characters', label: 'Characters' }, { to: 'codex', label: 'Codex' },
  { to: 'progression', label: 'Character progression' }, { to: 'relationships', label: 'Relationships' }, { to: 'timeline', label: 'Timeline' }, { to: 'plot', label: 'Plot threads' }, { to: 'canon', label: 'Canon' },
  { to: 'continuity', label: 'Continuity' }, { to: 'integrity', label: 'Record check' }, { to: 'review', label: 'Continuity review' }, { to: 'consequences', label: 'Consequences' }, { to: 'branches', label: 'Branches' }, { to: 'graph', label: 'Story graph' }, { to: 'visualize', label: 'Visualize' }, { to: 'progress', label: 'Progress' },
  { to: 'assistant', label: 'Assistant' },
  ...WORKSPACE_SECTIONS.map((section) => ({ to: section.path, label: section.label })),
  { to: 'modules', label: 'Modules', end: true }, { to: 'team', label: 'Team' }, { to: 'sync', label: 'Cloud sync' }, { to: 'studio', label: 'Workspace' }, { to: 'export', label: 'Import & Export' }, { to: 'settings', label: 'Settings' },
];

/** Pages that belong to a genre module: shown once a module that brings them is on, or the project already uses them. */
// Systems have no page of their own: they are part of Characters (each profile's System tab, and "Systems" in the library).
const UNLOCKED_BY_MODULES = ['progression'];

export function NavPanel({ projectId }: { projectId: string }) {
  const base = `/project/${projectId}`;
  const modules = useEnabledModules(projectId);
  const installed = useInstalled(projectId);
  // CLEAN CORE RULE: the sidebar only grows by what the project has switched on, or already uses.
  const inUse = useLiveQuery(async () => {
    const [blueprints, snapshots, changes] = await Promise.all([db.systems.where('projectId').equals(projectId).count(), db.progressSnapshots.where('projectId').equals(projectId).count(), db.progressChanges.where('projectId').equals(projectId).count()]);
    // A page whose records exist stays, whatever modules are on: turning a module off never hides what was recorded.
    return { systems: blueprints > 0, progression: blueprints > 0 || snapshots > 0 || changes > 0 };
  }, [projectId]);
  const unlocked = (page: string) => modules.some((m) => m.unlocks.includes(page as never)) || Boolean(inUse?.[page as 'systems' | 'progression']);
  // Each role is shown the pages it can use; the rest are not listed.
  const me = useMe(projectId);
  // Visualize is listed while the novel has any view on (Optional Prompt D): read from the novel the workspace holds, or else from storage.
  const open = useOpenProject();
  const stored = useLiveQuery(() => db.projects.get(projectId), [projectId]);
  const project = open?.id === projectId ? open : stored;
  const pages = PAGES.filter((page) => pageAllowed(me.role, page.to === '.' ? '' : page.to.split('/')[0]) && (!UNLOCKED_BY_MODULES.includes(page.to) || unlocked(page.to)) && (page.to !== 'visualize' || viewsOn(project?.viewsOff).length > 0));
  const link = ({ isActive }: { isActive: boolean }) => (isActive ? 'nav-link active' : 'nav-link');
  return (
    <nav aria-label="Pages">
      {pages.map((page) => (
        <NavLink key={page.to} to={page.to === '.' ? base : `${base}/${page.to}`} end={page.end} className={link}>
          {page.label}
        </NavLink>
      ))}
      {modules.length > 0 && pageAllowed(me.role, 'modules') && (
        <div className="nav-modules" role="group" aria-label="Module tools">
          {modules.map((module) => (
            <NavLink key={module.id} to={`${base}/modules/${module.id}`} className={link}>
              {installed?.find((row) => row.moduleId === module.id)?.settings?.nav || module.nav || module.name}
            </NavLink>
          ))}
        </div>
      )}
    </nav>
  );
}

function ChaptersPanel({ projectId }: { projectId: string }) {
  const nodes = useLiveQuery(() => manuscript.forProject(projectId).list(), [projectId]);
  if (!nodes) return null;
  const tree = flatten(buildTree(nodes));
  if (!tree.length) return <p className="muted small">No chapters yet.</p>;
  return (
    <ul className="dock-list" aria-label="Chapters and scenes">
      {tree.map(({ node, depth, totalWords }) => (
        <li key={node.id} style={{ paddingLeft: depth * 12 }} className={isDocument(node.kind) ? '' : 'dock-group'}>
          {isDocument(node.kind) ? <Link to={`/project/${projectId}/manuscript/${node.id}`}>{node.title}</Link> : <span>{node.title}</span>}
          <span className="muted small">{totalWords}</span>
        </li>
      ))}
    </ul>
  );
}

function CodexTreePanel({ projectId }: { projectId: string }) {
  const entries = useLiveQuery(() => codex.forProject(projectId).list(), [projectId]);
  const { list } = useCategories();
  if (!entries) return null;
  if (!entries.length) return <p className="muted small">No characters or entries yet.</p>;
  return (
    <div className="dock-tree" aria-label="Worldbuilding tree">
      {list.filter((category) => entries.some((e) => e.category === category.key)).map((category) => (
        <details key={category.key} open>
          <summary>
            {category.name} <span className="muted small">{entries.filter((e) => e.category === category.key).length}</span>
          </summary>
          <ul className="dock-list">
            {entries.filter((e) => e.category === category.key).sort((a, b) => a.name.localeCompare(b.name)).map((entry) => (
              <li key={entry.id}>
                <Link to={entryPath(projectId, entry)}>{entry.name}</Link>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}

function ThreadsPanel({ projectId }: { projectId: string }) {
  const threads = useLiveQuery(() => plot.forProject(projectId).list(), [projectId]);
  if (!threads) return null;
  if (!threads.length) return <p className="muted small">No plot threads yet.</p>;
  const sorted = [...threads].sort((a, b) => Number(OPEN_STATUSES.includes(b.status)) - Number(OPEN_STATUSES.includes(a.status)) || a.title.localeCompare(b.title));
  return (
    <ul className="dock-list" aria-label="Plot threads">
      {sorted.map((thread) => (
        <li key={thread.id}>
          <Link to={`/project/${projectId}/plot?thread=${thread.id}`}>{thread.title}</Link>
          <span className={`thread-status st-${thread.status}`}>{statusName(thread)}</span>
        </li>
      ))}
    </ul>
  );
}

function ReferencePanel({ projectId }: { projectId: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return <QuickReference projectId={projectId} openId={openId} onOpen={setOpenId} />;
}

/** A scratchpad for the project, kept on this device. It is not part of the manuscript or the Codex. */
function NotesPanel({ projectId }: { projectId: string }) {
  const key = `novel-builder:scratch:${projectId}`;
  const [text, setText] = useState(() => {
    try {
      return localStorage.getItem(key) ?? '';
    } catch {
      return '';
    }
  });
  return (
    <textarea
      className="dock-notes"
      value={text}
      aria-label="Notes"
      placeholder="Loose notes for this project. Kept on this device."
      onChange={(e) => {
        setText(e.target.value);
        try {
          localStorage.setItem(key, e.target.value);
        } catch {
          // kept for this visit only
        }
      }}
    />
  );
}

function TimelinePanel({ projectId }: { projectId: string }) {
  const { placed, loading } = useTimeline(projectId);
  if (loading) return null;
  if (!placed.length) return <p className="muted small">No timeline events yet.</p>;
  return (
    <ol className="dock-list" aria-label="Timeline">
      {placed.map(({ event, label }) => (
        <li key={event.id} className="dock-stacked">
          <Link to={`/project/${projectId}/timeline?event=${event.id}`}>{event.name}</Link>
          <span className="muted small">{label}</span>
        </li>
      ))}
    </ol>
  );
}

function RelationshipsPanel({ projectId }: { projectId: string }) {
  const relations = useLiveQuery(() => relationships.forProject(projectId).list(), [projectId]);
  const entries = useLiveQuery(() => codex.forProject(projectId).list(), [projectId]);
  const [who, setWho] = useState('');
  if (!relations || !entries) return null;
  const involved = entries.filter((e) => relations.some((r) => r.fromId === e.id || r.toId === e.id)).sort((a, b) => a.name.localeCompare(b.name));
  if (!involved.length) return <p className="muted small">No relationships recorded yet.</p>;
  const focus = involved.find((e) => e.id === who) ?? involved[0];
  const mine = relations.filter((r) => r.fromId === focus.id || r.toId === focus.id);
  return (
    <div className="stack">
      <select value={focus.id} aria-label="Relationships of" onChange={(e) => setWho(e.target.value)}>
        {involved.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.name}
          </option>
        ))}
      </select>
      <ul className="dock-list" aria-label={`Relationships of ${focus.name}`}>
        {mine.map((relation) => {
          const other = entries.find((e) => e.id === (relation.fromId === focus.id ? relation.toId : relation.fromId));
          const stage = relation.stages.at(-1);
          return (
            <li key={relation.id} className="dock-stacked">
              <Link to={`/project/${projectId}/relationships?rel=${relation.id}`}>{other?.name ?? 'Someone'}</Link>
              <span className="muted small">{stage ? stage.title.trim() || stage.label : ''}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ContinuityPanel({ projectId }: { projectId: string }) {
  const [result, setResult] = useState<AuditResult | null>(null);
  const [runs, setRuns] = useState(0);
  useEffect(() => {
    let alive = true;
    continuity.forProject(projectId).run().then((r) => alive && setResult(r), () => alive && setResult(null));
    return () => {
      alive = false;
    };
  }, [projectId, runs]);
  if (!result) return null;
  return (
    <div className="stack">
      <div className="toolbar">
        <span className="muted small">{result.open.length === 0 ? 'No open issues' : `${result.open.length} open ${result.open.length === 1 ? 'issue' : 'issues'}`}</span>
        <button type="button" className="btn" onClick={() => setRuns((n) => n + 1)}>
          Check again
        </button>
      </div>
      <ul className="dock-list" aria-label="Continuity alerts">
        {result.open.slice(0, 40).map((issue) => (
          <li key={issue.key} className="dock-stacked">
            <span>
              <span className={`thread-status sev-${issue.severity}`}>{SEVERITY_LABELS[issue.severity]}</span>{' '}
              <Link to={`/project/${projectId}/manuscript/${issue.nodeId}`} state={{ jump: { term: issue.match, block: issue.block } }}>
                {issue.nodeTitle}, paragraph {issue.block + 1}
              </Link>
            </span>
            <span className="small">{issue.message}</span>
          </li>
        ))}
      </ul>
      <Link to={`/project/${projectId}/continuity`} className="small">
        Open the continuity dashboard
      </Link>
    </div>
  );
}

/** The content of a side panel. `auto` is resolved by whoever hosts the panel. */
export function PanelContent({ kind, projectId }: { kind: Exclude<Panel, 'auto'>; projectId: string }) {
  switch (kind) {
    case 'nav':
      return <NavPanel projectId={projectId} />;
    case 'chapters':
      return <ChaptersPanel projectId={projectId} />;
    case 'codex':
      return <CodexTreePanel projectId={projectId} />;
    case 'threads':
      return <ThreadsPanel projectId={projectId} />;
    case 'reference':
      return <ReferencePanel projectId={projectId} />;
    case 'notes':
      return <NotesPanel projectId={projectId} />;
    case 'timeline':
      return <TimelinePanel projectId={projectId} />;
    case 'relationships':
      return <RelationshipsPanel projectId={projectId} />;
    case 'assistant':
      return <Brainstorm projectId={projectId} compact />;
    default:
      return <ContinuityPanel projectId={projectId} />;
  }
}
