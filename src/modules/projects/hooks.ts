import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { projects } from '@/core';
import { emptyStats } from './service';
import type { Project, ProjectStats } from './types';

/** `undefined` while loading. */
export const useProjects = (): Project[] | undefined => useLiveQuery(() => projects.list(), []);

/** `undefined` while loading, `null` when the project does not exist. */
export const useProject = (id: string): Project | null | undefined =>
  useLiveQuery(async () => (await projects.get(id)) ?? null, [id]);

export function useStatsMap(): Map<string, ProjectStats> {
  const all = useLiveQuery(() => projects.allStats(), []);
  return useMemo(() => new Map((all ?? []).map((s) => [s.projectId, s])), [all]);
}

export const useProjectStats = (id: string): ProjectStats =>
  useLiveQuery(() => projects.getStats(id), [id]) ?? emptyStats(id);
