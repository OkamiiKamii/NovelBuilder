import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { characters, codex, manuscript } from '@/core';
import type { LoreEntry, LoreLink } from '@/modules/codex/types';
import type { StoryNode } from '@/modules/manuscript/types';
import { storyOrder, type StoryOrder } from '@/modules/relationships/timeline';
import { listCharacters, type Listed } from './library';
import type { CharacterTemplate } from './types';

export interface Cast {
  list: Listed[];
  /** Every codex entry of the project, for names and links. */
  entries: LoreEntry[];
  links: LoreLink[];
  nodes: StoryNode[];
  order: StoryOrder;
  templates: CharacterTemplate[];
  loading: boolean;
}

/** The project's characters with what the library needs to show, search and sort them. Live: it follows every change. */
export function useCast(projectId: string): Cast {
  const api = useMemo(() => characters.forProject(projectId), [projectId]);
  const entries = useLiveQuery(() => codex.forProject(projectId).list(), [projectId]);
  const links = useLiveQuery(() => codex.forProject(projectId).links(), [projectId]);
  const profiles = useLiveQuery(() => api.profiles(), [api]);
  const nodes = useLiveQuery(() => manuscript.forProject(projectId).list(), [projectId]);
  const templates = useLiveQuery(() => api.templates(), [api]);
  const order = useMemo(() => storyOrder(nodes ?? []), [nodes]);
  const list = useMemo(() => (entries && links && profiles && nodes ? listCharacters(entries, profiles, links, nodes, order.position, (entry) => api.fresh(entry)) : []), [entries, links, profiles, nodes, order, api]);
  return { list, entries: entries ?? [], links: links ?? [], nodes: nodes ?? [], order, templates: templates ?? characters.builtinTemplates, loading: !entries || !links || !profiles || !nodes };
}

/** Where a codex entry is opened: a character in its profile, anything else in the Codex. One record either way. */
export const entryPath = (projectId: string, entry: Pick<LoreEntry, 'id' | 'category'>): string => `/project/${projectId}/${entry.category === 'character' ? 'characters' : 'codex'}/${entry.id}`;

/** The same, when only an id is to hand. */
export function useEntryPath(projectId: string): (entryId: string) => string {
  const ids = useLiveQuery(async () => new Set((await characters.forProject(projectId).entries()).map((e) => e.id)), [projectId]);
  return (entryId) => `/project/${projectId}/${ids?.has(entryId) ? 'characters' : 'codex'}/${entryId}`;
}
