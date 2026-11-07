import { entryPath } from '@/modules/characters/hooks';
import { CommentLink } from '@/modules/collab/components/Threads';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ViewLink } from '@/modules/visualize/ViewLink';
import type { LoreEntry } from '@/modules/codex/types';
import { buildTree, flatten, isDocument } from '@/modules/manuscript/tree';
import type { StoryNode } from '@/modules/manuscript/types';
import { ConfirmDialog } from '@/shared/ConfirmDialog';
import { SavedText } from '@/shared/SavedText';
import { beatPlace, type ThreadReport } from '../diagnostics';
import type { ProjectPlot } from '../service';
import { BEAT_ROLE_LABELS, BEAT_ROLES, CATEGORY_LABELS, STATUS_LABELS, THREAD_CATEGORIES, THREAD_STATUSES, categoryName, roleOf, statusName, type BeatRole, type ThreadCategory, type ThreadChanges, type ThreadStatus, type PlotThread } from '../types';
import { AllConnections } from '@/modules/crossref/components/AllConnections';

interface ThreadDetailsProps {
  report: ThreadReport;
  /** Every thread of the novel, for the threads an intersection crosses. */
  threads: PlotThread[];
  entries: LoreEntry[];
  nodes: StoryNode[];
  api: ProjectPlot;
  projectId: string;
  onClose: () => void;
  onError: (err: unknown) => void;
}

