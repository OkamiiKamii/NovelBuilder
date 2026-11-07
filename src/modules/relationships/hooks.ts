import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { codex, manuscript, relationships } from '@/core';
import type { LoreEntry } from '@/modules/codex/types';
import { storyOrder, type StoryOrder } from './timeline';
import type { CharacterRelation } from './types';

/** Live relationships for a project, with the characters and story order needed to read them. */
export function useRelationships(projectId: string): { relations: CharacterRelation[]; entries: LoreEntry[]; order: StoryOrder; loading: boolean } {
  const relations = useLiveQuery(() => relationships.forProject(projectId).list(), [projectId]);
  const entries = useLiveQuery(() => codex.forProject(projectId).list(), [projectId]);
  const nodes = useLiveQuery(() => manuscript.forProject(projectId).list(), [projectId]);
  const order = useMemo(() => storyOrder(nodes ?? []), [nodes]);
  return { relations: relations ?? [], entries: entries ?? [], order, loading: !relations || !entries || !nodes };
}
