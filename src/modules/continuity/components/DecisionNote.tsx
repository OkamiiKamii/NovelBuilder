import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { continuity } from '@/core';
import { DECISION_LABELS, type Resolution } from '../types';

/** The author's decisions about findings, by the finding's key, live. */
export function useDecisions(projectId: string): Map<string, Resolution> {
  const decisions = useLiveQuery(() => continuity.forProject(projectId).resolutions(), [projectId]);
  return useMemo(() => new Map((decisions ?? []).map((d) => [d.key, d])), [decisions]);
}

/**
 * Beside a finding on its own page: the decision about it made on the
 * continuity review (resolved, intentional, ignored, needs review), with
 * its note. Nothing when there is none.
 */
export function DecisionNote({ decision, projectId }: { decision: Resolution | undefined; projectId: string }) {
  if (!decision) return null;
  return (
    <span className="small rv-decided">
      <span className="thread-status">{DECISION_LABELS[decision.kind]}</span> on the <Link to={`/project/${projectId}/review`}>continuity review</Link>
      {decision.note ? `: ${decision.note}` : ''}
    </span>
  );
}
