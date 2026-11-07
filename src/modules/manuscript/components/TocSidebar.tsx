import { useState } from 'react';
import { TimelineTag } from '@/modules/branching/hooks';
import { Link } from 'react-router-dom';
import { useOpenSearch } from '@/modules/workspace/WorkspaceLayout';
import { formatNumber } from '@/shared/format';
import type { ProjectManuscript } from '../service';
import { flatten, isDocument, pathTo, type TreeNode } from '../tree';
import { STATUS_LABELS, type StoryNode } from '../types';

interface TocSidebarProps {
  projectId: string;
  projectTitle: string;
  nodes: StoryNode[];
  tree: TreeNode[];
  activeId: string | undefined;
  collapsed: ReadonlySet<string>;
  onToggle: (id: string) => void;
  ms: ProjectManuscript;
  onOpen: (nodeId: string | null) => void;
  onClose: () => void;
}

/** Table of contents for the writing screen: jump anywhere, add the next chapter or scene. */
export function TocSidebar({ projectId, projectTitle, nodes, tree, activeId, collapsed, onToggle, ms, onOpen, onClose }: TocSidebarProps) {
  const [filter, setFilter] = useState('');
  const openSearch = useOpenSearch();
  const [error, setError] = useState<string | null>(null);
  const needle = filter.trim().toLowerCase();
  const total = tree.reduce((n, t) => n + t.totalWords, 0);
  const href = (id: string) => `/project/${projectId}/manuscript/${id}`;

  const active = nodes.find((n) => n.id === activeId);
  const activeChapter = active?.kind === 'scene' ? nodes.find((n) => n.id === active.parentId) : active?.kind === 'chapter' ? active : undefined;

  const add = (task: () => Promise<StoryNode>) =>
    task().then(
      (node) => {
        setError(null);
        onOpen(node.id);
      },
      (err) => setError(err instanceof Error ? err.message : 'Something went wrong.'),
    );

  const rows = needle
    ? flatten(tree).filter((t) => isDocument(t.node.kind) && t.node.title.toLowerCase().includes(needle))
    : flatten(tree, collapsed);

  return (
    <>
      <div className="ms-nav-head">
        <Link to={`/project/${projectId}`} className="back">
          ← {projectTitle}
        </Link>
        <TimelineTag projectId={projectId} />
        <button type="button" className="tool" aria-label="Hide contents" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="ms-nav-title">
        <strong>Contents</strong>
        <span className="muted small">{formatNumber(total)} words</span>
      </div>
      <input type="search" value={filter} placeholder="Jump to…" aria-label="Jump to chapter or scene" onChange={(e) => setFilter(e.target.value)} />
      {error && (
        <p className="error small" role="alert">
          {error}
        </p>
      )}
      <ol className="toc">
        {rows.map(({ node, children, depth, totalWords }) => {
          const label = (
            <>
              {isDocument(node.kind) && <span className={`status-dot status-${node.status}`} title={STATUS_LABELS[node.status]} aria-label={STATUS_LABELS[node.status]} role="img" />}
              <span className="toc-name">{node.title}</span>
              <span className="muted small">{formatNumber(totalWords)}</span>
            </>
          );
          return (
            <li key={node.id} className={`toc-${node.kind}${node.id === activeId ? ' active' : ''}`} style={{ paddingLeft: needle ? 0 : depth * 14 }}>
              {children.length > 0 && !needle ? (
                <button type="button" className="twisty" aria-label={`${collapsed.has(node.id) ? 'Expand' : 'Collapse'} ${node.title}`} aria-expanded={!collapsed.has(node.id)} onClick={() => onToggle(node.id)}>
                  {collapsed.has(node.id) ? '▸' : '▾'}
                </button>
              ) : (
                <span className="twisty" />
              )}
              {isDocument(node.kind) ? (
                <Link to={href(node.id)} onClick={() => onOpen(node.id)} aria-current={node.id === activeId ? 'page' : undefined} title={needle ? pathTo(nodes, node.id).map((n) => n.title).join(' › ') : undefined}>
                  {label}
                </Link>
              ) : (
                <button type="button" className="toc-group" onClick={() => onToggle(node.id)}>
                  {label}
                </button>
              )}
            </li>
          );
        })}
        {needle && rows.length === 0 && <li className="muted small">Nothing matches.</li>}
      </ol>
      <div className="toc-actions">
        <button type="button" className="btn" onClick={() => add(() => ms.create('chapter', activeChapter?.parentId ?? null))}>
          + Chapter
        </button>
        <button type="button" className="btn" disabled={!activeChapter} title={activeChapter ? `Add a scene to ${activeChapter.title}` : 'Open a chapter first'} onClick={() => add(() => ms.create('scene', activeChapter!.id))}>
          + Scene
        </button>
      </div>
      <div className="toc-actions">
        <button type="button" className="btn ghost" aria-label="Search project" title="Search the whole project" onClick={openSearch}>
          Search…
        </button>
        <Link to={`/project/${projectId}/organizer`} className="btn ghost">
          Organize…
        </Link>
      </div>
    </>
  );
}
