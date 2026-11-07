import { useEntryPath } from '@/modules/characters/hooks';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { collab, db } from '@/core';
import { ROLE_LABELS, can } from '@/modules/sync/access';
import { Modal } from '@/shared/Modal';
import { colorOf, useMe } from '../identity';
import { targetKeyOf, type Conversion, type Thread } from '../service';
import { FEEDBACK_QUESTIONS, type Comment, type CommentTarget } from '../types';

const when = (at: number) => new Date(at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const say = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong.');

/** Puts a dialog at the top of the page, outside whatever it was opened from: a read-only page cannot disable it. */
export const Outside = ({ children }: { children: ReactNode }) => createPortal(children, document.body);

export function useThreads(projectId: string, targetKey?: string): Thread[] | undefined {
  return useLiveQuery(() => collab.forProject(projectId).threads(targetKey), [projectId, targetKey]);
}

function Signature({ comment }: { comment: Comment }) {
  return (
    <span className="cmt-by">
      <span className="who-dot" style={{ background: colorOf(comment.authorId) }} aria-hidden="true" />
      <strong>{comment.authorName}</strong> <span className="muted small">{ROLE_LABELS[comment.authorRole]} · {when(comment.createdAt)}</span>
    </span>
  );
}

/** One conversation: what it is about, what was said, and what can be done with it. */
export function ThreadCard({ projectId, thread, showTarget = false }: { projectId: string; thread: Thread; showTarget?: boolean }) {
  const me = useMe(projectId);
  const api = collab.forProject(projectId);
  const { root, replies } = thread;
  const [reply, setReply] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const plotThreads = useLiveQuery(() => (converting ? db.plotThreads.where('projectId').equals(projectId).toArray() : []), [projectId, converting]) ?? [];
  const run = (task: () => Promise<unknown>) => void task().then(() => setError(null), (err) => setError(say(err)));
  const decides = can(me.role, 'decide');
  const mayResolve = decides || can(me.role, 'seeAllComments') || root.authorId === me.id;
  const convert = (to: Conversion) => run(async () => {
    await api.convert(root.id, to);
    setConverting(false);
  });
  const pathOf = useEntryPath(projectId);
  const where = root.target.kind === 'entry' ? pathOf(root.target.entryId) : root.target.kind === 'thread' || root.target.kind === 'beat' ? `/project/${projectId}/plot` : `/project/${projectId}/manuscript/${root.target.chapterId}`;

  return (
    <li className={`thread cmt-thread${root.status === 'resolved' ? ' is-resolved' : ''}`} aria-label={`Conversation: ${root.body.slice(0, 60) || root.kind}`}>
      {showTarget && (
        <p className="small">
          On <Link to={where}>{root.targetLabel}</Link>
        </p>
      )}
      {root.target.kind === 'text' && <blockquote className="cmt-quote">{root.target.quote}</blockquote>}
      {[root, ...replies].map((comment) => (
        <div key={comment.id} className={comment.parentId ? 'cmt-msg cmt-reply' : 'cmt-msg'}>
          <Signature comment={comment} />
          {comment.kind !== 'comment' && <span className="badge">{comment.kind === 'reaction' ? 'Reaction' : 'Feedback'}</span>}
          {comment.deleted ? (
            <p className="muted small">This comment was deleted by its writer.</p>
          ) : editing === comment.id ? (
            <form
              className="cmt-form"
              onSubmit={(e) => {
                e.preventDefault();
                const body = String(new FormData(e.currentTarget).get('body') ?? '');
                run(async () => {
                  await api.edit(comment.id, body);
                  setEditing(null);
                });
              }}
            >
              <textarea name="body" rows={2} defaultValue={comment.body} aria-label="Reword the comment" />
              <button type="submit" className="btn">
                Save
              </button>
            </form>
          ) : (
            <p className="cmt-body">{comment.body}</p>
          )}
          {comment.ratings && (
            <p className="small muted">
              {FEEDBACK_QUESTIONS.filter((q) => comment.ratings![q.key]).map((q) => `${q.label}: ${comment.ratings![q.key]}/5`).join(' · ')}
            </p>
          )}
          {!comment.deleted && (comment.authorId === me.id || decides) && (
            <span className="cmt-own small">
              {comment.authorId === me.id && (
                <button type="button" className="linkish" onClick={() => setEditing(editing === comment.id ? null : comment.id)}>
                  {editing === comment.id ? 'Cancel' : 'Edit'}
                </button>
              )}
              <button type="button" className="linkish" aria-label={`Delete the comment “${comment.body.slice(0, 40)}”`} onClick={() => run(() => api.remove(comment.id))}>
                Delete
              </button>
            </span>
          )}
        </div>
      ))}
      {root.converted && (
        <p className="small" role="note">
          Turned into <Link to={root.converted.to}>{root.converted.label}</Link> by {root.converted.by}.
        </p>
      )}
      {root.status === 'resolved' && <p className="small muted">Resolved{root.resolvedBy ? ` by ${root.resolvedBy}` : ''}.</p>}
      {error && (
        <p className="error small" role="alert">
          {error}
        </p>
      )}
      {can(me.role, 'comment') && (
        <form
          className="cmt-form"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await api.reply(root.id, reply);
              setReply('');
            });
          }}
        >
          <textarea rows={1} value={reply} aria-label="Reply" placeholder="Reply…" onChange={(e) => setReply(e.target.value)} />
          <button type="submit" className="btn" disabled={!reply.trim()}>
            Reply
          </button>
        </form>
      )}
      <div className="actions start wrap">
        {mayResolve && (
          <button type="button" className="btn" onClick={() => run(() => api.setStatus(root.id, root.status === 'resolved' ? 'open' : 'resolved'))}>
            {root.status === 'resolved' ? 'Re-open' : 'Resolve'}
          </button>
        )}
        {decides && !root.converted && (
          <button type="button" className="btn" aria-expanded={converting} onClick={() => setConverting(!converting)}>
            Turn into…
          </button>
        )}
      </div>
      {converting && (
        <div className="actions start wrap cmt-convert" role="group" aria-label="Turn this comment into">
          <button type="button" className="btn" onClick={() => convert({ kind: 'task' })}>
            A task
          </button>
          <button type="button" className="btn" onClick={() => convert({ kind: 'note' })}>
            A note
          </button>
          <select value="" aria-label="A development on a plot thread" onChange={(e) => e.target.value && convert({ kind: 'beat', plotThreadId: e.target.value })}>
            <option value="">A development on a plot thread…</option>
            {plotThreads.map((plot) => (
              <option key={plot.id} value={plot.id}>
                {plot.title}
              </option>
            ))}
          </select>
        </div>
      )}
    </li>
  );
}

