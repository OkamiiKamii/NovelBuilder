import type { Editor } from '@tiptap/core';
import { useEffect, useState } from 'react';
import { collab } from '@/core';
import { anchorFromSelection, setCommentAnchors, type TextAnchor } from '@/modules/manuscript/editor/comments';
import { ROLE_LABELS, can } from '@/modules/sync/access';
import { Modal } from '@/shared/Modal';
import { useMe } from '../identity';
import { isOpen, type Thread } from '../service';
import { FEEDBACK_QUESTIONS, REACTIONS, type CommentTarget } from '../types';
import { ReviewDialog, useSuggestions } from './Review';
import { Outside, ThreadsDialog, useThreads } from './Threads';

const say = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong.');

/** A reader's answers about a chapter: three quick ratings and whatever they want to say. */
function FeedbackDialog({ projectId, chapterId, title, onClose }: { projectId: string; chapterId: string; title: string; onClose: () => void }) {
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <Outside>
      <Modal title={`Feedback on ${title}`} onClose={onClose}>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (!body.trim() && Object.keys(ratings).length === 0) return setError('Answer at least one question, or write a line.');
            void collab.forProject(projectId).comment({ kind: 'chapter', chapterId }, body, { kind: 'feedback', ratings }).then(onClose, (err) => setError(say(err)));
          }}
        >
          {FEEDBACK_QUESTIONS.map((question) => (
            <label key={question.key} className="field">
              <span>{question.label}</span>
              <select value={ratings[question.key] ?? ''} aria-label={question.label} onChange={(e) => setRatings({ ...ratings, [question.key]: Number(e.target.value) })}>
                <option value="">No answer</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} of 5
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label className="field">
            <span>What worked, and what did not?</span>
            <textarea rows={4} value={body} aria-label="Feedback" onChange={(e) => setBody(e.target.value)} />
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
              Send feedback
            </button>
          </div>
        </form>
      </Modal>
    </Outside>
  );
}

interface Props {
  projectId: string;
  chapterId: string;
  title: string;
  editor: Editor;
  mode: 'write' | 'suggest' | 'read';
  flush: () => Promise<void>;
  reload: () => void;
}

/**
 * The strip between the toolbar and the text where working with other
 * people happens: comment on what is selected, react, give feedback, see
 * the conversations, and review what has been suggested. It also marks the
 * commented passages in the text. Someone working alone sees only the
 * Comment button.
 */
export function ChapterCollab({ projectId, chapterId, title, editor, mode, flush, reload }: Props) {
  const me = useMe(projectId);
  const threads = useThreads(projectId, `chapter:${chapterId}`);
  const suggestions = (useSuggestions(projectId, chapterId) ?? []).filter((s) => s.kind === 'text');
  const [dialog, setDialog] = useState<{ target: CommentTarget; only?: (thread: Thread) => boolean; title: string } | null>(null);
  const [feedback, setFeedback] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Mark the passages people have commented on. Drawn over the text; the text is not touched.
  useEffect(() => {
    const anchors: TextAnchor[] = (threads ?? []).flatMap(({ root }) => (root.target.kind === 'text' && !root.deleted ? [{ threadId: root.id, quote: root.target.quote, block: root.target.block, offset: root.target.offset, resolved: root.status === 'resolved' }] : []));
    setCommentAnchors(editor, anchors);
  }, [editor, threads]);

  // A click on a marked passage opens its conversation.
  useEffect(() => {
    const dom = editor.view.dom;
    const onClick = (e: MouseEvent) => {
      const id = (e.target as HTMLElement).closest<HTMLElement>('.cmt')?.dataset.thread;
      const thread = id && (threads ?? []).find((t) => t.root.id === id);
      if (thread) setDialog({ target: thread.root.target, only: (t) => t.root.id === id, title: 'Comment' });
    };
    dom.addEventListener('click', onClick);
    return () => dom.removeEventListener('click', onClick);
  }, [editor, threads]);

  const here = (): CommentTarget => {
    const anchor = anchorFromSelection(editor);
    return anchor ? { kind: 'text', chapterId, ...anchor } : { kind: 'chapter', chapterId };
  };
  const comment = () => {
    const target = here();
    setDialog(target.kind === 'text' ? { target, only: (t) => t.root.target.kind === 'text' && t.root.target.quote === target.quote && t.root.target.block === target.block, title: 'Comment on the selection' } : { target, title: `Comments on ${title}` });
  };
  const react = (reaction: string) => {
    const target = here();
    void collab.forProject(projectId).comment(target, reaction, { kind: 'reaction' }).then(() => setNotice(`Noted: “${reaction}”${target.kind === 'text' ? ' on the selected words' : ' on this chapter'}.`), (err) => setNotice(say(err)));
  };

  const open = (threads ?? []).filter((t) => t.root.status === 'open').length;
  const decides = can(me.role, 'decide');
  const waiting = suggestions.filter((s) => isOpen(s) && (decides || s.authorId === me.id));
  const mineAll = suggestions.filter((s) => s.authorId === me.id);
  const shared = me.role !== 'owner' || (threads ?? []).length > 0 || suggestions.length > 0;

  return (
    <div className="collab-bar" role="group" aria-label="Collaboration">
      {mode === 'suggest' && (
        <span className="collab-mode" role="status">
          <strong>Suggesting.</strong> What you change here is a proposal for the author to accept or reject; the manuscript itself is not altered.
        </span>
      )}
      {mode === 'read' && me.role !== 'owner' && (
        <span className="collab-mode" role="status">
          Reading as {ROLE_LABELS[me.role]}.
        </span>
      )}
      {can(me.role, 'comment') && (
        // Keeps the selection in the text while the button is pressed, so the comment lands on it.
        <button type="button" className="btn" onMouseDown={(e) => e.preventDefault()} onClick={comment}>
          Comment
        </button>
      )}
      {me.role === 'reader' && (
        <>
          <select value="" aria-label="React to the selection or the chapter" onMouseDown={(e) => e.stopPropagation()} onChange={(e) => e.target.value && react(e.target.value)}>
            <option value="">React…</option>
            {REACTIONS.map((reaction) => (
              <option key={reaction} value={reaction}>
                {reaction}
              </option>
            ))}
          </select>
          <button type="button" className="btn" onClick={() => setFeedback(true)}>
            Feedback form
          </button>
        </>
      )}
      {shared && can(me.role, 'comment') && (
        <button type="button" className="btn ghost" onClick={() => setDialog({ target: { kind: 'chapter', chapterId }, title: `Comments on ${title}` })}>
          {(threads ?? []).length ? `All comments (${open} open)` : 'All comments'}
        </button>
      )}
      {(decides ? waiting.length > 0 : mineAll.length > 0) && (
        <button type="button" className={`btn${decides ? ' primary' : ''}`} onClick={() => setReviewing(true)}>
          {decides ? `Review suggestions (${waiting.length})` : 'My suggested changes'}
        </button>
      )}
      {notice && (
        <span className="small muted" role="status">
          {notice}
        </span>
      )}
      {dialog && <ThreadsDialog projectId={projectId} title={dialog.title} target={dialog.target} only={dialog.only} onClose={() => setDialog(null)} />}
      {feedback && <FeedbackDialog projectId={projectId} chapterId={chapterId} title={title} onClose={() => setFeedback(false)} />}
      {reviewing && <ReviewDialog projectId={projectId} chapterId={chapterId} title={title} before={flush} after={reload} onClose={() => setReviewing(false)} />}
    </div>
  );
}
