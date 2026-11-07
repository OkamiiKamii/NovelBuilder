import { useLiveQuery } from 'dexie-react-hooks';
import { codex, manuscript, plot } from '@/core';
import type { LoreEntry } from '@/modules/codex/types';
import type { StoryNode } from '@/modules/manuscript/types';
import type { PlotThread } from './types';

/** Live plot threads for a project, with the codex entries and manuscript nodes they can point at. */
export function usePlot(projectId: string): { threads: PlotThread[]; entries: LoreEntry[]; nodes: StoryNode[]; loading: boolean } {
  const threads = useLiveQuery(() => plot.forProject(projectId).list(), [projectId]);
  const entries = useLiveQuery(() => codex.forProject(projectId).list(), [projectId]);
  const nodes = useLiveQuery(() => manuscript.forProject(projectId).list(), [projectId]);
  return { threads: threads ?? [], entries: entries ?? [], nodes: nodes ?? [], loading: !threads || !entries || !nodes };
}
