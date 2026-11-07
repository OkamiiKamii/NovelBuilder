import { useLiveQuery } from 'dexie-react-hooks';
import { codex, manuscript, progression, systems } from '@/core';
import type { LoreEntry } from '@/modules/codex/types';
import type { StoryNode } from '@/modules/manuscript/types';
import type { SystemBlueprint } from '@/modules/systems/types';
import type { ProgressSnapshot } from './types';

/** Live snapshots for a project, with everything they are read against. */
export function useProgression(projectId: string): { snapshots: ProgressSnapshot[]; blueprints: SystemBlueprint[]; entries: LoreEntry[]; nodes: StoryNode[]; loading: boolean } {
  const snapshots = useLiveQuery(() => progression.forProject(projectId).list(), [projectId]);
  const blueprints = useLiveQuery(() => systems.forProject(projectId).list(), [projectId]);
  const entries = useLiveQuery(() => codex.forProject(projectId).list(), [projectId]);
  const nodes = useLiveQuery(() => manuscript.forProject(projectId).list(), [projectId]);
  const sorted = [...(blueprints ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  return { snapshots: snapshots ?? [], blueprints: sorted, entries: entries ?? [], nodes: nodes ?? [], loading: !snapshots || !blueprints || !entries || !nodes };
}
