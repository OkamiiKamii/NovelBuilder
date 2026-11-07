import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useMemo, useState } from 'react';
import type { ProjectManuscript } from './service';
import { buildTree, type TreeNode } from './tree';
import type { StoryNode } from './types';

/** Live view of a project's story tree. `nodes` is undefined while loading. */
export function useStory(ms: ProjectManuscript): { nodes: StoryNode[] | undefined; tree: TreeNode[] } {
  const nodes = useLiveQuery(() => ms.list(), [ms]);
  const tree = useMemo(() => buildTree(nodes ?? []), [nodes]);
  return { nodes, tree };
}

const collapsedKey = (projectId: string) => `novel-builder:collapsed:${projectId}`;

function readCollapsed(projectId: string): Set<string> {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(collapsedKey(projectId)) ?? '[]');
    return new Set(Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

/** Which tree rows are folded. A viewing preference, kept per project in this browser. */
export function useCollapsed(projectId: string) {
  const [collapsed, setCollapsed] = useState(() => readCollapsed(projectId));

  const change = useCallback(
    (update: (current: Set<string>) => Set<string>) =>
      setCollapsed((current) => {
        const next = update(new Set(current));
        try {
          localStorage.setItem(collapsedKey(projectId), JSON.stringify([...next]));
        } catch {
          // not essential
        }
        return next;
      }),
    [projectId],
  );

  return {
    collapsed,
    toggle: useCallback((id: string) => change((s) => (s.delete(id) || s.add(id), s)), [change]),
    expand: useCallback((id: string | null) => id && change((s) => (s.delete(id), s)), [change]),
    setAll: useCallback((ids: string[]) => change(() => new Set(ids)), [change]),
  };
}
