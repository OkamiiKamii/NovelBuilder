import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { codex, manuscript } from '@/core';
import { useCategories } from '@/modules/codex/categories';
import { filledFields } from '@/modules/codex/schema';
import { buildTree, flatten, isDocument, isGroup } from '@/modules/manuscript/tree';
import { STATUS_LABELS } from '@/modules/manuscript/types';
import { useRelationships } from '@/modules/relationships/hooks';
import { AFFINITY_LABELS } from '@/modules/relationships/types';
import { formatDuration } from '@/modules/timeline/chronology';
import { useTimeline } from '@/modules/timeline/hooks';
import { IMPORTANCE_LABELS } from '@/modules/timeline/types';
import { useCurrentProject } from '@/modules/workspace/WorkspaceLayout';
import { formatNumber } from '@/shared/format';
import { buildGraph, clusterLeaves, CLUSTER_ABOVE, describe, filterGraph, GROUP_LABELS, type Graph, type GraphEdge, type GraphFilter, type GraphNode } from './build';
import { GraphCanvas, type GraphHandle, type GraphView } from './GraphCanvas';

interface Saved extends GraphView {
  hidden: Set<string>;
  relationships: boolean;
  scope: GraphFilter['scope'];
  expanded: Set<string>;
  focusId: string | null;
  edgeId: string | null;
}
/** What the author was looking at in each project, kept for the session, so leaving to edit something and coming back changes nothing. */
const saved = new Map<string, Saved>();

const KIND_WORDS: Record<string, string> = { relationship: 'Character relationship', related: 'Related entries', field: 'Field', appears: 'Manuscript', event: 'Timeline', sequence: 'Timeline order', structure: 'Structure' };