/** Everything about one thread: what it is, who it involves, and its developments chapter by chapter. */
export function ThreadDetails({ report, threads, entries, nodes, api, projectId, onClose, onError }: ThreadDetailsProps) {
  const { thread, beats, issues } = report;
  const [confirming, setConfirming] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newNode, setNewNode] = useState('');
  const [newRole, setNewRole] = useState<BeatRole>('development');
  const others = threads.filter((t) => t.id !== thread.id).sort((a, b) => a.title.localeCompare(b.title));
  const threadName = (id: string) => threads.find((t) => t.id === id)?.title;
  const update = (edit: ThreadChanges | ((stored: PlotThread) => ThreadChanges)) => void api.update(thread.id, edit).catch(onError);

  const byName = (a: LoreEntry, b: LoreEntry) => a.name.localeCompare(b.name);
  const tree = flatten(buildTree(nodes));
  const documents = tree.filter((t) => isDocument(t.node.kind));
  const picker = (kind: 'character' | 'location', ids: string[], field: 'characterIds' | 'locationIds', heading: string, add: string) => {
    const chosen = ids.flatMap((id) => entries.find((e) => e.id === id) ?? []);
    const available = entries.filter((e) => e.category === kind && !ids.includes(e.id)).sort(byName);
    return (
      <div className="field">
        <span>{heading}</span>
        {chosen.length > 0 && (
          <ul className="entity-chips">
            {chosen.map((entry) => (
              <li key={entry.id} className={`cat-${entry.category}`}>
                <Link to={entryPath(projectId, entry)} className="chip-name">
                  {entry.name}
                </Link>
                <button type="button" aria-label={`Remove ${entry.name}`} onClick={() => update((stored) => ({ [field]: stored[field].filter((id) => id !== entry.id) }))}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        {available.length > 0 ? (
          <select value="" aria-label={add} onChange={(e) => {
            const id = e.target.value;
            if (id) update((stored) => ({ [field]: [...stored[field], id] }));
          }}>
            <option value="">{add}…</option>
            {available.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        ) : (
          chosen.length === 0 && <p className="muted small">No {kind}s yet.</p>
        )}
      </div>
    );
  };

  const addBeat = () => {
    if (!newTitle.trim() && newRole !== 'appears') return;
    void api.addBeat(thread.id, { title: newTitle, nodeId: newNode || null, role: newRole }).then(() => setNewTitle(''), onError);
  };

  return (
    <div className="stack thread-details">
      <div className="details-head">
        <span className={`thread-status st-${thread.status}`}>{statusName(thread)}</span>
        <span className="muted small grow-text">{categoryName(thread)}</span>
        <button type="button" className="btn ghost icon" aria-label="Close details" onClick={onClose}>
          ✕
        </button>
      </div>

      {issues.length > 0 && (
        <ul className="event-issues" aria-label="Things to check">
          {issues.map((issue) => (
            <li key={issue.kind}>{issue.message}</li>
          ))}
        </ul>
      )}

      <SavedText label="Thread title" value={thread.title} onSave={(title) => update({ title })} />
      <CommentLink projectId={projectId} target={{ kind: 'thread', threadId: thread.id }} title={thread.title} only={(t) => t.root.target.kind === 'thread'} />

      <div className="grid-2 tight">
        <label className="field">
          <span>Category</span>
          <select value={thread.category} aria-label="Category" onChange={(e) => update({ category: e.target.value as ThreadCategory })}>
            {THREAD_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Status</span>
          <select value={thread.status} aria-label="Status" onChange={(e) => update({ status: e.target.value as ThreadStatus })}>
            {THREAD_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {thread.status === 'custom' && <SavedText key={`${thread.id}-status`} label="Status name" value={thread.customStatus ?? ''} placeholder="e.g. Dormant, Waiting on book two" onSave={(customStatus) => update({ customStatus })} />}
      {thread.category === 'custom' && <SavedText label="Category name" value={thread.customCategory} placeholder="e.g. Prophecy, Heist, Rivalry" onSave={(customCategory) => update({ customCategory })} />}

      <SavedText label="Objective or premise" multiline rows={3} value={thread.premise} placeholder="The question this thread raises, or the promise it makes to the reader." onSave={(premise) => update({ premise })} />

      {picker('character', thread.characterIds, 'characterIds', 'Characters involved', 'Add a character')}
      {picker('location', thread.locationIds, 'locationIds', 'Key locations', 'Add a location')}

      <fieldset className="plan-group">
        <legend>Target resolution</legend>
        <label className="field">
          <span>Meant to resolve in</span>
          <select value={nodes.some((n) => n.id === thread.targetNodeId) ? thread.targetNodeId! : ''} aria-label="Meant to resolve in" onChange={(e) => update({ targetNodeId: e.target.value || null })}>
            <option value="">Not decided</option>
            {tree.map(({ node, depth }) => (
              <option key={node.id} value={node.id}>
                {'  '.repeat(depth) + node.title}
              </option>
            ))}
          </select>
        </label>
        <SavedText label="Or in your own words" value={thread.targetNote} placeholder="The midpoint · the end of book two · the final battle" onSave={(targetNote) => update({ targetNote })} />
      </fieldset>

      <fieldset className="plan-group">
        <legend>Developments, in reading order</legend>
        {beats.length === 0 && <p className="muted small">Record each step this thread takes and the chapter it happens in: a setup, a clue, a reversal, the payoff.</p>}
        {beats.length > 0 && (
          <ol className="beat-list">
            {beats.map((placed, i) => {
              const { beat, node } = placed;
              const name = `development ${i + 1}`;
              return (
                <li key={beat.id} className={placed.missing ? 'missing' : ''}>
                  <div className="beat-row">
                    <span className="beat-at">{beatPlace(placed)}</span>
                    <select value={beat.nodeId ?? ''} aria-label={`Chapter for ${name}`} onChange={(e) => void api.updateBeat(thread.id, beat.id, { nodeId: e.target.value || null }).catch(onError)}>
                      <option value="">Not placed yet</option>
                      {placed.missing && <option value={beat.nodeId!}>A chapter that was removed</option>}
                      {documents.map(({ node: doc, depth }) => (
                        <option key={doc.id} value={doc.id}>
                          {'  '.repeat(depth) + doc.title}
                        </option>
                      ))}
                    </select>
                    <select value={roleOf(beat)} aria-label={`Role of ${name}`} onChange={(e) => void api.updateBeat(thread.id, beat.id, { role: e.target.value as BeatRole }).catch(onError)}>
                      {BEAT_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {BEAT_ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="btn ghost icon" aria-label={`Remove ${name}`} onClick={() => void api.removeBeat(thread.id, beat.id).catch(onError)}>
                      ✕
                    </button>
                  </div>
                  {roleOf(beat) === 'intersection' && (
                    <div className="field beat-crosses">
                      <span>Crosses</span>
                      {(beat.withThreadIds ?? []).filter(threadName).length > 0 && (
                        <ul className="entity-chips">
                          {(beat.withThreadIds ?? []).filter(threadName).map((id) => (
                            <li key={id}>
                              <span className="chip-name">{threadName(id)}</span>
                              <button type="button" aria-label={`${name} no longer crosses ${threadName(id)}`} onClick={() => void api.updateBeat(thread.id, beat.id, { withThreadIds: (beat.withThreadIds ?? []).filter((x) => x !== id) }).catch(onError)}>
                                ✕
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      {others.some((t) => !(beat.withThreadIds ?? []).includes(t.id)) ? (
                        <select value="" aria-label={`Thread ${name} crosses`} onChange={(e) => e.target.value && void api.updateBeat(thread.id, beat.id, { withThreadIds: [...(beat.withThreadIds ?? []), e.target.value] }).catch(onError)}>
                          <option value="">Add a thread it crosses…</option>
                          {others.filter((t) => !(beat.withThreadIds ?? []).includes(t.id)).map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.title}
                            </option>
                          ))}
                        </select>
                      ) : (
                        others.length === 0 && <p className="muted small">No other threads yet.</p>
                      )}
                    </div>
                  )}
                  <SavedText key={`${beat.id}-title`} hideLabel label={`Title of ${name}`} value={beat.title} onSave={(title) => void api.updateBeat(thread.id, beat.id, { title }).catch(onError)} />
                  <SavedText key={`${beat.id}-note`} hideLabel multiline rows={2} label={`Note for ${name}`} value={beat.note} placeholder="What changes for this thread here?" onSave={(note) => void api.updateBeat(thread.id, beat.id, { note }).catch(onError)} />
                  <span className="small beat-links">
                    <CommentLink projectId={projectId} target={{ kind: 'beat', threadId: thread.id, beatId: beat.id }} title={name} only={(t) => t.root.target.kind === 'beat' && t.root.target.beatId === beat.id} />
                    {node && <Link to={`/project/${projectId}/manuscript/${node.id}`}>Open {node.title} →</Link>}
                    <Link to={`/project/${projectId}/consequences?thread=${thread.id}&beat=${beat.id}`}>What depends on this?</Link>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
        <form
          className="beat-new"
          onSubmit={(e) => {
            e.preventDefault();
            addBeat();
          }}
        >
          <select value={documents.some((t) => t.node.id === newNode) ? newNode : ''} aria-label="Chapter for the new development" onChange={(e) => setNewNode(e.target.value)}>
            <option value="">{documents.length ? 'Chapter or scene…' : 'No chapters yet'}</option>
            {documents.map(({ node, depth }) => (
              <option key={node.id} value={node.id}>
                {'  '.repeat(depth) + node.title}
              </option>
            ))}
          </select>
          <select value={newRole} aria-label="Role of the new development" onChange={(e) => setNewRole(e.target.value as BeatRole)}>
            {BEAT_ROLES.map((role) => (
              <option key={role} value={role}>
                {BEAT_ROLE_LABELS[role]}
              </option>
            ))}
          </select>
          <input value={newTitle} aria-label="New development" placeholder={newRole === 'appears' ? 'Optional: what it is doing here' : 'What happens? e.g. Symbol discovered'} onChange={(e) => setNewTitle(e.target.value)} />
          <button type="submit" className="btn" disabled={!newTitle.trim() && newRole !== 'appears'}>
            Add development
          </button>
        </form>
        <p className="small beat-links">
          <ViewLink to={`/project/${projectId}/visualize/plot?select=thread:${thread.id}`}>See it in the plot lanes →</ViewLink>
          <Link to={`/project/${projectId}/board?thread=${thread.id}`}>Its chapters and scenes on the scene board →</Link>
        </p>
      </fieldset>

      <AllConnections projectId={projectId} of={{ type: 'thread', id: thread.id }} />
      <SavedText label="Notes" multiline rows={4} value={thread.notes} placeholder="Loose ends, alternatives, how it should pay off." onSave={(notes) => update({ notes })} />

      <label className="check">
        <input type="checkbox" checked={thread.muted} onChange={(e) => update({ muted: e.target.checked })} />
        Don't flag this thread
        {report.silenced > 0 && <span className="muted small">({report.silenced} held back)</span>}
      </label>

      <div className="entry-foot">
        <span className="muted small">Flags are reminders only. Nothing here ever changes a status or your manuscript.</span>
        <button type="button" className="btn danger" onClick={() => setConfirming(true)}>
          Delete thread…
        </button>
      </div>

      {confirming && (
        <ConfirmDialog
          title="Delete thread"
          confirmLabel="Delete thread"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            void api.remove(thread.id).then(onClose, onError);
          }}
        >
          <p>
            Delete <strong>{thread.title}</strong> and its {beats.length} {beats.length === 1 ? 'development' : 'developments'}? Chapters, scenes and codex entries are not changed.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
