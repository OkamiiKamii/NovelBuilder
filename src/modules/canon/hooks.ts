import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { canon, codex, manuscript, timeline } from '@/core';
import { useCategories } from '@/modules/codex/categories';
import type { LoreEntry } from '@/modules/codex/types';
import type { StoryNode } from '@/modules/manuscript/types';
import type { TimelineEvent } from '@/modules/timeline/types';
import { describeSource, reviewCanon, type CanonReview, type SourceView } from './review';
import type { CanonFact, FactSource } from './types';

export interface CanonData extends CanonReview {
  facts: CanonFact[];
  entries: LoreEntry[];
  nodes: StoryNode[];
  events: TimelineEvent[];
  cite: (source: FactSource) => SourceView;
  loading: boolean;
}

/** Live canon for a project, reviewed for possible contradictions, with everything facts can point at. */
export function useCanon(projectId: string): CanonData {
  const categories = useCategories();
  const facts = useLiveQuery(() => canon.forProject(projectId).list(), [projectId]);
  const entries = useLiveQuery(() => codex.forProject(projectId).list(), [projectId]);
  const nodes = useLiveQuery(() => manuscript.forProject(projectId).list(), [projectId]);
  const events = useLiveQuery(() => timeline.forProject(projectId).list(), [projectId]);
  return useMemo(() => {
    const [f, e, n, v] = [facts ?? [], entries ?? [], nodes ?? [], events ?? []];
    const lookup = { node: (id: string) => n.find((x) => x.id === id), entry: (id: string) => e.find((x) => x.id === id), event: (id: string) => v.find((x) => x.id === id), category: categories.get };
    return { facts: f, entries: e, nodes: n, events: v, ...reviewCanon(f, e, n, categories.get), cite: (source: FactSource) => describeSource(source, lookup), loading: !facts || !entries || !nodes || !events };
  }, [facts, entries, nodes, events, categories]);
}

/** Where a source leads: the exact paragraph of a chapter, a codex profile or a timeline event. */
export function sourceLink(projectId: string, view: SourceView): { to: string; state?: { jump: { term: string; block: number } } } | null {
  const { source } = view;
  if (view.missing || !source.refId || source.type === 'note') return null;
  const base = `/project/${projectId}`;
  if (source.type === 'entry') return { to: `${base}/codex/${source.refId}` };
  if (source.type === 'event') return { to: `${base}/timeline?event=${source.refId}` };
  return { to: `${base}/manuscript/${source.refId}`, state: source.block !== null ? { jump: { term: source.quote, block: source.block } } : undefined };
}
