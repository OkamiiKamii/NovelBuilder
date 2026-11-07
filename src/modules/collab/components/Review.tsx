import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';
import { collab } from '@/core';
import type { LoreEntry } from '@/modules/codex/types';
import { diffWords } from '@/modules/manuscript/diff';
import { ROLE_LABELS, can } from '@/modules/sync/access';
import { Modal } from '@/shared/Modal';
import { textHunks, textOf, type Hunk } from '../hunks';
import { colorOf, useMe } from '../identity';
import { isOpen } from '../service';
import type { FieldChange, Suggestion } from '../types';
import { Outside } from './Threads';

const say = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong.');

export function useSuggestions(projectId: string, targetId?: string): Suggestion[] | undefined {
  return useLiveQuery(() => collab.forProject(projectId).suggestions(targetId), [projectId, targetId]);
}

/** One proposed change to the text, words taken out struck through and words put in underlined, in its writer's colour. */
function HunkView({ hunk }: { hunk: Hunk }) {
  const [before, after] = [textOf(hunk.remove), textOf(hunk.insert)];
  if (!hunk.remove.length) return <p className="hunk-text"><ins>{after || ' '}</ins></p>;
  if (!hunk.insert.length) return <p className="hunk-text"><del>{before}</del></p>;
  return (
    <p className="hunk-text">
      {diffWords(before, after).map((part, i) => (part.op === 'add' ? <ins key={i}>{part.text}</ins> : part.op === 'del' ? <del key={i}>{part.text}</del> : <span key={i}>{part.text}</span>))}
    </p>
  );
}

interface ReviewProps {
  projectId: string;
  chapterId: string;
  title: string;
  /** `before` runs ahead of a change to the chapter (it saves what is in the editor). `after` runs when the review is closed, if anything was accepted (it shows the editor the new text). */
  before?: () => Promise<void>;
  after?: () => void;
  onClose: () => void;
}

/**
 * TRACKED CHANGES, FOR REVIEW
 * Every change collaborators have proposed to a chapter, each under its
 * writer's name and colour. An author accepts or rejects them one at a
 * time; nothing reaches the manuscript any other way. Anyone else sees
 * their own proposals and what became of them.
 */
