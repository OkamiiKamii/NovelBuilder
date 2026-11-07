import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { canon, continuity } from '@/core';
import { closes, type Issue } from '@/modules/continuity/types';
import { useManuscriptCheck } from '@/modules/continuity/useManuscriptCheck';
import type { StoryModel } from '@/modules/model/types';
import { reviewTimeline, withDecisions } from '@/modules/timeline/review';
import { checkRecords } from './checks';
import { canonKey, canonOverlay, type Overlay, type ShownHistory } from './overlay';
import { reviewCanon } from './review';

export interface ManuscriptCheck {
  state: 'checking' | 'checked' | 'failed';
  /** Open findings of the last check; null before the first. */
  issues: Issue[] | null;
  at: number | null;
  error: string | null;
}

export interface OverlayState {
  /** Null while it is off, or while canon and the decisions are still being read. */
  overlay: Overlay | null;
  manuscript: ManuscriptCheck;
  recheck: () => void;
}

/**
 * The canon and continuity marks for a view, live: canon statements, tracked
 * continuity and the author's decisions are read only while the markers are
 * on. `model` is the novel as the view shows it (an alternate history's
 * events, when one is chosen); `main` is the novel's own, so an event a
 * history leaves out is not taken for a deleted one. The manuscript is read
 * and checked when the markers come on, and again when the records or the
 * decisions change, or when asked.
 */
export function useCanonOverlay(projectId: string, model: StoryModel | null | undefined, main: StoryModel | null | undefined, on: boolean, history: ShownHistory | null): OverlayState {
  const facts = useLiveQuery(async () => (on ? canon.forProject(projectId).list() : null), [projectId, on]);
  const rules = useLiveQuery(async () => (on ? continuity.forProject(projectId).rules() : null), [projectId, on]);
  const decisions = useLiveQuery(async () => (on ? continuity.forProject(projectId).resolutions() : null), [projectId, on]);
  const check = useManuscriptCheck(projectId, on, [main, rules, decisions]);
  const issues = check.result?.open ?? null;

  const overlay = useMemo(() => {
    if (!on || !model || !facts || !rules || !decisions) return null;
    const known = main ? new Set(main.events.keys()) : undefined;
    const records = withDecisions(checkRecords(model, { facts, rules, known }), decisions, 'records|').open;
    const timeline = withDecisions(reviewTimeline(model, rules), decisions, 'timeline|').open;
    // Canon flags decided on the continuity review are left out, as every check's decided findings are.
    const closed = new Set(decisions.filter((d) => d.key.startsWith('canon|') && closes(d)).map((d) => d.key));
    const reviews = reviewCanon(facts, [...model.entries.values()], [...model.nodes.values()], (key) => model.categories.get(key)).reviews.map((r) => ({ ...r, flags: r.flags.filter((f) => !closed.has(canonKey(r.fact.id, f.key))) }));
    return canonOverlay(model, { records, timeline, canon: reviews, continuity: issues, history });
  }, [on, model, main, facts, rules, decisions, issues, history]);

  return { overlay, manuscript: { state: check.state, issues, at: check.at, error: check.error }, recheck: check.recheck };
}
