import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { calendars, codex, continuity, manuscript, timeline } from '@/core';
import { useStoryModel } from '@/modules/model/hooks';
import type { LoreEntry } from '@/modules/codex/types';
import type { StoryNode } from '@/modules/manuscript/types';
import { STANDARD_CALENDAR, type Calendar } from './calendar';
import { resolveChronology, type Placed } from './chronology';
import { reviewTimeline, withDecisions } from './review';

/** The calendar a project's dates are read in, kept live: changing it in Settings re-reads every date. */
export function useCalendar(projectId: string): Calendar | undefined {
  return useLiveQuery(() => calendars.forProject(projectId).calendar(), [projectId]);
}

/** Live timeline for a project, already in chronological order in its calendar, with the entries and nodes events can link to. */
export function useTimeline(projectId: string): { placed: Placed[]; entries: LoreEntry[]; nodes: StoryNode[]; calendar: Calendar; loading: boolean } {
  const events = useLiveQuery(() => timeline.forProject(projectId).list(), [projectId]);
  const entries = useLiveQuery(() => codex.forProject(projectId).list(), [projectId]);
  const nodes = useLiveQuery(() => manuscript.forProject(projectId).list(), [projectId]);
  const loaded = useCalendar(projectId);
  const calendar = loaded ?? STANDARD_CALENDAR;
  const placed = useMemo(() => resolveChronology(events ?? [], calendar), [events, calendar]);
  return { placed, entries: entries ?? [], nodes: nodes ?? [], calendar, loading: !events || !entries || !nodes || !loaded };
}

/**
 * The timeline's review findings, live: checked against the events, the
 * calendar, the characters' ages and the travel times recorded under
 * Continuity, split by the author's decisions about them.
 */
export function useTimelineReview(projectId: string) {
  const model = useStoryModel(projectId);
  const rules = useLiveQuery(() => continuity.forProject(projectId).rules(), [projectId]);
  const decisions = useLiveQuery(() => continuity.forProject(projectId).resolutions(), [projectId]);
  return useMemo(() => {
    if (!model || !rules || !decisions) return null;
    const findings = reviewTimeline(model, rules);
    return { model, findings, rules, ...withDecisions(findings, decisions) };
  }, [model, rules, decisions]);
}
