import { useState, type FormEvent } from 'react';
import type { TreeNode } from '@/modules/manuscript/tree';
import { TASK_CATEGORIES, TASK_LABELS, type Goal, type GoalInput, type TaskCategory } from '../types';

interface GoalFormProps {
  kind: 'deadline' | 'task';
  initial?: Goal;
  /** Parts of the manuscript a deadline can cover. */
  scopes: TreeNode[];
  onSubmit: (input: GoalInput) => Promise<unknown>;
  onCancel?: () => void;
}

/** Add or edit a deadline or a task. */
export function GoalForm({ kind, initial, scopes, onSubmit, onCancel }: GoalFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? '');
  const [targetWords, setTargetWords] = useState(initial?.targetWords ? String(initial.targetWords) : '');
  const [nodeId, setNodeId] = useState(initial?.nodeId ?? '');
  const [category, setCategory] = useState<TaskCategory>(initial?.category ?? 'planning');
  const [error, setError] = useState<string | null>(null);
  const name = kind === 'task' ? 'Task' : 'Deadline';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const input: GoalInput = kind === 'task' ? { title, category, dueDate: dueDate || null } : { title, dueDate: dueDate || null, targetWords: targetWords ? Number(targetWords) : null, nodeId: nodeId || null };
    // Clear a new-goal form at once, so the next entry can be typed straight away; put it back if saving fails.
    if (!initial) {
      setTitle('');
      setDueDate('');
      setTargetWords('');
    }
    onSubmit(input).then(
      () => setError(null),
      (err) => {
        if (!initial) {
          setTitle(title);
          setDueDate(dueDate);
          setTargetWords(targetWords);
        }
        setError(err instanceof Error ? err.message : 'Could not save.');
      },
    );
  };

  return (
    <form className={`goal-form goal-form-${kind}`} onSubmit={submit}>
      <input value={title} placeholder={kind === 'task' ? 'e.g. Complete magic system lore' : 'e.g. Finish Volume 1'} aria-label={`${name} name`} onChange={(e) => setTitle(e.target.value)} />
      {kind === 'task' ? (
        <select value={category} aria-label="Task type" onChange={(e) => setCategory(e.target.value as TaskCategory)}>
          {TASK_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {TASK_LABELS[c]}
            </option>
          ))}
        </select>
      ) : (
        <>
          <input type="number" min={0} step={1} value={targetWords} placeholder="Word target (optional)" aria-label="Deadline word target" onChange={(e) => setTargetWords(e.target.value)} />
          <select value={nodeId} aria-label="Deadline covers" onChange={(e) => setNodeId(e.target.value)}>
            <option value="">Whole manuscript</option>
            {scopes.map(({ node, depth }) => (
              <option key={node.id} value={node.id}>
                {'  '.repeat(depth) + node.title}
              </option>
            ))}
          </select>
        </>
      )}
      <input type="date" value={dueDate} aria-label={kind === 'task' ? 'Task date (optional)' : 'Deadline date'} onChange={(e) => setDueDate(e.target.value)} />
      <span className="actions">
        {onCancel && (
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn">
          {initial ? 'Save' : kind === 'task' ? 'Add task' : 'Add deadline'}
        </button>
      </span>
      {error && (
        <p className="error small" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
