import { entryPath } from '@/modules/characters/hooks';
import { DecisionNote, useDecisions } from '@/modules/continuity/components/DecisionNote';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EntryOptions } from '@/modules/codex/categories';
import { buildTree, flatten, isDocument } from '@/modules/manuscript/tree';
import { ConfirmDialog } from '@/shared/ConfirmDialog';
import { SavedText } from '@/shared/SavedText';
import { sourceLink, type CanonData } from '../hooks';
import { canonKey } from '../overlay';
import type { FactReview } from '../review';
import type { ProjectCanon } from '../service';
import { CANON_STATUSES, ESTABLISHED, FACT_KINDS, KIND_LABELS, SOURCE_LABELS, SOURCE_TYPES, STATUS_HINTS, STATUS_LABELS, type CanonFact, type FactChanges, type FactKind, type SourceType } from '../types';
import { History, historyOf } from './History';

interface FactDetailsProps {
  review: FactReview;
  data: CanonData;
  api: ProjectCanon;
  projectId: string;
  onOpen: (factId: string) => void;
  onClose: () => void;
  onError: (err: unknown) => void;
}

/** One fact: what it claims, where it stands, where it comes from, and how it got here. */
export function FactDetails({ review, data, api, projectId, onOpen, onClose, onError }: FactDetailsProps) {
  const { fact, flags } = review;
  const { facts, entries, nodes, events, cite } = data;
  const decided = useDecisions(projectId);
  const [confirming, setConfirming] = useState(false);
  const [revising, setRevising] = useState<{ statement: string; reason: string; minor: boolean } | null>(null);
  const [source, setSource] = useState<{ type: SourceType; refId: string; quote: string; note: string }>({ type: 'chapter', refId: '', quote: '', note: '' });
  const [sourceNote, setSourceNote] = useState<string | null>(null);
  const update = (edit: FactChanges | ((stored: CanonFact) => FactChanges)) => void api.update(fact.id, edit).catch(onError);
  const run = (task: Promise<unknown>) => void task.catch(onError);

  const established = ESTABLISHED.includes(fact.status);
  const others = facts.filter((f) => f.id !== fact.id).sort((a, b) => a.subject.localeCompare(b.subject));
  const label = (f: CanonFact) => `${f.subject}: ${f.statement.length > 50 ? `${f.statement.slice(0, 48)}…` : f.statement}`;
  const about = fact.entryIds.flatMap((id) => entries.find((e) => e.id === id) ?? []);
  const linked = others.filter((f) => fact.conflictsWith.includes(f.id) || f.conflictsWith.includes(fact.id));
  const documents = flatten(buildTree(nodes)).filter((t) => isDocument(t.node.kind));

  const addSource = () => {
    if (source.type === 'note' ? !source.note.trim() : !source.refId) return;
    void api.addSource(fact.id, source).then((added) => {
      const chapter = nodes.find((n) => n.id === added.refId)?.title;
      setSourceNote(added.type === 'chapter' && added.quote && added.block === null ? `Those words were not found in ${chapter} as it is saved now, so the source points at the ${chapter ? 'whole of it' : 'chapter'}.` : null);
      setSource((current) => ({ ...current, quote: '', note: '' }));
    }, onError);
  };

  return (
    <div className="stack fact-details">
      <div className="details-head">
        <span className={`thread-status cs-${fact.status}`}>{STATUS_LABELS[fact.status]}</span>
        <span className="muted small grow-text">{KIND_LABELS[fact.kind]}</span>
        <button type="button" className="btn ghost icon" aria-label="Close details" onClick={onClose}>
          ✕
        </button>
      </div>

      {flags.length > 0 && (
        <div className="event-issues canon-flags" role="group" aria-label="Possible contradictions">
          <ul>
            {flags.map((flag) => (
              <li key={flag.key}>
                <span>{flag.message}</span>
                <DecisionNote decision={decided.get(canonKey(fact.id, flag.key))} projectId={projectId} />
                <span className="actions start">
                  {flag.otherId && (
                    <button type="button" className="link" onClick={() => onOpen(flag.otherId!)}>
                      Open the other statement
                    </button>
                  )}
                  {flag.dismiss && (
                    <button type="button" className="link" onClick={() => run(api.dismiss(fact.id, flag.dismiss!))}>
                      Not a conflict
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p className="small">This is only an observation. Whether to confirm one, retcon the other, mark them Conflicting or leave both as they are is yours to decide.</p>
        </div>
      )}
      {fact.dismissed.length > 0 && (
        <p className="muted small">
          {fact.dismissed.length} possible {fact.dismissed.length === 1 ? 'contradiction' : 'contradictions'} set aside.{' '}
          <button type="button" className="link" onClick={() => run(api.undismiss(fact.id))}>
            Show again
          </button>
        </p>
      )}

      <SavedText label="Subject" value={fact.subject} placeholder="What this is about" onSave={(subject) => update({ subject })} />

      {established ? (
        <div className="field">
          <span>Statement</span>
          <blockquote className="canon-statement">{fact.statement.trim() || <span className="muted">No statement yet</span>}</blockquote>
          {revising ? (
            <form
              className="plan-group"
              onSubmit={(e) => {
                e.preventDefault();
                if (!revising.statement.trim()) return;
                void api.revise(fact.id, revising).then(() => setRevising(null), onError);
              }}
            >
              <label className="field">
                <span>New statement</span>
                <textarea rows={3} aria-label="New statement" value={revising.statement} autoFocus onChange={(e) => setRevising({ ...revising, statement: e.target.value })} />
              </label>
              <label className="field">
                <span>Reason for the change</span>
                <input aria-label="Reason for the change" value={revising.reason} placeholder="Why is this changing?" onChange={(e) => setRevising({ ...revising, reason: e.target.value })} />
              </label>
              <label className="check wrap">
                <input type="checkbox" checked={revising.minor} onChange={(e) => setRevising({ ...revising, minor: e.target.checked })} />
                Only correcting the wording; what is true has not changed
              </label>
              <p className="muted small">{revising.minor ? 'The earlier wording is kept in the history as a rewording.' : 'The current statement will be archived as Retconned, with today’s date and your reason. It is never deleted.'}</p>
              <div className="actions">
                <button type="button" className="btn" onClick={() => setRevising(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn primary" disabled={!revising.statement.trim() || revising.statement.trim() === fact.statement}>
                  {revising.minor ? 'Save rewording' : 'Archive and replace'}
                </button>
              </div>
            </form>
          ) : (
            <div className="actions start">
              <button type="button" className="btn" onClick={() => setRevising({ statement: fact.statement, reason: '', minor: false })}>
                Revise this statement…
              </button>
            </div>
          )}
        </div>
      ) : (
        <SavedText label="Statement" multiline rows={3} value={fact.statement} placeholder="What is claimed, as one clear sentence." onSave={(statement) => update({ statement })} />
      )}

      <div className="field">
        <span>Canon status</span>
        <div className="segmented wrap" role="radiogroup" aria-label="Canon status">
          {CANON_STATUSES.map((status) => (
            <button key={status} type="button" role="radio" aria-checked={fact.status === status} title={STATUS_HINTS[status]} className={fact.status === status ? 'active' : ''} onClick={() => fact.status !== status && run(api.setStatus(fact.id, status))}>
              {STATUS_LABELS[status]}
            </button>
          ))}
        </div>
        <span className="muted small">{STATUS_HINTS[fact.status]}</span>
      </div>

      {fact.status === 'retconned' && (
        <label className="field">
          <span>Replaced by</span>
          <select value={others.some((f) => f.id === fact.replacedById) ? fact.replacedById! : ''} aria-label="Replaced by" onChange={(e) => update({ replacedById: e.target.value || null })}>
            <option value="">Not linked to a replacement</option>
            {others.map((f) => (
              <option key={f.id} value={f.id}>
                {label(f)}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="field">
        <span>Kind</span>
        <select value={fact.kind} aria-label="Kind" onChange={(e) => update({ kind: e.target.value as FactKind })}>
          {FACT_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {KIND_LABELS[kind]}
            </option>
          ))}
        </select>
      </label>

      <div className="field">
        <span>About</span>
        {about.length > 0 && (
          <ul className="entity-chips">
            {about.map((entry) => (
              <li key={entry.id} className={`cat-${entry.category}`}>
                <Link to={entryPath(projectId, entry)} className="chip-name">
                  {entry.name}
                </Link>
                <button type="button" aria-label={`Remove ${entry.name}`} onClick={() => update((stored) => ({ entryIds: stored.entryIds.filter((id) => id !== entry.id) }))}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        {entries.length > about.length ? (
          <select value="" aria-label="Add a codex entry this is about" onChange={(e) => {
            const id = e.target.value;
            if (id) update((stored) => ({ entryIds: [...stored.entryIds, id] }));
          }}>
            <option value="">Add a character or entry this is about…</option>
            <EntryOptions entries={entries.filter((e) => !fact.entryIds.includes(e.id))} />
          </select>
        ) : (
          about.length === 0 && <p className="muted small">No characters or entries to attach this to yet.</p>
        )}
      </div>

      <fieldset className="plan-group">
        <legend>Sources: where this is established</legend>
        {fact.sources.length === 0 && <p className="muted small">Link the chapter, scene or codex entry that makes this true, so you can always check it.</p>}
        {fact.sources.length > 0 && (
          <ul className="source-list">
            {fact.sources.map((item) => {
              const view = cite(item);
              const link = sourceLink(projectId, view);
              return (
                <li key={item.id} className={view.missing ? 'missing' : ''}>
                  <div className="beat-row">
                    {link ? (
                      <Link to={link.to} state={link.state} className="grow-text">
                        {view.label}
                      </Link>
                    ) : (
                      <span className="grow-text">{view.label}</span>
                    )}
                    <button type="button" className="btn ghost icon" aria-label={`Remove source ${view.label}`} onClick={() => run(api.removeSource(fact.id, item.id))}>
                      ✕
                    </button>
                  </div>
                  {item.quote && <q className="small">{item.quote}</q>}
                  {item.type !== 'note' && item.note && <span className="muted small">{item.note}</span>}
                </li>
              );
            })}
          </ul>
        )}
        <form
          className="beat-new"
          onSubmit={(e) => {
            e.preventDefault();
            addSource();
          }}
        >
          <select value={source.type} aria-label="Kind of source" onChange={(e) => setSource({ type: e.target.value as SourceType, refId: '', quote: '', note: '' })}>
            {SOURCE_TYPES.map((type) => (
              <option key={type} value={type}>
                {SOURCE_LABELS[type]}
              </option>
            ))}
          </select>
          {source.type !== 'note' && (
            <select value={source.refId} aria-label="Source" onChange={(e) => setSource({ ...source, refId: e.target.value })}>
              <option value="">Choose…</option>
              {source.type === 'chapter' &&
                documents.map(({ node, depth }) => (
                  <option key={node.id} value={node.id}>
                    {'  '.repeat(depth) + node.title}
                  </option>
                ))}
              {source.type === 'entry' && <EntryOptions entries={entries} />}
              {source.type === 'event' &&
                [...events].sort((a, b) => a.name.localeCompare(b.name)).map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.name}
                  </option>
                ))}
            </select>
          )}
          {source.type === 'chapter' && <input value={source.quote} aria-label="Quote" placeholder="The words that establish it (finds the paragraph)" onChange={(e) => setSource({ ...source, quote: e.target.value })} />}
          {source.type === 'note' && <input value={source.note} aria-label="Source description" placeholder="e.g. Series bible, p. 12" onChange={(e) => setSource({ ...source, note: e.target.value })} />}
          <button type="submit" className="btn" disabled={source.type === 'note' ? !source.note.trim() : !source.refId}>
            Add source
          </button>
        </form>
        {sourceNote && (
          <p className="muted small" role="status">
            {sourceNote}
          </p>
        )}
      </fieldset>

      <div className="field">
        <span>Contradicts (your own links)</span>
        {linked.length > 0 && (
          <ul className="source-list">
            {linked.map((other) => (
              <li key={other.id}>
                <div className="beat-row">
                  <button type="button" className="link grow-text" onClick={() => onOpen(other.id)}>
                    {label(other)}
                  </button>
                  <span className={`thread-status cs-${other.status}`}>{STATUS_LABELS[other.status]}</span>
                  <button type="button" className="btn ghost icon" aria-label={`Unlink ${other.subject}`} onClick={() => run(api.unlinkConflict(fact.id, other.id))}>
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {others.length > linked.length && (
          <select value="" aria-label="Link a statement this contradicts" onChange={(e) => e.target.value && run(api.linkConflict(fact.id, e.target.value))}>
            <option value="">Link a statement this contradicts…</option>
            {others.filter((f) => !linked.includes(f)).map((f) => (
              <option key={f.id} value={f.id}>
                {label(f)}
              </option>
            ))}
          </select>
        )}
      </div>

      <fieldset className="plan-group">
        <legend>Canon history</legend>
        <History items={historyOf([fact])} onAnnotate={(item, reason) => run(api.annotate(fact.id, item.change.id, reason))} />
      </fieldset>

      <SavedText label="Notes" multiline rows={3} value={fact.notes} placeholder="Open questions, implications, things to check." onSave={(notes) => update({ notes })} />

      <div className="entry-foot">
        <span className="muted small">You are the authority here. Nothing changes a status but you.</span>
        <button type="button" className="btn danger" onClick={() => setConfirming(true)}>
          Delete fact…
        </button>
      </div>

      {confirming && (
        <ConfirmDialog
          title="Delete fact"
          confirmLabel="Delete fact and history"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            void api.remove(fact.id).then(onClose, onError);
          }}
        >
          <p>
            Delete <strong>{fact.subject}</strong> together with its history of {fact.history.length} {fact.history.length === 1 ? 'step' : 'steps'}? To keep the record of what you decided, mark it
            Non-Canon or Retconned instead.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