export function ReviewDialog({ projectId, chapterId, title, before, after, onClose }: ReviewProps) {
  const me = useMe(projectId);
  const api = collab.forProject(projectId);
  const suggestions = (useSuggestions(projectId, chapterId) ?? []).filter((s) => s.kind === 'text' && (can(me.role, 'decide') || s.authorId === me.id));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const accepted = useRef(false);
  const close = () => {
    if (accepted.current) after?.();
    onClose();
  };
  const decides = can(me.role, 'decide');
  const decide = async (suggestion: Suggestion, hunks: Hunk[], verdict: 'accepted' | 'rejected') => {
    setBusy(true);
    try {
      if (verdict === 'accepted') {
        await before?.();
        accepted.current = true;
      }
      for (const hunk of hunks) await api.decideHunk(suggestion.id, hunk.id, verdict);
      setError(null);
    } catch (err) {
      setError(say(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Outside>
      <Modal title={`Suggested changes: ${title}`} onClose={close}>
        <div className="stack review">
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {suggestions.length === 0 && <p className="muted">Nobody has suggested changes to this chapter.</p>}
          {suggestions.map((suggestion) => {
            const hunks = textHunks(suggestion.base, suggestion.proposed);
            const waiting = hunks.filter((hunk) => !suggestion.decisions[hunk.id]);
            return (
              <section key={suggestion.id} className="review-by" aria-label={`Changes suggested by ${suggestion.authorName}`} style={{ '--who': colorOf(suggestion.authorId) } as React.CSSProperties}>
                <header className="review-head">
                  <span>
                    <span className="who-dot" style={{ background: colorOf(suggestion.authorId) }} aria-hidden="true" />
                    <strong>{suggestion.authorName}</strong> <span className="muted small">{ROLE_LABELS[suggestion.authorRole]} · {waiting.length} of {hunks.length} waiting</span>
                  </span>
                  {decides && waiting.length > 1 && (
                    <span className="actions">
                      <button type="button" className="btn" disabled={busy} onClick={() => void decide(suggestion, waiting, 'accepted')}>
                        Accept all
                      </button>
                      <button type="button" className="btn" disabled={busy} onClick={() => void decide(suggestion, waiting, 'rejected')}>
                        Reject all
                      </button>
                    </span>
                  )}
                  {!decides && suggestion.authorId === me.id && isOpen(suggestion) && Object.keys(suggestion.decisions).length === 0 && (
                    <button type="button" className="btn" onClick={() => void api.withdraw(suggestion.id).catch((err) => setError(say(err)))}>
                      Withdraw
                    </button>
                  )}
                </header>
                <ol className="hunks">
                  {hunks.map((hunk, i) => {
                    const verdict = suggestion.decisions[hunk.id];
                    return (
                      <li key={hunk.id} className={verdict ? `hunk hunk-${verdict.verdict}` : 'hunk'} aria-label={`Change ${i + 1} by ${suggestion.authorName}`}>
                        <HunkView hunk={hunk} />
                        {verdict ? (
                          <p className="small muted">
                            {verdict.verdict === 'accepted' ? 'Accepted' : 'Rejected'} by {verdict.byName}.
                          </p>
                        ) : decides ? (
                          <span className="actions start">
                            <button type="button" className="btn primary" disabled={busy} onClick={() => void decide(suggestion, [hunk], 'accepted')}>
                              Accept
                            </button>
                            <button type="button" className="btn" disabled={busy} onClick={() => void decide(suggestion, [hunk], 'rejected')}>
                              Reject
                            </button>
                          </span>
                        ) : (
                          <p className="small muted">Waiting for an author.</p>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </section>
            );
          })}
        </div>
      </Modal>
    </Outside>
  );
}

/** A reviewer's form for proposing new values for a codex entry. Submitting it changes nothing but the list of suggestions. */
function SuggestDialog({ projectId, entry, onClose }: { projectId: string; entry: LoreEntry; onClose: () => void }) {
  const rows: FieldChange[] = [
    { field: 'name', label: 'Name', from: entry.name, to: entry.name },
    { field: 'summary', label: 'Short summary', from: entry.summary, to: entry.summary },
    { field: 'description', label: 'Detailed description', from: entry.description, to: entry.description },
    ...entry.fields.filter((f) => f.key.trim()).map((f) => ({ field: `field:${f.key}`, label: f.key, from: f.value, to: f.value })),
  ];
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((row) => [row.field, row.from])));
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <Outside>
      <Modal title={`Suggest an edit to ${entry.name}`} onClose={onClose}>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void collab.forProject(projectId).suggestFields(entry.id, rows.map((row) => ({ ...row, to: values[row.field] })), note).then(onClose, (err) => setError(say(err)));
          }}
        >
          <p className="muted small">Change what you would change. Nothing is altered until an author accepts it.</p>
          {rows.map((row) => (
            <label key={row.field} className="field">
              <span>{row.label}</span>
              {row.field === 'description' ? (
                <textarea rows={3} value={values[row.field]} aria-label={`Suggested ${row.label}`} onChange={(e) => setValues({ ...values, [row.field]: e.target.value })} />
              ) : (
                <input value={values[row.field]} aria-label={`Suggested ${row.label}`} onChange={(e) => setValues({ ...values, [row.field]: e.target.value })} />
              )}
            </label>
          ))}
          <label className="field">
            <span>Why (optional)</span>
            <input value={note} aria-label="Reason for the suggestion" onChange={(e) => setNote(e.target.value)} />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="actions">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn primary">
              Send the suggestion
            </button>
          </div>
        </form>
      </Modal>
    </Outside>
  );
}

/** One proposed edit to an entry, value by value, with the verdict buttons for those who give one. */
export function FieldSuggestion({ projectId, suggestion, showTarget = false }: { projectId: string; suggestion: Suggestion; showTarget?: boolean }) {
  const me = useMe(projectId);
  const [error, setError] = useState<string | null>(null);
  const decide = (verdict: 'accepted' | 'rejected') => void collab.forProject(projectId).decideFields(suggestion.id, verdict).then(() => setError(null), (err) => setError(say(err)));
  return (
    <li className={`thread field-suggestion is-${suggestion.status}`} aria-label={`Edit to ${suggestion.targetLabel} suggested by ${suggestion.authorName}`}>
      <p>
        <span className="who-dot" style={{ background: colorOf(suggestion.authorId) }} aria-hidden="true" />
        <strong>{suggestion.authorName}</strong> <span className="muted small">{ROLE_LABELS[suggestion.authorRole]}</span> suggests{showTarget ? ` for ${suggestion.targetLabel}` : ''}:
      </p>
      <ul className="field-changes">
        {(suggestion.changes ?? []).map((change) => (
          <li key={change.field}>
            <span className="muted">{change.label}:</span> <del>{change.from || '(empty)'}</del> → <ins>{change.to || '(empty)'}</ins>
          </li>
        ))}
      </ul>
      {suggestion.note && <p className="small muted">“{suggestion.note}”</p>}
      {error && (
        <p className="error small" role="alert">
          {error}
        </p>
      )}
      {suggestion.status !== 'pending' ? (
        <p className="small muted">
          {suggestion.status === 'accepted' ? 'Accepted' : 'Rejected'} by {suggestion.decidedBy}.
        </p>
      ) : can(me.role, 'decide') ? (
        <span className="actions start">
          <button type="button" className="btn primary" onClick={() => decide('accepted')}>
            Accept
          </button>
          <button type="button" className="btn" onClick={() => decide('rejected')}>
            Reject
          </button>
        </span>
      ) : (
        <p className="small muted">Waiting for an author. The entry is unchanged.</p>
      )}
    </li>
  );
}

/** On a codex entry: its comments, a reviewer's way to propose an edit, and any proposals waiting. */
export function EntryCollab({ projectId, entry }: { projectId: string; entry: LoreEntry }) {
  const me = useMe(projectId);
  const suggestions = (useSuggestions(projectId, entry.id) ?? []).filter((s) => s.kind === 'fields');
  const [suggesting, setSuggesting] = useState(false);
  const waiting = suggestions.filter((s) => s.status === 'pending');
  const settled = suggestions.filter((s) => s.status !== 'pending' && s.authorId === me.id);
  return (
    <div className="entry-collab">
      {can(me.role, 'suggest') && !can(me.role, 'write') && (
        <a
          href="#suggest"
          role="button"
          className="cmt-link"
          onClick={(e) => {
            e.preventDefault();
            setSuggesting(true);
          }}
        >
          Suggest an edit
        </a>
      )}
      {suggesting && <SuggestDialog projectId={projectId} entry={entry} onClose={() => setSuggesting(false)} />}
      {[...waiting, ...settled].length > 0 && (
        <ul className="threads" aria-label="Suggested edits">
          {[...waiting, ...settled].map((suggestion) => (
            <FieldSuggestion key={suggestion.id} projectId={projectId} suggestion={suggestion} />
          ))}
        </ul>
      )}
    </div>
  );
}
