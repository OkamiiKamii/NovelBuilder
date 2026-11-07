import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { canon, continuity, db, places, structure, travel } from '@/core';
import { useManuscriptCheck } from '@/modules/continuity/useManuscriptCheck';
import { useStoryModel } from '@/modules/model/hooks';
import type { StoryModel } from '@/modules/model/types';
import { collectWarnings, withStatus, type ReviewItem, type ReviewSource, type Warning } from './collect';
import type { Resolution } from '@/modules/continuity/types';

export interface Review {
  model: StoryModel;
  warnings: Warning[];
  items: ReviewItem[];
  /** Decisions whose warning is no longer raised. */
  gone: Resolution[];
  /** How many each check raised. */
  bySource: Map<ReviewSource, number>;
  manuscript: ReturnType<typeof useManuscriptCheck>;
}

/**
 * Every warning the checks raise for a novel, live, with the author's
 * decisions. Null while the records are being read, and once the novel
 * cannot be found. The manuscript is checked when the review opens, and
 * again when the records, the tracked rules or the decisions change.
 */
export function useReview(projectId: string): Review | null | undefined {
  const model = useStoryModel(projectId);
  const facts = useLiveQuery(() => canon.forProject(projectId).list(), [projectId]);
  const rules = useLiveQuery(() => continuity.forProject(projectId).rules(), [projectId]);
  const decisions = useLiveQuery(() => continuity.forProject(projectId).resolutions(), [projectId]);
  const markers = useLiveQuery(() => structure.forProject(projectId).list(), [projectId]);
  const profiles = useLiveQuery(() => db.characterProfiles.where('projectId').equals(projectId).toArray(), [projectId]);
  const secrets = useLiveQuery(() => db.characterSecrets.where('projectId').equals(projectId).toArray(), [projectId]);
  const snapshots = useLiveQuery(() => db.progressSnapshots.where('projectId').equals(projectId).toArray(), [projectId]);
  const settings = useLiveQuery(() => travel.forProject(projectId).settings(), [projectId]);
  const maps = useLiveQuery(() => places.forProject(projectId).maps(), [projectId]);
  const pins = useLiveQuery(() => places.forProject(projectId).pins(), [projectId]);
  const manuscript = useManuscriptCheck(projectId, true, [model, rules, decisions]);
  // Every finding of the manuscript check, decided or not: decisions are shown here, not left out.
  const issues = useMemo(() => (manuscript.result ? [...manuscript.result.open, ...manuscript.result.resolved.map((r) => r.issue)] : null), [manuscript.result]);

  const gathered = useMemo(() => {
    if (!model || !facts || !rules || !markers || !profiles || !secrets || !snapshots || settings === undefined || !maps || !pins) return undefined;
    return collectWarnings(projectId, { model, facts, rules, markers, aliases: new Map(profiles.map((p) => [p.entryId, p.aliases])), secrets, travel: { settings: settings ?? null, maps, pins }, snapshots, manuscript: issues });
  }, [projectId, model, facts, rules, markers, profiles, secrets, snapshots, settings, maps, pins, issues]);

  return useMemo(() => {
    if (model === null) return null;
    if (!model || !gathered || !decisions) return undefined;
    const { items, gone } = withStatus(gathered, decisions, manuscript.state === 'checked');
    const bySource = new Map<ReviewSource, number>();
    for (const w of gathered) bySource.set(w.source, (bySource.get(w.source) ?? 0) + 1);
    return { model, warnings: gathered, items, gone, bySource, manuscript };
  }, [model, gathered, decisions, manuscript]);
}
