import { Link } from 'react-router-dom';
import { formatNumber } from '@/shared/format';
import { SavedText } from '@/shared/SavedText';
import type { NodeChanges, ProjectManuscript } from '../service';
import { isDocument, pathTo, validParents } from '../tree';
import { KIND_LABELS, NODE_STATUSES, STATUS_LABELS, type NodeStatus, type StoryNode } from '../types';
import { PlanForm, StatusStepper } from './PlanForm';

interface StatusSelectProps {
  node: StoryNode;
  onChange: (changes: NodeChanges) => void;
  compact?: boolean;
}

export function StatusSelect({ node, onChange, compact }: StatusSelectProps) {
  return (
    <select
      className={compact ? `chip status-${node.status}` : undefined}
      value={node.status}
      aria-label={`Status of ${node.title}`}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange({ status: e.target.value as NodeStatus })}
    >
      {NODE_STATUSES.map((status) => (
        <option key={status} value={status}>
          {STATUS_LABELS[status]}
        </option>
      ))}
    </select>
  );
}

interface NodeDetailsProps {
  node: StoryNode;
  nodes: StoryNode[];
  totalWords: number;
  ms: ProjectManuscript;
  onError: (error: unknown) => void;
  /** `full` adds title, location and navigation; `compact` is for the editor's side panel. */
  mode: 'full' | 'compact';
  editorHref?: string;
  onOpenEntry?: (entryId: string) => void;
}

/** Everything about a node except its text: the plan for chapters and scenes, plain notes for volumes, acts and arcs. */
export function NodeDetails({ node, nodes, totalWords, ms, onError, mode, editorHref, onOpenEntry }: NodeDetailsProps) {
  const update = (changes: NodeChanges) => void ms.update(node.id, changes).catch(onError);
  const kind = KIND_LABELS[node.kind];
  const parents = mode === 'full' ? validParents(nodes, node.id) : [];

  return (
    <div className="stack details">
      {mode === 'full' && (
        <>
          <div className="details-head">
            <span className={`kind kind-${node.kind}`}>{kind}</span>
            <span className="muted small">
              {formatNumber(totalWords)} {totalWords === 1 ? 'word' : 'words'}
            </span>
            {editorHref && isDocument(node.kind) && (
              <Link to={editorHref} className="btn primary">
                Open in editor
              </Link>
            )}
          </div>
          <SavedText label="Title" value={node.title} onSave={(title) => update({ title })} />
        </>
      )}
      {isDocument(node.kind) ? (
        <PlanForm node={node} ms={ms} onError={onError} onOpenEntry={onOpenEntry} />
      ) : (
        <>
          <div className="field">
            <span>Status</span>
            <StatusStepper status={node.status} onChange={(status) => update({ status })} />
          </div>
          <SavedText label="Summary" multiline rows={3} value={node.summary} placeholder={`What happens in this ${node.kind}, in a sentence or two.`} onSave={(summary) => update({ summary })} />
          <SavedText label="Private notes" multiline rows={6} value={node.notes} placeholder="Reminders, things to fix, ideas." onSave={(notes) => update({ notes })} />
        </>
      )}
      {node.kind === 'chapter' && (
        <details className="reader-notes" open={Boolean(node.noteBefore || node.noteAfter)}>
          <summary>Author’s notes to readers</summary>
          <p className="muted small">Shown around the chapter in the Web serial preview. Not part of the manuscript text.</p>
          <SavedText label="Note before the chapter" multiline rows={2} value={node.noteBefore ?? ''} placeholder="A word to readers before they start." onSave={(noteBefore) => update({ noteBefore })} />
          <SavedText label="Note after the chapter" multiline rows={2} value={node.noteAfter ?? ''} placeholder="Thanks, a schedule, a question for the comments." onSave={(noteAfter) => update({ noteAfter })} />
        </details>
      )}
      {mode === 'full' && parents.length > 1 && (
        <label className="field">
          <span>Location</span>
          <select value={node.parentId ?? ''} aria-label={`Move ${node.title} to`} onChange={(e) => void ms.move(node.id, e.target.value || null).catch(onError)}>
            {parents.map((parent) => (
              <option key={parent?.id ?? ''} value={parent?.id ?? ''}>
                {parent ? pathTo(nodes, parent.id).map((n) => n.title).join(' › ') : 'Top level'}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