export function GraphPage() {
  const project = useCurrentProject();
  const categories = useCategories();
  const { relations, entries, order } = useRelationships(project.id);
  const { placed: events, nodes: storyNodes } = useTimeline(project.id);
  const links = useLiveQuery(() => codex.forProject(project.id).links(), [project.id]);
  const plans = useLiveQuery(() => manuscript.forProject(project.id).plans(), [project.id]);
  const canvas = useRef<GraphHandle>(null);

  const memory = useMemo(() => {
    if (!saved.has(project.id)) saved.set(project.id, { positions: new Map(), pinned: new Set(), transform: null, hidden: new Set(), relationships: true, scope: null, expanded: new Set(), focusId: null, edgeId: null });
    return saved.get(project.id)!;
  }, [project.id]);
  const [hidden, setHiddenState] = useState(memory.hidden);
  const [relationships, setRelationshipsState] = useState(memory.relationships);
  const [scope, setScopeState] = useState(memory.scope);
  const [expanded, setExpandedState] = useState(memory.expanded);
  const [focusId, setFocusState] = useState(memory.focusId);
  const [edgeId, setEdgeState] = useState(memory.edgeId);
  // Each setter also updates the remembered view.
  const setHidden = (v: Set<string>) => setHiddenState((memory.hidden = v));
  const setRelationships = (v: boolean) => setRelationshipsState((memory.relationships = v));
  const setScope = (v: GraphFilter['scope']) => setScopeState((memory.scope = v));
  const setExpanded = (v: Set<string>) => setExpandedState((memory.expanded = v));
  const select = (nodeId: string | null, edge: string | null = null) => {
    setFocusState((memory.focusId = nodeId));
    setEdgeState((memory.edgeId = edge));
  };

  const ready = links !== undefined && plans !== undefined;
  const full = useMemo(() => buildGraph({ entries, links: links ?? [], relations, order, events, nodes: storyNodes, plans: plans ?? [], categories: categories.list }), [entries, links, relations, order, events, storyNodes, plans, categories.list]);
  const groupLabel = (group: string) => GROUP_LABELS[group] ?? categories.get(group).name;
  const filtered = useMemo(() => filterGraph(full, { hidden, relationships, scope }, storyNodes), [full, hidden, relationships, scope, storyNodes]);
  const shown: Graph = useMemo(
    () => clusterLeaves(filtered, expanded, (group, count) => `${count} ${(GROUP_LABELS[group] ?? categories.get(group).name).toLowerCase()}`),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, expanded, categories.list],
  );

  const byId = useMemo(() => new Map(full.nodes.map((n) => [n.id, n])), [full]);
  const categoryMap = useMemo(() => new Map(categories.list.map((c) => [c.key, c])), [categories.list]);
  const groups = useMemo(() => [...new Set(full.nodes.map((n) => n.group))].sort((a, b) => (a === 'chapter' ? 2 : a === 'event' ? 1 : 0) - (b === 'chapter' ? 2 : b === 'event' ? 1 : 0) || (categoryMap.get(a)?.order ?? 0) - (categoryMap.get(b)?.order ?? 0)), [full, categoryMap]);
  const focus = focusId ? (shown.nodes.find((n) => n.id === focusId) ?? null) : null;
  const edge = edgeId ? (shown.edges.find((e) => e.id === edgeId) ?? null) : null;
  const isolated = shown.nodes.filter((n) => n.degree === 0);
  const story = flatten(buildTree(storyNodes));
  const factions = entries.filter((e) => e.category === 'faction').sort((a, b) => a.name.localeCompare(b.name));
  const folded = shown.nodes.length < filtered.nodes.length;

  const go = (id: string) => {
    select(id);
    requestAnimationFrame(() => canvas.current?.centerOn(id));
  };
  const onNode = (node: GraphNode | null) => {
    if (node?.ref.kind === 'cluster') return setExpanded(new Set([...expanded, node.ref.hubId]));
    select(node?.id ?? null);
  };
  const toggle = (group: string) => {
    const next = new Set(hidden);
    if (!next.delete(group)) next.add(group);
    setHidden(next);
  };
  const connections = (node: GraphNode) =>
    shown.edges
      .filter((e) => e.source === node.id || e.target === node.id)
      .map((e) => ({ edge: e, other: shown.nodes.find((n) => n.id === (e.source === node.id ? e.target : e.source))! }))
      .filter((c) => c.other)
      .sort((a, b) => b.other.degree - a.other.degree || a.other.label.localeCompare(b.other.label));

  const base = `/project/${project.id}`;
  const editLink = (node: GraphNode) => {
    if (node.ref.kind === 'entry') return node.ref.entry.category === 'character' ? { to: `${base}/characters/${node.id}`, label: 'Open character profile' } : { to: `${base}/codex/${node.id}`, label: 'Open in the Codex' };
    if (node.ref.kind === 'event') return { to: `${base}/timeline?event=${node.id}`, label: 'Open on the Timeline' };
    if (node.ref.kind === 'node') return isDocument(node.ref.node.kind) ? { to: `${base}/manuscript/${node.id}`, label: 'Open in the editor' } : { to: `${base}/organizer`, state: { select: node.id }, label: 'Open in the Organizer' };
    return null;
  };

  if (!ready) return null;
  return (
    <div className="stack graph-page">
      <header className="page-header">
        <div>
          <h1>Story graph</h1>
          <p className="muted" role="status">
            {shown.nodes.length} {shown.nodes.length === 1 ? 'node' : 'nodes'} · {shown.edges.length} {shown.edges.length === 1 ? 'link' : 'links'}
            {isolated.length > 0 && ` · ${isolated.length} not linked to anything`}
            {folded && ' · minor nodes folded'}
          </p>
        </div>
        <div className="actions wrap">
          <select
            value=""
            aria-label="Find in the graph"
            onChange={(e) => {
              if (!e.target.value) return;
              const target = byId.get(e.target.value)!;
              // Make sure what was asked for is actually on screen.
              if (hidden.has(target.group)) setHidden(new Set([...hidden].filter((g) => g !== target.group)));
              go(e.target.value);
            }}
          >
            <option value="">Find…</option>
            {groups.map((group) => (
              <optgroup key={group} label={groupLabel(group)}>
                {full.nodes.filter((n) => n.group === group).sort((a, b) => a.label.localeCompare(b.label)).map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <select
            value={scope ? `${scope.type}:${scope.id}` : ''}
            aria-label="Limit to"
            onChange={(e) => {
              const [type, id] = e.target.value.split(':');
              setScope(id ? { type: type as 'group' | 'around', id } : null);
            }}
          >
            <option value="">Whole story</option>
            <optgroup label="A volume or arc">
              {story.filter((t) => isGroup(t.node.kind)).map(({ node, depth }) => (
                <option key={node.id} value={`group:${node.id}`}>
                  {'  '.repeat(depth) + node.title}
                </option>
              ))}
            </optgroup>
            <optgroup label="Around a faction">
              {factions.map((entry) => (
                <option key={entry.id} value={`around:${entry.id}`}>
                  {entry.name}
                </option>
              ))}
            </optgroup>
          </select>
          <span className="segmented graph-zoom" role="group" aria-label="View">
            <button type="button" aria-label="Zoom out" onClick={() => canvas.current?.zoom(1 / 1.3)}>
              −
            </button>
            <button type="button" aria-label="Zoom in" onClick={() => canvas.current?.zoom(1.3)}>
              +
            </button>
            <button type="button" onClick={() => canvas.current?.fit()}>
              Fit
            </button>
            <button type="button" title="Release anything you dragged and lay everything out again" onClick={() => canvas.current?.relayout()}>
              Re-layout
            </button>
          </span>
        </div>
      </header>

      <div className="graph-filters" role="group" aria-label="Show">
        {groups.map((group) => (
          <label key={group} className={hidden.has(group) ? 'chip-toggle' : 'chip-toggle on'}>
            <input type="checkbox" checked={!hidden.has(group)} onChange={() => toggle(group)} />
            <span className={`graph-key ${group === 'event' ? 'diamond' : group === 'chapter' ? 'square' : ''}`} style={{ background: full.nodes.find((n) => n.group === group)?.color }} />
            {groupLabel(group)} <span className="muted">{full.nodes.filter((n) => n.group === group).length}</span>
          </label>
        ))}
        <label className={relationships ? 'chip-toggle on' : 'chip-toggle'}>
          <input type="checkbox" checked={relationships} onChange={(e) => setRelationships(e.target.checked)} />
          Relationships <span className="muted">{full.edges.filter((e) => e.kinds.includes('relationship')).length}</span>
        </label>
        {filtered.nodes.length > CLUSTER_ABOVE && expanded.size > 0 && (
          <button type="button" className="btn ghost" onClick={() => setExpanded(new Set())}>
            Fold minor nodes again
          </button>
        )}
      </div>

      {full.nodes.length === 0 ? (
        <div className="empty">
          <h2>Nothing to draw yet</h2>
          <p className="muted">Create characters, add places to the Codex, write a chapter, link them: they appear here as a network you can explore.</p>
        </div>
      ) : (
        <div className="graph-body">
          <GraphCanvas ref={canvas} graph={shown} view={memory} focusId={focus?.id ?? null} selectedEdgeId={edge?.id ?? null} onNode={onNode} onEdge={(picked) => select(null, picked.id)} />

          <aside className="panel graph-inspector" aria-label="Inspector">
            {edge ? (
              <EdgeDetails edge={edge} nodes={byId} onGo={go} base={base} onClose={() => select(null)} />
            ) : focus ? (
              <div className="stack">
                <div className="details-head">
                  <span className="graph-key large" style={{ background: focus.color }} />
                  <div className="grow-text">
                    <h2>{focus.label}</h2>
                    <span className="muted small">
                      {describe(focus, categoryMap)} · {focus.degree} {focus.degree === 1 ? 'connection' : 'connections'}
                    </span>
                  </div>
                  <button type="button" className="btn ghost icon" aria-label="Clear selection" onClick={() => select(null)}>
                    ✕
                  </button>
                </div>

                {focus.ref.kind === 'entry' && (
                  <>
                    {focus.ref.entry.summary && <p>{focus.ref.entry.summary}</p>}
                    <dl className="quick-fields">
                      {filledFields(focus.ref.entry, categories.get(focus.ref.entry.category), (id) => byId.get(id)?.label).slice(0, 6).map((f) => (
                        <div key={f.id}>
                          <dt>{f.label}</dt>
                          <dd>{f.text}</dd>
                        </div>
                      ))}
                    </dl>
                  </>
                )}
                {focus.ref.kind === 'event' && (
                  <>
                    <p>
                      <strong>{focus.ref.placed.label}</strong>
                      {focus.ref.placed.event.duration && ` · lasts ${formatDuration(focus.ref.placed.event.duration)}`} · {IMPORTANCE_LABELS[focus.ref.placed.event.importance]}
                    </p>
                    {focus.ref.placed.event.description && <p className="pre">{focus.ref.placed.event.description}</p>}
                    {focus.ref.placed.issues.map((issue) => (
                      <p key={issue} className="event-flag small">
                        {issue}
                      </p>
                    ))}
                  </>
                )}
                {focus.ref.kind === 'node' && (
                  <>
                    <p>
                      {STATUS_LABELS[focus.ref.node.status]} · {formatNumber(focus.ref.words)} words
                    </p>
                    {focus.ref.node.summary && <p className="pre">{focus.ref.node.summary}</p>}
                  </>
                )}

                {editLink(focus) && (
                  <Link to={editLink(focus)!.to} state={(editLink(focus) as { state?: unknown }).state} className="btn">
                    {editLink(focus)!.label}
                  </Link>
                )}

                <h3>Connected to</h3>
                {connections(focus).length === 0 ? (
                  <p className="muted small">Nothing {hidden.size || !relationships || scope ? 'that is showing' : 'yet'}. {focus.degree === 0 && 'Link it from its own page, a chapter or the Timeline and it joins the network.'}</p>
                ) : (
                  <ul className="graph-list">
                    {connections(focus).map(({ edge: e, other }) => (
                      <li key={e.id}>
                        <button type="button" onClick={() => (other.ref.kind === 'cluster' ? onNode(other) : go(other.id))}>
                          <span className="graph-key" style={{ background: other.color }} />
                          <span>
                            <strong>{other.label}</strong>
                            <span className="muted small">{e.labels.join(' · ')}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div className="stack">
                <h2>How the story hangs together</h2>
                <p className="muted small">Larger means more connected. Click a node to light up what it touches; click a line to see what the link is. Drag to rearrange, scroll to zoom.</p>
                <h3>Most connected</h3>
                <ul className="graph-list">
                  {[...shown.nodes].filter((n) => n.ref.kind !== 'cluster' && n.degree > 0).sort((a, b) => b.degree - a.degree || a.label.localeCompare(b.label)).slice(0, 6).map((n) => (
                    <li key={n.id}>
                      <button type="button" onClick={() => go(n.id)}>
                        <span className="graph-key" style={{ background: n.color }} />
                        <span>
                          <strong>{n.label}</strong>
                          <span className="muted small">
                            {describe(n, categoryMap)} · {n.degree} connections
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <h3>Not linked to anything</h3>
                {isolated.length === 0 ? (
                  <p className="muted small">Everything showing is connected to something.</p>
                ) : (
                  <ul className="graph-list">
                    {isolated.slice(0, 40).map((n) => (
                      <li key={n.id}>
                        <button type="button" onClick={() => go(n.id)}>
                          <span className="graph-key hollow" style={{ borderColor: n.color }} />
                          <span>
                            <strong>{n.label}</strong>
                            <span className="muted small">{describe(n, categoryMap)}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function EdgeDetails({ edge, nodes, onGo, base, onClose }: { edge: GraphEdge; nodes: Map<string, GraphNode>; onGo: (id: string) => void; base: string; onClose: () => void }) {
  const from = nodes.get(edge.source);
  const to = nodes.get(edge.target);
  return (
    <div className="stack">
      <div className="details-head">
        <h2 className="grow-text">
          {from?.label ?? 'Folded nodes'} {edge.directed ? '→' : '—'} {to?.label ?? 'Folded nodes'}
        </h2>
        <button type="button" className="btn ghost icon" aria-label="Clear selection" onClick={onClose}>
          ✕
        </button>
      </div>
      <ul className="graph-list plain">
        {edge.labels.map((label, i) => (
          <li key={label}>
            <strong>{label}</strong>
            <span className="muted small">
              {KIND_WORDS[edge.kinds[i] ?? edge.kinds[edge.kinds.length - 1]] ?? 'Link'}
              {i === 0 && edge.affinity ? ` · ${AFFINITY_LABELS[edge.affinity]}` : ''}
            </span>
          </li>
        ))}
      </ul>
      {edge.relationId && (
        <Link to={`${base}/relationships?rel=${edge.relationId}`} className="btn">
          Open the relationship's history
        </Link>
      )}
      <div className="actions start">
        {[from, to].map((node) =>
          node ? (
            <button key={node.id} type="button" className="btn ghost" onClick={() => onGo(node.id)}>
              Go to {node.label}
            </button>
          ) : null,
        )}
      </div>
    </div>
  );
}
