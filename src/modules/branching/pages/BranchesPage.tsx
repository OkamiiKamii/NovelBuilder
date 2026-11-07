import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { branching, manuscript } from '@/core';
import { buildTree, flatten } from '@/modules/manuscript/tree';
import { useStatsMap } from '@/modules/projects/hooks';
import { Commit } from '@/modules/systems/components/inputs';
import { useCurrentProject } from '@/modules/workspace/WorkspaceLayout';
import { ConfirmDialog } from '@/shared/ConfirmDialog';
import { formatNumber } from '@/shared/format';
import { StatusTag, useFamily } from '../hooks';
import type { Divergence } from '../service';
import { BRANCH_STATUSES, STATUS_HINTS, STATUS_LABELS, type BranchStatus, type TimelineNode } from '../types';

const FORKABLE = BRANCH_STATUSES.filter((s) => s !== 'main');
const STATE_LABELS: Record<Divergence['state'], string> = { new: 'Written here', changed: 'Changed here', same: 'Same as the parent' };

export function BranchesPage() {
  const project = useCurrentProject();
  const navigate = useNavigate();
  const family = useFamily(project.id);
  const nodes = useLiveQuery(() => manuscript.forProject(project.id).list(), [project.id]);
  const stats = useStatsMap();
  const [forkAt, setForkAt] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState<BranchStatus>('experimental');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  // Kept with the timeline it was worked out for, so one timeline's comparison is never shown for another.
  const [compared, setCompared] = useState<{ projectId: string; rows: Divergence[] } | null>(null);
  const [merging, setMerging] = useState<Divergence | null>(null);
  const [promoting, setPromoting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fail = (err: unknown) => setNotice({ text: err instanceof Error ? err.message : 'Something went wrong.', error: true });
  const parentId = family?.me.parentId ?? null;
  const compare = useCallback(() => {
    if (!parentId) return setCompared(null);
    branching.divergence(project.id).then((rows) => setCompared({ projectId: project.id, rows }), () => setCompared(null));
  }, [project.id, parentId]);
  useEffect(compare, [compare, nodes]);

  if (!family || !nodes) return null;
  const divergence = compared?.projectId === project.id ? compared.rows : null;
  const { root, me, members } = family;
  const parent = members.find((m) => m.projectId === me.parentId) ?? null;
  const tree = flatten(buildTree(nodes));
  const main = members.find((m) => m.status === 'main');

  const branch = (node: TimelineNode) => (
    <li key={node.projectId} role="treeitem" aria-current={node.projectId === me.projectId ? 'page' : undefined} aria-expanded={node.children.length ? true : undefined}>
      <div className={`tl-node tl-${node.status}${node.projectId === me.projectId ? ' current' : ''}`}>
        <span className="tl-node-head">
          {node.projectId === me.projectId ? <strong>{node.title}</strong> : <Link to={`/project/${node.projectId}/branches`}>{node.title}</Link>}
          <StatusTag status={node.status} />
          {node.projectId === me.projectId && <span className="muted small">you are here</span>}
        </span>
        <span className="muted small">
          {[node.parentId ? `Forked ${node.forkLabel.startsWith('before') ? '' : 'after '}${node.forkLabel || 'from a timeline since deleted'}` : 'The original', `${formatNumber(stats.get(node.projectId)?.wordCount ?? 0)} words`].join(' · ')}
        </span>
        {node.note.trim() && <span className="small">{node.note}</span>}
      </div>
      {node.children.length > 0 && <ul role="group">{node.children.map(branch)}</ul>}
    </li>
  );

  return (
    <div className="stack branches-page">
      <header className="page-header">
        <div>
          <h1>Story branches</h1>
          <p className="muted" role="status">
            {members.length === 1 ? 'One timeline so far' : `${members.length} timelines`} · this one is {STATUS_LABELS[me.status]}
            {main && main.projectId !== me.projectId && ` · main canon is “${main.title}”`}
          </p>
        </div>
      </header>
      <p className="small">
        A branch here is a whole copy of the novel, to write it differently from a chapter on. To try a different course of events in the story without copying anything, use <Link to={`/project/${project.id}/histories`}>Alternate histories</Link>.
      </p>

      {notice && (
        <p className={notice.error ? 'notice error' : 'notice'} role={notice.error ? 'alert' : 'status'}>
          {notice.text}
          <button type="button" className="btn ghost icon" onClick={() => setNotice(null)} aria-label="Dismiss">
            ✕
          </button>
        </p>
      )}

      <section className="panel" aria-label="Timelines">
        <h2>Timelines</h2>
        <ul role="tree" className="tl-tree" aria-label="Tree of timelines">
          {branch(root)}
        </ul>
        <p className="muted small">Each timeline is a complete, separate copy from its fork point onward. Nothing you do in one can change another, unless you merge a chapter or promote a timeline here.</p>
      </section>

      <section className="panel" aria-label="This timeline">
        <h2>This timeline: {me.title}</h2>
        <div className="grid-2 tight">
          <label className="field">
            <span>Canon status</span>
            {me.status === 'main' ? (
              <span className="tl-fixed">
                <StatusTag status="main" /> <span className="muted small">{members.length > 1 ? 'Promote another timeline to change which one is main.' : STATUS_HINTS.main}</span>
              </span>
            ) : (
              <select value={me.status} aria-label="Canon status of this timeline" onChange={(e) => void branching.setStatus(project.id, e.target.value as BranchStatus).catch(fail)}>
                {FORKABLE.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            )}
            {me.status !== 'main' && <span className="muted small">{STATUS_HINTS[me.status]}</span>}
          </label>
          <label className="field">
            <span>What this timeline is for</span>
            <Commit label="What this timeline is for" value={me.note} placeholder="What if the villain wins at the gate?" onCommit={(text) => void branching.setNote(project.id, text).catch(fail)} />
          </label>
        </div>
        {(me.status !== 'main' || parent) && (
          <div className="actions start wrap">
            {me.status !== 'main' && (
              <button type="button" className="btn" onClick={() => setPromoting(true)}>
                Promote to Main Canon…
              </button>
            )}
            {parent && (
              <button type="button" className="btn danger" onClick={() => setDeleting(true)}>
                Delete this timeline…
              </button>
            )}
          </div>
        )}
      </section>

      <section className="panel" aria-label="Fork a new timeline">
        <h2>Fork a new timeline from here</h2>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            branching.fork(project.id, forkAt || null, { name, status, note }).then((made) => navigate(`/project/${made.id}/branches`), fail).finally(() => setBusy(false));
          }}
        >
          <div className="grid-2 tight">
            <label className="field">
              <span>Diverges</span>
              <select value={nodes.some((n) => n.id === forkAt) ? forkAt : ''} aria-label="Diverges" onChange={(e) => setForkAt(e.target.value)}>
                <option value="">Before the story begins</option>
                {tree.map(({ node, depth }) => (
                  <option key={node.id} value={node.id}>
                    {'  '.repeat(depth)}After {node.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Name</span>
              <input value={name} aria-label="Name of the new timeline" placeholder={`${project.title} (alternate)`} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="field">
              <span>Canon status</span>
              <select value={status} aria-label="Canon status of the new timeline" onChange={(e) => setStatus(e.target.value as BranchStatus)}>
                {FORKABLE.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>What it is for</span>
              <input value={note} aria-label="What the new timeline is for" placeholder="Optional" onChange={(e) => setNote(e.target.value)} />
            </label>
          </div>
          <p className="muted small">
            The new timeline starts with the manuscript up to that point and everything true by then: characters as they were, their gear and relationships, plot threads so far, canon, the whole Codex and
            your systems. Later chapters stay here. Version history is not carried over.
          </p>
          <div className="actions start">
            {nodes.some((n) => n.id === forkAt) && <Link to={`/project/${project.id}/consequences?node=${forkAt}`}>See what depends on this point</Link>}
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? 'Forking…' : 'Fork timeline'}
            </button>
          </div>
        </form>
      </section>

      {parent && divergence && (
        <section className="panel" aria-label="Compared with the parent">
          <h2>Compared with “{parent.title}”</h2>
          {divergence.length === 0 ? (
            <p className="muted">This timeline has no chapters yet.</p>
          ) : (
            <ul className="tl-diff">
              {divergence.map((row) => (
                <li key={row.nodeId} className={`df-${row.state}`}>
                  <Link to={`/project/${project.id}/manuscript/${row.nodeId}`}>{row.title}</Link>
                  <span className="badge">{STATE_LABELS[row.state]}</span>
                  {row.state !== 'same' && (
                    <button type="button" className="btn" onClick={() => setMerging(row)}>
                      Merge into {parent.title}…
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="muted small">Merging copies one chapter's text into the parent, and only when you ask. Everything else stays where it is.</p>
        </section>
      )}

      {merging && parent && (
        <ConfirmDialog
          title="Merge chapter"
          confirmLabel="Merge this chapter"
          onCancel={() => setMerging(null)}
          onConfirm={() => {
            const row = merging;
            setMerging(null);
            branching.mergeChapter(project.id, row.nodeId).then((result) => {
              setNotice({ text: result.mode === 'replaced' ? `“${result.title}” in ${parent.title} now has this timeline's text. What it said before is in that chapter's version history.` : `“${result.title}” was added to ${parent.title} as a new chapter.` });
              compare();
            }, fail);
          }}
        >
          {merging.state === 'changed' ? (
            <p>
              Replace the text of <strong>{merging.parentTitle}</strong> in <strong>{parent.title}</strong> with this timeline's <strong>{merging.title}</strong>? The text it has now is kept in that chapter's
              version history.
            </p>
          ) : (
            <p>
              Add <strong>{merging.title}</strong> to <strong>{parent.title}</strong> as a new chapter?
            </p>
          )}
          <p className="muted small">Only this chapter's text is copied. Nothing else in {parent.title} changes, and this timeline is not changed at all.</p>
        </ConfirmDialog>
      )}
      {promoting && (
        <ConfirmDialog
          title="Promote to Main Canon"
          confirmLabel="Promote"
          onCancel={() => setPromoting(false)}
          onConfirm={() => {
            setPromoting(false);
            branching.promote(project.id).then(() => setNotice({ text: `“${me.title}” is now the main canon.` }), fail);
          }}
        >
          <p>
            Make <strong>{me.title}</strong> the main canon?{main && main.projectId !== me.projectId ? ` “${main.title}” becomes Alternate Canon.` : ''}
          </p>
          <p className="muted small">Only the labels change. No text or data moves between timelines.</p>
        </ConfirmDialog>
      )}
      {deleting && parent && (
        <ConfirmDialog
          title="Delete timeline"
          confirmLabel="Delete forever"
          requireText={me.title}
          onCancel={() => setDeleting(false)}
          onConfirm={() => {
            setDeleting(false);
            branching.remove(project.id).then(() => navigate(`/project/${parent.projectId}/branches`), fail);
          }}
        >
          <p>
            This permanently deletes the timeline <strong>{me.title}</strong> and everything written in it. “{parent.title}” is not affected
            {me.children.length > 0 ? `, and the ${me.children.length === 1 ? 'timeline' : 'timelines'} forked from this one move up under it` : ''}.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