interface ThreadsDialogProps {
  projectId: string;
  title: string;
  /** What a new comment written here is about. Without it the dialog only lists. */
  target?: CommentTarget;
  /** Lists these conversations; by default, everything about the target's chapter, entry or plot thread. */
  only?: (thread: Thread) => boolean;
  onClose: () => void;
}

/** The conversations about one thing, and a place to start another. */
export function ThreadsDialog({ projectId, title, target, only, onClose }: ThreadsDialogProps) {
  const me = useMe(projectId);
  const all = useThreads(projectId, target ? targetKeyOf(target) : undefined);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const threads = (all ?? []).filter((thread) => !only || only(thread));
  return (
    <Outside>
      <Modal title={title} onClose={onClose}>
        <div className="stack cmt-dialog">
          {target?.kind === 'text' && <blockquote className="cmt-quote">{target.quote}</blockquote>}
          {target && can(me.role, 'comment') && (
            <form
              className="cmt-form"
              onSubmit={(e) => {
                e.preventDefault();
                void collab.forProject(projectId).comment(target, body).then(() => {
                  setBody('');
                  setError(null);
                }, (err) => setError(say(err)));
              }}
            >
              <textarea rows={3} value={body} autoFocus aria-label="New comment" placeholder="Write a comment…" onChange={(e) => setBody(e.target.value)} />
              <button type="submit" className="btn primary" disabled={!body.trim()}>
                Comment
              </button>
            </form>
          )}
          {error && (
            <p className="error small" role="alert">
              {error}
            </p>
          )}
          {threads.length === 0 ? (
            <p className="muted small">{can(me.role, 'comment') ? 'No comments here yet.' : 'Your role reads only.'}</p>
          ) : (
            <ul className="threads" aria-label="Conversations">
              {threads.map((thread) => (
                <ThreadCard key={thread.root.id} projectId={projectId} thread={thread} />
              ))}
            </ul>
          )}
        </div>
      </Modal>
    </Outside>
  );
}

/**
 * The way into the conversations about something, with how many are open.
 * It is a link rather than a button on purpose: a page shown read-only
 * disables its buttons, and commenting is exactly what a reviewer is there
 * to do.
 */
export function CommentLink({ projectId, target, title, only }: { projectId: string; target: CommentTarget; title: string; only?: (thread: Thread) => boolean }) {
  const me = useMe(projectId);
  const threads = useThreads(projectId, targetKeyOf(target));
  const [open, setOpen] = useState(false);
  if (!can(me.role, 'comment')) return null;
  const mine = (threads ?? []).filter((thread) => !only || only(thread));
  const waiting = mine.filter((thread) => thread.root.status === 'open').length;
  return (
    <>
      <a
        href="#comments"
        role="button"
        className={`cmt-link${waiting ? ' has-open' : ''}`}
        aria-label={`Comments on ${title}${mine.length ? ` (${waiting} open, ${mine.length} in all)` : ''}`}
        onClick={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
      >
        Comments{mine.length ? ` (${waiting || mine.length})` : ''}
      </a>
      {open && <ThreadsDialog projectId={projectId} title={`Comments on ${title}`} target={target} only={only} onClose={() => setOpen(false)} />}
    </>
  );
}
