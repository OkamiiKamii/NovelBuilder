import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { manuscript } from '@/core';
import type { SearchArrival } from '@/modules/search/components/ProjectSearch';
import { useCurrentProject } from '@/modules/workspace/WorkspaceLayout';
import { ConfirmDialog } from '@/shared/ConfirmDialog';
import { formatNumber } from '@/shared/format';
import { Modal } from '@/shared/Modal';
import { useMediaQuery } from '@/shared/useMediaQuery';
import { NodeDetails, StatusSelect } from '../components/NodeDetails';
import { useCollapsed, useStory } from '../hooks';
import { childKinds, dropAt, flatten, isDocument, moveError, pathTo, siblingsOf, subtreeIds, type DropTarget, type TreeNode } from '../tree';
import { GROUP_KINDS, KIND_LABELS, NODE_STATUSES, STATUS_LABELS, type NodeKind, type NodeStatus, type StoryNode } from '../types';

const plural = (n: number, word: string) => `${formatNumber(n)} ${word}${n === 1 ? '' : 's'}`;

export function OrganizerPage() {
  const project = useCurrentProject();
  const ms = useMemo(() => manuscript.forProject(project.id), [project.id]);
  const { nodes, tree } = useStory(ms);
  const { collapsed, toggle, expand, setAll } = useCollapsed(project.id);
  const isMobile = useMediaQuery('(max-width: 900px)');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ targetId: string | null; to: DropTarget } | null>(null);
  const [deleting, setDeleting] = useState<TreeNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<NodeStatus | null>(null);

  const all = nodes ?? [];

  // Arriving from a search result: select the item and unfold the path to it.
  const routerLocation = useLocation();
  const arriving = (routerLocation.state as SearchArrival | null)?.select;
  const loaded = nodes !== undefined;
  useEffect(() => {
    if (!arriving || !loaded) return;
    setSelectedId(arriving);
    for (const ancestor of pathTo(all, arriving).slice(0, -1)) expand(ancestor.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arriving, loaded, routerLocation.key]);
  const everything = useMemo(() => flatten(tree), [tree]);
  // With a status filter on, show matching chapters and scenes plus the path that leads to each.
  const matching = useMemo(() => {
    if (!statusFilter) return null;
    const keep = new Set<string>();
    const visit = (item: TreeNode): boolean => {
      const inside = item.children.map(visit).some(Boolean);
      const hit = isDocument(item.node.kind) && item.node.status === statusFilter;
      if (hit || inside) keep.add(item.node.id);
      return hit || inside;
    };
    tree.forEach(visit);
    return keep;
  }, [tree, statusFilter]);
  const rows = useMemo(() => (matching ? flatten(tree).filter((t) => matching.has(t.node.id)) : flatten(tree, collapsed)), [tree, collapsed, matching]);
  const documents = all.filter((n) => isDocument(n.kind));
  const selected = everything.find((t) => t.node.id === selectedId);
  const count = (kind: NodeKind) => all.filter((n) => n.kind === kind).length;
  const totalWords = tree.reduce((n, t) => n + t.totalWords, 0);
  const editorHref = (id: string) => `/project/${project.id}/manuscript/${id}`;

  const fail = (err: unknown) => setError(err instanceof Error ? err.message : 'Something went wrong.');
  const run = (task: () => Promise<unknown>) => task().then(() => setError(null), fail);

  const add = (kind: NodeKind, parentId: string | null) =>
    run(async () => {
      const node = await ms.create(kind, parentId);
      expand(parentId);
      setSelectedId(node.id);
    });

  const endDrag = () => {
    setDragId(null);
    setDrop(null);
  };

  const dragProps = (node: StoryNode) => ({
    // Reordering a partial, filtered list would be misleading, so dragging waits until the filter is cleared.
    draggable: !statusFilter,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.setData('text/plain', node.id);
      e.dataTransfer.effectAllowed = 'move';
      setDragId(node.id);
    },
    onDragEnd: endDrag,
    onDragOver: (e: DragEvent) => {
      if (!dragId) return;
      const box = e.currentTarget.getBoundingClientRect();
      const to = dropAt(all, dragId, node.id, (e.clientY - box.top) / box.height);
      if (to) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }
      if (to?.zone !== (drop?.targetId === node.id ? drop.to.zone : undefined)) setDrop(to ? { targetId: node.id, to } : null);
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      if (dragId && drop) {
        const { parentId, beforeId } = drop.to;
        void run(() => ms.move(dragId, parentId, beforeId));
        expand(parentId);
      }
      endDrag();
    },
  });

  const canDropAtTop = dragId !== null && moveError(all, dragId, null) === null;

  const details = selected && (
    <NodeDetails
      key={selected.node.id}
      node={selected.node}
      nodes={all}
      totalWords={selected.totalWords}
      ms={ms}
      mode="full"
      onError={fail}
      editorHref={editorHref(selected.node.id)}
    />
  );

  return (
    <div className="stack organizer">
      <header className="page-header">
        <div>
          <h1>Organizer</h1>
          <p className="muted">
            {plural(totalWords, 'word')} · {plural(count('chapter'), 'chapter')} · {plural(count('scene'), 'scene')}
          </p>
        </div>
        <div className="actions wrap">
          {all.some((n) => subtreeIds(all, n.id).length > 1) && (
            <>
              <button type="button" className="btn ghost" onClick={() => setAll([])}>
                Expand all
              </button>
              <button type="button" className="btn ghost" onClick={() => setAll(everything.filter((t) => t.children.length).map((t) => t.node.id))}>
                Collapse all
              </button>
            </>
          )}
          <details className="menu inline">
            <summary className="btn">+ Volume / Act / Arc</summary>
            <div className="menu-items">
              {GROUP_KINDS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={(e) => {
                    e.currentTarget.closest('details')?.removeAttribute('open');
                    void add(kind, null);
                  }}
                >
                  New {kind}
                </button>
              ))}
            </div>
          </details>
          <button type="button" className="btn primary" onClick={() => add('chapter', null)}>
            + Chapter
          </button>
        </div>
      </header>

      {error && (
        <p className="notice error" role="alert">
          {error}
          <button type="button" className="btn ghost icon" onClick={() => setError(null)} aria-label="Dismiss">
            ✕
          </button>
        </p>
      )}

      {documents.length > 0 && (
        <div className="pipeline" role="group" aria-label="Filter by status">
          {NODE_STATUSES.map((status) => {
            const count = documents.filter((n) => n.status === status).length;
            return (
              <button
                key={status}
                type="button"
                className={`status-${status}${statusFilter === status ? ' current' : ''}`}
                aria-pressed={statusFilter === status}
                disabled={count === 0 && statusFilter !== status}
                onClick={() => setStatusFilter(statusFilter === status ? null : status)}
              >
                <strong>{count}</strong> {STATUS_LABELS[status]}
              </button>
            );
          })}
          {statusFilter && (
            <button type="button" className="btn ghost" onClick={() => setStatusFilter(null)}>
              Show all
            </button>
          )}
        </div>
      )}

      {nodes === undefined ? null : all.length === 0 ? (
        <div className="empty">
          <h2>Lay out your story</h2>
          <p className="muted">Group chapters into volumes, acts or arcs, and break chapters into scenes. Start with a chapter, or add a volume first.</p>
          <button type="button" className="btn primary" onClick={() => add('chapter', null)}>
            Add the first chapter
          </button>
        </div>
      ) : (
        <div className="organizer-body">
          <ol className="outline" aria-label="Story structure">
            {rows.map((item) => {
              const { node, children, depth, totalWords: words } = item;
              const siblings = siblingsOf(all, node.parentId);
              const index = siblings.findIndex((n) => n.id === node.id);
              const zone = drop?.targetId === node.id ? drop.to.zone : null;
              const close = (e: React.MouseEvent) => e.currentTarget.closest('details')?.removeAttribute('open');
              const item_ = (label: string, action: () => void, options: { disabled?: boolean; danger?: boolean } = {}) => (
                <button
                  type="button"
                  disabled={options.disabled}
                  className={options.danger ? 'danger-text' : ''}
                  onClick={(e) => {
                    e.stopPropagation();
                    close(e);
                    action();
                  }}
                >
                  {label}
                </button>
              );
              return (
                <li
                  key={node.id}
                  data-node-id={node.id}
                  className={['outline-row', `row-${node.kind}`, node.id === selectedId ? 'selected' : '', node.id === dragId ? 'dragging' : '', zone ? `drop-${zone}` : '', statusFilter && node.status !== statusFilter ? 'dimmed' : ''].join(' ')}
                  style={{ '--depth': depth } as React.CSSProperties}
                  onClick={() => setSelectedId(node.id)}
                  {...dragProps(node)}
                >
                  <span className="grip" aria-hidden="true" title="Drag to reorder">
                    ⠿
                  </span>
                  {children.length > 0 && !statusFilter ? (
                    <button
                      type="button"
                      className="twisty"
                      aria-label={`${collapsed.has(node.id) ? 'Expand' : 'Collapse'} ${node.title}`}
                      aria-expanded={!collapsed.has(node.id)}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle(node.id);
                      }}
                    >
                      {collapsed.has(node.id) ? '▸' : '▾'}
                    </button>
                  ) : (
                    <span className="twisty" />
                  )}
                  <span className={`kind kind-${node.kind}`}>{KIND_LABELS[node.kind]}</span>
                  <span className="outline-title">
                    <strong>{node.title}</strong>
                    {node.summary && <span className="muted small outline-summary">{node.summary}</span>}
                  </span>
                  <span className="outline-meta">
                    <StatusSelect node={node} compact onChange={(changes) => run(() => ms.update(node.id, changes))} />
                    <span className="outline-words" title={children.length ? `Includes everything inside this ${node.kind}` : undefined}>
                      {formatNumber(words)}
                    </span>
                    <details className="menu" onClick={(e) => e.stopPropagation()}>
                      <summary aria-label={`Actions for ${node.title}`}>⋯</summary>
                      <div className="menu-items">
                        {isDocument(node.kind) && (
                          <Link to={editorHref(node.id)} className="menu-link">
                            Open in editor
                          </Link>
                        )}
                        {childKinds(node.kind).map((kind) => (
                          <span key={kind}>{item_(`Add ${kind}`, () => void add(kind, node.id))}</span>
                        ))}
                        {item_('Duplicate', () =>
                          void run(async () => {
                            setSelectedId((await ms.duplicate(node.id)).id);
                          }),
                        )}
                        {item_('Move up', () => void run(() => ms.nudge(node.id, -1)), { disabled: index === 0 })}
                        {item_('Move down', () => void run(() => ms.nudge(node.id, 1)), { disabled: index === siblings.length - 1 })}
                        {item_('Delete…', () => setDeleting(item), { danger: true })}
                      </div>
                    </details>
                  </span>
                </li>
              );
            })}
            {dragId && canDropAtTop && (
              <li
                className={`outline-end${drop?.targetId === null ? ' drop-inside' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (drop?.targetId !== null) setDrop({ targetId: null, to: { parentId: null, beforeId: null, zone: 'inside' } });
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  void run(() => ms.move(dragId, null, null));
                  endDrag();
                }}
              >
                Drop here to move to the end of the top level
              </li>
            )}
          </ol>

          {!isMobile && (
            <aside className="panel organizer-details" aria-label="Details">
              {details ?? <p className="muted">Select a chapter or scene to plan it: objective, beats, who is involved, how it ends.</p>}
            </aside>
          )}
        </div>
      )}

      {isMobile && selected && (
        <Modal title={selected.node.title} onClose={() => setSelectedId(null)}>
          {details}
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.node.kind}`}
          confirmLabel="Delete"
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            const { id } = deleting.node;
            setDeleting(null);
            if (selectedId && subtreeIds(all, id).includes(selectedId)) setSelectedId(null);
            void run(() => ms.remove(id));
          }}
        >
          <p>
            Delete <strong>{deleting.node.title}</strong>
            {deleting.children.length > 0 && ` and the ${plural(subtreeIds(all, deleting.node.id).length - 1, 'item')} inside it`}? This removes{' '}
            {plural(deleting.totalWords, 'word')} of text and cannot be undone.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
